/**
 * TaskStream — TaskShoot方式タスク管理パネル（Plan以降）.
 *
 * Doing / Interrupted は NowHub で表示されるため、
 * このパネルは Plan / Routine / Log / Defer を管理する.
 *
 * Font size policy:
 *   - 本文（タイトル等）: text-sm (14px)
 *   - メタデータ: text-xs (12px)
 *   - 極小テキスト廃止（9px, 10px は使わない）
 */
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import type { TaskStreamItem } from "@/types/taskstream";
import { TASK_STATUS_COLORS } from "@/types/taskstream";
import {
	Play,
	Check,
	SkipForward,
	Plus,
	ChevronDown,
	ChevronRight,
	RotateCcw,
	Clock,
	ArrowDown,
	Timer,
	ExternalLink,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TaskStreamProps {
	items: TaskStreamItem[];
	onAction: (taskId: string, action: StreamAction) => void;
	onAddTask?: (title: string) => void;
	/** コンパクトモード: ログ非表示、planは3件まで */
	compact?: boolean;
	/** ポップアウトボタン表示 */
	onPopOut?: () => void;
	className?: string;
}

export type StreamAction =
	| "start"       // plan → doing
	| "complete"    // doing → log
	| "interrupt"   // doing → interrupted + replan
	| "defer"       // plan → defer
	| "replan"      // defer/interrupted → plan
	| "delete";     // 削除

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatMinutes(m: number): string {
	if (m < 60) return `${m}m`;
	const h = Math.floor(m / 60);
	const rem = m % 60;
	return rem > 0 ? `${h}h${rem}m` : `${h}h`;
}

function formatTime(iso: string | undefined): string {
	if (!iso) return "";
	const d = new Date(iso);
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ─── Quick Entry ────────────────────────────────────────────────────────────

function StreamQuickEntry({ onAdd }: { onAdd?: (title: string) => void }) {
	const [active, setActive] = useState(false);
	const [value, setValue] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (active) inputRef.current?.focus();
	}, [active]);

	const handleSubmit = useCallback(() => {
		const title = value.trim();
		if (title) {
			onAdd?.(title);
			setValue("");
		}
		setActive(false);
	}, [value, onAdd]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter") handleSubmit();
			if (e.key === "Escape") { setValue(""); setActive(false); }
		},
		[handleSubmit],
	);

	if (!active) {
		return (
			<button
				type="button"
				className="flex items-center gap-2 w-full px-4 py-2 text-sm text-(--color-text-muted) hover:text-(--color-text-secondary) hover:bg-(--color-surface) transition-colors"
				onClick={() => setActive(true)}
			>
				<Plus size={14} />
				<span>タスク追加…</span>
			</button>
		);
	}

	return (
		<div className="flex items-center gap-2 px-4 py-2 bg-(--color-surface)">
			<Plus size={14} className="text-(--color-text-muted) shrink-0" />
			<input
				ref={inputRef}
				type="text"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={handleKeyDown}
				onBlur={handleSubmit}
				placeholder="タスク名 ~25m @project #tag"
				className="flex-1 bg-transparent text-sm text-(--color-text-primary) outline-none placeholder:text-(--color-text-muted) font-mono"
			/>
			<span className="text-xs text-(--color-text-muted) shrink-0">⏎</span>
		</div>
	);
}

// ─── Plan/Routine Item ──────────────────────────────────────────────────────

function PlanItem({
	item,
	onAction,
}: {
	item: TaskStreamItem;
	onAction: (taskId: string, action: StreamAction) => void;
}) {
	const isRoutine = item.status === "routine";
	const statusColors = TASK_STATUS_COLORS[item.status];

	return (
		<div className="group flex items-center gap-3 px-4 py-2 hover:bg-(--color-surface) transition-colors">
			{/* Start button */}
			<button
				type="button"
				onClick={() => onAction(item.id, "start")}
				className="shrink-0 p-1 text-(--color-text-muted) hover:text-(--color-text-primary) transition-colors"
				title="開始"
			>
				<Play size={14} />
			</button>

			{/* Status badge with color */}
			{isRoutine && (
				<span className={`text-xs font-bold tracking-wider px-1.5 py-0.5 shrink-0 ${statusColors.bg} ${statusColors.text} ${statusColors.border} border`}>
					RTN
				</span>
			)}

			{/* Title */}
			<span className="flex-1 text-sm text-(--color-text-secondary) truncate">
				{item.title}
			</span>

			{/* Estimate */}
			{item.estimatedMinutes > 0 && (
				<span className="shrink-0 text-xs font-mono text-(--color-text-muted) tabular-nums">
					~{formatMinutes(item.estimatedMinutes)}
				</span>
			)}

			{/* Tags (hover) */}
			{item.projectId && (
				<span className="shrink-0 text-xs text-(--color-text-muted) opacity-0 group-hover:opacity-100 transition-opacity">
					@{item.projectId.replace("p-", "")}
				</span>
			)}

			{/* Defer button (plan only, on hover) */}
			{!isRoutine && (
				<button
					type="button"
					onClick={() => onAction(item.id, "defer")}
					className="shrink-0 p-1 text-(--color-text-muted) hover:text-(--color-text-secondary) opacity-0 group-hover:opacity-100 transition-all"
					title="先送り"
				>
					<SkipForward size={14} />
				</button>
			)}
		</div>
	);
}

