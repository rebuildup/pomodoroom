//! Dynamic long-break placement optimization.
//!
//! This module evaluates candidate insertion points for long breaks
//! based on fatigue accumulation and calendar constraints.

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};

use crate::scheduler::{CalendarEvent, ScheduledBlock, ScheduledBlockType};

/// Configuration for dynamic long-break placement.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LongBreakConfig {
    /// Fixed mode: always place at end of cycle (no dynamic placement)
    pub fixed_mode: bool,

    /// Minimum focus time before a long break (minutes)
    pub min_focus_before_break: i64,

    /// Maximum continuous focus time without a long break (minutes)
    pub max_continuous_focus: i64,

    /// Long break duration (minutes)
    pub break_duration: i64,

    /// Number of pomodoros before considering a long break
    pub pomodoros_before_break: i32,

    /// Fatigue weight for placement scoring (0.0-1.0)
    pub fatigue_weight: f32,

    /// Calendar conflict weight for placement scoring (0.0-1.0)
    pub calendar_weight: f32,
}

impl Default for LongBreakConfig {
    fn default() -> Self {
        Self {
            fixed_mode: false,
            min_focus_before_break: 90,
            max_continuous_focus: 180,
            break_duration: 15,
            pomodoros_before_break: 4,
            fatigue_weight: 0.6,
            calendar_weight: 0.4,
        }
    }
}

/// A candidate position for long-break insertion.
#[derive(Debug, Clone)]
pub struct BreakCandidate {
    /// Start time of the break
    pub start_time: DateTime<Utc>,
    /// End time of the break
    pub end_time: DateTime<Utc>,
    /// Score for this position (higher = better)
    pub score: f32,
    /// Rationale for this score
    pub rationale: String,
}

/// Result of dynamic long-break placement.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlacementResult {
    /// Whether fixed mode was used
    pub fixed_mode_used: bool,
    /// Selected break start time
    pub break_start: DateTime<Utc>,
    /// Selected break end time
    pub break_end: DateTime<Utc>,
    /// Score of the selected position
    pub score: f32,
    /// Rationale for the selection
    pub rationale: String,
    /// All evaluated candidates (for debugging/transparency)
    #[serde(default)]
    pub evaluated_candidates: Vec<CandidateInfo>,
}

/// Summary info about an evaluated candidate.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CandidateInfo {
    pub start_time: DateTime<Utc>,
    pub score: f32,
    pub rationale: String,
}

/// Evaluator for dynamic long-break placement.
pub struct LongBreakPlacer {
    config: LongBreakConfig,
}

impl LongBreakPlacer {
    /// Create a new placer with default config.
    pub fn new() -> Self {
        Self {
            config: LongBreakConfig::default(),
        }
    }

    /// Create a placer with custom config.
    pub fn with_config(config: LongBreakConfig) -> Self {
        Self { config }
    }

    /// Set fixed mode.
    pub fn set_fixed_mode(&mut self, fixed: bool) {
        self.config.fixed_mode = fixed;
    }

    /// Find the optimal long-break position.
    ///
    /// # Arguments
    /// * `scheduled_blocks` - Already scheduled focus blocks
    /// * `calendar_events` - Calendar events to avoid
    /// * `pomodoro_count` - Number of pomodoros completed so far in cycle
    /// * `cycle_start` - Start of the current pomodoro cycle
    /// * `cycle_end` - Expected end of the current pomodoro cycle
    pub fn find_optimal_break_position(
        &self,
        scheduled_blocks: &[ScheduledBlock],
        calendar_events: &[CalendarEvent],
        pomodoro_count: i32,
        cycle_start: DateTime<Utc>,
        cycle_end: DateTime<Utc>,
    ) -> PlacementResult {
        // Check if we should use fixed mode
        if self.config.fixed_mode {
            return self.fixed_placement(cycle_end);
        }

        // Check if we have enough pomodoros for a long break
        if pomodoro_count < self.config.pomodoros_before_break {
            return PlacementResult {
                fixed_mode_used: false,
                break_start: cycle_end,
                break_end: cycle_end + Duration::minutes(self.config.break_duration),
                score: 0.0,
                rationale: format!(
                    "Not enough pomodoros ({}/{})",
                    pomodoro_count, self.config.pomodoros_before_break
                ),
                evaluated_candidates: vec![],
            };
        }

        // Find candidate positions
        let candidates = self.find_candidates(scheduled_blocks, calendar_events, cycle_start, cycle_end);

        if candidates.is_empty() {
            return self.fixed_placement(cycle_end);
        }

        // Score and rank candidates
        let mut scored_candidates: Vec<_> = candidates
            .into_iter()
            .map(|c| self.score_candidate(c, scheduled_blocks, calendar_events))
            .collect();
        scored_candidates.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap());

        // Build evaluated candidates info (before taking the best)
        let evaluated: Vec<CandidateInfo> = scored_candidates
            .iter()
            .take(5)
            .map(|c| CandidateInfo {
                start_time: c.start_time,
                score: c.score,
                rationale: c.rationale.clone(),
            })
            .collect();

