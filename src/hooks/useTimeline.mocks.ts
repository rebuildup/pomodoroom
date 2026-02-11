/**
 * Mock data for demo/development mode.
 *
 * This file contains sample tasks and events used when:
 * - Running in web mode (non-Tauri environment)
 * - No tasks exist in the database
 * - Testing the Timeline UI
 */

import type { TimelineItem } from '../types';

/** Mock task list for development/demo purposes */
export const MOCK_TASKS: TimelineItem[] = [
	{
		id: 'mock-1',
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
		id: 'mock-2',
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
		id: 'mock-3',
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
		id: 'mock-4',
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
		id: 'mock-5',
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

/** Get mock calendar events for gap detection (sample day events) */
export function getMockCalendarEvents(): Array<{ start_time: string; end_time: string }> {
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
}
