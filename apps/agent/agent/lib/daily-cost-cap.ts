import { db } from "@crm/db";
import { readCostDailyUsdCap } from "@crm/db/settings";
import { DISPATCH } from "./dispatch-config";
import {
	evaluateDailyCostCap,
	type DailyCostVerdict,
	utcDayStart,
} from "./daily-cost-math";

export { evaluateDailyCostCap, utcDayStart } from "./daily-cost-math";
export type { DailyCostVerdict } from "./daily-cost-math";

export const COST_DAILY_CAP_CODE = DISPATCH.cost.errorCode;

export async function sumWorkspaceCostUsdSince(since: Date): Promise<number> {
	const agg = await db.agentRun.aggregate({
		_sum: { costUsd: true },
		where: { createdAt: { gte: since } },
	});
	return Number(agg._sum.costUsd ?? 0);
}

export async function assessDailyCostCap(
	now = new Date(),
): Promise<DailyCostVerdict> {
	const capUsd = await readCostDailyUsdCap(db);
	const spentUsd = await sumWorkspaceCostUsdSince(utcDayStart(now));
	const verdict = evaluateDailyCostCap(spentUsd, capUsd);
	if (verdict.warn) {
		console.warn("[agent] daily workspace cost cap warn", {
			spentUsd: verdict.spentUsd,
			capUsd: verdict.capUsd,
			ratio: verdict.ratio,
			blocked: verdict.blocked,
		});
	}
	return verdict;
}