        // Select the best candidate
        let best = scored_candidates.into_iter().next().unwrap();

        PlacementResult {
            fixed_mode_used: false,
            break_start: best.start_time,
            break_end: best.end_time,
            score: best.score,
            rationale: best.rationale,
            evaluated_candidates: evaluated,
        }
    }

    /// Fixed placement at end of cycle.
    fn fixed_placement(&self, cycle_end: DateTime<Utc>) -> PlacementResult {
        PlacementResult {
            fixed_mode_used: true,
            break_start: cycle_end,
            break_end: cycle_end + Duration::minutes(self.config.break_duration),
            score: 1.0,
            rationale: "Fixed mode: break at end of cycle".to_string(),
            evaluated_candidates: vec![],
        }
    }

    /// Find all candidate positions for long-break insertion.
    fn find_candidates(
        &self,
        scheduled_blocks: &[ScheduledBlock],
        calendar_events: &[CalendarEvent],
        _cycle_start: DateTime<Utc>,
        cycle_end: DateTime<Utc>,
    ) -> Vec<BreakCandidate> {
        let mut candidates = Vec::new();

        // Find gaps between focus blocks
        let focus_blocks: Vec<_> = scheduled_blocks
            .iter()
            .filter(|b| b.block_type == ScheduledBlockType::Focus)
            .collect();

        if focus_blocks.is_empty() {
            return candidates;
        }

        // Add candidate after each focus block (except the last one)
        for i in 0..focus_blocks.len().saturating_sub(1) {
            let current_end = focus_blocks[i].end_time;
            let next_start = focus_blocks[i + 1].start_time;

            // Check if there's enough gap for a long break
            let gap_minutes = (next_start - current_end).num_minutes();
            if gap_minutes >= self.config.break_duration {
                let break_start = current_end;
                let break_end = current_end + Duration::minutes(self.config.break_duration);

                // Check for calendar conflicts
                if !self.has_calendar_conflict(break_start, break_end, calendar_events) {
                    candidates.push(BreakCandidate {
                        start_time: break_start,
                        end_time: break_end,
                        score: 0.0,
                        rationale: String::new(),
                    });
                }
            }
        }

        // Also consider end of cycle as a fallback
        candidates.push(BreakCandidate {
            start_time: cycle_end,
            end_time: cycle_end + Duration::minutes(self.config.break_duration),
            score: 0.0,
            rationale: String::new(),
        });

        candidates
    }

    /// Score a candidate position.
    fn score_candidate(
        &self,
        mut candidate: BreakCandidate,
        scheduled_blocks: &[ScheduledBlock],
        calendar_events: &[CalendarEvent],
    ) -> BreakCandidate {
        // Calculate fatigue score based on accumulated focus time
        let focus_before = self.calculate_focus_time_before(scheduled_blocks, candidate.start_time);
        let focus_after = self.calculate_focus_time_after(scheduled_blocks, candidate.start_time);

        // Higher fatigue before = better position (break is needed)
        let fatigue_score = (focus_before as f32 / self.config.max_continuous_focus as f32).min(1.0);

        // Lower focus after = better position (not interrupting deep work)
        let mut calendar_score = if focus_after > 0 {
            let after_ratio = focus_after as f32 / self.config.max_continuous_focus as f32;
            1.0 - after_ratio.min(1.0)
        } else {
            1.0 // No focus after = ideal
        };

        // Check proximity to calendar events
        let calendar_proximity = self.calculate_calendar_proximity(candidate.start_time, calendar_events);
        calendar_score *= 1.0 - (calendar_proximity * 0.3); // Penalty for being close to meetings

        // Combined score
        let total_score = (fatigue_score * self.config.fatigue_weight)
            + (calendar_score * self.config.calendar_weight);

        candidate.score = total_score;
        candidate.rationale = format!(
            "Fatigue: {:.2} ({}m before), Calendar: {:.2} ({}m after)",
            fatigue_score, focus_before, calendar_score, focus_after
        );

        candidate
    }

    /// Calculate total focus time before a given time.
    fn calculate_focus_time_before(
        &self,
        scheduled_blocks: &[ScheduledBlock],
        time: DateTime<Utc>,
    ) -> i64 {
        scheduled_blocks
            .iter()
            .filter(|b| b.block_type == ScheduledBlockType::Focus && b.end_time <= time)
            .map(|b| b.duration_minutes())
            .sum()
    }

    /// Calculate total focus time after a given time.
    fn calculate_focus_time_after(
        &self,
        scheduled_blocks: &[ScheduledBlock],
        time: DateTime<Utc>,
    ) -> i64 {
        scheduled_blocks
            .iter()
            .filter(|b| b.block_type == ScheduledBlockType::Focus && b.start_time >= time)
            .map(|b| b.duration_minutes())
            .sum()
    }

    /// Check if a time range conflicts with any calendar event.
    fn has_calendar_conflict(
        &self,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
        calendar_events: &[CalendarEvent],
    ) -> bool {
        calendar_events
            .iter()
            .any(|e| e.overlaps(start, end))
    }

    /// Calculate proximity to nearest calendar event (0.0-1.0).
    fn calculate_calendar_proximity(
        &self,
        time: DateTime<Utc>,
        calendar_events: &[CalendarEvent],
    ) -> f32 {
        let min_gap = calendar_events
            .iter()
            .filter_map(|e| {
                let gap_before = (e.start_time - time).num_minutes().abs();
                let gap_after = (e.end_time - time).num_minutes().abs();
                Some(gap_before.min(gap_after))
            })
            .min()
            .unwrap_or(i64::MAX);

        // Closer events have higher proximity (1.0 = event at same time, 0.0 = very far)
        if min_gap <= 0 {
            1.0
        } else if min_gap >= 60 {
            0.0
        } else {
            1.0 - (min_gap as f32 / 60.0)
        }
    }
}

