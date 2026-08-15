import { describe, expect, it } from "bun:test";
import {
	ACTION_RISK,
	AGENT_ACTION_POLICIES,
	AGENT_ACTION_TYPES,
	UNATTENDED_MAX_RISK,
	assertUnattendedActionAllowed,
	unattendedRiskDenied,
} from "../agent/lib/agent-actions";

describe("action risk table", () => {
	it("annotates every allowlisted type", () => {
		expect(AGENT_ACTION_POLICIES[AGENT_ACTION_TYPES.RUN_SUMMARY]).toEqual({
			risk: ACTION_RISK.R0,
			budgetUnits: 0,
			reversible: true,
			dependency: null,
		});
		expect(
			AGENT_ACTION_POLICIES[AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE],
		).toEqual({
			risk: ACTION_RISK.R1,
			budgetUnits: 1,
			reversible: true,
			dependency: null,
		});
		expect(
			AGENT_ACTION_POLICIES[AGENT_ACTION_TYPES.SLACK_MESSAGE_POST],
		).toMatchObject({
			risk: ACTION_RISK.R4,
			budgetUnits: 4,
			reversible: false,
			dependency: { id: "slack", resourceId: "slack:workspace" },
		});
	});

	it("denies R3+ on unattended triggers only", () => {
		expect(unattendedRiskDenied(AGENT_ACTION_TYPES.RUN_SUMMARY)).toBe(false);
		expect(unattendedRiskDenied(AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE)).toBe(
			false,
		);
		expect(unattendedRiskDenied(AGENT_ACTION_TYPES.SLACK_MESSAGE_POST)).toBe(
			true,
		);
		expect(UNATTENDED_MAX_RISK).toBe(ACTION_RISK.R2);

		expect(() =>
			assertUnattendedActionAllowed(
				AGENT_ACTION_TYPES.RUN_SUMMARY,
				"EVENT",
			),
		).not.toThrow();
		expect(() =>
			assertUnattendedActionAllowed(
				AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE,
				"SCHEDULE",
			),
		).not.toThrow();
		expect(() =>
			assertUnattendedActionAllowed(
				AGENT_ACTION_TYPES.SLACK_MESSAGE_POST,
				"WEBHOOK",
			),
		).toThrow(/Unattended WEBHOOK runs cannot claim R4 slack\.message\.post/);
		expect(() =>
			assertUnattendedActionAllowed(
				AGENT_ACTION_TYPES.SLACK_MESSAGE_POST,
				"MANUAL",
			),
		).not.toThrow();
	});
});
