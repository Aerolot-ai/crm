import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { db } from "@crm/db";
import { SETTINGS_ID, writeCostDailyUsdCap } from "@crm/db/settings";
import type { SendFn } from "eve/channels";
import {
	assessDailyCostCap,
	COST_DAILY_CAP_CODE,
} from "../agent/lib/daily-cost-cap";
import { dispatchAgentRun } from "../agent/lib/custom-agent-dispatch";

const suffix = crypto.randomUUID();
const userId = `cost-cap-user-${suffix}`;
let agentId = "";
let versionId = "";
let priorCap: { costDailyUsdCap: unknown } | null = null;

beforeAll(async () => {
	priorCap = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { costDailyUsdCap: true },
	});
	await db.user.create({
		data: {
			id: userId,
			name: "Cost cap test",
			email: `${userId}@example.test`,
		},
	});
	const agent = await db.agentDefinition.create({
		data: { name: "Cost cap", status: "LIVE", createdById: userId },
		select: { id: true },
	});
	agentId = agent.id;
	const version = await db.agentVersion.create({
		data: {
			agentId,
			number: 1,
			status: "DEPLOYED",
			instructions: "No side effects.",
			manifest: {
				actions: [{ type: "run.summary", provider: "crm", summary: "done" }],
				dataScope: { mode: "WORKSPACE", summary: "workspace", resources: [] },
			},
			modelId: "test/model",
			sandboxPolicy: {},
			createdById: userId,
		},
		select: { id: true },
	});
	versionId = version.id;
	await db.agentDefinition.update({
		where: { id: agentId },
		data: { currentVersionId: versionId },
	});
});

afterAll(async () => {
	if (agentId) {
		await db.agentRunEvent.deleteMany({ where: { run: { agentId } } });
		await db.agentRun.deleteMany({ where: { agentId } });
		await db.agentDefinition.update({
			where: { id: agentId },
			data: { currentVersionId: null },
		});
		await db.agentVersion.deleteMany({ where: { agentId } });
		await db.agentDefinition.deleteMany({ where: { id: agentId } });
	}
	await db.user.deleteMany({ where: { id: userId } });
	const restored =
		priorCap?.costDailyUsdCap == null
			? null
			: Number(priorCap.costDailyUsdCap);
	await writeCostDailyUsdCap(db, restored);
});

async function queuedRun() {
	return db.agentRun.create({
		data: {
			agentId,
			versionId,
			triggerType: "MANUAL",
			status: "QUEUED",
			idempotencyKey: `cost-cap-${crypto.randomUUID()}`,
			correlationId: crypto.randomUUID(),
		},
		select: { id: true },
	});
}

async function spentRun(costUsd: string) {
	return db.agentRun.create({
		data: {
			agentId,
			versionId,
			triggerType: "MANUAL",
			status: "SUCCEEDED",
			costUsd,
			idempotencyKey: `cost-spent-${crypto.randomUUID()}`,
			correlationId: crypto.randomUUID(),
			finishedAt: new Date(),
		},
	});
}

const send = (async () => ({
	id: `cost-session-${suffix}`,
})) as unknown as SendFn;

describe("daily workspace cost cap", () => {
	it("starts a run under the injected cap", async () => {
		await writeCostDailyUsdCap(db, 10);
		const run = await queuedRun();
		await dispatchAgentRun(run.id, send);
		const persisted = await db.agentRun.findUniqueOrThrow({
			where: { id: run.id },
		});
		expect(persisted.status).toBe("RUNNING");
	});

	it("refuses RUNNING at 100% of the injected cap", async () => {
		await writeCostDailyUsdCap(db, 0.01);
		await spentRun("0.01");
		const run = await queuedRun();
		await expect(dispatchAgentRun(run.id, send)).rejects.toThrow(
			"Daily workspace cost cap reached.",
		);
		const persisted = await db.agentRun.findUniqueOrThrow({
			where: { id: run.id },
		});
		expect(persisted.status).not.toBe("RUNNING");
		expect(persisted.status).toBe("FAILED");
		expect(persisted.errorCode).toBe(COST_DAILY_CAP_CODE);
	});

	it("emits the warn path at 80%", async () => {
		await writeCostDailyUsdCap(db, 1);
		await spentRun("0.80");
		const warn = spyOn(console, "warn").mockImplementation(() => undefined);
		const verdict = await assessDailyCostCap();
		expect(verdict.warn).toBe(true);
		expect(verdict.blocked).toBe(false);
		expect(
			warn.mock.calls.some((call) =>
				String(call[0]).includes("daily workspace cost cap warn"),
			),
		).toBe(true);
		warn.mockRestore();
	});
});
