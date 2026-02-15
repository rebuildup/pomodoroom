export type TaskState = 'READY' | 'RUNNING' | 'PAUSED' | 'DONE';

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
  type: 'task' | 'break';
  title: string;
  startTime: string;
  endTime: string;
  taskId?: string;
}
