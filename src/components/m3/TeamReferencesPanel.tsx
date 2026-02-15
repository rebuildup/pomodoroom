import { Icon, type MSIconName } from "@/components/m3/Icon";
import { useWindowManager } from "@/hooks/useWindowManager";

const ACTIONS: Array<{ label: string; windowType: string; icon: MSIconName }> = [
	{ label: "New Note", windowType: "note", icon: "note" },
	{ label: "Mini Timer", windowType: "mini-timer", icon: "timer" },
	{ label: "Statistics", windowType: "stats", icon: "bar_chart" },
	{ label: "Timeline", windowType: "timeline", icon: "calendar_month" },
	{ label: "YouTube", windowType: "youtube", icon: "music_note" },
	{ label: "Settings", windowType: "settings", icon: "settings" },
];

export function TeamReferencesPanel() {
	const windowManager = useWindowManager();

	return (
		<section className="rounded-xl bg-[var(--md-ref-color-surface-container-high)] p-4 space-y-3">
			<div className="text-sm font-medium">チームリファレンス</div>
			<div className="grid grid-cols-2 gap-2">
				{ACTIONS.map((action) => (
					<button
						key={action.windowType}
						type="button"
						onClick={() => windowManager.openWindow(action.windowType)}
						className="h-10 px-3 rounded-lg border border-[var(--md-ref-color-outline-variant)] text-xs font-medium flex items-center gap-2 bg-[var(--md-ref-color-surface)] hover:bg-[var(--md-ref-color-surface-container)] transition-colors"
						aria-label={action.label}
					>
						<Icon name={action.icon} size={14} />
						<span className="truncate">{action.label}</span>
					</button>
				))}
			</div>
		</section>
	);
}

export default TeamReferencesPanel;
