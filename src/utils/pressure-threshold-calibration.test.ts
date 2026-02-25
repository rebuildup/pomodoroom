import { beforeEach, describe, expect, it } from "vitest";
import {
	__resetPressureCalibrationForTests,
	applyPressureThresholdCalibration,
	getPressureThresholdCalibration,
	resetPressureThresholdCalibration,
} from "./pressure-threshold-calibration";

describe("pressure-threshold-calibration", () => {
	beforeEach(() => {
		__resetPressureCalibrationForTests();
	});

	it("adjusts thresholds gradually without abrupt jumps", () => {
		const before = getPressureThresholdCalibration();
		const after = applyPressureThresholdCalibration({
			missedDeadlineRate: 0.9,
			interruptionRate: 0.85,
		});

		expect(Math.abs(after.overloadThreshold - before.overloadThreshold)).toBeLessThanOrEqual(5);
		expect(Math.abs(after.criticalThreshold - before.criticalThreshold)).toBeLessThanOrEqual(5);
	});

	// History recording removed - database-only architecture

	it("resets to defaults", () => {
		applyPressureThresholdCalibration({ missedDeadlineRate: 0.9, interruptionRate: 0.9 });
		const reset = resetPressureThresholdCalibration();

		expect(reset.overloadThreshold).toBe(120);
		expect(reset.criticalThreshold).toBe(70);
		// History no longer persisted
	});
});
