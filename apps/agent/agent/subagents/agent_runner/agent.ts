import { db } from "@crm/db";
import { defineAgent, defineDynamic } from "eve";
import { z } from "zod";
import {
	createCrmLanguageModel,
	defaultCrmModel,
} from "../../lib/provider-model";
import { attribute, purposeOf } from "../../lib/session-purpose";

// biome-ignore lint/suspicious/noExplicitAny: eve dynamic event ctx is not exported as a stable type
async function modelForTeamRun(ctx: any): Promise<{
	modelId: string;
	modelContextWindowTokens: number;
} | null> {
	if (purposeOf(ctx) !== "team-agent") return null;
	const runId = attribute(ctx, "runId");
	if (!runId) return null;
	const run = await db.agentRun.findUnique({
		where: { id: runId },
		select: {
			version: {
				select: { modelId: true, modelContextWindowTokens: true },
			},
		},
	});
	if (!run) return null;
	return {
		modelId: run.version.modelId,
		modelContextWindowTokens: run.version.modelContextWindowTokens,
	};
}

export default defineAgent({
	description:
		"Execute one immutable deployed CRM agent version and persist its result and every side effect.",
	model: defineDynamic({
		fallback: defaultCrmModel(),
		events: {
			"session.started": async (_event, ctx) => {
				const pinned = await modelForTeamRun(ctx);
				if (!pinned) return null;
				const resolved = createCrmLanguageModel(pinned.modelId);
				if (typeof resolved === "string") {
					return {
						model: resolved,
						modelContextWindowTokens: pinned.modelContextWindowTokens,
					};
				}
				return null;
			},
			"step.started": async (_event, ctx) => {
				const pinned = await modelForTeamRun(ctx);
				if (!pinned) return null;
				const resolved = createCrmLanguageModel(pinned.modelId);
				if (typeof resolved === "string") return null;
				return {
					model: resolved,
					modelContextWindowTokens: pinned.modelContextWindowTokens,
				};
			},
		},
	}),
	outputSchema: z.object({
		summary: z.string().min(1).max(1000),
		result: z.record(z.string(), z.unknown()).nullable(),
	}),
	limits: {
		maxInputTokensPerSession: 500_000,
		maxOutputTokensPerSession: 40_000,
		sessionTimeoutMs: 24 * 60 * 60 * 1000,
	},
});
