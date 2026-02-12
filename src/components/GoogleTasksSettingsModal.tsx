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
	isOpen: boolean;
	onClose: () => void;
	onSave: () => void;
}

export function GoogleTasksSettingsModal({
	isOpen,
	onClose,
	onSave,
}: GoogleTasksSettingsModalProps) {
	const { state, tasklists, fetchTasklists, setSelectedTasklists } = useGoogleTasks();

	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [hasChanges, setHasChanges] = useState(false);
	const [localError, setLocalError] = useState<string | null>(null);

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
			setLocalError("Select at least one task list");
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
		const allIds = new Set(tasklists.map((t) => t.id).filter(Boolean));
		setSelectedIds(allIds);
		setHasChanges(true);
	};

	const handleSelectNone = () => {
		// Keep at least one - select first list or "default" if exists
		const primaryId =
			tasklists.find((t) => t.id === "default")?.id ||
			tasklists.find((t) => t.title.toLowerCase().includes("primary"))?.id ||
			tasklists[0]?.id ||
			"";
		if (primaryId) {
			setSelectedIds(new Set([primaryId]));
	} else if (tasklists.length > 0) {
			const firstId = tasklists[0]?.id;
			if (firstId) {
				setSelectedIds(new Set([firstId]));
			}
		}
		setHasChanges(true);
	};

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			{/* Backdrop */}
			<div className="absolute inset-0 bg-black/50" onClick={onClose} />

			{/* Modal */}
			<div className="relative w-full max-w-md max-h-[80vh] overflow-hidden rounded-xl shadow-2xl bg-[var(--md-ref-color-surface)] text-[var(--md-ref-color-on-surface)]">
				{/* Header */}
				<div className="px-6 py-4 border-b border-[var(--md-ref-color-outline-variant)]">
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
					<p className="text-sm mt-1 text-[var(--md-ref-color-on-surface-variant)]">
						Choose which task lists to sync tasks from
					</p>
				</div>

				{/* Quick Actions */}
				{!state.isConnecting && tasklists.length > 1 && (
					<div className="flex gap-2 mb-4">
						<button
							type="button"
							onClick={handleSelectAll}
							className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-[var(--md-ref-color-surface-container-highest)] hover:bg-[var(--md-ref-color-surface-container)] text-[var(--md-ref-color-on-surface)]"
						>
							Select All
						</button>
						<button
							type="button"
							onClick={handleSelectNone}
							className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-[var(--md-ref-color-surface-container-highest)] hover:bg-[var(--md-ref-color-surface-container)] text-[var(--md-ref-color-on-surface)]"
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
					) : localError ? (
						<div className="p-4 rounded-lg bg-[var(--md-ref-color-error-container)] text-[var(--md-ref-color-on-error-container)]">
							<p className="text-sm">{localError}</p>
						</div>
					) : tasklists.length === 0 ? (
						<p className="text-center py-8 text-[var(--md-ref-color-on-surface-variant)]">
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
										className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors bg-[var(--md-ref-color-surface-container-highest)] border-[var(--md-ref-color-outline)] hover:bg-[var(--md-ref-color-surface-container)] ${
											isSelected ? "ring-2 ring-[var(--md-ref-color-primary)]" : ""
										}`}
									>
										<input
											type="checkbox"
											checked={isSelected}
											onChange={() => handleToggleTasklist(id)}
											className="sr-only"
										/>
										<div
											className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
												isSelected
													? "border-[var(--md-ref-color-primary)] bg-[var(--md-ref-color-primary)]"
													: "border-[var(--md-ref-color-outline-variant)] bg-transparent"
											}`}
										>
											{isSelected && <Icon name="check" size={10} color="#fff" />}
										</div>
										<div className="flex-1 min-w-0">
											<span className="text-sm font-medium truncate">
												{tasklist.title}
											</span>
										</div>
									</label>
								);
							})}
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="px-6 py-4 border-t flex justify-end gap-2 border-[var(--md-ref-color-outline-variant)]">
					<button
						type="button"
						onClick={onClose}
						className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-[var(--md-ref-color-surface-container-highest)] hover:bg-[var(--md-ref-color-surface-container)] text-[var(--md-ref-color-on-surface)]"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleSave}
						disabled={!hasChanges || state.isConnecting || selectedIds.size === 0}
						className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-[var(--md-ref-color-primary-container)] hover:bg-[var(--md-ref-color-primary)] text-[var(--md-ref-color-on-primary-container)] disabled:bg-[var(--md-ref-color-surface-container-highest)] disabled:text-[var(--md-ref-color-on-surface-variant)] ${
							state.isConnecting || selectedIds.size === 0
								? "opacity-70 cursor-not-allowed"
								: ""
						}`}
					>
						{state.isConnecting ? "Saving..." : "Save"}
					</button>
				</div>
			</div>
		</div>
	);
}

export default GoogleTasksSettingsModal;
