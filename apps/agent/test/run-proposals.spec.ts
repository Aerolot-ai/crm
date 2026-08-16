import { describe, expect, it } from "bun:test";
import { DealStage } from "@crm/db";
import {
	agentRunProposal,
	isProposeOnlyRun,
	keepScopedProposals,
	parseRunRecord,
	proposalsFromResult,
} from "../agent/lib/run-proposals";

describe("record-scoped run proposals", () => {
	it("treats a manual run with a record as propose-only", () => {
		expect(
			isProposeOnlyRun("MANUAL", { record: { kind: "deal", id: "deal-1" } }),
		).toBe(true);
		expect(isProposeOnlyRun("MANUAL", {})).toBe(false);
		expect(
			isProposeOnlyRun("EVENT", { record: { kind: "deal", id: "deal-1" } }),
		).toBe(false);
	});

	it("reads the run record from input", () => {
		expect(
			parseRunRecord({
				record: { kind: "contact", id: "contact-1" },
				message: "Recap",
			}),
		).toEqual({ kind: "contact", id: "contact-1" });
		expect(parseRunRecord({ event: { type: "deal.closed" } })).toBeNull();
	});

	it("accepts only CALL, STAGE, and TASK", () => {
		expect(
			agentRunProposal.safeParse({ kind: "CALL", body: "Follow up Friday." })
				.success,
		).toBe(true);
		expect(
			agentRunProposal.safeParse({
				kind: "NOTE",
				body: "Not a proposal kind.",
			}).success,
		).toBe(false);
		expect(agentRunProposal.safeParse({ kind: "CALL" }).success).toBe(false);
		expect(agentRunProposal.safeParse({ kind: "TASK" }).success).toBe(false);
		expect(
			agentRunProposal.safeParse({
				kind: "STAGE",
				dealId: "deal-1",
				stage: DealStage.CLOSED_LOST,
			}).success,
		).toBe(false);
		expect(
			agentRunProposal.safeParse({
				kind: "STAGE",
				dealId: "deal-1",
				stage: DealStage.CLOSED_LOST,
				closedReason: "No budget",
			}).success,
		).toBe(true);
	});

	it("turns prose-only results into an empty proposal list", () => {
		expect(proposalsFromResult({ summary: "Nothing to do." })).toEqual([]);
		expect(proposalsFromResult(null)).toEqual([]);
		expect(proposalsFromResult({ proposals: "call them" })).toEqual([]);
	});

	it("drops invented record ids", () => {
		const kept = keepScopedProposals(
			[
				{
					kind: "CALL",
					body: "Call Ada.",
					contactId: "contact-1",
				},
				{
					kind: "TASK",
					subject: "Invented person",
					contactId: "stranger",
				},
				{
					kind: "STAGE",
					dealId: "deal-1",
					stage: DealStage.QUALIFIED_TO_BUY,
				},
			],
			[
				{ kind: "contact", id: "contact-1", label: "Ada" },
				{ kind: "deal", id: "deal-1", label: "Renewal" },
			],
		);
		expect(kept).toEqual([
			{ kind: "CALL", body: "Call Ada.", contactId: "contact-1" },
			{ kind: "STAGE", dealId: "deal-1", stage: DealStage.QUALIFIED_TO_BUY },
		]);
	});
});
