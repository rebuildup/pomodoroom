import * as SQLite from "expo-sqlite";
import type { Task, TaskState } from "../types";

let db: SQLite.SQLiteDatabase | null = null;

export async function initDatabase(): Promise<void> {
	db = await SQLite.openDatabaseAsync("pomodoroom.db");

	await db.execAsync(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      state TEXT NOT NULL DEFAULT 'READY',
      priority INTEGER NOT NULL DEFAULT 0,
      estimated_minutes INTEGER,
      elapsed_minutes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      due_date TEXT,
      project_id TEXT
    );
    
    CREATE INDEX IF NOT EXISTS idx_tasks_state ON tasks(state);
    CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
  `);
}

export async function getAllTasks(): Promise<Task[]> {
	if (!db) throw new Error("Database not initialized");

	const rows = await db.getAllAsync<TaskRow>(
		"SELECT * FROM tasks ORDER BY priority DESC, created_at ASC",
	);

	return rows.map(rowToTask);
}

export async function getTasksByState(state: TaskState): Promise<Task[]> {
	if (!db) throw new Error("Database not initialized");

	const rows = await db.getAllAsync<TaskRow>(
		"SELECT * FROM tasks WHERE state = ? ORDER BY priority DESC, created_at ASC",
		state,
	);

	return rows.map(rowToTask);
}

export async function getTaskById(id: string): Promise<Task | null> {
	if (!db) throw new Error("Database not initialized");

	const row = await db.getFirstAsync<TaskRow>("SELECT * FROM tasks WHERE id = ?", id);

	return row ? rowToTask(row) : null;
}

export async function createTask(
	task: Omit<Task, "id" | "createdAt" | "updatedAt">,
): Promise<Task> {
	if (!db) throw new Error("Database not initialized");

	const now = new Date().toISOString();
	const id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

	const newTask: Task = {
		...task,
		id,
		createdAt: now,
		updatedAt: now,
	};

	await db.runAsync(
		`INSERT INTO tasks (id, title, description, state, priority, estimated_minutes, 
      elapsed_minutes, created_at, updated_at, due_date, project_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		newTask.id,
		newTask.title,
		newTask.description ?? null,
		newTask.state,
		newTask.priority,
		newTask.estimatedMinutes ?? null,
		newTask.elapsedMinutes,
		newTask.createdAt,
		newTask.updatedAt,
		newTask.dueDate ?? null,
		newTask.projectId ?? null,
	);

	return newTask;
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
	if (!db) throw new Error("Database not initialized");

	const existing = await getTaskById(id);
	if (!existing) return null;

	const updated: Task = {
		...existing,
		...updates,
		id: existing.id,
		updatedAt: new Date().toISOString(),
	};

	await db.runAsync(
		`UPDATE tasks SET 
      title = ?, description = ?, state = ?, priority = ?, 
      estimated_minutes = ?, elapsed_minutes = ?, updated_at = ?, 
      due_date = ?, project_id = ?
     WHERE id = ?`,
		updated.title,
		updated.description ?? null,
		updated.state,
		updated.priority,
		updated.estimatedMinutes ?? null,
		updated.elapsedMinutes,
		updated.updatedAt,
		updated.dueDate ?? null,
		updated.projectId ?? null,
		id,
	);

	return updated;
}

export async function deleteTask(id: string): Promise<boolean> {
	if (!db) throw new Error("Database not initialized");

	const result = await db.runAsync("DELETE FROM tasks WHERE id = ?", id);
	return result.changes > 0;
}

interface TaskRow {
	id: string;
	title: string;
	description: string | null;
	state: TaskState;
	priority: number;
	estimated_minutes: number | null;
	elapsed_minutes: number;
	created_at: string;
	updated_at: string;
	due_date: string | null;
	project_id: string | null;
}

function rowToTask(row: TaskRow): Task {
	return {
		id: row.id,
		title: row.title,
		description: row.description ?? undefined,
		state: row.state,
		priority: row.priority,
		estimatedMinutes: row.estimated_minutes ?? undefined,
		elapsedMinutes: row.elapsed_minutes,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		dueDate: row.due_date ?? undefined,
		projectId: row.project_id ?? undefined,
	};
}
