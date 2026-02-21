/**
 * Material 3 Task Operations Component
 *
 * Unified operation button components for all M3 components:
 * - Board, Stream, Anchor components use the same operation buttons
 * - State-aware button visibility and enabled states
 * - Supports all task operations: start, complete, extend, postpone, pause, resume
 *
 * Reference: https://m3.material.io/components/buttons/overview
 */

import React, { useCallback } from "react";
import { Icon } from "./Icon";
import type { TaskState } from "@/types/task-state";
import { TRANSITION_LABELS } from "@/types/task-state";
import type { TaskData } from "@/hooks/useTaskOperations";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Operation type for task actions.
 */
export type TaskOperation =
	| "start"
	| "complete"
	| "extend"
	| "postpone"
	| "defer"
	| "pause"
	| "resume"
	| "delete"
	| "edit";

/**
 * Operation button configuration.
 */
export interface OperationButton {
	operation: TaskOperation;
	icon: string;
	label: string;
	labelJa: string;
	visible: boolean;
	enabled: boolean;
	variant: "filled" | "tonal" | "outlined" | "text";
}

/**
 * Props for operation callback.
 */
export interface OperationCallbackProps {
	taskId: string;
	operation: TaskOperation;
}

/**
 * Task operations component props.
 */
export interface TaskOperationsProps {
	/** Task data */
	task: TaskData;
	/** Callback when operation is triggered */
	onOperation: (props: OperationCallbackProps) => void | Promise<void>;
	/** Button variant (default: tonal) */
	variant?: "filled" | "tonal" | "outlined" | "text";
	/** Button size (default: medium) */
	size?: "small" | "medium" | "large";
	/** Compact layout (horizontal vs vertical) */
	compact?: boolean;
	/** Show labels alongside icons */
	showLabels?: boolean;
	/** Locale for labels (default: en) */
	locale?: "en" | "ja";
	/** Additional CSS class */
	className?: string;
	/** Disabled state for all buttons */
	disabled?: boolean;
}

// ─── Operation Configuration ────────────────────────────────────────────────────

/**
 * Button variant styles for Material 3.
 */
const BUTTON_VARIANTS = {
	filled: `
		bg-[var(--md-ref-color-primary)]
		text-[var(--md-ref-color-on-primary)]
		hover:bg-[var(--md-ref-color-primary)]
		shadow-sm
	`.trim(),
	tonal: `
		bg-[var(--md-ref-color-secondary-container)]
		text-[var(--md-ref-color-on-secondary-container)]
		hover:bg-[var(--md-ref-color-secondary-container)]
	`.trim(),
	outlined: `
		border border-[var(--md-ref-color-outline)]
		text-[var(--md-ref-color-primary)]
		hover:bg-[var(--md-ref-color-primary-container)]
		hover:text-[var(--md-ref-color-on-primary-container)]
	`.trim(),
	text: `
		text-[var(--md-ref-color-primary)]
		hover:bg-[var(--md-ref-color-primary-container)]
		hover:text-[var(--md-ref-color-on-primary-container)]
	`.trim(),
} as const;

/**
 * Size configurations for buttons.
 */
const BUTTON_SIZES = {
	small: "px-3 py-1.5 text-xs gap-1",
	medium: "px-4 py-2 text-sm gap-1.5",
	large: "px-5 py-2.5 text-base gap-2",
} as const;

const ICON_SIZES = {
	small: 16,
	medium: 18,
	large: 20,
} as const;

/**
 * Get operation buttons for a task state.
 */
