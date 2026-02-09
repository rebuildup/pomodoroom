import { invoke } from '@tauri-apps/api/core';
import type { TimelineItem, TaskProposal, TimeGap } from '../types';

// Mock task list for development (will be replaced by integrations)
const MOCK_TASKS: TimelineItem[] = [
  {
    id: '1',
    type: 'task',
    source: 'manual',
    title: 'Review pull requests',
    description: 'Check pending PRs and provide feedback',
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    priority: 80,
    tags: ['development', 'review'],
  },
  {
    id: '2',
    type: 'task',
    source: 'manual',
    title: 'Write documentation',
    description: 'Update API docs for new features',
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
    priority: 60,
    deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['docs'],
  },
  {
    id: '3',
    type: 'task',
    source: 'manual',
    title: 'Plan sprint roadmap',
    description: 'Define tasks for next sprint',
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    priority: 90,
    deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['planning'],
  },
  {
    id: '4',
    type: 'task',
    source: 'manual',
    title: 'Fix navigation bug',
    description: 'Resolve mobile menu navigation issue',
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
    priority: 95,
    tags: ['bug', 'urgent'],
  },
  {
    id: '5',
    type: 'task',
    source: 'manual',
    title: 'Update dependencies',
    description: 'Upgrade npm packages to latest versions',
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    priority: 40,
    tags: ['maintenance'],
  },
];

// Mock calendar events for gap detection
const getMockEvents = (): Array<{ start_time: string; end_time: string }> => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0);

  return [
    {
      start_time: new Date(startOfDay.getTime() + 0 * 60 * 60 * 1000).toISOString(),
      end_time: new Date(startOfDay.getTime() + 1 * 60 * 60 * 1000).toISOString(),
    },
    {
      start_time: new Date(startOfDay.getTime() + 1.5 * 60 * 60 * 1000).toISOString(),
      end_time: new Date(startOfDay.getTime() + 2.5 * 60 * 60 * 1000).toISOString(),
    },
    {
      start_time: new Date(startOfDay.getTime() + 3 * 60 * 60 * 1000).toISOString(),
      end_time: new Date(startOfDay.getTime() + 4 * 60 * 60 * 1000).toISOString(),
    },
  ];
};

/**
 * Timeline hook for time gap detection and task proposals
 */
export function useTimeline() {
  /**
   * Get mock tasks (will be replaced by real integrations)
   */
  const getMockTasks = (): TimelineItem[] => {
    return MOCK_TASKS;
  };

  /**
   * Detect time gaps between calendar events
   */
  const detectGaps = async (events?: Array<{ start_time: string; end_time: string }>): Promise<TimeGap[]> => {
    try {
      // Use mock events if none provided
      const eventsToUse = events || getMockEvents();

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
      console.error('Failed to detect gaps:', error);
      return [];
    }
  };

  /**
   * Generate task proposals for available time gaps
   */
  const generateProposals = async (
    gaps: TimeGap[],
    tasks?: TimelineItem[]
  ): Promise<TaskProposal[]> => {
    try {
      // Use mock tasks if none provided
      const tasksToUse = tasks || getMockTasks();

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
      console.error('Failed to generate proposals:', error);
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
      console.error('Failed to calculate priority:', error);
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
      console.error('Failed to calculate priorities:', error);
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
   * Returns the highest confidence proposal
   */
  const getTopProposal = async (): Promise<TaskProposal | null> => {
    try {
      const gaps = await detectGaps();
      if (gaps.length === 0) return null;

      const proposals = await generateProposals(gaps);
      if (proposals.length === 0) return null;

      // Sort by confidence and return the top one
      proposals.sort((a, b) => b.confidence - a.confidence);
      return proposals[0] ?? null;
    } catch (error) {
      console.error('Failed to get top proposal:', error);
      return null;
    }
  };

  return {
    detectGaps,
    generateProposals,
    getMockTasks,
    getTopProposal,
    calculatePriority,
    calculatePriorities,
    updateTaskPriorities,
  };
}
