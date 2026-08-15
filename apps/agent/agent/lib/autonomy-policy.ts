import type { Db } from "@crm/db";
import { SETTINGS_ID } from "@crm/db/settings";
import { z } from "zod";

export const LIFECYCLE_ROLES = [
	"qualify",
	"engage",
	"advance",
	"close",
] as const;

export type LifecycleRole = (typeof LIFECYCLE_ROLES)[number];

function readLifecycleRole(manifest: unknown): LifecycleRole | null {
	if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
		return null;
	}
	const role = (manifest as { lifecycleRole?: unknown }).lifecycleRole;
	return typeof role === "string" &&
		(LIFECYCLE_ROLES as readonly string[]).includes(role)
		? (role as LifecycleRole)
		: null;
}

export const AUTONOMY_MODES = ["observe", "recommend", "limited"] as const;
export type AutonomyMode = (typeof AUTONOMY_MODES)[number];

const switchState = z.enum(["on", "off"]);

export const autonomyPolicySchema = z.object({
	"autonomy.global": z.enum(AUTONOMY_MODES),
	"specialist.qualify": switchState,
	"specialist.engage": switchState,
	"specialist.advance": switchState,
	"specialist.close": switchState,
	external_sends: switchState,
	crm_writes: switchState,
});

export type AutonomyPolicy = z.infer<typeof autonomyPolicySchema>;

export const FAIL_CLOSED_AUTONOMY_POLICY = {
	"autonomy.global": "observe",
	"specialist.qualify": "off",
	"specialist.engage": "off",
	"specialist.advance": "off",
	"specialist.close": "off",
	external_sends: "off",
	crm_writes: "off",
} as const satisfies AutonomyPolicy;

export const DEFAULT_AUTONOMY_POLICY = {
	"autonomy.global": "recommend",
	"specialist.qualify": "on",
	"specialist.engage": "on",
	"specialist.advance": "on",
	"specialist.close": "on",
	external_sends: "off",
	crm_writes: "on",
} as const satisfies AutonomyPolicy;

export const QUALIFY_PHASE0_EVENT = "contact.created";

export function parseAutonomyPolicy(value: unknown): AutonomyPolicy {
	const parsed = autonomyPolicySchema.safeParse(value);
	return parsed.success ? parsed.data : FAIL_CLOSED_AUTONOMY_POLICY;
}

export async function readAutonomyPolicy(db: Db): Promise<AutonomyPolicy> {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { autonomyPolicy: true },
	});
	if (row?.autonomyPolicy == null) return FAIL_CLOSED_AUTONOMY_POLICY;
	return parseAutonomyPolicy(row.autonomyPolicy);
}

export async function writeAutonomyPolicy(
	db: Db,
	policy: AutonomyPolicy,
): Promise<AutonomyPolicy> {
	const autonomyPolicy = autonomyPolicySchema.parse(policy);
	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, autonomyPolicy },
		update: { autonomyPolicy },
	});
	return autonomyPolicy;
}

export function specialistFlag(
	policy: AutonomyPolicy,
	role: LifecycleRole,
): "on" | "off" {
	return policy[`specialist.${role}`];
}

export function canQueueAgentRun(
	policy: AutonomyPolicy,
	manifest: unknown,
): boolean {
	if (policy["autonomy.global"] === "observe") return false;
	const role = readLifecycleRole(manifest);
	if (!role) return true;
	return specialistFlag(policy, role) === "on";
}

export function canStartAgentRun(
	policy: AutonomyPolicy,
	manifest: unknown,
): boolean {
	return canQueueAgentRun(policy, manifest);
}

export function phase0EventTriggerEnabled(
	role: LifecycleRole | null,
	triggerType: string,
	eventName: string | null,
): boolean {
	if (triggerType !== "EVENT") return true;
	return role === "qualify" && eventName === QUALIFY_PHASE0_EVENT;
}

export function eventNameOf(config: unknown): string | null {
	if (!config || typeof config !== "object" || Array.isArray(config)) {
		return null;
	}
	const event = (config as { event?: unknown }).event;
	return typeof event === "string" ? event : null;
}

export async function applyPhase0LifecycleEventTriggers(db: Db): Promise<number> {
	const triggers = await db.agentTrigger.findMany({
		where: { type: "EVENT" },
		select: {
			id: true,
			config: true,
			enabled: true,
			version: { select: { manifest: true } },
		},
	});

	let changed = 0;
	for (const trigger of triggers) {
		const role = readLifecycleRole(trigger.version.manifest);
		if (!role || !(LIFECYCLE_ROLES as readonly string[]).includes(role)) {
			continue;
		}
		const enabled = phase0EventTriggerEnabled(
			role,
			"EVENT",
			eventNameOf(trigger.config),
		);
		if (trigger.enabled === enabled) continue;
		await db.agentTrigger.update({
			where: { id: trigger.id },
			data: { enabled },
		});
		changed += 1;
	}
	return changed;
}
