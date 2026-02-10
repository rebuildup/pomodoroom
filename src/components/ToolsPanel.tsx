/**
 * ToolsPanel — ツール一覧セクション.
 *
 * アプリ内のサブウィンドウやユーティリティへのクイックアクセス.
 */
import { Icon } from "@/components/m3/Icon";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ToolItem {
	id: string;
	label: string;
	description: string;
	icon: React.ReactNode;
	shortcut?: string;
}

interface ToolsPanelProps {
	onOpenWindow?: (windowLabel: string) => void;
	className?: string;
}

// ─── Tool Definitions ───────────────────────────────────────────────────────

const TOOLS: ToolItem[] = [
	{
		id: "mini-timer",
		label: "Mini Timer",
		description: "フローティングタイマー",
		icon: <Icon name="timer" size={16} />,
		shortcut: "⌘M",
	},
	{
		id: "stats",
		label: "Stats",
		description: "統計ダッシュボード",
		icon: <Icon name="bar_chart" size={16} />,
		shortcut: "⌘S",
	},
	{
		id: "timeline",
		label: "Timeline",
		description: "タイムライン表示",
		icon: <Icon name="schedule" size={16} />,
		shortcut: "⌘T",
	},
	{
		id: "note",
		label: "Notes",
		description: "メモ帳",
		icon: <Icon name="note" size={16} />,
		shortcut: "⌘N",
	},
	{
		id: "youtube",
		label: "YouTube",
		description: "BGM / 環境音",
		icon: <Icon name="smart_display" size={16} />,
		shortcut: "⌘Y",
	},
	{
		id: "settings",
		label: "Settings",
		description: "設定",
		icon: <Icon name="settings" size={16} />,
		shortcut: "⌘,",
	},
	{
		id: "pomodoro-quick",
		label: "Quick Focus",
		description: "25分集中セッション開始",
		icon: <Icon name="bolt" size={16} />,
	},
	{
		id: "cli",
		label: "CLI",
		description: "コマンドパレット",
		icon: <Icon name="terminal" size={16} />,
		shortcut: "⌘K",
	},
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function ToolsPanel({ onOpenWindow, className = "" }: ToolsPanelProps) {
	return (
		<div className={`flex flex-col overflow-hidden ${className}`}>
			{/* Header */}
			<div className="flex items-center gap-2 px-3 py-2 shrink-0">
				<span className="text-[10px] font-bold tracking-widest uppercase text-(--color-text-muted)">
					Tools
				</span>
				<div className="flex-1 h-px bg-(--color-border)" />
			</div>

			{/* Grid */}
			<div className="flex-1 overflow-auto px-3 py-1">
				<div className="grid grid-cols-2 gap-px">
					{TOOLS.map((tool) => (
						<button
							key={tool.id}
							type="button"
							className="flex items-center gap-2 px-2 py-2 text-left transition-colors hover:bg-(--color-surface) group"
							onClick={() => onOpenWindow?.(tool.id)}
							title={tool.description}
						>
							<span className="text-(--color-text-muted) group-hover:text-(--color-text-primary) transition-colors shrink-0">
								{tool.icon}
							</span>
							<div className="flex-1 min-w-0">
								<div className="text-[11px] font-mono font-medium text-(--color-text-secondary) group-hover:text-(--color-text-primary) transition-colors truncate">
									{tool.label}
								</div>
							</div>
							{tool.shortcut && (
								<span className="text-[9px] font-mono text-(--color-text-muted) opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
									{tool.shortcut}
								</span>
							)}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}
