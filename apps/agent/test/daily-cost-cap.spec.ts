import { describe, expect, it } from "bun:test";
import { evaluateDailyCostCap } from "../agent/lib/daily-cost-math";

describe("evaluateDailyCostCap", () => {
	it("allows a run under the cap", () => {
		const verdict = evaluateDailyCostCap(10, 100);
		expect(verdict.blocked).toBe(false);
		expect(verdict.warn).toBe(false);
		expect(verdict.ratio).toBe(0.1);
	});

	it("emits the warn path at 80%", () => {
		const verdict = evaluateDailyCostCap(80, 100);
		expect(verdict.blocked).toBe(false);
		expect(verdict.warn).toBe(true);
		expect(verdict.ratio).toBe(0.8);
	});

	it("blocks at 100%", () => {
		const verdict = evaluateDailyCostCap(100, 100);
		expect(verdict.blocked).toBe(true);
		expect(verdict.warn).toBe(true);
	});
});
