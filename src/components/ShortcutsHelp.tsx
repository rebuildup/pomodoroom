import { X, Keyboard } from "lucide-react";
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
		if (!acc[shortcut.category]) {
			acc[shortcut.category] = [];
		}
		acc[shortcut.category].push(shortcut);
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
				className={`relative w-full max-w-lg rounded-xl shadow-2xl ${
					theme === "dark"
						? "bg-gray-800 text-white"
						: "bg-white text-gray-900"
				}`}
			>
				{/* Header */}
				<div
					className={`flex items-center justify-between px-5 py-4 border-b ${
						theme === "dark" ? "border-gray-700" : "border-gray-200"
					}`}
				>
					<div className="flex items-center gap-2">
						<Keyboard size={20} />
						<h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10"
					>
						<X size={20} />
					</button>
				</div>

				{/* Content */}
				<div className="p-5 max-h-[60vh] overflow-y-auto">
					{Object.entries(byCategory).map(([category, shortcuts]) => (
						<div key={category} className="mb-6 last:mb-0">
							<h3
								className={`text-xs font-bold uppercase tracking-wider mb-3 ${
									theme === "dark" ? "text-gray-500" : "text-gray-400"
								}`}
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
											className={
												theme === "dark" ? "text-gray-300" : "text-gray-700"
											}
										>
											{shortcut.description}
										</span>
										<kbd
											className={`px-2 py-1 rounded text-xs font-mono ${
												theme === "dark"
													? "bg-gray-700 text-gray-300"
													: "bg-gray-100 text-gray-700 border border-gray-200"
											}`}
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
					className={`px-5 py-3 border-t text-xs ${
						theme === "dark"
							? "border-gray-700 text-gray-500"
							: "border-gray-200 text-gray-400"
					}`}
				>
					Tip: Customize these shortcuts in Settings
				</div>
			</div>
		</div>
	);
}
