import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";
import {
	QUALIFY_GOLDENS,
	scoreQualifyGolden,
} from "../agent/lib/qualify-goldens";

export default defineEval({
	description:
		"Qualify specialist recommend-only goldens. Hermetic fixtures. No live model.",
	tags: ["qualify", "hermetic"],
	timeoutMs: 30_000,
	async test(t) {
		for (const golden of QUALIFY_GOLDENS) {
			const scored = scoreQualifyGolden(golden);
			t.check(scored.ok, equals(true));
			t.check(scored.failures, equals([]));
		}

		const secret = process.env.AGENT_BRIDGE_SECRET?.trim();
		if (
			!process.env.DATABASE_URL ||
			!secret ||
			(!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN)
		) {
			return;
		}
	},
});
