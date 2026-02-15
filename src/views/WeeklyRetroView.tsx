/**
 * WeeklyRetroView - Weekly retrospective view
 *
 * Displays auto-generated weekly retrospective based on
 * session data with achievements, challenges, and improvements.
 */

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/m3/Button";
import { Icon, type MSIconName } from "@/components/m3/Icon";
import { useStats } from "@/hooks/useStats";
import {
	generateWeeklyRetro,
	getWeekRange,
	copyRetroToClipboard,
	type WeeklyRetro,
} from "@/utils/weeklyRetroGenerator";

export function WeeklyRetroView() {
	const { sessions, stats, loadWeek, loading } = useStats();
	const [retro, setRetro] = useState<WeeklyRetro | null>(null);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		loadWeek();
	}, [loadWeek]);

	useEffect(() => {
		if (sessions.length > 0) {
			const { start, end } = getWeekRange(new Date());
			const generated = generateWeeklyRetro({
				weekStart: start,
				weekEnd: end,
				sessions,
				stats,
			});
			setRetro(generated);
		}
	}, [sessions, stats]);

	const handleCopy = useCallback(async () => {
		if (retro) {
			const success = await copyRetroToClipboard(retro);
			if (success) {
				setCopied(true);
				setTimeout(() => setCopied(false), 2000);
			}
		}
	}, [retro]);

	const handleExport = useCallback(() => {
		if (retro) {
			const blob = new Blob([retro.rawMarkdown], { type: "text/markdown" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `weekly-retro-${retro.period.replace(/\s/g, "")}.md`;
			a.click();
			URL.revokeObjectURL(url);
		}
	}, [retro]);

	if (loading) {
		return (
			<div className="w-full h-full flex items-center justify-center bg-[var(--md-ref-color-surface)]">
				<div className="animate-spin">
					<Icon name="refresh" size={24} />
				</div>
			</div>
		);
	}

	if (!retro) {
		return (
			<div className="w-full h-full flex flex-col items-center justify-center bg-[var(--md-ref-color-surface)] gap-4">
				<Icon name="info" size={48} className="text-[var(--md-ref-color-on-surface-variant)]" />
				<p className="text-[var(--md-ref-color-on-surface-variant)]">
					今週のデータがありません
				</p>
			</div>
		);
	}

	return (
		<div className="w-full h-full flex flex-col bg-[var(--md-ref-color-surface)]">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-3 border-b border-[var(--md-ref-color-outline-variant)]">
				<div className="flex items-center gap-2">
					<Icon name="description" size={24} />
					<h1 className="text-lg font-semibold">{retro.title}</h1>
				</div>
				<div className="flex gap-2">
					<Button variant="text" size="small" onClick={handleCopy}>
						<Icon name="link" size={18} />
						{copied ? "コピー済み" : "コピー"}
					</Button>
					<Button variant="text" size="small" onClick={handleExport}>
						<Icon name="download" size={18} />
						エクスポート
					</Button>
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-auto p-4">
				{/* Summary */}
				<div className="mb-6 p-4 rounded-lg bg-[var(--md-ref-color-surface-container)]">
					<p className="text-sm text-[var(--md-ref-color-on-surface)]">{retro.summary}</p>
				</div>

				{/* Sections */}
				<div className="grid gap-4">
					<RetroSectionComponent section={retro.achievements} icon="check_circle" color="var(--md-ref-color-primary)" />
					<RetroSectionComponent section={retro.challenges} icon="search" color="var(--md-ref-color-error)" />
					<RetroSectionComponent section={retro.improvements} icon="auto_awesome" color="var(--md-ref-color-tertiary)" />
					<RetroSectionComponent section={retro.nextWeekGoals} icon="flag" color="var(--md-ref-color-secondary)" />
				</div>
			</div>
		</div>
	);
}

interface RetroSectionProps {
	section: { title: string; items: string[] };
	icon: MSIconName;
	color: string;
}

function RetroSectionComponent({ section, icon, color }: RetroSectionProps) {
	return (
		<div className="p-4 rounded-lg bg-[var(--md-ref-color-surface-container-low)]">
			<div className="flex items-center gap-2 mb-3">
				<Icon name={icon} size={20} style={{ color }} />
				<h2 className="text-sm font-semibold">{section.title}</h2>
			</div>
			<ul className="space-y-2">
				{section.items.map((item, index) => (
					<li key={index} className="text-sm text-[var(--md-ref-color-on-surface-variant)] pl-2 border-l-2" style={{ borderColor: color }}>
						{item}
					</li>
				))}
			</ul>
		</div>
	);
}

export default WeeklyRetroView;