// ─── Log Item ───────────────────────────────────────────────────────────────

function LogItem({ item }: { item: TaskStreamItem }) {
	const wasInterrupted = item.interruptCount > 0;
	const timeRange = item.startedAt
		? `${formatTime(item.startedAt)}–${formatTime(item.completedAt)}`
		: "";

	return (
		<div className="flex items-center gap-3 px-4 py-1.5 opacity-60">
			<Check size={14} className="shrink-0 text-(--color-text-muted)" />
			<span className="flex-1 text-sm text-(--color-text-muted) truncate line-through">
				{item.title}
			</span>
			{timeRange && (
				<span className="shrink-0 text-xs font-mono text-(--color-text-muted) tabular-nums">
					{timeRange}
				</span>
			)}
			<span className="shrink-0 text-xs font-mono text-(--color-text-muted) tabular-nums">
				{formatMinutes(item.actualMinutes)}
			</span>
			{wasInterrupted && (
				<span className="shrink-0 text-xs text-(--color-text-muted)">
					⚡{item.interruptCount}
				</span>
			)}
		</div>
	);
}

// ─── Defer Item ─────────────────────────────────────────────────────────────

function DeferItem({
	item,
	onAction,
}: {
	item: TaskStreamItem;
	onAction: (taskId: string, action: StreamAction) => void;
}) {
	return (
		<div className="group flex items-center gap-3 px-4 py-1.5 opacity-50 hover:opacity-80">
			<SkipForward size={14} className="shrink-0 text-(--color-text-muted)" />
			<span className="flex-1 text-sm text-(--color-text-muted) truncate">
				{item.title}
			</span>
			<span className="shrink-0 text-xs font-mono text-(--color-text-muted) tabular-nums">
				~{formatMinutes(item.estimatedMinutes)}
			</span>
			<button
				type="button"
				onClick={() => onAction(item.id, "replan")}
				className="shrink-0 p-1 text-(--color-text-muted) hover:text-(--color-text-secondary) opacity-0 group-hover:opacity-100 transition-all"
				title="予定に戻す"
			>
				<RotateCcw size={14} />
			</button>
		</div>
	);
}

// ─── Section Header ─────────────────────────────────────────────────────────

