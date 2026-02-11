# Pomodoroom API Reference

Complete reference for all Tauri IPC commands with TypeScript type definitions.

## Quick Reference

| Category | Commands |
|----------|----------|
| Timer | `cmd_timer_status`, `cmd_timer_tick`, `cmd_timer_start`, `cmd_timer_pause`, `cmd_timer_resume`, `cmd_timer_skip`, `cmd_timer_reset` |
| Task CRUD | `cmd_task_create`, `cmd_task_update`, `cmd_task_delete`, `cmd_task_list`, `cmd_task_get` |
| Task State | `cmd_task_start`, `cmd_task_pause`, `cmd_task_resume`, `cmd_task_complete`, `cmd_task_postpone`, `cmd_task_extend`, `cmd_task_available_actions` |
| Project | `cmd_project_create`, `cmd_project_list` |
| Template | `cmd_template_get`, `cmd_template_set` |
| Schedule | `cmd_schedule_generate`, `cmd_schedule_auto_fill`, `cmd_schedule_create_block`, `cmd_schedule_update_block`, `cmd_schedule_delete_block`, `cmd_schedule_list_blocks` |
| Config | `cmd_config_get`, `cmd_config_set`, `cmd_config_list` |
| Stats | `cmd_stats_today`, `cmd_stats_all` |
| Timeline | `cmd_timeline_detect_gaps`, `cmd_timeline_generate_proposals`, `cmd_calculate_priority`, `cmd_calculate_priorities` |
| OAuth | `cmd_store_oauth_tokens`, `cmd_load_oauth_tokens`, `cmd_clear_oauth_tokens` |

---

## TypeScript Type Definitions

