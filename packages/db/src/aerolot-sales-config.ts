import { CLOSED_DEAL_STAGES, OPEN_DEAL_STAGES } from "./deal-stage";
import type { FieldTypeName } from "./fields-shape";
import { DealStage } from "./generated/prisma/enums";
import type { WorkspaceProfileSections } from "./json";

export const AEROLOT_SALES_WORKSPACE = {
	name: "Aerolot Sales",
	website: "https://www.aerolot.ai",
	slug: "aerolot-sales",
	narrative:
		"Aerolot sells dealership software to independent used-car dealers and multi-lot groups. This CRM tracks the SaaS sales pipeline only — Company, Contact, and Deal — not lot inventory or BDC recon.",
	sections: {
		sells:
			"Dealership SaaS (CRM, voice, ops tools) sold as subscription software",
		sellsTo:
			"Independent used-car dealers and multi-lot groups (owners and small teams)",
		edge: "Bolt-on software for dealers that do not need CDK/Reynolds-class stacks",
	} satisfies WorkspaceProfileSections,
} as const;

export const AEROLOT_PLAN_TIERS = [
	"Growth",
	"Professional",
	"Enterprise",
] as const;

export type AerolotPlanTier = (typeof AEROLOT_PLAN_TIERS)[number];

export const AEROLOT_PROVISION_STATUSES = [
	"pending",
	"provisioned",
	"failed",
	"skipped",
] as const;

export type AerolotProvisionStatus =
	(typeof AEROLOT_PROVISION_STATUSES)[number];

export const AEROLOT_US_TIMEZONES = [
	"America/New_York",
	"America/Chicago",
	"America/Denver",
	"America/Phoenix",
	"America/Los_Angeles",
	"America/Anchorage",
	"Pacific/Honolulu",
	"America/Puerto_Rico",
] as const;

export const AEROLOT_ICP_SEGMENTS = [
	"Independent used-car",
	"Multi-lot group",
	"Out of ICP",
] as const;

export const AEROLOT_SAAS_OPEN_STAGES = OPEN_DEAL_STAGES;

export const AEROLOT_SAAS_CLOSED_STAGES = CLOSED_DEAL_STAGES;

export const AEROLOT_SAAS_STAGE_ORDER = [
	DealStage.DEMO_BOOKED,
	DealStage.QUALIFIED_TO_BUY,
	DealStage.DECISION_MAKER_BOUGHT_IN,
	DealStage.CONTRACT_SENT,
	DealStage.CLOSED_WON,
	DealStage.CLOSED_LOST,
	DealStage.UNQUALIFIED_TO_BUY,
] as const;

export type AerolotSalesFieldSpec = {
	entity: "COMPANY" | "CONTACT" | "DEAL";
	key: string;
	label: string;
	type: FieldTypeName;
	required: boolean;
	showOnSheet: boolean;
	showOnTable: boolean;
	agentFilled: boolean;
	agentBrief: string | null;
	options?: readonly string[];
	provisionInput: boolean;
	provisionWriteback: boolean;
};

