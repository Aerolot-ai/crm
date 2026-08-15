import { afterAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import {
	createRunActivity,
	finishRun,
	postRunSlackMessage,
} from "../agent/lib/run-runtime";

const suffix = crypto.randomUUID();
const userId = `action-risk-user-${suffix}`;
const domain = `action-risk-${suffix}.example.test`;

let agentId = "";
let crmVersionId = "";
let slackVersionId = "";
let companyId = "";

async function seed() {
	if (agentId) return;
	await db.user.create({
		data: {
			id: userId,
			name: "Action risk",
			email: `${userId}@example.test`,
		},
	});
	const company = await db.company.create({
		data: { name: "Action Risk Co", domain },
		select: { id: true },
	});
	companyId = company.id;
	const agent = await db.agentDefinition.create({
		data: {
			name: "Action risk",
			status: "LIVE",
			createdById: userId,
		},
		select: { id: true },
	});
	agentId = agent.id;
	const crmVersion = await db.agentVersion.create({
		data: {
			agentId,
			number: 1,
			status: "DEPLOYED",
			instructions: "Write a note.",
			manifest: {
				triggers: [
					{
						type: "EVENT",
						name: "When a contact is created",
						summary: "On create",
						config: { event: "contact.created" },
					},
				],
				dataScope: {
					mode: "SELECTED",
					summary: "Selected company",
					resources: [
						{ kind: "company", id: companyId, label: "Action Risk Co" },
					],
				},
				actions: [
					{
						type: "crm.activity.create",
						provider: "crm",
						summary: "Create a CRM note",
						activityTypes: ["NOTE"],
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
	crmVersionId = crmVersion.id;
	const slackVersion = await db.agentVersion.create({
		data: {
			agentId,
			number: 2,
			status: "READY",
			instructions: "Post Slack.",
			manifest: {
				triggers: [
					{
						type: "EVENT",
						name: "When a contact is created",
						summary: "On create",
						config: { event: "contact.created" },
					},
				],
				dataScope: {
					mode: "WORKSPACE",
					summary: "Workspace with Slack",
					resources: [
						{
							kind: "integration",
							id: "slack:workspace",
							label: "Slack",
						},
					],
				},
				actions: [
					{
						type: "slack.message.post",
						provider: "slack",
						summary: "Post to Slack",
						destination: {
							kind: "channel",
							resolution: "chosen",
							id: "C123",
							label: "#alerts",
						},
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
		},
		select: { id: true },
	});
	slackVersionId = slackVersion.id;
}

async function createRun(
	versionId: string,
	triggerType: "MANUAL" | "EVENT" | "SCHEDULE" | "WEBHOOK",
) {
	return db.agentRun.create({
		data: {
			agentId,
			versionId,
			triggerType,
			status: "RUNNING",
			startedAt: new Date(),
			idempotencyKey: `action-risk-${crypto.randomUUID()}`,
			correlationId: crypto.randomUUID(),
			events: { create: { sequence: 0, type: "run.queued", data: {} } },
		},
		select: { id: true },
	});
}

afterAll(async () => {
	if (!agentId) return;
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
	await db.company.deleteMany({ where: { id: companyId } });
	await db.user.deleteMany({ where: { id: userId } });
});

describe("unattended action claim", () => {
	it("allows R0 and R1 on EVENT and denies R4 even with a Slack grant", async () => {
		await seed();
		const eventRun = await createRun(crmVersionId, "EVENT");
		const note = await createRunActivity(eventRun.id, "note-1", {
			type: "NOTE",
			targetKind: "company",
			targetId: companyId,
			subject: "Allowed note",
			body: "R1 write.",
		});
		expect(note.replayed).toBe(false);
		const finished = await finishRun(eventRun.id, {
			summary: "R0 summary",
		});
		expect(finished).toEqual({ id: eventRun.id, status: "SUCCEEDED" });

		const slackEvent = await createRun(slackVersionId, "EVENT");
		let slackError: Error | null = null;
		try {
			await postRunSlackMessage(slackEvent.id, "slack-1", {
				text: "Should not send.",
			});
		} catch (error) {
			slackError = error as Error;
		}
		expect(slackError?.message).toContain(
			"Unattended EVENT runs cannot claim R4 slack.message.post",
		);
		expect(
			await db.agentAction.count({
				where: { runId: slackEvent.id },
			}),
		).toBe(0);

		const slackManual = await createRun(slackVersionId, "MANUAL");
		let manualError: Error | null = null;
		try {
			await postRunSlackMessage(slackManual.id, "slack-manual", {
				text: "Interactive grant path.",
			});
		} catch (error) {
			manualError = error as Error;
		}
		expect(manualError?.message).toBe("Slack is not connected.");
	});
});
