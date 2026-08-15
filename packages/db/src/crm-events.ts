import { z } from "zod";

export type CrmEventRecordKind = "company" | "contact" | "deal";

type CrmEventDefinition = {
	label: string;
	description: string;
	recordKind: CrmEventRecordKind;
};

export const CRM_EVENT = {
	schemaVersion: 1,
	producer: "crm.api",
	idempotentTypes: [
		"deal.stage.changed",
		"deal.opened",
		"deal.closed",
	] as const,
} as const;

export const CRM_EVENT_CATALOG = {
	"company.created": {
		label: "Company created",
		description: "A company is added to the CRM",
		recordKind: "company",
	},
	"contact.created": {
		label: "Contact created",
		description: "A contact is added to the CRM",
		recordKind: "contact",
	},
	"deal.created": {
		label: "Deal created",
		description: "A deal is added to the CRM",
		recordKind: "deal",
	},
	"deal.stage.changed": {
		label: "Deal stage changed",
		description: "A deal moves from one pipeline stage to another",
		recordKind: "deal",
	},
	"deal.opened": {
		label: "Deal opened",
		description: "A closed deal returns to the open pipeline",
		recordKind: "deal",
	},
	"deal.closed": {
		label: "Deal closed",
		description: "An open deal moves to a closed stage",
		recordKind: "deal",
	},
} as const satisfies Record<string, CrmEventDefinition>;

export type CrmEventType = keyof typeof CRM_EVENT_CATALOG;

export const CRM_EVENT_TYPES = Object.keys(CRM_EVENT_CATALOG) as [
	CrmEventType,
	...CrmEventType[],
];

export function isCrmEventType(value: unknown): value is CrmEventType {
	return typeof value === "string" && Object.hasOwn(CRM_EVENT_CATALOG, value);
}

const crmEventData = z.record(z.string(), z.unknown());

function envelopeFor<Type extends CrmEventType>(
	type: Type,
	kind: (typeof CRM_EVENT_CATALOG)[Type]["recordKind"],
) {
	return z.object({
		id: z.string().trim().min(1),
		type: z.literal(type),
		occurredAt: z.iso.datetime(),
		record: z.object({
			kind: z.literal(kind),
			id: z.string().trim().min(1),
		}),
		producer: z.string().trim().min(1),
		schemaVersion: z.literal(CRM_EVENT.schemaVersion),
		data: crmEventData.default({}),
	});
}

export const crmEventEnvelope = z.discriminatedUnion("type", [
	envelopeFor("company.created", "company"),
	envelopeFor("contact.created", "contact"),
	envelopeFor("deal.created", "deal"),
	envelopeFor("deal.stage.changed", "deal"),
	envelopeFor("deal.opened", "deal"),
	envelopeFor("deal.closed", "deal"),
]);

export type CrmEventEnvelope = z.infer<typeof crmEventEnvelope>;

export class InvalidCrmEventEnvelope extends Error {
	constructor(readonly issues: string) {
		super(`The CRM event envelope is invalid: ${issues}`);
		this.name = "InvalidCrmEventEnvelope";
	}
}

export function parseCrmEventEnvelope(value: unknown): CrmEventEnvelope {
	const parsed = crmEventEnvelope.safeParse(value);
	if (parsed.success) return parsed.data;

	throw new InvalidCrmEventEnvelope(
		parsed.error.issues
			.map((issue) => `${issue.path.join(".") || "envelope"} ${issue.message}`)
			.join("; "),
	);
}

export function crmEventIdempotencyKey(envelope: CrmEventEnvelope): string {
	return `crm-event:${envelope.type}:${envelope.record.id}:${envelope.occurredAt}`;
}

export function isIdempotentCrmEvent(
	type: CrmEventType,
): type is (typeof CRM_EVENT.idempotentTypes)[number] {
	return (CRM_EVENT.idempotentTypes as readonly string[]).includes(type);
}
