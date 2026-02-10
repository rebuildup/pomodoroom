/**
 * NowHub — 「いま」に集中するトップセクション（発車標レイアウト）.
 *
 * 電車の案内板のようにブロックが横に並ぶ:
 *   ┌──────────┬────────────────────┬──────────────┐
 *   │  Timer   │  Doing (実行中)    │  Next (次)    │
 *   │  25:00   │  ● Task A  12/25m  │  ▸ Task C    │
 *   │  ▶ ⏸ ⏭  │  ● Task B   3/15m  │  ▸ Task D    │
 *   │          │                    │  ▸ Task E    │
 *   └──────────┴────────────────────┴──────────────┘
 *
 * - 中断タスクがあれば Doing ブロック内にアラート表示
 * - 各ブロックは独立したカード風パネル
 * - 本文 14px+ / メタデータ 12px+ / 極小テキスト禁止
 */
import { useState, useEffect } from "react";
import {
	Play,
	Pause,
	SkipForward,
	RotateCcw,
	Check,
	ChevronRight,
	AlertCircle,
} from "lucide-react";
import type { TaskStreamItem } from "@/types/taskstream";
import { TASK_STATUS_COLORS } from "@/types/taskstream";
import type { StreamAction } from "@/components/TaskStream";
import { NextTaskCard } from "@/components/NextTaskCard";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTimer(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatMinutes(m: number): string {
	if (m < 60) return `${m}m`;
	const h = Math.floor(m / 60);
	const rem = m % 60;
	return rem > 0 ? `${h}h${rem}m` : `${h}h`;
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface NowHubProps {
	timer: {
		remainingSeconds: number;
		progress: number;
		isActive: boolean;
		isPaused: boolean;
		isCompleted: boolean;
		stepType: string;
		start: () => void | Promise<void>;
		pause: () => void | Promise<void>;
		resume: () => void | Promise<void>;
		skip: () => void | Promise<void>;
		reset: () => void | Promise<void>;
	};
	doingItems: TaskStreamItem[];
	nextItems: TaskStreamItem[];
	interruptedItems: TaskStreamItem[];
	allPlanItems: TaskStreamItem[];
	onAction: (taskId: string, action: StreamAction) => void;
	className?: string;
}

// ─── Timer Block ────────────────────────────────────────────────────────────

function TimerBlock({
	timer,
}: {
	timer: NowHubProps["timer"];
}) {
	const { remainingSeconds, progress, isActive, isPaused, stepType } = timer;
	const isFocus = stepType === "focus";

	return (
		<div className="flex flex-col items-center justify-center gap-2 px-6 py-4 min-w-44">
			{/* Phase label */}
			<div className="flex items-center gap-2">
				<div
					className={`w-1.5 h-1.5 ${
						isActive ? "bg-(--color-text-primary) animate-pulse" : "bg-(--color-border)"
					}`}
				/>
				<span className="text-xs font-mono font-bold tracking-widest uppercase text-(--color-text-muted)">
					{isActive ? (isFocus ? "Focus" : "Break") : isPaused ? "Paused" : "Ready"}
				</span>
			</div>

			{/* Big countdown */}
			<div className="text-4xl font-mono font-bold tracking-tight tabular-nums text-(--color-text-primary) leading-none">
				{formatTimer(remainingSeconds)}
			</div>

			{/* Progress bar */}
			<div className="w-full h-1 bg-(--color-border) overflow-hidden">
				<div
					className="h-full transition-all duration-1000 ease-linear"
					style={{
						width: `${progress * 100}%`,
						backgroundColor: isFocus ? "var(--color-text-primary)" : "var(--color-text-secondary)",
					}}
				/>
			</div>

			{/* Controls */}
			<div className="flex items-center gap-1 mt-1">
				{isActive || isPaused ? (
					<>
						<button
							type="button"
							onClick={isActive ? () => timer.pause() : () => timer.resume()}
							className="p-2 text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-border) transition-colors"
							title={isActive ? "一時停止" : "再開"}
						>
							{isActive ? <Pause size={18} /> : <Play size={18} />}
						</button>
						<button
							type="button"
							onClick={() => timer.skip()}
							className="p-2 text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-border) transition-colors"
							title="スキップ"
						>
							<SkipForward size={18} />
						</button>
						<button
							type="button"
							onClick={() => timer.reset()}
							className="p-2 text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-border) transition-colors"
							title="リセット"
						>
							<RotateCcw size={16} />
						</button>
					</>
				) : (
					<button
						type="button"
						onClick={() => timer.start()}
						className="flex items-center gap-1.5 px-5 py-2 bg-(--color-text-primary) text-(--color-bg) text-sm font-medium transition-colors hover:opacity-80"
					>
						<Play size={16} />
						Start
					</button>
				)}
			</div>
		</div>
	);
}

// ─── Doing Block ────────────────────────────────────────────────────────────

function DoingBlock({
	doingItems,
	interruptedItems,
	onAction,
}: {
	doingItems: TaskStreamItem[];
	interruptedItems: TaskStreamItem[];
	onAction: (taskId: string, action: StreamAction) => void;
}) {
	const empty = doingItems.length === 0 && interruptedItems.length === 0;

	return (
		<div className="flex-1 flex flex-col px-4 py-3 min-w-0 overflow-hidden">
			{/* Block header */}
			<div className="flex items-center gap-2 mb-2 shrink-0">
				<span className="text-xs font-bold tracking-widest uppercase text-(--color-text-muted)">
					Doing
				</span>
				{doingItems.length > 0 && (
					<span className="text-xs font-mono text-(--color-text-muted) tabular-nums">
						({doingItems.length})
					</span>
				)}
			</div>

			{/* Interrupted alerts (top priority) */}
			{interruptedItems.map((item) => (
				<InterruptedRow key={item.id} item={item} onAction={onAction} />
			))}

			{/* Active tasks */}
			{doingItems.map((item) => (
				<DoingRow key={item.id} item={item} onAction={onAction} />
			))}

			{/* Empty state */}
			{empty && (
				<div className="flex-1 flex items-center">
					<span className="text-sm text-(--color-text-muted)">
						タスクなし — Next から開始
					</span>
				</div>
			)}
		</div>
	);
}

function DoingRow({
	item,
	onAction,
}: {
	item: TaskStreamItem;
	onAction: (taskId: string, action: StreamAction) => void;
}) {
	const [elapsed, setElapsed] = useState(item.actualMinutes);

	useEffect(() => {
		if (!item.startedAt) return;
		const start = new Date(item.startedAt).getTime();
		const update = () => setElapsed(Math.floor((Date.now() - start) / 60000));
		update();
		const iv = setInterval(update, 15000);
		return () => clearInterval(iv);
	}, [item.startedAt]);

	const progress = item.estimatedMinutes > 0
		? Math.min(elapsed / item.estimatedMinutes, 1)
		: 0;
	const isOvertime = elapsed > item.estimatedMinutes && item.estimatedMinutes > 0;

	const statusColors = TASK_STATUS_COLORS[item.status];

	return (
		<div className={`flex items-center gap-2 py-1.5 group border-l-2 ${statusColors.border} pl-2`}>
			{/* Pulse dot with status color */}
			<div className={`w-1.5 h-1.5 ${statusColors.text.replace("text-", "bg-")} animate-pulse shrink-0`} />

			{/* Title + progress */}
			<div className="flex-1 min-w-0">
				<span className="text-sm font-medium text-(--color-text-primary) truncate block">
					{item.title}
				</span>
				<div className="flex items-center gap-2 mt-0.5">
					<div className="flex-1 h-1 bg-(--color-border) overflow-hidden max-w-32">
						<div
							className={`h-full transition-all duration-1000 ${isOvertime ? "bg-(--color-text-primary) opacity-60" : "bg-(--color-text-primary)"}`}
							style={{ width: `${progress * 100}%` }}
						/>
					</div>
					<span className={`text-xs font-mono tabular-nums shrink-0 ${isOvertime ? "text-(--color-text-primary) font-bold" : "text-(--color-text-muted)"}`}>
						{formatMinutes(elapsed)}/{formatMinutes(item.estimatedMinutes)}
					</span>
				</div>
			</div>

			{/* Inline actions */}
			<div className="flex items-center gap-1 shrink-0">
				<button
					type="button"
					onClick={() => onAction(item.id, "complete")}
					className="flex items-center gap-1 px-2.5 py-1 bg-(--color-text-primary) text-(--color-bg) text-xs font-medium transition-colors hover:opacity-80"
					title="完了"
				>
					<Check size={14} />
					完了
				</button>
				<button
					type="button"
					onClick={() => onAction(item.id, "interrupt")}
					className="flex items-center gap-1 px-2 py-1 border border-(--color-border) text-xs text-(--color-text-secondary) hover:bg-(--color-surface) transition-colors"
					title="中断"
				>
					<Pause size={12} />
				</button>
			</div>
		</div>
	);
}

function InterruptedRow({
	item,
	onAction,
}: {
	item: TaskStreamItem;
	onAction: (taskId: string, action: StreamAction) => void;
}) {
	const statusColors = TASK_STATUS_COLORS[item.status];

	return (
		<div className={`flex items-center gap-2 py-1.5 border-l-2 ${statusColors.border} pl-2 mb-1 ${statusColors.bg} bg-opacity-30`}>
			<AlertCircle size={14} className={`shrink-0 ${statusColors.text}`} />
			<div className="flex-1 min-w-0">
				<span className="text-sm text-(--color-text-secondary) truncate block">
					{item.title}
				</span>
				<span className="text-xs text-(--color-text-muted)">
					{formatMinutes(item.actualMinutes)} 経過・中断{item.interruptCount}回
				</span>
			</div>
			<button
				type="button"
				onClick={() => onAction(item.id, "replan")}
				className="flex items-center gap-1 px-2 py-1 text-xs text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-border) transition-colors shrink-0"
				title="再開"
			>
				<RotateCcw size={14} />
				再開
			</button>
		</div>
	);
}

// ─── Next Block ─────────────────────────────────────────────────────────────

function NextBlock({
	items,
	total,
	onAction,
}: {
	items: TaskStreamItem[];
	total: number;
	onAction: (taskId: string, action: StreamAction) => void;
}) {
	return (
		<div className="flex flex-col px-4 py-3 min-w-0 overflow-hidden" style={{ width: "clamp(180px, 30%, 280px)" }}>
			{/* Block header */}
			<div className="flex items-center gap-2 mb-2 shrink-0">
				<span className="text-xs font-bold tracking-widest uppercase text-(--color-text-muted)">
					Next
				</span>
				{total > 0 && (
					<span className="text-xs font-mono text-(--color-text-muted) tabular-nums">
						({total})
					</span>
				)}
			</div>

			{/* Items */}
			{items.length === 0 ? (
				<div className="flex-1 flex items-center">
					<span className="text-sm text-(--color-text-muted)">予定なし</span>
				</div>
			) : (
				items.map((item, i) => (
					<div key={item.id} className="flex items-center gap-2 py-1.5 group">
						<ChevronRight size={14} className="text-(--color-border) shrink-0" />
						<span className="flex-1 text-sm text-(--color-text-secondary) truncate">
							{item.title}
						</span>
						{item.estimatedMinutes > 0 && (
							<span className="text-xs font-mono text-(--color-text-muted) tabular-nums shrink-0">
								{formatMinutes(item.estimatedMinutes)}
							</span>
						)}
						{i === 0 && (
							<button
								type="button"
								onClick={() => onAction(item.id, "start")}
								className="flex items-center gap-1 px-2 py-1 text-xs text-(--color-text-muted) hover:text-(--color-text-primary) hover:bg-(--color-surface) transition-colors shrink-0 opacity-0 group-hover:opacity-100"
								title="開始"
							>
								<Play size={14} />
							</button>
						)}
					</div>
				))
			)}

			{total > items.length && (
				<span className="text-xs text-(--color-text-muted) mt-1">
					+{total - items.length} more
				</span>
			)}
		</div>
	);
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function NowHub({
	timer,
	doingItems,
	nextItems,
	interruptedItems,
	allPlanItems,
	onAction,
	className = "",
}: NowHubProps) {
	const visibleNext = nextItems.slice(0, 4);
	const [showSuggestion, setShowSuggestion] = useState(true);

	const handleStartSuggestedTask = (task: TaskStreamItem) => {
		onAction(task.id, "start");
	};

	const handleSkipSuggestion = () => {
		setShowSuggestion(false);
	};

	return (
		<div className={`flex flex-col bg-(--color-surface) ${className}`}>
			{/* ── Top Row: Timer + Doing + Next ──────────────────────────── */}
			<div className="flex overflow-hidden">
				{/* ── Block 1: Timer ──────────────────────────── */}
				<TimerBlock timer={timer} />

				<div className="w-px bg-(--color-border) self-stretch" />

				{/* ── Block 2: Doing + Interrupted ────────────── */}
				<DoingBlock
					doingItems={doingItems}
					interruptedItems={interruptedItems}
					onAction={onAction}
				/>

				<div className="w-px bg-(--color-border) self-stretch" />

				{/* ── Block 3: Next queue ─────────────────────── */}
				<NextBlock
					items={visibleNext}
					total={nextItems.length}
					onAction={onAction}
				/>
			</div>

			{/* ── Bottom Row: AI Task Suggestion ──────────────────────────── */}
			{showSuggestion && doingItems.length === 0 && (
				<>
					<div className="h-px bg-(--color-border)" />
					<div className="px-4 py-3">
						<NextTaskCard
							tasks={allPlanItems}
							energyLevel="medium"
							onStart={handleStartSuggestedTask}
							onSkip={handleSkipSuggestion}
						/>
					</div>
				</>
			)}
		</div>
	);
}
