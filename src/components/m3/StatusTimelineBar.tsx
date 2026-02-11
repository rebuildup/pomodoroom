import { useMemo } from "react";

export interface TimelineSegment {
	start: string;
	end: string;
}

export interface StatusTimelineBarProps {
	segments: TimelineSegment[];
	date?: Date;
	className?: string;
}

interface NormalizedSegment {
	startMs: number;
	endMs: number;
}

function startOfDay(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function toMs(v: string): number | null {
	const d = new Date(v);
	const t = d.getTime();
	return Number.isFinite(t) ? t : null;
}

function clampAndMergeSegments(
	segments: TimelineSegment[],
	dayStartMs: number,
	dayEndMs: number
): NormalizedSegment[] {
	const normalized: NormalizedSegment[] = [];

	for (const s of segments) {
		const start = toMs(s.start);
		const end = toMs(s.end);
		if (start === null || end === null) continue;

		const clampedStart = Math.max(dayStartMs, Math.min(dayEndMs, start));
		const clampedEnd = Math.max(dayStartMs, Math.min(dayEndMs, end));
		if (clampedEnd <= clampedStart) continue;

		normalized.push({ startMs: clampedStart, endMs: clampedEnd });
	}

	if (normalized.length === 0) return normalized;

	normalized.sort((a, b) => a.startMs - b.startMs);

	const first = normalized[0];
	if (!first) return normalized;

	const merged: NormalizedSegment[] = [first];
	for (let i = 1; i < normalized.length; i++) {
		const current = normalized[i];
		const last = merged[merged.length - 1];

		if (!current || !last) continue;

		if (current.startMs <= last.endMs) {
			last.endMs = Math.max(last.endMs, current.endMs);
		} else {
			merged.push(current);
		}
	}

	return merged;
}

export function StatusTimelineBar({ segments, date, className = "" }: StatusTimelineBarProps) {
	const effectiveDate = date ?? new Date();
	const dayStart = startOfDay(effectiveDate);
	const dayStartMs = dayStart.getTime();
	const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;

	const merged = useMemo(
		() => clampAndMergeSegments(segments, dayStartMs, dayEndMs),
		[segments, dayStartMs, dayEndMs]
	);

	return (
		<section className={`w-full ${className}`.trim()} aria-label="24 hour status timeline">
			<div className="px-4 py-0">
				<div className="h-4 w-full rounded-full bg-[var(--md-ref-color-surface-container-highest)] overflow-hidden">
					<div className="relative h-full w-full">
						{merged.map((s, index) => {
							const left = ((s.startMs - dayStartMs) / (dayEndMs - dayStartMs)) * 100;
							const width = ((s.endMs - s.startMs) / (dayEndMs - dayStartMs)) * 100;
							return (
								<div
									key={`${s.startMs}-${s.endMs}-${index}`}
									className="absolute top-0 h-full rounded-full bg-[var(--md-ref-color-on-surface)] opacity-55"
									style={{ left: `${left}%`, width: `${width}%` }}
								/>
							);
						})}
					</div>
				</div>
			</div>
		</section>
	);
}

export default StatusTimelineBar;