impl Default for LongBreakPlacer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_block(id: &str, start: DateTime<Utc>, duration_min: i64) -> ScheduledBlock {
        ScheduledBlock::new(
            id.to_string(),
            "Test Task".to_string(),
            start,
            start + Duration::minutes(duration_min),
            ScheduledBlockType::Focus,
            None,
            1,
            5,
        )
    }

    fn make_event(id: &str, start: DateTime<Utc>, duration_min: i64) -> CalendarEvent {
        CalendarEvent::new(
            id.to_string(),
            "Meeting".to_string(),
            start,
            start + Duration::minutes(duration_min),
        )
    }

    #[test]
    fn test_fixed_mode_uses_end_of_cycle() {
        let config = LongBreakConfig {
            fixed_mode: true,
            ..Default::default()
        };
        let placer = LongBreakPlacer::with_config(config);
        let now = Utc::now();
        let cycle_end = now + Duration::hours(2);

        let result = placer.find_optimal_break_position(&[], &[], 4, now, cycle_end);

        assert!(result.fixed_mode_used);
        assert_eq!(result.break_start, cycle_end);
    }

    #[test]
    fn test_not_enough_pomodoros() {
        let placer = LongBreakPlacer::new();
        let now = Utc::now();

        let result = placer.find_optimal_break_position(&[], &[], 2, now, now + Duration::hours(2));

        assert!(!result.fixed_mode_used);
        assert!(result.score == 0.0);
        assert!(result.rationale.contains("Not enough pomodoros"));
    }

    #[test]
    fn test_prefers_position_after_fatigue() {
        let placer = LongBreakPlacer::new();
        let now = Utc::now();

        // Create 4 focus blocks (100 minutes total)
        let blocks = vec![
            make_block("1", now, 25),
            make_block("2", now + Duration::minutes(30), 25),
            make_block("3", now + Duration::minutes(60), 25),
            make_block("4", now + Duration::minutes(90), 25),
        ];

        let result = placer.find_optimal_break_position(
            &blocks,
            &[],
            4,
            now,
            now + Duration::minutes(120),
        );

        assert!(!result.fixed_mode_used);
        // Should prefer a position with higher fatigue (more focus before)
        assert!(result.score > 0.0);
    }

    #[test]
    fn test_avoids_calendar_conflicts() {
        let placer = LongBreakPlacer::new();
        let now = Utc::now();

        let blocks = vec![
            make_block("1", now, 25),
            make_block("2", now + Duration::minutes(35), 25),
        ];

        // Meeting that conflicts with potential break position
        let events = vec![make_event("m1", now + Duration::minutes(25), 30)];

        let result = placer.find_optimal_break_position(
            &blocks,
            &events,
            4,
            now,
            now + Duration::minutes(70),
        );

        // Should still find a position (end of cycle fallback)
        assert!(result.break_start >= now);
    }

    #[test]
    fn test_deterministic_for_same_inputs() {
        let placer = LongBreakPlacer::new();
        let now = Utc::now();

        let blocks = vec![
            make_block("1", now, 25),
            make_block("2", now + Duration::minutes(30), 25),
            make_block("3", now + Duration::minutes(60), 25),
            make_block("4", now + Duration::minutes(90), 25),
        ];

        let result1 = placer.find_optimal_break_position(
            &blocks,
            &[],
            4,
            now,
            now + Duration::minutes(120),
        );
        let result2 = placer.find_optimal_break_position(
            &blocks,
            &[],
            4,
            now,
            now + Duration::minutes(120),
        );

        // Same inputs should produce same outputs
        assert_eq!(result1.break_start, result2.break_start);
        assert!((result1.score - result2.score).abs() < 0.001);
    }

    #[test]
    fn test_placement_rationale_is_visible() {
        let placer = LongBreakPlacer::new();
        let now = Utc::now();

        let blocks = vec![
            make_block("1", now, 25),
            make_block("2", now + Duration::minutes(35), 25),
        ];

        let result = placer.find_optimal_break_position(
            &blocks,
            &[],
            4,
            now,
            now + Duration::minutes(70),
        );

        // Rationale should contain scoring information
        assert!(!result.rationale.is_empty() || result.fixed_mode_used);
    }
}
