/**
 * Task types for v2 redesign.
 *
 * Extends schedule.Task with additional properties for
 * Active/Floating model and Pressure calculation.
 */

import type { Task as ScheduleTask, TaskCategory } from "./schedule";

/**
 * Energy level for task scheduling.
 */
export type EnergyLevel = "low" | "medium" | "high";
export type TaskKind = "fixed_event" | "flex_window" | "buffer_fill" | "duration_only" | "break";

/**
 * Transition action for task state changes.
 * Maps to state transitions defined in task-state.ts.
 */
export type TransitionAction =
	| "start" // READY → RUNNING
	| "complete" // RUNNING → DONE
	| "extend" // RUNNING → RUNNING (timer reset)
	| "pause" // RUNNING → PAUSED
	| "resume" // PAUSED → RUNNING
	| "defer"; // READY → READY (priority down)

/**
 * Task for v2 redesign with Active/Floating support.
 *
 * Extends schedule.Task with:
 * - requiredMinutes / elapsedMinutes (time tracking)
 * - energy (for scheduling)
 * - updatedAt / completedAt / pausedAt (timestamps)
 * - project / group as string | null (vs projectId)
 * - projectIds / groupIds for multiple associations
 */
export interface Task extends Omit<ScheduleTask, "priority" | "projectId"> {
	/** Immutable kind selected at creation time */
	kind: TaskKind;
	/** Required minutes for scheduling */
	requiredMinutes: number | null;
	/** Absolute fixed start/end (for fixed_event) */
	fixedStartAt: string | null;
	fixedEndAt: string | null;
	/** Flexible window bounds (for flex_window) */
	windowStartAt: string | null;
	windowEndAt: string | null;
	/** Estimated start time (ISO 8601, null if not set) */
	estimatedStartAt: string | null;
	/** Elapsed time in minutes */
	elapsedMinutes: number;
	/** Single project ID (legacy, for backward compatibility) */
	projectId?: string;
	/** Project name (null if not set) - for display */
	project: string | null;
	/** Display name for the project */
	projectName?: string | null;
	/** Multiple project IDs */
	projectIds: string[];
	/** Group name for task grouping */
	group: string | null;
	/** Multiple group IDs */
	groupIds: string[];
	/** Energy level for scheduling */
	energy: EnergyLevel;
	/** Priority value (0-100, null for default priority, negative for deferred) */
	priority: number | null; // null = default (50), 0 = flat, negative = deferred
	/** Last update timestamp (ISO 8601) */
	updatedAt: string;
	/** Completion timestamp (ISO 8601, null if not completed) */
	completedAt: string | null;
	/** Pause timestamp (ISO 8601, null if not paused) - for floating display */
	pausedAt: string | null;
	/** Start timestamp when task was started (ISO 8601, null if never started) */
	startedAt: string | null;
	/** Parent task ID if this task is a split segment */
	parentTaskId?: string | null;
	/** Segment order within parent chain */
	segmentOrder?: number | null;
	/** Whether auto-split is allowed for this task (default: true for non-break tasks) */
	allowSplit?: boolean;
	/** System-suggested tags pending user approval (Issue #464) */
	suggestedTags?: string[];
	/** User-approved tags from suggested tags (Issue #464) */
	approvedTags?: string[];
}

/**
 * Create a new task with default values.
 *
 * Note: Since Task extends ScheduleTask, we need to provide all ScheduleTask fields.
 * The estimatedPomodoros is calculated from requiredMinutes (1 pomodoro = 25 min).
 */