export function getOperationButtons(
	state: TaskState,
	variant: "filled" | "tonal" | "outlined" | "text" = "tonal",
): OperationButton[] {
	const buttons: OperationButton[] = [];

	switch (state) {
		case "READY":
			buttons.push({
				operation: "start",
				icon: "play_arrow",
				label: TRANSITION_LABELS.READY.RUNNING!.en,
				labelJa: TRANSITION_LABELS.READY.RUNNING!.ja,
				visible: true,
				enabled: true,
				variant: variant === "text" ? "text" : "filled",
			});
			buttons.push({
				operation: "postpone",
				icon: "skip_next",
				label: TRANSITION_LABELS.READY.READY!.en,
				labelJa: TRANSITION_LABELS.READY.READY!.ja,
				visible: true,
				enabled: true,
				variant: "outlined",
			});
			break;

		case "RUNNING":
			buttons.push({
				operation: "complete",
				icon: "check",
				label: TRANSITION_LABELS.RUNNING.DONE!.en,
				labelJa: TRANSITION_LABELS.RUNNING.DONE!.ja,
				visible: true,
				enabled: true,
				variant: variant === "text" ? "text" : "filled",
			});
			buttons.push({
				operation: "extend",
				icon: "refresh",
				label: TRANSITION_LABELS.RUNNING.RUNNING!.en,
				labelJa: TRANSITION_LABELS.RUNNING.RUNNING!.ja,
				visible: true,
				enabled: true,
				variant: "tonal",
			});
			buttons.push({
				operation: "pause",
				icon: "pause",
				label: TRANSITION_LABELS.RUNNING.PAUSED!.en,
				labelJa: TRANSITION_LABELS.RUNNING.PAUSED!.ja,
				visible: true,
				enabled: true,
				variant: "outlined",
			});
			break;

		case "PAUSED":
			buttons.push({
				operation: "resume",
				icon: "play_arrow",
				label: TRANSITION_LABELS.PAUSED.RUNNING!.en,
				labelJa: TRANSITION_LABELS.PAUSED.RUNNING!.ja,
				visible: true,
				enabled: true,
				variant: variant === "text" ? "text" : "filled",
			});
			break;

		case "DONE":
			// No operations available for completed tasks
			break;
	}

	return buttons;
}

// ─── Operation Button Component ────────────────────────────────────────────────

export interface OperationButtonProps {
	button: OperationButton;
	onClick: () => void;
	size?: "small" | "medium" | "large";
	showLabel?: boolean;
	locale?: "en" | "ja";
	disabled?: boolean;
}

/**
 * Individual operation button component.
 */
export function OperationButton({
	button,
	onClick,
	size = "medium",
	showLabel = false,
	locale = "en",
	disabled = false,
}: OperationButtonProps) {
	const variantStyles = BUTTON_VARIANTS[button.variant];
	const sizeStyles = BUTTON_SIZES[size];
	const iconSize = ICON_SIZES[size];
	const label = locale === "ja" ? button.labelJa : button.label;

	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled || !button.enabled}
			className={`
				inline-flex items-center justify-center
				rounded-full
				font-medium
				transition-all duration-150 ease-in-out
				disabled:opacity-40 disabled:cursor-not-allowed
				${variantStyles}
				${sizeStyles}
			`.trim()}
			title={label}
			aria-label={label}
		>
			<Icon name={button.icon as any} size={iconSize} />
			{showLabel && <span>{label}</span>}
		</button>
	);
}

// ─── Task Operations Component ─────────────────────────────────────────────────

/**
 * Material 3 Task Operations.
 *
 * Displays available operation buttons for a task based on its state.
 *
 * @example
 * ```tsx
 * <TaskOperations
 *   task={task}
 *   onOperation={({ taskId, operation }) => handleOperation(taskId, operation)}
 *   variant="tonal"
 *   size="medium"
 *   showLabels={false}
 * />
 * ```
 */
