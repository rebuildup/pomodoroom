import { invoke } from '@tauri-apps/api/core';
import type { TimelineItem, TaskProposal, TimeGap } from '../types';

/**
 * Timeline hook for time gap detection and task proposals
 * 
 * This hook integrates with:
 * - Rust gap detection engine (cmd_timeline_detect_gaps)
 * - Rust task proposal engine (cmd_timeline_generate_proposals)
 * - Real task data from useTaskStore
 * - Real calendar events from useGoogleCalendar
 */
export function useTimeline() {
  /**
   * Detect time gaps between calendar events
   * 
   * @param events - Calendar events with start_time and end_time
   * @returns Array of detected time gaps suitable for task scheduling
   */
  const detectGaps = async (events: Array<{ start_time: string; end_time: string }>): Promise<TimeGap[]> => {
    try {
      // Events are required - no fallback to mock data
      if (!events || events.length === 0) {
        console.warn('[useTimeline] No events provided for gap detection');
        return [];
      }

      const result = await invoke<Record<string, unknown>[]>('cmd_timeline_detect_gaps', {
        eventsJson: events,
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
   * 
   * @param gaps - Detected time gaps from detectGaps()
   * @param tasks - Available tasks (READY state recommended)
   * @returns Array of task proposals with confidence scores
   */
  const generateProposals = async (
    gaps: TimeGap[],
    tasks: TimelineItem[]
  ): Promise<TaskProposal[]> => {
    try {
      // Tasks are required - no fallback to mock data
      if (!tasks || tasks.length === 0) {
        console.warn('[useTimeline] No tasks provided for proposal generation');
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
      const tasksForBackend = tasks.map(task => ({
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
   * Get the top proposal for available time gaps
   * 
   * @param events - Calendar events for gap detection
   * @param tasks - Available tasks for proposals
   * @returns The highest confidence proposal or null if none available
   */
  const getTopProposal = async (
    events: Array<{ start_time: string; end_time: string }>,
    tasks: TimelineItem[]
  ): Promise<TaskProposal | null> => {
    try {
      if (!events || events.length === 0) {
        console.warn('[useTimeline] No events provided for top proposal');
        return null;
      }
      if (!tasks || tasks.length === 0) {
        console.warn('[useTimeline] No tasks provided for top proposal');
        return null;
      }

      const gaps = await detectGaps(events);
      if (gaps.length === 0) return null;

      const proposals = await generateProposals(gaps, tasks);
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
    detectGaps,
    generateProposals,
    calculatePriority,
    calculatePriorities,
    updateTaskPriorities,
    getTopProposal,
  };
}
