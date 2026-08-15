export const COST_DAILY_WARN_RATIO = 0.8;

export type DailyCostVerdict = {
	spentUsd: number;
	capUsd: number;
	ratio: number;
	warn: boolean;
	blocked: boolean;
};

export function utcDayStart(now = new Date()): Date {
	return new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
	);
}

export function evaluateDailyCostCap(
	spentUsd: number,
	capUsd: number,
): DailyCostVerdict {
	const spent = Number.isFinite(spentUsd) && spentUsd > 0 ? spentUsd : 0;
	const cap = Number.isFinite(capUsd) && capUsd > 0 ? capUsd : 0;
	const ratio = cap > 0 ? spent / cap : 0;
	return {
		spentUsd: spent,
		capUsd: cap,
		ratio,
		warn: cap > 0 && ratio >= COST_DAILY_WARN_RATIO,
		blocked: cap > 0 && spent >= cap,
	};
}
