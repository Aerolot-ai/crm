import { defineTool } from "eve/tools";
import { z } from "zod";
import { DISPATCH } from "../../../lib/dispatch-config";
import { stageRunResult } from "../../../lib/run-runtime";
import { requireTeamAgentAttribute } from "../../../lib/session-purpose";

export default defineTool({
	description:
		"Finish this run with its concise summary and structured result. For a manual record run, pass CALL, STAGE, or TASK proposals only — the CRM does not apply them. An empty proposal list fails that run. Set noActionNeeded when the trigger fired but this run's condition was not met, so none of the declared actions applied — an agent that watches for something is expected to do nothing when that thing did not happen.",
	inputSchema: z.object({
		summary: z.string().trim().min(1).max(1000),
		result: z.record(z.string(), z.unknown()).nullish(),
		proposals: z.array(z.unknown()).max(DISPATCH.run.proposalMax).nullish(),
		noActionNeeded: z
			.object({
				reason: z.string().trim().min(1).max(500),
			})
			.nullish(),
	}),
	async execute(input, ctx) {
		return stageRunResult(requireTeamAgentAttribute(ctx, "runId"), input);
	},
});
