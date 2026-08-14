import {
	AEROLOT_SALES_FIELDS,
	AEROLOT_SALES_WORKSPACE,
	AEROLOT_SEED_DEALERS,
	type AerolotSalesFieldSpec,
} from "../src/aerolot-sales-config";
import { db } from "../src/client";
import { DEFAULT_REPORTING_CURRENCY } from "../src/currency";
import { usesOptions } from "../src/fields-shape";
import { DealStage } from "../src/generated/prisma/enums";
import { SETTINGS_ID } from "../src/settings";
import { WORKSPACE_ID, writeWorkspaceProfile } from "../src/workspace";

const OPEN_STAGES = [
	DealStage.DEMO_BOOKED,
	DealStage.QUALIFIED_TO_BUY,
	DealStage.DECISION_MAKER_BOUGHT_IN,
	DealStage.CONTRACT_SENT,
] as const;

async function ensureReportingCurrency(): Promise<void> {
	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: {
			id: SETTINGS_ID,
			reportingCurrency: DEFAULT_REPORTING_CURRENCY,
		},
		update: {},
	});
}

async function ensureWorkspace(): Promise<void> {
	const now = new Date();
	const existing = await db.organization.findUnique({
		where: { id: WORKSPACE_ID },
		select: { id: true, slug: true },
	});

	if (!existing) {
		await db.organization.create({
			data: {
				id: WORKSPACE_ID,
				name: AEROLOT_SALES_WORKSPACE.name,
				slug: AEROLOT_SALES_WORKSPACE.slug,
				website: AEROLOT_SALES_WORKSPACE.website,
				createdAt: now,
				metadata: JSON.stringify({ onboardedAt: now.toISOString() }),
			},
		});
	} else {
		await db.organization.update({
			where: { id: WORKSPACE_ID },
			data: {
				name: AEROLOT_SALES_WORKSPACE.name,
				website: AEROLOT_SALES_WORKSPACE.website,
			},
		});
	}

	await writeWorkspaceProfile(db, {
		website: AEROLOT_SALES_WORKSPACE.website,
		narrative: AEROLOT_SALES_WORKSPACE.narrative,
		sections: AEROLOT_SALES_WORKSPACE.sections,
		sourceUrl: AEROLOT_SALES_WORKSPACE.website,
	});
}

async function ensureField(
	spec: AerolotSalesFieldSpec,
	position: number,
): Promise<{ id: string; optionIds: Map<string, string> }> {
	const existing = await db.fieldDefinition.findUnique({
		where: { entity_key: { entity: spec.entity, key: spec.key } },
		include: { options: true },
	});

	if (!existing) {
		const created = await db.fieldDefinition.create({
			data: {
				entity: spec.entity,
				key: spec.key,
				label: spec.label,
				type: spec.type,
				agentFilled: spec.agentFilled,
				agentBrief: spec.agentBrief,
				required: spec.required,
				showOnSheet: spec.showOnSheet,
				showOnTable: spec.showOnTable,
				position,
				options:
					usesOptions(spec.type) && spec.options
						? {
								create: spec.options.map((label, index) => ({
									label,
									position: index,
								})),
							}
						: undefined,
			},
			include: { options: true },
		});

		return {
			id: created.id,
			optionIds: new Map(
				created.options.map((option) => [option.label, option.id]),
			),
		};
	}

	await db.fieldDefinition.update({
		where: { id: existing.id },
		data: {
			label: spec.label,
			type: existing.options.some((row) => row.archivedAt === null)
				? existing.type
				: spec.type,
			agentFilled: spec.agentFilled,
			agentBrief: spec.agentBrief,
			required: spec.required,
			showOnSheet: spec.showOnSheet,
			showOnTable: spec.showOnTable,
			archivedAt: null,
		},
	});

	const optionIds = new Map<string, string>();

	if (usesOptions(spec.type) && spec.options) {
		for (const [index, label] of spec.options.entries()) {
			const match = existing.options.find((option) => option.label === label);
			if (match) {
				if (match.archivedAt !== null || match.position !== index) {
					await db.fieldOption.update({
						where: { id: match.id },
						data: { archivedAt: null, position: index },
					});
				}
				optionIds.set(label, match.id);
				continue;
			}

			const created = await db.fieldOption.create({
				data: {
					fieldId: existing.id,
					label,
					position: index,
				},
			});
			optionIds.set(label, created.id);
		}
	}

	return { id: existing.id, optionIds };
}

