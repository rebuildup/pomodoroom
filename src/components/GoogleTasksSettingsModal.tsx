/**
 * GoogleTasksSettingsModal — Task List selection modal.
 *
 * Modal dialog for selecting which Google Task Lists to sync tasks from.
 * Supports multiple list selection (checkboxes).
 */

import { useState, useEffect } from "react";
import { Icon } from "./m3/Icon";
import { useGoogleTasks } from "@/hooks/useGoogleTasks";

interface GoogleTasksSettingsModalProps {
	theme: "light" | "dark";
	isOpen: boolean;
	onClose: () => void;
	onSave: () => void;
}

export function GoogleTasksSettingsModal({
	theme,
	isOpen,
	onClose,
	onSave,
}: GoogleTasksSettingsModalProps) {
	const { state, tasklists, fetchTasklists, getSelectedTasklists, setSelectedTasklists } = useGoogleTasks();

	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [hasChanges, setHasChanges] = useState(false);

	// Load task lists when modal opens
	useEffect(() => {
		if (isOpen) {
			if (!state.isConnected) {
				// Try to connect if not connected
				// Note: In a real scenario, you might want to show connect prompt here
			} else {
				fetchTasklists();
			}
		}
	}, [isOpen, state.isConnected, fetchTasklists]);

	// Initialize selection from state when tasklists load
	useEffect(() => {
		if (isOpen && tasklists.length > 0) {
			const initialIds = new Set(state.tasklistIds);
			setSelectedIds(initialIds);
		}
	}, [isOpen, tasklists, state.tasklistIds]);

	const handleToggleTasklist = (id: string) => {
		const newSelected = new Set(selectedIds);
		if (newSelected.has(id)) {
			// Deselect
			newSelected.delete(id);
		} else {
			// Select
			newSelected.add(id);
		}
		setSelectedIds(newSelected);
		setHasChanges(true);
	};

	const handleSave = async () => {
		const ids = Array.from(selectedIds);
		if (ids.length === 0) {
			setState(prev => ({ ...prev, error: "Select at least one task list" }));
			return;
		}

		const success = await setSelectedTasklists(ids);
		if (success) {
			setHasChanges(false);
			onSave();
			onClose();
		}
	};

	const handleSelectAll = () => {
		const allIds = new Set(tasklists.map(t => t.id).filter(Boolean));
		setSelectedIds(allIds);
		setHasChanges(true);
	};

	const handleSelectNone = () => {
		// Keep at least one - select first list or "default" if exists
		const primaryId = tasklists.find(t => t.id === "default")?.id
			|| tasklists.find(t => t.title.toLowerCase().includes("primary"))?.id
			|| tasklists[0]?.id
			|| "";
		if (primaryId) {
			setSelectedIds(new Set([primaryId]));
		} else if (tasklists.length > 0) {
			setSelectedIds(new Set([tasklists[0].id));
		}
		setHasChanges(true);
	};

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			{/* Backdrop */}
			<div
				className={`absolute inset-0 ${
					theme === "dark" ? "bg-black/70" : "bg-black/50"
				}`}
				onClick={onClose}
			/>

			{/* Modal */}
			<div
				className="relative w-full max-w-md max-h-[80vh] overflow-hidden rounded-xl shadow-2xl bg-[var(--md-ref-color-surface)] text-[var(--md-ref-color-on-surface)]"
			>
				{/* Header */}
				<div
					className="px-6 py-4 border-b border-[var(--md-ref-color-outline-variant)]"
				>
					<div className="flex items-center justify-between">
						<h2 className="text-lg font-semibold">Select Task Lists</h2>
						<button
							type="button"
							onClick={onClose}
							className="p-1 rounded transition-colors hover:bg-[var(--md-ref-color-surface-container-high)] text-[var(--md-ref-color-on-surface-variant)] hover:text-[var(--md-ref-color-on-surface)]"
						>
							<Icon name="close" size={20} />
						</button>
					</div>
					<p
						className={`text-sm mt-1 ${
							theme === "dark" ? "text-gray-400" : "text-gray-600"
						}`}
					>
						Choose which task lists to sync tasks from
					</p>
				</div>

				{/* Quick Actions */}
				{!state.isConnecting && tasklists.length > 1 && (
					<div className="flex gap-2 mb-4">
						<button
							type="button"
							onClick={handleSelectAll}
							className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
								theme === "dark"
									? "bg-white/5 hover:bg-white/10 text-gray-300"
									: "bg-black/5 hover:bg-black/10 text-gray-700"
							}`}
						>
							Select All
						</button>
						<button
							type="button"
							onClick={handleSelectNone}
							className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
								theme === "dark"
									? "bg-white/5 hover:bg-white/10 text-gray-300"
									: "bg-black/5 hover:bg-black/10 text-gray-700"
							}`}
						>
							Primary Only
						</button>
					</div>
				)}

				{/* Content */}
				<div className="px-6 py-4 overflow-y-auto max-h-[50vh]">
					{state.isConnecting ? (
						<div className="flex items-center justify-center py-8">
							<div className="animate-spin">
								<Icon name="refresh" size={24} />
							</div>
						</div>
					) : state.error ? (
						<div
							className={`p-4 rounded-lg ${
								theme === "dark" ? "bg-red-500/20 text-red-400" : "bg-red-50 text-red-600"
							}`}
						>
							<p className="text-sm">{state.error}</p>
						</div>
					) : tasklists.length === 0 ? (
						<p
							className={`text-center py-8 ${
								theme === "dark" ? "text-gray-500" : "text-gray-400"
							}`}
						>
							No task lists found
						</p>
					) : (
						<div className="space-y-2">
							{tasklists.map((tasklist) => {
								const id = tasklist.id;
								const isSelected = selectedIds.has(id);

								return (
									<label
										key={id}
										className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
											theme === "dark"
												? "bg-white/5 border-white/10 hover:bg-white/10"
												: "bg-black/5 border-black/10 hover:bg-black/10"
										} ${isSelected ? "ring-2 ring-blue-500" : ""}`}
									>
										<input
											type="checkbox"
											checked={isSelected}
											onChange={() => handleToggleTasklist(id)}
											className="sr-only"
										/>
										<div
											className="w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors"
											style={{
												borderColor: isSelected ? "#3b82f6" : theme === "dark" ? "#666" : "#ccc",
												backgroundColor: isSelected ? "#3b82f6" : "transparent",
											}}
										>
											{isSelected && (
												<Icon name="check" size={10} color="#fff" />
											)}
										</div>
										<div className="flex-1 min-w-0">
											<span className="text-sm font-medium truncate">{tasklist.title}</span>
										</div>
									</label>
								);
							})}
						</div>
					)}
				</div>
				</div>

				{/* Footer */}
				<div
					className={`px-6 py-4 border-t flex justify-end gap-2 ${
						theme === "dark" ? "border-white/10" : "border-gray-200"
					}`}
				>
					<button
						type="button"
						onClick={onClose}
						className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
							theme === "dark"
								? "bg-white/5 hover:bg-white/10 text-gray-300"
								: "bg-black/5 hover:bg-black/10 text-gray-700"
						}`}
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleSave}
						disabled={!hasChanges || state.isConnecting || selectedIds.size === 0}
						className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
							theme === "dark"
								? "bg-blue-500 hover:bg-blue-600 text-white disabled:bg-white/10 disabled:text-gray-600"
								: "bg-blue-600 hover:bg-blue-700 text-white disabled:bg-black/5 disabled:text-gray-400"
							} ${state.isConnecting || selectedIds.size === 0 ? "opacity-70 cursor-not-allowed" : ""}`}
					>
						{state.isConnecting ? "Saving..." : "Save"}
					</button>
				</div>
			</div>
		</div>
		);
}
}
