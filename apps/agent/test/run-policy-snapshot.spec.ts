import { describe, expect, it } from "bun:test";
import { AGENT_ACTION_TYPES } from "../agent/lib/agent-actions";
import {
	buildRunPolicySnapshot,
	inputHasPolicy,
	mergeRunInputWithPolicy,
	readAutonomyFlags,
	readSellerRulesVersion,
	SELLER_RULES_MISSING,
} from "../agent/lib/run-policy-snapshot";

const qualifyManifest = {
	lifecycleRole: "qualify",
	actions: [
		{
			type: AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE,
			provider: "crm",
			summary: "Note",
			activityTypes: ["NOTE"],
		},
		{
			type: AGENT_ACTION_TYPES.RUN_SUMMARY,
			provider: "crm",
			summary: "Done",
		},
	],
	triggers: [
		{
			type: "EVENT",
			name: "Contact created",
			summary: "Qualify new contacts",
			config: { event: "contact.created" },
		},
	],
	dataScope: {
		mode: "WORKSPACE",
		summary: "Workspace",
		resources: [],
	},
};

describe("run policy snapshot", () => {
	it("records seller rules as missing when no version exists", () => {
		expect(readSellerRulesVersion()).toBe(SELLER_RULES_MISSING);
		expect(
			buildRunPolicySnapshot({
				agentVersionId: "ver_1",
				manifest: qualifyManifest,
				triggerType: "EVENT",
			}).sellerRulesVersion,
		).toBe("missing");
	});

	it("omits autonomy when flags are absent", () => {
		expect(readAutonomyFlags()).toBeUndefined();
		expect(
			buildRunPolicySnapshot({
				agentVersionId: "ver_1",
				manifest: qualifyManifest,
				triggerType: "EVENT",
			}),
		).toEqual({
			lifecycleRole: "qualify",
			agentVersionId: "ver_1",
			actionAllowlist: [
				AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE,
				AGENT_ACTION_TYPES.RUN_SUMMARY,
			],
			triggerType: "EVENT",
			sellerRulesVersion: "missing",
		});
	});

	it("includes autonomy only when values are present", () => {
		expect(
			buildRunPolicySnapshot({
				agentVersionId: "ver_1",
				manifest: qualifyManifest,
				triggerType: "MANUAL",
				autonomy: { qualifyEvent: true },
			}).autonomy,
		).toEqual({ qualifyEvent: true });
	});

	it("freezes the snapshot object onto input.policy", () => {
		const policy = buildRunPolicySnapshot({
			agentVersionId: "ver_1",
			manifest: qualifyManifest,
			triggerType: "EVENT",
		});
		const input = mergeRunInputWithPolicy(
			{
				event: { type: "contact.created", occurredAt: "t", data: {} },
				record: { kind: "contact", id: "c1" },
			},
			policy,
		);
		expect(inputHasPolicy(input)).toBe(true);
		expect(input).toMatchObject({
			event: { type: "contact.created" },
			policy,
		});
	});
});
