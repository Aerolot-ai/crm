const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;

export const AGENT_DISPATCH = {
	poke: { timeoutMs: 2 * SECOND_MS },
	heartbeat: { everyMs: MINUTE_MS },
	cancel: {
		errorCode: "CANCELLED_BY_USER",
		message: "A workspace member stopped this run.",
		redeliverWithinMs: 10 * MINUTE_MS,
		redeliverBatch: 20,
	},
	runOnRecord: {
		messageMax: 20_000,
		replayMismatch: "That run request has already been used.",
		notLive: "This agent is not live yet.",
	},
} as const;
