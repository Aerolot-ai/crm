import { z } from "zod";
import { bulkIdsInput } from "../crm/bulk";
import { recordFieldValues } from "../fields/fields.contracts";
import { listInput } from "../trpc/list-input";

export const companyListInput = listInput.extend({
	owner: z.string().default("all"),
	industry: z.string().default("all"),
	enrichment: z.string().default("all"),
	source: z.string().default("all"),
});

export type CompanyListInput = z.infer<typeof companyListInput>;

export const companyCreateInput = z.object({
	name: z.string().trim().min(1, "A company needs a name."),
	domain: z.string().trim().optional(),
	ownerId: z.string().nullable().optional(),
});

export type CompanyCreateInput = z.infer<typeof companyCreateInput>;

const companyUpdateInput = z.object({
	name: z.string().trim().min(1).optional(),
	domain: z.string().optional(),
	website: z.string().optional(),
	description: z.string().optional(),
	industry: z.string().optional(),
	city: z.string().optional(),
	stateCode: z.string().optional(),
	country: z.string().optional(),
	phone: z.string().optional(),
	email: z.string().optional(),
	linkedinUrl: z.string().optional(),
	ownerId: z.string().nullable().optional(),
	fields: recordFieldValues.optional(),
});

export type CompanyUpdateInput = z.infer<typeof companyUpdateInput>;

export const companyUpdateArgs = z.object({
	id: z.string(),
	data: companyUpdateInput,
});

export const companyIdInput = z.object({ id: z.string() });

export const setPrimaryContactInput = z.object({
	companyId: z.string(),
	contactId: z.string().nullable(),
});

export const companyOptionsInput = z.object({
	q: z.string().default(""),
});

export const companyBulkInput = bulkIdsInput;

export const companyBulkOwnerInput = bulkIdsInput.extend({
	ownerId: z.string().nullable(),
});

export type CompanyBulkOwnerInput = z.infer<typeof companyBulkOwnerInput>;

export const companyProvisionDealerInput = z.object({
	companyId: z.string().min(1),
	dealershipName: z.string().trim().min(1, "Dealership name is required."),
	ownerFirstName: z.string().trim().min(1, "Owner first name is required."),
	ownerLastName: z.string().trim().min(1, "Owner last name is required."),
	ownerEmail: z.string().trim().email("Owner email is required."),
	ownerPhone: z.string().trim().min(1, "Owner phone is required."),
	street: z.string().trim().min(1, "Street address is required."),
	city: z.string().trim().min(1, "City is required."),
	state: z
		.string()
		.trim()
		.length(2, "State must be a 2-letter US code.")
		.transform((value) => value.toUpperCase()),
	zip: z.string().trim().min(1, "ZIP is required."),
	planTier: z.enum(["Growth", "Professional", "Enterprise"]),
	timezone: z.string().trim().min(1, "Timezone is required."),
});

export type CompanyProvisionDealerInput = z.infer<
	typeof companyProvisionDealerInput
>;
