//! Micro-segment merger for auto-merging tiny leftover segments.
//!
//! Prevents clutter by merging segments that fall below a time threshold
//! into their neighbors while preserving total planned time.

use serde::{Deserialize, Serialize};

/// Configuration for micro-segment merging
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MicroMergeConfig {
    /// Threshold in minutes below which segments are considered "micro"
    pub threshold_minutes: u32,
    /// Whether to enable auto-merging
    pub enabled: bool,
    /// Whether to prefer merging with previous or next segment
    pub prefer_previous: bool,
}

impl Default for MicroMergeConfig {
    fn default() -> Self {
        Self {
            threshold_minutes: 5, // 5 minutes threshold
            enabled: true,
            prefer_previous: true,
        }
    }
}

/// A segment that can be merged
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeableSegment {
    /// Segment ID
    pub id: String,
    /// Segment name
    pub name: String,
    /// Description
    pub description: String,
    /// Duration in minutes
    pub minutes: u32,
    /// Whether this segment is optional
    pub optional: bool,
    /// Order in sequence
    pub order: usize,
}

/// Result of a merge operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeResult {
    /// Original segments before merge
    pub original_segments: Vec<MergeableSegment>,
    /// Segments after merge
    pub merged_segments: Vec<MergeableSegment>,
    /// List of merge operations performed
    pub merge_operations: Vec<MergeOperation>,
    /// Total time preserved (should equal original total)
    pub total_time_preserved: u32,
}

/// Record of a merge operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeOperation {
    /// Index of segment that was merged (absorbed)
    pub merged_index: usize,
    /// ID of segment that was merged
    pub merged_id: String,
    /// Name of segment that was merged
    pub merged_name: String,
    /// Index of segment that received the merge
    pub target_index: usize,
    /// ID of target segment
    pub target_id: String,
    /// Minutes transferred
    pub minutes_transferred: u32,
    /// Whether target was before or after merged segment
    pub target_was_previous: bool,
}

/// Micro-segment merger
pub struct MicroSegmentMerger {
    config: MicroMergeConfig,
}

impl MicroSegmentMerger {
    /// Create a new merger with default config
    pub fn new() -> Self {
        Self {
            config: MicroMergeConfig::default(),
        }
    }

    /// Create with custom config
    pub fn with_config(config: MicroMergeConfig) -> Self {
        Self { config }
    }

    /// Check if a segment is considered "micro" (below threshold)
    pub fn is_micro(&self, minutes: u32) -> bool {
        self.config.enabled && minutes < self.config.threshold_minutes
    }

    /// Merge micro segments into neighbors
    ///
    /// # Arguments
    /// * `segments` - Input segments to process
    ///
    /// # Returns
    /// MergeResult containing merged segments and audit trail
    pub fn merge_micro_segments(&self, segments: Vec<MergeableSegment>) -> MergeResult {
        if segments.is_empty() || !self.config.enabled {
            return MergeResult {
                original_segments: segments.clone(),
                merged_segments: segments,
                merge_operations: vec![],
                total_time_preserved: 0,
            };
        }

        let original_total: u32 = segments.iter().map(|s| s.minutes).sum();
        let mut result_segments = segments.clone();
        let mut merge_operations = Vec::new();
        let mut i = 0;

        while i < result_segments.len() {
            if !self.is_micro(result_segments[i].minutes) {
                i += 1;
                continue;
            }

            // Found a micro segment - try to merge it
            let micro = &result_segments[i];
            let micro_minutes = micro.minutes;
            let micro_id = micro.id.clone();
            let micro_name = micro.name.clone();

            // Determine merge target
            let target_index = if self.config.prefer_previous && i > 0 {
                // Prefer previous segment
                i - 1
            } else if i < result_segments.len() - 1 {
                // Use next segment
                i + 1
            } else if i > 0 {
                // Fall back to previous if at end
                i - 1
            } else {
                // Cannot merge (only segment)
                i += 1;
                continue;
            };

            let target_was_previous = target_index < i;
            let target_id = result_segments[target_index].id.clone();
            let target_name = result_segments[target_index].name.clone();

            // Record the merge operation
            merge_operations.push(MergeOperation {
                merged_index: i,
                merged_id: micro_id,
                merged_name: micro_name,
                target_index: if target_was_previous {
                    target_index
                } else {
                    target_index - 1
                },
                target_id,
                minutes_transferred: micro_minutes,
                target_was_previous,
            });

            // Add micro segment's time to target
            result_segments[target_index].minutes += micro_minutes;

            // Update target name to indicate merge
            if !result_segments[target_index].name.contains("(+merged)") {
                result_segments[target_index].name =
                    format!("{} (+merged)", result_segments[target_index].name);
            }

            // Remove the micro segment
            result_segments.remove(i);

            // Don't increment i - check the same index again
            // (since we removed current element)
        }

        // Reorder segments by original order
        result_segments.sort_by_key(|s| s.order);

        // Recalculate order indices
        for (i, segment) in result_segments.iter_mut().enumerate() {
            segment.order = i;
        }

        let final_total: u32 = result_segments.iter().map(|s| s.minutes).sum();
        assert_eq!(
            original_total, final_total,
            "Total time must be preserved after merge"
        );

        MergeResult {
            original_segments: segments,
            merged_segments: result_segments,
            merge_operations,
            total_time_preserved: original_total,
        }
    }

