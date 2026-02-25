/**
 * Material 3 Column Header Component
 *
 * Header for kanban columns (Ready, Deferred).
 * Shows column title and task count.
 *
 * Reference: https://m3.material.io/components/lists/overview
 */

import type React from "react";
import { Icon } from "./Icon";

export type ColumnId = "ready" | "deferred";

interface ColumnInfo {
	id: ColumnId;
	label: string;
	labelJa: string;
	icon: "circle" | "schedule";
}

const COLUMNS: readonly ColumnInfo[] = [
	{ id: "ready", label: "Ready", labelJa: "未着手", icon: "circle" },
	{ id: "deferred", label: "Deferred", labelJa: "先送り", icon: "schedule" },
] as const;

export interface ColumnHeaderProps {
	/** Column identifier */
	columnId: ColumnId;
	/** Number of tasks in this column */
	taskCount: number;
	/** Whether the column is being dragged over */
	isDragOver?: boolean;
	/** Locale for labels (default: en) */
	locale?: "en" | "ja";
	/** Additional CSS class */
	className?: string;
}

/**
 * Get column info by ID.
 */
function getColumnInfo(columnId: ColumnId): ColumnInfo {
	return COLUMNS.find((c) => c.id === columnId) ?? COLUMNS[0];
}

/**
 * Material 3 Column Header.
 *
 * Displays the column title with icon and task count.
 *
 * @example
 * ```tsx
 * <ColumnHeader columnId="ready" taskCount={5} />
 * <ColumnHeader columnId="doing" taskCount={2} isDragOver />
 * ```
 */
export const ColumnHeader: React.FC<ColumnHeaderProps> = ({
	columnId,
	taskCount,
	isDragOver = false,
	locale = "en",
	className = "",
}) => {
	const info = getColumnInfo(columnId);
	const label = locale === "ja" ? info.labelJa : info.label;

	return (
		<section
			className={`
				flex items-center gap-2 px-3 py-2
				border-b border-[var(--md-ref-color-outline-variant)]
				${isDragOver ? "bg-[var(--md-ref-color-secondary-container)]" : ""}
				${className}
			`.trim()}
			aria-labelledby={`column-header-${label}`}
		>
			<Icon
				name={info.icon}
				size={20}
				className="text-[var(--md-ref-color-on-surface-variant)]"
				aria-hidden="true"
			/>
			<span
				id={`column-header-${label}`}
				className="text-sm font-medium text-[var(--md-ref-color-on-surface)]"
			>
				{label}
			</span>
			<span
				className="ml-auto text-xs text-[var(--md-ref-color-on-surface-variant)]"
				title={`${taskCount} tasks`}
			>
				{taskCount}
			</span>
		</section>
	);
};

export default ColumnHeader;
