/**
 * TaskDetailDrawerExample - Example integration of TaskDetailDrawer.
 *
 * This file demonstrates how to integrate TaskDetailDrawer with TaskBoard
 * and TaskStream components.
 */

import { useState, useEffect } from "react";
import TaskBoard from "@/components/TaskBoard";
import TaskStream from "@/components/TaskStream";
import TaskDetailDrawer from "@/components/TaskDetailDrawer";
import { TaskDialog } from "@/components/TaskDialog";
import type { Task } from "@/types/schedule";
import type { TaskStreamItem } from "@/types/taskstream";
import type { StreamAction } from "@/components/TaskStream";

// ─── Example 1: TaskBoard with TaskDetailDrawer ─────────────────────────────────

export function TaskBoardWithDrawer() {
	const [selectedTask, setSelectedTask] = useState<Task | null>(null);
	const [isDrawerOpen, setIsDrawerOpen] = useState(false);
	const [isDialogOpen, setIsDialogOpen] = useState(false);

	// Mock data
	const tasks: Task[] = [
		{
			id: "1",
			title: "Review pull requests",
			description: "Check pending PRs and provide feedback",
			estimatedPomodoros: 2,
			completedPomodoros: 1,
			completed: false,
			tags: ["development", "review"],
			priority: 80,
			category: "active",
			createdAt: new Date().toISOString(),
		},
		{
			id: "2",
			title: "Write documentation",
			estimatedPomodoros: 3,
			completedPomodoros: 0,
			completed: false,
			tags: ["docs"],
			priority: 50,
			category: "active",
			createdAt: new Date().toISOString(),
		},
	];

	const projects = [
		{
			id: "p-web",
			name: "Web App",
			tasks: [],
			createdAt: new Date().toISOString(),
		},
	];

	const handleTaskClick = (task: Task) => {
		setSelectedTask(task);
		setIsDrawerOpen(true);
	};

	const handleEdit = () => {
		setIsDrawerOpen(false);
		setIsDialogOpen(true);
	};

	const handleSaveTask = (updatedTask: Task) => {
		// Update task in your state management
		console.log("Saving task:", updatedTask);
		setIsDialogOpen(false);
	};

	return (
		<>
			<TaskBoard
				projects={projects}
				tasks={tasks}
				onTaskClick={handleTaskClick}
				className="h-full"
			/>

			<TaskDetailDrawer
				isOpen={isDrawerOpen}
				onClose={() => setIsDrawerOpen(false)}
				task={selectedTask}
				projects={projects}
				onEdit={handleEdit}
				theme="dark"
			/>

			<TaskDialog
				isOpen={isDialogOpen}
				onClose={() => setIsDialogOpen(false)}
				onSave={handleSaveTask}
				task={selectedTask}
				theme="dark"
			/>
		</>
	);
}

// ─── Example 2: TaskStream with TaskDetailDrawer ─────────────────────────────────

export function TaskStreamWithDrawer() {
	const [selectedItem, setSelectedItem] = useState<TaskStreamItem | null>(null);
	const [isDrawerOpen, setIsDrawerOpen] = useState(false);

	const handleTaskClick = (item: TaskStreamItem) => {
		setSelectedItem(item);
		setIsDrawerOpen(true);
	};

	const handleAction = (taskId: string, action: StreamAction) => {
		console.log(`Action ${action} on task ${taskId}`);
		// Handle action in your state management
	};

	// Mock data
	const items: TaskStreamItem[] = [
		{
			id: "ts-1",
			title: "PR #142 レビュー",
			status: "plan",
			markdown: "- フロント変更箇所チェック\n- パフォーマンス確認",
			estimatedMinutes: 25,
			actualMinutes: 0,
			interruptCount: 0,
			tags: ["review"],
			createdAt: new Date().toISOString(),
			order: 0,
		},
		{
			id: "ts-2",
			title: "API エンドポイント設計",
			status: "doing",
			estimatedMinutes: 50,
			actualMinutes: 12,
			startedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
			interruptCount: 0,
			tags: ["design"],
			createdAt: new Date().toISOString(),
			order: 1,
		},
	];

	return (
		<>
			<TaskStream
				items={items}
				onAction={handleAction}
				onTaskClick={handleTaskClick}
				className="h-full"
			/>

			<TaskDetailDrawer
				isOpen={isDrawerOpen}
				onClose={() => setIsDrawerOpen(false)}
				task={selectedItem}
				theme="dark"
			/>
		</>
	);
}

// ─── Example 3: Standalone usage with keyboard shortcut ────────────────────────────

export function StandaloneDrawerExample() {
	const [isOpen, setIsOpen] = useState(false);

	// Close on Escape key is handled by the drawer itself
	// You can also add a keyboard shortcut to open it
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				setIsOpen(true);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	const sampleTask: Task = {
		id: "sample",
		title: "Sample Task",
		description: "This is a sample task to demonstrate the drawer.",
		estimatedPomodoros: 1,
		completedPomodoros: 0,
		completed: false,
		tags: ["sample"],
		priority: 50,
		category: "active",
		createdAt: new Date().toISOString(),
	};

	return (
		<>
			<button
				onClick={() => setIsOpen(true)}
				className="px-4 py-2 bg-blue-600 text-white rounded-lg"
			>
				Open Task Drawer (⌘K)
			</button>

			<TaskDetailDrawer
				isOpen={isOpen}
				onClose={() => setIsOpen(false)}
				task={sampleTask}
				theme="dark"
			/>
		</>
	);
}
