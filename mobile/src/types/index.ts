export type TaskState = "READY" | "RUNNING" | "PAUSED" | "DONE";

export interface Task {
	id: string;
	title: string;
	description?: string;
	state: TaskState;
	priority: number;
	estimatedMinutes?: number;
	elapsedMinutes: number;
	createdAt: string;
	updatedAt: string;
	dueDate?: string;
	projectId?: string;
	calendarEventId?: string;
}

export interface BreakSuggestion {
	id: string;
	title: string;
	durationMinutes: number;
	reason: string;
}

export interface NextTaskCandidate {
	task: Task;
	score: number;
	reasons: string[];
}

export interface ScheduleItem {
	id: string;
	type: "task" | "break";
	title: string;
	startTime: string;
	endTime: string;
	taskId?: string;
}

export interface Project {
  id: string;
  name: string;
  deadline?: string; // ISO 8601
  createdAt: string;
  updatedAt: string;
  calendarEventId?: string; // Google Calendar event ID
}

export interface GoogleToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // Unix timestamp (ms)
  tokenType: string;
  scope: string;
}

export interface CalendarInfo {
  id: string;
  summary: string;
}

export interface SyncStatus {
  lastSyncAt: string | null;
  isSyncing: boolean;
  error: string | null;
}
