import { createOpenAI } from "@ai-sdk/openai";
import { DEFAULT_AGENT_MODEL } from "@crm/db/settings";
import type { LanguageModel } from "ai";

/**
 * Resolve a CRM model id to a direct provider LanguageModel.
 * Prefer DeepSeek (OPENAI-compatible), then OpenRouter. Gateway string ids
 * remain only when no direct credentials exist (local tests).
 */
export function createCrmLanguageModel(modelId: string): LanguageModel | string {
	const id = modelId.trim() || DEFAULT_AGENT_MODEL.id;
	const deepseekKey =
		process.env.DEEPSEEK_API_KEY?.trim() ||
		(process.env.OPENAI_API_BASE_URL?.includes("deepseek")
			? process.env.OPENAI_API_KEY?.trim()
			: undefined);
	const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();

	if (deepseekKey) {
		const baseURL =
			process.env.DEEPSEEK_BASE_URL?.trim() ||
			(process.env.OPENAI_API_BASE_URL?.includes("deepseek")
				? process.env.OPENAI_API_BASE_URL.trim()
				: "https://api.deepseek.com");
		const client = createOpenAI({
			baseURL: baseURL.replace(/\/$/, ""),
			apiKey: deepseekKey,
			name: "deepseek",
		});
		const native = nativeDeepseekId(id);
		return client(native);
	}

	if (openrouterKey) {
		const client = createOpenAI({
			baseURL: "https://openrouter.ai/api/v1",
			apiKey: openrouterKey,
			name: "openrouter",
		});
		return client(openrouterId(id));
	}

	// Tests / no keys: leave gateway id string for eve (AI_GATEWAY_API_KEY / OIDC).
	return id;
}

export function defaultCrmModel(): LanguageModel | string {
	return createCrmLanguageModel(DEFAULT_AGENT_MODEL.id);
}

function nativeDeepseekId(modelId: string): string {
	if (modelId.startsWith("deepseek/")) {
		return modelId.slice("deepseek/".length) || "deepseek-chat";
	}
	if (modelId.startsWith("deepseek-")) {
		return modelId;
	}
	return "deepseek-chat";
}

function openrouterId(modelId: string): string {
	if (modelId.includes("/")) return modelId;
	if (modelId.startsWith("deepseek")) return `deepseek/${modelId}`;
	return modelId;
}

export function hasDirectModelCredentials(): boolean {
	return Boolean(
		process.env.DEEPSEEK_API_KEY?.trim() ||
			process.env.OPENROUTER_API_KEY?.trim() ||
			(process.env.OPENAI_API_BASE_URL?.includes("deepseek") &&
				process.env.OPENAI_API_KEY?.trim()),
	);
}