function SectionHeader({
	label,
	icon,
	count,
	expanded,
	onToggle,
	extra,
}: {
	label: string;
	icon: React.ReactNode;
	count: number;
	expanded: boolean;
	onToggle: () => void;
	extra?: React.ReactNode;
}) {
	return (
		<button
			type="button"
			className="flex items-center gap-2 w-full px-4 py-2 hover:bg-(--color-surface) transition-colors text-left"
			onClick={onToggle}
		>
			{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
			{icon}
			<span className="text-xs font-bold tracking-widest uppercase text-(--color-text-muted)">
				{label}
			</span>
			<span className="text-xs font-mono text-(--color-text-muted) tabular-nums">
				{count}
			</span>
			{extra && <div className="ml-auto">{extra}</div>}
		</button>
	);
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function TaskStream({
	items,
	onAction,
	onAddTask,
	compact = false,
	onPopOut,
	className = "",
}: TaskStreamProps) {
	// Doing / Interrupted は NowHub で表示するためここではフィルタアウト
	const plan = useMemo(
		() => items.filter((i) => i.status === "plan").sort((a, b) => a.order - b.order),
		[items],
	);
	const routine = useMemo(
		() => items.filter((i) => i.status === "routine").sort((a, b) => a.order - b.order),
		[items],
	);
	const log = useMemo(
		() => items.filter((i) => i.status === "log").sort((a, b) => b.order - a.order),
		[items],
	);
	const deferred = useMemo(
		() => items.filter((i) => i.status === "defer"),
		[items],
	);

	const [expandPlan, setExpandPlan] = useState(true);
	const [expandRoutine, setExpandRoutine] = useState(true);
	const [expandLog, setExpandLog] = useState(!compact);
	const [expandDefer, setExpandDefer] = useState(false);

	// Summary (include doing for stats)
	const doing = useMemo(() => items.filter((i) => i.status === "doing"), [items]);
	const totalEstimate = useMemo(
		() => [...plan, ...routine, ...doing].reduce((s, i) => s + i.estimatedMinutes, 0),
		[plan, routine, doing],
	);
	const totalActual = useMemo(
		() => [...log, ...doing].reduce((s, i) => s + i.actualMinutes, 0),
		[log, doing],
	);

	const visiblePlan = compact ? plan.slice(0, 3) : plan;
	const hiddenPlanCount = compact ? Math.max(0, plan.length - 3) : 0;

	return (
		<div className={`flex flex-col overflow-hidden ${className}`}>
			{/* Header */}
			<div className="flex items-center shrink-0 px-4 py-2.5">
				<span className="text-xs font-bold tracking-widest uppercase text-(--color-text-muted)">
					TaskStream
				</span>
				<div className="flex-1" />
				<div className="flex items-center gap-3 text-xs font-mono text-(--color-text-muted) tabular-nums">
					<span title="見積もり合計">
						<Timer size={12} className="inline mr-1" />
						{formatMinutes(totalEstimate)}
					</span>
					<span title="実績合計">
						<Clock size={12} className="inline mr-1" />
						{formatMinutes(totalActual)}
					</span>
					<span>{doing.length}⚡</span>
					<span>{log.length}✓</span>
				</div>
				{onPopOut && (
					<button
						type="button"
						onClick={onPopOut}
						className="ml-2 p-1 text-(--color-text-muted) hover:text-(--color-text-secondary) transition-colors"
						title="別ウィンドウで開く"
					>
						<ExternalLink size={14} />
					</button>
				)}
			</div>

			<div className="h-px bg-(--color-border)" />
			<StreamQuickEntry onAdd={onAddTask} />
			<div className="h-px bg-(--color-border)" />

			{/* Scrollable content */}
			<div className="flex-1 overflow-y-auto">
				{/* Plan */}
				{plan.length > 0 && (
					<>
						<SectionHeader
							label="Plan"
							icon={<Clock size={14} className="text-gray-400" />}
							count={plan.length}
							expanded={expandPlan}
							onToggle={() => setExpandPlan(!expandPlan)}
							extra={
								<span className="text-xs font-mono text-(--color-text-muted) tabular-nums">
									~{formatMinutes(plan.reduce((s, i) => s + i.estimatedMinutes, 0))}
								</span>
							}
						/>
						{expandPlan && (
							<>
								{visiblePlan.map((item) => (
									<PlanItem key={item.id} item={item} onAction={onAction} />
								))}
								{hiddenPlanCount > 0 && (
									<div className="px-4 py-1.5 text-xs text-(--color-text-muted)">
										+{hiddenPlanCount} more…
									</div>
								)}
							</>
						)}
						<div className="h-px bg-(--color-border) mx-4" />
					</>
				)}

				{/* Routine */}
				{routine.length > 0 && !compact && (
					<>
						<SectionHeader
							label="Routine"
							icon={<RotateCcw size={14} className="text-purple-400" />}
							count={routine.length}
							expanded={expandRoutine}
							onToggle={() => setExpandRoutine(!expandRoutine)}
						/>
						{expandRoutine && routine.map((item) => (
							<PlanItem key={item.id} item={item} onAction={onAction} />
						))}
						<div className="h-px bg-(--color-border) mx-4" />
					</>
				)}

				{/* Log */}
				{log.length > 0 && !compact && (
					<>
						<SectionHeader
							label="Log"
							icon={<Check size={14} className="text-green-400" />}
							count={log.length}
							expanded={expandLog}
							onToggle={() => setExpandLog(!expandLog)}
						/>
						{expandLog && log.map((item) => (
							<LogItem key={item.id} item={item} />
						))}
						<div className="h-px bg-(--color-border) mx-4" />
					</>
				)}

				{/* Defer */}
				{deferred.length > 0 && !compact && (
					<>
						<SectionHeader
							label="Defer"
							icon={<ArrowDown size={14} className="text-purple-400" />}
							count={deferred.length}
							expanded={expandDefer}
							onToggle={() => setExpandDefer(!expandDefer)}
						/>
						{expandDefer && deferred.map((item) => (
							<DeferItem key={item.id} item={item} onAction={onAction} />
						))}
					</>
				)}
			</div>
		</div>
	);
}
