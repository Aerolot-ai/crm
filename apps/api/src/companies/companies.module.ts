import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { CurrencyModule } from "../currency/currency.module";
import { FieldsModule } from "../fields/fields.module";
import { TrpcModule } from "../trpc/trpc.module";
import { CompaniesRouter } from "./companies.router";
import { CompaniesService } from "./companies.service";
import { CompanyDirectoryService } from "./company-directory.service";
import { DealerProvisionService } from "./dealer-provision.service";
import { FaviconService } from "./favicon.service";

@Module({
	imports: [FieldsModule, TrpcModule, AgentModule, CurrencyModule],
	providers: [
		CompaniesService,
		CompanyDirectoryService,
		CompaniesRouter,
		DealerProvisionService,
		FaviconService,
	],
	exports: [
		CompaniesService,
		CompanyDirectoryService,
		DealerProvisionService,
		FaviconService,
	],
})
export class CompaniesModule {}