export function createTask(
	props: Omit<
		Task,
		| "id"
		| "state"
		| "elapsedMinutes"
		| "createdAt"
		| "updatedAt"
		| "completedAt"
		| "pausedAt"
		| "startedAt"
		| "estimatedPomodoros"
		| "completedPomodoros"
		| "completed"
		| "category"
	> & {
		priority?: number | null;
		kind?: TaskKind;
		requiredMinutes?: number | null;
		fixedStartAt?: string | null;
		fixedEndAt?: string | null;
		windowStartAt?: string | null;
		windowEndAt?: string | null;
		projectId?: string;
		projectName?: string | null;
		projectIds?: string[];
		groupIds?: string[];
		parentTaskId?: string | null;
		segmentOrder?: number | null;
		allowSplit?: boolean;
		suggestedTags?: string[];
		approvedTags?: string[];
	},
): Task {
	const now = new Date().toISOString();
	const estimatedMins = props.requiredMinutes ?? 25;
	const estimatedPomodoros = Math.ceil(estimatedMins / 25);
	const taskKind = props.kind ?? "duration_only";

	return {
		kind: taskKind,
		requiredMinutes: props.requiredMinutes ?? null,
		fixedStartAt: props.fixedStartAt ?? null,
		fixedEndAt: props.fixedEndAt ?? null,
		windowStartAt: props.windowStartAt ?? null,
		windowEndAt: props.windowEndAt ?? null,
		// Schedule.Task fields (required by base interface)
		id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
		title: props.title,
		description: props.description,
		estimatedPomodoros,
		completedPomodoros: 0,
		completed: false,
		state: "READY",
		tags: props.tags ?? [],
		priority: props.priority ?? null, // Use provided priority or null for default
		category: "active",
		createdAt: now,
		projectIds: props.projectIds ?? [],
		groupIds: props.groupIds ?? [],
		estimatedMinutes: null,
		// Task-specific fields
		estimatedStartAt: props.estimatedStartAt ?? null,
		elapsedMinutes: 0,
		projectId: props.projectId,
		project: props.project ?? null,
		projectName: props.projectName ?? null,
		group: props.group ?? null,
		energy: props.energy ?? "medium",
		updatedAt: now,
		completedAt: null,
		pausedAt: null,
		startedAt: null,
		parentTaskId: props.parentTaskId ?? null,
		segmentOrder: props.segmentOrder ?? null,
		// Break tasks should not be split by default
		allowSplit: props.allowSplit ?? taskKind !== "break",
		// System-suggested tags (Issue #464)
		suggestedTags: props.suggestedTags ?? [],
		approvedTags: props.approvedTags ?? [],
	};
}

/**
 * Get display color for energy level.
 */
export function getEnergyColor(energy: EnergyLevel): string {
	switch (energy) {
		case "low":
			return "text-red-400";
		case "medium":
			return "text-yellow-400";
		case "high":
			return "text-green-400";
	}
}

/**
 * Get display label for energy level.
 */
export function getEnergyLabel(energy: EnergyLevel): string {
	switch (energy) {
		case "low":
			return "Low";
		case "medium":
			return "Medium";
		case "high":
			return "High";
	}
}

/**
 * Type guard to check if a task is a v2 Task.
 */
export function isV2Task(task: ScheduleTask | Task): task is Task {
	return "requiredMinutes" in task && "elapsedMinutes" in task;
}

/**
 * Convert ScheduleTask to v2 Task format.
 * Useful for backward compatibility with existing components using ScheduleTask.
 */
export function scheduleTaskToV2Task(scheduleTask: ScheduleTask): Task {
	return {
		...scheduleTask,
		kind: "duration_only",
		requiredMinutes: scheduleTask.estimatedPomodoros * 25,
		fixedStartAt: null,
		fixedEndAt: null,
		windowStartAt: null,
		windowEndAt: null,
		// Additional v2 fields
		estimatedStartAt: null,
		elapsedMinutes: 0,
		projectId: scheduleTask.projectId,
		project: scheduleTask.projectId ?? null,
		projectName: null,
		projectIds: scheduleTask.projectId ? [scheduleTask.projectId] : [],
		group: null,
		groupIds: [],
		energy: "medium",
		priority: scheduleTask.priority,
		updatedAt: scheduleTask.createdAt,
		completedAt: scheduleTask.completed ? new Date().toISOString() : null,
		pausedAt: null,
		startedAt: null,
		parentTaskId: null,
		segmentOrder: null,
		allowSplit: true,
		estimatedMinutes: null,
		// System-suggested tags (Issue #464)
		suggestedTags: [],
		approvedTags: [],
	};
}

/**
 * Convert v2 Task to ScheduleTask format.
 * Useful for components that only understand ScheduleTask.
 */
export function v2TaskToScheduleTask(v2Task: Task): ScheduleTask {
	return {
		id: v2Task.id,
		title: v2Task.title,
		description: v2Task.description,
		estimatedPomodoros: v2Task.estimatedPomodoros,
		completedPomodoros: v2Task.completedPomodoros,
		completed: v2Task.completed,
		state: v2Task.state,
		projectId: v2Task.project ?? v2Task.projectId ?? undefined,
		project: v2Task.project,
		tags: v2Task.tags,
		priority: v2Task.priority ?? 50,
		category: v2Task.category,
		createdAt: v2Task.createdAt,
		projectIds: v2Task.projectIds,
		groupIds: v2Task.groupIds,
		kind: v2Task.kind,
		requiredMinutes: v2Task.requiredMinutes,
		fixedStartAt: v2Task.fixedStartAt,
		fixedEndAt: v2Task.fixedEndAt,
		windowStartAt: v2Task.windowStartAt,
		windowEndAt: v2Task.windowEndAt,
		estimatedMinutes: v2Task.estimatedMinutes,
		updatedAt: v2Task.updatedAt,
		pausedAt: v2Task.pausedAt,
		elapsedMinutes: v2Task.elapsedMinutes,
	};
}

