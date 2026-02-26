import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import DetachedWindowShell from "@/components/DetachedWindowShell";
import { DayTimelinePanel } from "@/components/m3/DayTimelinePanel";
import type { TaskOperation } from "@/components/m3/TaskOperations";
import { showActionNotification } from "@/hooks/useActionNotification";
import { toCandidateIso, toTimeLabel } from "@/utils/notification-time";
import { useTaskStore } from "@/hooks/useTaskStore";
import type { Task } from "@/types/task";

export interface RawScheduleBlock {
	id: string;
	block_type?: "focus" | "break" | "routine" | "calendar";
	blockType?: "focus" | "break" | "routine" | "calendar";
	task_id?: string | null;
	taskId?: string | null;
	start_time?: string;
	startTime?: string;
	end_time?: string;
	endTime?: string;
	label?: string | null;
	task_title?: string | null;
}

function parseMs(value: string | null | undefined): number | null {
	if (!value) return null;
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? null : parsed;
}

function getTaskRange(task: Task): { startMs: number; endMs: number } | null {
	const fallbackDurationMs = Math.max(1, task.requiredMinutes ?? 30) * 60_000;
	const fixedStart = parseMs(task.fixedStartAt);
	const fixedEnd = parseMs(task.fixedEndAt);
	if (fixedStart !== null) {
		const endMs = fixedEnd ?? fixedStart + fallbackDurationMs;
		return endMs > fixedStart ? { startMs: fixedStart, endMs } : null;
	}

	if (task.kind === "flex_window" && task.windowStartAt && task.windowEndAt && task.requiredMinutes) {
		const windowStart = parseMs(task.windowStartAt);
		const windowEnd = parseMs(task.windowEndAt);
		if (windowStart !== null && windowEnd !== null && windowEnd > windowStart) {
			const center = (windowStart + windowEnd) / 2;
			const halfDurationMs = (task.requiredMinutes * 60_000) / 2;
			return { startMs: center - halfDurationMs, endMs: center + halfDurationMs };
		}
	}

	if (task.state === "DONE") {
		const completedMs = parseMs(task.completedAt);
		if (completedMs !== null) {
			const durationMs = Math.max(1, task.elapsedMinutes || task.requiredMinutes || 30) * 60_000;
			const startedMs = parseMs(task.startedAt) ?? completedMs - durationMs;
			if (completedMs > startedMs) {
				return { startMs: startedMs, endMs: completedMs };
			}
		}
	}

	const startedMs = parseMs(task.startedAt);
	if (task.state === "RUNNING" && startedMs !== null) {
		const now = Date.now();
		return { startMs: startedMs, endMs: Math.max(now, startedMs + fallbackDurationMs) };
	}

	if (task.state === "PAUSED") {
		const pauseStart = startedMs ?? parseMs(task.estimatedStartAt) ?? parseMs(task.createdAt);
		const pausedMs = parseMs(task.pausedAt);
		if (pauseStart !== null && pausedMs !== null && pausedMs > pauseStart) {
			return { startMs: pauseStart, endMs: pausedMs };
		}
	}

	const fallbackStart =
		parseMs(task.estimatedStartAt) ??
		parseMs(task.windowStartAt) ??
		parseMs(task.updatedAt) ??
		parseMs(task.createdAt);
	if (fallbackStart === null) return null;
	const fallbackEnd = parseMs(task.windowEndAt) ?? fallbackStart + fallbackDurationMs;
	return fallbackEnd > fallbackStart ? { startMs: fallbackStart, endMs: fallbackEnd } : null;
}

function normalizeBlock(block: RawScheduleBlock) {
	return {
		id: block.id,
		blockType: block.block_type ?? block.blockType ?? "focus",
		taskId: block.task_id ?? block.taskId ?? null,
		startTime: block.start_time ?? block.startTime ?? null,
		endTime: block.end_time ?? block.endTime ?? null,
		label: block.label ?? block.task_title ?? null,
	};
}

