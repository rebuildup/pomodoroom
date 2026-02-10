/**
 * FocusHub — Timer + Board 統合ウィジェット.
 *
 * 現在のセッション情報を一つの視野に集約:
 * - 大きなカウントダウン
 * - 現在のタスク名とプロジェクト
 * - フェーズ＋ポモドーロ進捗
 * - 次の予定をコンパクトに
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { Icon } from "@/components/m3/Icon";
import type { ScheduleBlock, Task, BoardRowStatus } from "@/types/schedule";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatHHMM(iso: string): string {
	const d = new Date(iso);
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function blockTypeTag(type: ScheduleBlock["blockType"]): string {
	switch (type) {
		case "focus": return "FOCUS";
		case "break": return "BREAK";
		case "routine": return "ROUTINE";
		case "calendar": return "EVENT";
	}
}

function deriveStatus(block: ScheduleBlock, now: Date): BoardRowStatus {
	const start = new Date(block.startTime);
	const end = new Date(block.endTime);
	if (now >= end) return "done";
	if (now >= start) return "active";
	return "waiting";
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface FocusHubProps {
	/** Timer state — passed from parent so we don't double-instantiate hooks */
	timer: {
		remainingSeconds: number;
		progress: number;
		isActive: boolean;
		isPaused: boolean;
		isCompleted: boolean;
		stepType: string;
		start: () => void;
		pause: () => void;
		resume: () => void;
		skip: () => void;
		reset: () => void;
	};
	blocks: ScheduleBlock[];
	tasks: Task[];
	className?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function FocusHub({ timer, blocks, tasks, className = "" }: FocusHubProps) {
	const [now, setNow] = useState(() => new Date());

	useEffect(() => {
		const id = setInterval(() => setNow(new Date()), 1000);
		return () => clearInterval(id);
	}, []);

	const taskMap = useMemo(() => {
		const m = new Map<string, Task>();
		for (const t of tasks) m.set(t.id, t);
		return m;
	}, [tasks]);

	// Find current + next blocks
	const { currentBlock, nextBlocks } = useMemo(() => {
		const sorted = [...blocks].sort(
			(a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
		);
		const idx = sorted.findIndex((b) => new Date(b.endTime) > now);
		if (idx === -1) return { currentBlock: undefined, nextBlocks: [] as ScheduleBlock[] };
		const current = sorted[idx]!;
		const status = deriveStatus(current, now);
		return {
			currentBlock: status === "active" ? current : undefined,
			nextBlocks: status === "active" ? sorted.slice(idx + 1, idx + 3) : sorted.slice(idx, idx + 3),
		};
	}, [blocks, now]);

	const currentTask = currentBlock?.taskId ? taskMap.get(currentBlock.taskId) : undefined;

	const { remainingSeconds, progress, isActive, isPaused, stepType } = timer;
	const isFocus = stepType === "focus";

	const handleStart = useCallback(() => timer.start(), [timer]);
	const handlePause = useCallback(() => timer.pause(), [timer]);
	const handleResume = useCallback(() => timer.resume(), [timer]);
	const handleSkip = useCallback(() => timer.skip(), [timer]);
	const handleReset = useCallback(() => timer.reset(), [timer]);

	// Current time
	const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

	return (
		<div className={`flex flex-col overflow-hidden bg-(--color-surface) ${className}`}>
			{/* ── Top: Clock + Phase ── */}
			<div className="flex items-center justify-between px-4 pt-3 pb-1">
				<div className="flex items-center gap-2">
					<div
						className={`w-1.5 h-1.5 ${
							isActive ? "bg-(--color-text-primary) animate-pulse" : "bg-(--color-border)"
						}`}
					/>
					<span className="text-[10px] font-mono font-bold tracking-widest uppercase text-(--color-text-muted)">
						{isActive ? (isFocus ? "Focus" : "Break") : isPaused ? "Paused" : "Ready"}
					</span>
					{currentBlock && (
						<span className="text-[10px] font-mono font-bold tracking-wider text-(--color-bg) bg-(--color-text-primary) px-1.5 py-0.5">
							{blockTypeTag(currentBlock.blockType)}
						</span>
					)}
				</div>
				<span className="font-mono text-sm tabular-nums text-(--color-text-muted)">
					{clock}
				</span>
			</div>

			{/* ── Center: Timer + Context ── */}
			<div className="flex items-center gap-4 px-4 py-2">
				{/* Big countdown */}
				<div className="shrink-0">
					<div className="text-4xl font-mono font-bold tracking-tight tabular-nums text-(--color-text-primary) leading-none">
						{formatTime(remainingSeconds)}
					</div>
					{/* Progress bar */}
					<div className="w-full mt-2 h-0.5 bg-(--color-border) overflow-hidden">
						<div
							className="h-full transition-all duration-1000 ease-linear"
							style={{
								width: `${progress * 100}%`,
								backgroundColor: isFocus ? "var(--color-text-primary)" : "var(--color-text-secondary)",
							}}
						/>
					</div>
				</div>

				{/* Current session info */}
				<div className="flex-1 min-w-0">
					{currentTask ? (
						<>
							<div className="text-sm font-medium text-(--color-text-primary) truncate leading-tight">
								{currentTask.title}
							</div>
							{currentTask.projectId && (
								<div className="text-[10px] text-(--color-text-muted) truncate mt-0.5">
									{currentTask.tags[0] ?? ""}
								</div>
							)}
							{currentTask.estimatedPomodoros > 0 && (
								<div className="flex items-center gap-1 mt-1">
									{Array.from({ length: currentTask.estimatedPomodoros }, (_, i) => (
										<div
											key={i}
											className={`w-1.5 h-1.5 ${
												i < currentTask.completedPomodoros
													? "bg-(--color-text-primary)"
													: "bg-(--color-border)"
											}`}
										/>
									))}
									<span className="text-[9px] font-mono text-(--color-text-muted) ml-1 tabular-nums">
										{currentTask.completedPomodoros}/{currentTask.estimatedPomodoros}
									</span>
								</div>
							)}
						</>
					) : currentBlock ? (
						<div className="text-sm text-(--color-text-secondary)">
							{currentBlock.label ?? blockTypeTag(currentBlock.blockType)}
						</div>
					) : (
						<div className="text-xs text-(--color-text-muted)">
							No active session
						</div>
					)}
				</div>

				{/* Controls */}
				<div className="flex items-center gap-0.5 shrink-0">
					{isActive || isPaused ? (
						<>
							<button
								type="button"
								onClick={isActive ? handlePause : handleResume}
								className="p-2 text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-border) transition-colors"
								title={isActive ? "Pause" : "Resume"}
							>
								{isActive ? <Icon name="pause" size={16} /> : <Icon name="play_arrow" size={16} />}
							</button>
							<button
								type="button"
								onClick={handleSkip}
								className="p-2 text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-border) transition-colors"
								title="Skip"
							>
								<Icon name="skip_next" size={16} />
							</button>
							<button
								type="button"
								onClick={handleReset}
								className="p-2 text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-border) transition-colors"
								title="Reset"
							>
								<Icon name="replay" size={16} />
							</button>
						</>
					) : (
						<button
							type="button"
							onClick={handleStart}
							className="flex items-center gap-1.5 px-4 py-1.5 bg-(--color-text-primary) text-(--color-bg) text-xs font-medium transition-colors hover:opacity-80"
						>
							<Icon name="play_arrow" size={12} />
							Start
						</button>
					)}
				</div>
			</div>

			{/* ── Bottom: Next up queue ── */}
			{nextBlocks.length > 0 && (
				<>
					<div className="h-px bg-(--color-border) mx-4" />
					<div className="flex items-center gap-1 px-4 py-1.5">
						<span className="text-[9px] font-bold tracking-widest uppercase text-(--color-text-muted) shrink-0">
							Next
						</span>
						<div className="flex-1 flex items-center gap-2 overflow-hidden">
							{nextBlocks.map((block, i) => {
								const task = block.taskId ? taskMap.get(block.taskId) : undefined;
								return (
									<div key={block.id} className="flex items-center gap-1 min-w-0">
										{i > 0 && <Icon name="chevron_right" size={10} className="text-(--color-border) shrink-0" />}
										<span className="text-[10px] font-mono tabular-nums text-(--color-text-muted) shrink-0">
											{formatHHMM(block.startTime)}
										</span>
										<span className="text-[10px] text-(--color-text-secondary) truncate">
											{task?.title ?? block.label ?? blockTypeTag(block.blockType)}
										</span>
									</div>
								);
							})}
						</div>
					</div>
				</>
			)}
		</div>
	);
}