    /// Get merge config
    pub fn config(&self) -> &MicroMergeConfig {
        &self.config
    }

    /// Generate audit trail description
    pub fn generate_audit_trail(&self, result: &MergeResult) -> Vec<String> {
        result
            .merge_operations
            .iter()
            .map(|op| {
                let direction = if op.target_was_previous {
                    "into previous"
                } else {
                    "into next"
                };
                format!(
                    "Merged '{}' ({} min) {} '{}'",
                    op.merged_name, op.minutes_transferred, direction, op.target_id
                )
            })
            .collect()
    }
}

impl Default for MicroSegmentMerger {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_segment(id: &str, name: &str, minutes: u32, order: usize) -> MergeableSegment {
        MergeableSegment {
            id: id.to_string(),
            name: name.to_string(),
            description: format!("Description for {}", name),
            minutes,
            optional: false,
            order,
        }
    }

    #[test]
    fn test_no_micro_segments() {
        let merger = MicroSegmentMerger::new();
        let segments = vec![
            create_test_segment("1", "Segment 1", 25, 0),
            create_test_segment("2", "Segment 2", 25, 1),
            create_test_segment("3", "Segment 3", 25, 2),
        ];

        let result = merger.merge_micro_segments(segments.clone());
        assert_eq!(result.merged_segments.len(), 3);
        assert!(result.merge_operations.is_empty());
    }

    #[test]
    fn test_merge_single_micro_segment() {
        let merger = MicroSegmentMerger::new();
        let segments = vec![
            create_test_segment("1", "Segment 1", 25, 0),
            create_test_segment("2", "Micro", 3, 1), // Below 5 min threshold
            create_test_segment("3", "Segment 3", 25, 2),
        ];

        let result = merger.merge_micro_segments(segments);
        assert_eq!(result.merged_segments.len(), 2);
        assert_eq!(result.merge_operations.len(), 1);

        // Micro segment (3 min) merged into segment 1
        assert_eq!(result.merged_segments[0].minutes, 28); // 25 + 3
        assert_eq!(result.merged_segments[1].minutes, 25);

        // Total time preserved
        let total: u32 = result.merged_segments.iter().map(|s| s.minutes).sum();
        assert_eq!(total, 53); // 25 + 3 + 25
    }

    #[test]
    fn test_merge_multiple_micro_segments() {
        let merger = MicroSegmentMerger::new();
        let segments = vec![
            create_test_segment("1", "Segment 1", 20, 0),
            create_test_segment("2", "Micro 1", 2, 1), // Micro
            create_test_segment("3", "Segment 2", 20, 2),
            create_test_segment("4", "Micro 2", 3, 3), // Micro
            create_test_segment("5", "Segment 3", 20, 4),
        ];

        let result = merger.merge_micro_segments(segments);
        assert_eq!(result.merged_segments.len(), 3);
        assert_eq!(result.merge_operations.len(), 2);

        // Total: 20 + 2 + 20 + 3 + 20 = 65
        let total: u32 = result.merged_segments.iter().map(|s| s.minutes).sum();
        assert_eq!(total, 65);
    }

    #[test]
    fn test_merge_at_beginning() {
        let merger = MicroSegmentMerger::new();
        let segments = vec![
            create_test_segment("1", "Micro", 2, 0), // Micro at start
            create_test_segment("2", "Segment 2", 25, 1),
        ];

        let result = merger.merge_micro_segments(segments);
        assert_eq!(result.merged_segments.len(), 1);
        assert_eq!(result.merged_segments[0].minutes, 27); // 2 + 25
    }