export const AEROLOT_COMPANY_FIELDS: readonly AerolotSalesFieldSpec[] = [
	{
		entity: "COMPANY",
		key: "street_address",
		label: "Street address",
		type: "TEXT",
		required: false,
		showOnSheet: true,
		showOnTable: false,
		agentFilled: false,
		agentBrief:
			"Physical street line for the rooftop. Required before dealer provision.",
		provisionInput: true,
		provisionWriteback: false,
	},
	{
		entity: "COMPANY",
		key: "zip",
		label: "ZIP",
		type: "TEXT",
		required: false,
		showOnSheet: true,
		showOnTable: false,
		agentFilled: false,
		agentBrief:
			"US ZIP or postal code for the rooftop. Required before dealer provision.",
		provisionInput: true,
		provisionWriteback: false,
	},
	{
		entity: "COMPANY",
		key: "timezone",
		label: "Timezone",
		type: "SELECT",
		required: false,
		showOnSheet: true,
		showOnTable: true,
		agentFilled: false,
		agentBrief:
			"IANA timezone for the dealer. Required before dealer provision.",
		options: AEROLOT_US_TIMEZONES,
		provisionInput: true,
		provisionWriteback: false,
	},
	{
		entity: "COMPANY",
		key: "plan_tier",
		label: "Plan tier",
		type: "SELECT",
		required: false,
		showOnSheet: true,
		showOnTable: true,
		agentFilled: false,
		agentBrief:
			"Growth, Professional, or Enterprise interest. Required before dealer provision.",
		options: AEROLOT_PLAN_TIERS,
		provisionInput: true,
		provisionWriteback: false,
	},
	{
		entity: "COMPANY",
		key: "dealer_slug",
		label: "Dealer slug",
		type: "TEXT",
		required: false,
		showOnSheet: true,
		showOnTable: false,
		agentFilled: false,
		agentBrief: "Optional URL slug for the dealer portal once provisioned.",
		provisionInput: true,
		provisionWriteback: false,
	},
	{
		entity: "COMPANY",
		key: "rooftop_count",
		label: "Rooftop count",
		type: "NUMBER",
		required: false,
		showOnSheet: true,
		showOnTable: true,
		agentFilled: true,
		agentBrief: "Number of physical lots or rooftops in the dealer group.",
		provisionInput: false,
		provisionWriteback: false,
	},
	{
		entity: "COMPANY",
		key: "current_dms_or_crm",
		label: "Current DMS or CRM",
		type: "TEXT",
		required: false,
		showOnSheet: true,
		showOnTable: false,
		agentFilled: true,
		agentBrief:
			"What the dealer runs today for DMS or CRM (not inventory data).",
		provisionInput: false,
		provisionWriteback: false,
	},
	{
		entity: "COMPANY",
		key: "icp_segment",
		label: "ICP segment",
		type: "SELECT",
		required: false,
		showOnSheet: true,
		showOnTable: true,
		agentFilled: true,
		agentBrief:
			"Independent used-car or multi-lot group fits ICP. Mark Out of ICP for mega franchise stacks.",
		options: AEROLOT_ICP_SEGMENTS,
		provisionInput: false,
		provisionWriteback: false,
	},
	{
		entity: "COMPANY",
		key: "aerolot_dealer_id",
		label: "Aerolot dealer id",
		type: "TEXT",
		required: false,
		showOnSheet: true,
		showOnTable: true,
		agentFilled: false,
		agentBrief: "Write-back id from Aerolot dealer provision. Do not invent.",
		provisionInput: false,
		provisionWriteback: true,
	},
	{
		entity: "COMPANY",
		key: "aerolot_provision_status",
		label: "Aerolot provision status",
		type: "SELECT",
		required: false,
		showOnSheet: true,
		showOnTable: true,
		agentFilled: false,
		agentBrief:
			"pending, provisioned, failed, or skipped after a provision attempt.",
		options: AEROLOT_PROVISION_STATUSES,
		provisionInput: false,
		provisionWriteback: true,
	},
	{
		entity: "COMPANY",
		key: "aerolot_provision_error",
		label: "Aerolot provision error",
		type: "LONG_TEXT",
		required: false,
		showOnSheet: true,
		showOnTable: false,
		agentFilled: false,
		agentBrief: "Last provision failure message when status is failed.",
		provisionInput: false,
		provisionWriteback: true,
	},
	{
		entity: "COMPANY",
		key: "aerolot_portal_url",
		label: "Aerolot portal URL",
		type: "URL",
		required: false,
		showOnSheet: true,
		showOnTable: false,
		agentFilled: false,
		agentBrief: "Dealer portal URL returned after successful provision.",
		provisionInput: false,
		provisionWriteback: true,
	},
	{
		entity: "COMPANY",
		key: "aerolot_provisioned_at",
		label: "Aerolot provisioned at",
		type: "DATE",
		required: false,
		showOnSheet: true,
		showOnTable: false,
		agentFilled: false,
		agentBrief: "Date of last successful provision write-back.",
		provisionInput: false,
		provisionWriteback: true,
	},
	{
		entity: "COMPANY",
		key: "aerolot_provision_source",
		label: "Aerolot provision source",
		type: "TEXT",
		required: false,
		showOnSheet: true,
		showOnTable: false,
		agentFilled: false,
		agentBrief:
			"Which path wrote the provision result (for example aisales-company).",
		provisionInput: false,
		provisionWriteback: true,
	},
] as const;

export const AEROLOT_CONTACT_FIELDS: readonly AerolotSalesFieldSpec[] = [
	{
		entity: "CONTACT",
		key: "buying_role",
		label: "Buying role",
		type: "SELECT",
		required: false,
		showOnSheet: true,
		showOnTable: true,
		agentFilled: true,
		agentBrief: "Owner, GM, Controller, or Ops lead at the dealership.",
		options: ["Owner", "GM", "Controller", "Ops", "Other"],
		provisionInput: false,
		provisionWriteback: false,
	},
] as const;

export const AEROLOT_DEAL_FIELDS: readonly AerolotSalesFieldSpec[] = [
	{
		entity: "DEAL",
		key: "primary_module",
		label: "Primary module",
		type: "SELECT",
		required: false,
		showOnSheet: true,
		showOnTable: true,
		agentFilled: true,
		agentBrief:
			"Main Aerolot product surface in this SaaS deal (not lot inventory).",
		options: ["Website", "CRM", "Voice", "Inventory tools", "Full suite"],
		provisionInput: false,
		provisionWriteback: false,
	},
] as const;

export const AEROLOT_SALES_FIELDS: readonly AerolotSalesFieldSpec[] = [
	...AEROLOT_COMPANY_FIELDS,
	...AEROLOT_CONTACT_FIELDS,
	...AEROLOT_DEAL_FIELDS,
];

export const AEROLOT_PROVISION_COMPANY_FIELD_KEYS =
	AEROLOT_COMPANY_FIELDS.filter((field) => field.provisionInput).map(
		(field) => field.key,
	);

export const AEROLOT_PROVISION_WRITEBACK_FIELD_KEYS =
	AEROLOT_COMPANY_FIELDS.filter((field) => field.provisionWriteback).map(
		(field) => field.key,
	);

