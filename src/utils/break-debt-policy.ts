export interface BreakDebtState {
	balanceMinutes: number;
	deferredBreakCount: number;
	updatedAt: string;
}

export type BreakDebtReason = "skip" | "snooze";

export interface BreakDebtRepaymentResult {
	nextBreakMinutes: number;
	repaidMinutes: number;
	state: BreakDebtState;
}

const STORAGE_KEY = "pomodoroom-break-debt-v1";

export function createBreakDebtState(): BreakDebtState {
	return {
		balanceMinutes: 0,
		deferredBreakCount: 0,
		updatedAt: new Date().toISOString(),
	};
}

export function loadBreakDebtState(): BreakDebtState {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return createBreakDebtState();
		const parsed = JSON.parse(raw) as Partial<BreakDebtState>;
		const balanceMinutes = Math.max(0, Math.floor(Number(parsed.balanceMinutes ?? 0)));
		const deferredBreakCount = Math.max(0, Math.floor(Number(parsed.deferredBreakCount ?? 0)));
		const updatedAt =
			typeof parsed.updatedAt === "string" && parsed.updatedAt.length > 0
				? parsed.updatedAt
				: new Date().toISOString();
		return { balanceMinutes, deferredBreakCount, updatedAt };
	} catch {
		return createBreakDebtState();
	}
}

export function saveBreakDebtState(state: BreakDebtState): void {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function accrueBreakDebt(
	state: BreakDebtState,
	input: { deferredMinutes: number; reason: BreakDebtReason },
): BreakDebtState {
	const deferred = Math.max(0, Math.floor(input.deferredMinutes));
	if (deferred <= 0) return state;
	return {
		balanceMinutes: state.balanceMinutes + deferred,
		deferredBreakCount: state.deferredBreakCount + 1,
		updatedAt: new Date().toISOString(),
	};
}

export function applyBreakRepayment(
	state: BreakDebtState,
	input: { scheduledBreakMinutes: number; maxBreakMinutes: number },
): BreakDebtRepaymentResult {
	const scheduled = Math.max(1, Math.floor(input.scheduledBreakMinutes));
	const cap = Math.max(scheduled, Math.floor(input.maxBreakMinutes));
	const availableHeadroom = Math.max(0, cap - scheduled);
	const repaidMinutes = Math.min(state.balanceMinutes, availableHeadroom);
	const nextBreakMinutes = scheduled + repaidMinutes;
	return {
		nextBreakMinutes,
		repaidMinutes,
		state: {
			balanceMinutes: Math.max(0, state.balanceMinutes - repaidMinutes),
			deferredBreakCount: state.deferredBreakCount,
			updatedAt: new Date().toISOString(),
		},
	};
}

export function decayBreakDebt(
	state: BreakDebtState,
	input: { compliantCycles: number; decayMinutesPerCycle: number },
): BreakDebtState {
	const cycles = Math.max(0, Math.floor(input.compliantCycles));
	const perCycle = Math.max(0, Math.floor(input.decayMinutesPerCycle));
	const decay = cycles * perCycle;
	if (decay <= 0) return state;
	return {
		balanceMinutes: Math.max(0, state.balanceMinutes - decay),
		deferredBreakCount: state.deferredBreakCount,
		updatedAt: new Date().toISOString(),
	};
}