/**
 * BoardPanel — Departure board UI (発車標風案内板).
 *
 * Train station departure board style with LED/flip-dot display aesthetic.
 * Three sections: Active (doing), Waiting (next), Done (log).
 *
 * Issue #86, #4
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ScheduleBlock, Task, BoardRow, BoardRowStatus } from "@/types/schedule";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatHHMM(iso: string): string {
	const d = new Date(iso);
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatCountdown(seconds: number): string {
	if (seconds <= 0) return "00:00";
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatDuration(minutes: number): string {
	if (minutes < 60) return `${minutes}m`;
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function blockTypeLabel(type: ScheduleBlock["blockType"]): string {
	switch (type) {
		case "focus": return "FOCUS";
		case "break": return "BREAK";
		case "routine": return "ROUTINE";
		case "calendar": return "EVENT";
		default: return "";
	}
}

function deriveStatus(block: ScheduleBlock, now: Date): BoardRowStatus {
	const start = new Date(block.startTime);
	const end = new Date(block.endTime);
	if (now >= end) return "done";
	if (now >= start) return "active";
	return "waiting";
}

function remainingSecondsForBlock(block: ScheduleBlock, now: Date): number {
	const end = new Date(block.endTime);
	return Math.max(0, Math.round((end.getTime() - now.getTime()) / 1000));
}

function getBlockDurationMinutes(block: ScheduleBlock): number {
	const start = new Date(block.startTime);
	const end = new Date(block.endTime);
	return Math.round((end.getTime() - start.getTime()) / 60000);
}

// ─── Sub-components ─────────────────────────────────────────────────────────

// LED-style blink animation for "現在実行中" indicator
function BlinkingIndicator({ isRunning }: { isRunning: boolean }) {
	return (
		<span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold tracking-wider ${
			isRunning ? "text-(--color-accent) animate-pulse" : "text-(--color-text-muted)"
		}`}>
			<span className="relative flex h-2 w-2">
				{isRunning && (
					<span className="absolute inline-flex h-full w-full animate-ping bg-(--color-accent) opacity-75" />
				)}
				<span className={`relative inline-flex h-2 w-2 rounded-full ${
					isRunning ? "bg-(--color-accent)" : "bg-(--color-text-muted)"
				}`} />
			</span>
			{isRunning ? "現在実行中" : "待機中"}
		</span>
	);
}

// Status indicator LED
function StatusIndicator({ status }: { status: BoardRowStatus }) {
	if (status === "active") {
		return (
			<span className="relative flex h-3 w-3">
				<span className="absolute inline-flex h-full w-full animate-ping bg-(--color-accent) opacity-75 rounded-full" />
				<span className="relative inline-flex h-3 w-3 bg-(--color-accent) rounded-full shadow-[0_0_8px_rgba(var(--color-accent-rgb),0.8)]" />
			</span>
		);
	}
	if (status === "done") {
		return <span className="inline-flex h-3 w-3 rounded-full bg-(--color-success) opacity-60" />;
	}
	return <span className="inline-flex h-3 w-3 rounded-full border-2 border-(--color-border) border-dashed" />;
}

// Flip animation for countdown numbers
function CountdownDisplay({ seconds, size = "text-base" }: { seconds: number; size?: string }) {
	const [prevSeconds, setPrevSeconds] = useState(seconds);
	const [isFlipping, setIsFlipping] = useState(false);

	useEffect(() => {
		if (seconds !== prevSeconds) {
			setIsFlipping(true);
			const timer = setTimeout(() => setIsFlipping(false), 300);
			setPrevSeconds(seconds);
			return () => clearTimeout(timer);
		}
		return undefined;
	}, [seconds, prevSeconds]);

	const formatted = formatCountdown(seconds);

	return (
		<span className={`font-mono font-bold tabular-nums ${size} transition-all duration-200 ${
			isFlipping ? "scale-110 text-(--color-accent)" : "scale-100"
		}`}>
			{formatted}
		</span>
	);
}

// Active section row (doing)
function ActiveRow({ row, onTaskClick }: { row: BoardRow; onTaskClick?: (task: Task) => void }) {
	const progress = row.remainingSeconds != null && row.remainingSeconds > 0
		? Math.max(0, 100 - (row.remainingSeconds / (getBlockDurationMinutes(row.block) * 60)) * 100)
		: 100;

	return (
		<div className="relative bg-(--color-surface) border border-(--color-border) p-4 font-mono">
			{/* Status header */}
			<div className="flex items-center justify-between mb-3">
				<BlinkingIndicator isRunning={row.status === "active"} />
				<div className="flex items-center gap-3">
					<CountdownDisplay seconds={row.remainingSeconds ?? 0} size="text-3xl" />
				</div>
			</div>

			{/* Task info */}
			<div className="space-y-2">
				<div className="flex items-center gap-3">
					<StatusIndicator status={row.status} />
					<span
						className="flex-1 text-lg font-medium text-(--color-text-primary) cursor-pointer hover:text-(--color-accent) truncate"
						onClick={() => row.task && onTaskClick?.(row.task)}
					>
						{row.task?.title ?? row.block.label ?? "—"}
					</span>
				</div>

				{/* Meta info */}
				<div className="flex items-center gap-4 text-xs text-(--color-text-muted)">
					<span className="font-mono">{formatHHMM(row.block.startTime)}-{formatHHMM(row.block.endTime)}</span>
					<span className="w-1 h-1 bg-(--color-border) rounded-full" />
					<span className="font-mono">{formatDuration(getBlockDurationMinutes(row.block))}</span>
					{row.block.blockType && (
						<>
							<span className="w-1 h-1 bg-(--color-border) rounded-full" />
							<span className="px-1.5 py-0.5 bg-(--color-bg) border border-(--color-border) text-[10px] font-bold tracking-wider">
								{blockTypeLabel(row.block.blockType)}
							</span>
						</>
					)}
				</div>

				{/* Progress bar */}
				{row.status === "active" && (
					<div className="mt-3 h-1.5 bg-(--color-bg) rounded-full overflow-hidden border border-(--color-border)">
						<div
							className="h-full bg-(--color-accent) transition-all duration-1000 ease-linear shadow-[0_0_8px_rgba(var(--color-accent-rgb),0.5)]"
							style={{ width: `${progress}%` }}
						/>
					</div>
				)}
			</div>
		</div>
	);
}