    #[test]
    fn test_merge_at_end() {
        let merger = MicroSegmentMerger::new();
        let segments = vec![
            create_test_segment("1", "Segment 1", 25, 0),
            create_test_segment("2", "Micro", 2, 1), // Micro at end
        ];

        let result = merger.merge_micro_segments(segments);
        assert_eq!(result.merged_segments.len(), 1);
        assert_eq!(result.merged_segments[0].minutes, 27); // 25 + 2
    }

    #[test]
    fn test_single_micro_segment_only() {
        let merger = MicroSegmentMerger::new();
        let segments = vec![create_test_segment("1", "Only", 3, 0)];

        let result = merger.merge_micro_segments(segments.clone());
        // Cannot merge if it's the only segment
        assert_eq!(result.merged_segments.len(), 1);
        assert_eq!(result.merged_segments[0].minutes, 3);
    }

    #[test]
    fn test_custom_threshold() {
        let config = MicroMergeConfig {
            threshold_minutes: 10, // 10 min threshold
            enabled: true,
            prefer_previous: true,
        };
        let merger = MicroSegmentMerger::with_config(config);

        let segments = vec![
            create_test_segment("1", "Segment 1", 25, 0),
            create_test_segment("2", "Small", 8, 1), // Above 5 but below 10
            create_test_segment("3", "Segment 3", 25, 2),
        ];

        let result = merger.merge_micro_segments(segments);
        assert_eq!(result.merged_segments.len(), 2); // 8 min segment merged
    }

    #[test]
    fn test_disabled_merging() {
        let config = MicroMergeConfig {
            threshold_minutes: 5,
            enabled: false, // Disabled
            prefer_previous: true,
        };
        let merger = MicroSegmentMerger::with_config(config);

        let segments = vec![
            create_test_segment("1", "Segment 1", 25, 0),
            create_test_segment("2", "Micro", 2, 1),
            create_test_segment("3", "Segment 3", 25, 2),
        ];

        let result = merger.merge_micro_segments(segments.clone());
        assert_eq!(result.merged_segments.len(), 3); // No merging
        assert!(result.merge_operations.is_empty());
    }

    #[test]
    fn test_prefer_next_over_previous() {
        let config = MicroMergeConfig {
            threshold_minutes: 5,
            enabled: true,
            prefer_previous: false, // Prefer next
        };
        let merger = MicroSegmentMerger::with_config(config);

        let segments = vec![
            create_test_segment("1", "Segment 1", 25, 0),
            create_test_segment("2", "Micro", 3, 1),
            create_test_segment("3", "Segment 3", 25, 2),
        ];

        let result = merger.merge_micro_segments(segments);
        // Micro should merge into Segment 3 (next)
        assert_eq!(result.merged_segments[0].minutes, 25);
        assert_eq!(result.merged_segments[1].minutes, 28); // 25 + 3
    }

    #[test]
    fn test_audit_trail_generation() {
        let merger = MicroSegmentMerger::new();
        let segments = vec![
            create_test_segment("1", "Segment 1", 25, 0),
            create_test_segment("2", "Tiny", 2, 1),
            create_test_segment("3", "Segment 3", 25, 2),
        ];

        let result = merger.merge_micro_segments(segments);
        let audit = merger.generate_audit_trail(&result);

        assert_eq!(audit.len(), 1);
        assert!(audit[0].contains("Tiny"));
        assert!(audit[0].contains("into previous"));
    }

    #[test]
    fn test_empty_segments() {
        let merger = MicroSegmentMerger::new();
        let result = merger.merge_micro_segments(vec![]);
        assert!(result.merged_segments.is_empty());
    }

    #[test]
    fn test_exact_threshold() {
        let merger = MicroSegmentMerger::new(); // 5 min threshold
        let segments = vec![
            create_test_segment("1", "Segment 1", 25, 0),
            create_test_segment("2", "Exactly 5", 5, 1), // Exactly at threshold
            create_test_segment("3", "Segment 3", 25, 2),
        ];

        let result = merger.merge_micro_segments(segments.clone());
        // 5 min is NOT below threshold (5 < 5 is false)
        assert_eq!(result.merged_segments.len(), 3);
    }

    #[test]
    fn test_chronological_consistency() {
        let merger = MicroSegmentMerger::new();
        let segments = vec![
            create_test_segment("1", "First", 20, 0),
            create_test_segment("2", "Micro 1", 2, 1),
            create_test_segment("3", "Middle", 20, 2),
            create_test_segment("4", "Micro 2", 3, 3),
            create_test_segment("5", "Last", 20, 4),
        ];

        let result = merger.merge_micro_segments(segments);

        // Verify chronological order is preserved
        for (i, segment) in result.merged_segments.iter().enumerate() {
            assert_eq!(segment.order, i);
        }
    }
}
