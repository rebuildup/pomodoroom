import { useMemo } from "react";
import DetachedWindowShell from "@/components/DetachedWindowShell";
import { DayTimelinePanel } from "@/components/m3/DayTimelinePanel";
import { useTaskStore } from "@/hooks/useTaskStore";
import type { Task } from "@/types/task";

export default function TimelinePanelWindowView() {
	const { tasks } = useTaskStore();

	const timelineTasks = useMemo(() => {
		const now = Date.now();
		const windowStartMs = now - 12 * 60 * 60 * 1000;
		const windowEndMs = now + 12 * 60 * 60 * 1000;

		const withStart = (task: Task): { task: Task; startMs: number } | null => {
			let startIso: string | null = null;
			if (task.kind === "fixed_event") {
				startIso = task.fixedStartAt;
			} else if (task.kind === "flex_window" && task.windowStartAt && task.windowEndAt && task.requiredMinutes) {
				const windowStart = new Date(task.windowStartAt).getTime();
				const windowEnd = new Date(task.windowEndAt).getTime();
				if (Number.isNaN(windowStart) || Number.isNaN(windowEnd)) return null;
				const center = (windowStart + windowEnd) / 2;
				startIso = new Date(center - (task.requiredMinutes * 60_000) / 2).toISOString();
			} else {
				startIso = task.estimatedStartAt ?? task.fixedStartAt ?? task.windowStartAt;
			}
			if (!startIso) return null;
			const startMs = Date.parse(startIso);
			if (Number.isNaN(startMs)) return null;
			return { task, startMs };
		};

		return tasks
			.filter((task) => task.state !== "DONE")
			.map(withStart)
			.filter((item): item is { task: Task; startMs: number } => item !== null)
			.filter(({ startMs }) => startMs >= windowStartMs && startMs <= windowEndMs)
			.sort((a, b) => a.startMs - b.startMs)
			.map(({ task }) => task);
	}, [tasks]);

	return (
		<DetachedWindowShell title="Timeline" showMinMax={true}>
			<div className="absolute inset-0  px-3 pb-3">
				<DayTimelinePanel
					tasks={timelineTasks}
					hourHeight={52}
					timeLabelWidth={56}
					minCardHeight={50}
					laneGap={4}
					emptyMessage="直近24時間に表示するタスクはありません"
					className="h-full rounded-lg px-2 py-2"
					testId="timeline-window-panel"
				/>
			</div>
		</DetachedWindowShell>
	);
}
