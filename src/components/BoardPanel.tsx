/**
 * BoardPanel — 駅の案内板風のスケジュール表示.
 *
 * 現在のブロック + 次の2ブロックを表示。
 * モノスペースフォントでフラットなデザイン。
 * Issue #86
 */
import { useState, useEffect, useMemo } from "react";
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

function blockTypeLabel(type: ScheduleBlock["blockType"]): string {
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

function remainingSecondsForBlock(block: ScheduleBlock, now: Date): number {
	const end = new Date(block.endTime);
	return Math.max(0, Math.round((end.getTime() - now.getTime()) / 1000));
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatusIndicator({ status }: { status: BoardRowStatus }) {
	if (status === "active") {
		return (
			<span className="relative flex h-2.5 w-2.5">
				<span className="absolute inline-flex h-full w-full animate-ping bg-(--color-text-primary) opacity-60" />
				<span className="relative inline-flex h-2.5 w-2.5 bg-(--color-text-primary)" />
			</span>
		);
	}
	if (status === "done") {
		return <span className="inline-flex h-2.5 w-2.5 bg-(--color-text-muted) opacity-40" />;
	}
	return <span className="inline-flex h-2.5 w-2.5 border border-(--color-border)" />;
}

function BoardRowItem({ row, isFirst }: { row: BoardRow; isFirst: boolean }) {
	const isActive = row.status === "active";
	const isDone = row.status === "done";

	return (
		<div
			className={`
				flex items-center gap-4 px-4 py-3 font-mono text-sm transition-colors
				${isFirst ? "bg-(--color-surface)" : ""}
				${isDone ? "opacity-40" : ""}
			`}
		>
			{/* Time */}
			<span className="w-12 shrink-0 text-(--color-text-muted) tabular-nums">
				{formatHHMM(row.block.startTime)}
			</span>

			{/* Status dot */}
			<StatusIndicator status={row.status} />

			{/* Block type badge */}
			<span
				className={`
					w-16 shrink-0 text-center text-[10px] font-bold tracking-wider py-0.5
					${row.block.blockType === "focus"
						? "bg-(--color-text-primary) text-(--color-bg)"
						: row.block.blockType === "break"
							? "bg-(--color-border) text-(--color-text-secondary)"
							: "bg-(--color-surface) text-(--color-text-secondary) border border-(--color-border)"
					}
				`}
			>
				{blockTypeLabel(row.block.blockType)}
			</span>

			{/* Label / Task title */}
			<span
				className={`flex-1 truncate ${
					isActive
						? "text-(--color-text-primary) font-medium"
						: "text-(--color-text-secondary)"
				}`}
			>
				{row.task?.title ?? row.block.label ?? "—"}
			</span>

			{/* Countdown / End time */}
			<span
				className={`shrink-0 tabular-nums ${
					isActive
						? "text-(--color-text-primary) font-bold text-base"
						: "text-(--color-text-muted) text-xs"
				}`}
			>
				{isActive && row.remainingSeconds != null
					? formatCountdown(row.remainingSeconds)
					: `→${formatHHMM(row.block.endTime)}`}
			</span>
		</div>
	);
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface BoardPanelProps {
	blocks: ScheduleBlock[];
	tasks: Task[];
	/** Number of upcoming rows to show (default: 3) */
	visibleRows?: number;
	className?: string;
}

export default function BoardPanel({
	blocks,
	tasks,
	visibleRows = 3,
	className = "",
}: BoardPanelProps) {
	const [now, setNow] = useState(() => new Date());

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

	const rows: BoardRow[] = useMemo(() => {
		// Find current + upcoming blocks
		const sorted = [...blocks].sort(
			(a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
		);

		// Find the first block that is active or in the future
		const currentIdx = sorted.findIndex((b) => {
			const end = new Date(b.endTime);
			return end > now;
		});

		if (currentIdx === -1) {
			// All blocks are in the past — show last few as done
			return sorted.slice(-visibleRows).map((block) => ({
				block,
				task: block.taskId ? taskMap.get(block.taskId) : undefined,
				status: "done" as BoardRowStatus,
			}));
		}

		const visible = sorted.slice(currentIdx, currentIdx + visibleRows);
		return visible.map((block) => {
			const status = deriveStatus(block, now);
			return {
				block,
				task: block.taskId ? taskMap.get(block.taskId) : undefined,
				status,
				remainingSeconds: status === "active" ? remainingSecondsForBlock(block, now) : undefined,
			};
		});
	}, [blocks, tasks, now, visibleRows, taskMap]);

	// Current time display
	const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

	return (
		<div className={`flex flex-col overflow-hidden ${className}`}>
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-2 bg-(--color-surface)">
				<div className="flex items-center gap-3">
					<span className="text-xs font-bold tracking-widest uppercase text-(--color-text-muted)">
						Schedule
					</span>
				</div>
				<span className="font-mono text-lg font-bold tabular-nums text-(--color-text-primary)">
					{currentTime}
				</span>
			</div>

			{/* Separator line */}
			<div className="h-px bg-(--color-border)" />

			{/* Rows */}
			<div className="flex-1 flex flex-col">
				{rows.length === 0 ? (
					<div className="flex-1 flex items-center justify-center text-sm text-(--color-text-muted)">
						No scheduled blocks
					</div>
				) : (
					rows.map((row, i) => (
						<div key={row.block.id}>
							{i > 0 && <div className="h-px bg-(--color-border) mx-4" />}
							<BoardRowItem row={row} isFirst={i === 0} />
						</div>
					))
				)}
			</div>
		</div>
	);
}
