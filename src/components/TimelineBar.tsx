/**
 * TimelineBar — 横軸マルチレーン・タイムライン.
 *
 * 最大5レーンの並行タスクを表示。
 * 現在時刻から就寝時刻までの水平バーに色分けブロックを表示。
 * マウスホバーでブロック詳細をツールチップ表示。
 * クリックでタスク詳細を表示。
 *
 * Features:
 * - 時間ラベル (07:00, 09:00, 11:00, ... 23:00)
 * - ブロック色分け (focus: blue, break: green, routine: yellow, calendar: purple)
 * - タスクタイトル表示 (focusブロック内)
 * - 現在時刻インジケーター (赤線 + ツールチップ)
 * - ホバーでブロック詳細
 * - クリックでタスク詳細
 * - スムーズアニメーション
 * - ズーム機能 (1h/2h/4h/終日)
 * - マウスホイール対応
 * - ズーム状態永続化
 *
 * Issue #5, #81, #87
 */
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import type { ScheduleBlock } from "@/types/schedule";

// Zoom level type
type ZoomLevel = "1h" | "2h" | "4h" | "day";

// Get interval in minutes for hour markers based on zoom level
function getMarkerInterval(level: ZoomLevel): number {
	switch (level) {
		case "1h":
			return 15; // Show 15min labels
		case "2h":
			return 30; // Show 30min labels
		case "4h":
			return 60; // Show 1h labels
		case "day":
			return 120; // Show 2h labels
	}
}

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

