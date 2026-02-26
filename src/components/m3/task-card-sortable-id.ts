export function buildTaskCardSortableId(
	taskId: string | undefined,
	draggable: boolean | undefined,
): string {
	const baseId = taskId ?? "__empty__";
	if (draggable) return baseId;
	return `__taskcard-disabled-${baseId}`;
}
