/**
 * TaskDialog -- Modal dialog for adding/editing tasks.
 */
import { useState, useEffect, useCallback } from "react";
import { X, Calendar, Clock, Tag, AlertCircle } from "lucide-react";
import type { TimelineItem, TimelineItemSource } from "@/types";

interface TaskDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onSave: (task: Omit<TimelineItem, "id">) => void;
	task?: TimelineItem | null;
	theme: "light" | "dark";
}

const SOURCE_OPTIONS: { value: TimelineItemSource; label: string }[] = [
	{ value: "manual", label: "Manual" },
	{ value: "google", label: "Google" },
	{ value: "notion", label: "Notion" },
	{ value: "linear", label: "Linear" },
	{ value: "github", label: "GitHub" },
];

const PRIORITY_OPTIONS = [
	{ value: 0, label: "None" },
	{ value: 25, label: "Low" },
	{ value: 50, label: "Medium" },
	{ value: 75, label: "High" },
	{ value: 100, label: "Urgent" },
];

export function TaskDialog({
	isOpen,
	onClose,
	onSave,
	task,
	theme,
}: TaskDialogProps) {
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [startTime, setStartTime] = useState("");
	const [endTime, setEndTime] = useState("");
	const [priority, setPriority] = useState(50);
	const [source, setSource] = useState<TimelineItemSource>("manual");
	const [tags, setTags] = useState("");
	const [deadline, setDeadline] = useState("");

	// Initialize form when task changes
	useEffect(() => {
		if (task) {
			setTitle(task.title);
			setDescription(task.description || "");
			setStartTime(task.startTime.slice(0, 16)); // datetime-local format
			setEndTime(task.endTime.slice(0, 16));
			setPriority(task.priority || 50);
			setSource(task.source);
			setTags(task.tags?.join(", ") || "");
			setDeadline(task.deadline?.slice(0, 16) || "");
		} else {
			// Default values for new task
			const now = new Date();
			const start = new Date(now);
			start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15);
			const end = new Date(start.getTime() + 30 * 60 * 1000);

			setTitle("");
			setDescription("");
			setStartTime(start.toISOString().slice(0, 16));
			setEndTime(end.toISOString().slice(0, 16));
			setPriority(50);
			setSource("manual");
			setTags("");
			setDeadline("");
		}
	}, [task, isOpen]);

	const handleSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();

			if (!title.trim() || !startTime || !endTime) return;

			const tagArray = tags
				.split(",")
				.map((t) => t.trim())
				.filter((t) => t.length > 0);

			onSave({
				type: "task",
				source,
				title: title.trim(),
				description: description.trim() || undefined,
				startTime: new Date(startTime).toISOString(),
				endTime: new Date(endTime).toISOString(),
				priority,
				tags: tagArray.length > 0 ? tagArray : undefined,
				deadline: deadline ? new Date(deadline).toISOString() : undefined,
			});

			onClose();
		},
		[title, description, startTime, endTime, priority, source, tags, deadline, onSave, onClose]
	);

	// Keyboard shortcuts
	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, onClose]);

	if (!isOpen) return null;

	const isDark = theme === "dark";

	return (
		<>
			{/* Backdrop */}
			<div
				className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
				onClick={onClose}
			/>

			{/* Dialog */}
			<div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
				<div
					className={`w-full max-w-md rounded-xl shadow-xl ${
						isDark
							? "bg-gray-800 border border-gray-700"
							: "bg-white border border-gray-200"
					}`}
					onClick={(e) => e.stopPropagation()}
				>
					{/* Header */}
					<div
						className={`flex items-center justify-between px-4 py-3 border-b ${
							isDark ? "border-gray-700" : "border-gray-200"
						}`}
					>
						<h2
							className={`text-lg font-semibold ${
								isDark ? "text-white" : "text-gray-900"
							}`}
						>
							{task ? "Edit Task" : "New Task"}
						</h2>
						<button
							type="button"
							onClick={onClose}
							className={`p-1 rounded-lg transition-colors ${
								isDark
									? "hover:bg-gray-700 text-gray-400 hover:text-white"
									: "hover:bg-gray-100 text-gray-500 hover:text-gray-900"
							}`}
						>
							<X size={20} />
						</button>
					</div>

					{/* Form */}
					<form onSubmit={handleSubmit} className="p-4 space-y-4">
						{/* Title */}
						<div>
							<label
								className={`block text-sm font-medium mb-1 ${
									isDark ? "text-gray-300" : "text-gray-700"
								}`}
							>
								Title *
							</label>
							<input
								type="text"
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								placeholder="Task title..."
								required
								className={`w-full px-3 py-2 rounded-lg border text-sm ${
									isDark
										? "bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500"
										: "bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500"
								} focus:outline-none focus:ring-1 focus:ring-blue-500`}
							/>
						</div>

						{/* Description */}
						<div>
							<label
								className={`block text-sm font-medium mb-1 ${
									isDark ? "text-gray-300" : "text-gray-700"
								}`}
							>
								Description
							</label>
							<textarea
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="Optional description..."
								rows={2}
								className={`w-full px-3 py-2 rounded-lg border text-sm resize-none ${
									isDark
										? "bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500"
										: "bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500"
								} focus:outline-none focus:ring-1 focus:ring-blue-500`}
							/>
						</div>

						{/* Time Range */}
						<div className="grid grid-cols-2 gap-3">
							<div>
								<label
									className={`flex items-center gap-1 text-sm font-medium mb-1 ${
										isDark ? "text-gray-300" : "text-gray-700"
									}`}
								>
									<Clock size={14} />
									Start *
								</label>
								<input
									type="datetime-local"
									value={startTime}
									onChange={(e) => setStartTime(e.target.value)}
									required
									className={`w-full px-3 py-2 rounded-lg border text-sm ${
										isDark
											? "bg-gray-700 border-gray-600 text-white focus:border-blue-500"
											: "bg-white border-gray-300 text-gray-900 focus:border-blue-500"
									} focus:outline-none focus:ring-1 focus:ring-blue-500`}
								/>
							</div>
							<div>
								<label
									className={`flex items-center gap-1 text-sm font-medium mb-1 ${
										isDark ? "text-gray-300" : "text-gray-700"
									}`}
								>
									<Clock size={14} />
									End *
								</label>
								<input
									type="datetime-local"
									value={endTime}
									onChange={(e) => setEndTime(e.target.value)}
									required
									className={`w-full px-3 py-2 rounded-lg border text-sm ${
										isDark
											? "bg-gray-700 border-gray-600 text-white focus:border-blue-500"
											: "bg-white border-gray-300 text-gray-900 focus:border-blue-500"
									} focus:outline-none focus:ring-1 focus:ring-blue-500`}
								/>
							</div>
						</div>

						{/* Priority & Source */}
						<div className="grid grid-cols-2 gap-3">
							<div>
								<label
									className={`flex items-center gap-1 text-sm font-medium mb-1 ${
										isDark ? "text-gray-300" : "text-gray-700"
									}`}
								>
									<AlertCircle size={14} />
									Priority
								</label>
								<select
									value={priority}
									onChange={(e) => setPriority(Number(e.target.value))}
									className={`w-full px-3 py-2 rounded-lg border text-sm ${
										isDark
											? "bg-gray-700 border-gray-600 text-white focus:border-blue-500"
											: "bg-white border-gray-300 text-gray-900 focus:border-blue-500"
									} focus:outline-none focus:ring-1 focus:ring-blue-500`}
								>
									{PRIORITY_OPTIONS.map((opt) => (
										<option key={opt.value} value={opt.value}>
											{opt.label}
										</option>
									))}
								</select>
							</div>
							<div>
								<label
									className={`block text-sm font-medium mb-1 ${
										isDark ? "text-gray-300" : "text-gray-700"
									}`}
								>
									Source
								</label>
								<select
									value={source}
									onChange={(e) => setSource(e.target.value as TimelineItemSource)}
									className={`w-full px-3 py-2 rounded-lg border text-sm ${
										isDark
											? "bg-gray-700 border-gray-600 text-white focus:border-blue-500"
											: "bg-white border-gray-300 text-gray-900 focus:border-blue-500"
									} focus:outline-none focus:ring-1 focus:ring-blue-500`}
								>
									{SOURCE_OPTIONS.map((opt) => (
										<option key={opt.value} value={opt.value}>
											{opt.label}
										</option>
									))}
								</select>
							</div>
						</div>

						{/* Deadline */}
						<div>
							<label
								className={`flex items-center gap-1 text-sm font-medium mb-1 ${
									isDark ? "text-gray-300" : "text-gray-700"
								}`}
							>
								<Calendar size={14} />
								Deadline
							</label>
							<input
								type="datetime-local"
								value={deadline}
								onChange={(e) => setDeadline(e.target.value)}
								className={`w-full px-3 py-2 rounded-lg border text-sm ${
									isDark
										? "bg-gray-700 border-gray-600 text-white focus:border-blue-500"
										: "bg-white border-gray-300 text-gray-900 focus:border-blue-500"
								} focus:outline-none focus:ring-1 focus:ring-blue-500`}
							/>
						</div>

						{/* Tags */}
						<div>
							<label
								className={`flex items-center gap-1 text-sm font-medium mb-1 ${
									isDark ? "text-gray-300" : "text-gray-700"
								}`}
							>
								<Tag size={14} />
								Tags
							</label>
							<input
								type="text"
								value={tags}
								onChange={(e) => setTags(e.target.value)}
								placeholder="Comma-separated tags..."
								className={`w-full px-3 py-2 rounded-lg border text-sm ${
									isDark
										? "bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500"
										: "bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500"
								} focus:outline-none focus:ring-1 focus:ring-blue-500`}
							/>
						</div>

						{/* Actions */}
						<div className="flex justify-end gap-2 pt-2">
							<button
								type="button"
								onClick={onClose}
								className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
									isDark
										? "bg-gray-700 hover:bg-gray-600 text-gray-300"
										: "bg-gray-100 hover:bg-gray-200 text-gray-700"
								}`}
							>
								Cancel
							</button>
							<button
								type="submit"
								className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
							>
								{task ? "Update" : "Create"}
							</button>
						</div>
					</form>
				</div>
			</div>
		</>
	);
}
