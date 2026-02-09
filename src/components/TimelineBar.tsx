/**
 * TimelineBar — 横軸マルチレーン・タイムライン.
 *
 * 最大5レーンの並行タスクを表示。
 * 現在時刻から就寝時刻までの水平バーに色分けブロックを表示。
 * マウスホバーでブロック詳細をツールチップ表示。
 * Issue #87
 */
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import type { ScheduleBlock } from "@/types/schedule";

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeToMinutes(iso: string): number {
	const d = new Date(iso);
	return d.getHours() * 60 + d.getMinutes();
}

function minutesToHHMM(mins: number): string {
	const h = Math.floor(mins / 60) % 24;
	const m = mins % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function blockColor(type: ScheduleBlock["blockType"]): string {
	switch (type) {
		case "focus": return "var(--color-text-primary)";
		case "break": return "var(--color-border)";
		case "routine": return "var(--color-text-muted)";
		case "calendar": return "var(--color-text-secondary)";
	}
}

function blockColorClass(type: ScheduleBlock["blockType"]): string {
	switch (type) {
		case "focus": return "bg-(--color-text-primary)";
		case "break": return "bg-(--color-border)";
		case "routine": return "bg-(--color-text-muted)";
		case "calendar": return "bg-(--color-text-secondary)";
	}
}

// ─── Tooltip ────────────────────────────────────────────────────────────────

function Tooltip({
	block,
	x,
	containerRect,
}: {
	block: ScheduleBlock;
	x: number;
	containerRect: DOMRect;
}) {
	const startHHMM = new Date(block.startTime).toLocaleTimeString("ja-JP", {
		hour: "2-digit",
		minute: "2-digit",
	});
	const endHHMM = new Date(block.endTime).toLocaleTimeString("ja-JP", {
		hour: "2-digit",
		minute: "2-digit",
	});

	// Constrain x so tooltip doesn't overflow container
	const tooltipWidth = 180;
	const clampedX = Math.min(Math.max(x, tooltipWidth / 2), containerRect.width - tooltipWidth / 2);

	return (
		<div
			className="absolute z-50 pointer-events-none"
			style={{
				left: clampedX,
				bottom: "100%",
				transform: "translateX(-50%)",
				marginBottom: 6,
			}}
		>
			<div className="bg-(--color-text-primary) text-(--color-bg) text-xs px-3 py-2 font-mono whitespace-nowrap">
				<div className="font-bold">
					{block.label ?? block.blockType.toUpperCase()}
					{block.lane != null && block.lane > 0 && (
						<span className="ml-1 opacity-60">L{block.lane + 1}</span>
					)}
				</div>
				<div className="text-(--color-text-muted) mt-0.5">
					{startHHMM} → {endHHMM}
				</div>
			</div>
		</div>
	);
}

// ─── Hour Markers ───────────────────────────────────────────────────────────

function HourMarkers({ startMin, endMin }: { startMin: number; endMin: number }) {
	const range = endMin - startMin;
	if (range <= 0) return null;

	const markers: number[] = [];
	// Show markers every 1-3 hours depending on range
	const step = range > 600 ? 120 : range > 300 ? 60 : 60;
	const firstHour = Math.ceil(startMin / step) * step;
	for (let m = firstHour; m < endMin; m += step) {
		markers.push(m);
	}

	return (
		<>
			{markers.map((m) => {
				const pct = ((m - startMin) / range) * 100;
				return (
					<div
						key={m}
						className="absolute top-0 h-full flex flex-col items-center pointer-events-none"
						style={{ left: `${pct}%` }}
					>
						<div className="w-px h-1.5 bg-(--color-border)" />
						<span className="text-[9px] font-mono text-(--color-text-muted) mt-0.5 -translate-x-1/2 absolute top-full">
							{minutesToHHMM(m)}
						</span>
					</div>
				);
			})}
		</>
	);
}

// ─── Now Marker ─────────────────────────────────────────────────────────────

function NowMarker({ pct }: { pct: number }) {
	return (
		<div
			className="absolute top-0 h-full z-10 pointer-events-none"
			style={{ left: `${pct}%` }}
		>
			{/* Triangular marker at top */}
			<div
				className="absolute -top-1 -translate-x-1/2"
				style={{
					width: 0,
					height: 0,
					borderLeft: "4px solid transparent",
					borderRight: "4px solid transparent",
					borderTop: "5px solid var(--color-text-primary)",
				}}
			/>
			{/* Vertical line */}
			<div className="w-px h-full bg-(--color-text-primary) opacity-60" />
		</div>
	);
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface TimelineBarProps {
	blocks: ScheduleBlock[];
	/** Day start as HH:mm (default: "07:00") */
	dayStart?: string;
	/** Day end as HH:mm (default: "23:00") */
	dayEnd?: string;
	className?: string;
}

export default function TimelineBar({
	blocks,
	dayStart = "07:00",
	dayEnd = "23:00",
	className = "",
}: TimelineBarProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [now, setNow] = useState(() => new Date());
	const [hoveredBlock, setHoveredBlock] = useState<ScheduleBlock | null>(null);
	const [hoverX, setHoverX] = useState(0);
	const [containerRect, setContainerRect] = useState<DOMRect | null>(null);

	// Tick every 30 seconds
	useEffect(() => {
		const id = setInterval(() => setNow(new Date()), 30_000);
		return () => clearInterval(id);
	}, []);

	const startMin = useMemo(() => {
		const parts = dayStart.split(":").map(Number);
		return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
	}, [dayStart]);

	const endMin = useMemo(() => {
		const parts = dayEnd.split(":").map(Number);
		return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
	}, [dayEnd]);

	const range = endMin - startMin;

	const nowMin = now.getHours() * 60 + now.getMinutes();
	const nowPct = range > 0 ? Math.min(100, Math.max(0, ((nowMin - startMin) / range) * 100)) : 0;

	const handleMouseMove = useCallback(
		(e: React.MouseEvent, block: ScheduleBlock) => {
			if (!containerRef.current) return;
			const rect = containerRef.current.getBoundingClientRect();
			setContainerRect(rect);
			setHoverX(e.clientX - rect.left);
			setHoveredBlock(block);
		},
		[]
	);

	const handleMouseLeave = useCallback(() => {
		setHoveredBlock(null);
	}, []);

	// Group blocks by lane
	const laneCount = useMemo(() => {
		let max = 0;
		for (const b of blocks) {
			if (b.lane != null && b.lane > max) max = b.lane;
		}
		return max + 1;
	}, [blocks]);

	const blocksByLane = useMemo(() => {
		const map = new Map<number, ScheduleBlock[]>();
		for (const b of blocks) {
			const lane = b.lane ?? 0;
			const list = map.get(lane) ?? [];
			list.push(b);
			map.set(lane, list);
		}
		return map;
	}, [blocks]);

	// Legend items
	const legendItems: { label: string; type: ScheduleBlock["blockType"] }[] = [
		{ label: "Focus", type: "focus" },
		{ label: "Break", type: "break" },
		{ label: "Routine", type: "routine" },
		{ label: "Event", type: "calendar" },
	];

	return (
		<div className={`flex flex-col gap-1.5 ${className}`}>
			{/* Legend */}
			<div className="flex items-center gap-3 px-1">
				<span className="text-[10px] font-bold tracking-widest uppercase text-(--color-text-muted)">
					Timeline
				</span>
				<div className="flex-1" />
				{legendItems.map((item) => (
					<div key={item.type} className="flex items-center gap-1">
						<span className={`w-2.5 h-2.5 ${blockColorClass(item.type)}`} />
						<span className="text-[10px] text-(--color-text-muted)">{item.label}</span>
					</div>
				))}
			</div>

			{/* Bar container — multi-lane */}
			<div ref={containerRef} className="relative bg-(--color-surface)">
				{Array.from({ length: laneCount }, (_, lane) => {
					const laneBlocks = blocksByLane.get(lane) ?? [];
					const laneHeight = lane === 0 ? 8 : 6; // primary lane is taller
					return (
						<div
							key={lane}
							className="relative w-full"
							style={{ height: laneHeight }}
						>
							{laneBlocks.map((block) => {
								const bStart = timeToMinutes(block.startTime);
								const bEnd = timeToMinutes(block.endTime);
								const left = ((Math.max(bStart, startMin) - startMin) / range) * 100;
								const width = ((Math.min(bEnd, endMin) - Math.max(bStart, startMin)) / range) * 100;
								if (width <= 0) return null;
								const isPast = bEnd <= nowMin;
								return (
									<div
										key={block.id}
										className={`absolute top-0 h-full transition-opacity cursor-pointer ${isPast ? "opacity-30" : "hover:opacity-80"}`}
										style={{
											left: `${left}%`,
											width: `${width}%`,
											backgroundColor: blockColor(block.blockType),
										}}
										onMouseMove={(e) => handleMouseMove(e, block)}
										onMouseLeave={handleMouseLeave}
									/>
								);
							})}
						</div>
					);
				})}

				{/* Hour markers — overlay on full height */}
				<div className="absolute inset-0 pointer-events-none">
					<HourMarkers startMin={startMin} endMin={endMin} />
				</div>

				{/* Now marker */}
				{nowPct > 0 && nowPct < 100 && (
					<div className="absolute inset-0 pointer-events-none">
						<NowMarker pct={nowPct} />
					</div>
				)}

				{/* Tooltip */}
				{hoveredBlock && containerRect && (
					<Tooltip block={hoveredBlock} x={hoverX} containerRect={containerRect} />
				)}
			</div>

			{/* Time axis labels */}
			<div className="relative h-3">
				<span className="absolute left-0 text-[9px] font-mono text-(--color-text-muted)">
					{dayStart}
				</span>
				<span className="absolute right-0 text-[9px] font-mono text-(--color-text-muted)">
					{dayEnd}
				</span>
			</div>
		</div>
	);
}
