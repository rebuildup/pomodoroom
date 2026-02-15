import { describe, expect, it } from 'vitest';
import { buildDeferCandidates } from '@/utils/defer-candidates';

describe('buildDeferCandidates', () => {
	it('returns default 15/30 minute candidates with reasons', () => {
		const nowMs = Date.parse('2026-02-15T10:00:00.000Z');
		const result = buildDeferCandidates({
			nowMs,
			durationMs: 25 * 60_000,
			nextScheduledMs: null,
		});

		expect(result).toHaveLength(2);
		expect(result[0]?.reason).toBe('15分後');
		expect(result[1]?.reason).toBe('30分後');
		expect(Date.parse(result[0]?.iso ?? '')).toBeGreaterThan(nowMs);
	});

	it('adds next schedule based candidates and limits to 3 unique items', () => {
		const nowMs = Date.parse('2026-02-15T10:00:00.000Z');
		const nextScheduledMs = Date.parse('2026-02-15T10:30:00.000Z');

		const result = buildDeferCandidates({
			nowMs,
			durationMs: 25 * 60_000,
			nextScheduledMs,
		});

		expect(result).toHaveLength(3);
		expect(result.map((v) => v.reason)).toEqual(['15分後', '30分後', '次タスク後']);
	});
});
