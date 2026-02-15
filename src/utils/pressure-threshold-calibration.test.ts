import { beforeEach, describe, expect, it } from "vitest";
import {
	__resetPressureCalibrationForTests,
	applyPressureThresholdCalibration,
	getPressureThresholdCalibration,
	getPressureThresholdHistory,
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

	it("records auditable threshold history", () => {
		applyPressureThresholdCalibration({ missedDeadlineRate: 0.8, interruptionRate: 0.7 });
		applyPressureThresholdCalibration({ missedDeadlineRate: 0.2, interruptionRate: 0.1 });

		const history = getPressureThresholdHistory();
		expect(history.length).toBe(2);
		expect(history[0]?.before.overloadThreshold).toBeTypeOf("number");
		expect(history[0]?.after.overloadThreshold).toBeTypeOf("number");
		expect(history[0]?.timestamp).toBeTypeOf("string");
	});

	it("resets to defaults", () => {
		applyPressureThresholdCalibration({ missedDeadlineRate: 0.9, interruptionRate: 0.9 });
		const reset = resetPressureThresholdCalibration();

		expect(reset.overloadThreshold).toBe(120);
		expect(reset.criticalThreshold).toBe(70);
		expect(getPressureThresholdHistory()).toHaveLength(0);
	});
});
