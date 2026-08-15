import { describe, expect, it } from "bun:test";
import {
	DEFAULT_AUTONOMY_POLICY,
	FAIL_CLOSED_AUTONOMY_POLICY,
	canQueueAgentRun,
	parseAutonomyPolicy,
	phase0EventTriggerEnabled,
} from "../agent/lib/autonomy-policy";

describe("autonomy policy", () => {
	it("fails closed when the stored value is missing or incomplete", () => {
		expect(parseAutonomyPolicy(null)).toEqual(FAIL_CLOSED_AUTONOMY_POLICY);
		expect(parseAutonomyPolicy({})).toEqual(FAIL_CLOSED_AUTONOMY_POLICY);
		expect(
			parseAutonomyPolicy({ "autonomy.global": "recommend" }),
		).toEqual(FAIL_CLOSED_AUTONOMY_POLICY);
	});

	it("accepts a complete recommend policy", () => {
		expect(parseAutonomyPolicy(DEFAULT_AUTONOMY_POLICY)).toEqual(
			DEFAULT_AUTONOMY_POLICY,
		);
	});

	it("blocks queueing in observe mode and when a specialist is off", () => {
		const qualifyManifest = { lifecycleRole: "qualify" };
		expect(
			canQueueAgentRun(
				{ ...DEFAULT_AUTONOMY_POLICY, "autonomy.global": "observe" },
				qualifyManifest,
			),
		).toBe(false);
		expect(
			canQueueAgentRun(
				{ ...DEFAULT_AUTONOMY_POLICY, "specialist.qualify": "off" },
				qualifyManifest,
			),
		).toBe(false);
		expect(canQueueAgentRun(DEFAULT_AUTONOMY_POLICY, qualifyManifest)).toBe(
			true,
		);
	});

	it("keeps only Qualify contact.created EVENT enabled in phase 0", () => {
		expect(
			phase0EventTriggerEnabled("qualify", "EVENT", "contact.created"),
		).toBe(true);
		expect(
			phase0EventTriggerEnabled("qualify", "EVENT", "company.created"),
		).toBe(false);
		expect(phase0EventTriggerEnabled("qualify", "MANUAL", null)).toBe(true);
		expect(
			phase0EventTriggerEnabled("engage", "EVENT", "contact.created"),
		).toBe(false);
		expect(phase0EventTriggerEnabled("advance", "EVENT", "deal.opened")).toBe(
			false,
		);
		expect(phase0EventTriggerEnabled("close", "EVENT", "deal.closed")).toBe(
			false,
		);
	});
});