// Waiting section row (next)
function WaitingRow({ row, index, onTaskClick }: { row: BoardRow; index: number; onTaskClick?: (task: Task) => void }) {
	const startTime = new Date(row.block.startTime);
	const now = new Date();
	const waitMinutes = Math.max(0, Math.round((startTime.getTime() - now.getTime()) / 60000));

	return (
		<div className="flex items-center gap-3 px-4 py-2.5 border-b border-(--color-border) last:border-b-0 font-mono text-sm hover:bg-(--color-surface) transition-colors cursor-pointer"
			onClick={() => row.task && onTaskClick?.(row.task)}>
			{/* Queue number */}
			<span className="w-6 h-6 flex items-center justify-center text-xs font-bold bg-(--color-bg) border border-(--color-border) rounded text-(--color-text-muted)">
				{index + 1}
			</span>

			{/* Time */}
			<span className="w-12 shrink-0 text-(--color-text-secondary) tabular-nums">
				{formatHHMM(row.block.startTime)}
			</span>

			{/* Task title */}
			<span className="flex-1 truncate text-(--color-text-secondary)">
				{row.task?.title ?? row.block.label ?? "—"}
			</span>

			{/* Duration */}
			<span className="text-xs text-(--color-text-muted) tabular-nums">
				{formatDuration(getBlockDurationMinutes(row.block))}
			</span>

			{/* Wait time */}
			{waitMinutes > 0 && (
				<span className="text-xs text-(--color-text-muted) tabular-nums">
					あと{waitMinutes}分
				</span>
			)}
		</div>
	);
}

// Done section row (log)
function DoneRow({ row, onTaskClick }: { row: BoardRow; onTaskClick?: (task: Task) => void }) {
	const duration = getBlockDurationMinutes(row.block);

	return (
		<div className="flex items-center gap-3 px-4 py-2 border-b border-(--color-border) last:border-b-0 font-mono text-xs opacity-60 hover:opacity-80 transition-opacity cursor-pointer"
			onClick={() => row.task && onTaskClick?.(row.task)}>
			{/* Checkmark */}
			<span className="flex items-center justify-center w-4 h-4 text-(--color-success)">
				✓
			</span>

			{/* Completion time */}
			<span className="w-12 shrink-0 text-(--color-text-muted) tabular-nums">
				{formatHHMM(row.block.endTime)}
			</span>

			{/* Task title */}
			<span className="flex-1 truncate text-(--color-text-muted) line-through">
				{row.task?.title ?? row.block.label ?? "—"}
			</span>

			{/* Actual duration */}
			<span className="text-[10px] text-(--color-text-muted) tabular-nums">
				{formatDuration(duration)}
			</span>
		</div>
	);
}

