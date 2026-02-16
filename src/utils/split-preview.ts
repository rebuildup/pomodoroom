export type SplitPreviewKind = "focus" | "break";

export interface SplitPreviewItem {
	id: string;
	kind: SplitPreviewKind;
	title: string;
	durationMinutes: number;
}

export interface SplitPreviewValidationIssue {
	id: string;
	field: "duration" | "order" | "total";
	message: string;
}

export interface SplitPreviewValidationResult {
	isValid: boolean;
	totalMinutes: number;
	expectedTotalMinutes: number;
	issues: SplitPreviewValidationIssue[];
}

export interface BuildSplitPreviewOptions {
	title: string;
	totalMinutes: number;
	focusBlockMinutes?: number;
	breakMinutes?: number;
}

export function buildInitialSplitPreview(
	options: BuildSplitPreviewOptions
): SplitPreviewItem[] {
	const totalMinutes = Math.max(1, Math.floor(options.totalMinutes));
	const focusBlockMinutes = Math.max(10, Math.floor(options.focusBlockMinutes ?? 50));
	const breakMinutes = Math.max(5, Math.floor(options.breakMinutes ?? 10));
	const baseTitle = options.title.trim() || "Untitled Task";
	const plan: SplitPreviewItem[] = [];

	let remaining = totalMinutes;
	let focusIndex = 1;
	let breakIndex = 1;

	while (remaining > 0) {
		const focusDuration = Math.min(focusBlockMinutes, remaining);
		plan.push({
			id: `focus-${focusIndex}`,
			kind: "focus",
			title: `${baseTitle} (${focusIndex})`,
			durationMinutes: focusDuration,
		});
		remaining -= focusDuration;
		focusIndex += 1;

		if (remaining <= 0) {
			break;
		}

		const breakDuration = Math.min(breakMinutes, remaining);
		plan.push({
			id: `break-${breakIndex}`,
			kind: "break",
			title: `Break (${breakIndex})`,
			durationMinutes: breakDuration,
		});
		remaining -= breakDuration;
		breakIndex += 1;
	}

	return plan;
}

export function validateSplitPreview(
	items: SplitPreviewItem[],
	expectedTotalMinutes: number
): SplitPreviewValidationResult {
	const issues: SplitPreviewValidationIssue[] = [];
	const expected = Math.max(1, Math.floor(expectedTotalMinutes));
	const total = items.reduce((sum, item) => sum + Math.floor(item.durationMinutes || 0), 0);

	items.forEach((item, index) => {
		const duration = Math.floor(item.durationMinutes || 0);
		if (duration <= 0) {
			issues.push({
				id: item.id,
				field: "duration",
				message: `${item.title} の時間は 1 分以上にしてください`,
			});
		}
		if (item.kind === "break" && duration < 5) {
			issues.push({
				id: item.id,
				field: "duration",
				message: `${item.title} は 5 分以上にしてください`,
			});
		}

		if (item.kind === "break" && index === 0) {
			issues.push({
				id: item.id,
				field: "order",
				message: "最初のセグメントを休憩にはできません",
			});
		}

		if (item.kind === "break" && index === items.length - 1) {
			issues.push({
				id: item.id,
				field: "order",
				message: "最後のセグメントを休憩にはできません",
			});
		}

		const next = items[index + 1];
		if (item.kind === "break" && next?.kind === "break") {
			issues.push({
				id: item.id,
				field: "order",
				message: "休憩セグメントを連続で配置できません",
			});
		}
	});

	if (total !== expected) {
		issues.push({
			id: "total",
			field: "total",
			message: `合計時間が一致しません（現在 ${total} 分 / 目標 ${expected} 分）`,
		});
	}

	return {
		isValid: issues.length === 0,
		totalMinutes: total,
		expectedTotalMinutes: expected,
		issues,
	};
}

