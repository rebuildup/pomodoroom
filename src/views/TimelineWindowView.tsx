/**
 * TimelineWindowView -- Standalone timeline window.
 *
 * Shows daily timeline with tasks, events, and time gaps.
 * Integrates with Rust backend for gap detection and task proposals.
 */
import { useEffect, useState, useMemo } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useRightClickDrag } from "@/hooks/useRightClickDrag";
import { useTimeline } from "@/hooks/useTimeline";
import TitleBar from "@/components/TitleBar";
import { TimelineView } from "@/components/TimelineView";
import { TaskProposalCard } from "@/components/TaskProposalCard";
import type { PomodoroSettings, TimelineItem, TaskProposal } from "@/types";
import { DEFAULT_SETTINGS } from "@/constants/defaults";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Calendar, ChevronLeft, ChevronRight, RefreshCw, Plus } from "lucide-react";

export default function TimelineWindowView() {
	const [settings] = useLocalStorage<PomodoroSettings>(
		"pomodoroom-settings",
		DEFAULT_SETTINGS,
	);
	const theme = settings.theme;

	// Timeline state
	const [selectedDate, setSelectedDate] = useState(new Date());
	const [isLoading, setIsLoading] = useState(false);
	const [items, setItems] = useState<TimelineItem[]>([]);
	const [topProposal, setTopProposal] = useState<TaskProposal | null>(null);

	// Use shared right-click drag hook
	const { handleRightDown } = useRightClickDrag();

	// Timeline hook for backend integration
	const timeline = useTimeline();

	// Format date for display
	const formatDate = (date: Date): string => {
		const options: Intl.DateTimeFormatOptions = {
			weekday: "short",
			month: "short",
			day: "numeric",
		};
		return date.toLocaleDateString("ja-JP", options);
	};

	// Check if selected date is today
	const isToday = useMemo(() => {
		const today = new Date();
		return (
			selectedDate.getDate() === today.getDate() &&
			selectedDate.getMonth() === today.getMonth() &&
			selectedDate.getFullYear() === today.getFullYear()
		);
	}, [selectedDate]);

	// Navigate dates
	const goToPreviousDay = () => {
		const newDate = new Date(selectedDate);
		newDate.setDate(newDate.getDate() - 1);
		setSelectedDate(newDate);
	};

	const goToNextDay = () => {
		const newDate = new Date(selectedDate);
		newDate.setDate(newDate.getDate() + 1);
		setSelectedDate(newDate);
	};

	const goToToday = () => {
		setSelectedDate(new Date());
	};

	// Refresh timeline data
	const refreshTimeline = async () => {
		setIsLoading(true);
		try {
			// Get top proposal from timeline hook
			const proposal = await timeline.getTopProposal();
			setTopProposal(proposal);

			// In a real implementation, we would fetch items from the backend
			// For now, we'll use sample data or empty array
			setItems([]);
		} catch (error) {
			console.error("Failed to refresh timeline:", error);
		} finally {
			setIsLoading(false);
		}
	};

	// Initial load and reload on date change
	useEffect(() => {
		refreshTimeline();
	}, [selectedDate]);

	// Handle proposal actions
	const handleAcceptProposal = () => {
		if (topProposal) {
			console.log("Accepted proposal:", topProposal.task.title);
			setTopProposal(null);
			// Could start timer here
		}
	};

	const handleRejectProposal = () => {
		if (topProposal) {
			console.log("Rejected proposal:", topProposal.task.title);
			setTopProposal(null);
		}
	};

	const handleSnoozeProposal = () => {
		if (topProposal) {
			console.log("Snoozed proposal:", topProposal.task.title);
			setTopProposal(null);
		}
	};

	// Handle item click
	const handleItemClick = (item: TimelineItem) => {
		console.log("Clicked item:", item);
		// Could open item details or start related timer
	};

	// Keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement ||
				e.target instanceof HTMLSelectElement
			) {
				return;
			}

			// Esc closes the window
			if (e.key === "Escape") {
				getCurrentWindow().close();
				return;
			}

			// Arrow keys for date navigation
			if (e.key === "ArrowLeft") {
				goToPreviousDay();
			} else if (e.key === "ArrowRight") {
				goToNextDay();
			} else if (e.key === "t" && !e.ctrlKey && !e.metaKey) {
				goToToday();
			} else if (e.key === "r" && !e.ctrlKey && !e.metaKey) {
				refreshTimeline();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [selectedDate]);

	return (
		<div
			className={`w-screen h-screen flex flex-col overflow-hidden select-none ${
				theme === "dark"
					? "bg-gray-900 text-white"
					: "bg-white text-gray-900"
			}`}
			onMouseDown={handleRightDown}
			onContextMenu={(e) => e.preventDefault()}
		>
			<TitleBar theme={theme} title="Timeline" showMinMax={false} />

			{/* Header with date navigation */}
			<div
				className={`flex items-center justify-between px-4 py-3 border-b ${
					theme === "dark" ? "border-gray-700" : "border-gray-200"
				}`}
			>
				{/* Date navigation */}
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={goToPreviousDay}
						className={`p-1.5 rounded-lg transition-colors ${
							theme === "dark"
								? "hover:bg-gray-800 text-gray-400 hover:text-white"
								: "hover:bg-gray-100 text-gray-500 hover:text-gray-900"
						}`}
						title="Previous day (←)"
					>
						<ChevronLeft size={20} />
					</button>

					<button
						type="button"
						onClick={goToToday}
						className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-colors ${
							isToday
								? theme === "dark"
									? "bg-blue-600 text-white"
									: "bg-blue-500 text-white"
								: theme === "dark"
									? "hover:bg-gray-800 text-gray-300"
									: "hover:bg-gray-100 text-gray-700"
						}`}
						title="Go to today (T)"
					>
						<Calendar size={16} />
						<span>{formatDate(selectedDate)}</span>
					</button>

					<button
						type="button"
						onClick={goToNextDay}
						className={`p-1.5 rounded-lg transition-colors ${
							theme === "dark"
								? "hover:bg-gray-800 text-gray-400 hover:text-white"
								: "hover:bg-gray-100 text-gray-500 hover:text-gray-900"
						}`}
						title="Next day (→)"
					>
						<ChevronRight size={20} />
					</button>
				</div>

				{/* Actions */}
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={refreshTimeline}
						disabled={isLoading}
						className={`p-1.5 rounded-lg transition-colors ${
							theme === "dark"
								? "hover:bg-gray-800 text-gray-400 hover:text-white"
								: "hover:bg-gray-100 text-gray-500 hover:text-gray-900"
						} ${isLoading ? "animate-spin" : ""}`}
						title="Refresh (R)"
					>
						<RefreshCw size={18} />
					</button>

					<button
						type="button"
						className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
							theme === "dark"
								? "bg-gray-800 hover:bg-gray-700 text-gray-300"
								: "bg-gray-100 hover:bg-gray-200 text-gray-700"
						}`}
						title="Add task"
					>
						<Plus size={16} />
						<span className="text-sm">Add</span>
					</button>
				</div>
			</div>

			{/* Main content */}
			<div className="flex-1 overflow-hidden">
				{items.length === 0 && !isLoading ? (
					/* Empty state */
					<div className="h-full flex flex-col items-center justify-center px-6">
						<div
							className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
								theme === "dark" ? "bg-gray-800" : "bg-gray-100"
							}`}
						>
							<Calendar
								size={32}
								className={
									theme === "dark" ? "text-gray-600" : "text-gray-400"
								}
							/>
						</div>
						<h3
							className={`text-lg font-medium mb-2 ${
								theme === "dark" ? "text-gray-300" : "text-gray-700"
							}`}
						>
							No events today
						</h3>
						<p
							className={`text-sm text-center max-w-xs ${
								theme === "dark" ? "text-gray-500" : "text-gray-500"
							}`}
						>
							Your timeline is clear. Add tasks or connect integrations to see your schedule.
						</p>
					</div>
				) : (
					/* Timeline view */
					<TimelineView
						items={items}
						currentTime={new Date()}
						date={selectedDate}
						onItemClick={handleItemClick}
					/>
				)}
			</div>

			{/* Task proposal overlay */}
			{topProposal && (
				<div className="absolute bottom-4 left-4 right-4 z-50">
					<TaskProposalCard
						proposal={topProposal}
						onAccept={handleAcceptProposal}
						onReject={handleRejectProposal}
						onSnooze={handleSnoozeProposal}
					/>
				</div>
			)}

			{/* Loading overlay */}
			{isLoading && (
				<div className="absolute inset-0 bg-black/20 flex items-center justify-center z-40">
					<div
						className={`px-4 py-2 rounded-lg ${
							theme === "dark" ? "bg-gray-800" : "bg-white"
						} shadow-lg`}
					>
						<RefreshCw size={20} className="animate-spin" />
					</div>
				</div>
			)}

			{/* Keyboard shortcuts hint */}
			<div
				className={`absolute bottom-2 right-4 text-xs ${
					theme === "dark" ? "text-gray-600" : "text-gray-400"
				}`}
			>
				← → Navigate • T Today • R Refresh • Esc Close
			</div>
		</div>
	);
}