function createSyntheticTaskFromBlock(
	block: ReturnType<typeof normalizeBlock>,
	startMs: number,
	endMs: number,
	nowMs: number,
): Task {
	const durationMinutes = Math.max(1, Math.round((endMs - startMs) / 60_000));
	const state: Task["state"] = nowMs >= endMs ? "DONE" : nowMs >= startMs ? "RUNNING" : "READY";
	const elapsedMinutes =
		state === "DONE"
			? durationMinutes
			: state === "RUNNING"
				? Math.max(0, Math.floor((nowMs - startMs) / 60_000))
				: 0;
	const blockLabel =
		block.label ??
		(block.blockType === "break"
			? "休憩"
			: block.blockType === "routine"
				? "ルーティン"
				: block.blockType === "calendar"
					? "予定"
					: "フォーカス");
	const startIso = new Date(startMs).toISOString();
	const endIso = new Date(endMs).toISOString();

	return {
		id: `__schedule__${block.id}`,
		title: blockLabel,
		description: undefined,
		estimatedPomodoros: Math.max(1, Math.ceil(durationMinutes / 25)),
		completedPomodoros: state === "DONE" ? Math.max(1, Math.floor(durationMinutes / 25)) : 0,
		completed: state === "DONE",
		state,
		kind: block.blockType === "break" ? "break" : "duration_only",
		requiredMinutes: durationMinutes,
		fixedStartAt: startIso,
		fixedEndAt: endIso,
		windowStartAt: null,
		windowEndAt: null,
		estimatedStartAt: startIso,
		tags: ["schedule-block", `block:${block.blockType}`],
		priority: null,
		category: "active",
		createdAt: startIso,
		elapsedMinutes,
		project: null,
		group: null,
		energy: "medium",
		updatedAt: endIso,
		completedAt: state === "DONE" ? endIso : null,
		pausedAt: null,
		startedAt: startIso,
		projectIds: [],
		groupIds: [],
		estimatedMinutes: null,
	};
}

export function buildTimelineTasksFromScheduleBlocks(
	tasks: Task[],
	rawBlocks: RawScheduleBlock[],
	nowMs: number = Date.now(),
): Task[] {
	const byId = new Map(tasks.map((task) => [task.id, task]));
	const output: Task[] = [];

	for (const raw of rawBlocks) {
		const block = normalizeBlock(raw);
		const startMs = parseMs(block.startTime);
		const endMs = parseMs(block.endTime);
		if (startMs === null || endMs === null || endMs <= startMs) continue;

		const task = block.taskId ? byId.get(block.taskId) : undefined;
		if (task) {
			output.push({
				...task,
				fixedStartAt: new Date(startMs).toISOString(),
				fixedEndAt: new Date(endMs).toISOString(),
			});
			continue;
		}

		output.push(createSyntheticTaskFromBlock(block, startMs, endMs, nowMs));
	}

	return output.sort((a, b) => {
		const aStart = parseMs(a.fixedStartAt) ?? parseMs(a.estimatedStartAt) ?? 0;
		const bStart = parseMs(b.fixedStartAt) ?? parseMs(b.estimatedStartAt) ?? 0;
		return aStart - bStart;
	});
}

export function filterTasksByRange(
	tasks: Task[],
	windowRange: { windowStartMs: number; windowEndMs: number },
): Task[] {
	return tasks
		.map((task) => {
			const range = getTaskRange(task);
			return range ? { task, ...range } : null;
		})
		.filter((item): item is { task: Task; startMs: number; endMs: number } => item !== null)
		.filter(
			({ startMs, endMs }) =>
				endMs >= windowRange.windowStartMs && startMs <= windowRange.windowEndMs,
		)
		.sort((a, b) => a.startMs - b.startMs)
		.map(({ task }) => task);
}

function buildDateWindow(date: Date): { windowStartMs: number; windowEndMs: number } {
	const start = new Date(date);
	start.setHours(0, 0, 0, 0);
	const end = new Date(start);
	end.setDate(end.getDate() + 1);
	return {
		windowStartMs: start.getTime(),
		windowEndMs: end.getTime(),
	};
}

export function filterTasksByDate(tasks: Task[], date: Date): Task[] {
	return filterTasksByRange(tasks, buildDateWindow(date));
}

export function shouldRegenerateScheduleBlocks(blocks: RawScheduleBlock[]): boolean {
	if (blocks.length === 0) return true;
	const normalized = blocks.map(normalizeBlock);
	const hasBreak = normalized.some((block) => block.blockType === "break");
	return !hasBreak;
}

