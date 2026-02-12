import { Icon } from "@/components/m3/Icon";
import { DEFAULT_SHORTCUTS, formatShortcut } from "@/constants/shortcuts";

interface ShortcutsHelpProps {
	isOpen: boolean;
	onClose: () => void;
	theme?: "light" | "dark";
}

export function ShortcutsHelp({
	isOpen,
	onClose,
	theme = "dark",
}: ShortcutsHelpProps) {
	if (!isOpen) return null;

	// Group shortcuts by category
	const byCategory = DEFAULT_SHORTCUTS.reduce((acc, shortcut) => {
		const category = shortcut.category;
		if (!acc[category]) {
			acc[category] = [];
		}
		acc[category]!.push(shortcut);
		return acc;
	}, {} as Record<string, typeof DEFAULT_SHORTCUTS>);

	const categoryLabels: Record<string, string> = {
		timer: "Timer Controls",
		navigation: "Navigation",
		window: "Window Management",
		tasks: "Tasks",
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			{/* Backdrop */}
			<div
				className="absolute inset-0 bg-black/50 backdrop-blur-sm"
				onClick={onClose}
			/>

			{/* Modal */}
			<div
				className="relative w-full max-w-lg rounded-xl shadow-2xl bg-[var(--md-ref-color-surface)] text-[var(--md-ref-color-on-surface)]"
			>
				{/* Header */}
				<div
					className="flex items-center justify-between px-5 py-4 border-b border-[var(--md-ref-color-outline-variant)]"
				>
					<div className="flex items-center gap-2">
						<Icon name="keyboard" size={20} />
						<h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="p-1 rounded hover:bg-[var(--md-ref-color-surface-container-high)]"
					>
						<Icon name="close" size={20} />
					</button>
				</div>

				{/* Content */}
				<div className="p-5 max-h-[60vh] overflow-y-auto">
					{Object.entries(byCategory).map(([category, shortcuts]) => (
						<div key={category} className="mb-6 last:mb-0">
							<h3
								className="text-xs font-bold uppercase tracking-wider mb-3 text-[var(--md-ref-color-on-surface-variant)]"
							>
								{categoryLabels[category] || category}
							</h3>
							<div className="space-y-2">
								{shortcuts.map((shortcut) => (
									<div
										key={shortcut.id}
										className="flex items-center justify-between text-sm"
									>
										<span
											className="text-[var(--md-ref-color-on-surface-variant)]"
										>
											{shortcut.description}
										</span>
										<kbd
											className="px-2 py-1 rounded text-xs font-mono bg-[var(--md-ref-color-surface-container-highest)] border border-[var(--md-ref-color-outline)] text-[var(--md-ref-color-on-surface)]"
										>
											{formatShortcut(shortcut.defaultBinding)}
										</kbd>
									</div>
								))}
							</div>
						</div>
					))}
				</div>

				{/* Footer hint */}
				<div
					className="px-5 py-3 border-t text-xs text-[var(--md-ref-color-on-surface-variant)] border-[var(--md-ref-color-outline-variant)]"
				>
					Tip: Customize these shortcuts in Settings
				</div>
			</div>
		</div>
	);
}
