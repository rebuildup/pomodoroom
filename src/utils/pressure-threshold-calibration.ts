export interface PressureThresholdCalibration {
	overloadThreshold: number;
	criticalThreshold: number;
}

export interface PressureThresholdCalibrationInput {
	missedDeadlineRate: number;
	interruptionRate: number;
}

export interface PressureThresholdCalibrationHistoryEntry {
	timestamp: string;
	input: PressureThresholdCalibrationInput;
	before: PressureThresholdCalibration;
	after: PressureThresholdCalibration;
}

const CALIBRATION_KEY = "pressure_threshold_calibration";
const HISTORY_KEY = "pressure_threshold_calibration_history";
const DEFAULT_CALIBRATION: PressureThresholdCalibration = {
	overloadThreshold: 120,
	criticalThreshold: 70,
};
const MAX_STEP = 5;

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function readJson<T>(key: string, fallback: T): T {
	if (typeof window === "undefined" || !window.localStorage) return fallback;
	try {
		const raw = window.localStorage.getItem(key);
		if (!raw) return fallback;
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

function writeJson(key: string, value: unknown): void {
	if (typeof window === "undefined" || !window.localStorage) return;
	window.localStorage.setItem(key, JSON.stringify(value));
}

export function getPressureThresholdCalibration(): PressureThresholdCalibration {
	const raw = readJson<Partial<PressureThresholdCalibration>>(CALIBRATION_KEY, DEFAULT_CALIBRATION);
	return {
		overloadThreshold: clamp(Number(raw.overloadThreshold ?? DEFAULT_CALIBRATION.overloadThreshold), 90, 180),
		criticalThreshold: clamp(Number(raw.criticalThreshold ?? DEFAULT_CALIBRATION.criticalThreshold), 50, 90),
	};
}

export function getPressureThresholdHistory(): PressureThresholdCalibrationHistoryEntry[] {
	const history = readJson<PressureThresholdCalibrationHistoryEntry[]>(HISTORY_KEY, []);
	return Array.isArray(history) ? history : [];
}

function computeDelta(input: PressureThresholdCalibrationInput): number {
	const stressSignal = input.missedDeadlineRate * 0.6 + input.interruptionRate * 0.4;
	if (stressSignal >= 0.8) return -MAX_STEP;
	if (stressSignal >= 0.6) return -3;
	if (stressSignal <= 0.2) return 2;
	return 0;
}

export function applyPressureThresholdCalibration(
	input: PressureThresholdCalibrationInput,
): PressureThresholdCalibration {
	const normalized: PressureThresholdCalibrationInput = {
		missedDeadlineRate: clamp(input.missedDeadlineRate, 0, 1),
		interruptionRate: clamp(input.interruptionRate, 0, 1),
	};
	const before = getPressureThresholdCalibration();
	const delta = clamp(computeDelta(normalized), -MAX_STEP, MAX_STEP);

	const after: PressureThresholdCalibration = {
		overloadThreshold: clamp(before.overloadThreshold + delta, 90, 180),
		criticalThreshold: clamp(before.criticalThreshold + Math.round(delta / 2), 50, 90),
	};

	writeJson(CALIBRATION_KEY, after);

	const history = getPressureThresholdHistory();
	history.push({
		timestamp: new Date().toISOString(),
		input: normalized,
		before,
		after,
	});
	writeJson(HISTORY_KEY, history.slice(-200));

	return after;
}

export function resetPressureThresholdCalibration(): PressureThresholdCalibration {
	if (typeof window !== "undefined" && window.localStorage) {
		window.localStorage.removeItem(CALIBRATION_KEY);
		window.localStorage.removeItem(HISTORY_KEY);
	}
	return DEFAULT_CALIBRATION;
}

export function __resetPressureCalibrationForTests(): void {
	resetPressureThresholdCalibration();
}
