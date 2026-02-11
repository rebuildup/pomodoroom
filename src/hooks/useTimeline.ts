import { invoke } from '@tauri-apps/api/core';
import type { TimelineItem, TaskProposal, TimeGap } from '../types';

/**
 * Check if running in Tauri environment
 */
function isTauriEnvironment(): boolean {
	return typeof window !== "undefined" && window.__TAURI__ !== undefined;
}

/**
 * Convert backend Task to TimelineItem format
 */
function taskToTimelineItem(task: Record<string, unknown>): TimelineItem {
	return {
		id: task.id as string,
		type: 'task',
		source: 'local',
		title: task.title as string,
		description: task.description as string | undefined,
		startTime: task.created_at ? new Date(task.created_at as string).toISOString() : new Date().toISOString(),
		endTime: task.updated_at ? new Date(task.updated_at as string).toISOString() : new Date().toISOString(),
		completed: task.completed as boolean | undefined,
		priority: task.priority as number | null,
		deadline: undefined,
		tags: task.tags as string[] | undefined,
		url: undefined,
		metadata: {
			estimated_pomodoros: task.estimated_pomodoros,
			completed_pomodoros: task.completed_pomodoros,
			estimated_minutes: task.estimated_minutes,
			elapsed_minutes: task.elapsed_minutes,
			state: task.state,
			project_id: task.project_id,
		},
	};
}

/**
 * Convert backend ScheduleBlock to calendar event format for gap detection
 */
function scheduleBlockToEvent(block: Record<string, unknown>): { start_time: string; end_time: string } {
	return {
		start_time: block.start_time as string,
		end_time: block.end_time as string,
	};
}

/**
 * Get date range for today's schedule blocks
 */
function getTodayDateRange(): { start: string; end: string } {
	const now = new Date();
	const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
	const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

	return {
		start: startOfDay.toISOString(),
		end: endOfDay.toISOString(),
	};
}

/**
 * Timeline hook for time gap detection and task proposals
 * Connected to real backend data via Tauri IPC
 */
