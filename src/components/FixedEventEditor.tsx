/**
 * FixedEventEditor - Editor for fixed events in daily schedule.
 *
 * Allows editing name, start time, duration, days of week, and enabled status.
 */
import { Trash2 } from "lucide-react";
import type { FixedEvent } from "@/types/schedule";

interface FixedEventEditorProps {
	event: FixedEvent;
	onChange: (event: FixedEvent) => void;
	onDelete: () => void;
	theme: "light" | "dark";
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function FixedEventEditor({
	event,
	onChange,
	onDelete,
	theme,
}: FixedEventEditorProps) {
	const updateField = <K extends keyof FixedEvent>(
		key: K,
		value: FixedEvent[K],
	) => {
		onChange({ ...event, [key]: value });
	};

	const toggleDay = (dayIndex: number) => {
		const newDays = event.days.includes(dayIndex)
			? event.days.filter((d) => d !== dayIndex)
			: [...event.days, dayIndex].sort();
		updateField("days", newDays);
	};

	const handleStartTimeChange = (newTime: string) => {
		updateField("startTime", newTime);
	};

	return (
		<div
			className={`p-4 rounded-lg space-y-4 ${
				theme === "dark" ? "bg-white/5" : "bg-black/5"
			}`}
		>
			{/* Header: name + delete */}
			<div className="flex items-center gap-3">
				<input
					type="text"
					value={event.name}
					onChange={(e) => updateField("name", e.target.value)}
					placeholder="Event name"
					className={`flex-1 px-3 py-2 rounded-lg text-sm ${
						theme === "dark"
							? "bg-white/10 border-white/10 focus:border-blue-500"
							: "bg-white border-gray-300 focus:border-blue-500"
					} border focus:outline-none transition-colors`}
				/>
				<button
					type="button"
					onClick={onDelete}
					className={`p-2 rounded-lg transition-colors ${
						theme === "dark"
							? "hover:bg-red-500/20 text-red-400"
							: "hover:bg-red-100 text-red-600"
					}`}
					aria-label="Delete event"
				>
					<Trash2 size={16} />
				</button>
			</div>

			{/* Time row: start time + duration */}
			<div className="flex items-center gap-4">
				<div className="flex-1">
					<label
						className={`block text-xs mb-1 ${
							theme === "dark" ? "text-gray-400" : "text-gray-500"
						}`}
					>
						Start Time
					</label>
					<input
						type="time"
						value={event.startTime}
						onChange={(e) => handleStartTimeChange(e.target.value)}
						className={`w-full px-3 py-2 rounded-lg text-sm ${
							theme === "dark"
								? "bg-white/10 border-white/10 focus:border-blue-500"
								: "bg-white border-gray-300 focus:border-blue-500"
						} border focus:outline-none transition-colors`}
					/>
				</div>
				<div className="flex-1">
					<label
						className={`block text-xs mb-1 ${
							theme === "dark" ? "text-gray-400" : "text-gray-500"
						}`}
					>
						Duration: {event.durationMinutes}m
					</label>
					<input
						type="range"
						min="15"
						max="240"
						step="15"
						value={event.durationMinutes}
						onChange={(e) =>
							updateField("durationMinutes", Number(e.target.value))
						}
						className="w-full accent-blue-500"
					/>
				</div>
			</div>

			{/* Day checkboxes */}
			<div>
				<label
					className={`block text-xs mb-2 ${
						theme === "dark" ? "text-gray-400" : "text-gray-500"
					}`}
				>
					Repeat on
				</label>
				<div className="flex gap-1">
					{DAY_LABELS.map((label, idx) => (
						<button
							key={label}
							type="button"
							onClick={() => toggleDay(idx)}
							className={`flex-1 py-2 text-xs rounded-lg transition-colors ${
								event.days.includes(idx)
									? "bg-blue-500 text-white"
									: theme === "dark"
										? "bg-white/10 hover:bg-white/15"
										: "bg-gray-200 hover:bg-gray-300"
							}`}
						>
							{label}
						</button>
					))}
				</div>
			</div>

			{/* Enabled toggle */}
			<div className="flex items-center justify-between">
				<span className="text-sm">Enabled</span>
				<button
					type="button"
					onClick={() => updateField("enabled", !event.enabled)}
					className={`relative w-10 h-6 rounded-full transition-colors ${
						event.enabled
							? "bg-blue-500"
							: theme === "dark"
								? "bg-gray-700"
								: "bg-gray-300"
					}`}
				>
					<div
						className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
							event.enabled ? "translate-x-5" : "translate-x-1"
						}`}
					/>
				</button>
			</div>
		</div>
	);
}
