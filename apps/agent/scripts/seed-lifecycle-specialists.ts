/**
 * Seed and Deploy the four lifecycle specialists (qualify/engage/advance/close).
 * Idempotent: skips when a LIVE agent already has that lifecycleRole.
 *
 * Usage (with DATABASE_URL):
 *   bun run --filter=agent seed:lifecycle
 */
import { db } from "@crm/db";
import { DEFAULT_AGENT_MODEL } from "@crm/db/settings";
import { readLifecycleRole } from "@crm/validation";
import {
	ADVANCE_SPECIALIST_INSTRUCTIONS,
	advanceSpecialistManifest,
} from "../agent/lib/lifecycle-advance";
import {
	CLOSE_SPECIALIST_INSTRUCTIONS,
	closeSpecialistManifest,
} from "../agent/lib/lifecycle-close";
import {
	ENGAGE_SPECIALIST_INSTRUCTIONS,
	engageSpecialistManifest,
} from "../agent/lib/lifecycle-engage";
import {
	QUALIFY_SPECIALIST_INSTRUCTIONS,
	qualifySpecialistManifest,
} from "../agent/lib/lifecycle-qualify";

const SPECIALISTS = [
	{
		instructions: QUALIFY_SPECIALIST_INSTRUCTIONS,
		manifest: () => qualifySpecialistManifest({ recordScope: "WORKSPACE" }),
	},
	{
		instructions: ENGAGE_SPECIALIST_INSTRUCTIONS,
		// Workspace seed so Deploy works without pre-selected records.
		manifest: () => engageSpecialistManifest({ recordScope: "WORKSPACE" }),
	},
	{
		instructions: ADVANCE_SPECIALIST_INSTRUCTIONS,
		manifest: () => advanceSpecialistManifest({ recordScope: "WORKSPACE" }),
	},
	{
		instructions: CLOSE_SPECIALIST_INSTRUCTIONS,
		manifest: () => closeSpecialistManifest({ recordScope: "WORKSPACE" }),
	},
] as const;

async function main() {
	const owner = await db.user.findFirst({
		orderBy: { createdAt: "asc" },
		select: { id: true, email: true },
	});
	if (!owner) {
		console.error("No user in database. Sign in once before seeding.");
		process.exit(1);
	}

	const settings = await db.appSetting.findUnique({
		where: { id: "app" },
		select: { agentModelId: true, agentModelContextWindow: true },
	});

	const modelId = settings?.agentModelId ?? DEFAULT_AGENT_MODEL.id;
	const modelContextWindowTokens =
		settings?.agentModelContextWindow ?? DEFAULT_AGENT_MODEL.contextWindowTokens;

	await db.appSetting.upsert({
		where: { id: "app" },
		create: {
			id: "app",
			agentModelId: modelId,
			agentModelContextWindow: modelContextWindowTokens,
		},
		update: {
			agentModelId: modelId,
			agentModelContextWindow: modelContextWindowTokens,
		},
	});

	for (const specialist of SPECIALISTS) {
		const manifest = specialist.manifest();
		const role = readLifecycleRole(manifest);
		if (!role) {
			console.error(`Manifest missing lifecycleRole: ${manifest.name}`);
			continue;
		}

		const existing = await db.agentDefinition.findMany({
			where: { status: { notIn: ["ARCHIVED", "DELETED"] } },
			select: {
				id: true,
				name: true,
				status: true,
				currentVersion: { select: { manifest: true } },
			},
		});
		const already = existing.find(
			(row) => readLifecycleRole(row.currentVersion?.manifest) === role,
		);
		if (already) {
			console.log(
				`skip  ${role} already present as ${already.name} (${already.id})`,
			);
			continue;
		}

		const agent = await db.agentDefinition.create({
			data: {
				name: manifest.name,
				description: manifest.description,
				status: "LIVE",
				createdById: owner.id,
			},
			select: { id: true },
		});

		const version = await db.agentVersion.create({
			data: {
				agentId: agent.id,
				number: 1,
				status: "DEPLOYED",
				instructions: specialist.instructions,
				modelId,
				modelContextWindowTokens,
				sandboxPolicy: {},
				createdById: owner.id,
				manifest: manifest as object,
				deployedAt: new Date(),
				approvedAt: new Date(),
			},
			select: { id: true },
		});

		await db.agentDefinition.update({
			where: { id: agent.id },
			data: { currentVersionId: version.id },
		});

		const triggers = Array.isArray(manifest.triggers) ? manifest.triggers : [];
		for (const trigger of triggers) {
			await db.agentTrigger.create({
				data: {
					agentId: agent.id,
					versionId: version.id,
					type: trigger.type,
					name: trigger.name,
					config: (trigger.config ?? {}) as object,
					enabled: true,
					createdById: owner.id,
				},
			});
		}

		await db.agentAuditEvent.create({
			data: {
				agentId: agent.id,
				versionId: version.id,
				actorUserId: owner.id,
				actorType: "USER",
				actorId: owner.id,
				type: "agent.deployed",
				summary: `Seeded and Deployed ${role} specialist`,
				requestId: crypto.randomUUID(),
			},
		});

		console.log(`seed  ${role} → ${agent.id} version ${version.id}`);
	}

	console.log("done");
}

main()
	.catch((error) => {
		console.error(error);
		process.exit(1);
	})
	.finally(async () => {
		await db.$disconnect();
	});