export function useTimeline() {
	/**
	 * Fetch real tasks from backend database
	 */
	const getTasks = async (): Promise<TimelineItem[]> => {
		if (!isTauriEnvironment()) {
			console.warn('[useTimeline] Not in Tauri environment, returning empty tasks');
			return [];
		}

		try {
			const tasks = await invoke<Record<string, unknown>[]>('cmd_task_list', {
				projectId: null,
				category: 'active',
			});

			return tasks.map(taskToTimelineItem);
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error('[useTimeline] Failed to fetch tasks:', err.message);
			return [];
		}
	};

	/**
	 * Fetch real calendar events from backend schedule blocks
	 */
	const getCalendarEvents = async (): Promise<Array<{ start_time: string; end_time: string }>> => {
		if (!isTauriEnvironment()) {
			console.warn('[useTimeline] Not in Tauri environment, returning empty events');
			return [];
		}

		try {
			const { start, end } = getTodayDateRange();
			const blocks = await invoke<Record<string, unknown>[]>('cmd_schedule_list_blocks', {
				startIso: start,
				endIso: end,
			});

			return blocks.map(scheduleBlockToEvent);
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error('[useTimeline] Failed to fetch schedule blocks:', err.message);
			return [];
		}
	};

	/**
	 * Detect time gaps between calendar events
	 * Uses real schedule blocks from backend when available
	 */
	const detectGaps = async (events?: Array<{ start_time: string; end_time: string }>): Promise<TimeGap[]> => {
		if (!isTauriEnvironment()) {
			console.warn('[useTimeline] Not in Tauri environment, gap detection unavailable');
			return [];
		}

		try {
			// Fetch real events if none provided
			const eventsToUse = events || await getCalendarEvents();

			if (eventsToUse.length === 0) {
				// No events means the whole day is available
				const now = new Date();
				const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
				const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
				const duration = (endOfDay.getTime() - startOfDay.getTime()) / (1000 * 60);

				return [{
					startTime: startOfDay.toISOString(),
					endTime: endOfDay.toISOString(),
					duration: Math.round(duration),
					size: duration > 60 ? 'large' : duration > 30 ? 'medium' : 'small',
				}];
			}

			const result = await invoke<Record<string, unknown>[]>('cmd_timeline_detect_gaps', {
				eventsJson: eventsToUse,
			});

			return result.map(gap => ({
				startTime: gap.start_time as string,
				endTime: gap.end_time as string,
				duration: (gap.duration as number),
				size: gap.size as 'small' | 'medium' | 'large',
			}));
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error('[useTimeline] Failed to detect gaps:', err.message);
			return [];
		}
	};

	/**
	 * Generate task proposals for available time gaps
	 * Uses real tasks from backend when available
	 */
	const generateProposals = async (
		gaps: TimeGap[],
		tasks?: TimelineItem[]
	): Promise<TaskProposal[]> => {
		if (!isTauriEnvironment()) {
			console.warn('[useTimeline] Not in Tauri environment, proposals unavailable');
			return [];
		}

		try {
			// Fetch real tasks if none provided
			const tasksToUse = tasks || await getTasks();

			if (tasksToUse.length === 0) {
				console.warn('[useTimeline] No tasks available for proposals');
				return [];
			}

			// Convert TimeGap format to match Rust expectations (start_time/end_time)
			const gapsForBackend = gaps.map(gap => ({
				start_time: gap.startTime,
				end_time: gap.endTime,
				duration: gap.duration,
				size: gap.size,
			}));

			// Convert TimelineItem format to match Rust expectations (start_time/end_time)
			const tasksForBackend = tasksToUse.map(task => ({
				id: task.id,
				type: task.type,
				source: task.source,
				title: task.title,
				description: task.description,
				start_time: task.startTime,
				end_time: task.endTime,
				completed: task.completed,
				priority: task.priority,
				deadline: task.deadline,
				tags: task.tags,
				url: task.url,
				metadata: task.metadata,
			}));

			const result = await invoke<Record<string, unknown>[]>('cmd_timeline_generate_proposals', {
				gapsJson: gapsForBackend,
				tasksJson: tasksForBackend,
			});

			return result.map(prop => ({
				gap: prop.gap as TimeGap,
				task: prop.task as TimelineItem,
				reason: prop.reason as string,
				confidence: prop.confidence as number,
			}));
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error('[useTimeline] Failed to generate proposals:', err.message);
			return [];
		}
	};

  /**
   * Calculate priority for a single task
   * Returns priority score 0-100 based on:
   * - Deadline proximity
   * - User-defined importance
   * - Effort estimation
   * - Dependencies
   */
  const calculatePriority = async (task: TimelineItem): Promise<number> => {
    try {
      const priority = await invoke<number>('cmd_calculate_priority', {
        taskJson: task,
      });
      return priority;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`[useTimeline] Failed to calculate priority for task "${task.id}":`, err.message);
      return task.priority ?? 50; // Fallback to existing priority or default
    }
  };

  /**
   * Calculate priorities for multiple tasks
   * Returns array of { task_id, priority } objects
   */
  const calculatePriorities = async (tasks: TimelineItem[]): Promise<Array<{ taskId: string; priority: number }>> => {
    try {
      const result = await invoke<Array<{ task_id: string; priority: number }>>('cmd_calculate_priorities', {
        tasksJson: tasks,
      });

      return result.map(item => ({
        taskId: item.task_id,
        priority: item.priority,
      }));
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`[useTimeline] Failed to calculate priorities for ${tasks.length} tasks:`, err.message);
      // Fallback to existing priorities
      return tasks.map(task => ({
        taskId: task.id,
        priority: task.priority ?? 50,
      }));
    }
  };

  /**
   * Update tasks with calculated priorities
   * Returns a new array of tasks with updated priority fields
   */
  const updateTaskPriorities = async (tasks: TimelineItem[]): Promise<TimelineItem[]> => {
    const priorities = await calculatePriorities(tasks);

    // Create a map for quick lookup
    const priorityMap = new Map(priorities.map(p => [p.taskId, p.priority]));

    // Return updated tasks
    return tasks.map(task => ({
      ...task,
      priority: priorityMap.get(task.id) ?? task.priority ?? 50,
    }));
  };

	/**
	 * Get the top proposal for a time gap
	 * Returns the highest confidence proposal using real backend data
	 */
	const getTopProposal = async (): Promise<TaskProposal | null> => {
		if (!isTauriEnvironment()) {
			console.warn('[useTimeline] Not in Tauri environment, top proposal unavailable');
			return null;
		}

		try {
			const gaps = await detectGaps();
			if (gaps.length === 0) return null;

			const proposals = await generateProposals(gaps);
			if (proposals.length === 0) return null;

			// Sort by confidence and return the top one
			proposals.sort((a, b) => b.confidence - a.confidence);
			return proposals[0] ?? null;
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error('[useTimeline] Failed to get top proposal:', err.message);
			return null;
		}
	};

	return {
		getTasks,
		getCalendarEvents,
		detectGaps,
		generateProposals,
		getTopProposal,
		calculatePriority,
		calculatePriorities,
		updateTaskPriorities,
	};
}