// Section header
function SectionHeader({ title, count }: { title: string; count: number }) {
	return (
		<div className="flex items-center justify-between px-4 py-2 bg-(--color-surface) border-b border-(--color-border)">
			<span className="text-xs font-bold tracking-widest uppercase text-(--color-text-muted)">
				{title}
			</span>
			{count > 0 && (
				<span className="text-xs font-mono text-(--color-text-muted) bg-(--color-bg) px-1.5 py-0.5 rounded">
					{count}
				</span>
			)}
		</div>
	);
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface BoardPanelProps {
	blocks?: ScheduleBlock[];
	tasks?: Task[];
	/** Number of upcoming rows to show in waiting section (default: 3) */
	visibleWaiting?: number;
	/** Number of done rows to show (default: 3) */
	visibleDone?: number;
	/** Callback when task is clicked */
	onTaskClick?: (task: Task) => void;
	className?: string;
}

export default function BoardPanel({
	blocks: propBlocks,
	tasks: propTasks,
	visibleWaiting = 3,
	visibleDone = 3,
	onTaskClick,
	className = "",
}: BoardPanelProps) {
	const [now, setNow] = useState(() => new Date());
	const [blocks, setBlocks] = useState<ScheduleBlock[]>(propBlocks || []);
	const [tasks, setTasks] = useState<Task[]>(propTasks || []);
	const [isLoading, setIsLoading] = useState(false);

	// Fetch tasks from backend if not provided
	useEffect(() => {
		if (!propTasks) {
			setIsLoading(true);
			invoke<Task[]>("cmd_task_list", { category: "active" })
				.then(setTasks)
				.catch(console.error)
				.finally(() => setIsLoading(false));
		}
	}, [propTasks]);

	// Update local state when props change
	useEffect(() => {
		if (propBlocks) setBlocks(propBlocks);
	}, [propBlocks]);
	useEffect(() => {
		if (propTasks) setTasks(propTasks);
	}, [propTasks]);

	// Tick every second
	useEffect(() => {
		const id = setInterval(() => setNow(new Date()), 1000);
		return () => clearInterval(id);
	}, []);

	const taskMap = useMemo(() => {
		const m = new Map<string, Task>();
		for (const t of tasks) m.set(t.id, t);
		return m;
	}, [tasks]);

	// Partition blocks into sections
	const { activeRow, waitingRows, doneRows } = useMemo(() => {
		const sorted = [...blocks].sort(
			(a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
		);

		const active: BoardRow[] = [];
		const waiting: BoardRow[] = [];
		const done: BoardRow[] = [];

		for (const block of sorted) {
			const status = deriveStatus(block, now);
			const row: BoardRow = {
				block,
				task: block.taskId ? taskMap.get(block.taskId) : undefined,
				status,
				remainingSeconds: status === "active" ? remainingSecondsForBlock(block, now) : undefined,
			};

			if (status === "active") {
				active.push(row);
			} else if (status === "waiting") {
				waiting.push(row);
			} else {
				done.push(row);
			}
		}

		return {
			activeRow: active[0] || null,
			waitingRows: waiting.slice(0, visibleWaiting),
			doneRows: done.slice(-visibleDone).reverse(), // Most recent first
		};
	}, [blocks, taskMap, now, visibleWaiting, visibleDone]);

	// Current time display
	const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

	// Handle task click
	const handleTaskClick = useCallback((task: Task) => {
		onTaskClick?.(task);
	}, [onTaskClick]);

	return (
		<div className={`flex flex-col overflow-hidden bg-(--color-bg) ${className}`}>
			{/* Header with current time */}
			<div className="flex items-center justify-between px-4 py-2 bg-(--color-surface) border-b border-(--color-border)">
				<span className="text-xs font-bold tracking-widest uppercase text-(--color-text-muted)">
					Departure Board
				</span>
				<span className="font-mono text-lg font-bold tabular-nums text-(--color-text-primary)">
					{currentTime}
				</span>
			</div>

			{isLoading ? (
				<div className="flex-1 flex items-center justify-center text-sm text-(--color-text-muted)">
					Loading...
				</div>
			) : blocks.length === 0 ? (
				<div className="flex-1 flex items-center justify-center text-sm text-(--color-text-muted)">
					No scheduled blocks
				</div>
			) : (
				<>
					{/* Active Section */}
					{activeRow && (
						<div className="border-b border-(--color-border)">
							<SectionHeader title="現在実行中" count={1} />
							<ActiveRow row={activeRow} onTaskClick={handleTaskClick} />
						</div>
					)}

					{/* Waiting Section */}
					{waitingRows.length > 0 && (
						<div className="border-b border-(--color-border)">
							<SectionHeader title="次のタスク" count={waitingRows.length} />
							<div className="max-h-48 overflow-y-auto custom-scrollbar">
								{waitingRows.map((row, i) => (
									<WaitingRow key={row.block.id} row={row} index={i} onTaskClick={handleTaskClick} />
								))}
							</div>
						</div>
					)}

					{/* Done Section */}
					{doneRows.length > 0 && (
						<div className="flex-1 overflow-hidden flex flex-col">
							<SectionHeader title="完了ログ" count={doneRows.length} />
							<div className="flex-1 overflow-y-auto custom-scrollbar">
								{doneRows.map((row) => (
									<DoneRow key={row.block.id} row={row} onTaskClick={handleTaskClick} />
								))}
							</div>
						</div>
					)}
				</>
			)}

			{/* LED glow effect at bottom */}
			<div className="h-px bg-gradient-to-r from-transparent via-(--color-border) to-transparent opacity-50" />
		</div>
	);
}
