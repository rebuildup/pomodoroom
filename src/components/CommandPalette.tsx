import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/m3/Icon";
import type { Command } from "@/types";

interface CommandPaletteProps {
	isOpen: boolean;
	onClose: () => void;
	commands: Command[];
	theme?: "light" | "dark";
}

export function CommandPalette({ isOpen, onClose, commands, theme = "dark" }: CommandPaletteProps) {
	const [query, setQuery] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);

	// Filter commands by query
	const filteredCommands = commands.filter((cmd) => {
		const q = query.toLowerCase();
		return (
			cmd.label.toLowerCase().includes(q) ||
			cmd.description.toLowerCase().includes(q) ||
			cmd.category.toLowerCase().includes(q)
		);
	});

	// Reset selection when filter changes
	useEffect(() => {
		setSelectedIndex(0);
	}, []);

	// Close on Escape
	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			} else if (e.key === "ArrowDown") {
				e.preventDefault();
				setSelectedIndex((i) => (i < filteredCommands.length - 1 ? i + 1 : i));
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				setSelectedIndex((i) => (i > 0 ? i - 1 : 0));
			} else if (e.key === "Enter" && filteredCommands[selectedIndex]) {
				e.preventDefault();
				filteredCommands[selectedIndex].action();
				onClose();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, onClose, filteredCommands, selectedIndex]);

	// Clear query on open
	useEffect(() => {
		if (isOpen) setQuery("");
	}, [isOpen]);

	const handleSelect = useCallback(
		(command: Command) => {
			command.action();
			onClose();
		},
		[onClose],
	);

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
			{/* Backdrop */}
			<div
				className="absolute inset-0 bg-black/50 backdrop-blur-sm"
				onClick={onClose}
				onKeyDown={(e) => e.key === "Escape" && onClose()}
				role="button"
				tabIndex={0}
				aria-label="Close"
			/>

			{/* Modal */}
			<div
				className={`relative w-full max-w-xl rounded-xl shadow-2xl ${
					theme === "dark" ? "bg-gray-800 text-white" : "bg-white text-gray-900"
				}`}
			>
				{/* Header */}
				<div
					className={`flex items-center gap-3 px-4 py-3 border-b ${
						theme === "dark" ? "border-gray-700" : "border-gray-200"
					}`}
				>
					<Icon name="search" size={18} className="opacity-50" />
					<input
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Type a command or search..."
						className="flex-1 bg-transparent outline-none text-sm"
					/>
					<button
						type="button"
						onClick={onClose}
						className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10"
					>
						<Icon name="close" size={18} className="opacity-50" />
					</button>
				</div>

				{/* Command list */}
				<div className="max-h-80 overflow-y-auto py-2">
					{filteredCommands.length === 0 ? (
						<div
							className={`px-4 py-8 text-center text-sm ${
								theme === "dark" ? "text-gray-500" : "text-gray-400"
							}`}
						>
							No commands found
						</div>
					) : (
						<>
							{/* Group by category */}
							{Array.from(new Set(filteredCommands.map((c) => c.category))).map((category) => (
								<div key={category}>
									<div
										className={`px-4 py-1 text-xs font-semibold uppercase tracking-wider ${
											theme === "dark" ? "text-gray-500" : "text-gray-400"
										}`}
									>
										{category}
									</div>
									{filteredCommands
										.filter((c) => c.category === category)
										.map((command, _idx) => {
											const globalIndex = filteredCommands.indexOf(command);
											const isSelected = globalIndex === selectedIndex;
											return (
												<button
													key={command.id}
													type="button"
													onClick={() => handleSelect(command)}
													className={`w-full px-4 py-2 flex items-center gap-3 text-left text-sm transition-colors ${
														isSelected
															? theme === "dark"
																? "bg-blue-500/20 text-blue-400"
																: "bg-blue-50 text-blue-600"
															: theme === "dark"
																? "hover:bg-white/5"
																: "hover:bg-black/5"
													}`}
												>
													{command.icon && <span className="opacity-70">{command.icon}</span>}
													<div className="flex-1">
														<div className="font-medium">{command.label}</div>
														<div
															className={`text-xs ${
																theme === "dark" ? "text-gray-500" : "text-gray-400"
															}`}
														>
															{command.description}
														</div>
													</div>
												</button>
											);
										})}
								</div>
							))}
						</>
					)}
				</div>

				{/* Footer hint */}
				<div
					className={`px-4 py-2 border-t text-xs ${
						theme === "dark" ? "border-gray-700 text-gray-500" : "border-gray-200 text-gray-400"
					}`}
				>
					Use arrow keys to navigate, Enter to select
				</div>
			</div>
		</div>
	);
}