export const TaskOperations: React.FC<TaskOperationsProps> = ({
	task,
	onOperation,
	variant = "tonal",
	size = "medium",
	compact = false,
	showLabels = false,
	locale = "en",
	className = "",
	disabled = false,
}) => {
	const handleOperationClick = useCallback((operation: TaskOperation) => {
		return () => {
			onOperation({ taskId: task.id, operation });
		};
	}, [task.id, onOperation]);

	const buttons = getOperationButtons(task.state, variant);

	if (buttons.length === 0) {
		return null;
	}

	const containerClass = compact
		? "flex items-center gap-1"
		: "flex items-center gap-2";

	return (
		<div className={`${containerClass} ${className}`.trim()}>
			{buttons.map((button) => (
				<OperationButton
					key={button.operation}
					button={button}
					onClick={handleOperationClick(button.operation)}
					size={size}
					showLabel={showLabels}
					locale={locale}
					disabled={disabled}
				/>
			))}
		</div>
	);
};

// ─── Compact Operation Row Component ───────────────────────────────────────────

export interface CompactTaskOperationsProps extends Omit<TaskOperationsProps, "showLabels"> {
	/** Maximum number of buttons to show (rest go into overflow) */
	maxButtons?: number;
	/** Callback for overflow menu click */
	onOverflow?: () => void;
	/** Show labels in compact mode */
	showLabels?: boolean;
}

/**
 * Compact operations bar with overflow support.
 *
 * Shows a limited number of buttons with an overflow menu indicator.
 */
export const CompactTaskOperations: React.FC<CompactTaskOperationsProps> = ({
	task,
	onOperation,
	maxButtons = 2,
	size = "small",
	locale = "en",
	className = "",
	disabled = false,
	onOverflow,
	showLabels = false,
}) => {
	const buttons = getOperationButtons(task.state, "tonal");
	const visibleButtons = buttons.slice(0, maxButtons);
	const hasOverflow = buttons.length > maxButtons;

	const handleOperationClick = useCallback((operation: TaskOperation) => {
		return () => {
			onOperation({ taskId: task.id, operation });
		};
	}, [task.id, onOperation]);

	return (
		<div className={`flex items-center gap-1 ${className}`.trim()}>
			{visibleButtons.map((button) => (
				<button
					key={button.operation}
					type="button"
					onClick={handleOperationClick(button.operation)}
					disabled={disabled || !button.enabled}
					className={`
						inline-flex items-center gap-1.5 rounded-full
						${showLabels ? "h-7 px-2.5 text-xs" : "p-1.5"}
						bg-transparent border-2 border-[var(--md-ref-color-outline)]
						text-[var(--md-ref-color-on-surface)]
						hover:bg-[var(--md-ref-color-surface-container-low)]
						transition-all duration-150 ease-in-out
						disabled:opacity-40 disabled:cursor-not-allowed
					`.trim()}
					title={locale === "ja" ? button.labelJa : button.label}
					aria-label={locale === "ja" ? button.labelJa : button.label}
				>
					<Icon name={button.icon as any} size={ICON_SIZES[size]} />
					{showLabels ? (
						<span>{locale === "ja" ? button.labelJa : button.label}</span>
					) : null}
				</button>
			))}

			{hasOverflow && (
				<button
					type="button"
					onClick={onOverflow}
					disabled={disabled}
					className={`
						p-1.5 rounded-full border-2 border-[var(--md-ref-color-outline)]
						text-[var(--md-ref-color-on-surface-variant)]
						hover:bg-[var(--md-ref-color-surface-container-low)]
						transition-all duration-150 ease-in-out
						disabled:opacity-40 disabled:cursor-not-allowed
					`.trim()}
					title="More operations"
					aria-label="More operations"
				>
					<Icon name="more_horiz" size={ICON_SIZES[size]} />
				</button>
			)}
		</div>
	);
};

// ─── Floating Action Button Component ───────────────────────────────────────────

export interface FABOperationProps {
	/** Task data */
	task: TaskData;
	/** Primary operation to show */
	operation: TaskOperation;
	/** Callback when FAB is clicked */
	onPress: () => void | Promise<void>;
	/** FAB size (default: medium) */
	size?: "small" | "medium" | "large";
	/** Extended FAB with label */
	extended?: boolean;
	/** Locale for labels (default: en) */
	locale?: "en" | "ja";
	/** Additional CSS class */
	className?: string;
}

