/**
 * TaskTimelinePanel — Timeline with task creation panel
 *
 * Features:
 * - Left: Timeline with time labels and task blocks
 * - Right: Task creation form (same fields as TaskCreateDialog)
 * - Supports daily view (relative time from 6:00) and macro view (absolute timestamps)
 */

import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import { TextField } from "./TextField";
import { DateTimePicker, TimePicker } from "./DateTimePicker";
import { TaskTimeRemaining } from "./TaskTimeRemaining";
import type { Task } from "@/types/task";
import type { CreateTaskInput } from "@/hooks/useTaskStore";

type TaskKind = "fixed_event" | "flex_window" | "duration_only" | "break";
type ViewMode = "daily" | "macro";

interface TaskTimelinePanelProps {
	tasks: Task[];
	onCreateTask: (data: CreateTaskInput) => void;
	viewMode: ViewMode;
	date?: Date;           // for daily view
	startTime?: number;     // for macro view (base timestamp)
}

function localInputToIso(value: string): string | null {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toISOString();
}

/**
 * Calculate the start position (in minutes) for a task on the timeline.
 */
function calculateBlockStart(tasks: Task[], currentIndex: number): number {
	let offset = 0;
	for (let i = 0; i < currentIndex; i++) {
		offset += tasks[i].estimatedMinutes || 0;
	}
	return offset;
}

/**
 * Calculate daily view start time (6:00 AM)
 */
function calculateDailyStartTime(date: Date): number {
	const d = new Date(date);
	d.setHours(6, 0, 0, 0);
	return d.getTime();
}

/**
 * Generate time labels for the timeline (6:00 - 18:00 for daily view)
 */
function generateTimeLabels(): { label: string; offsetMinutes: number }[] {
	const labels: { label: string; offsetMinutes: number }[] = [];
	for (let hour = 6; hour < 18; hour++) {
		labels.push({
			label: `${String(hour).padStart(2, '0')}:00`,
			offsetMinutes: (hour - 6) * 60,
		});
	}
	return labels;
}

/**
 * Get state-based color class for timeline blocks
 */
function getBlockColorClass(state: Task["state"]): string {
	switch (state) {
		case "READY":
			return "bg-[var(--md-sys-color-surface-container-low)] border-[var(--md-sys-color-outline-variant)]";
		case "RUNNING":
			return "bg-[var(--md-sys-color-running)] border-[var(--md-sys-color-outline)]";
		case "PAUSED":
			return "bg-[var(--md-sys-color-paused)] border-[var(--md-sys-color-outline)]";
		case "DONE":
			return "bg-[var(--md-sys-color-done)] border-[var(--md-sys-color-outline)]";
		default:
			return "bg-[var(--md-sys-color-surface-container-low)] border-[var(--md-sys-color-outline-variant)]";
	}
}

