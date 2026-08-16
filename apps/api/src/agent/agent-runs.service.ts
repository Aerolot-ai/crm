import { randomUUID } from "node:crypto";
import { type Db, Prisma } from "@crm/db";
import type { AgentRunStatus } from "@crm/db/enums";
import { lockIdempotencyKey } from "@crm/db/idempotency";
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { AgentAccessService } from "./agent-access.service";
import { AGENT_DISPATCH } from "./agent-dispatch.config";
import { AgentTriggerService } from "./agent-trigger.service";
import type {
	AgentCancelRunInput,
	AgentRetryRunInput,
	AgentRunNowInput,
	AgentRunOnRecordInput,
} from "./agents.contracts";

type RunRecord = {
	kind: "contact" | "company" | "deal";
	id: string;
};

const CANCELLABLE_STATUSES: readonly AgentRunStatus[] = [
	"QUEUED",
	"RUNNING",
	"WAITING_FOR_APPROVAL",
];

const RUN_EVENT_LIMIT = 200;

@Injectable()
export class AgentRunsService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly access: AgentAccessService,
		private readonly trigger: AgentTriggerService,
	) {}

	async list(agentId: string, limit: number, userId: string) {
		const agent = await this.readableAgent(agentId, userId);

		const rows = await this.db.agentRun.findMany({
			where: { agentId },
			orderBy: { createdAt: "desc" },
			take: limit,
			select: {
				id: true,
				status: true,
				triggerType: true,
				summary: true,
				result: true,
				modelId: true,
				inputTokens: true,
				outputTokens: true,
				costUsd: true,
				errorCode: true,
				errorMessage: true,
				createdAt: true,
				startedAt: true,
				finishedAt: true,
				initiatedBy: { select: { id: true, name: true, image: true } },
				version: { select: { id: true, number: true } },
				_count: { select: { events: true } },
				events: {
					orderBy: { sequence: "asc" },
					take: RUN_EVENT_LIMIT,
					select: {
						id: true,
						sequence: true,
						type: true,
						data: true,
						emittedAt: true,
					},
				},
				actions: {
					orderBy: { plannedAt: "asc" },
					select: {
						id: true,
						type: true,
						provider: true,
						targetType: true,
						targetId: true,
						targetLabel: true,
						summary: true,
						status: true,
						externalId: true,
						attemptCount: true,
						errorCode: true,
						errorMessage: true,
						plannedAt: true,
						startedAt: true,
						completedAt: true,
					},
				},
			},
		});

		return rows.map(({ _count, ...run }) => ({
			...run,
			totalEvents: _count.events,
			eventsTruncated: _count.events > run.events.length,
			canCancel:
				CANCELLABLE_STATUSES.includes(run.status) &&
				(agent.canManage || run.initiatedBy?.id === userId),
			costUsd: run.costUsd?.toString() ?? null,
			createdAt: run.createdAt.toISOString(),
			startedAt: run.startedAt?.toISOString() ?? null,
			finishedAt: run.finishedAt?.toISOString() ?? null,
			events: run.events.map((event) => ({
				...event,
				emittedAt: event.emittedAt.toISOString(),
			})),
			actions: run.actions.map((action) => ({
				...action,
				plannedAt: action.plannedAt.toISOString(),
				startedAt: action.startedAt?.toISOString() ?? null,
				completedAt: action.completedAt?.toISOString() ?? null,
			})),
		}));
	}

	async activity(agentId: string, limit: number, userId: string) {
		await this.readableAgent(agentId, userId);

		const rows = await this.db.agentAuditEvent.findMany({
			where: { agentId },
			orderBy: { emittedAt: "desc" },
			take: limit,
			select: {
				id: true,
				type: true,
				summary: true,
				before: true,
				after: true,
				requestId: true,
				emittedAt: true,
				actorType: true,
				actorId: true,
				actorUser: { select: { id: true, name: true, image: true } },
				version: { select: { id: true, number: true } },
			},
		});

		return rows.map((event) => ({
			...event,
			emittedAt: event.emittedAt.toISOString(),
		}));
	}

	async runNow(input: AgentRunNowInput, userId: string) {
		await this.access.assertMember(userId);
		const existing = await this.db.agentRun.findUnique({
			where: { idempotencyKey: input.clientRequestId },
			select: { id: true, agentId: true },
		});

		if (existing) {
			this.assertReplayMatches(existing.agentId, input.id);
			this.trigger.deployedAgentRunQueued();
			return { id: existing.id };
		}

		const run = await this.db.$transaction(async (tx) => {
			await lockIdempotencyKey(tx, input.clientRequestId);
			const replay = await tx.agentRun.findUnique({
				where: { idempotencyKey: input.clientRequestId },
				select: { id: true, agentId: true },
			});
			if (replay) {
				this.assertReplayMatches(replay.agentId, input.id);
				return { id: replay.id };
			}

			const [agent] = await tx.$queryRaw<
				Array<{
					id: string;
					status: string;
					currentVersionId: string | null;
				}>
			>`
					SELECT id, status, "currentVersionId"
					FROM "agentDefinition"
					WHERE id = ${input.id}
					FOR UPDATE
				`;

			if (!agent || agent.status === "DELETED") {
				throw new NotFoundException(`No agent with id ${input.id}.`);
			}

			if (agent.status !== "LIVE" || !agent.currentVersionId) {
				throw new BadRequestException("This agent is not live yet.");
			}

			const active = await tx.agentRun.findFirst({
				where: {
					agentId: input.id,
					status: { in: [...CANCELLABLE_STATUSES] },
				},
				select: { id: true },
			});
			if (active) {
				throw new ConflictException(
					"This agent already has an active run. Stop it or wait for it to finish.",
				);
			}

			const created = await tx.agentRun.create({
				data: {
					agentId: input.id,
					versionId: agent.currentVersionId,
					initiatedById: userId,
					triggerType: "MANUAL",
					idempotencyKey: input.clientRequestId,
					correlationId: randomUUID(),
					events: {
						create: { sequence: 0, type: "run.queued", data: {} },
					},
				},
				select: { id: true },
			});

			await tx.agentAuditEvent.create({
				data: {
					agentId: input.id,
					versionId: agent.currentVersionId,
					actorUserId: userId,
					actorType: "USER",
					actorId: userId,
					type: "run.requested",
					summary: "Requested a manual run",
					requestId: input.clientRequestId,
				},
			});

			return created;
		});

		this.trigger.deployedAgentRunQueued();
		return run;
	}

	async runOnRecord(input: AgentRunOnRecordInput, userId: string) {
		await this.access.assertMember(userId);
		const record = recordFromIds(input);
		const existing = await this.db.agentRun.findUnique({
			where: { idempotencyKey: input.clientRequestId },
			select: { id: true, agentId: true, input: true },
		});

		if (existing) {
			this.assertReplayMatchesRecord(existing, input.agentId, record);
			this.trigger.deployedAgentRunQueued();
			return { id: existing.id };
		}

		const run = await this.db.$transaction(async (tx) => {
			await lockIdempotencyKey(tx, input.clientRequestId);
			const replay = await tx.agentRun.findUnique({
				where: { idempotencyKey: input.clientRequestId },
				select: { id: true, agentId: true, input: true },
			});
			if (replay) {
				this.assertReplayMatchesRecord(replay, input.agentId, record);
				return { id: replay.id };
			}

			const [agent] = await tx.$queryRaw<
				Array<{
					id: string;
					status: string;
					currentVersionId: string | null;
				}>
			>`
					SELECT id, status, "currentVersionId"
					FROM "agentDefinition"
					WHERE id = ${input.agentId}
					FOR UPDATE
				`;

			if (!agent || agent.status === "DELETED") {
				throw new NotFoundException(`No agent with id ${input.agentId}.`);
			}

			if (agent.status !== "LIVE" || !agent.currentVersionId) {
				throw new BadRequestException(AGENT_DISPATCH.runOnRecord.notLive);
			}

			await this.assertReadableRecord(tx, record);

			const active = await tx.agentRun.findFirst({
				where: {
					agentId: input.agentId,
					status: { in: [...CANCELLABLE_STATUSES] },
				},
				select: { id: true },
			});
			if (active) {
				throw new ConflictException(
					"This agent already has an active run. Stop it or wait for it to finish.",
				);
			}

			const runInput = {
				record,
				...(input.message ? { message: input.message } : {}),
			};

			const created = await tx.agentRun.create({
				data: {
					agentId: input.agentId,
					versionId: agent.currentVersionId,
					initiatedById: userId,
					triggerType: "MANUAL",
					input: runInput,
					idempotencyKey: input.clientRequestId,
					correlationId: randomUUID(),
					events: {
						create: { sequence: 0, type: "run.queued", data: {} },
					},
				},
				select: { id: true },
			});

			await tx.agentAuditEvent.create({
				data: {
					agentId: input.agentId,
					versionId: agent.currentVersionId,
					actorUserId: userId,
					actorType: "USER",
					actorId: userId,
					type: "run.requested",
					summary: "Requested a manual run",
					requestId: input.clientRequestId,
				},
			});

			return created;
		});

		this.trigger.deployedAgentRunQueued();
		return run;
	}

	async retryRun(input: AgentRetryRunInput, userId: string) {
		await this.access.assertMember(userId);

		const run = await this.db.$transaction(async (tx) => {
			await lockIdempotencyKey(tx, input.clientRequestId);
			const replay = await tx.agentRun.findUnique({
				where: { idempotencyKey: input.clientRequestId },
				select: { id: true, agentId: true },
			});
			if (replay) {
				this.assertReplayMatches(replay.agentId, input.id);
				return { id: replay.id };
			}

			const previous = await tx.agentRun.findUnique({
				where: { id: input.runId },
				select: {
					agentId: true,
					status: true,
					versionId: true,
					triggerId: true,
					triggerType: true,
					input: true,
				},
			});
			if (!previous || previous.agentId !== input.id) {
				throw new NotFoundException(`No run with id ${input.runId}.`);
			}
			if (CANCELLABLE_STATUSES.includes(previous.status)) {
				throw new ConflictException("This run has not finished yet.");
			}

			const [agent] = await tx.$queryRaw<
				Array<{ id: string; status: string; currentVersionId: string | null }>
			>`
					SELECT id, status, "currentVersionId"
					FROM "agentDefinition"
					WHERE id = ${input.id}
					FOR UPDATE
				`;
			if (!agent || agent.status === "DELETED") {
				throw new NotFoundException(`No agent with id ${input.id}.`);
			}
			if (agent.status !== "LIVE" || !agent.currentVersionId) {
				throw new BadRequestException("This agent is not live yet.");
			}

			const active = await tx.agentRun.findFirst({
				where: { agentId: input.id, status: { in: [...CANCELLABLE_STATUSES] } },
				select: { id: true },
			});
			if (active) {
				throw new ConflictException(
					"This agent already has an active run. Stop it or wait for it to finish.",
				);
			}

			const created = await tx.agentRun.create({
				data: {
					agentId: input.id,
					versionId: previous.versionId,
					initiatedById: userId,
					triggerId: previous.triggerId,
					triggerType: previous.triggerType,
					input: previous.input ?? Prisma.DbNull,
					idempotencyKey: input.clientRequestId,
					correlationId: randomUUID(),
					events: { create: { sequence: 0, type: "run.queued", data: {} } },
				},
				select: { id: true },
			});

			await tx.agentAuditEvent.create({
				data: {
					agentId: input.id,
					versionId: previous.versionId,
					actorUserId: userId,
					actorType: "USER",
					actorId: userId,
					type: "run.requested",
					summary: `Retried run ${input.runId}`,
					requestId: input.clientRequestId,
				},
			});

			return created;
		});

		this.trigger.deployedAgentRunQueued();
		return run;
	}

	async cancelRun(input: AgentCancelRunInput, userId: string) {
		const agent = await this.readableAgent(input.id, userId);

		const outcome = await this.db.$transaction(async (tx) => {
			const [run] = await tx.$queryRaw<
				Array<{
					id: string;
					agentId: string;
					versionId: string;
					status: AgentRunStatus;
					initiatedById: string | null;
					nextEventSequence: number;
				}>
			>`
				SELECT id, "agentId", "versionId", status, "initiatedById", "nextEventSequence"
				FROM "agentRun"
				WHERE id = ${input.runId}
				FOR UPDATE
			`;

			if (!run || run.agentId !== input.id) {
				throw new NotFoundException(`No run with id ${input.runId}.`);
			}

			if (!agent.canManage && run.initiatedById !== userId) {
				throw new ForbiddenException(
					"Only the person who started this run, or a workspace admin, can stop it.",
				);
			}

			if (!CANCELLABLE_STATUSES.includes(run.status)) {
				return { id: run.id, status: run.status, cancelled: false };
			}

			const sequence = run.nextEventSequence + 1;
			const finishedAt = new Date();

			await tx.agentRun.update({
				where: { id: run.id },
				data: {
					status: "CANCELLED",
					errorCode: AGENT_DISPATCH.cancel.errorCode,
					errorMessage: AGENT_DISPATCH.cancel.message,
					finishedAt,
					nextEventSequence: sequence,
				},
			});

			await tx.agentAction.updateMany({
				where: { runId: run.id, status: { in: ["PLANNED", "RUNNING"] } },
				data: {
					status: "CANCELLED",
					errorCode: AGENT_DISPATCH.cancel.errorCode,
					errorMessage: AGENT_DISPATCH.cancel.message,
					completedAt: finishedAt,
				},
			});

			await tx.agentRunEvent.create({
				data: {
					id: `run-terminal:${run.id}:cancelled`,
					runId: run.id,
					sequence,
					type: "run.cancelled",
					data: { reason: "user.cancelled" },
					emittedAt: finishedAt,
				},
			});

			await tx.agentAuditEvent.upsert({
				where: {
					agentId_type_requestId: {
						agentId: run.agentId,
						type: "run.cancelled",
						requestId: run.id,
					},
				},
				create: {
					agentId: run.agentId,
					versionId: run.versionId,
					actorUserId: userId,
					actorType: "USER",
					actorId: userId,
					type: "run.cancelled",
					summary: "Stopped a run",
					requestId: run.id,
				},
				update: {},
			});

			return { id: run.id, status: "CANCELLED" as const, cancelled: true };
		});

		if (outcome.cancelled) {
			this.trigger.deployedAgentRunCancelled(outcome.id);
		}

		return outcome;
	}

	private async readableAgent(agentId: string, userId: string) {
		return this.access.assertCanRead(agentId, userId);
	}

	private assertReplayMatches(
		existingAgentId: string,
		requestedAgentId: string,
	) {
		if (existingAgentId !== requestedAgentId) {
			throw new BadRequestException(AGENT_DISPATCH.runOnRecord.replayMismatch);
		}
	}

	private assertReplayMatchesRecord(
		existing: { agentId: string; input: Prisma.JsonValue | null },
		requestedAgentId: string,
		record: RunRecord,
	) {
		this.assertReplayMatches(existing.agentId, requestedAgentId);
		const stored = recordFromRunInput(existing.input);
		if (!stored || stored.kind !== record.kind || stored.id !== record.id) {
			throw new BadRequestException(AGENT_DISPATCH.runOnRecord.replayMismatch);
		}
	}

	private async assertReadableRecord(
		tx: Prisma.TransactionClient,
		record: RunRecord,
	) {
		if (record.kind === "contact") {
			const contact = await tx.contact.findUnique({
				where: { id: record.id },
				select: { id: true },
			});
			if (!contact) {
				throw new NotFoundException(`No contact with id ${record.id}.`);
			}
			return;
		}
		if (record.kind === "company") {
			const company = await tx.company.findUnique({
				where: { id: record.id },
				select: { id: true },
			});
			if (!company) {
				throw new NotFoundException(`No company with id ${record.id}.`);
			}
			return;
		}
		const deal = await tx.deal.findUnique({
			where: { id: record.id },
			select: { id: true },
		});
		if (!deal) {
			throw new NotFoundException(`No deal with id ${record.id}.`);
		}
	}
}

function recordFromIds(input: {
	contactId?: string;
	companyId?: string;
	dealId?: string;
}): RunRecord {
	if (input.contactId) return { kind: "contact", id: input.contactId };
	if (input.companyId) return { kind: "company", id: input.companyId };
	if (input.dealId) return { kind: "deal", id: input.dealId };
	throw new BadRequestException("Choose exactly one contact, company or deal.");
}

function recordFromRunInput(input: Prisma.JsonValue | null): RunRecord | null {
	if (!input || typeof input !== "object" || Array.isArray(input)) return null;
	const record = (input as { record?: unknown }).record;
	if (!record || typeof record !== "object" || Array.isArray(record)) {
		return null;
	}
	const kind = (record as { kind?: unknown }).kind;
	const id = (record as { id?: unknown }).id;
	if (
		(kind === "contact" || kind === "company" || kind === "deal") &&
		typeof id === "string" &&
		id.length > 0
	) {
		return { kind, id };
	}
	return null;
}
