import { AGENT_ACTION_TYPES } from "./agent-actions";

export const QUALIFY_EVAL = {
	forbiddenTools: [
		"send_email",
		"send_sms",
		"email.send",
		"sms.send",
		"update_deal_stage",
		"deal.stage.update",
		"post_slack_message",
		AGENT_ACTION_TYPES.SLACK_MESSAGE_POST,
	],
	allowedActivityTypes: ["NOTE", "TASK"] as const,
	allowedActionTypes: [
		AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE,
		AGENT_ACTION_TYPES.RUN_SUMMARY,
	] as const,
	decisions: ["pursue", "not-fit", "needs-human"] as const,
	missingRulesPhrases: ["seller rules are missing", "do not invent policy"],
	inventedPolicyPhrases: [
		"our icp requires",
		"company policy is",
		"we only sell to",
		"fit score",
	],
} as const;
