"use client";

import Launch from "@carbon/icons-react/es/Launch";
import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@crm/ui/components/dialog";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Company = RouterOutputs["companies"]["byId"];

const PLAN_TIERS = ["Growth", "Professional", "Enterprise"] as const;
type PlanTier = (typeof PLAN_TIERS)[number];

const US_STATES = [
	"AL",
	"AK",
	"AZ",
	"AR",
	"CA",
	"CO",
	"CT",
	"DE",
	"FL",
	"GA",
	"HI",
	"ID",
	"IL",
	"IN",
	"IA",
	"KS",
	"KY",
	"LA",
	"ME",
	"MD",
	"MA",
	"MI",
	"MN",
	"MS",
	"MO",
	"MT",
	"NE",
	"NV",
	"NH",
	"NJ",
	"NM",
	"NY",
	"NC",
	"ND",
	"OH",
	"OK",
	"OR",
	"PA",
	"RI",
	"SC",
	"SD",
	"TN",
	"TX",
	"UT",
	"VT",
	"VA",
	"WA",
	"WV",
	"WI",
	"WY",
	"DC",
	"PR",
	"GU",
	"VI",
	"AS",
	"MP",
] as const;

const TIMEZONES = [
	"America/New_York",
	"America/Chicago",
	"America/Denver",
	"America/Phoenix",
	"America/Los_Angeles",
	"America/Anchorage",
	"Pacific/Honolulu",
	"America/Puerto_Rico",
] as const;

type FormState = {
	dealershipName: string;
	ownerFirstName: string;
	ownerLastName: string;
	ownerEmail: string;
	ownerPhone: string;
	street: string;
	city: string;
	state: string;
	zip: string;
	planTier: PlanTier;
	timezone: string;
};

function browserTimezone(): string {
	try {
		return (
			Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York"
		);
	} catch {
		return "America/New_York";
	}
}

function prefill(company: Company): FormState {
	const contact = company.primaryContact;
	const state = (company.stateCode ?? "").trim().toUpperCase();

	return {
		dealershipName: company.name,
		ownerFirstName: contact?.firstName ?? "",
		ownerLastName: contact?.lastName ?? "",
		ownerEmail: contact?.email ?? company.email ?? "",
		ownerPhone: contact?.phone ?? company.phone ?? "",
		street: "",
		city: company.city ?? "",
		state: (US_STATES as readonly string[]).includes(state) ? state : "",
		zip: "",
		planTier: "Growth",
		timezone: browserTimezone(),
	};
}

function formReady(form: FormState): boolean {
	return (
		form.dealershipName.trim() !== "" &&
		form.ownerFirstName.trim() !== "" &&
		form.ownerLastName.trim() !== "" &&
		form.ownerEmail.trim().includes("@") &&
		form.ownerPhone.trim() !== "" &&
		form.street.trim() !== "" &&
		form.city.trim() !== "" &&
		form.state.length === 2 &&
		form.zip.trim() !== "" &&
		form.planTier.length > 0 &&
		form.timezone.trim() !== ""
	);
}

function isPlanTier(value: string): value is PlanTier {
	return (PLAN_TIERS as readonly string[]).includes(value);
}

export function isDealerProvisioned(company: Company): boolean {
	return (
		company.aerolotProvisionStatus === "provisioned" &&
		Boolean(company.aerolotDealerId)
	);
}

