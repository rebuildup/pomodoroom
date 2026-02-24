/**
 * ProjectPieChart -- SVG pie chart for project distribution.
 *
 * Lightweight SVG implementation, no external libraries.
 */
import { useMemo } from "react";

export interface ProjectPieChartData {
	name: string;
	value: number;
	color?: string;
}

interface ProjectPieChartProps {
	data: ProjectPieChartData[];
	theme: "light" | "dark";
	size?: number;
	showLabels?: boolean;
	showPercentages?: boolean;
}

const DEFAULT_COLORS = [
	"#3b82f6", // blue
	"#10b981", // green
	"#f59e0b", // amber
	"#8b5cf6", // violet
	"#ef4444", // red
	"#06b6d4", // cyan
	"#f97316", // orange
	"#6366f1", // indigo
];

export default function ProjectPieChart({
	data,
	theme,
	size = 200,
	showLabels = true,
	showPercentages = true,
}: ProjectPieChartProps) {
	const isDark = theme === "dark";

	const segments = useMemo(() => {
		const total = data.reduce((sum, d) => sum + d.value, 0);
		if (total === 0) return [];

		let currentAngle = 0;
		return data.map((d, i) => {
			const percentage = d.value / total;
			const angle = percentage * 360;
			const startAngle = currentAngle;
			const endAngle = currentAngle + angle;
			currentAngle = endAngle;

			// Calculate SVG path
			const radius = size / 2;
			const center = size / 2;
			const startRad = (startAngle - 90) * (Math.PI / 180);
			const endRad = (endAngle - 90) * (Math.PI / 180);

			const x1 = center + radius * Math.cos(startRad);
			const y1 = center + radius * Math.sin(startRad);
			const x2 = center + radius * Math.cos(endRad);
			const y2 = center + radius * Math.sin(endRad);

			const largeArc = angle > 180 ? 1 : 0;

			const path =
				angle >= 360
					? `M ${center} ${center - radius} A ${radius} ${radius} 0 1 1 ${center} ${center + radius} A ${radius} ${radius} 0 1 1 ${center} ${center - radius}`
					: `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

			return {
				...d,
				percentage,
				path,
				color: d.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
			};
		});
	}, [data, size]);

	const total = data.reduce((sum, d) => sum + d.value, 0);

	if (total === 0) {
		return (
			<div className="flex items-center justify-center" style={{ width: size, height: size }}>
				<span className={isDark ? "text-gray-500" : "text-gray-400"}>No data</span>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-6">
			{/* Pie chart */}
			<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
				<title>Project distribution chart</title>
				{segments.map((seg) => (
					<g key={`segment-${seg.name}`}>
						<path d={seg.path} fill={seg.color} className="transition-opacity hover:opacity-80" />
						<title>{`${seg.name}: ${seg.value} (${(seg.percentage * 100).toFixed(1)}%)`}</title>
					</g>
				))}
			</svg>

			{/* Legend */}
			{showLabels && (
				<div className="flex flex-col gap-2">
					{segments.map((seg) => (
						<div key={`legend-${seg.name}`} className="flex items-center gap-2">
							<div className="w-3 h-3 rounded-sm" style={{ backgroundColor: seg.color }} />
							<span className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>
								{seg.name}
							</span>
							{showPercentages && (
								<span className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>
									({(seg.percentage * 100).toFixed(0)}%)
								</span>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
