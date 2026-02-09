import { invoke } from '@tauri-apps/api/core';
import type { TimelineItem, TaskProposal, TimeGap } from '../types';

/**
 * Timeline hook for time gap detection and task proposals
 */
export function useTimeline() {
  /**
   * Detect time gaps between calendar events
   */
  const detectGaps = async (events: Array<{ start_time: string; end_time: string }>): Promise<TimeGap[]> => {
    try {
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
      console.error('Failed to detect gaps:', error);
      return [];
    }
  };

  /**
   * Generate task proposals for available time gaps
   */
  const generateProposals = async (
    gaps: TimeGap[],
    tasks: TimelineItem[]
  ): Promise<TaskProposal[]> => {
    try {
      const result = await invoke<Record<string, unknown>[]>('cmd_timeline_generate_proposals', {
        gapsJson: gaps,
        tasksJson: tasks,
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

  return {
    detectGaps,
    generateProposals,
  };
}
