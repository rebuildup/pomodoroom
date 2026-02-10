/**
 * DaySchedulePanel — 日別予定表示.
 *
 * compact=true : 積み重ね形式（ブロックを縦に並べる）
 * compact=false: タイムライン形式（時間軸にマップ）
 */
import { useState, useMemo } from "react";
import { Icon } from "@/components/m3/Icon";
import type { ScheduleBlock, Task } from "@/types/schedule";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatHHMM(iso: string): string {
	const d = new Date(iso);
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function blockColor(type: ScheduleBlock["blockType"]): string {
	switch (type) {
		case "focus": return "var(--color-text-primary)";
		case "break": return "var(--color-text-muted)";
		case "routine": return "var(--color-border)";
		case "calendar": return "var(--color-accent-secondary)";
	}
}

function blockLabel(type: ScheduleBlock["blockType"]): string {
	switch (type) {
		case "focus": return "F";
		case "break": return "B";
		case "routine": return "R";
		case "calendar": return "E";
	}
}

function minutesBetween(a: string, b: string): number {
	return (new Date(b).getTime() - new Date(a).getTime()) / 60000;
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface DaySchedulePanelProps {
	blocks: ScheduleBlock[];
	tasks: Task[];
	dayStart: string; // HH:mm
	dayEnd: string;   // HH:mm
	className?: string;
}

// ─── Compact (Stacked) View ─────────────────────────────────────────────────

function StackedView({
	blocks,
	taskMap,
	now,
}: {
	blocks: ScheduleBlock[];
	taskMap: Map<string, Task>;
	now: Date;
}) {
	return (
		<div className="flex flex-col">
			{blocks.map((block) => {
				const start = new Date(block.startTime);
				const end = new Date(block.endTime);
				const isPast = now > end;
				const isNow = now >= start && now < end;
				const task = block.taskId ? taskMap.get(block.taskId) : undefined;
				const durationMin = Math.round(minutesBetween(block.startTime, block.endTime));

				return (
					<div
						key={block.id}
						className={`
							flex items-center gap-2 px-2 py-1 text-[11px] font-mono transition-colors
							${isNow ? "bg-(--color-surface)" : ""}
							${isPast ? "opacity-30" : ""}
						`}
					>
						{/* Time */}
						<span className="w-10 shrink-0 tabular-nums text-(--color-text-muted)">
							{formatHHMM(block.startTime)}
						</span>

						{/* Type indicator */}
						<div
							className="w-3.5 h-3.5 shrink-0 flex items-center justify-center text-[8px] font-bold"
							style={{
								backgroundColor: blockColor(block.blockType),
								color: block.blockType === "focus" ? "var(--color-bg)" : "var(--color-text-secondary)",
							}}
						>
							{blockLabel(block.blockType)}
						</div>

						{/* Label */}
						<span className="flex-1 truncate text-(--color-text-secondary)">
							{task?.title ?? block.label ?? "—"}
						</span>

						{/* Duration */}
						<span className="shrink-0 text-[10px] text-(--color-text-muted) tabular-nums">
							{durationMin}m
						</span>

						{/* Now indicator */}
						{isNow && (
							<div className="w-1 h-1 bg-(--color-text-primary) animate-pulse shrink-0" />
						)}
					</div>
				);
			})}
		</div>
	);
}

// ─── Expanded (Timeline) View ───────────────────────────────────────────────

function TimelineView({
	blocks,
	taskMap,
	dayStartMinutes,
	dayEndMinutes,
	now,
}: {
	blocks: ScheduleBlock[];
	taskMap: Map<string, Task>;
	dayStartMinutes: number;
	dayEndMinutes: number;
	now: Date;
}) {
	const totalMinutes = dayEndMinutes - dayStartMinutes;
	const hourCount = Math.ceil(totalMinutes / 60);

	// Now position
	const nowMinutes = now.getHours() * 60 + now.getMinutes();
	const nowPct = Math.max(0, Math.min(100, ((nowMinutes - dayStartMinutes) / totalMinutes) * 100));
	const showNow = nowMinutes >= dayStartMinutes && nowMinutes <= dayEndMinutes;

	return (
		<div className="relative" style={{ minHeight: hourCount * 24 }}>
			{/* Hour markers */}
			{Array.from({ length: hourCount + 1 }, (_, i) => {
				const hour = Math.floor(dayStartMinutes / 60) + i;
				const pct = (i * 60) / totalMinutes * 100;
				return (
					<div
						key={hour}
						className="absolute left-0 right-0 flex items-start"
						style={{ top: `${pct}%` }}
					>
						<span className="w-7 shrink-0 text-[8px] font-mono text-(--color-text-muted) tabular-nums -translate-y-1/2">
							{String(hour).padStart(2, "0")}
						</span>
						<div className="flex-1 h-px bg-(--color-border) opacity-50" />
					</div>
				);
			})}

			{/* Blocks */}
			<div className="absolute left-8 right-0 top-0 bottom-0">
				{blocks.map((block) => {
					const start = new Date(block.startTime);
					const end = new Date(block.endTime);
					const startMin = start.getHours() * 60 + start.getMinutes();
					const endMin = end.getHours() * 60 + end.getMinutes();
					const topPct = ((startMin - dayStartMinutes) / totalMinutes) * 100;
					const heightPct = ((endMin - startMin) / totalMinutes) * 100;
					const isPast = now > end;
					const isNow = now >= start && now < end;
					const task = block.taskId ? taskMap.get(block.taskId) : undefined;

					return (
						<div
							key={block.id}
							className={`absolute left-0 right-0 overflow-hidden transition-opacity ${isPast ? "opacity-30" : ""}`}
							style={{
								top: `${topPct}%`,
								height: `${Math.max(heightPct, 1.5)}%`,
								borderLeft: `2px solid ${blockColor(block.blockType)}`,
								backgroundColor: isNow ? "var(--color-surface)" : "transparent",
							}}
						>
							<div className="px-1.5 py-0.5 h-full flex items-start">
								<span className="text-[9px] font-mono text-(--color-text-secondary) truncate">
									{task?.title ?? block.label ?? blockLabel(block.blockType)}
								</span>
							</div>
						</div>
					);
				})}

				{/* Now line */}
				{showNow && (
					<div
						className="absolute left-0 right-0 h-px bg-(--color-text-primary) z-10"
						style={{ top: `${nowPct}%` }}
					>
						<div className="absolute -left-1 -top-0.5 w-1.5 h-1.5 bg-(--color-text-primary)" />
					</div>
				)}
			</div>
		</div>
	);
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function DaySchedulePanel({
	blocks,
	tasks,
	dayStart,
	dayEnd,
	className = "",
}: DaySchedulePanelProps) {
	const [expanded, setExpanded] = useState(false);

	const now = useMemo(() => new Date(), []);

	const taskMap = useMemo(() => {
		const m = new Map<string, Task>();
		for (const t of tasks) m.set(t.id, t);
		return m;
	}, [tasks]);

	// Filter to today's blocks only, sorted by start
	const todayBlocks = useMemo(
		() =>
			[...blocks]
				.filter((b) => {
					const d = new Date(b.startTime);
					return (
						d.getFullYear() === now.getFullYear() &&
						d.getMonth() === now.getMonth() &&
						d.getDate() === now.getDate()
					);
				})
				.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
		[blocks, now],
	);

	// Parse day boundaries
	const dayStartMinutes = useMemo(() => {
		const [h, m] = dayStart.split(":").map(Number);
		return (h ?? 0) * 60 + (m ?? 0);
	}, [dayStart]);

	const dayEndMinutes = useMemo(() => {
		const [h, m] = dayEnd.split(":").map(Number);
		return (h ?? 0) * 60 + (m ?? 0);
	}, [dayEnd]);

	// Stats
	const focusBlocks = todayBlocks.filter((b) => b.blockType === "focus").length;
	const totalEvents = todayBlocks.length;

	return (
		<div className={`flex flex-col overflow-hidden ${className}`}>
			{/* Header */}
			<div className="flex items-center gap-2 px-3 py-2 shrink-0">
				<span className="text-[10px] font-bold tracking-widest uppercase text-(--color-text-muted)">
					Today
				</span>
				<span className="text-[10px] font-mono text-(--color-text-muted) tabular-nums">
					{focusBlocks}F / {totalEvents} blocks
				</span>
				<div className="flex-1" />
				<button
					type="button"
					className="p-0.5 text-(--color-text-muted) hover:text-(--color-text-primary) transition-colors"
					onClick={() => setExpanded(!expanded)}
					title={expanded ? "Compact" : "Expand"}
				>
					{expanded ? <Icon name="expand_less" size={12} /> : <Icon name="expand_more" size={12} />}
				</button>
			</div>

			<div className="h-px bg-(--color-border)" />

			{/* Content */}
			<div className="flex-1 overflow-y-auto">
				{todayBlocks.length === 0 ? (
					<div className="flex items-center justify-center py-4 text-[11px] text-(--color-text-muted)">
						No blocks scheduled
					</div>
				) : expanded ? (
					<div className="px-1 py-2">
						<TimelineView
							blocks={todayBlocks}
							taskMap={taskMap}
							dayStartMinutes={dayStartMinutes}
							dayEndMinutes={dayEndMinutes}
							now={now}
						/>
					</div>
				) : (
					<StackedView blocks={todayBlocks} taskMap={taskMap} now={now} />
				)}
			</div>
		</div>
	);
}
