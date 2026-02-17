//! Async check-in generator from session timeline.
//!
//! This module generates concise async updates from actual work timeline,
//! suitable for posting to Slack, Notion, or other team channels.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// A completed work segment from the session timeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletedSegment {
    /// Task ID
    pub task_id: String,

    /// Task title
    pub task_title: String,

    /// Duration in minutes
    pub duration_minutes: i64,

    /// Start time
    pub start_time: DateTime<Utc>,

    /// End time
    pub end_time: DateTime<Utc>,

    /// Optional notes from the session
    pub notes: Option<String>,
}

/// A blocker encountered during work.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Blocker {
    /// Task ID where blocker occurred
    pub task_id: String,

    /// Task title
    pub task_title: String,

    /// Description of the blocker
    pub description: String,

    /// When the blocker was encountered
    pub timestamp: DateTime<Utc>,

    /// Whether the blocker is resolved
    pub resolved: bool,
}

/// Configuration for check-in generation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckinConfig {
    /// Include completed segments
    pub include_completions: bool,

    /// Include blockers
    pub include_blockers: bool,

    /// Include next planned tasks
    pub include_next_up: bool,

    /// Maximum summary length (characters)
    pub max_summary_length: usize,

    /// Time zone for display (offset in hours from UTC)
    pub timezone_offset: i32,
}

impl Default for CheckinConfig {
    fn default() -> Self {
        Self {
            include_completions: true,
            include_blockers: true,
            include_next_up: true,
            max_summary_length: 1000,
            timezone_offset: 0,
        }
    }
}

/// Generated check-in summary.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckinSummary {
    /// Summary text (formatted for posting)
    pub summary_text: String,

    /// List of source links
    pub source_links: Vec<SourceLink>,

    /// Generation timestamp
    pub generated_at: DateTime<Utc>,

    /// Preview for manual editing
    pub editable_preview: String,
}

/// A link to the underlying source data.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceLink {
    /// Link type (task, session, blocker)
    pub link_type: String,

    /// Display text
    pub display_text: String,

    /// Deep link URL (if available)
    pub url: Option<String>,
}

/// Input for check-in generation.
#[derive(Debug, Clone, Default)]
pub struct CheckinInput {
    /// Completed segments
    pub completed_segments: Vec<CompletedSegment>,

    /// Blockers encountered
    pub blockers: Vec<Blocker>,

    /// Next planned task titles
    pub next_up: Vec<String>,

    /// Time range start
    pub range_start: DateTime<Utc>,

    /// Time range end
    pub range_end: DateTime<Utc>,
}

/// Generator for async check-ins.
pub struct CheckinGenerator {
    config: CheckinConfig,
}

impl CheckinGenerator {
    /// Create a new generator with default config.
    pub fn new() -> Self {
        Self {
            config: CheckinConfig::default(),
        }
    }

    /// Create a generator with custom config.
    pub fn with_config(config: CheckinConfig) -> Self {
        Self { config }
    }

    /// Generate a check-in summary from the input.
    pub fn generate(&self, input: &CheckinInput) -> CheckinSummary {
        let mut sections: Vec<String> = Vec::new();
        let mut source_links: Vec<SourceLink> = Vec::new();

        // Header with time range
        let header = format!(
            "📋 **Check-in** ({})",
            self.format_time_range(input.range_start, input.range_end)
        );
        sections.push(header);

        // Completed work
        if self.config.include_completions && !input.completed_segments.is_empty() {
            let completions = self.format_completions(&input.completed_segments);
            sections.push(completions.summary);

            for seg in &input.completed_segments {
                source_links.push(SourceLink {
                    link_type: "task".to_string(),
                    display_text: seg.task_title.clone(),
                    url: None, // Would be populated with actual deep links
                });
            }
        }

        // Blockers
        if self.config.include_blockers && !input.blockers.is_empty() {
            let blockers = self.format_blockers(&input.blockers);
            sections.push(blockers);
        }

        // Next up
        if self.config.include_next_up && !input.next_up.is_empty() {
            let next = self.format_next_up(&input.next_up);
            sections.push(next);
        }

        let summary_text = sections.join("\n\n");

        // Truncate if needed (at char boundary, not byte boundary)
        let truncated = if summary_text.chars().count() > self.config.max_summary_length {
            let truncate_at = self.config.max_summary_length.saturating_sub(3);
            format!("{}...", summary_text.chars().take(truncate_at).collect::<String>())
        } else {
            summary_text
        };

        // Generate editable preview (plain text without markdown)
        let editable_preview = self.generate_editable_preview(input);

        CheckinSummary {
            summary_text: truncated,
            source_links,
            generated_at: Utc::now(),
            editable_preview,
        }
    }

