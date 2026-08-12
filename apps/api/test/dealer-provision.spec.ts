import { createHmac } from "node:crypto";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import {
	BadRequestException,
	NotFoundException,
	ServiceUnavailableException,
} from "@nestjs/common";
import {
	buildSalesEspoPayload,
	normalizePhoneE164,
	parseAerolotProvisionResponse,
	provisionRequestHeaders,
	signAerolotProvisionBody,
	validateDealerProvisionFields,
	type DealerProvisionFields,
	type ValidatedDealerProvision,
} from "../src/companies/dealer-provision";
import { DEALER_PROVISION } from "../src/companies/dealer-provision-config";
import { DealerProvisionService } from "../src/companies/dealer-provision.service";

const validFields = (): DealerProvisionFields => ({
	dealershipName: "Palm Beach Motors",
	ownerFirstName: "Ada",
	ownerLastName: "Lovelace",
	ownerEmail: "Ada@PalmBeach.test",
	ownerPhone: "(561) 555-0100",
	street: "100 Ocean Ave",
	city: "West Palm Beach",
	state: "fl",
	zip: "33401",
	planTier: "growth",
	timezone: "America/New_York",
});

const validValidated = (): ValidatedDealerProvision => ({
	dealershipName: "Palm Beach Motors",
	ownerFirstName: "Ada",
	ownerLastName: "Lovelace",
	ownerEmail: "ada@palmbeach.test",
	ownerPhone: "+15615550100",
	street: "100 Ocean Ave",
	city: "West Palm Beach",
	state: "FL",
	zip: "33401",
	planTier: "Growth",
	timezone: "America/New_York",
});

describe("normalizePhoneE164", () => {
	it("maps a 10-digit US number to +1", () => {
		expect(normalizePhoneE164("5615550100")).toBe("+15615550100");
		expect(normalizePhoneE164("(561) 555-0100")).toBe("+15615550100");
		expect(normalizePhoneE164("561-555-0100")).toBe("+15615550100");
	});

	it("keeps an 11-digit number that starts with 1", () => {
		expect(normalizePhoneE164("15615550100")).toBe("+15615550100");
	});

	it("keeps an already-E.164 value", () => {
		expect(normalizePhoneE164("+15615550100")).toBe("+15615550100");
		expect(normalizePhoneE164("+44 20 7946 0958")).toBe("+442079460958");
	});

	it("strips extension suffixes", () => {
		expect(normalizePhoneE164("561-555-0100 ext. 12")).toBe("+15615550100");
		expect(normalizePhoneE164("5615550100 x99")).toBe("+15615550100");
	});

	it("rejects empty and too-short input", () => {
		expect(normalizePhoneE164(null)).toBeNull();
		expect(normalizePhoneE164("")).toBeNull();
		expect(normalizePhoneE164("   ")).toBeNull();
		expect(normalizePhoneE164("123")).toBeNull();
	});
});

