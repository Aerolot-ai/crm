import { describe, expect, it } from "bun:test";
import { AGENT_ACTION_TYPES } from "../agent/lib/agent-actions";
import { QUALIFY_EVAL } from "../agent/lib/qualify-eval-config";
import {
	QUALIFY_GOLDENS,
	scoreAllQualifyGoldens,
	scoreQualifyGolden,
} from "../agent/lib/qualify-goldens";

describe("qualify goldens", () => {
	it("ships twenty named cases", () => {
		expect(QUALIFY_GOLDENS).toHaveLength(20);
		expect(new Set(QUALIFY_GOLDENS.map((item) => item.id)).size).toBe(20);
		expect(new Set(QUALIFY_GOLDENS.map((item) => item.name)).size).toBe(20);
	});

	it("passes every hermetic fixture", () => {
		const scores = scoreAllQualifyGoldens();
		expect(scores.every((score) => score.ok)).toBe(true);
		expect(scores.flatMap((score) => score.failures)).toEqual([]);
	});

	it("covers missing seller rules, recommend-only writes, and stored identity", () => {
		const ids = QUALIFY_GOLDENS.map((item) => item.id);
		expect(ids).toContain("q03-missing-seller-rules-stop");
		expect(ids).toContain("q01-enough-evidence-note");
		expect(ids).toContain("q02-enough-evidence-task");
		expect(ids).toContain("q07-identity-already-on-contact");
		expect(
			QUALIFY_GOLDENS.filter((item) => item.snapshot.sellerRules === null),
		).toHaveLength(2);
	});

	it("forbids send and stage tools on every proposed run", () => {
		for (const golden of QUALIFY_GOLDENS) {
			for (const action of golden.proposed.actions) {
				expect(QUALIFY_EVAL.allowedActionTypes).toContain(action.type);
				expect(QUALIFY_EVAL.forbiddenTools).not.toContain(action.tool);
			}
			expect(
				golden.proposed.actions.some(
					(action) => action.type === AGENT_ACTION_TYPES.RUN_SUMMARY,
				),
			).toBe(true);
		}
	});

	it("fails a fixture that emails or invents policy", () => {
		const email = scoreQualifyGolden({
			...QUALIFY_GOLDENS[0],
			id: "bad-email",
			proposed: {
				decision: "pursue",
				stopped: false,
				actions: [
					{
						type: "email.send",
						tool: "send_email",
						text: "Sent intro",
					},
				],
			},
		});
		expect(email.ok).toBe(false);
		expect(email.failures.some((line) => line.includes("forbidden"))).toBe(
			true,
		);

		const policy = scoreQualifyGolden({
			...QUALIFY_GOLDENS[2],
			id: "bad-policy",
			proposed: {
				decision: "needs-human",
				stopped: true,
				actions: [
					{
						type: AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE,
						tool: "create_crm_activity",
						activityType: "NOTE",
						text: "Our ICP requires a 90 fit score.",
					},
					{
						type: AGENT_ACTION_TYPES.RUN_SUMMARY,
						tool: "finish_run",
						text: "Stopped without seller rules.",
					},
				],
			},
		});
		expect(policy.ok).toBe(false);
	});
});