export function TaskTimelinePanel({
	tasks,
	onCreateTask,
	viewMode,
	date,
	startTime,
}: TaskTimelinePanelProps) {
	// Form state
	const [newTitle, setNewTitle] = useState("");
	const [newDescription, setNewDescription] = useState("");
	const [newKind, setNewKind] = useState<TaskKind>("duration_only");
	const [newRequiredMinutes, setNewRequiredMinutes] = useState("25");
	const [newDurationTime, setNewDurationTime] = useState("00:25");
	const [newFixedStartAt, setNewFixedStartAt] = useState("");
	const [newFixedEndAt, setNewFixedEndAt] = useState("");
	const [newWindowStartAt, setNewWindowStartAt] = useState("");
	const [newWindowEndAt, setNewWindowEndAt] = useState("");
	const [newTags, setNewTags] = useState<string[]>([]);
	const [tagInput, setTagInput] = useState("");

	// Calculate timeline metadata
	const timelineMetadata = useMemo(() => {
		if (viewMode === "daily") {
			// Daily view: relative time from 6:00 AM
			const baseDate = date || new Date();
			const baseTime = calculateDailyStartTime(baseDate);
			return {
				baseTime,
				durationMinutes: 12 * 60, // 12 hours (6:00 - 18:00)
				timeLabels: generateTimeLabels(),
			};
		} else {
			// Macro view: absolute time from earliest task
			const baseTime = startTime || Date.now();
			const maxEndTime = tasks.reduce((max, task) => {
				if (task.fixedEndAt) {
					const end = new Date(task.fixedEndAt).getTime();
					return end > max ? end : max;
				}
				return max;
			}, baseTime);
			const durationMinutes = Math.max(120, Math.round((maxEndTime - baseTime) / (1000 * 60)));
			return {
				baseTime,
				durationMinutes,
				timeLabels: [], // TODO: generate for macro view
			};
		}
	}, [viewMode, tasks, date, startTime]);

	// Calculate task blocks
	const timelineBlocks = useMemo(() => {
		return tasks.map((task, index) => {
			const startOffset = calculateBlockStart(tasks, index);
			const width = task.estimatedMinutes || 60;
			return {
				task,
				startOffset,
				width,
			};
		});
	}, [tasks]);

	// Calculate required time for fixed event
	const fixedEventTime = useMemo(() => {
		if (newKind !== "fixed_event" || !newFixedStartAt || !newFixedEndAt) return "";
		const start = new Date(newFixedStartAt).getTime();
		const end = new Date(newFixedEndAt).getTime();
		if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return "";
		const minutes = Math.round((end - start) / (1000 * 60));
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
	}, [newKind, newFixedStartAt, newFixedEndAt]);

	const handleCreateTask = () => {
		if (!newTitle.trim()) return;
		const tags = newTags.filter((t) => t.length > 0);

		let requiredMinutes: number;
		if (newKind === "fixed_event" && newFixedStartAt && newFixedEndAt) {
			const start = new Date(newFixedStartAt).getTime();
			const end = new Date(newFixedEndAt).getTime();
			requiredMinutes = isNaN(start) || isNaN(end) || end <= start
				? 0
				: Math.round((end - start) / (1000 * 60));
		} else {
			requiredMinutes = Math.max(0, Number(newRequiredMinutes) || 0);
		}

		onCreateTask({
			title: newTitle.trim(),
			description: newDescription.trim() || undefined,
			tags,
			kind: newKind,
			requiredMinutes,
			estimatedMinutes: requiredMinutes,
			fixedStartAt: newKind === "fixed_event" ? localInputToIso(newFixedStartAt) : null,
			fixedEndAt: newKind === "fixed_event" ? localInputToIso(newFixedEndAt) : null,
			windowStartAt: newKind === "flex_window" ? localInputToIso(newWindowStartAt) : null,
			windowEndAt: newKind === "flex_window" ? localInputToIso(newWindowEndAt) : null,
		});

		// Reset form
		setNewTitle("");
		setNewDescription("");
		setNewKind("duration_only");
		setNewRequiredMinutes("25");
		setNewDurationTime("00:25");
		setNewFixedStartAt("");
		setNewFixedEndAt("");
		setNewWindowStartAt("");
		setNewWindowEndAt("");
		setNewTags([]);
		setTagInput("");
	};

	return (
		<div className="flex gap-4">
			{/* Left: Timeline */}
			<div className="flex-1">
				<div className="border border-[var(--md-ref-color-outline-variant)] rounded-xl p-4 bg-[var(--md-ref-color-surface-container-low)]">
					{/* Header */}
					<div className="mb-4">
						<h2 className="text-lg font-semibold text-[var(--md-ref-color-on-surface)]">
							{viewMode === "daily" ? "生活時間タイムライン" : "マクロ時間タイムライン"}
						</h2>
					</div>

					{/* Timeline */}
					<div className="relative">
						{/* Time labels */}
						<div className="relative mb-2" style={{ height: "24px" }}>
							{timelineMetadata.timeLabels.map(({ label, offsetMinutes }) => (
								<div
									key={label}
									className="absolute top-0 text-xs text-[var(--md-ref-color-on-surface-variant)]"
									style={{ left: `${offsetMinutes}px` }}
								>
									{label}
								</div>
							))}
						</div>

						{/* Task blocks */}
						<div className="relative" style={{ height: "48px" }}>
							{timelineBlocks.map(({ task, startOffset, width }) => (
								<div
									key={task.id}
									className={`
										timeline-block
										${getBlockColorClass(task.state)}
									`}
									style={{
										left: `${startOffset}px`,
										width: `${Math.max(width, 30)}px`, // minimum width for visibility
									}}
									data-state={task.state}
								>
									<TaskTimeRemaining task={task} />
									<span className="text-xs font-medium truncate">{task.title}</span>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>

			{/* Right: Create panel */}
			<div className="w-full lg:w-[360px]">
				<div className="lg:sticky lg:top-4 rounded-lg border border-[var(--md-ref-color-outline-variant)] p-4 bg-[var(--md-ref-color-surface-container-low)]">
					{/* Task type selector */}
					<div className="mb-3">
						<div
							className="inline-flex rounded-full border border-[var(--md-ref-color-outline-variant)] overflow-hidden"
							role="radiogroup"
							aria-label="Task type"
						>
							{[
								{ value: "duration_only", label: "タスク" },
								{ value: "fixed_event", label: "予定" },
								{ value: "flex_window", label: "柔軟タスク" },
								{ value: "break", label: "休憩" },
							].map((option, index) => {
								const isSelected = newKind === option.value;
								const isFirst = index === 0;
								const isLast = index === 3;
								return (
									<button
										key={option.value}
										type="button"
										role="radio"
										aria-checked={isSelected}
										onClick={() => setNewKind(option.value as TaskKind)}
										className={`
											relative h-10 px-4 text-sm font-medium
											flex items-center justify-center
											transition-all duration-150
											${isFirst ? "rounded-l-full" : ""}
											${isLast ? "rounded-r-full" : ""}
											${!isFirst ? "border-l border-[var(--md-ref-color-outline-variant)]" : ""}
										`.trim()}
										style={{
											backgroundColor: isSelected
												? "var(--md-ref-color-primary)"
												: "var(--md-ref-color-surface-container)",
											color: isSelected
												? "var(--md-ref-color-on-primary)"
												: "var(--md-ref-color-on-surface)",
										}}
									>
										{option.label}
									</button>
								);
							})}
						</div>
					</div>

					{/* Title */}
					<div className="mb-3">
						<TextField label="Title" value={newTitle} onChange={setNewTitle} variant="underlined" />
					</div>

					{/* Fixed event: Start/End */}
					{newKind === "fixed_event" && (
						<div className="grid grid-cols-2 gap-3 mb-3">
							<DateTimePicker label="Start" value={newFixedStartAt} onChange={setNewFixedStartAt} variant="underlined" />
							<DateTimePicker label="End" value={newFixedEndAt} onChange={setNewFixedEndAt} variant="underlined" />
						</div>
					)}

					{/* Required time */}
					<div className="mb-3">
						{newKind === "fixed_event" ? (
							<TextField
								label="Required time"
								value={fixedEventTime}
								onChange={() => {}}
								variant="underlined"
								disabled
							/>
						) : (
							<TimePicker
								label="Required time"
								value={newDurationTime}
								onChange={(value) => {
									setNewDurationTime(value);
									if (value) {
										const [hours, mins] = value.split(":").map(Number);
										const totalMinutes = (hours || 0) * 60 + (mins || 0);
										setNewRequiredMinutes(String(totalMinutes));
									}
								}}
								variant="underlined"
							/>
						)}
					</div>

					{/* Flex window: Window start/end */}
					{newKind === "flex_window" && (
						<div className="grid grid-cols-2 gap-3 mb-3">
							<DateTimePicker label="Window start" value={newWindowStartAt} onChange={setNewWindowStartAt} variant="underlined" />
							<DateTimePicker label="Window end" value={newWindowEndAt} onChange={setNewWindowEndAt} variant="underlined" />
						</div>
					)}

					{/* Tags */}
					<div className="mb-3">
						<label className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1">
							Tags
						</label>
						<div className="flex flex-wrap items-center gap-2 min-h-[40px] px-0 py-2 border-b border-[var(--md-ref-color-outline-variant)] focus-within:border-[var(--md-ref-color-primary)] transition-colors">
							{newTags.map((tag, index) => (
								<span
									key={`${tag}-${index}`}
									className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[var(--md-ref-color-surface-container-high)] text-sm text-[var(--md-ref-color-on-surface)]"
								>
									{tag}
									<button
										type="button"
										onClick={() => setNewTags(newTags.filter((_, i) => i !== index))}
										className="flex items-center justify-center w-4 h-4 rounded-full hover:bg-[var(--md-ref-color-surface-container-highest)] text-[var(--md-ref-color-on-surface-variant)]"
										aria-label={`Remove ${tag}`}
									>
										<Icon name="close" size={14} />
									</button>
								</span>
							))}
							<input
								type="text"
								value={tagInput}
								onChange={(e) => setTagInput(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter" && tagInput.trim()) {
										e.preventDefault();
										setNewTags([...newTags, tagInput.trim()]);
										setTagInput("");
									} else if (e.key === "Backspace" && !tagInput && newTags.length > 0) {
										setNewTags(newTags.slice(0, -1));
									}
								}}
								placeholder={newTags.length === 0 ? "Enterで追加..." : ""}
								className="flex-1 min-w-[80px] bg-transparent outline-none text-sm text-[var(--md-ref-color-on-surface)] placeholder:text-[var(--md-ref-color-on-surface-variant)]"
							/>
						</div>
					</div>

					{/* Memo */}
					<div className="mb-3">
						<label className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1">
							Memo
						</label>
						<textarea
							value={newDescription}
							onChange={(e) => setNewDescription(e.target.value)}
							placeholder="Add a description..."
							rows={2}
							className="
								w-full px-3 py-2
								bg-transparent
								border-b border-[var(--md-ref-color-outline-variant)]
								focus:border-[var(--md-ref-color-primary)]
								outline-none
								text-sm text-[var(--md-ref-color-on-surface)]
								placeholder:text-[var(--md-ref-color-on-surface-variant)]
								resize-none
								transition-colors duration-150
							"
						/>
					</div>

					{/* Action buttons */}
					<div className="mt-3 flex justify-between gap-2">
						<button
							type="button"
							onClick={() => {
								setNewTitle("");
								setNewDescription("");
								setNewKind("duration_only");
								setNewRequiredMinutes("25");
								setNewDurationTime("00:25");
								setNewFixedStartAt("");
								setNewFixedEndAt("");
								setNewWindowStartAt("");
								setNewWindowEndAt("");
								setNewTags([]);
								setTagInput("");
							}}
							className="h-12 px-6 text-sm font-medium transition-colors rounded-full"
							style={{
								borderRadius: "9999px",
								backgroundColor: "var(--md-ref-color-surface-container)",
								color: "var(--md-ref-color-on-surface)",
								border: "1px solid var(--md-ref-color-outline-variant)",
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.backgroundColor = "var(--md-ref-color-surface-container-high)";
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.backgroundColor = "var(--md-ref-color-surface-container)";
							}}
						>
							クリア
						</button>
						<button
							type="button"
							onClick={handleCreateTask}
							className="h-12 px-6 text-sm font-medium transition-colors rounded-full"
							style={{
								borderRadius: "9999px",
								backgroundColor: "var(--md-ref-color-primary)",
								color: "var(--md-ref-color-on-primary)",
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.backgroundColor = "var(--md-sys-color-primary-fixed-dim)";
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.backgroundColor = "var(--md-ref-color-primary)";
							}}
						>
							追加
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
