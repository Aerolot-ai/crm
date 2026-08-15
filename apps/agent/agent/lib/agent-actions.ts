import type { AgentTriggerType } from "@crm/db/enums";
import { DISPATCH } from "./dispatch-config";

export const AGENT_ACTION_TYPES = {
	CRM_ACTIVITY_CREATE: "crm.activity.create",
	RUN_SUMMARY: "run.summary",
	SLACK_MESSAGE_POST: "slack.message.post",
} as const;

export type AgentActionType =
	(typeof AGENT_ACTION_TYPES)[keyof typeof AGENT_ACTION_TYPES];

export const ACTION_RISK = {
	R0: "R0",
	R1: "R1",
	R2: "R2",
	R3: "R3",
	R4: "R4",
	R5: "R5",
} as const;

export type ActionRiskClass = (typeof ACTION_RISK)[keyof typeof ACTION_RISK];

const ACTION_RISK_RANK = {
	[ACTION_RISK.R0]: 0,
	[ACTION_RISK.R1]: 1,
	[ACTION_RISK.R2]: 2,
	[ACTION_RISK.R3]: 3,
	[ACTION_RISK.R4]: 4,
	[ACTION_RISK.R5]: 5,
} as const;

export const UNATTENDED_MAX_RISK = ACTION_RISK.R2;

export const AGENT_ACTION_EXECUTORS = {
	[AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE]: "create_crm_activity",
	[AGENT_ACTION_TYPES.RUN_SUMMARY]: "finish_run",
	[AGENT_ACTION_TYPES.SLACK_MESSAGE_POST]: "post_slack_message",
} as const satisfies Record<AgentActionType, string>;

export function isAgentActionType(value: unknown): value is AgentActionType {
	return Object.hasOwn(AGENT_ACTION_EXECUTORS, String(value));
}

export type AgentActionDependency = {
	readonly id: string;
	readonly label: string;
	readonly resourceId: string;
	readonly fix: string;
};

export type AgentActionPolicy = {
	readonly risk: ActionRiskClass;
	readonly budgetUnits: number;
	readonly reversible: boolean;
	readonly dependency: AgentActionDependency | null;
};

export const AGENT_ACTION_POLICIES = {
	[AGENT_ACTION_TYPES.RUN_SUMMARY]: {
		risk: ACTION_RISK.R0,
		budgetUnits: 0,
		reversible: true,
		dependency: null,
	},
	[AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE]: {
		risk: ACTION_RISK.R1,
		budgetUnits: 1,
		reversible: true,
		dependency: null,
	},
	[AGENT_ACTION_TYPES.SLACK_MESSAGE_POST]: {
		risk: ACTION_RISK.R4,
		budgetUnits: 4,
		reversible: false,
		dependency: {
			id: "slack",
			label: "Slack",
			resourceId: "slack:workspace",
			fix: "Connect Slack in Settings → Connections.",
		},
	},
} as const satisfies Record<AgentActionType, AgentActionPolicy>;

export const AGENT_ACTION_DEPENDENCIES = {
	[AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE]:
		AGENT_ACTION_POLICIES[AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE].dependency,
	[AGENT_ACTION_TYPES.RUN_SUMMARY]:
		AGENT_ACTION_POLICIES[AGENT_ACTION_TYPES.RUN_SUMMARY].dependency,
	[AGENT_ACTION_TYPES.SLACK_MESSAGE_POST]:
		AGENT_ACTION_POLICIES[AGENT_ACTION_TYPES.SLACK_MESSAGE_POST].dependency,
} as const satisfies Record<AgentActionType, AgentActionDependency | null>;

export function actionPolicy(type: AgentActionType): AgentActionPolicy {
	return AGENT_ACTION_POLICIES[type];
}

export function actionDependency(
	type: AgentActionType,
): AgentActionDependency | null {
	return AGENT_ACTION_POLICIES[type].dependency;
}

export function isUnattendedTrigger(triggerType: AgentTriggerType): boolean {
	return (DISPATCH.run.noActionTriggerTypes as readonly string[]).includes(
		triggerType,
	);
}

export function unattendedRiskDenied(type: AgentActionType): boolean {
	return ACTION_RISK_RANK[AGENT_ACTION_POLICIES[type].risk] >
		ACTION_RISK_RANK[UNATTENDED_MAX_RISK];
}

export function assertUnattendedActionAllowed(
	type: AgentActionType,
	triggerType: AgentTriggerType,
): void {
	if (!isUnattendedTrigger(triggerType)) return;
	if (!unattendedRiskDenied(type)) return;
	const policy = AGENT_ACTION_POLICIES[type];
	throw new Error(
		`Unattended ${triggerType} runs cannot claim ${policy.risk} ${type}.`,
	);
}