async function ensureFields(): Promise<
	Map<string, { id: string; optionIds: Map<string, string> }>
> {
	const byKey = new Map<
		string,
		{ id: string; optionIds: Map<string, string> }
	>();

	for (const [index, spec] of AEROLOT_SALES_FIELDS.entries()) {
		const ensured = await ensureField(spec, index);
		byKey.set(`${spec.entity}:${spec.key}`, ensured);
	}

	return byKey;
}

async function seedOwners(): Promise<string[]> {
	const existing = await db.user.findMany({ select: { id: true }, take: 5 });
	if (existing.length > 0) return existing.map((user) => user.id);

	const owner = await db.user.create({
		data: {
			id: "seed-aerolot-sales-rep",
			name: "Aerolot Sales",
			email: "sales@aerolot.ai",
			emailVerified: true,
			updatedAt: new Date(),
		},
		select: { id: true },
	});

	return [owner.id];
}

async function setCompanyField(
	fields: Map<string, { id: string; optionIds: Map<string, string> }>,
	companyId: string,
	key: string,
	value: string | number,
): Promise<void> {
	const field = fields.get(`COMPANY:${key}`);
	if (!field) return;

	const spec = AEROLOT_SALES_FIELDS.find(
		(row) => row.entity === "COMPANY" && row.key === key,
	);
	if (!spec) return;

	const data =
		spec.type === "SELECT"
			? {
					optionId:
						field.optionIds.get(String(value)) ??
						(() => {
							throw new Error(`Missing option ${value} for ${key}`);
						})(),
					text: null,
					number: null,
					date: null,
					bool: null,
					userId: null,
				}
			: spec.type === "NUMBER"
				? {
						number: value,
						text: null,
						optionId: null,
						date: null,
						bool: null,
						userId: null,
					}
				: {
						text: String(value),
						number: null,
						optionId: null,
						date: null,
						bool: null,
						userId: null,
					};

	const existing = await db.fieldValue.findUnique({
		where: { fieldId_companyId: { fieldId: field.id, companyId } },
		select: { id: true },
	});

	if (existing) {
		await db.fieldValue.update({ where: { id: existing.id }, data });
		return;
	}

	await db.fieldValue.create({
		data: {
			fieldId: field.id,
			companyId,
			...data,
		},
	});
}

async function setContactField(
	fields: Map<string, { id: string; optionIds: Map<string, string> }>,
	contactId: string,
	key: string,
	label: string,
): Promise<void> {
	const field = fields.get(`CONTACT:${key}`);
	if (!field) return;

	const optionId = field.optionIds.get(label);
	if (!optionId) return;

	const existing = await db.fieldValue.findUnique({
		where: { fieldId_contactId: { fieldId: field.id, contactId } },
		select: { id: true },
	});

	if (existing) {
		await db.fieldValue.update({
			where: { id: existing.id },
			data: { optionId },
		});
		return;
	}

	await db.fieldValue.create({
		data: {
			fieldId: field.id,
			contactId,
			optionId,
		},
	});
}

