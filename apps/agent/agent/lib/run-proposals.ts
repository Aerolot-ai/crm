import { DealStage, db } from "@crm/db";
import { LOSING_DEAL_STAGES } from "@crm/db/deal-stage";
import type { AgentTriggerType } from "@crm/db/enums";
import { z } from "zod";
import { DISPATCH } from "./dispatch-config";

export const RUN_RECORD_KINDS = ["contact", "company", "deal"] as const;

export type RunRecordKind = (typeof RUN_RECORD_KINDS)[number];

export type RunRecordRef = {
	kind: RunRecordKind;
	id: string;
};

const DEAL_STAGES = [
	DealStage.DEMO_BOOKED,
	DealStage.QUALIFIED_TO_BUY,
	DealStage.UNQUALIFIED_TO_BUY,
	DealStage.DECISION_MAKER_BOUGHT_IN,
	DealStage.CONTRACT_SENT,
	DealStage.CLOSED_WON,
	DealStage.CLOSED_LOST,
] as const;

const losingStages = new Set<string>(LOSING_DEAL_STAGES);

const optionalRecordIds = {
	contactId: z.string().trim().min(1).optional(),
	companyId: z.string().trim().min(1).optional(),
	dealId: z.string().trim().min(1).optional(),
};

export const agentRunProposal = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("CALL"),
		body: z.string().trim().min(1).max(DISPATCH.run.proposalBodyMax),
		...optionalRecordIds,
	}),
	z
		.object({
			kind: z.literal("STAGE"),
			dealId: z.string().trim().min(1),
			stage: z.enum(DEAL_STAGES),
			closedReason: z
				.string()
				.trim()
				.min(1)
				.max(DISPATCH.run.proposalReasonMax)
				.optional(),
		})
		.refine(
			(proposal) =>
				!losingStages.has(proposal.stage) || Boolean(proposal.closedReason),
			{ path: ["closedReason"] },
		),
	z.object({
		kind: z.literal("TASK"),
		subject: z.string().trim().min(1).max(DISPATCH.run.proposalSubjectMax),
		dueAt: z.string().trim().min(1).optional(),
		...optionalRecordIds,
	}),
]);

export type AgentRunProposal = z.infer<typeof agentRunProposal>;

export const agentRunProposalResult = z.object({
	proposals: z.array(agentRunProposal).max(DISPATCH.run.proposalMax),
});

export type AgentRunProposalResult = z.infer<typeof agentRunProposalResult>;

const runRecordRef = z.object({
	kind: z.enum(RUN_RECORD_KINDS),
	id: z.string().trim().min(1),
});

export function parseRunRecord(input: unknown): RunRecordRef | null {
	if (!input || typeof input !== "object" || Array.isArray(input)) return null;
	const parsed = runRecordRef.safeParse((input as { record?: unknown }).record);
	return parsed.success ? parsed.data : null;
}

export function isProposeOnlyRun(
	triggerType: AgentTriggerType,
	input: unknown,
): boolean {
	return triggerType === "MANUAL" && parseRunRecord(input) !== null;
}

export type RecordScopeResource = {
	kind: RunRecordKind;
	id: string;
	label: string;
};

export async function loadRecordScopeResources(
	record: RunRecordRef,
): Promise<RecordScopeResource[]> {
	if (record.kind === "contact") return contactScope(record.id);
	if (record.kind === "company") return companyScope(record.id);
	return dealScope(record.id);
}

export function proposalsFromResult(
	result: unknown,
	proposals?: unknown,
): AgentRunProposal[] {
	if (Array.isArray(proposals)) return keepValidProposals(proposals);
	if (!result || typeof result !== "object" || Array.isArray(result)) return [];
	const listed = (result as { proposals?: unknown }).proposals;
	if (!Array.isArray(listed)) return [];
	return keepValidProposals(listed);
}

export function keepScopedProposals(
	proposals: AgentRunProposal[],
	resources: RecordScopeResource[],
): AgentRunProposal[] {
	const allowed = allowedIds(resources);
	return proposals.filter((proposal) => proposalInScope(proposal, allowed));
}

function keepValidProposals(value: unknown[]): AgentRunProposal[] {
	return value.flatMap((item) => {
		const parsed = agentRunProposal.safeParse(item);
		return parsed.success ? [parsed.data] : [];
	});
}

function allowedIds(resources: RecordScopeResource[]) {
	return {
		contact: new Set(
			resources.filter((row) => row.kind === "contact").map((row) => row.id),
		),
		company: new Set(
			resources.filter((row) => row.kind === "company").map((row) => row.id),
		),
		deal: new Set(
			resources.filter((row) => row.kind === "deal").map((row) => row.id),
		),
	};
}

function proposalInScope(
	proposal: AgentRunProposal,
	allowed: ReturnType<typeof allowedIds>,
): boolean {
	if (proposal.kind === "STAGE") return allowed.deal.has(proposal.dealId);
	return (
		idAllowed(proposal.contactId, allowed.contact) &&
		idAllowed(proposal.companyId, allowed.company) &&
		idAllowed(proposal.dealId, allowed.deal)
	);
}

function idAllowed(id: string | undefined, allowed: Set<string>): boolean {
	return id === undefined || allowed.has(id);
}

async function contactScope(id: string): Promise<RecordScopeResource[]> {
	const contact = await db.contact.findUnique({
		where: { id },
		select: {
			id: true,
			firstName: true,
			lastName: true,
			company: { select: { id: true, name: true } },
			deals: { select: { deal: { select: { id: true, name: true } } } },
		},
	});
	if (!contact) return [];
	return [
		{
			kind: "contact",
			id: contact.id,
			label: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
		},
		...(contact.company
			? [
					{
						kind: "company" as const,
						id: contact.company.id,
						label: contact.company.name,
					},
				]
			: []),
		...contact.deals.map(({ deal }) => ({
			kind: "deal" as const,
			id: deal.id,
			label: deal.name,
		})),
	];
}

async function companyScope(id: string): Promise<RecordScopeResource[]> {
	const company = await db.company.findUnique({
		where: { id },
		select: {
			id: true,
			name: true,
			contacts: {
				select: { id: true, firstName: true, lastName: true },
			},
			deals: { select: { id: true, name: true } },
		},
	});
	if (!company) return [];
	return [
		{ kind: "company", id: company.id, label: company.name },
		...company.contacts.map((contact) => ({
			kind: "contact" as const,
			id: contact.id,
			label: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
		})),
		...company.deals.map((deal) => ({
			kind: "deal" as const,
			id: deal.id,
			label: deal.name,
		})),
	];
}

async function dealScope(id: string): Promise<RecordScopeResource[]> {
	const deal = await db.deal.findUnique({
		where: { id },
		select: {
			id: true,
			name: true,
			company: { select: { id: true, name: true } },
			contacts: {
				select: {
					contact: {
						select: { id: true, firstName: true, lastName: true },
					},
				},
			},
		},
	});
	if (!deal) return [];
	return [
		{ kind: "deal", id: deal.id, label: deal.name },
		{
			kind: "company",
			id: deal.company.id,
			label: deal.company.name,
		},
		...deal.contacts.map(({ contact }) => ({
			kind: "contact" as const,
			id: contact.id,
			label: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
		})),
	];
}
