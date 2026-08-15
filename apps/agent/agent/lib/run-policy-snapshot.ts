import type { Prisma } from "@crm/db";
import { z } from "zod";
import { parseAgentManifest } from "./agent-manifest";
import { LIFECYCLE_ROLES } from "./lifecycle-roles";

export const SELLER_RULES_MISSING = "missing" as const;

export const RUN_POLICY_TRIGGER_TYPES = [
	"MANUAL",
	"SCHEDULE",
	"EVENT",
	"WEBHOOK",
] as const;

export type RunPolicyTriggerType = (typeof RUN_POLICY_TRIGGER_TYPES)[number];

export const runPolicySnapshotSchema = z.object({
	lifecycleRole: z.enum(LIFECYCLE_ROLES).nullable(),
	agentVersionId: z.string().trim().min(1),
	actionAllowlist: z.array(z.string().trim().min(1)).min(1),
	triggerType: z.enum(RUN_POLICY_TRIGGER_TYPES),
	sellerRulesVersion: z.string().trim().min(1),
	autonomy: z.record(z.string(), z.boolean()).optional(),
});

export type RunPolicySnapshot = z.infer<typeof runPolicySnapshotSchema>;

export function buildRunPolicySnapshot(input: {
	agentVersionId: string;
	manifest: unknown;
	triggerType: RunPolicyTriggerType;
	sellerRulesVersion?: string | null;
	autonomy?: Record<string, boolean> | null;
}): RunPolicySnapshot {
	const manifest = parseAgentManifest(input.manifest);
	const sellerRulesVersion =
		input.sellerRulesVersion && input.sellerRulesVersion.trim().length > 0
			? input.sellerRulesVersion.trim()
			: SELLER_RULES_MISSING;
	const autonomy =
		input.autonomy && Object.keys(input.autonomy).length > 0
			? input.autonomy
			: undefined;

	return runPolicySnapshotSchema.parse({
		lifecycleRole: manifest.lifecycleRole ?? null,
		agentVersionId: input.agentVersionId,
		actionAllowlist: manifest.actions.map((action) => action.type),
		triggerType: input.triggerType,
		sellerRulesVersion,
		...(autonomy ? { autonomy } : {}),
	});
}

export function readSellerRulesVersion(): typeof SELLER_RULES_MISSING | string {
	return SELLER_RULES_MISSING;
}

export function readAutonomyFlags(): Record<string, boolean> | undefined {
	return undefined;
}

export function inputHasPolicy(input: unknown): boolean {
	if (!input || typeof input !== "object" || Array.isArray(input)) return false;
	return "policy" in input && (input as { policy?: unknown }).policy != null;
}

export function mergeRunInputWithPolicy(
	input: Record<string, unknown>,
	policy: RunPolicySnapshot,
): Prisma.InputJsonValue {
	return { ...input, policy } as Prisma.InputJsonValue;
}
