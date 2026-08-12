import { defineAgent, defineDynamic } from "eve";
import { z } from "zod";
import { selectedModel } from "../../lib/model";
import {
	createCrmLanguageModel,
	defaultCrmModel,
} from "../../lib/provider-model";

export default defineAgent({
	description:
		"Turn one private CRM builder-chat request into a validated, reviewable team-agent version without deploying it.",
	model: defineDynamic({
		fallback: defaultCrmModel(),
		events: {
			"session.started": async () => {
				const setting = await selectedModel();
				if (!setting) return null;
				const resolved = createCrmLanguageModel(setting.model);
				if (typeof resolved === "string") {
					return {
						model: resolved,
						modelContextWindowTokens: setting.modelContextWindowTokens,
					};
				}
				return null;
			},
			"step.started": async () => {
				const setting = await selectedModel();
				if (!setting) return null;
				const resolved = createCrmLanguageModel(setting.model);
				if (typeof resolved === "string") return null;
				return {
					model: resolved,
					modelContextWindowTokens: setting.modelContextWindowTokens,
				};
			},
		},
	}),
	outputSchema: z.object({
		status: z.literal("draft_ready"),
		summary: z.string().min(1).max(1000),
		agentId: z.string().min(1),
		versionId: z.string().min(1),
	}),
	limits: {
		maxInputTokensPerSession: 100_000,
		maxOutputTokensPerSession: 10_000,
		sessionTimeoutMs: 24 * 60 * 60 * 1000,
	},
});
