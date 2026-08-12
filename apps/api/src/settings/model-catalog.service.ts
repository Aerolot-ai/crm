import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Cache } from "cache-manager";

const OPENROUTER_CATALOG_URL = "https://openrouter.ai/api/v1/models";
const GATEWAY_CATALOG_URL = "https://ai-gateway.vercel.sh/v1/models";

const CATALOG_TTL_MS = 30 * 60_000;

const CATALOG_KEY = "settings:model-catalog";

const CATALOG_TIMEOUT_MS = 5_000;

export interface CatalogModel {
	id: string;
	name: string;
	provider: string;
	contextWindowTokens: number;
	pricing: { input: number; output: number } | null;
}

/** Curated tool-use models for direct DeepSeek / OpenRouter (no Vercel Gateway required). */
export const DIRECT_MODEL_CATALOG: CatalogModel[] = [
	{
		id: "deepseek/deepseek-chat",
		name: "DeepSeek Chat",
		provider: "deepseek",
		contextWindowTokens: 128_000,
		pricing: null,
	},
	{
		id: "deepseek/deepseek-reasoner",
		name: "DeepSeek Reasoner",
		provider: "deepseek",
		contextWindowTokens: 128_000,
		pricing: null,
	},
	{
		id: "deepseek/deepseek-chat-v3-0324",
		name: "DeepSeek Chat V3 (OpenRouter)",
		provider: "deepseek",
		contextWindowTokens: 128_000,
		pricing: null,
	},
];

interface RemoteModel {
	id?: unknown;
	name?: unknown;
	owned_by?: unknown;
	type?: unknown;
	tags?: unknown;
	context_window?: unknown;
	context_length?: unknown;
	pricing?: { input?: unknown; output?: unknown; prompt?: unknown; completion?: unknown } | null;
}

function rate(value: unknown): number | null {
	const parsed = typeof value === "string" ? Number(value) : value;
	return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

function usableGateway(model: RemoteModel): boolean {
	const tags = Array.isArray(model.tags) ? model.tags : [];
	return (
		typeof model.id === "string" &&
		model.type === "language" &&
		tags.includes("tool-use") &&
		typeof model.context_window === "number"
	);
}

function usableOpenRouter(model: RemoteModel): boolean {
	if (typeof model.id !== "string") return false;
	const id = model.id.toLowerCase();
	// Prefer DeepSeek tool-capable chat models on OpenRouter.
	return id.includes("deepseek") && !id.includes("r1-zero");
}

@Injectable()
export class ModelCatalogService {
	private readonly logger = new Logger(ModelCatalogService.name);

	constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

	async models(): Promise<CatalogModel[] | null> {
		const cached = await this.cache.get<CatalogModel[]>(CATALOG_KEY);
		if (cached) return cached;

		const models = await this.fetchCatalog();
		if (!models) return null;

		await this.cache.set(CATALOG_KEY, models, CATALOG_TTL_MS);
		return models;
	}

	async find(id: string): Promise<CatalogModel | null> {
		const models = await this.models();
		return models?.find((model) => model.id === id) ?? null;
	}

	private async fetchCatalog(): Promise<CatalogModel[] | null> {
		const direct =
			Boolean(process.env.DEEPSEEK_API_KEY?.trim()) ||
			Boolean(process.env.OPENROUTER_API_KEY?.trim()) ||
			Boolean(
				process.env.OPENAI_API_BASE_URL?.includes("deepseek") &&
					process.env.OPENAI_API_KEY?.trim(),
			);

		if (direct) {
			const remote = await this.fetchOpenRouterDeepseek();
			const merged = this.mergeCatalogs(DIRECT_MODEL_CATALOG, remote ?? []);
			this.logger.log({
				message: "Model catalog loaded (direct DeepSeek/OpenRouter)",
				models: merged.length,
			});
			return merged;
		}

		const gateway = await this.fetchGateway();
		if (gateway?.length) {
			this.logger.log({
				message: "Model catalog loaded (Vercel AI Gateway)",
				models: gateway.length,
			});
			return gateway;
		}

		// Always offer curated DeepSeek ids so Settings can pin before keys land.
		return DIRECT_MODEL_CATALOG;
	}

	private mergeCatalogs(
		base: CatalogModel[],
		extra: CatalogModel[],
	): CatalogModel[] {
		const byId = new Map<string, CatalogModel>();
		for (const model of [...base, ...extra]) {
			byId.set(model.id, model);
		}
		return [...byId.values()].sort(
			(a, b) =>
				a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name),
		);
	}

	private async fetchOpenRouterDeepseek(): Promise<CatalogModel[] | null> {
		const key = process.env.OPENROUTER_API_KEY?.trim();
		if (!key) return null;
		try {
			const response = await fetch(OPENROUTER_CATALOG_URL, {
				headers: {
					accept: "application/json",
					authorization: `Bearer ${key}`,
				},
				signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
			});
			if (!response.ok) return null;
			const body = (await response.json()) as { data?: unknown };
			const rows = Array.isArray(body.data)
				? (body.data as RemoteModel[])
				: [];
			return rows.filter(usableOpenRouter).map((model): CatalogModel => {
				const id = model.id as string;
				const ctx =
					typeof model.context_length === "number"
						? model.context_length
						: typeof model.context_window === "number"
							? model.context_window
							: 128_000;
				const input = rate(model.pricing?.prompt ?? model.pricing?.input);
				const output = rate(
					model.pricing?.completion ?? model.pricing?.output,
				);
				return {
					id,
					name: typeof model.name === "string" && model.name ? model.name : id,
					provider: id.split("/")[0] ?? "openrouter",
					contextWindowTokens: ctx,
					pricing:
						input !== null && output !== null ? { input, output } : null,
				};
			});
		} catch (error) {
			this.logger.warn({
				message: "OpenRouter catalog unavailable",
				reason: error instanceof Error ? error.message : String(error),
			});
			return null;
		}
	}

	private async fetchGateway(): Promise<CatalogModel[] | null> {
		try {
			const response = await fetch(GATEWAY_CATALOG_URL, {
				headers: { accept: "application/json" },
				signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
			});

			if (!response.ok) {
				this.logger.warn({
					message: "Model catalog request failed",
					status: response.status,
				});
				return null;
			}

			const body = (await response.json()) as { data?: unknown };
			const rows = Array.isArray(body.data)
				? (body.data as RemoteModel[])
				: [];

			const models = rows.filter(usableGateway).map((model): CatalogModel => {
				const id = model.id as string;
				const input = rate(model.pricing?.input);
				const output = rate(model.pricing?.output);

				return {
					id,
					name: typeof model.name === "string" && model.name ? model.name : id,
					provider:
						typeof model.owned_by === "string" && model.owned_by
							? model.owned_by
							: (id.split("/")[0] ?? id),
					contextWindowTokens: model.context_window as number,
					pricing: input !== null && output !== null ? { input, output } : null,
				};
			});

			models.sort(
				(a, b) =>
					a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name),
			);

			return models;
		} catch (error) {
			this.logger.warn({
				message: "Gateway catalog unavailable",
				reason: error instanceof Error ? error.message : String(error),
			});
			return null;
		}
	}
}
