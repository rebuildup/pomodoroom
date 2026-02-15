export function roundUpToQuarterHour(date: Date): Date {
	const rounded = new Date(date);
	const minutes = rounded.getMinutes();
	const roundedMinutes = Math.ceil(minutes / 15) * 15;
	if (roundedMinutes === 60) {
		rounded.setHours(rounded.getHours() + 1, 0, 0, 0);
		return rounded;
	}
	rounded.setMinutes(roundedMinutes, 0, 0);
	return rounded;
}

export function toCandidateIso(ms: number): string {
	return roundUpToQuarterHour(new Date(ms)).toISOString();
}

export function toTimeLabel(iso: string): string {
	return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}
