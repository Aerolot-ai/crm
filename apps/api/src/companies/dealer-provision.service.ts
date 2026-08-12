import type { Db } from "@crm/db";
import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
	ServiceUnavailableException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type { DealerProvisionFields } from "./dealer-provision";
import {
	buildSalesEspoPayload,
	parseAerolotProvisionResponse,
	provisionRequestHeaders,
	validateDealerProvisionFields,
} from "./dealer-provision";
import { DEALER_PROVISION } from "./dealer-provision-config";

export type ProvisionDealerResult = {
	companyId: string;
	aerolotDealerId: string | null;
	aerolotProvisionStatus: string;
	aerolotProvisionError: string | null;
	aerolotPortalUrl: string | null;
	aerolotProvisionedAt: string | null;
	alreadyProvisioned: boolean;
};

@Injectable()
export class DealerProvisionService {
	private readonly logger = new Logger(DealerProvisionService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async provision(
		companyId: string,
		input: DealerProvisionFields,
	): Promise<ProvisionDealerResult> {
		const company = await this.db.company.findUnique({
			where: { id: companyId },
			select: {
				id: true,
				website: true,
				aerolotDealerId: true,
				aerolotProvisionStatus: true,
				aerolotPortalUrl: true,
				aerolotProvisionedAt: true,
				aerolotProvisionError: true,
			},
		});

		if (!company) {
			throw new NotFoundException(`No company with id ${companyId}.`);
		}

		if (
			company.aerolotProvisionStatus ===
				DEALER_PROVISION.statuses.provisioned &&
			company.aerolotDealerId
		) {
			return {
				companyId,
				aerolotDealerId: company.aerolotDealerId,
				aerolotProvisionStatus: DEALER_PROVISION.statuses.provisioned,
				aerolotProvisionError: null,
				aerolotPortalUrl: company.aerolotPortalUrl,
				aerolotProvisionedAt:
					company.aerolotProvisionedAt?.toISOString() ?? null,
				alreadyProvisioned: true,
			};
		}

		const validated = validateDealerProvisionFields(input);
		if (!validated.ok) {
			throw new BadRequestException(
				`Cannot provision — Aerolot requires: ${validated.missing.join("; ")}`,
			);
		}

		const secret = process.env.AEROLOT_DEALERS_PROVISION_SECRET?.trim();
		if (!secret) {
			throw new ServiceUnavailableException(
				"Dealer provisioning is not configured (AEROLOT_DEALERS_PROVISION_SECRET).",
			);
		}

		const url =
			process.env.AEROLOT_DEALERS_PROVISION_URL?.trim() ||
			DEALER_PROVISION.defaultUrl;

		await this.db.company.update({
			where: { id: companyId },
			data: {
				aerolotProvisionStatus: DEALER_PROVISION.statuses.pending,
				aerolotProvisionError: null,
				aerolotProvisionSource: DEALER_PROVISION.source,
			},
		});

		const payload = buildSalesEspoPayload(companyId, validated.value, {
			website: company.website,
		});
		const rawBody = JSON.stringify(payload);
		const headers = provisionRequestHeaders(rawBody, secret, companyId);

		let httpStatus = 0;
		let body: unknown = null;

		try {
			const response = await fetch(url, {
				method: "POST",
				headers,
				body: rawBody,
				signal: AbortSignal.timeout(DEALER_PROVISION.timeoutMs),
				redirect: "follow",
			});
			httpStatus = response.status;
			const text = await response.text();
			try {
				body = text ? JSON.parse(text) : null;
			} catch {
				body = null;
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : "fetch_failed";
			await this.markFailed(companyId, `fetch_error:${message}`);
			this.logger.error(
				{ message: "Dealer provision request failed", companyId },
				error instanceof Error ? error.stack : undefined,
			);
			throw new ServiceUnavailableException(
				"Could not reach the Aerolot dealers API.",
			);
		}

		const parsed = parseAerolotProvisionResponse(httpStatus, body);

		if (parsed.ok) {
			const provisionedAt = new Date();
			await this.db.company.update({
				where: { id: companyId },
				data: {
					aerolotProvisionStatus: DEALER_PROVISION.statuses.provisioned,
					aerolotDealerId: parsed.dealerId,
					aerolotPortalUrl: parsed.portalUrl,
					aerolotProvisionedAt: provisionedAt,
					aerolotProvisionError: null,
					aerolotProvisionSource: DEALER_PROVISION.source,
				},
			});

			this.logger.log({
				message: "Dealer provisioned",
				companyId,
				dealerId: parsed.dealerId,
				alreadyProvisioned: parsed.alreadyProvisioned,
			});

			return {
				companyId,
				aerolotDealerId: parsed.dealerId,
				aerolotProvisionStatus: DEALER_PROVISION.statuses.provisioned,
				aerolotProvisionError: null,
				aerolotPortalUrl: parsed.portalUrl,
				aerolotProvisionedAt: provisionedAt.toISOString(),
				alreadyProvisioned: parsed.alreadyProvisioned,
			};
		}

		const error = parsed.error.slice(0, 500);
		await this.markFailed(companyId, error);

		this.logger.warn({
			message: "Dealer provision failed",
			companyId,
			error,
			httpStatus: parsed.httpStatus,
		});

		throw new BadRequestException(
			parsed.missing?.length
				? `Aerolot rejected the provision: ${parsed.missing.join("; ")}`
				: `Aerolot provision failed: ${error}`,
		);
	}

	private async markFailed(companyId: string, error: string) {
		await this.db.company.update({
			where: { id: companyId },
			data: {
				aerolotProvisionStatus: DEALER_PROVISION.statuses.failed,
				aerolotProvisionError: error,
				aerolotProvisionSource: DEALER_PROVISION.source,
			},
		});
	}
}