    /// Format time range for display.
    fn format_time_range(&self, start: DateTime<Utc>, end: DateTime<Utc>) -> String {
        let offset = chrono::FixedOffset::east_opt(self.config.timezone_offset * 3600)
            .unwrap_or(chrono::FixedOffset::east_opt(0).unwrap());

        let local_start = start.with_timezone(&offset);
        let local_end = end.with_timezone(&offset);

        format!(
            "{} - {}",
            local_start.format("%H:%M"),
            local_end.format("%H:%M")
        )
    }

    /// Format completed segments.
    fn format_completions(&self, segments: &[CompletedSegment]) -> FormattedCompletions {
        let total_minutes: i64 = segments.iter().map(|s| s.duration_minutes).sum();
        let total_hours = total_minutes as f32 / 60.0;

        let items: Vec<String> = segments
            .iter()
            .map(|s| {
                let duration = if s.duration_minutes >= 60 {
                    format!("{:.1}h", s.duration_minutes as f32 / 60.0)
                } else {
                    format!("{}m", s.duration_minutes)
                };
                format!("• {} ({})", s.task_title, duration)
            })
            .collect();

        let summary = format!(
            "✅ **Completed** ({:.1}h)\n{}",
            total_hours,
            items.join("\n")
        );

        FormattedCompletions { summary }
    }

    /// Format blockers.
    fn format_blockers(&self, blockers: &[Blocker]) -> String {
        let items: Vec<String> = blockers
            .iter()
            .map(|b| {
                let status = if b.resolved { "✓" } else { "⚠️" };
                format!(
                    "{} {} - {}",
                    status, b.task_title, b.description
                )
            })
            .collect();

        format!("🚧 **Blockers**\n{}", items.join("\n"))
    }

    /// Format next up tasks.
    fn format_next_up(&self, next_up: &[String]) -> String {
        let items: Vec<String> = next_up
            .iter()
            .enumerate()
            .map(|(i, title)| format!("{}. {}", i + 1, title))
            .collect();

        format!("⏭️ **Next Up**\n{}", items.join("\n"))
    }

    /// Generate plain text editable preview.
    fn generate_editable_preview(&self, input: &CheckinInput) -> String {
        let mut lines: Vec<String> = Vec::new();

        lines.push("Check-in".to_string());
        lines.push("=".repeat(20));
        lines.push(String::new());

        if !input.completed_segments.is_empty() {
            lines.push("Completed:".to_string());
            for seg in &input.completed_segments {
                lines.push(format!("- {} ({}m)", seg.task_title, seg.duration_minutes));
            }
            lines.push(String::new());
        }

        if !input.blockers.is_empty() {
            lines.push("Blockers:".to_string());
            for b in &input.blockers {
                let status = if b.resolved { "[Resolved]" } else { "[Open]" };
                lines.push(format!("- {} {} - {}", b.task_title, status, b.description));
            }
            lines.push(String::new());
        }

        if !input.next_up.is_empty() {
            lines.push("Next Up:".to_string());
            for title in &input.next_up {
                lines.push(format!("- {}", title));
            }
        }

        lines.join("\n")
    }
}

impl Default for CheckinGenerator {
    fn default() -> Self {
        Self::new()
    }
}

/// Helper struct for formatted completions.
struct FormattedCompletions {
    summary: String,
}

/// Posting destination for check-ins.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PostingDestination {
    Slack { channel: String },
    Notion { page_id: String },
    Discord { channel: String },
    Custom { webhook_url: String },
}

