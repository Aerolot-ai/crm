"use client";

import { useQueryState } from "nuqs";
import { PageShellDescription, PageShellTitle } from "@/components/page-shell";
import { overviewParsers } from "./overview-search-params";

export function OverviewGreetingFallback() {
	return (
		<>
			<PageShellTitle>Welcome back</PageShellTitle>
			<PageShellDescription>
				SaaS pipeline: closed won, open value by stage, and work that needs you
				today.
			</PageShellDescription>
		</>
	);
}

export function OverviewGreeting() {
	const [scope] = useQueryState("scope", overviewParsers.scope);

	return (
		<>
			<PageShellTitle>Welcome back</PageShellTitle>
			<PageShellDescription>
				{scope === "me"
					? "Your SaaS pipeline: closed won, open value by stage, and work that needs you today."
					: "Team SaaS pipeline: closed won, open value by stage, and work that needs you today."}
			</PageShellDescription>
		</>
	);
}