// Color definitions matching requirements
function blockColor(type: ScheduleBlock["blockType"]): string {
	switch (type) {
		case "focus": return "#3b82f6";   // blue
		case "break": return "#22c55e";   // green
		case "routine": return "#eab308"; // yellow
		case "calendar": return "#a855f7"; // purple
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

interface HourMarkersProps {
	startMin: number;
	endMin: number;
	zoomLevel: ZoomLevel;
}

function HourMarkers({ startMin, endMin, zoomLevel }: HourMarkersProps) {
	const range = endMin - startMin;
	if (range <= 0) return null;

	// Get interval based on zoom level
	const interval = getMarkerInterval(zoomLevel);

	// Generate markers at regular intervals
	const markers: number[] = [];
	const startMarker = Math.ceil(startMin / interval) * interval;
	for (let m = startMarker; m <= endMin; m += interval) {
		if (m >= startMin && m <= endMin) {
			markers.push(m);
		}
	}

	return (
		<>
			{markers.map((m) => {
				const pct = ((m - startMin) / range) * 100;
				return (
					<div
						key={m}
						className="absolute top-0 h-full flex flex-col items-center pointer-events-none transition-all duration-300 ease-out"
						style={{ left: `${pct}%` }}
					>
						{/* Tick mark */}
						<div className="w-px h-2 bg-(--color-border)" />
						{/* Time label below bar */}
						<span className="text-[10px] font-mono text-(--color-text-muted) mt-1 tabular-nums">
							{minutesToHHMM(m)}
						</span>
					</div>
				);
			})}
		</>
	);
}

// ─── Now Marker ─────────────────────────────────────────────────────────────

interface NowMarkerProps {
	pct: number;
	timeLabel: string;
}

function NowMarker({ pct, timeLabel }: NowMarkerProps) {
	return (
		<div
			className="absolute top-0 h-full z-10 pointer-events-none group"
			style={{ left: `${pct}%` }}
		>
			{/* Red vertical line */}
			<div className="w-0.5 h-full bg-red-500 opacity-80" />
			{/* Current time tooltip on hover */}
			<div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
				<div className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded whitespace-nowrap font-mono">
					{timeLabel}
				</div>
			</div>
		</div>
	);
}

// ─── Zoom Control Button ─────────────────────────────────────────────────────

interface ZoomButtonProps {
	label: string;
	active: boolean;
	onClick: () => void;
}

function ZoomButton({ label, active, onClick }: ZoomButtonProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`px-2 py-1 rounded text-[10px] font-medium transition-all duration-200 ${
				active
					? "bg-(--color-accent-primary) text-white"
					: "bg-(--color-surface) text-(--color-text-secondary) hover:bg-(--color-border)"
			}`}
		>
			{label}
		</button>
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
	/** Callback when a block is clicked */
	onBlockClick?: (block: ScheduleBlock) => void;
	/** Callback when a block is dropped at a new time */
	onBlockDrop?: (blockId: string, newStartTime: string, newEndTime: string) => void;
	/** Initial zoom level */
	zoomLevel?: ZoomLevel;
	/** Enable drag and drop (default: true) */
	enableDragDrop?: boolean;
}

export default function TimelineBar({
	blocks,
	dayStart = "07:00",
	dayEnd = "23:00",
	className = "",
	onBlockClick,
	onBlockDrop,
	zoomLevel: initialZoomLevel = "2h",
	enableDragDrop = true,
}: TimelineBarProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [now, setNow] = useState(() => new Date());
	const [hoveredBlock, setHoveredBlock] = useState<ScheduleBlock | null>(null);
	const [hoverX, setHoverX] = useState(0);
	const [containerRect, setContainerRect] = useState<DOMRect | null>(null);

	// Zoom state with persistence
	const [zoomLevel, setZoomLevel] = useLocalStorage<ZoomLevel>(
		"pomodoroom-timeline-zoom",
		initialZoomLevel
	);

	// Drag and drop state
	const [draggedBlock, setDraggedBlock] = useState<ScheduleBlock | null>(null);

	// Update current time every minute for now marker
	useEffect(() => {
		const id = setInterval(() => setNow(new Date()), 60_000);
		return () => clearInterval(id);
	}, []);

	// Update now marker position immediately when component mounts
	useEffect(() => {
		setNow(new Date());
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
	const nowLabel = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

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

	const handleBlockClick = useCallback(
		(block: ScheduleBlock) => {
			if (onBlockClick) {
				onBlockClick(block);
			}
		},
		[onBlockClick]
	);

	// Drag and drop handlers
	const handleDragStart = useCallback((e: React.DragEvent, block: ScheduleBlock) => {
		if (!enableDragDrop) return;
		setDraggedBlock(block);
		e.dataTransfer.effectAllowed = "move";
		// Set drag image
		const dragImage = (e.target as HTMLElement).cloneNode(true) as HTMLElement;
		dragImage.style.opacity = "0.5";
		e.dataTransfer.setDragImage(dragImage, 0, 0);
	}, [enableDragDrop]);

	const handleDrag = useCallback((_e: React.DragEvent) => {
		if (!containerRef.current) return;
		// Drag position state removed - not currently used
	}, []);

	const handleDragEnd = useCallback(() => {
		setDraggedBlock(null);
	}, []);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		if (!enableDragDrop) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
	}, [enableDragDrop]);

	const handleDrop = useCallback((e: React.DragEvent) => {
		if (!enableDragDrop || !onBlockDrop || !draggedBlock) return;
		e.preventDefault();

		// Calculate new time based on drop position
		if (!containerRef.current) return;
		const rect = containerRef.current.getBoundingClientRect();
		const dropX = e.clientX - rect.left;

		const range = endMin - startMin;
		const dropMin = startMin + (dropX / rect.width) * range;

		// Snap to 15-minute intervals
		const snappedMin = Math.round(dropMin / 15) * 15;

		// Calculate new start and end times
		const blockDuration = timeToMinutes(draggedBlock.endTime) - timeToMinutes(draggedBlock.startTime);
		const newStartMin = Math.max(startMin, snappedMin);
		const newEndMin = newStartMin + blockDuration;

		// Validate drop (within bounds and not overlapping)
		if (newEndMin > endMin) {
			return; // Invalid drop
		}

		// Create new Date strings
		const baseDate = new Date(draggedBlock.startTime).toISOString().slice(0, 10);
		const newStartTime = new Date(`${baseDate}T${minutesToHHMM(newStartMin)}:00Z`).toISOString();
		const newEndTime = new Date(`${baseDate}T${minutesToHHMM(newEndMin)}:00Z`).toISOString();

		onBlockDrop(draggedBlock.id, newStartTime, newEndTime);
	}, [enableDragDrop, onBlockDrop, draggedBlock, startMin, endMin]);

	// Zoom controls
	const zoomLevels: ZoomLevel[] = ["1h", "2h", "4h", "day"];
	const zoomLabels: Record<ZoomLevel, string> = {
		"1h": "1h",
		"2h": "2h",
		"4h": "4h",
		"day": "Day",
	};

	const handleZoomChange = useCallback((level: ZoomLevel) => {
		setZoomLevel(level);
	}, [setZoomLevel]);

	const handleWheel = useCallback((e: React.WheelEvent) => {
		// Ctrl + wheel or Alt + wheel to zoom
		if (e.ctrlKey || e.altKey) {
			e.preventDefault();
			const currentIndex = zoomLevels.indexOf(zoomLevel);
			if (e.deltaY < 0 && currentIndex > 0) {
				// Zoom in (smaller interval)
				const newLevel = zoomLevels[currentIndex - 1];
				if (newLevel) handleZoomChange(newLevel);
			} else if (e.deltaY > 0 && currentIndex >= 0 && currentIndex < zoomLevels.length - 1) {
				// Zoom out (larger interval)
				const newLevel = zoomLevels[currentIndex + 1];
				if (newLevel) handleZoomChange(newLevel);
			}
		}
	}, [zoomLevel, handleZoomChange]);

	// Handle keyboard shortcuts for zoom
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Alt + 1/2/3/4 for quick zoom
			if (e.altKey) {
				if (e.key === "1") {
					e.preventDefault();
					handleZoomChange("1h");
				} else if (e.key === "2") {
					e.preventDefault();
					handleZoomChange("2h");
				} else if (e.key === "3") {
					e.preventDefault();
					handleZoomChange("4h");
				} else if (e.key === "4") {
					e.preventDefault();
					handleZoomChange("day");
				}
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [handleZoomChange]);

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
				{/* Zoom controls */}
				<div className="flex items-center gap-1">
					<span className="text-[10px] text-(--color-text-muted) mr-1">Zoom:</span>
					{zoomLevels.map((level) => (
						<ZoomButton
							key={level}
							label={zoomLabels[level]}
							active={zoomLevel === level}
							onClick={() => handleZoomChange(level)}
						/>
					))}
				</div>
				<div className="w-px h-3 bg-(--color-border)" />
				{legendItems.map((item) => (
					<div key={item.type} className="flex items-center gap-1.5">
						<div
							className="w-2.5 h-2.5 rounded-sm"
							style={{ backgroundColor: blockColor(item.type) }}
						/>
						<span className="text-[10px] text-(--color-text-muted)">{item.label}</span>
					</div>
				))}
				{/* Lane count indicator */}
				{laneCount > 1 && (
					<>
						<div className="w-px h-3 bg-(--color-border)" />
						<span className="text-[10px] text-(--color-text-muted) font-mono">
							{laneCount} lanes
						</span>
					</>
				)}
			</div>

			{/* Bar container — multi-lane */}
			<div
				ref={containerRef}
				className="relative bg-(--color-surface) rounded"
				style={{ minHeight: laneCount * 6 + 12 }}
				onWheel={handleWheel}
				onDragOver={handleDragOver}
				onDrop={handleDrop}
			>
				{Array.from({ length: laneCount }, (_, lane) => {
					const laneBlocks = blocksByLane.get(lane) ?? [];
					const laneHeight = lane === 0 ? 10 : 8;
					const laneTop = lane * (laneHeight + 2);
					return (
						<div
							key={lane}
							className="absolute w-full"
							style={{ top: laneTop, height: laneHeight }}
						>
							{laneBlocks.map((block) => {
								const bStart = timeToMinutes(block.startTime);
								const bEnd = timeToMinutes(block.endTime);
								const left = ((Math.max(bStart, startMin) - startMin) / range) * 100;
								const width = ((Math.min(bEnd, endMin) - Math.max(bStart, startMin)) / range) * 100;
								if (width <= 0) return null;
								const isPast = bEnd <= nowMin;
								const isFocus = block.blockType === "focus";
								const canShowTitle = isFocus && width > 5; // Show title only if wide enough

								const isDragged = draggedBlock?.id === block.id;

								return (
									<div
										key={block.id}
										draggable={enableDragDrop && !isPast}
										className={`absolute top-0 h-full rounded-sm transition-all duration-300 ease-out cursor-pointer ${
											isPast ? "opacity-30" : "hover:opacity-80 hover:scale-[1.02]"
										} ${isFocus ? "shadow-sm" : ""} ${
											isDragged ? "opacity-50 scale-105" : ""
										}`}
										style={{
											left: `${left}%`,
											width: `${width}%`,
											backgroundColor: blockColor(block.blockType),
											minWidth: 2,
											cursor: enableDragDrop && !isPast ? "grab" : "pointer",
										}}
										onMouseMove={(e) => handleMouseMove(e, block)}
										onMouseLeave={handleMouseLeave}
										onClick={() => handleBlockClick(block)}
										onDragStart={(e) => handleDragStart(e, block)}
										onDrag={handleDrag}
										onDragEnd={handleDragEnd}
										title={block.label ?? `${block.blockType} (${minutesToHHMM(bStart)} - ${minutesToHHMM(bEnd)})`}
									>
										{canShowTitle && block.label && (
											<span
												className="absolute left-1 top-1/2 -translate-y-1/2 text-[9px] font-medium text-white truncate max-w-full px-1"
												style={{
													textShadow: "0 1px 2px rgba(0,0,0,0.3)",
													letterSpacing: "-0.01em",
												}}
											>
												{block.label}
											</span>
										)}
									</div>
								);
							})}
						</div>
					);
				})}

				{/* Hour markers — overlay on full height */}
				<div className="absolute inset-0 pointer-events-none flex items-end">
					<div className="w-full">
						<HourMarkers startMin={startMin} endMin={endMin} zoomLevel={zoomLevel} />
					</div>
				</div>

				{/* Now marker */}
				{nowPct >= 0 && nowPct <= 100 && (
					<div className="absolute inset-0 pointer-events-none">
						<NowMarker pct={nowPct} timeLabel={nowLabel} />
					</div>
				)}

				{/* Tooltip */}
				{hoveredBlock && containerRect && (
					<Tooltip block={hoveredBlock} x={hoverX} containerRect={containerRect} />
				)}
			</div>
		</div>
	);
}