export function ProvisionDealerDialog({ company }: { company: Company }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [open, setOpen] = useState(false);
	const [form, setForm] = useState<FormState>(() => prefill(company));

	const baseId = useId();
	const ids = {
		dealershipName: `${baseId}-dealership`,
		ownerFirstName: `${baseId}-first`,
		ownerLastName: `${baseId}-last`,
		ownerEmail: `${baseId}-email`,
		ownerPhone: `${baseId}-phone`,
		street: `${baseId}-street`,
		city: `${baseId}-city`,
		state: `${baseId}-state`,
		zip: `${baseId}-zip`,
		planTier: `${baseId}-plan`,
		timezone: `${baseId}-tz`,
	};

	const provision = useMutation(
		trpc.companies.provisionDealer.mutationOptions({
			onSuccess: async (result) => {
				await cache.company(company.id);
				setOpen(false);
				if (result.alreadyProvisioned) {
					toast.success("Already provisioned on Aerolot.");
					return;
				}
				toast.success(
					result.aerolotPortalUrl
						? "Dealer provisioned. Portal link is on the company."
						: "Dealer provisioned on Aerolot.",
				);
			},
			onError: (error) => {
				void cache.company(company.id);
				toast.error(error.message);
			},
		}),
	);

	const setField =
		<K extends keyof FormState>(key: K) =>
		(value: FormState[K]) =>
			setForm((current) => ({ ...current, [key]: value }));

	const retry = company.aerolotProvisionStatus === "failed";
	const timezoneOptions = TIMEZONES.includes(
		form.timezone as (typeof TIMEZONES)[number],
	)
		? TIMEZONES
		: ([form.timezone, ...TIMEZONES] as string[]);

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (next) setForm(prefill(company));
				setOpen(next);
			}}
		>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					<Icon icon={Launch} data-icon="inline-start" />
					<span className="hidden sm:inline">
						{retry ? "Retry provision" : "Provision dealer"}
					</span>
				</Button>
			</DialogTrigger>

			<DialogContent className="max-h-[min(90vh,44rem)] overflow-y-auto sm:max-w-(--container-sheet)">
				<DialogHeader>
					<DialogTitle>
						{retry ? "Retry dealer provision" : "Provision dealer"}
					</DialogTitle>
					<DialogDescription>
						Creates a live Aerolot dealer for {company.name}. Required fields
						must match the Aerolot dealers API.
					</DialogDescription>
				</DialogHeader>

				<form
					id={`${baseId}-form`}
					onSubmit={(event) => {
						event.preventDefault();
						if (!formReady(form) || provision.isPending) return;
						provision.mutate({
							companyId: company.id,
							dealershipName: form.dealershipName.trim(),
							ownerFirstName: form.ownerFirstName.trim(),
							ownerLastName: form.ownerLastName.trim(),
							ownerEmail: form.ownerEmail.trim(),
							ownerPhone: form.ownerPhone.trim(),
							street: form.street.trim(),
							city: form.city.trim(),
							state: form.state,
							zip: form.zip.trim(),
							planTier: form.planTier,
							timezone: form.timezone.trim(),
						});
					}}
				>
					<FieldGroup>
						<div className="grid gap-4 sm:grid-cols-2">
							<Field className="sm:col-span-2">
								<FieldLabel htmlFor={ids.dealershipName}>
									Dealership name
								</FieldLabel>
								<Input
									id={ids.dealershipName}
									value={form.dealershipName}
									onChange={(event) =>
										setField("dealershipName")(event.target.value)
									}
									autoComplete="organization"
									required
								/>
							</Field>

							<Field>
								<FieldLabel htmlFor={ids.ownerFirstName}>
									Owner first name
								</FieldLabel>
								<Input
									id={ids.ownerFirstName}
									value={form.ownerFirstName}
									onChange={(event) =>
										setField("ownerFirstName")(event.target.value)
									}
									autoComplete="given-name"
									required
								/>
							</Field>

							<Field>
								<FieldLabel htmlFor={ids.ownerLastName}>
									Owner last name
								</FieldLabel>
								<Input
									id={ids.ownerLastName}
									value={form.ownerLastName}
									onChange={(event) =>
										setField("ownerLastName")(event.target.value)
									}
									autoComplete="family-name"
									required
								/>
							</Field>

							<Field>
								<FieldLabel htmlFor={ids.ownerEmail}>Owner email</FieldLabel>
								<Input
									id={ids.ownerEmail}
									type="email"
									value={form.ownerEmail}
									onChange={(event) =>
										setField("ownerEmail")(event.target.value)
									}
									autoComplete="email"
									required
								/>
							</Field>

							<Field>
								<FieldLabel htmlFor={ids.ownerPhone}>Owner phone</FieldLabel>
								<Input
									id={ids.ownerPhone}
									type="tel"
									value={form.ownerPhone}
									onChange={(event) =>
										setField("ownerPhone")(event.target.value)
									}
									autoComplete="tel"
									placeholder="+1…"
									required
								/>
							</Field>

							<Field className="sm:col-span-2">
								<FieldLabel htmlFor={ids.street}>Street</FieldLabel>
								<Input
									id={ids.street}
									value={form.street}
									onChange={(event) => setField("street")(event.target.value)}
									autoComplete="street-address"
									required
								/>
							</Field>

							<Field>
								<FieldLabel htmlFor={ids.city}>City</FieldLabel>
								<Input
									id={ids.city}
									value={form.city}
									onChange={(event) => setField("city")(event.target.value)}
									autoComplete="address-level2"
									required
								/>
							</Field>

							<Field>
								<FieldLabel htmlFor={ids.state}>State</FieldLabel>
								<Select
									value={form.state}
									onValueChange={(value) => setField("state")(value)}
								>
									<SelectTrigger id={ids.state}>
										<SelectValue placeholder="US state" />
									</SelectTrigger>
									<SelectContent>
										{US_STATES.map((code) => (
											<SelectItem key={code} value={code}>
												{code}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>

							<Field>
								<FieldLabel htmlFor={ids.zip}>ZIP</FieldLabel>
								<Input
									id={ids.zip}
									value={form.zip}
									onChange={(event) => setField("zip")(event.target.value)}
									autoComplete="postal-code"
									required
								/>
							</Field>

							<Field>
								<FieldLabel htmlFor={ids.timezone}>Timezone</FieldLabel>
								<Select
									value={form.timezone}
									onValueChange={(value) => setField("timezone")(value)}
								>
									<SelectTrigger id={ids.timezone}>
										<SelectValue placeholder="Timezone" />
									</SelectTrigger>
									<SelectContent>
										{timezoneOptions.map((zone) => (
											<SelectItem key={zone} value={zone}>
												{zone}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>

							<Field className="sm:col-span-2">
								<FieldLabel id={ids.planTier}>Plan tier</FieldLabel>
								<ToggleGroup
									type="single"
									variant="outline"
									size="sm"
									spacing={0}
									value={form.planTier}
									onValueChange={(next) => {
										if (isPlanTier(next)) setField("planTier")(next);
									}}
									aria-labelledby={ids.planTier}
								>
									{PLAN_TIERS.map((tier) => (
										<ToggleGroupItem key={tier} value={tier}>
											{tier}
										</ToggleGroupItem>
									))}
								</ToggleGroup>
							</Field>
						</div>
					</FieldGroup>
				</form>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						disabled={provision.isPending}
						onClick={() => setOpen(false)}
					>
						Cancel
					</Button>
					<Button
						type="submit"
						form={`${baseId}-form`}
						disabled={!formReady(form) || provision.isPending}
					>
						{provision.isPending ? <Spinner /> : null}
						{provision.isPending
							? "Provisioning…"
							: retry
								? "Retry provision"
								: "Provision dealer"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
