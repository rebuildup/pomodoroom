import { describe, expect, it, beforeEach } from "vitest";
import {
	applyBreakRepayment,
	accrueBreakDebt,
	createBreakDebtState,
	decayBreakDebt,
	loadBreakDebtState,
	saveBreakDebtState,
} from "./break-debt-policy";

describe("break-debt-policy", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("accrues debt on skipped/snoozed breaks", () => {
		const base = createBreakDebtState();
		const next = accrueBreakDebt(base, { deferredMinutes: 5, reason: "skip" });
		expect(next.balanceMinutes).toBe(5);
		expect(next.deferredBreakCount).toBe(1);
	});

	it("applies repayment without exceeding max break cap", () => {
		const state = { ...createBreakDebtState(), balanceMinutes: 20 };
		const repaid = applyBreakRepayment(state, {
			scheduledBreakMinutes: 15,
			maxBreakMinutes: 20,
		});

		expect(repaid.nextBreakMinutes).toBe(20);
		expect(repaid.repaidMinutes).toBe(5);
		expect(repaid.state.balanceMinutes).toBe(15);
	});

	it("decays debt over compliant cycles", () => {
		const state = { ...createBreakDebtState(), balanceMinutes: 6 };
		const decayed = decayBreakDebt(state, { compliantCycles: 2, decayMinutesPerCycle: 2 });
		expect(decayed.balanceMinutes).toBe(2);
	});

	it("persists and reloads debt state", () => {
		const state = { ...createBreakDebtState(), balanceMinutes: 9, deferredBreakCount: 3 };
		saveBreakDebtState(state);
		const loaded = loadBreakDebtState();
		expect(loaded.balanceMinutes).toBe(9);
		expect(loaded.deferredBreakCount).toBe(3);
	});
});
