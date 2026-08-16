import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { DealStage, db } from "@crm/db";
import { AGENT_ACTION_EXECUTORS } from "../agent/lib/agent-actions";
import {
	createRunActivity,
	finishRun,
	postRunSlackMessage,
} from "../agent/lib/run-runtime";

const suffix = crypto.randomUUID();
const userId = `run-on-record-user-${suffix}`;
const domain = `run-on-record-${suffix}.example.test`;
let agentId = "";
let versionId = "";
let companyId = "";
let contactId = "";
let dealId = "";

beforeAll(async () => {
	await db.user.create({
		data: {
			id: userId,
			name: "Run on record",
			email: `${userId}@example.test`,
		},
	});
	const company = await db.company.create({
		data: { name: "Record Run Co", domain },
		select: { id: true },
	});
	companyId = company.id;
	const contact = await db.contact.create({
		data: {
			firstName: "Ada",
			lastName: "Lovelace",
			companyId,
		},
		select: { id: true },
	});
	contactId = contact.id;
	const deal = await db.deal.create({
		data: {
			name: "Record Run Deal",
			companyId,
			ownerId: userId,
			stage: DealStage.DEMO_BOOKED,
		},
		select: { id: true },
	});
	dealId = deal.id;
	await db.dealContact.create({
		data: { dealId, contactId },
	});

	const agent = await db.agentDefinition.create({
		data: {
			name: "Record run agent",
			status: "LIVE",
			createdById: userId,
		},
		select: { id: true },
	});
	agentId = agent.id;
	const version = await db.agentVersion.create({
		data: {
			agentId,
			number: 1,
			status: "DEPLOYED",
			instructions: "Propose the next step. Do not write the CRM.",
			manifest: {
				dataScope: {
					mode: "WORKSPACE",
					summary: "Whole workspace",
					resources: [],
				},
				actions: [
					{
						type: "crm.activity.create",
						provider: "crm",
						summary: "Create a CRM note",
						activityTypes: ["NOTE", "TASK"],
					},
					{
						type: "run.summary",
						provider: "crm",
						summary: "Summarize the run",
					},
				],
			},
			modelId: "test/model",
			sandboxPolicy: {},
			createdById: userId,
			approvedAt: new Date(),
			deployedAt: new Date(),
		},
		select: { id: true },
	});
	versionId = version.id;
	await db.agentDefinition.update({
		where: { id: agentId },
		data: { currentVersionId: versionId },
	});
});

afterEach(async () => {
	if (!agentId) return;
	await db.agentRun.updateMany({
		where: {
			agentId,
			status: { in: ["QUEUED", "RUNNING", "WAITING_FOR_APPROVAL"] },
		},
		data: {
			status: "CANCELLED",
			errorCode: "TEST_CLEANUP",
			errorMessage: "Settled between tests.",
			finishedAt: new Date(),
		},
	});
});

afterAll(async () => {
	if (agentId) {
		await db.agentRunEvent.deleteMany({ where: { run: { agentId } } });
		await db.agentAction.deleteMany({ where: { agentId } });
		await db.activity.deleteMany({
			where: { meta: { path: ["agentId"], equals: agentId } },
		});
		await db.agentAuditEvent.deleteMany({ where: { agentId } });
		await db.agentRun.deleteMany({ where: { agentId } });
		await db.agentDefinition.updateMany({
			where: { id: agentId },
			data: { currentVersionId: null },
		});
		await db.agentVersion.deleteMany({ where: { agentId } });
		await db.agentDefinition.deleteMany({ where: { id: agentId } });
	}
	if (dealId) await db.dealContact.deleteMany({ where: { dealId } });
	if (dealId) await db.deal.deleteMany({ where: { id: dealId } });
	if (contactId) await db.contact.deleteMany({ where: { id: contactId } });
	if (companyId) await db.company.deleteMany({ where: { id: companyId } });
	await db.user.deleteMany({ where: { id: userId } });
});

async function proposeRun() {
	return db.agentRun.create({
		data: {
			agentId,
			versionId,
			triggerType: "MANUAL",
			status: "RUNNING",
			startedAt: new Date(),
			input: { record: { kind: "contact", id: contactId } },
			idempotencyKey: `record-run-${crypto.randomUUID()}`,
			correlationId: crypto.randomUUID(),
			events: { create: { sequence: 0, type: "run.queued", data: {} } },
		},
		select: { id: true },
	});
}

