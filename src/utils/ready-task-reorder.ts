export interface DragStartInput {
	button: number;
	ctrlKey: boolean;
}

export interface ReadyPriorityUpdate {
	id: string;
	priority: number;
}

/**
 * Reorder mode is intentionally explicit to avoid accidental card movement.
 * - Middle mouse drag
 * - Ctrl + left mouse drag
 */
export function shouldStartReadyReorderDrag(input: DragStartInput): boolean {
	return input.button === 1 || (input.button === 0 && input.ctrlKey);
}

/**
 * Convert ordered ready task IDs into descending priority values.
 * Priority is mapped to [100..0] to keep existing scheduling semantics.
 */
export function buildReadyPriorityUpdates(orderedTaskIds: string[]): ReadyPriorityUpdate[] {
	if (orderedTaskIds.length === 0) return [];
	if (orderedTaskIds.length === 1) {
		return [{ id: orderedTaskIds[0], priority: 100 }];
	}

	const step = 100 / (orderedTaskIds.length - 1);
	return orderedTaskIds.map((id, index) => ({
		id,
		priority: Math.round(100 - index * step),
	}));
}