describe("validateDealerProvisionFields", () => {
	it("accepts a full valid payload and normalizes values", () => {
		const result = validateDealerProvisionFields(validFields());
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toEqual(validValidated());
	});

	it("reports every required field when the input is empty", () => {
		const result = validateDealerProvisionFields({
			dealershipName: "",
			ownerFirstName: "",
			ownerLastName: "",
			ownerEmail: "",
			ownerPhone: "",
			street: "",
			city: "",
			state: "",
			zip: "",
			planTier: "",
			timezone: "",
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.missing).toEqual([
			"Dealership name",
			"Owner first and last name",
			"Owner email",
			"Owner phone",
			"Street address",
			"City",
			"State (2-letter US code, e.g. FL)",
			"ZIP",
			"Plan tier (Growth / Professional / Enterprise)",
			"Timezone",
		]);
	});

	it("rejects a missing dealership name", () => {
		const result = validateDealerProvisionFields({
			...validFields(),
			dealershipName: "  ",
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.missing).toContain("Dealership name");
	});

	it("rejects a missing owner first name", () => {
		const result = validateDealerProvisionFields({
			...validFields(),
			ownerFirstName: "",
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.missing).toContain("Owner first and last name");
	});

	it("rejects a missing owner last name", () => {
		const result = validateDealerProvisionFields({
			...validFields(),
			ownerLastName: " ",
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.missing).toContain("Owner first and last name");
	});

	it("rejects a missing or invalid owner email", () => {
		for (const ownerEmail of ["", "  ", "not-an-email"]) {
			const result = validateDealerProvisionFields({
				...validFields(),
				ownerEmail,
			});
			expect(result.ok).toBe(false);
			if (result.ok) continue;
			expect(result.missing).toContain("Owner email");
		}
	});

	it("rejects a missing or unusable owner phone", () => {
		for (const ownerPhone of ["", "12", null as unknown as string]) {
			const result = validateDealerProvisionFields({
				...validFields(),
				ownerPhone: ownerPhone ?? "",
			});
			expect(result.ok).toBe(false);
			if (result.ok) continue;
			expect(result.missing).toContain("Owner phone");
		}
	});

	it("rejects a missing street", () => {
		const result = validateDealerProvisionFields({
			...validFields(),
			street: "",
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.missing).toContain("Street address");
	});

	it("rejects a missing city", () => {
		const result = validateDealerProvisionFields({
			...validFields(),
			city: "\t",
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.missing).toContain("City");
	});

	it("rejects a missing or non-US state", () => {
		for (const state of ["", "Florida", "XX", "F"]) {
			const result = validateDealerProvisionFields({
				...validFields(),
				state,
			});
			expect(result.ok).toBe(false);
			if (result.ok) continue;
			expect(result.missing).toContain(
				"State (2-letter US code, e.g. FL)",
			);
		}
	});

	it("rejects a missing ZIP", () => {
		const result = validateDealerProvisionFields({
			...validFields(),
			zip: "",
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.missing).toContain("ZIP");
	});

	it("rejects an unknown plan tier", () => {
		const result = validateDealerProvisionFields({
			...validFields(),
			planTier: "Starter",
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.missing).toContain(
			"Plan tier (Growth / Professional / Enterprise)",
		);
	});

	it("accepts every known plan tier case-insensitively", () => {
		for (const planTier of [
			"Growth",
			"professional",
			"ENTERPRISE",
		] as const) {
			const result = validateDealerProvisionFields({
				...validFields(),
				planTier,
			});
			expect(result.ok).toBe(true);
			if (!result.ok) continue;
			expect(["Growth", "Professional", "Enterprise"]).toContain(
				result.value.planTier,
			);
		}
	});

	it("rejects a missing timezone", () => {
		const result = validateDealerProvisionFields({
			...validFields(),
			timezone: "",
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.missing).toContain("Timezone");
	});
});

describe("buildSalesEspoPayload", () => {
	it("namespaces espoAccountId as aisales:{companyId}", () => {
		const companyId = "cmp_abc123";
		const payload = buildSalesEspoPayload(companyId, validValidated(), {
			website: "https://palmbeach.test",
		});

		expect(payload.espoAccountId).toBe(`aisales:${companyId}`);
		expect(payload.event).toBe(DEALER_PROVISION.event);
		expect(payload.displayName).toBe("Palm Beach Motors");
		expect(payload.accountName).toBe("Palm Beach Motors");
		expect(payload.firstName).toBe("Ada");
		expect(payload.lastName).toBe("Lovelace");
		expect(payload.ownerName).toBe("Ada Lovelace");
		expect(payload.emailAddress).toBe("ada@palmbeach.test");
		expect(payload.ownerEmail).toBe("ada@palmbeach.test");
		expect(payload.phoneNumber).toBe("+15615550100");
		expect(payload.ownerPhone).toBe("+15615550100");
		expect(payload.addressStreet).toBe("100 Ocean Ave");
		expect(payload.addressCity).toBe("West Palm Beach");
		expect(payload.addressState).toBe("FL");
		expect(payload.addressPostalCode).toBe("33401");
		expect(payload.aerolotTimezone).toBe("America/New_York");
		expect(payload.planTierInterest).toBe("Growth");
		expect(payload.website).toBe("https://palmbeach.test");
		expect(payload.espoLeadId).toBeNull();
		expect(payload.espoContactId).toBeNull();
		expect(payload.dealerSlug).toBeNull();
		expect(payload.assignedUserEmail).toBeNull();
	});
});

describe("signAerolotProvisionBody and provisionRequestHeaders", () => {
	const secret = "test-provision-secret";
	const companyId = "cmp_headers";
	const rawBody = JSON.stringify({ event: "aisales_company_provisioned" });
	const nowSec = 1_700_000_000;

	it("signs as sha256=<hmac hex> over timestamp.body", () => {
		const signature = signAerolotProvisionBody(rawBody, nowSec, secret);
		const expected = createHmac("sha256", secret)
			.update(`${nowSec}.${rawBody}`, "utf8")
			.digest("hex");
		expect(signature).toBe(`sha256=${expected}`);
	});

	it("sets Idempotency-Key aisales:company:{id} and the HMAC headers", () => {
		const headers = provisionRequestHeaders(
			rawBody,
			secret,
			companyId,
			nowSec,
		);

		expect(headers["Content-Type"]).toBe("application/json");
		expect(headers["Idempotency-Key"]).toBe(
			`aisales:company:${companyId}`,
		);
		expect(headers["X-Aerolot-Timestamp"]).toBe(String(nowSec));
		expect(headers["X-Aerolot-Signature"]).toBe(
			signAerolotProvisionBody(rawBody, nowSec, secret),
		);
		expect(headers["X-Aerolot-Signature"].startsWith("sha256=")).toBe(
			true,
		);
	});
});

describe("parseAerolotProvisionResponse", () => {
	it("returns success when ok is true and dealerId is present", () => {
		const parsed = parseAerolotProvisionResponse(200, {
			ok: true,
			dealerId: "dlr_1",
			portalUrl: "https://portal.aerolot.test/d/1",
			alreadyProvisioned: false,
		});
		expect(parsed).toEqual({
			ok: true,
			dealerId: "dlr_1",
			portalUrl: "https://portal.aerolot.test/d/1",
			alreadyProvisioned: false,
		});
	});

	it("treats a success body without dealerId as failure", () => {
		const parsed = parseAerolotProvisionResponse(201, {
			ok: true,
			portalUrl: null,
		});
		expect(parsed.ok).toBe(false);
		if (parsed.ok) return;
		expect(parsed.error).toBe("dealer_missing_after_provision");
		expect(parsed.httpStatus).toBe(201);
	});

	it("maps an error body with missing fields", () => {
		const parsed = parseAerolotProvisionResponse(400, {
			ok: false,
			error: "validation_failed",
			missing: ["email", "phone"],
		});
		expect(parsed.ok).toBe(false);
		if (parsed.ok) return;
		expect(parsed.error).toBe("validation_failed:email,phone");
		expect(parsed.missing).toEqual(["email", "phone"]);
		expect(parsed.httpStatus).toBe(400);
	});

	it("maps a non-object body to http_<status>", () => {
		const parsed = parseAerolotProvisionResponse(502, "bad gateway");
		expect(parsed).toEqual({
			ok: false,
			error: "http_502",
			missing: undefined,
			httpStatus: 502,
		});
	});

	it("defaults error when the body has no error field", () => {
		const parsed = parseAerolotProvisionResponse(500, { ok: false });
		expect(parsed.ok).toBe(false);
		if (parsed.ok) return;
		expect(parsed.error).toBe("provision_failed");
	});
});

type CompanyRow = {
	id: string;
	website: string | null;
	aerolotDealerId: string | null;
	aerolotProvisionStatus: string | null;
	aerolotPortalUrl: string | null;
	aerolotProvisionedAt: Date | null;
	aerolotProvisionError: string | null;
	aerolotProvisionSource?: string | null;
};

function createMockDb(initial: CompanyRow | null) {
	let row = initial ? { ...initial } : null;
	const updates: Record<string, unknown>[] = [];

	const db = {
		company: {
			findUnique: async ({
				where,
			}: {
				where: { id: string };
				select?: unknown;
			}) => {
				if (!row || row.id !== where.id) return null;
				return { ...row };
			},
			update: async ({
				where,
				data,
			}: {
				where: { id: string };
				data: Record<string, unknown>;
			}) => {
				if (!row || row.id !== where.id) {
					throw new Error(`company ${where.id} not found`);
				}
				updates.push({ ...data });
				row = {
					...row,
					...data,
					aerolotProvisionedAt:
						data.aerolotProvisionedAt instanceof Date
							? data.aerolotProvisionedAt
							: row.aerolotProvisionedAt,
				} as CompanyRow;
				return { ...row };
			},
		},
	};

	return {
		db: db as never,
		updates,
		getRow: () => row,
	};
}

describe("DealerProvisionService", () => {
	const realFetch = globalThis.fetch;
	const realSecret = process.env.AEROLOT_DEALERS_PROVISION_SECRET;
	const realUrl = process.env.AEROLOT_DEALERS_PROVISION_URL;
	const companyId = "cmp_service_1";
	let fetchCalls: { url: string; init?: RequestInit }[] = [];

	beforeEach(() => {
		fetchCalls = [];
		process.env.AEROLOT_DEALERS_PROVISION_SECRET = "service-test-secret";
		process.env.AEROLOT_DEALERS_PROVISION_URL =
			"https://aerolot.test/api/admin/dealers?source=sales-espo";
	});

	afterEach(() => {
		globalThis.fetch = realFetch;
		if (realSecret === undefined) {
			delete process.env.AEROLOT_DEALERS_PROVISION_SECRET;
		} else {
			process.env.AEROLOT_DEALERS_PROVISION_SECRET = realSecret;
		}
		if (realUrl === undefined) {
			delete process.env.AEROLOT_DEALERS_PROVISION_URL;
		} else {
			process.env.AEROLOT_DEALERS_PROVISION_URL = realUrl;
		}
	});

	function stubFetch(status: number, body: unknown) {
		globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
			fetchCalls.push({
				url: typeof url === "string" ? url : url.toString(),
				init,
			});
			return new Response(JSON.stringify(body), {
				status,
				headers: { "content-type": "application/json" },
			});
		}) as typeof fetch;
	}

	it("returns early when the company is already provisioned, without fetch", async () => {
		const provisionedAt = new Date("2026-01-15T12:00:00.000Z");
		const { db } = createMockDb({
			id: companyId,
			website: null,
			aerolotDealerId: "dlr_existing",
			aerolotProvisionStatus: DEALER_PROVISION.statuses.provisioned,
			aerolotPortalUrl: "https://portal.aerolot.test/existing",
			aerolotProvisionedAt: provisionedAt,
			aerolotProvisionError: null,
		});
		const service = new DealerProvisionService(db);
		let fetchHit = false;
		globalThis.fetch = (async () => {
			fetchHit = true;
			return new Response("{}", { status: 200 });
		}) as typeof fetch;

		const result = await service.provision(companyId, validFields());

		expect(fetchHit).toBe(false);
		expect(result).toEqual({
			companyId,
			aerolotDealerId: "dlr_existing",
			aerolotProvisionStatus: DEALER_PROVISION.statuses.provisioned,
			aerolotProvisionError: null,
			aerolotPortalUrl: "https://portal.aerolot.test/existing",
			aerolotProvisionedAt: provisionedAt.toISOString(),
			alreadyProvisioned: true,
		});
	});

	it("throws BadRequest on validation failure without calling fetch", async () => {
		const { db, updates } = createMockDb({
			id: companyId,
			website: null,
			aerolotDealerId: null,
			aerolotProvisionStatus: null,
			aerolotPortalUrl: null,
			aerolotProvisionedAt: null,
			aerolotProvisionError: null,
		});
		const service = new DealerProvisionService(db);
		let fetchHit = false;
		globalThis.fetch = (async () => {
			fetchHit = true;
			return new Response("{}", { status: 200 });
		}) as typeof fetch;

		await expect(
			service.provision(companyId, {
				...validFields(),
				dealershipName: "",
				ownerEmail: "bad",
			}),
		).rejects.toThrow(BadRequestException);

		await expect(
			service.provision(companyId, {
				...validFields(),
				dealershipName: "",
			}),
		).rejects.toThrow(/Cannot provision — Aerolot requires/);

		expect(fetchHit).toBe(false);
		expect(updates).toHaveLength(0);
	});

	it("throws ServiceUnavailable when the provision secret is missing", async () => {
		delete process.env.AEROLOT_DEALERS_PROVISION_SECRET;
		const { db, updates } = createMockDb({
			id: companyId,
			website: null,
			aerolotDealerId: null,
			aerolotProvisionStatus: null,
			aerolotPortalUrl: null,
			aerolotProvisionedAt: null,
			aerolotProvisionError: null,
		});
		const service = new DealerProvisionService(db);
		let fetchHit = false;
		globalThis.fetch = (async () => {
			fetchHit = true;
			return new Response("{}", { status: 200 });
		}) as typeof fetch;

		await expect(
			service.provision(companyId, validFields()),
		).rejects.toThrow(ServiceUnavailableException);

		await expect(
			service.provision(companyId, validFields()),
		).rejects.toThrow(/AEROLOT_DEALERS_PROVISION_SECRET/);

		expect(fetchHit).toBe(false);
		expect(updates).toHaveLength(0);
	});

	it("throws NotFound when the company does not exist", async () => {
		const { db } = createMockDb(null);
		const service = new DealerProvisionService(db);

		await expect(
			service.provision("missing", validFields()),
		).rejects.toThrow(NotFoundException);
	});

	it("POSTs with HMAC headers and writes provisioned status on success", async () => {
		const { db, updates, getRow } = createMockDb({
			id: companyId,
			website: "https://palmbeach.test",
			aerolotDealerId: null,
			aerolotProvisionStatus: null,
			aerolotPortalUrl: null,
			aerolotProvisionedAt: null,
			aerolotProvisionError: null,
		});
		const service = new DealerProvisionService(db);
		stubFetch(200, {
			ok: true,
			dealerId: "dlr_new",
			portalUrl: "https://portal.aerolot.test/new",
			alreadyProvisioned: false,
		});

		const result = await service.provision(companyId, validFields());

		expect(fetchCalls).toHaveLength(1);
		const call = fetchCalls[0]!;
		expect(call.url).toBe(
			"https://aerolot.test/api/admin/dealers?source=sales-espo",
		);
		expect(call.init?.method).toBe("POST");

		const headers = call.init?.headers as Record<string, string>;
		expect(headers["Content-Type"]).toBe("application/json");
		expect(headers["Idempotency-Key"]).toBe(
			`aisales:company:${companyId}`,
		);
		expect(headers["X-Aerolot-Signature"].startsWith("sha256=")).toBe(
			true,
		);
		expect(headers["X-Aerolot-Timestamp"]).toMatch(/^\d+$/);

		const body = JSON.parse(String(call.init?.body)) as Record<
			string,
			unknown
		>;
		expect(body.espoAccountId).toBe(`aisales:${companyId}`);
		expect(body.website).toBe("https://palmbeach.test");
		expect(body.phoneNumber).toBe("+15615550100");

		const expectedSig = signAerolotProvisionBody(
			String(call.init?.body),
			Number(headers["X-Aerolot-Timestamp"]),
			"service-test-secret",
		);
		expect(headers["X-Aerolot-Signature"]).toBe(expectedSig);

		expect(result.aerolotDealerId).toBe("dlr_new");
		expect(result.aerolotProvisionStatus).toBe(
			DEALER_PROVISION.statuses.provisioned,
		);
		expect(result.aerolotPortalUrl).toBe(
			"https://portal.aerolot.test/new",
		);
		expect(result.alreadyProvisioned).toBe(false);
		expect(result.aerolotProvisionedAt).toBeTruthy();

		expect(updates[0]).toMatchObject({
			aerolotProvisionStatus: DEALER_PROVISION.statuses.pending,
			aerolotProvisionError: null,
			aerolotProvisionSource: DEALER_PROVISION.source,
		});
		expect(updates[1]).toMatchObject({
			aerolotProvisionStatus: DEALER_PROVISION.statuses.provisioned,
			aerolotDealerId: "dlr_new",
			aerolotPortalUrl: "https://portal.aerolot.test/new",
			aerolotProvisionError: null,
			aerolotProvisionSource: DEALER_PROVISION.source,
		});
		expect(getRow()?.aerolotDealerId).toBe("dlr_new");
	});

	it("marks failed and throws BadRequest when Aerolot rejects", async () => {
		const { db, updates } = createMockDb({
			id: companyId,
			website: null,
			aerolotDealerId: null,
			aerolotProvisionStatus: null,
			aerolotPortalUrl: null,
			aerolotProvisionedAt: null,
			aerolotProvisionError: null,
		});
		const service = new DealerProvisionService(db);
		stubFetch(400, {
			ok: false,
			error: "validation_failed",
			missing: ["ownerEmail"],
		});

		await expect(
			service.provision(companyId, validFields()),
		).rejects.toThrow(/Aerolot rejected the provision: ownerEmail/);

		expect(updates.at(-1)).toMatchObject({
			aerolotProvisionStatus: DEALER_PROVISION.statuses.failed,
			aerolotProvisionError: "validation_failed:ownerEmail",
		});
	});

	it("marks failed and throws ServiceUnavailable when fetch errors", async () => {
		const { db, updates } = createMockDb({
			id: companyId,
			website: null,
			aerolotDealerId: null,
			aerolotProvisionStatus: null,
			aerolotPortalUrl: null,
			aerolotProvisionedAt: null,
			aerolotProvisionError: null,
		});
		const service = new DealerProvisionService(db);
		globalThis.fetch = (async () => {
			throw new Error("connect ECONNREFUSED");
		}) as typeof fetch;

		await expect(
			service.provision(companyId, validFields()),
		).rejects.toThrow(ServiceUnavailableException);

		expect(updates.at(-1)).toMatchObject({
			aerolotProvisionStatus: DEALER_PROVISION.statuses.failed,
			aerolotProvisionError: "fetch_error:connect ECONNREFUSED",
		});
	});
});
