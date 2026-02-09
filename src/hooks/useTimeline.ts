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

      const result = await invoke<Record<string, unknown>[]>('cmd_timeline_generate_proposals', {
        gapsJson: gaps,
        tasksJson: tasksToUse,
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
  };
}
