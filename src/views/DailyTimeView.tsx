/**
 * DailyTimeView — Daily time timeline view
 *
 * Shows tasks on a timeline from 6:00 AM to 6:00 PM.
 * Tasks are positioned by their elapsed time.
 */

import { useMemo, useState } from "react";
import { Icon } from "@/components/m3/Icon";
import { TextField } from "@/components/m3/TextField";
import { TimePicker, DateTimePicker } from "@/components/m3/DateTimePicker";
import { TaskTimelinePanel } from "@/components/m3/TaskTimelinePanel";
import { useTaskStore } from "@/hooks/useTaskStore";

type TaskKind = "fixed_event" | "flex_window" | "duration_only" | "break";

function localInputToIso(value: string): string | null {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toISOString();
}

export default function DailyTimeView() {
	const taskStore = useTaskStore();

	// Use today's date for the timeline
	const [selectedDate, setSelectedDate] = useState(new Date());

	// Create form states
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

	// Calculate totals
	const totals = useMemo(() => {
		let totalEstimated = 0;
		let totalElapsed = 0;
		let tasksWithEstimate = 0;

		taskStore.tasks.forEach(task => {
			if (task.requiredMinutes) {
				totalEstimated += task.requiredMinutes;
				totalElapsed += task.elapsedMinutes || 0;
				tasksWithEstimate++;
			}
		});

		const totalRemaining = Math.max(0, totalEstimated - totalElapsed);
		const avgRemaining = tasksWithEstimate > 0 ? Math.round(totalRemaining / tasksWithEstimate) : 0;

		return {
			totalEstimated,
			totalElapsed,
			totalRemaining,
			avgRemaining,
			tasksWithEstimate,
		};
	}, [taskStore.tasks]);

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

		taskStore.createTask({
			title: newTitle.trim(),
			description: newDescription.trim() || undefined,
			tags,
			kind: newKind,
			requiredMinutes,
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

	return (
		<div className="h-full overflow-y-auto p-4 bg-[var(--md-ref-color-surface)]">
			<div className="max-w-7xl mx-auto px-4">
				{/* Header */}
				<div className="flex items-center justify-between mb-6">
					<div className="flex items-center gap-4">
						<h1 className="text-2xl font-semibold tracking-tight text-[var(--md-ref-color-on-surface)]">生活時間タイムライン</h1>
					</div>
					<div className="text-sm text-[var(--md-ref-color-on-surface-variant)]">
						{totals.totalRemaining}分残り ({totals.avgRemaining}分平均)
					</div>
				</div>

				{/* Summary cards */}
				<div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
					<div className="px-5 py-4 rounded-xl border border-[var(--md-ref-color-outline-variant)] bg-[var(--md-ref-color-surface-container-low)]">
						<div className="text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1">総予定時間</div>
						<div className="text-3xl font-bold tracking-tight text-[var(--md-ref-color-on-surface)]">{totals.totalEstimated}<span className="text-base font-normal ml-1">分</span></div>
					</div>
					<div className="px-5 py-4 rounded-xl border border-[var(--md-ref-color-outline-variant)] bg-[var(--md-ref-color-surface-container-low)]">
						<div className="text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1">経過時間</div>
						<div className="text-3xl font-bold tracking-tight text-[var(--md-ref-color-on-surface)]">{totals.totalElapsed}<span className="text-base font-normal ml-1">分</span></div>
					</div>
					<div className="px-5 py-4 rounded-xl border border-[var(--md-ref-color-outline-variant)] bg-[var(--md-ref-color-surface-container-low)]">
						<div className="text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1">残り時間</div>
						<div className="text-3xl font-bold tracking-tight text-[var(--md-ref-color-on-surface)]">{totals.totalRemaining}<span className="text-base font-normal ml-1">分</span></div>
					</div>
					<div className="px-5 py-4 rounded-xl border border-[var(--md-ref-color-outline-variant)] bg-[var(--md-ref-color-surface-container-low)]">
						<div className="text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1">タスク予定</div>
						<div className="text-3xl font-bold tracking-tight text-[var(--md-ref-color-on-surface)]">{totals.tasksWithEstimate}<span className="text-base font-normal ml-1">件</span></div>
					</div>
				</div>

				{/* Date selector */}
				<div className="mb-6 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => {
								const newDate = new Date(selectedDate);
								newDate.setDate(newDate.getDate() - 1);
								setSelectedDate(newDate);
							}}
							className="p-2 rounded-lg border border-[var(--md-ref-color-outline-variant)] bg-[var(--md-ref-color-surface-container-low)] hover:bg-[var(--md-ref-color-surface-container)] transition-colors"
							aria-label="Previous day"
						>
							<Icon name="chevron_left" size={20} className="text-[var(--md-ref-color-on-surface)]" />
						</button>
						<button
							type="button"
							onClick={() => {
								const newDate = new Date(selectedDate);
								newDate.setDate(newDate.getDate() + 1);
								setSelectedDate(newDate);
							}}
							className="p-2 rounded-lg border border-[var(--md-ref-color-outline-variant)] bg-[var(--md-ref-color-surface-container-low)] hover:bg-[var(--md-ref-color-surface-container)] transition-colors"
							aria-label="Next day"
						>
							<Icon name="chevron_right" size={20} className="text-[var(--md-ref-color-on-surface)]" />
						</button>
					</div>
					<div className="text-sm font-medium text-[var(--md-ref-color-on-surface)]">
						{selectedDate.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
					</div>
				</div>

				{/* Main content: 2-column layout with breakpoints */}
				<div className="flex flex-col lg:flex-row gap-4">
					{/* Left: Timeline (larger) */}
					<div className="flex-1 order-2 lg:order-1">
						<TaskTimelinePanel
							tasks={taskStore.tasks}
							viewMode="daily"
							date={selectedDate}
						/>
					</div>

					{/* Right: Summary panel (smaller) */}
					<div className="w-full lg:w-[280px] order-1 lg:order-2 space-y-3">
						{/* Create task panel */}
						<div className="rounded-lg border border-[var(--md-ref-color-outline-variant)] p-3 bg-[var(--md-ref-color-surface-container-low)]">
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
										{ value: "break", label: "休憩" },
									].map((option, index) => {
										const isSelected = newKind === option.value;
										const isFirst = index === 0;
										const isLast = index === 2;
										return (
											<button
												key={option.value}
												type="button"
												role="radio"
												aria-checked={isSelected}
												onClick={() => setNewKind(option.value as TaskKind)}
												className={`
													no-pill relative h-9 px-3 text-xs font-medium
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

							{/* Tags */}
							<div className="mb-3">
								<label className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1">
									Tags
								</label>
								<div className="flex flex-wrap items-center gap-2 min-h-[36px] px-0 py-2 border-b border-[var(--md-ref-color-outline-variant)] focus-within:border-[var(--md-ref-color-primary)] transition-colors">
									{newTags.map((tag, index) => (
										<span
											key={`${tag}-${index}`}
											className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--md-ref-color-surface-container-high)] text-xs text-[var(--md-ref-color-on-surface)]"
										>
											{tag}
											<button
												type="button"
												onClick={() => setNewTags(newTags.filter((_, i) => i !== index))}
												className="flex items-center justify-center w-3 h-3 rounded-full hover:bg-[var(--md-ref-color-surface-container-highest)] text-[var(--md-ref-color-on-surface-variant)]"
												aria-label={`Remove ${tag}`}
											>
												<Icon name="close" size={12} />
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
										className="flex-1 min-w-[60px] bg-transparent outline-none text-xs text-[var(--md-ref-color-on-surface)] placeholder:text-[var(--md-ref-color-on-surface-variant)]"
									/>
								</div>
							</div>

							{/* Action buttons */}
							<div className="flex justify-between gap-2">
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
									className="h-10 px-4 text-xs font-medium transition-colors rounded-full"
									style={{
										backgroundColor: "var(--md-ref-color-surface-container)",
										color: "var(--md-ref-color-on-surface)",
										border: "1px solid var(--md-ref-color-outline-variant)",
									}}
								>
									クリア
								</button>
								<button
									type="button"
									onClick={handleCreateTask}
									className="h-10 px-4 text-xs font-medium transition-colors rounded-full"
									style={{
										backgroundColor: "var(--md-ref-color-primary)",
										color: "var(--md-ref-color-on-primary)",
									}}
								>
									追加
								</button>
							</div>
						</div>

						{/* Stats summary */}
						<div className="rounded-lg border border-[var(--md-ref-color-outline-variant)] p-4 bg-[var(--md-ref-color-surface-container)]">
							<h3 className="text-sm font-medium text-[var(--md-ref-color-on-surface)] mb-3 flex items-center">
								<Icon name="analytics" size={20} className="mr-2" />
								今日のまとめ
							</h3>
							<div className="space-y-3">
								<div className="flex justify-between">
									<span className="text-sm text-[var(--md-ref-color-on-surface-variant)]">総予定時間</span>
									<span className="text-sm font-medium text-[var(--md-ref-color-on-surface)]">
										{totals.totalEstimated}分
									</span>
								</div>
								<div className="flex justify-between">
									<span className="text-sm text-[var(--md-ref-color-on-surface-variant)]">経過時間</span>
									<span className="text-sm font-medium text-[var(--md-ref-color-on-surface)]">
										{totals.totalElapsed}分
									</span>
								</div>
								<div className="flex justify-between">
									<span className="text-sm text-[var(--md-ref-color-on-surface-variant)]">残り時間</span>
									<span className="text-sm font-medium text-[var(--md-ref-color-on-surface)]">
										{totals.totalRemaining}分
									</span>
								</div>
								<div className="flex justify-between">
									<span className="text-sm text-[var(--md-ref-color-on-surface-variant)]">平均残り</span>
									<span className="text-sm font-medium text-[var(--md-ref-color-on-surface)]">
										{totals.avgRemaining}分
									</span>
								</div>
							</div>
						</div>

						{/* Task filters */}
						<div className="rounded-lg border border-[var(--md-ref-color-outline-variant)] p-4 bg-[var(--md-ref-color-surface-container)]">
							<h3 className="text-sm font-medium text-[var(--md-ref-color-on-surface)] mb-3 flex items-center">
								<Icon name="filter_list" size={20} className="mr-2" />
								フィルター
							</h3>
							<div className="space-y-2">
								{[
									{ label: "全て", count: taskStore.tasks.length, active: true },
									{ label: "準備中", count: taskStore.getTasksByState("READY").length, active: false },
									{ label: "実行中", count: taskStore.getTasksByState("RUNNING").length, active: false },
									{ label: "一時停止", count: taskStore.getTasksByState("PAUSED").length, active: false },
									{ label: "完了", count: taskStore.getTasksByState("DONE").length, active: false },
								].map((filter, index) => (
									<button
										key={index}
										type="button"
										onClick={() => {
											// TODO: Implement filter
											console.log('Filter:', filter.label);
										}}
										className={`
											no-pill w-full px-3 py-2 text-left text-sm rounded-lg transition-colors
											${filter.active
												? 'bg-[var(--md-ref-color-primary-container)] text-[var(--md-ref-color-on-primary-container)]'
												: 'hover:bg-[var(--md-ref-color-surface-container-high)] text-[var(--md-ref-color-on-surface)]'
											}
										`}
									>
										<div className="flex justify-between items-center">
											<span>{filter.label}</span>
											<span className="text-xs opacity-70">{filter.count}</span>
										</div>
									</button>
								))}
							</div>
						</div>
					</div>
				</div>

				{/* Empty state */}
				{taskStore.totalCount === 0 && (
					<div className="flex flex-col items-center justify-center py-16 text-[var(--md-ref-color-on-surface-variant)]">
						<Icon name="inbox" size={56} className="mb-4 opacity-40" />
						<p className="text-base font-medium mt-3">タスクがありません</p>
						<p className="text-sm mt-2 opacity-70">右のパネルからタスクを作成してください</p>
					</div>
				)}
			</div>
		</div>
	);
}
