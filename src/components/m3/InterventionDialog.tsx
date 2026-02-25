/**
 * InterventionDialog — Unavoidable intervention dialog per CORE_POLICY.md §6.
 *
 * This dialog enforces the core principles:
 * - Always on top (cannot be ignored)
 * - No close button (action required)
 * - Shows "why this notification" + "what to do next"
 * - Visual intensity varies by Pressure mode
 *
 * Intervention triggers:
 * - TimerComplete: Next task proposal with context
 * - ActiveEmpty: Floating/Active candidate proposal
 * - PressureTransition: Mode change notification
 * - WaitResolved: Task resumption proposal
 * - BreakComplete: Next task proposal
 */
import { Button } from "./Button";
import { Icon } from "./Icon";
import type { PressureMode } from "@/types/pressure";

// ─── Types ────────────────────────────────────────────────────────────────────────

export type InterventionTrigger =
	| "timer_complete"
	| "active_empty"
	| "pressure_transition"
	| "wait_resolved"
	| "break_complete";

export interface InterventionDialogProps {
	/** The type of intervention trigger */
	trigger: InterventionTrigger;
	/** Current pressure mode for visual intensity */
	pressureMode: PressureMode;
	/** Title of the intervention */
	title: string;
	/** Message explaining "why this notification" */
	message: string;
	/** Context data to display */
	context?: InterventionContext;
	/** Action buttons */
	actions: InterventionAction[];
	/** Whether dialog is processing */
	isProcessing?: boolean;
	/** Action callback */
	onAction: (action: InterventionAction) => void;
}

export interface InterventionContext {
	/** Type of context data */
	type: "task" | "pressure" | "break" | "resume";
	/** Context title */
	title: string;
	/** Context items */
	items: ContextItem[];
}

export interface ContextItem {
	label: string;
	value: string;
	highlight?: boolean;
}

export interface InterventionAction {
	id: string;
	label: string;
	variant?: "filled" | "tonal" | "outlined" | "text";
	primary?: boolean;
	disabled?: boolean;
}

// ─── Visual Intensity Configuration ────────────────────────────────────────────────

const PRESSURE_INTENSITY: Record<
	PressureMode,
	{
		background: string;
		border: string;
		icon: string;
		containerClass: string;
	}
> = {
	normal: {
		background: "bg-[var(--md-sys-color-surface)]",
		border: "border-[var(--md-sys-color-outline)]",
		icon: "info",
		containerClass: "",
	},
	pressure: {
		background: "bg-[var(--md-sys-color-secondary-container)]",
		border: "border-[var(--md-sys-color-primary)]",
		icon: "warning",
		containerClass: "animate-pulse-border",
	},
	overload: {
		background: "bg-[var(--md-sys-color-error-container)]",
		border: "border-[var(--md-sys-color-error)]",
		icon: "error",
		containerClass: "animate-shake",
	},
};

// ─── Trigger Icons ─────────────────────────────────────────────────────────────────

const TRIGGER_ICONS: Record<InterventionTrigger, string> = {
	timer_complete: "check_circle",
	active_empty: "help_outline",
	pressure_transition: "warning",
	wait_resolved: "notifications_active",
	break_complete: "free_breakfast",
};

// ─── Component ─────────────────────────────────────────────────────────────────────

export function InterventionDialog({
	trigger,
	pressureMode,
	title,
	message,
	context,
	actions,
	isProcessing = false,
	onAction,
}: InterventionDialogProps) {
	const intensity = PRESSURE_INTENSITY[pressureMode];
	const triggerIcon = TRIGGER_ICONS[trigger];

	return (
		<div
			className={`relative w-full h-full flex flex-col items-center justify-center p-6 gap-4 ${intensity.background}`}
		>
			{/* Content with fade-in animation */}
			<div className="flex flex-col items-center gap-4 max-w-md text-center animate-[fade-slide-up_0.2s_ease-out]">
				{/* Icon */}
				<div className="relative">
					<div
						className={`w-16 h-16 rounded-full flex items-center justify-center ${
							pressureMode === "overload"
								? "bg-[var(--md-sys-color-error)]"
								: pressureMode === "pressure"
									? "bg-[var(--md-sys-color-primary)]"
									: "bg-[var(--md-sys-color-secondary-container)]"
						}`}
					>
						<Icon
							name={triggerIcon}
							size={32}
							color={
								pressureMode === "overload" || pressureMode === "pressure"
									? "var(--md-sys-color-on-primary)"
									: "var(--md-sys-color-on-secondary-container)"
							}
						/>
					</div>

					{/* Pressure indicator badge */}
					{pressureMode !== "normal" && (
						<div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[var(--md-sys-color-error)] flex items-center justify-center">
							<Icon name="priority_high" size={14} color="var(--md-sys-color-on-error)" />
						</div>
					)}
				</div>

				{/* Title and Message */}
				<div className="space-y-2">
					<h2 className="text-lg font-semibold text-[var(--md-sys-color-on-surface)]">
						{title}
					</h2>
					<p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
						{message}
					</p>
				</div>

				{/* Context */}
				{context && (
					<div className="w-full rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] p-3 text-left">
						<div className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-2">
							{context.title}
						</div>
						<div className="space-y-1">
							{context.items.map((item, index) => (
								<div
									key={index}
									className="flex items-center justify-between text-sm"
								>
									<span className="text-[var(--md-sys-color-on-surface-variant)]">
										{item.label}
									</span>
									<span
										className={`font-medium ${
											item.highlight
												? "text-[var(--md-sys-color-primary)]"
												: "text-[var(--md-sys-color-on-surface)]"
										}`}
									>
										{item.value}
									</span>
								</div>
							))}
						</div>
					</div>
				)}

				{/* Actions */}
				<div className="flex flex-col gap-2 w-full">
					{actions.map((action) => (
						<Button
							key={action.id}
							variant={action.primary ? "filled" : action.variant || "tonal"}
							fullWidth
							disabled={action.disabled || isProcessing}
							onClick={() => onAction(action)}
						>
							{action.label}
						</Button>
					))}
				</div>
			</div>

			{/* Processing overlay */}
			{isProcessing && (
				<div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-2xl animate-[fade-slide-up_0.1s_ease-out]">
					<div className="animate-spin">
						<Icon name="refresh" size={24} />
					</div>
				</div>
			)}
		</div>
	);
}

export default InterventionDialog;