/// Result of posting a check-in.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostingResult {
    pub success: bool,
    pub destination: PostingDestination,
    pub message: String,
    pub posted_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    fn make_segment(id: &str, title: &str, duration_min: i64) -> CompletedSegment {
        let now = Utc::now();
        CompletedSegment {
            task_id: id.to_string(),
            task_title: title.to_string(),
            duration_minutes: duration_min,
            start_time: now - Duration::minutes(duration_min),
            end_time: now,
            notes: None,
        }
    }

    fn make_blocker(task_id: &str, description: &str, resolved: bool) -> Blocker {
        Blocker {
            task_id: task_id.to_string(),
            task_title: format!("Task {}", task_id),
            description: description.to_string(),
            timestamp: Utc::now(),
            resolved,
        }
    }

    #[test]
    fn test_generates_summary_with_completions() {
        let generator = CheckinGenerator::new();
        let input = CheckinInput {
            completed_segments: vec![
                make_segment("1", "Write documentation", 45),
                make_segment("2", "Code review", 30),
            ],
            range_start: Utc::now() - Duration::hours(2),
            range_end: Utc::now(),
            ..Default::default()
        };

        let result = generator.generate(&input);

        assert!(result.summary_text.contains("Completed"));
        assert!(result.summary_text.contains("Write documentation"));
        assert!(result.summary_text.contains("1.2h"));
    }

    #[test]
    fn test_generates_summary_with_blockers() {
        let generator = CheckinGenerator::new();
        let input = CheckinInput {
            blockers: vec![
                make_blocker("1", "Waiting for API key", false),
                make_blocker("2", "Need clarification", true),
            ],
            range_start: Utc::now() - Duration::hours(2),
            range_end: Utc::now(),
            ..Default::default()
        };

        let result = generator.generate(&input);

        assert!(result.summary_text.contains("Blockers"));
        assert!(result.summary_text.contains("Waiting for API key"));
    }

    #[test]
    fn test_generates_summary_with_next_up() {
        let generator = CheckinGenerator::new();
        let input = CheckinInput {
            next_up: vec![
                "Finish testing".to_string(),
                "Deploy to staging".to_string(),
            ],
            range_start: Utc::now() - Duration::hours(2),
            range_end: Utc::now(),
            ..Default::default()
        };

        let result = generator.generate(&input);

        assert!(result.summary_text.contains("Next Up"));
        assert!(result.summary_text.contains("Finish testing"));
    }

    #[test]
    fn test_includes_source_links() {
        let generator = CheckinGenerator::new();
        let input = CheckinInput {
            completed_segments: vec![make_segment("1", "Task 1", 30)],
            range_start: Utc::now(),
            range_end: Utc::now(),
            ..Default::default()
        };

        let result = generator.generate(&input);

        assert!(!result.source_links.is_empty());
        assert_eq!(result.source_links[0].link_type, "task");
    }

    #[test]
    fn test_truncates_long_summaries() {
        let config = CheckinConfig {
            max_summary_length: 100,
            ..Default::default()
        };
        let generator = CheckinGenerator::with_config(config);

        // Create many segments to exceed limit
        let segments: Vec<_> = (0..50)
            .map(|i| make_segment(&format!("{}", i), &format!("Task {}", i), 30))
            .collect();

        let input = CheckinInput {
            completed_segments: segments,
            range_start: Utc::now(),
            range_end: Utc::now(),
            ..Default::default()
        };

        let result = generator.generate(&input);

        assert!(result.summary_text.chars().count() <= 103); // 100 + "..."
    }

    #[test]
    fn test_editable_preview_is_plain_text() {
        let generator = CheckinGenerator::new();
        let input = CheckinInput {
            completed_segments: vec![make_segment("1", "Task 1", 30)],
            blockers: vec![make_blocker("2", "Blocked", false)],
            next_up: vec!["Next task".to_string()],
            range_start: Utc::now(),
            range_end: Utc::now(),
            ..Default::default()
        };

        let result = generator.generate(&input);

        // Editable preview should not contain markdown
        assert!(!result.editable_preview.contains("**"));
        assert!(result.editable_preview.contains("Completed:"));
        assert!(result.editable_preview.contains("Blockers:"));
        assert!(result.editable_preview.contains("Next Up:"));
    }

    #[test]
    fn test_respects_config_flags() {
        let config = CheckinConfig {
            include_completions: false,
            include_blockers: false,
            include_next_up: false,
            ..Default::default()
        };
        let generator = CheckinGenerator::with_config(config);

        let input = CheckinInput {
            completed_segments: vec![make_segment("1", "Task 1", 30)],
            blockers: vec![make_blocker("2", "Blocked", false)],
            next_up: vec!["Next task".to_string()],
            range_start: Utc::now(),
            range_end: Utc::now(),
            ..Default::default()
        };

        let result = generator.generate(&input);

        // Should only contain header
        assert!(!result.summary_text.contains("Completed"));
        assert!(!result.summary_text.contains("Blockers"));
        assert!(!result.summary_text.contains("Next Up"));
    }
}
