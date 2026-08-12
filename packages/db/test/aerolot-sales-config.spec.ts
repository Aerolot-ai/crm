import { describe, expect, it } from "bun:test";
import {
	AEROLOT_COMPANY_FIELDS,
	AEROLOT_CONTACT_FIELDS,
	AEROLOT_DEAL_FIELDS,
	AEROLOT_ICP_SEGMENTS,
	AEROLOT_PLAN_TIERS,
	AEROLOT_PROVISION_COMPANY_FIELD_KEYS,
	AEROLOT_PROVISION_STANDARD_COMPANY_COLUMNS,
	AEROLOT_PROVISION_STANDARD_CONTACT_COLUMNS,
	AEROLOT_PROVISION_STATUSES,
	AEROLOT_PROVISION_WRITEBACK_FIELD_KEYS,
	AEROLOT_SAAS_OPEN_STAGES,
	AEROLOT_SAAS_STAGE_ORDER,
	AEROLOT_SALES_FIELDS,
	AEROLOT_SALES_WORKSPACE,
	AEROLOT_SEED_DEALERS,
	AEROLOT_US_TIMEZONES,
	aerolotFieldByKey,
	isAerolotSaasOpenStage,
	isOutOfIcpSegment,
} from "../src/aerolot-sales-config";
import { OPEN_DEAL_STAGES } from "../src/deal-stage";
import { fieldKeyFromLabel } from "../src/fields-shape";
import { DealStage } from "../src/generated/prisma/enums";
import { MAX_LINE, MAX_NARRATIVE } from "../src/workspace";

describe("Aerolot sales workspace shape", () => {
	it("describes SaaS sold to dealerships, not inventory CRM", () => {
		expect(AEROLOT_SALES_WORKSPACE.name).toBe("Aerolot Sales");
		expect(AEROLOT_SALES_WORKSPACE.website).toContain("aerolot.ai");
		expect(AEROLOT_SALES_WORKSPACE.narrative.length).toBeLessThanOrEqual(
			MAX_NARRATIVE,
		);
		expect(AEROLOT_SALES_WORKSPACE.sections.sells?.length).toBeLessThanOrEqual(
			MAX_LINE,
		);
		expect(AEROLOT_SALES_WORKSPACE.sections.sellsTo).toMatch(/used-car/i);
		expect(AEROLOT_SALES_WORKSPACE.narrative).toMatch(
			/Company, Contact, and Deal/,
		);
		expect(AEROLOT_SALES_WORKSPACE.narrative).not.toMatch(/Lead entity/i);
		expect(AEROLOT_SALES_WORKSPACE.narrative.toLowerCase()).toContain(
			"not lot inventory",
		);
	});
});

describe("Aerolot SaaS pipeline stages", () => {
	it("uses the fixed product open stages", () => {
		expect([...AEROLOT_SAAS_OPEN_STAGES]).toEqual([...OPEN_DEAL_STAGES]);
		expect(AEROLOT_SAAS_STAGE_ORDER.slice(0, 4)).toEqual([
			DealStage.DEMO_BOOKED,
			DealStage.QUALIFIED_TO_BUY,
			DealStage.DECISION_MAKER_BOUGHT_IN,
			DealStage.CONTRACT_SENT,
		]);
		expect(isAerolotSaasOpenStage(DealStage.DEMO_BOOKED)).toBe(true);
		expect(isAerolotSaasOpenStage(DealStage.CLOSED_WON)).toBe(false);
	});
});

describe("Aerolot company fields for provision readiness", () => {
	it("uses stable keys that match label slugs", () => {
		for (const field of AEROLOT_SALES_FIELDS) {
			expect(field.key).toBe(fieldKeyFromLabel(field.label));
		}
	});

	it("covers provision inputs and write-backs on Company only", () => {
		expect(AEROLOT_PROVISION_COMPANY_FIELD_KEYS).toEqual([
			"street_address",
			"zip",
			"timezone",
			"plan_tier",
			"dealer_slug",
		]);
		expect(AEROLOT_PROVISION_WRITEBACK_FIELD_KEYS).toEqual([
			"aerolot_dealer_id",
			"aerolot_provision_status",
			"aerolot_provision_error",
			"aerolot_portal_url",
			"aerolot_provisioned_at",
			"aerolot_provision_source",
		]);
		expect([...AEROLOT_PROVISION_STANDARD_COMPANY_COLUMNS]).toContain("name");
		expect([...AEROLOT_PROVISION_STANDARD_COMPANY_COLUMNS]).toContain(
			"stateCode",
		);
		expect([...AEROLOT_PROVISION_STANDARD_CONTACT_COLUMNS]).toEqual([
			"firstName",
			"lastName",
			"email",
			"phone",
		]);
	});

	it("locks plan tiers and provision statuses to Espo-compatible sets", () => {
		expect([...AEROLOT_PLAN_TIERS]).toEqual([
			"Growth",
			"Professional",
			"Enterprise",
		]);
		expect([...AEROLOT_PROVISION_STATUSES]).toEqual([
			"pending",
			"provisioned",
			"failed",
			"skipped",
		]);
		expect(AEROLOT_US_TIMEZONES).toContain("America/New_York");
		expect(aerolotFieldByKey("plan_tier")?.options).toEqual([
			...AEROLOT_PLAN_TIERS,
		]);
		expect(aerolotFieldByKey("aerolot_provision_status")?.options).toEqual([
			...AEROLOT_PROVISION_STATUSES,
		]);
	});

	it("keeps ICP oriented to independent dealers, not mega franchise", () => {
		expect([...AEROLOT_ICP_SEGMENTS]).toContain("Independent used-car");
		expect([...AEROLOT_ICP_SEGMENTS]).toContain("Multi-lot group");
		expect(isOutOfIcpSegment("Out of ICP")).toBe(true);
		expect(isOutOfIcpSegment("Independent used-car")).toBe(false);
	});

	it("does not invent a Lead entity or inventory board fields", () => {
		const keys = AEROLOT_SALES_FIELDS.map((field) => field.key);
		expect(keys.some((key) => key.includes("lead"))).toBe(false);
		expect(keys.some((key) => key.includes("inventory"))).toBe(false);
		expect(keys.some((key) => key.includes("recon"))).toBe(false);
		expect(keys.some((key) => key.includes("vin"))).toBe(false);
		expect(
			AEROLOT_COMPANY_FIELDS.every((field) => field.entity === "COMPANY"),
		).toBe(true);
		expect(
			AEROLOT_CONTACT_FIELDS.every((field) => field.entity === "CONTACT"),
		).toBe(true);
		expect(AEROLOT_DEAL_FIELDS.every((field) => field.entity === "DEAL")).toBe(
			true,
		);
	});
});

describe("Aerolot seed dealers", () => {
	it("are dealership accounts with provision-ready attributes", () => {
		expect(AEROLOT_SEED_DEALERS.length).toBeGreaterThanOrEqual(5);
		for (const dealer of AEROLOT_SEED_DEALERS) {
			expect(dealer.industry.toLowerCase()).toMatch(/car|dealer|lot|bhph/);
			expect(dealer.stateCode).toMatch(/^[A-Z]{2}$/);
			expect(dealer.zip.length).toBeGreaterThanOrEqual(5);
			expect(AEROLOT_PLAN_TIERS).toContain(dealer.planTier);
			expect(AEROLOT_US_TIMEZONES).toContain(dealer.timezone);
			expect(dealer.owner.emailLocal.length).toBeGreaterThan(0);
			expect(dealer.owner.phone.startsWith("+")).toBe(true);
		}
	});
});
