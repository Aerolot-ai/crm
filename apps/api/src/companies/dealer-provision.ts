import { createHmac } from "node:crypto";
import {
	DEALER_PROVISION,
	type DealerPlanTier,
} from "./dealer-provision-config";

export type DealerProvisionFields = {
	dealershipName: string;
	ownerFirstName: string;
	ownerLastName: string;
	ownerEmail: string;
	ownerPhone: string;
	street: string;
	city: string;
	state: string;
	zip: string;
	planTier: string;
	timezone: string;
};

export type ValidatedDealerProvision = {
	dealershipName: string;
	ownerFirstName: string;
	ownerLastName: string;
	ownerEmail: string;
	ownerPhone: string;
	street: string;
	city: string;
	state: string;
	zip: string;
	planTier: DealerPlanTier;
	timezone: string;
};

export type DealerProvisionValidation =
	| { ok: true; value: ValidatedDealerProvision }
	| { ok: false; missing: string[] };

function trim(value: unknown): string {
	if (value == null) return "";
	return String(value).trim();
}

export function normalizePhoneE164(raw: unknown): string | null {
	if (raw == null) return null;
	let s = String(raw).trim();
	if (!s) return null;
	s = s.split(/ext\.?|x\s*\d+|extension/i)[0] ?? s;
	s = s.replace(/[^\d+]/g, "");
	if (!s.startsWith("+")) {
		const digits = s.replace(/\D/g, "");
		if (digits.length === 10) s = `+1${digits}`;
		else if (digits.length === 11 && digits.startsWith("1")) s = `+${digits}`;
		else if (digits.length > 0) s = `+${digits}`;
	}
	s = `+${s.replace(/\+/g, "")}`;
	return s.length >= 9 ? s : null;
}

export function validateDealerProvisionFields(
	input: DealerProvisionFields,
): DealerProvisionValidation {
	const missing: string[] = [];

	const dealershipName = trim(input.dealershipName);
	if (!dealershipName) missing.push("Dealership name");

	const ownerFirstName = trim(input.ownerFirstName);
	const ownerLastName = trim(input.ownerLastName);
	if (!ownerFirstName || !ownerLastName) {
		missing.push("Owner first and last name");
	}

	const ownerEmail = trim(input.ownerEmail).toLowerCase();
	if (!ownerEmail || !ownerEmail.includes("@")) {
		missing.push("Owner email");
	}

	const ownerPhone = normalizePhoneE164(input.ownerPhone);
	if (!ownerPhone) missing.push("Owner phone");

	const street = trim(input.street);
	if (!street) missing.push("Street address");

	const city = trim(input.city);
	if (!city) missing.push("City");

	const state = trim(input.state).toUpperCase();
	if (
		!state ||
		!(DEALER_PROVISION.usStates as readonly string[]).includes(state)
	) {
		missing.push("State (2-letter US code, e.g. FL)");
	}

	const zip = trim(input.zip);
	if (!zip) missing.push("ZIP");

	const planRaw = trim(input.planTier);
	const planTier = DEALER_PROVISION.planTiers.find(
		(tier) => tier.toLowerCase() === planRaw.toLowerCase(),
	);
	if (!planTier) {
		missing.push("Plan tier (Growth / Professional / Enterprise)");
	}

	const timezone = trim(input.timezone);
	if (!timezone) missing.push("Timezone");

	if (missing.length > 0 || !ownerPhone || !planTier) {
		return { ok: false, missing };
	}

	return {
		ok: true,
		value: {
			dealershipName,
			ownerFirstName,
			ownerLastName,
			ownerEmail,
			ownerPhone,
			street,
			city,
			state,
			zip,
			planTier,
			timezone,
		},
	};
}

export function buildSalesEspoPayload(
	companyId: string,
	fields: ValidatedDealerProvision,
	opts?: { website?: string | null },
): Record<string, unknown> {
	const ownerName = `${fields.ownerFirstName} ${fields.ownerLastName}`.trim();
	const accountKey = DEALER_PROVISION.externalAccountId(companyId);

	return {
		event: DEALER_PROVISION.event,
		espoLeadId: null,
		espoAccountId: accountKey,
		espoContactId: null,
		displayName: fields.dealershipName,
		accountName: fields.dealershipName,
		dealerSlug: null,
		firstName: fields.ownerFirstName,
		lastName: fields.ownerLastName,
		ownerName,
		emailAddress: fields.ownerEmail,
		ownerEmail: fields.ownerEmail,
		phoneNumber: fields.ownerPhone,
		ownerPhone: fields.ownerPhone,
		addressStreet: fields.street,
		addressCity: fields.city,
		addressState: fields.state,
		addressPostalCode: fields.zip,
		aerolotTimezone: fields.timezone,
		planTierInterest: fields.planTier,
		website: opts?.website ?? null,
		assignedUserEmail: null,
	};
}

export function signAerolotProvisionBody(
	rawBody: string,
	timestampSec: number,
	secret: string,
): string {
	const hex = createHmac("sha256", secret)
		.update(`${timestampSec}.${rawBody}`, "utf8")
		.digest("hex");
	return `sha256=${hex}`;
}

export function provisionRequestHeaders(
	rawBody: string,
	secret: string,
	companyId: string,
	nowSec = Math.floor(Date.now() / 1000),
): {
	"Content-Type": string;
	"X-Aerolot-Signature": string;
	"X-Aerolot-Timestamp": string;
	"Idempotency-Key": string;
} {
	return {
		"Content-Type": "application/json",
		"X-Aerolot-Signature": signAerolotProvisionBody(rawBody, nowSec, secret),
		"X-Aerolot-Timestamp": String(nowSec),
		"Idempotency-Key": DEALER_PROVISION.idempotencyKey(companyId),
	};
}

export type AerolotProvisionSuccess = {
	ok: true;
	dealerId: string;
	portalUrl: string | null;
	alreadyProvisioned: boolean;
};

export type AerolotProvisionFailure = {
	ok: false;
	error: string;
	missing?: string[];
	httpStatus: number;
};

export function parseAerolotProvisionResponse(
	httpStatus: number,
	body: unknown,
): AerolotProvisionSuccess | AerolotProvisionFailure {
	const record =
		body && typeof body === "object"
			? (body as Record<string, unknown>)
			: null;

	if (httpStatus >= 200 && httpStatus < 300 && record?.ok === true) {
		const dealerId = record.dealerId != null ? String(record.dealerId) : "";
		if (!dealerId) {
			return {
				ok: false,
				error: "dealer_missing_after_provision",
				httpStatus,
			};
		}
		return {
			ok: true,
			dealerId,
			portalUrl:
				record.portalUrl != null ? String(record.portalUrl) : null,
			alreadyProvisioned: Boolean(record.alreadyProvisioned),
		};
	}

	let error = "provision_failed";
	let missing: string[] | undefined;
	if (record) {
		if (record.error != null) error = String(record.error);
		if (Array.isArray(record.missing)) {
			missing = record.missing.map(String);
			error = `${error}:${missing.join(",")}`;
		}
	} else {
		error = `http_${httpStatus}`;
	}

	return { ok: false, error, missing, httpStatus };
}
