import { useState, useRef, useEffect } from "react";
import { Icon, type MSIconName } from "@/components/m3/Icon";
import { useWindowManager } from "@/hooks/useWindowManager";
import { useProjects } from "@/hooks/useProjects";

const ACTIONS: Array<{ label: string; windowType: string; icon: MSIconName }> = [
	{ label: "New Note", windowType: "note", icon: "note" },
	{ label: "Mini Timer", windowType: "mini-timer", icon: "timer" },
	{ label: "Guidance Timer", windowType: "guidance_timer", icon: "watch_later" },
	{ label: "Guidance Board", windowType: "guidance_board", icon: "view_column" },
	{ label: "Timeline", windowType: "timeline", icon: "calendar_month" },
	{ label: "Project Pins", windowType: "project_pins", icon: "anchor" },
	{ label: "Settings", windowType: "settings", icon: "settings" },
];

interface TeamReferencesPanelProps {
	onNavigateToTasks?: (action: { type: "create-reference"; projectId: string }) => void;
}

export function TeamReferencesPanel({ onNavigateToTasks }: TeamReferencesPanelProps) {
	const windowManager = useWindowManager();
	const { projects } = useProjects();
	const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement | null>(null);

	// Close dropdown when clicking outside
	useEffect(() => {
		if (!isProjectDropdownOpen) return;
		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node;
			if (!dropdownRef.current?.contains(target)) {
				setIsProjectDropdownOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [isProjectDropdownOpen]);

	const handleAddReference = (projectId: string) => {
		setIsProjectDropdownOpen(false);
		onNavigateToTasks?.({ type: "create-reference", projectId });
	};

	return (
		<div className="space-y-3">
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

			{/* Add Reference with Project Selection */}
			{onNavigateToTasks && (
				<div className="pt-2 border-t border-[var(--md-ref-color-outline-variant)]">
					<div className="relative" ref={dropdownRef}>
						<button
							type="button"
							onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
							className="w-full h-10 px-3 rounded-lg border border-[var(--md-ref-color-outline-variant)] text-xs font-medium flex items-center justify-between gap-2 bg-[var(--md-ref-color-surface)] hover:bg-[var(--md-ref-color-surface-container)] transition-colors"
							aria-expanded={isProjectDropdownOpen}
							aria-haspopup="listbox"
						>
							<span className="flex items-center gap-2">
								<Icon name="add_link" size={14} />
								リファレンス追加
							</span>
							<Icon name={isProjectDropdownOpen ? "expand_less" : "expand_more"} size={16} />
						</button>
						{isProjectDropdownOpen && (
							<div
								role="listbox"
								className="absolute left-0 right-0 top-11 z-30 bg-[var(--md-sys-color-surface)] rounded-lg shadow-[0_4px_20px_rgba(0,0,0,0.15)] border border-[var(--md-sys-color-outline-variant)] max-h-48 overflow-y-auto"
							>
								{projects.length === 0 ? (
									<div className="px-3 py-2 text-xs text-[var(--md-ref-color-on-surface-variant)]">
										プロジェクトがありません
									</div>
								) : (
									projects.map((project) => (
										<button
											key={project.id}
											type="button"
											role="option"
											onClick={() => handleAddReference(project.id)}
											className="w-full h-9 px-3 flex items-center gap-2 text-xs font-medium text-left hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors"
										>
											<Icon name="folder" size={14} className="text-[var(--md-ref-color-on-surface-variant)]" />
											<span className="truncate">{project.name}</span>
										</button>
									))
								)}
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

export default TeamReferencesPanel;
