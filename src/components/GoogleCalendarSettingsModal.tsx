/**
 * GoogleCalendarSettingsModal — Calendar selection modal.
 *
 * Modal dialog for selecting which Google Calendars to sync events from.
 */

import { useState, useEffect } from "react";
import { Icon } from "./m3/Icon";
import {
	useGoogleCalendarSettings,
	getCalendarDisplayName,
	isPrimaryCalendar,
	getCalendarColor,
} from "@/hooks/useGoogleCalendarSettings";

interface GoogleCalendarSettingsModalProps {
	theme: "light" | "dark";
	isOpen: boolean;
	onClose: () => void;
	onSave: () => void;
}

export function GoogleCalendarSettingsModal({
	theme,
	isOpen,
	onClose,
	onSave,
}: GoogleCalendarSettingsModalProps) {
	const { state, calendars, fetchCalendars, setSelection } = useGoogleCalendarSettings();

	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [hasChanges, setHasChanges] = useState(false);

	// Load calendars when modal opens
	useEffect(() => {
		if (isOpen) {
			fetchCalendars();
		}
	}, [isOpen, fetchCalendars]);

	// Initialize selection from state when calendars load
	useEffect(() => {
		if (calendars.length > 0) {
			const initialIds = new Set(state.calendarIds);
			setSelectedIds(initialIds);
		}
	}, [calendars, state.calendarIds]);

	const handleToggleCalendar = (id: string) => {
		const newSelected = new Set(selectedIds);
		if (newSelected.has(id)) {
			// Prevent deselecting the last calendar
			if (newSelected.size > 1) {
				newSelected.delete(id);
			}
		} else {
			newSelected.add(id);
		}
		setSelectedIds(newSelected);
		setHasChanges(true);
	};

	const handleSave = async () => {
		const ids = Array.from(selectedIds);
		const success = await setSelection(ids);
		if (success) {
			setHasChanges(false);
			onSave();
			onClose();
		}
	};

	const handleSelectAll = () => {
		const allIds = new Set(calendars.map(c => c.id).filter(Boolean));
		setSelectedIds(allIds);
		setHasChanges(true);
	};

	const handleSelectNone = () => {
		// Keep at least primary
		const primaryId = calendars.find(c => isPrimaryCalendar(c))?.id || calendars[0]?.id;
		if (primaryId) {
			setSelectedIds(new Set([primaryId]));
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
				className={`relative w-full max-w-md max-h-[80vh] overflow-hidden rounded-xl shadow-2xl ${
					theme === "dark" ? "bg-gray-900" : "bg-white"
				}`}
			>
				{/* Header */}
				<div
					className={`px-6 py-4 border-b ${
						theme === "dark" ? "border-white/10" : "border-gray-200"
					}`}
				>
					<div className="flex items-center justify-between">
						<h2 className="text-lg font-semibold">Select Calendars</h2>
						<button
							type="button"
							onClick={onClose}
							className={`p-1 rounded transition-colors ${
								theme === "dark"
									? "hover:bg-white/10 text-gray-400 hover:text-gray-300"
									: "hover:bg-black/5 text-gray-600 hover:text-gray-900"
							}`}
						>
							<Icon name="close" size={20} />
						</button>
					</div>
					<p
						className={`text-sm mt-1 ${
							theme === "dark" ? "text-gray-400" : "text-gray-600"
						}`}
					>
						Choose which calendars to sync events from
					</p>
				</div>

				{/* Content */}
				<div className="px-6 py-4 overflow-y-auto max-h-[50vh]">
					{state.isLoading && calendars.length === 0 ? (
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
					) : calendars.length === 0 ? (
						<p
							className={`text-center py-8 ${
								theme === "dark" ? "text-gray-500" : "text-gray-400"
							}`}
						>
							No calendars found
						</p>
					) : (
						<div className="space-y-2">
							{/* Quick actions */}
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
									Select Primary Only
								</button>
							</div>

							{/* Calendar list */}
							{calendars.map((calendar) => {
								const id = calendar.id;
								const isSelected = selectedIds.has(id);
								const isPrimary = isPrimaryCalendar(calendar);
								const bgColor = getCalendarColor(calendar);

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
											onChange={() => handleToggleCalendar(id)}
											className="sr-only"
										/>
										<div
											className="w-4 h-4 rounded border flex items-center justify-center transition-colors"
											style={{
												backgroundColor: isSelected ? bgColor : "transparent",
												borderColor: isSelected ? bgColor : theme === "dark" ? "#666" : "#ccc",
											}}
										>
											{isSelected && (
												<Icon name="check" size={12} color="#fff" />
											)}
										</div>

										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2">
												<span className="text-sm font-medium truncate">
													{getCalendarDisplayName(calendar)}
												</span>
												{isPrimary && (
													<span
														className={`px-1.5 py-0.5 rounded text-xs ${
															theme === "dark"
																? "bg-blue-500/20 text-blue-400"
																: "bg-blue-100 text-blue-700"
														}`}
													>
														Primary
													</span>
												)}
											</div>
											{calendar.description && (
												<p
													className={`text-xs truncate mt-0.5 ${
														theme === "dark" ? "text-gray-500" : "text-gray-500"
													}`}
												>
													{calendar.description}
												</p>
											)}
										</div>
									</label>
								);
							})}
						</div>
					)}
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
						disabled={!hasChanges || state.isLoading}
						className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
							theme === "dark"
								? "bg-blue-500 hover:bg-blue-600 text-white disabled:bg-white/10 disabled:text-gray-600"
								: "bg-blue-600 hover:bg-blue-700 text-white disabled:bg-black/5 disabled:text-gray-400"
						} ${state.isLoading ? "opacity-70 cursor-not-allowed" : ""}`}
					>
						{state.isLoading ? "Saving..." : "Save"}
					</button>
				</div>
			</div>
		</div>
	);
}