/**
 * Check if a task has any projects associated.
 */
export function hasProjects(task: Task): boolean {
	return !!(task.projectId || task.project || task.projectName || task.projectIds.length > 0);
}

/**
 * Check if a task has any groups associated.
 */
export function hasGroups(task: Task): boolean {
	return !!(task.group || task.groupIds.length > 0);
}

/**
 * Get display project names (combines single and multiple).
 */
export function getDisplayProjects(task: Task): string[] {
	const projects: string[] = [];

	if (task.project) {
		projects.push(task.project);
	}
	if (task.projectName) {
		projects.push(task.projectName);
	}

	// Add unique project IDs
	for (const projectId of task.projectIds) {
		if (!projects.includes(projectId)) {
			projects.push(projectId);
		}
	}

	return projects;
}

/**
 * Get display group names (combines single and multiple).
 */
export function getDisplayGroups(task: Task): string[] {
	const groups: string[] = [];

	if (task.group) {
		groups.push(task.group);
	}

	// Add unique group IDs
	for (const groupId of task.groupIds) {
		if (!groups.includes(groupId)) {
			groups.push(groupId);
		}
	}

	return groups;
}

/**
 * Determine task category based on state and conditions.
 *
 * Per CORE_POLICY.md §4.2:
 *
 * | State | Category | Condition |
 * |-------|----------|-----------|
 * | `running` | **Active** | Always Active (max 1) |
 * | `paused` + external block | **Wait** | External factors blocking progress |
 * | `ready` + low priority/energy | **Floating** | Scheduler assigns |
 * | `ready` + normal priority | Active candidate | Next Active proposal |
 * | `done` | - | Excluded from classification |
 */
export function effectiveCategory(task: Task): TaskCategory {
	switch (task.state) {
		case "RUNNING":
			return "active";
		case "DONE":
			// Completed tasks are excluded, but return Floating as default
			return "floating";
		case "PAUSED":
			// Check if paused due to external blocking conditions
			// For now, we assume Paused tasks are Wait (external block)
			// TODO: Add explicit external_block flag to distinguish Wait vs Floating
			return "wait";
		case "READY":
		case "DRIFTING":
			// Determine Floating vs Active candidate based on priority/energy
			const priority = task.priority ?? 50;
			const isLowEnergy = task.energy === "low";
			const isLowPriority = priority < 30;

			if (isLowEnergy || isLowPriority) {
				return "floating";
			}
			return "active";
		default:
			return "active";
	}
}

/**
 * Check if this task is effectively Active (currently executing or candidate).
 */
export function isActive(task: Task): boolean {
	return effectiveCategory(task) === "active";
}

/**
 * Check if this task is in Wait state (external blocking).
 */
export function isWaiting(task: Task): boolean {
	return effectiveCategory(task) === "wait";
}

/**
 * Check if this task is Floating (gap filler).
 */
export function isFloating(task: Task): boolean {
	return effectiveCategory(task) === "floating";
}

// ============================================================================
// Context System Types (CORE_POLICY.md §4.4)
// ============================================================================

/**
 * Type of operation performed on a task.
 */
export type OperationType =
	| "start" // Task was started (READY → RUNNING)
	| "complete" // Task was completed (RUNNING → DONE)
	| "extend" // Task timer was extended (RUNNING → RUNNING)
	| "pause" // Task was paused (RUNNING → PAUSED)
	| "resume" // Task was resumed (PAUSED → RUNNING)
	| "defer" // Task was deferred (READY → READY)
	| "timeout"; // Task timeout (RUNNING/PAUSED → DRIFTING)

/**
 * Single operation record in task history.
 */
export interface OperationLog {
	/** Unique identifier for this operation */
	id: string;
	/** Task ID this operation belongs to */
	taskId: string;
	/** Type of operation performed */
	operation: OperationType;
	/** When the operation occurred (ISO 8601) */
	timestamp: string;
	/** Elapsed minutes at the time of operation */
	elapsedMinutes: number;
	/** Optional contextual data */
	context: OperationContext;
}

/**
 * Additional context for an operation.
 */
export interface OperationContext {
	/** Previous state before this operation */
	fromState: string;
	/** New state after this operation */
	toState: string;
	/** Priority change (if any) */
	priorityDelta?: number;
	/** Energy level at time of operation */
	energy: EnergyLevel;
	/** Tags associated with task at time of operation */
	tags: string[];
	/** Projects associated with task at time of operation */
	projectIds: string[];
}

/**
 * Summary of operations performed on a task.
 */