export default function TimelinePanelWindowView() {
	const { tasks } = useTaskStore();
	const [scheduleDerivedTasks, setScheduleDerivedTasks] = useState<Task[] | null>(null);

	useEffect(() => {
		let cancelled = false;
		const load = async () => {
			const now = Date.now();
			const date = new Date(now);
			const { windowStartMs, windowEndMs } = buildDateWindow(date);
			const dateIso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
				date.getDate(),
			).padStart(2, "0")}`;
			try {
				let blocks = await invoke<RawScheduleBlock[]>("cmd_schedule_list_blocks", {
					startIso: new Date(windowStartMs).toISOString(),
					endIso: new Date(windowEndMs).toISOString(),
				});
				if (shouldRegenerateScheduleBlocks(blocks)) {
					blocks = await invoke<RawScheduleBlock[]>("cmd_schedule_generate", {
						dateIso,
						calendarEventsJson: null,
					});
				}
				if (cancelled) return;
				setScheduleDerivedTasks(buildTimelineTasksFromScheduleBlocks(tasks, blocks, now));
			} catch {
				if (cancelled) return;
				setScheduleDerivedTasks(null);
			}
		};

		void load();
		const onScheduleRefresh = () => {
			void load();
		};
		window.addEventListener("schedule:refresh", onScheduleRefresh as EventListener);
		return () => {
			cancelled = true;
			window.removeEventListener("schedule:refresh", onScheduleRefresh as EventListener);
		};
	}, [tasks]);

	const timelineTasks = useMemo(() => {
		return filterTasksByDate(scheduleDerivedTasks ?? tasks, new Date());
	}, [tasks, scheduleDerivedTasks]);

	const handleTimelineTaskOperation = async (taskId: string, operation: TaskOperation) => {
		const task = tasks.find((t) => t.id === taskId);
		if (!task) return;
		if (task.id.startsWith("__schedule__")) return;

		if (operation === "pause") {
			const nowMs = Date.now();
			const durationMs = Math.max(1, task.requiredMinutes ?? 25) * 60_000;

			const nextScheduledMs =
				tasks
					.filter((t) => t.id !== task.id && (t.state === "READY" || t.state === "PAUSED"))
					.map((t) => t.fixedStartAt ?? t.windowStartAt ?? t.estimatedStartAt)
					.filter((v): v is string => Boolean(v))
					.map((v) => Date.parse(v))
					.filter((ms) => !Number.isNaN(ms) && ms > nowMs)
					.sort((a, b) => a - b)[0] ?? null;

			const candidatesRaw: Array<{ label: string; atMs: number }> = [
				{ label: "15分後", atMs: nowMs + 15 * 60_000 },
				...(nextScheduledMs ? [{ label: "次タスク開始時刻", atMs: nextScheduledMs }] : []),
				...(nextScheduledMs
					? [{ label: "次タスク後に再開", atMs: nextScheduledMs + durationMs }]
					: []),
			];

			const unique = new Map<string, { label: string; iso: string }>();
			for (const c of candidatesRaw) {
				const iso = toCandidateIso(c.atMs);
				if (Date.parse(iso) <= nowMs) continue;
				if (!unique.has(iso)) unique.set(iso, { label: c.label, iso });
				if (unique.size >= 3) break;
			}
			const candidates = [...unique.values()];
			if (candidates.length === 0) {
				candidates.push({ label: "15分後", iso: toCandidateIso(nowMs + 15 * 60_000) });
			}

			await showActionNotification({
				title: "タスク中断",
				message: `${task.title} の再開時刻を選択してください`,
				buttons: [
					...candidates.map((c) => ({
						label: `${c.label} (${toTimeLabel(c.iso)})`,
						action: { interrupt_task: { id: task.id, resume_at: c.iso } as const },
					})),
					{ label: "キャンセル", action: { dismiss: null } },
				],
			});
			return;
		}

		if (operation === "start" || operation === "resume") {
			await showActionNotification({
				title: operation === "start" ? "タスク開始" : "タスク再開",
				message: task.title,
				buttons: [
					{
						label: operation === "start" ? "開始" : "再開",
						action: { start_task: { id: task.id, resume: operation === "resume" } },
					},
					{ label: "キャンセル", action: { dismiss: null } },
				],
			});
			return;
		}

		if (operation === "complete") {
			await showActionNotification({
				title: "タスク完了",
				message: task.title,
				buttons: [
					{ label: "完了", action: { complete_task: { id: task.id } } },
					{ label: "キャンセル", action: { dismiss: null } },
				],
			});
			return;
		}

		if (operation === "extend") {
			await showActionNotification({
				title: "タスク延長",
				message: task.title,
				buttons: [
					{ label: "+5分", action: { extend_task: { id: task.id, minutes: 5 } } },
					{ label: "+15分", action: { extend_task: { id: task.id, minutes: 15 } } },
					{ label: "+25分", action: { extend_task: { id: task.id, minutes: 25 } } },
					{ label: "キャンセル", action: { dismiss: null } },
				],
			});
			return;
		}

		if (operation === "defer" || operation === "postpone") {
			await showActionNotification({
				title: "タスク先送り",
				message: task.title,
				buttons: [
					{ label: "先送り", action: { postpone_task: { id: task.id } } },
					{ label: "キャンセル", action: { dismiss: null } },
				],
			});
			return;
		}

		if (operation === "delete") {
			await showActionNotification({
				title: "タスク削除",
				message: task.title,
				buttons: [
					{ label: "削除", action: { delete_task: { id: task.id } } },
					{ label: "キャンセル", action: { dismiss: null } },
				],
			});
		}
	};

	return (
		<DetachedWindowShell title="Timeline" showMinMax={true}>
			<div className="absolute inset-0  px-3 pb-3">
				<DayTimelinePanel
					tasks={timelineTasks}
					onTaskOperation={handleTimelineTaskOperation}
					canOperateTask={(task) => !task.id.startsWith("__schedule__")}
					hourHeight={52}
					timeLabelWidth={56}
					minCardHeight={50}
					laneGap={4}
					emptyMessage="直近24時間に表示するタスクはありません"
					className="h-full rounded-lg px-2 py-2"
					testId="timeline-window-panel"
				/>
			</div>
		</DetachedWindowShell>
	);
}
