/**
 * GoogleTasksSettingsModal — Task List selection modal.
 *
 * Modal dialog for selecting which Google Tasks list to sync tasks from.
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
	const {
		state,
		tasklists,
		connectInteractive,
		fetchTasklists,
		getSelectedTasklist,
		setSelectedTasklist,
	} = useGoogleTasks();

	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [hasChanges, setHasChanges] = useState(false);

	// Load task lists when modal opens
	useEffect(() => {
		if (isOpen) {
			if (!state.isConnected) {
				connectInteractive().catch(console.error);
			} else {
				fetchTasklists();
			}
		}
	}, [isOpen, state.isConnected, connectInteractive, fetchTasklists]);

	// Load selected task list
	useEffect(() => {
		if (isOpen) {
			getSelectedTasklist().then(setSelectedId);
		}
	}, [isOpen, getSelectedTasklist]);

	const handleSelectTasklist = async (id: string) => {
		setSelectedId(id);
		setHasChanges(true);
	};

	const handleSave = async () => {
		if (!selectedId) return;

		const success = await setSelectedTasklist(selectedId);
		if (success) {
			setHasChanges(false);
			onSave();
			onClose();
		}
	};

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			{/* Backdrop */}
			<div
				className="absolute inset-0 bg-black/50"
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
						<h2 className="text-lg font-semibold">Select Task List</h2>
						<button
							type="button"
							onClick={onClose}
							className="p-1 rounded transition-colors hover:bg-[var(--md-ref-color-surface-container-high)] text-[var(--md-ref-color-on-surface-variant)]"
						>
							<Icon name="close" size={20} />
						</button>
					</div>
					<p
						className="text-sm mt-1 text-[var(--md-ref-color-on-surface-variant)]"
					>
						Choose a task list to sync tasks from
					</p>
				</div>

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
							className="p-4 rounded-lg bg-[var(--md-ref-color-error-container)] text-[var(--md-ref-color-error)]"
						>
							<p className="text-sm">{state.error}</p>
						</div>
					) : tasklists.length === 0 ? (
						<p
							className="text-center py-8 text-[var(--md-ref-color-on-surface-variant)]"
						>
							No task lists found
						</p>
					) : (
						<div className="space-y-2">
							{tasklists.map((tasklist) => {
								const isSelected = selectedId === tasklist.id;
								return (
									<button
										key={tasklist.id}
										type="button"
										onClick={() => handleSelectTasklist(tasklist.id)}
										className={`w-full text-left p-3 rounded-lg border transition-colors bg-[var(--md-ref-color-surface-container-low)] border-[var(--md-ref-color-outline)] hover:bg-[var(--md-ref-color-surface-container)] ${isSelected ? "ring-2 ring-[var(--md-ref-color-primary)]" : ""}`}
									>
										<div className="flex items-center gap-3">
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
											<span className="text-sm font-medium">{tasklist.title}</span>
										</div>
									</button>
								);
							})}
						</div>
					)}
				</div>

				{/* Footer */}
				<div
					className="px-6 py-4 border-t flex justify-end gap-2 border-[var(--md-ref-color-outline-variant)]"
				>
					<button
						type="button"
						onClick={onClose}
						className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-[var(--md-ref-color-surface-container-low)] hover:bg-[var(--md-ref-color-surface-container)] text-[var(--md-ref-color-on-surface)]"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleSave}
						disabled={!hasChanges || state.isConnecting || !selectedId}
						className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-[var(--md-ref-color-primary)] hover:bg-[var(--md-ref-color-primary)] text-[var(--md-ref-color-on-primary-container)] disabled:opacity-40 disabled:cursor-not-allowed ${state.isConnecting ? "opacity-70 cursor-not-allowed" : ""}`}
					>
						Save
					</button>
				</div>
			</div>
		</div>
	);
}