/**
 * Floating Action Button for primary task operation.
 *
 * Shows a prominent button for the most important operation on a task.
 */
export const FABOperation: React.FC<FABOperationProps> = ({
	task,
	operation,
	onPress,
	size = "medium",
	extended = false,
	locale = "en",
	className = "",
}) => {
	const buttons = getOperationButtons(task.state, "filled");
	const primaryButton = buttons.find(b => b.operation === operation);

	if (!primaryButton) {
		return null;
	}

	const label = locale === "ja" ? primaryButton.labelJa : primaryButton.label;
	const iconSize = size === "large" ? 24 : size === "medium" ? 20 : 18;

	return (
		<button
			type="button"
			onClick={onPress}
			className={`
				inline-flex items-center justify-center
				rounded-full
				font-medium
				bg-[var(--md-ref-color-primary-container)]
				text-[var(--md-ref-color-on-primary-container)]
				hover:bg-[var(--md-ref-color-primary-container)]
				shadow-md hover:shadow-lg
				transition-all duration-200 ease-in-out
				${extended ? "px-6 py-3 gap-2" : size === "large" ? "w-14 h-14" : size === "medium" ? "w-12 h-12" : "w-10 h-10"}
				${className}
			`.trim()}
			aria-label={label}
		>
			<Icon name={primaryButton.icon as any} size={iconSize} />
			{extended && <span>{label}</span>}
		</button>
	);
};

// ─── Operation Menu Component ──────────────────────────────────────────────────

export interface OperationMenuProps {
	/** Task data */
	task: TaskData;
	/** Callback when operation is selected */
	onSelect: (operation: TaskOperation) => void;
	/** Whether menu is open */
	open?: boolean;
	/** Callback when menu should close */
	onClose?: () => void;
	/** Menu anchor element */
	anchorEl?: HTMLElement | null;
	/** Locale for labels (default: en) */
	locale?: "en" | "ja";
}

/**
 * Dropdown menu with all available operations.
 *
 * Can be used as an overflow menu or standalone operation selector.
 */
export const OperationMenu: React.FC<OperationMenuProps> = ({
	task,
	onSelect,
	open = false,
	onClose,
	anchorEl,
	locale = "en",
}) => {
	const buttons = getOperationButtons(task.state, "text");

	const handleSelect = useCallback((operation: TaskOperation) => {
		return () => {
			onSelect(operation);
			onClose?.();
		};
	}, [onSelect, onClose]);

	if (!open || !anchorEl) {
		return null;
	}

	const rect = anchorEl.getBoundingClientRect();

	return (
		<div
			className={`
				fixed z-50
				min-w-[160px]
				bg-[var(--md-ref-color-surface-container-high)]
				rounded-lg
				shadow-lg
				border border-[var(--md-ref-color-outline-variant)]
				p-1
			`.trim()}
			style={{
				top: `${rect.bottom + 4}px`,
				left: `${rect.left}px`,
			}}
		>
			{buttons.map((button) => {
				const label = locale === "ja" ? button.labelJa : button.label;

				return (
					<button
						key={button.operation}
						type="button"
						onClick={handleSelect(button.operation)}
						disabled={!button.enabled}
						className={`
							w-full flex items-center gap-3
							px-3 py-2 rounded-md
							text-sm font-medium
							text-[var(--md-ref-color-on-surface)]
							hover:bg-[var(--md-ref-color-surface-container-highest)]
							disabled:opacity-40 disabled:cursor-not-allowed
							transition-colors duration-150 ease-in-out
						`.trim()}
					>
						<Icon name={button.icon as any} size={18} />
						<span>{label}</span>
					</button>
				);
			})}

			{buttons.length === 0 && (
				<div className="px-3 py-2 text-sm text-[var(--md-ref-color-on-surface-variant)]">
					{locale === "ja" ? "利用可能な操作がありません" : "No operations available"}
				</div>
			)}
		</div>
	);
};

export default TaskOperations;