```typescript
// ============= Core Types =============

type TimerState = "idle" | "running" | "paused" | "completed";
type StepType = "focus" | "break";
type TaskState = "ready" | "running" | "paused" | "done";
type EnergyLevel = "high" | "medium" | "low";
type TaskCategory = "active" | "someday";
type BlockType = "focus" | "break" | "routine" | "calendar";

// ============= Timer Types =============

interface StateSnapshot {
  state: TimerState;
  step_index: number;
  step_type: StepType;
  step_label: string;
  remaining_ms: number;
  total_ms: number;
  schedule_progress_pct: number;
  at: string; // ISO 8601
}

interface TimerStartedEvent {
  type: "TimerStarted";
  step_index: number;
  step_type: StepType;
  duration_secs: number;
  at: string;
}

interface TimerPausedEvent {
  type: "TimerPaused";
  remaining_ms: number;
  at: string;
}

interface TimerResumedEvent {
  type: "TimerResumed";
  remaining_ms: number;
  at: string;
}

interface TimerSkippedEvent {
  type: "TimerSkipped";
  from_step: number;
  to_step: number;
  at: string;
}

interface TimerResetEvent {
  type: "TimerReset";
  at: string;
}

interface TimerCompletedEvent {
  type: "TimerCompleted";
  step_index: number;
  step_type: StepType;
  at: string;
}

type TimerEvent =
  | TimerStartedEvent
  | TimerPausedEvent
  | TimerResumedEvent
  | TimerSkippedEvent
  | TimerResetEvent
  | TimerCompletedEvent
  | StateSnapshot;

// ============= Task Types =============

interface Task {
  id: string;
  title: string;
  description?: string;
  estimated_pomodoros: number;
  completed_pomodoros: number;
  completed: boolean;
  state: TaskState;
  project_id?: string;
  project_name?: string;
  tags: string[];
  priority?: number; // 0-100
  category: TaskCategory;
  estimated_minutes?: number;
  elapsed_minutes: number;
  energy: EnergyLevel;
  group?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  paused_at?: string;
}

interface TaskCreateParams {
  title: string;
  description?: string;
  project_id?: string;
  tags?: string[];
  estimated_pomodoros?: number;
  priority?: number;
  category?: "active" | "someday";
}

interface TaskUpdateParams {
  id: string;
  title?: string;
  description?: string;
  project_id?: string;
  tags?: string[];
  estimated_pomodoros?: number;
  completed_pomodoros?: number;
  completed?: boolean;
  priority?: number;
  category?: "active" | "someday";
}

// ============= Project Types =============

interface Project {
  id: string;
  name: string;
  deadline?: string; // ISO 8601
  created_at: string;
}

interface ProjectCreateParams {
  name: string;
  deadline?: string; // ISO 8601
}

// ============= Schedule Types =============

interface DailyTemplate {
  wake_up: string; // HH:MM
  sleep: string;   // HH:MM
  fixed_events: FixedEvent[];
  max_parallel_lanes?: number;
}

interface FixedEvent {
  title: string;
  start: string; // HH:MM
  end: string;   // HH:MM
  type?: "routine" | "calendar";
}

interface ScheduleBlock {
  id: string;
  block_type: BlockType;
  task_id?: string;
  start_time: string; // ISO 8601
  end_time: string;   // ISO 8601
  locked: boolean;
  label?: string;
  lane?: number;
}

interface ScheduleBlockCreateParams {
  blockType: "focus" | "break" | "routine" | "calendar";
  startTime: string; // ISO 8601
  endTime: string;   // ISO 8601
  taskId?: string;
  locked?: boolean;
  label?: string;
  lane?: number;
}

interface ScheduleBlockUpdateParams {
  id: string;
  startTime?: string;
  endTime?: string;
  lane?: number;
  label?: string;
}

interface CalendarEvent {
  id?: string;
  title: string;
  start_time: string; // ISO 8601
  end_time: string;   // ISO 8601
}

// ============= Stats Types =============

interface Stats {
  total_sessions: number;
  total_focus_min: number;
  total_break_min: number;
  completed_pomodoros: number;
  today_sessions: number;
  today_focus_min: number;
}

// ============= Timeline Types =============

interface TimelineEvent {
  start_time: string; // ISO 8601
  end_time: string;   // ISO 8601
}

interface TimeGap {
  start: string; // ISO 8601
  end: string;   // ISO 8601
  duration_min: number;
}

interface TimelineItem {
  id: string;
  title: string;
  estimated_minutes?: number;
  priority?: number;
  deadline?: string;
}

interface TaskProposal {
  gap: TimeGap;
  task: TimelineItem;
  reason: string;
}

interface PriorityResult {
  task_id: string;
  priority: number;
}

// ============= OAuth Types =============

interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
  scope?: string;
}

// ============= Tauri Invoke Wrapper =============

import { invoke } from "@tauri-apps/api/core";

// ============= Timer Commands =============

/**
 * Get the current timer state as a JSON snapshot.
 * @returns StateSnapshot with current timer status
 */
export async function timerStatus(): Promise<StateSnapshot> {
  return invoke("cmd_timer_status");
}

/**
 * Advance the timer and check for completion.
 * Should be called periodically (e.g., every 100ms).
 * @returns StateSnapshot with optional completed event
 */
export async function timerTick(): Promise<StateSnapshot & { completed?: TimerEvent }> {
  return invoke("cmd_timer_tick");
}

/**
 * Start the timer, optionally at a specific step.
 * @param step - Optional step index to start at (0-based)
 * @param taskId - Optional task ID to link with this session
 * @param projectId - Optional project ID to link with this session
 * @returns TimerStarted event or null if already running
 */
export async function timerStart(
  step?: number,
  taskId?: string,
  projectId?: string
): Promise<TimerStartedEvent | null> {
  return invoke("cmd_timer_start", { step, task_id: taskId, project_id: projectId });
}

/**
 * Pause the running timer.
 * @returns TimerPaused event or null if not running
 */
export async function timerPause(): Promise<TimerPausedEvent | null> {
  return invoke("cmd_timer_pause");
}

/**
 * Resume a paused timer.
 * @returns TimerResumed event or null if not paused
 */
export async function timerResume(): Promise<TimerResumedEvent | null> {
  return invoke("cmd_timer_resume");
}

/**
 * Skip to the next step in the schedule.
 * @returns TimerSkipped event
 */
export async function timerSkip(): Promise<TimerSkippedEvent> {
  return invoke("cmd_timer_skip");
}

/**
 * Reset the timer to the initial state.
 * @returns TimerReset event
 */
export async function timerReset(): Promise<TimerResetEvent> {
  return invoke("cmd_timer_reset");
}

// ============= Task CRUD Commands =============

/**
 * Create a new task.
 * @param params - Task creation parameters
 * @returns Created Task object
 */
export async function taskCreate(params: TaskCreateParams): Promise<Task> {
  return invoke("cmd_task_create", params);
}

/**
 * Update an existing task.
 * @param params - Task update parameters (must include id)
 * @returns Updated Task object
 */
export async function taskUpdate(params: TaskUpdateParams): Promise<Task> {
  return invoke("cmd_task_update", params);
}

/**
 * Delete a task.
 * @param id - Task ID to delete
 */
export async function taskDelete(id: string): Promise<void> {
  return invoke("cmd_task_delete", { id });
}

/**
 * List tasks with optional filtering.
 * @param projectId - Optional project ID to filter by
 * @param category - Optional category filter ("active" or "someday")
 * @returns Array of Task objects
 */
export async function taskList(
  projectId?: string,
  category?: "active" | "someday"
): Promise<Task[]> {
  return invoke("cmd_task_list", {
    project_id: projectId,
    category,
  });
}

/**
 * Get a single task by ID.
 * @param id - Task ID to retrieve
 * @returns Task object or null if not found
 */
export async function taskGet(id: string): Promise<Task | null> {
  return invoke("cmd_task_get", { id });
}

// ============= Task State Commands =============

/**
 * Start a task: READY → RUNNING.
 * Auto-pauses any other RUNNING tasks and starts the timer.
 * @param id - Task ID to start
 * @returns Updated Task object
 */
export async function taskStart(id: string): Promise<Task> {
  return invoke("cmd_task_start", { id });
}

/**
 * Pause a running task: RUNNING → PAUSED.
 * Also pauses the timer.
 * @param id - Task ID to pause
 * @returns Updated Task object
 */
export async function taskPause(id: string): Promise<Task> {
  return invoke("cmd_task_pause", { id });
}

/**
 * Resume a paused task: PAUSED → RUNNING.
 * Auto-pauses other RUNNING tasks and resumes timer.
 * @param id - Task ID to resume
 * @returns Updated Task object
 */
export async function taskResume(id: string): Promise<Task> {
  return invoke("cmd_task_resume", { id });
}

/**
 * Complete a task: RUNNING → DONE.
 * Resets the timer.
 * @param id - Task ID to complete
 * @returns Updated Task object
 */
export async function taskComplete(id: string): Promise<Task> {
  return invoke("cmd_task_complete", { id });
}

/**
 * Postpone a task: RUNNING/PAUSED → READY.
 * Decreases priority by 20 (minimum -100). Resets timer.
 * @param id - Task ID to postpone
 * @returns Updated Task object
 */
export async function taskPostpone(id: string): Promise<Task> {
  return invoke("cmd_task_postpone", { id });
}

/**
 * Extend a task's estimated time.
 * @param id - Task ID to extend
 * @param minutes - Additional minutes to add (1-480)
 * @returns Updated Task object
 */
export async function taskExtend(id: string, minutes: number): Promise<Task> {
  return invoke("cmd_task_extend", { id, minutes });
}

/**
 * Get available actions for a task.
 * @param id - Task ID to query
 * @returns Array of available action names (e.g., ["start", "pause", "complete"])
 */
export async function taskAvailableActions(id: string): Promise<string[]> {
  return invoke("cmd_task_available_actions", { id });
}

// ============= Project Commands =============

/**
 * Create a new project.
 * @param params - Project creation parameters
 * @returns Created Project object
 */
export async function projectCreate(params: ProjectCreateParams): Promise<Project> {
  return invoke("cmd_project_create", params);
}

/**
 * List all projects.
 * @returns Array of Project objects
 */
export async function projectList(): Promise<Project[]> {
  return invoke("cmd_project_list");
}

// ============= Template Commands =============

/**
 * Get the current daily template.
 * @returns DailyTemplate object or default template
 */
export async function templateGet(): Promise<DailyTemplate> {
  return invoke("cmd_template_get");
}

/**
 * Set the daily template.
 * @param template - Daily template as JSON
 */
export async function templateSet(template: DailyTemplate): Promise<void> {
  return invoke("cmd_template_set", { template_json: template });
}

// ============= Schedule Commands =============

/**
 * Generate a daily schedule from template and available tasks.
 * @param dateIso - Target date in ISO format (YYYY-MM-DD)
 * @param calendarEvents - Optional array of calendar events to avoid
 * @returns Array of ScheduledBlock objects
 */
export async function scheduleGenerate(
  dateIso: string,
  calendarEvents?: CalendarEvent[]
): Promise<ScheduleBlock[]> {
  return invoke("cmd_schedule_generate", {
    date_iso: dateIso,
    calendar_events_json: calendarEvents,
  });
}

/**
 * Auto-fill available time slots with top priority tasks.
 * @param dateIso - Target date in ISO format (YYYY-MM-DD)
 * @param calendarEvents - Optional array of calendar events to avoid
 * @returns Array of ScheduledBlock objects
 */
export async function scheduleAutoFill(
  dateIso: string,
  calendarEvents?: CalendarEvent[]
): Promise<ScheduleBlock[]> {
  return invoke("cmd_schedule_auto_fill", {
    date_iso: dateIso,
    calendar_events_json: calendarEvents,
  });
}

/**
 * Create a manual schedule block.
 * @param block - Schedule block parameters
 * @returns Created ScheduleBlock object
 */
export async function scheduleCreateBlock(block: ScheduleBlockCreateParams): Promise<ScheduleBlock> {
  return invoke("cmd_schedule_create_block", { block_json: block });
}

/**
 * Update an existing schedule block.
 * @param params - Schedule block update parameters
 * @returns Updated ScheduleBlock object
 */
export async function scheduleUpdateBlock(params: ScheduleBlockUpdateParams): Promise<ScheduleBlock> {
  return invoke("cmd_schedule_update_block", params);
}

/**
 * Delete a schedule block.
 * @param id - Block ID to delete
 */
export async function scheduleDeleteBlock(id: string): Promise<void> {
  return invoke("cmd_schedule_delete_block", { id });
}

/**
 * List schedule blocks for a date range.
 * @param startIso - Start of date range in ISO format
 * @param endIso - Optional end of date range (defaults to start + 24h)
 * @returns Array of ScheduleBlock objects
 */
export async function scheduleListBlocks(
  startIso: string,
  endIso?: string
): Promise<ScheduleBlock[]> {
  return invoke("cmd_schedule_list_blocks", {
    start_iso: startIso,
    end_iso: endIso,
  });
}

// ============= Config Commands =============

/**
 * Get a configuration value by key.
 * @param key - Configuration key to retrieve
 * @returns Configuration value as string
 */
export async function configGet(key: string): Promise<string> {
  return invoke("cmd_config_get", { key });
}

/**
 * Set a configuration value.
 * @param key - Configuration key to set
 * @param value - Value to set
 */
export async function configSet(key: string, value: string): Promise<void> {
  return invoke("cmd_config_set", { key, value });
}

/**
 * List all configuration values.
 * @returns Complete configuration as JSON
 */
export async function configList(): Promise<Record<string, string>> {
  return invoke("cmd_config_list");
}

// ============= Stats Commands =============

/**
 * Get today's statistics.
 * @returns Stats object with today's data
 */
export async function statsToday(): Promise<Stats> {
  return invoke("cmd_stats_today");
}

/**
 * Get all-time statistics.
 * @returns Stats object with all-time data
 */
export async function statsAll(): Promise<Stats> {
  return invoke("cmd_stats_all");
}

// ============= Timeline Commands =============

/**
 * Detect time gaps in a list of events.
 * @param events - Array of events with start_time and end_time
 * @returns Array of detected time gaps
 */
export async function timelineDetectGaps(events: TimelineEvent[]): Promise<TimeGap[]> {
  return invoke("cmd_timeline_detect_gaps", { events_json: events });
}

/**
 * Generate task proposals based on time gaps.
 * @param gaps - Array of time gaps
 * @param tasks - Array of timeline items (tasks)
 * @returns Array of task proposals mapped to time gaps
 */
export async function timelineGenerateProposals(
  gaps: TimeGap[],
  tasks: TimelineItem[]
): Promise<TaskProposal[]> {
  return invoke("cmd_timeline_generate_proposals", {
    gaps_json: gaps,
    tasks_json: tasks,
  });
}

/**
 * Calculate priority score for a single task.
 * @param task - Timeline item (task) to calculate priority for
 * @returns Priority score (0-100)
 */
export async function calculatePriority(task: TimelineItem): Promise<number> {
  return invoke("cmd_calculate_priority", { task_json: task });
}

/**
 * Calculate priority scores for multiple tasks.
 * @param tasks - Array of timeline items (tasks)
 * @returns Array of objects with task_id and priority score
 */
export async function calculatePriorities(tasks: TimelineItem[]): Promise<PriorityResult[]> {
  return invoke("cmd_calculate_priorities", { tasks_json: tasks });
}

// ============= OAuth Commands =============

/**
 * Store OAuth tokens securely in the OS keyring.
 * @param serviceName - OAuth service identifier (e.g., "google", "notion")
 * @param tokens - OAuth tokens object
 */
export async function storeOAuthTokens(serviceName: string, tokens: OAuthTokens): Promise<void> {
  return invoke("cmd_store_oauth_tokens", {
    service_name: serviceName,
    tokens_json: JSON.stringify(tokens),
  });
}

/**
 * Load OAuth tokens from the OS keyring.
 * @param serviceName - OAuth service identifier
 * @returns OAuth tokens object or null if not found
 */
export async function loadOAuthTokens(serviceName: string): Promise<OAuthTokens | null> {
  const tokensJson = await invoke<string | null>("cmd_load_oauth_tokens", {
    service_name: serviceName,
  });
  return tokensJson ? JSON.parse(tokensJson) : null;
}

/**
 * Clear OAuth tokens from the OS keyring.
 * @param serviceName - OAuth service identifier
 */
export async function clearOAuthTokens(serviceName: string): Promise<void> {
  return invoke("cmd_clear_oauth_tokens", { service_name: serviceName });
}

// ============= Error Handling =============

/**
 * Wrapper for invoke with typed error handling.
 * @param command - Tauri command name
 * @param args - Command arguments
 * @returns Promise with result or error
 */
export async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    // Error is returned as string from Rust
    const message = typeof error === "string" ? error : String(error);
    throw new Error(`Pomodoroom command '${command}' failed: ${message}`);
  }
}

// ============= Usage Examples =============

// Timer example
async function startTimerWithTask(taskId: string) {
  const started = await timerStart(undefined, taskId);
  if (started) {
    console.log("Timer started for task:", taskId);
  }

  // Poll for completion
  const interval = setInterval(async () => {
    const result = await timerTick();
    console.log("Remaining:", result.remaining_ms);

    if (result.completed) {
      clearInterval(interval);
      console.log("Session completed!");
    }
  }, 100);
}

// Task example
async function createAndStartTask() {
  const task = await taskCreate({
    title: "My Task",
    tags: ["deep", "admin"],
    priority: 75,
  });

  await taskStart(task.id);
  console.log("Task started:", task.title);
}

// Schedule example
async function generateTodaysSchedule() {
  const today = new Date().toISOString().split("T")[0];
  const blocks = await scheduleGenerate(today);
  console.log("Generated", blocks.length, "schedule blocks");
  return blocks;
}
```

---

## Command Reference

All commands return `Promise<T>` and throw `Error` on failure.

### Return Types

| Command | Return Type | Error Cases |
|---------|-------------|-------------|
| `cmd_timer_status` | `StateSnapshot` | Lock failure, JSON error |
| `cmd_timer_tick` | `StateSnapshot & { completed? }` | Lock failure, DB error |
| `cmd_timer_start` | `TimerStartedEvent \| null` | Invalid step, lock failure |
| `cmd_task_create` | `Task` | Invalid input, DB error |
| `cmd_task_update` | `Task` | Task not found, DB error |
| `cmd_task_delete` | `void` | Invalid ID, DB error |
| `cmd_task_start` | `Task` | Invalid transition, DB error |
| `cmd_config_get` | `string` | Unknown key |
| `cmd_config_set` | `void` | Config error |

### Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `"Lock failed"` | Mutex poisoned | Restart application |
| `"unknown key: X"` | Invalid config key | Check valid keys |
| `"Task not found: X"` | Invalid task ID | Verify task exists |
| `"Cannot start task: X"` | Invalid state transition | Check task state |
| `"Database error: X"` | SQLite operation failed | Check DB permissions |
