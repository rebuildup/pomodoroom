/**
 * FixedEventEditor - Editor for fixed events in daily schedule.
 *
 * Allows editing name, start time, duration, days of week, and enabled status.
 * Uses Material 3 design tokens.
 */
import { Switch, TimePicker, IconPillButton } from "@/components/m3";
import type { FixedEvent } from "@/types/schedule";

interface FixedEventEditorProps {
	event: FixedEvent;
	onChange: (event: FixedEvent) => void;
	onDelete: () => void;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function FixedEventEditor({
	event,
	onChange,
	onDelete,
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
		<div className="p-4 rounded-lg bg-[var(--md-ref-color-surface-container)] space-y-4">
			{/* Header: name + delete */}
			<div className="flex items-center gap-3">
				<input
					type="text"
					value={event.name}
					onChange={(e) => updateField("name", e.target.value)}
					placeholder="Event name"
					className="flex-1 px-3 py-2 rounded-lg text-sm border border-[var(--md-ref-color-outline)] focus:border-[var(--md-ref-color-primary)] focus:outline-none transition-colors bg-[var(--md-ref-color-surface)] text-[var(--md-ref-color-on-surface)] placeholder:text-[var(--md-ref-color-on-surface-variant)]"
				/>
				<IconPillButton
					icon="delete"
					label="Delete"
					size="sm"
					onClick={onDelete}
					className="text-[var(--md-ref-color-error)] hover:bg-[var(--md-ref-color-error-container)]"
				/>
			</div>

			{/* Time row: start time + duration */}
			<div className="flex items-center gap-4">
				<div className="flex-1">
					<label className="block text-xs mb-1 text-[var(--md-ref-color-on-surface-variant)]">
						Start Time
					</label>
					<TimePicker
						value={event.startTime}
						onChange={handleStartTimeChange}
						variant="underlined"
					/>
				</div>
				<div className="flex-1">
					<label className="block text-xs mb-1 text-[var(--md-ref-color-on-surface-variant)]">
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
						className="w-full accent-[var(--md-ref-color-primary)]"
					/>
				</div>
			</div>

			{/* Day checkboxes */}
			<div>
				<label className="block text-xs mb-2 text-[var(--md-ref-color-on-surface-variant)]">
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
									? "bg-[var(--md-ref-color-primary)] text-[var(--md-ref-color-on-primary)]"
									: "hover:bg-[var(--md-ref-color-surface-container-high)] text-[var(--md-ref-color-on-surface-variant)]"
							}`}
						>
							{label}
						</button>
					))}
				</div>
			</div>

			{/* Enabled toggle */}
			<div className="flex items-center justify-between">
				<span className="text-sm text-[var(--md-ref-color-on-surface)]">Enabled</span>
				<Switch
					checked={event.enabled}
					onChange={() => updateField("enabled", !event.enabled)}
					ariaLabel="Toggle event"
				/>
			</div>
		</div>
	);
}