async function seedDealers(
	ownerIds: string[],
	fields: Map<string, { id: string; optionIds: Map<string, string> }>,
): Promise<number> {
	let deals = 0;

	for (const [index, dealer] of AEROLOT_SEED_DEALERS.entries()) {
		const ownerId = ownerIds[index % ownerIds.length] ?? ownerIds[0];
		if (!ownerId) throw new Error("No owner id for seed");

		const company = await db.company.upsert({
			where: { domain: dealer.domain },
			create: {
				name: dealer.name,
				domain: dealer.domain,
				website: `https://${dealer.domain}`,
				industry: dealer.industry,
				city: dealer.city,
				stateCode: dealer.stateCode,
				country: dealer.country,
				countryCode: dealer.countryCode,
				phone: dealer.owner.phone,
				ownerId,
			},
			update: {
				name: dealer.name,
				industry: dealer.industry,
				city: dealer.city,
				stateCode: dealer.stateCode,
				country: dealer.country,
				countryCode: dealer.countryCode,
				phone: dealer.owner.phone,
			},
			select: { id: true },
		});

		const email = `${dealer.owner.emailLocal}@${dealer.domain}`;
		const contact = await db.contact.upsert({
			where: { email },
			create: {
				firstName: dealer.owner.firstName,
				lastName: dealer.owner.lastName,
				email,
				title: dealer.owner.title,
				phone: dealer.owner.phone,
				companyId: company.id,
				ownerId,
			},
			update: {
				firstName: dealer.owner.firstName,
				lastName: dealer.owner.lastName,
				title: dealer.owner.title,
				phone: dealer.owner.phone,
				companyId: company.id,
			},
			select: { id: true },
		});

		await db.company.update({
			where: { id: company.id },
			data: { primaryContactId: contact.id },
		});

		await setCompanyField(fields, company.id, "street_address", dealer.street);
		await setCompanyField(fields, company.id, "zip", dealer.zip);
		await setCompanyField(fields, company.id, "timezone", dealer.timezone);
		await setCompanyField(fields, company.id, "plan_tier", dealer.planTier);
		await setCompanyField(fields, company.id, "icp_segment", dealer.icpSegment);
		await setCompanyField(
			fields,
			company.id,
			"rooftop_count",
			dealer.rooftopCount,
		);
		await setCompanyField(
			fields,
			company.id,
			"current_dms_or_crm",
			dealer.currentStack,
		);
		await setContactField(
			fields,
			contact.id,
			"buying_role",
			dealer.owner.buyingRole,
		);

		const dealId = `seed-aerolot-${dealer.domain.replace(/\./g, "-")}`;
		const stage =
			OPEN_STAGES[index % OPEN_STAGES.length] ?? DealStage.DEMO_BOOKED;
		const amount = 12_000 + index * 6_000;

		await db.deal.upsert({
			where: { id: dealId },
			create: {
				id: dealId,
				name: `${dealer.name} — Aerolot SaaS`,
				description:
					"Subscription software sale to a dealership account. Not an inventory or recon deal.",
				companyId: company.id,
				ownerId,
				stage,
				stageChangedAt: new Date(),
				amount,
				currency: "USD",
				baseAmount: amount,
				baseCurrency: "USD",
				fxRate: 1,
				fxRateAt: new Date(),
				expectedCloseDate: new Date(Date.now() + (14 + index * 7) * 86_400_000),
			},
			update: {
				name: `${dealer.name} — Aerolot SaaS`,
				stage,
			},
		});

		await db.dealContact.upsert({
			where: {
				dealId_contactId: { dealId, contactId: contact.id },
			},
			create: {
				dealId,
				contactId: contact.id,
				role: dealer.owner.buyingRole,
			},
			update: { role: dealer.owner.buyingRole },
		});

		const moduleField = fields.get("DEAL:primary_module");
		if (moduleField) {
			const optionId =
				moduleField.optionIds.get("CRM") ??
				moduleField.optionIds.values().next().value;
			if (optionId) {
				const existing = await db.fieldValue.findUnique({
					where: { fieldId_dealId: { fieldId: moduleField.id, dealId } },
					select: { id: true },
				});
				if (existing) {
					await db.fieldValue.update({
						where: { id: existing.id },
						data: { optionId },
					});
				} else {
					await db.fieldValue.create({
						data: {
							fieldId: moduleField.id,
							dealId,
							optionId,
						},
					});
				}
			}
		}

		deals += 1;
	}

	return deals;
}

async function main() {
	await ensureReportingCurrency();
	await ensureWorkspace();
	const fields = await ensureFields();
	const ownerIds = await seedOwners();
	const deals = await seedDealers(ownerIds, fields);

	console.log(
		`Aerolot sales seed: ${AEROLOT_SALES_FIELDS.length} field definitions, ` +
			`${AEROLOT_SEED_DEALERS.length} dealer companies, ${deals} SaaS deals, ` +
			`workspace "${AEROLOT_SALES_WORKSPACE.name}".`,
	);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await db.$disconnect();
	});