export interface OperationSummary {
	/** Total number of start operations */
	startCount: number;
	/** Total number of pause operations */
	pauseCount: number;
	/** Total number of resume operations */
	resumeCount: number;
	/** Total number of extend operations */
	extendCount: number;
	/** Total number of defer operations */
	deferCount: number;
	/** First operation timestamp (ISO 8601) */
	firstOperationAt: string | null;
	/** Last operation timestamp (ISO 8601) */
	lastOperationAt: string | null;
}

/**
 * Related tasks based on relationships.
 */
export interface RelatedTasks {
	/** Tasks in the same project(s) */
	sameProject: string[];
	/** Tasks with the same tag(s) */
	sameTags: string[];
	/** Task dependencies (blocking tasks) */
	dependencies: string[];
	/** Tasks that depend on this task */
	dependents: string[];
}

/**
 * Context captured when task is paused.
 */
export interface PauseContext {
	/** Task ID being paused */
	taskId: string;
	/** When the pause occurred (ISO 8601) */
	pausedAt: string;
	/** Elapsed minutes at pause time */
	elapsedMinutes: number;
	/** Estimated remaining minutes */
	estimatedRemainingMinutes: number | null;
	/** Task state before pause (should be RUNNING) */
	previousState: string;
	/** Energy level at pause time */
	energy: EnergyLevel;
	/** Tags at pause time */
	tags: string[];
	/** Projects at pause time */
	projectIds: string[];
	/** Groups at pause time */
	groupIds: string[];
	/** Priority at pause time */
	priority: number | null;
	/** Operation history snapshot */
	operationSummary: OperationSummary;
	/** Related task IDs (same project, same tags) */
	relatedTasks: RelatedTasks;
}

/**
 * Type of contextual insight.
 */
export type InsightType = "progress" | "temporal" | "relational" | "pattern";

/**
 * Calculated insight about the task context.
 */
export interface ContextInsight {
	/** Type of insight */
	insightType: InsightType;
	/** Human-readable message (calculated, not user input) */
	message: string;
	/** Relevant data points */
	data: Record<string, string>;
}

/**
 * Context reconstructed when task is resumed.
 */
export interface ResumeContext {
	/** Task ID being resumed */
	taskId: string;
	/** When the resume occurred (ISO 8601) */
	resumedAt: string;
	/** How long the task was paused (in minutes) */
	pauseDurationMinutes: number;
	/** Elapsed minutes before pause */
	elapsedBeforePause: number;
	/** Estimated remaining minutes */
	estimatedRemainingMinutes: number | null;
	/** Completion percentage (0.0 to 1.0) */
	completionPercentage: number;
	/** Energy level (may have changed since pause) */
	energy: EnergyLevel;
	/** Priority (may have changed since pause) */
	priority: number | null;
	/** Operation summary */
	operationSummary: OperationSummary;
	/** Contextual insights for the user */
	insights: ContextInsight[];
	/** Related tasks that may be relevant */
	relatedTasks: RelatedTasks;
}

/**
 * Create a new operation log entry.
 */
export function createOperationLog(
	taskId: string,
	operation: OperationType,
	elapsedMinutes: number,
	context: OperationContext,
): OperationLog {
	return {
		id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
		taskId,
		operation,
		timestamp: new Date().toISOString(),
		elapsedMinutes,
		context,
	};
}

/**
 * Create an empty operation summary.
 */
export function createOperationSummary(): OperationSummary {
	return {
		startCount: 0,
		pauseCount: 0,
		resumeCount: 0,
		extendCount: 0,
		deferCount: 0,
		firstOperationAt: null,
		lastOperationAt: null,
	};
}

/**
 * Calculate completion percentage from pause context.
 */
export function calculateCompletionPercentage(context: PauseContext): number {
	if (context.estimatedRemainingMinutes === null) {
		return 0;
	}
	const remaining = context.estimatedRemainingMinutes;
	const total = context.elapsedMinutes + remaining;
	if (total === 0) {
		return 0;
	}
	return Math.min(context.elapsedMinutes / total, 1.0);
}

/**
 * Check if resume is "cold" (long pause duration).
 */
export function isColdResume(resumeContext: ResumeContext): boolean {
	return resumeContext.pauseDurationMinutes > 120; // 2+ hours
}

/**
 * Get primary insight message from resume context.
 */
export function getPrimaryInsight(resumeContext: ResumeContext): string {
	if (resumeContext.insights.length > 0) {
		return resumeContext.insights[0].message;
	}
	return `Task resumed after ${resumeContext.pauseDurationMinutes} min. ${Math.round(
		resumeContext.completionPercentage * 100,
	)}% complete.`;
}
