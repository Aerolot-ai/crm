import { describe, expect, it } from "bun:test";
import {
	CRM_EVENT,
	CRM_EVENT_TYPES,
	InvalidCrmEventEnvelope,
	crmEventEnvelope,
	crmEventIdempotencyKey,
	isIdempotentCrmEvent,
	parseCrmEventEnvelope,
} from "../src/crm-events";

const valid = {
	id: "evt-1",
	type: "deal.closed" as const,
	occurredAt: "2026-08-10T11:00:00.000Z",
	record: { kind: "deal" as const, id: "deal-1" },
	producer: CRM_EVENT.producer,
	schemaVersion: CRM_EVENT.schemaVersion,
	data: { from: "NEGOTIATION", to: "CLOSED_WON" },
};

describe("crmEventEnvelope", () => {
	it("keeps the six catalog types", () => {
		expect(CRM_EVENT_TYPES).toEqual([
			"company.created",
			"contact.created",
			"deal.created",
			"deal.stage.changed",
			"deal.opened",
			"deal.closed",
		]);
	});

	it("parses a valid envelope", () => {
		expect(parseCrmEventEnvelope(valid)).toEqual(valid);
	});

	it("fails closed on a missing field", () => {
		expect(() => parseCrmEventEnvelope({ type: "deal.closed" })).toThrow(
			InvalidCrmEventEnvelope,
		);
	});

	it("fails closed when record kind does not match the type", () => {
		expect(() =>
			crmEventEnvelope.parse({
				...valid,
				record: { kind: "contact", id: "contact-1" },
			}),
		).toThrow();
	});

	it("locks deal lifecycle types on the natural key", () => {
		expect(isIdempotentCrmEvent("deal.closed")).toBe(true);
		expect(isIdempotentCrmEvent("deal.created")).toBe(false);
		expect(crmEventIdempotencyKey(valid)).toBe(
			"crm-event:deal.closed:deal-1:2026-08-10T11:00:00.000Z",
		);
	});
});