export const AEROLOT_PROVISION_STANDARD_COMPANY_COLUMNS = [
	"name",
	"city",
	"stateCode",
	"phone",
	"website",
] as const;

export const AEROLOT_PROVISION_STANDARD_CONTACT_COLUMNS = [
	"firstName",
	"lastName",
	"email",
	"phone",
] as const;

export type AerolotSeedDealer = {
	name: string;
	domain: string;
	city: string;
	stateCode: string;
	country: string;
	countryCode: string;
	industry: string;
	street: string;
	zip: string;
	timezone: (typeof AEROLOT_US_TIMEZONES)[number];
	planTier: AerolotPlanTier;
	icpSegment: (typeof AEROLOT_ICP_SEGMENTS)[number];
	rooftopCount: number;
	currentStack: string;
	owner: {
		firstName: string;
		lastName: string;
		emailLocal: string;
		title: string;
		phone: string;
		buyingRole: string;
	};
};

export const AEROLOT_SEED_DEALERS: readonly AerolotSeedDealer[] = [
	{
		name: "Suncoast Motors",
		domain: "suncoastmotors.example",
		city: "Tampa",
		stateCode: "FL",
		country: "United States",
		countryCode: "US",
		industry: "Used car dealer",
		street: "4201 N Florida Ave",
		zip: "33603",
		timezone: "America/New_York",
		planTier: "Growth",
		icpSegment: "Independent used-car",
		rooftopCount: 1,
		currentStack: "DealerSocket lite + spreadsheets",
		owner: {
			firstName: "Luis",
			lastName: "Herrera",
			emailLocal: "luis.herrera",
			title: "Owner",
			phone: "+18135550142",
			buyingRole: "Owner",
		},
	},
	{
		name: "Heartland Auto Group",
		domain: "heartlandautogroup.example",
		city: "Oklahoma City",
		stateCode: "OK",
		country: "United States",
		countryCode: "US",
		industry: "Multi-lot used car group",
		street: "8800 S I-35 Service Rd",
		zip: "73149",
		timezone: "America/Chicago",
		planTier: "Professional",
		icpSegment: "Multi-lot group",
		rooftopCount: 4,
		currentStack: "vAuto + home-grown CRM",
		owner: {
			firstName: "Dana",
			lastName: "Whitfield",
			emailLocal: "dana.whitfield",
			title: "Group GM",
			phone: "+14055550188",
			buyingRole: "GM",
		},
	},
	{
		name: "Rio Grande Motors",
		domain: "riograndemotors.example",
		city: "El Paso",
		stateCode: "TX",
		country: "United States",
		countryCode: "US",
		industry: "Used car dealer",
		street: "6120 Gateway Blvd E",
		zip: "79905",
		timezone: "America/Denver",
		planTier: "Growth",
		icpSegment: "Independent used-car",
		rooftopCount: 2,
		currentStack: "CDK Light residual + paper deals",
		owner: {
			firstName: "Marisol",
			lastName: "Reyes",
			emailLocal: "marisol.reyes",
			title: "Owner-operator",
			phone: "+19155550127",
			buyingRole: "Owner",
		},
	},
	{
		name: "Pacific Lot Partners",
		domain: "pacificlotpartners.example",
		city: "Fresno",
		stateCode: "CA",
		country: "United States",
		countryCode: "US",
		industry: "Multi-lot used car group",
		street: "2550 S East Ave",
		zip: "93706",
		timezone: "America/Los_Angeles",
		planTier: "Enterprise",
		icpSegment: "Multi-lot group",
		rooftopCount: 6,
		currentStack: "Reynolds partial + Google Sheets",
		owner: {
			firstName: "Ken",
			lastName: "Park",
			emailLocal: "ken.park",
			title: "Managing partner",
			phone: "+15595550163",
			buyingRole: "Owner",
		},
	},
	{
		name: "Blue Ridge BHPH",
		domain: "blueridgebhph.example",
		city: "Asheville",
		stateCode: "NC",
		country: "United States",
		countryCode: "US",
		industry: "BHPH used car dealer",
		street: "910 Patton Ave",
		zip: "28806",
		timezone: "America/New_York",
		planTier: "Professional",
		icpSegment: "Independent used-car",
		rooftopCount: 1,
		currentStack: "RouteOne + texting app",
		owner: {
			firstName: "Ashley",
			lastName: "Coleman",
			emailLocal: "ashley.coleman",
			title: "Owner",
			phone: "+18285550194",
			buyingRole: "Owner",
		},
	},
] as const;

export function aerolotFieldByKey(
	key: string,
	entity: AerolotSalesFieldSpec["entity"] = "COMPANY",
): AerolotSalesFieldSpec | undefined {
	return AEROLOT_SALES_FIELDS.find(
		(field) => field.entity === entity && field.key === key,
	);
}

export function isAerolotSaasOpenStage(stage: DealStage): boolean {
	return (AEROLOT_SAAS_OPEN_STAGES as readonly DealStage[]).includes(stage);
}

export function isOutOfIcpSegment(segment: string | null | undefined): boolean {
	return segment === "Out of ICP";
}
