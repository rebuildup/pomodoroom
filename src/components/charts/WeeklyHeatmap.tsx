/**
 * WeeklyHeatmap -- Activity heatmap for weekly pomodoro sessions.
 *
 * Pure CSS grid implementation inspired by GitHub contribution graph.
 */
import { useMemo } from "react";

export interface HeatmapData {
	date: string; // ISO date string
	value: number; // Number of pomodoros or focus minutes
}

interface WeeklyHeatmapProps {
	data: HeatmapData[];
	theme: "light" | "dark";
	weeks?: number; // Number of weeks to display (default: 12)
	cellSize?: number;
}

export default function WeeklyHeatmap({
	data,
	theme,
	weeks = 12,
	cellSize = 12,
}: WeeklyHeatmapProps) {
	const isDark = theme === "dark";

	// Build heatmap grid
	const { grid, maxValue, dates } = useMemo(() => {
		const now = new Date();
		const endDate = new Date(now);
		endDate.setHours(23, 59, 59, 999);

		const startDate = new Date(endDate);
		startDate.setDate(startDate.getDate() - weeks * 7);

		// Create data map for quick lookup
		const dataMap = new Map<string, number>();
		for (const d of data) {
			const dateStr = d.date.startsWith(d.date.slice(0, 4))
				? d.date.slice(0, 10)
				: new Date(d.date).toISOString().slice(0, 10);
			dataMap.set(dateStr, d.value);
		}

		// Generate grid
		const grid: (number | null)[][] = [];
		const dates: string[] = [];

		// Find first Sunday
		const current = new Date(startDate);
		const dayOfWeek = current.getDay();
		current.setDate(current.getDate() - dayOfWeek);

		// Generate weekly rows
		for (let w = 0; w < weeks; w++) {
			const week: (number | null)[] = [];
			for (let d = 0; d < 7; d++) {
				const dateStr = current.toISOString().slice(0, 10);
				const value = dataMap.get(dateStr) ?? null;
				week.push(value);
				dates.push(dateStr);
				current.setDate(current.getDate() + 1);
			}
			grid.push(week);
		}

		const maxValue = Math.max(...data.map((d) => d.value), 1);

		return { grid, maxValue, dates };
	}, [data, weeks]);

	// Get color class based on value intensity
	const getColorClass = (value: number | null) => {
		if (value === null || value === 0) {
			return isDark ? "bg-gray-800" : "bg-gray-100";
		}
		const intensity = value / maxValue;
		if (intensity < 0.25) {
			return isDark ? "bg-blue-900" : "bg-blue-100";
		}
		if (intensity < 0.5) {
			return isDark ? "bg-blue-700" : "bg-blue-300";
		}
		if (intensity < 0.75) {
			return isDark ? "bg-blue-500" : "bg-blue-500";
		}
		return isDark ? "bg-blue-400" : "bg-blue-600";
	};

	const weekDays = ["S", "M", "T", "W", "T", "F", "S"];

	return (
		<div className="flex flex-col gap-2">
			{/* Month labels */}
			<div className="flex pl-8">
				{grid.map((_, weekIndex) => {
					const dateIndex = weekIndex * 7;
					if (dateIndex >= dates.length) return null;
					const weekDate = new Date(dates[dateIndex] ?? "");
					if (weekIndex % 4 !== 0 && weekIndex !== grid.length - 1) return null;
					return (
						<div
							key={weekIndex}
							className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}
							style={{ marginLeft: weekIndex === 0 ? 0 : `${(cellSize + 2) * (weekIndex % 4)}px` }}
						>
							{weekDate.toLocaleDateString("en-US", { month: "short" })}
						</div>
					);
				})}
			</div>

			{/* Heatmap grid */}
			<div className="flex gap-1">
				{/* Day labels */}
				<div className="flex flex-col gap-[2px] pr-2">
					{weekDays.map((day, i) => (
						<div
							key={day}
							className={`text-[10px] flex items-center justify-end h-[${cellSize}px] ${
								isDark ? "text-gray-500" : "text-gray-400"
							}`}
							style={{ height: cellSize }}
						>
							{i % 2 === 1 ? day : ""}
						</div>
					))}
				</div>

				{/* Heatmap cells */}
				<div className="flex flex-col gap-[2px]">
					{grid.map((week, weekIndex) => (
						<div key={weekIndex} className="flex gap-[2px]">
							{week.map((value, dayIndex) => (
								<div
									key={dayIndex}
									className={`rounded-sm transition-colors hover:ring-1 hover:ring-blue-400 ${getColorClass(
										value
									)}`}
									style={{ width: cellSize, height: cellSize }}
									title={
										value
											? `${dates[weekIndex * 7 + dayIndex]}: ${value} pomodoros`
											: `${dates[weekIndex * 7 + dayIndex]}: No activity`
									}
								/>
							))}
						</div>
					))}
				</div>
			</div>

			{/* Legend */}
			<div className="flex items-center gap-2 pl-8 mt-2">
				<span className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>Less</span>
				{[0, 0.25, 0.5, 0.75, 1].map((intensity) => (
					<div
						key={intensity}
						className={`rounded-sm ${getColorClass(intensity * maxValue)}`}
						style={{ width: cellSize, height: cellSize }}
					/>
				))}
				<span className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>More</span>
			</div>
		</div>
	);
}
