import "@crm/env/load";

import type {} from "@ai-sdk/provider";
import { DEFAULT_AGENT_MODEL } from "@crm/db/settings";
import { onTelemetryProblem, syncVersion } from "@crm/telemetry";
import { defineAgent, defineDynamic } from "eve";
import { logCapabilities } from "./lib/capabilities";
import { selectedModel } from "./lib/model";
import { createCrmLanguageModel, defaultCrmModel } from "./lib/provider-model";

void logCapabilities();

onTelemetryProblem((message) => console.debug(`[telemetry] ${message}`));

void syncVersion();

export default defineAgent({
	model: defineDynamic({
		// Direct DeepSeek/OpenRouter LanguageModel when keys exist; else gateway id string.
		fallback: defaultCrmModel(),
		events: {
			"session.started": async () => {
				const setting = await selectedModel();
				if (!setting) return null;
				const resolved = createCrmLanguageModel(setting.model);
				// String ids only when still on gateway path (no direct credentials).
				if (typeof resolved === "string") {
					return {
						model: resolved,
						modelContextWindowTokens: setting.modelContextWindowTokens,
					};
				}
				// Direct provider: session keeps fallback; step.started injects LanguageModel.
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
	limits: {
		maxInputTokensPerSession: 500_000,
		maxOutputTokensPerSession: 50_000,
		sessionTimeoutMs: 30 * 24 * 60 * 60 * 1000,
	},
});