describe("propose-only record runs", () => {
	it("has no deal stage or deal update executor", () => {
		expect(AGENT_ACTION_EXECUTORS).not.toHaveProperty("deals.setStage");
		expect(AGENT_ACTION_EXECUTORS).not.toHaveProperty("deals.update");
		expect(Object.values(AGENT_ACTION_EXECUTORS)).not.toContain(
			"set_deal_stage",
		);
	});

	it("does not ship a deal-stage runner tool", async () => {
		const tools = await readdir(
			join(import.meta.dir, "../agent/subagents/agent_runner/tools"),
		);
		expect(tools).not.toContain("set_deal_stage.ts");
		expect(tools).not.toContain("update_deal.ts");
		expect(tools).toContain("create_crm_activity.ts");
	});

	it("refuses create_crm_activity and leaves the CRM unchanged", async () => {
		const run = await proposeRun();
		const beforeStage = await db.deal.findUniqueOrThrow({
			where: { id: dealId },
			select: { stage: true },
		});

		let error: Error | null = null;
		try {
			await createRunActivity(run.id, "note-1", {
				type: "NOTE",
				targetKind: "contact",
				targetId: contactId,
				subject: "Should not write",
				body: "This run is propose-only.",
			});
		} catch (caught) {
			error = caught as Error;
		}

		expect(error?.message).toBe(
			"This run can only propose changes. It cannot write them.",
		);
		expect(
			await db.activity.count({
				where: { meta: { path: ["runId"], equals: run.id } },
			}),
		).toBe(0);
		expect(
			await db.deal.findUniqueOrThrow({
				where: { id: dealId },
				select: { stage: true },
			}),
		).toEqual(beforeStage);
	});

	it("refuses Slack writes on a propose-only run", async () => {
		const run = await proposeRun();
		let error: Error | null = null;
		try {
			await postRunSlackMessage(run.id, "slack-1", {
				text: "Should not send",
			});
		} catch (caught) {
			error = caught as Error;
		}
		expect(error?.message).toBe(
			"This run can only propose changes. It cannot write them.",
		);
	});

	it("finishes with scoped proposals and does not apply them", async () => {
		const run = await proposeRun();
		const finished = await finishRun(run.id, {
			summary: "Propose a call and a stage change.",
			result: {
				proposals: [
					{ kind: "CALL", body: "Call Ada about renewal.", contactId },
					{
						kind: "STAGE",
						dealId,
						stage: DealStage.CLOSED_LOST,
						closedReason: "Budget cut",
					},
					{
						kind: "TASK",
						subject: "Invented company",
						companyId: "not-a-company",
					},
					{ kind: "NOTE", body: "Not a proposal kind." },
				],
			},
		});

		expect(finished.status).toBe("SUCCEEDED");
		expect(
			await db.agentRun.findUniqueOrThrow({
				where: { id: run.id },
				select: { status: true, result: true },
			}),
		).toEqual({
			status: "SUCCEEDED",
			result: {
				proposals: [
					{ kind: "CALL", body: "Call Ada about renewal.", contactId },
					{
						kind: "STAGE",
						dealId,
						stage: DealStage.CLOSED_LOST,
						closedReason: "Budget cut",
					},
				],
			},
		});
		expect(
			await db.activity.count({
				where: { meta: { path: ["runId"], equals: run.id } },
			}),
		).toBe(0);
		expect(
			await db.deal.findUniqueOrThrow({
				where: { id: dealId },
				select: { stage: true, closedReason: true },
			}),
		).toEqual({ stage: DealStage.DEMO_BOOKED, closedReason: null });
	});

	it("fails a prose-only finish and stores an empty proposal list", async () => {
		const run = await proposeRun();
		const finished = await finishRun(run.id, {
			summary: "No next step.",
			result: { notes: "Just thinking out loud." },
		});
		expect(finished.status).toBe("FAILED");
		expect(
			await db.agentRun.findUniqueOrThrow({
				where: { id: run.id },
				select: { status: true, result: true, errorCode: true },
			}),
		).toEqual({
			status: "FAILED",
			errorCode: "NO_PROPOSALS",
			result: { proposals: [] },
		});
	});
});
