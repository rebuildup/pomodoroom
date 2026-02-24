/**
 * PomodoroChart -- Bar chart for daily pomodoro counts.
 *
 * Pure CSS implementation, no external libraries.
 */
import { useMemo } from "react";

export interface PomodoroChartData {
	label: string;
	value: number;
	highlight?: boolean;
}

interface PomodoroChartProps {
	data: PomodoroChartData[];
	theme: "light" | "dark";
	height?: number;
	showValues?: boolean;
	unit?: string;
}

export default function PomodoroChart({
	data,
	theme,
	height = 120,
	showValues = false,
	unit = "",
}: PomodoroChartProps) {
	const max = useMemo(() => Math.max(...data.map((d) => d.value), 1), [data]);
	const isDark = theme === "dark";

	return (
		<div className="flex items-end justify-between gap-1 w-full" style={{ height }}>
			{data.map((d, i) => {
				const barHeight = Math.max(4, (d.value / max) * 100);
				return (
					<div
						key={`${d.label}-${i}`}
						className="flex-1 flex flex-col items-center gap-1 h-full group"
					>
						{showValues && d.value > 0 && (
							<span
								className={`text-[10px] font-medium transition-opacity ${
									d.highlight ? "opacity-100" : "opacity-0 group-hover:opacity-100"
								} ${isDark ? "text-white" : "text-gray-900"}`}
							>
								{d.value}
								{unit}
							</span>
						)}
						<div className="flex-1 w-full flex items-end">
							<div
								className={`w-full rounded-t-sm transition-all duration-300 ${
									d.highlight
										? "bg-blue-500"
										: isDark
											? "bg-gray-700 hover:bg-gray-600"
											: "bg-gray-300 hover:bg-gray-400"
								}`}
								style={{ height: `${barHeight}%` }}
								title={`${d.label}: ${d.value}${unit}`}
							/>
						</div>
						<span
							className={`text-[10px] truncate w-full text-center ${
								d.highlight ? "font-medium" : isDark ? "text-gray-500" : "text-gray-400"
							}`}
						>
							{d.label}
						</span>
					</div>
				);
			})}
		</div>
	);
}
