//! Interruption heatmap module.
//!
//! This module provides interruption heatmap analysis by hour and source
//! to identify when and why interruptions cluster.

use chrono::{DateTime, Utc, Datelike, Timelike, Weekday};
use serde::{Deserialize, Serialize};

/// Interruption source classification.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum InterruptionSourceType {
    External,
    Internal,
}

/// Specific interruption source.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum InterruptionSource {
    Slack { priority: InterruptionPriority },
    Email { priority: InterruptionPriority },
    Phone { priority: InterruptionPriority },
    Meeting { priority: InterruptionPriority },
    ContextSwitch,
    Fatigue,
    Blocker,
    Other(String),
}

impl InterruptionSource {
    /// Get the source type classification.
    pub fn source_type(&self) -> InterruptionSourceType {
        match self {
            InterruptionSource::Slack { .. }
            | InterruptionSource::Email { .. }
            | InterruptionSource::Phone { .. }
            | InterruptionSource::Meeting { .. } => InterruptionSourceType::External,
            InterruptionSource::ContextSwitch
            | InterruptionSource::Fatigue
            | InterruptionSource::Blocker
            | InterruptionSource::Other(_) => InterruptionSourceType::Internal,
        }
    }

    /// Get a short name for the source.
    pub fn name(&self) -> &str {
        match self {
            InterruptionSource::Slack { .. } => "slack",
            InterruptionSource::Email { .. } => "email",
            InterruptionSource::Phone { .. } => "phone",
            InterruptionSource::Meeting { .. } => "meeting",
            InterruptionSource::ContextSwitch => "context",
            InterruptionSource::Fatigue => "fatigue",
            InterruptionSource::Blocker => "blocker",
            InterruptionSource::Other(_) => "other",
        }
    }
}

/// Interruption priority level.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum InterruptionPriority {
    Low,
    Medium,
    High,
}

/// Impact level of interruption.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum InterruptionImpact {
    Minimal,
    Moderate,
    Severe,
}

/// Single interruption event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterruptionEvent {
    pub occurred_at: String,
    pub duration_minutes: u32,
    pub source: InterruptionSource,
    pub impact: InterruptionImpact,
}

impl InterruptionEvent {
    /// Parse an interruption event from a database row.
    pub fn from_row(
        occurred_at: String,
        operation_type: String,
        data: String,
    ) -> Option<Self> {
        // Parse operation type to determine source
        let source = match operation_type.as_str() {
            "interruption:slack" => InterruptionSource::Slack { priority: InterruptionPriority::Medium },
            "interruption:email" => InterruptionSource::Email { priority: InterruptionPriority::Low },
            "interruption:phone" => InterruptionSource::Phone { priority: InterruptionPriority::High },
            "interruption:meeting" => InterruptionSource::Meeting { priority: InterruptionPriority::Medium },
            "interruption:context" => InterruptionSource::ContextSwitch,
            "interruption:fatigue" => InterruptionSource::Fatigue,
            "interruption:blocker" => InterruptionSource::Blocker,
            _ => return None,
        };

        // Parse data JSON for impact (simplified)
        let impact = if data.contains("\"high\"") {
            InterruptionImpact::Severe
        } else if data.contains("\"medium\"") {
            InterruptionImpact::Moderate
        } else {
            InterruptionImpact::Minimal
        };

        Some(InterruptionEvent {
            occurred_at,
            duration_minutes: 0, // Would be parsed from data
            source,
            impact,
        })
    }

    /// Get the hour of day (0-23) from occurred_at timestamp.
    pub fn hour(&self) -> u8 {
        if let Ok(dt) = DateTime::parse_from_rfc3339(&self.occurred_at) {
            dt.with_timezone(&Utc).hour() as u8
        } else {
            0
        }
    }

    /// Get the day of week (0-6, Sunday=0) from occurred_at timestamp.
    pub fn day_of_week(&self) -> u8 {
        if let Ok(dt) = DateTime::parse_from_rfc3339(&self.occurred_at) {
            dt.with_timezone(&Utc).weekday().num_days_from_sunday() as u8
        } else {
            0
        }
    }
}

/// Heatmap cell data.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeatmapCell {
    pub day_of_week: u8,
    pub hour: u8,
    pub interruption_count: u64,
    pub total_duration_min: u64,
    pub heat_intensity: f64,
}

impl HeatmapCell {
    /// Create a new empty cell.
    pub fn new(day_of_week: u8, hour: u8) -> Self {
        Self {
            day_of_week,
            hour,
            interruption_count: 0,
            total_duration_min: 0,
            heat_intensity: 0.0,
        }
    }

    /// Calculate heat intensity from interruption count (0.0-1.0).
    pub fn calculate_heat(&mut self, max_count: u64) {
        if max_count == 0 {
            self.heat_intensity = 0.0;
        } else {
            // Logarithmic scale: more gradual increase
            let normalized = self.interruption_count as f64 / max_count as f64;
            self.heat_intensity = (normalized.sqrt()).min(1.0);
        }
    }

    /// Get the character for ASCII heatmap visualization.
    pub fn heat_char(&self) -> char {
        if self.interruption_count == 0 {
            ' '
        } else if self.interruption_count <= 1 {
            '░'
        } else if self.interruption_count <= 5 {
            '▒'
        } else if self.interruption_count <= 10 {
            '▓'
        } else {
            '█'
        }
    }

    /// Get display coordinates for the cell.
    pub fn coordinates(&self) -> String {
        format!("{}:{:02}", self.day_name(), self.hour)
    }

    /// Get day name abbreviation.
    pub fn day_name(&self) -> &'static str {
        match self.day_of_week {
            0 => "Sun",
            1 => "Mon",
            2 => "Tue",
            3 => "Wed",
            4 => "Thu",
            5 => "Fri",
            6 => "Sat",
            _ => "?",
        }
    }
}

/// Interruption heatmap analyzer.
pub struct InterruptionHeatmapAnalyzer {
    pub min_heat_threshold: u64,
}

impl Default for InterruptionHeatmapAnalyzer {
    fn default() -> Self {
        Self::new()
    }
}

impl InterruptionHeatmapAnalyzer {
    /// Create a new analyzer with default settings.
    pub fn new() -> Self {
        Self {
            min_heat_threshold: 3,
        }
    }

    /// Build heatmap from interruption events.
    pub fn build_heatmap(&self, events: &[InterruptionEvent]) -> InterruptionHeatmap {
        let mut cells = vec![HeatmapCell::new(0, 0); 168];

        // Initialize all cells
        for day in 0..7 {
            for hour in 0..24 {
                cells[day as usize * 24 + hour as usize] = HeatmapCell::new(day, hour);
            }
        }

        // Count interruptions per cell
        for event in events {
            let day = event.day_of_week() as usize;
            let hour = event.hour() as usize;
            let idx = day * 24 + hour;

            if idx < cells.len() {
                cells[idx].interruption_count += 1;
                cells[idx].total_duration_min += event.duration_minutes as u64;
            }
        }

        // Find max count for normalization
        let max_count = cells.iter().map(|c| c.interruption_count).max().unwrap_or(1);

        // Calculate heat intensity
        for cell in &mut cells {
            cell.calculate_heat(max_count);
        }

        // Find peak hours
        let peak_hours: Vec<_> = cells
            .iter()
            .filter(|c| c.interruption_count >= self.min_heat_threshold)
            .map(|c| (c.day_of_week, c.hour))
            .collect();

        InterruptionHeatmap {
            cells,
            peak_hours,
            total_interruptions: events.len() as u64,
        }
    }

    /// Get peak hours sorted by interruption count (descending).
    pub fn get_peak_hours(&self, heatmap: &InterruptionHeatmap, limit: usize) -> Vec<(u8, u8, u64)> {
        let mut peaks: Vec<_> = heatmap.cells
            .iter()
            .filter(|c| c.interruption_count > 0)
            .map(|c| (c.day_of_week, c.hour, c.interruption_count))
            .collect();

        peaks.sort_by(|a, b| b.2.cmp(&a.2));
        peaks.into_iter().take(limit).collect()
    }

    /// Render heatmap as ASCII visualization.
    pub fn render_ascii(&self, heatmap: &InterruptionHeatmap) -> String {
        let mut output = String::new();

        output.push_str("\nInterruption Heatmap\n");
        output.push_str(&"=".repeat(80));
        output.push('\n');

        if heatmap.total_interruptions == 0 {
            output.push_str("No interruption data available.\n");
            return output;
        }

        output.push_str(&format!("Total interruptions: {}\n\n", heatmap.total_interruptions));

        // Header row with hours
        output.push_str("     ");
        for hour in 0..24 {
            output.push_str(&format!("{:>2} ", hour));
        }
        output.push('\n');

        // Grid
        for day in 0..7 {
            let day_name = match day {
                0 => "Sun",
                1 => "Mon",
                2 => "Tue",
                3 => "Wed",
                4 => "Thu",
                5 => "Fri",
                6 => "Sat",
                _ => "?",
            };
            output.push_str(&format!("{:<4}", day_name));

            for hour in 0..24 {
                let cell = &heatmap.cells[day as usize * 24 + hour as usize];
                output.push(cell.heat_char());
                output.push(' ');
            }
            output.push('\n');
        }

        output.push('\n');
        output.push_str(&"=".repeat(80));
        output.push('\n');
        output.push_str("Legend: ` (0-1) ░ (2-5) ▒ (6-10) ▓ (11-20) █ (20+)\n");

        // Show peak hours
        let peaks = self.get_peak_hours(heatmap, 5);
        if !peaks.is_empty() {
            output.push_str("\nPeak hours:\n");
            for (day, hour, count) in peaks {
                let cell = &heatmap.cells[day as usize * 24 + hour as usize];
                output.push_str(&format!(
                    "  {} {:02}:00 - {} interruptions\n",
                    cell.day_name(),
                    hour,
                    count
                ));
            }
        }

        output
    }

    /// Filter events by source type.
    pub fn filter_by_source_type(
        &self,
        events: &[InterruptionEvent],
        source_type: InterruptionSourceType,
    ) -> Vec<InterruptionEvent> {
        events
            .iter()
            .filter(|e| e.source.source_type() == source_type)
            .cloned()
            .collect()
    }

    /// Filter events by source name.
    pub fn filter_by_source(
        &self,
        events: &[InterruptionEvent],
        source_name: &str,
    ) -> Vec<InterruptionEvent> {
        events
            .iter()
            .filter(|e| e.source.name() == source_name)
            .cloned()
            .collect()
    }
}

/// Complete interruption heatmap.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterruptionHeatmap {
    /// All 168 cells (7 days x 24 hours)
    pub cells: Vec<HeatmapCell>,
    /// Peak hours with significant interruption activity
    pub peak_hours: Vec<(u8, u8)>,
    /// Total number of interruptions
    pub total_interruptions: u64,
}

impl InterruptionHeatmap {
    /// Create a new empty heatmap.
    pub fn new() -> Self {
        let cells = (0..168)
            .map(|i| HeatmapCell::new((i / 24) as u8, (i % 24) as u8))
            .collect();

        Self {
            cells,
            peak_hours: vec![],
            total_interruptions: 0,
        }
    }

    /// Get cell at specific day/hour.
    pub fn get_cell(&self, day_of_week: u8, hour: u8) -> Option<&HeatmapCell> {
        self.cells.get(day_of_week as usize * 24 + hour as usize)
    }

    /// Get total interruptions for a specific day.
    pub fn day_total(&self, day_of_week: u8) -> u64 {
        let start = day_of_week as usize * 24;
        let end = start + 24;
        self.cells[start..end]
            .iter()
            .map(|c| c.interruption_count)
            .sum()
    }

    /// Get total interruptions for a specific hour across all days.
    pub fn hour_total(&self, hour: u8) -> u64 {
        self.cells
            .iter()
            .skip(hour as usize)
            .step_by(24)
            .map(|c| c.interruption_count)
            .sum()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_interruption_source_classification() {
        let slack = InterruptionSource::Slack { priority: InterruptionPriority::Medium };
        assert_eq!(slack.source_type(), InterruptionSourceType::External);
        assert_eq!(slack.name(), "slack");

        let fatigue = InterruptionSource::Fatigue;
        assert_eq!(fatigue.source_type(), InterruptionSourceType::Internal);
        assert_eq!(fatigue.name(), "fatigue");
    }

    #[test]
    fn test_heatmap_cell_new() {
        let cell = HeatmapCell::new(1, 9);
        assert_eq!(cell.day_of_week, 1);
        assert_eq!(cell.hour, 9);
        assert_eq!(cell.interruption_count, 0);
        assert_eq!(cell.heat_intensity, 0.0);
    }

    #[test]
    fn test_heatmap_cell_heat_char() {
        let mut cell = HeatmapCell::new(1, 9);

        assert_eq!(cell.heat_char(), ' ');

        cell.interruption_count = 1;
        assert_eq!(cell.heat_char(), '░');

        cell.interruption_count = 3;
        assert_eq!(cell.heat_char(), '▒');

        cell.interruption_count = 8;
        assert_eq!(cell.heat_char(), '▓');

        cell.interruption_count = 15;
        assert_eq!(cell.heat_char(), '█');
    }

    #[test]
    fn test_analyzer_build_heatmap() {
        let analyzer = InterruptionHeatmapAnalyzer::new();
        let events = vec![
            InterruptionEvent {
                occurred_at: "2026-02-17T09:00:00+00:00".to_string(),
                duration_minutes: 5,
                source: InterruptionSource::Slack { priority: InterruptionPriority::Medium },
                impact: InterruptionImpact::Moderate,
            },
            InterruptionEvent {
                occurred_at: "2026-02-17T09:30:00+00:00".to_string(),
                duration_minutes: 3,
                source: InterruptionSource::Email { priority: InterruptionPriority::Low },
                impact: InterruptionImpact::Minimal,
            },
            InterruptionEvent {
                occurred_at: "2026-02-17T14:00:00+00:00".to_string(),
                duration_minutes: 10,
                source: InterruptionSource::Meeting { priority: InterruptionPriority::Medium },
                impact: InterruptionImpact::Moderate,
            },
        ];

        let heatmap = analyzer.build_heatmap(&events);

        // 2026-02-17 is a Tuesday (day_of_week = 2)
        // Events at 9:00, 9:30, and 14:00
        assert_eq!(heatmap.total_interruptions, 3);

        let cell_9 = heatmap.get_cell(2, 9).unwrap();
        assert_eq!(cell_9.interruption_count, 2);

        let cell_14 = heatmap.get_cell(2, 14).unwrap();
        assert_eq!(cell_14.interruption_count, 1);
    }

    #[test]
    fn test_heatmap_day_totals() {
        let mut heatmap = InterruptionHeatmap::new();

        // Add some interruptions to Monday (day 1)
        for hour in [9, 10, 11] {
            let idx = 1 * 24 + hour;
            heatmap.cells[idx].interruption_count = 5;
        }

        assert_eq!(heatmap.day_total(1), 15);
        assert_eq!(heatmap.day_total(2), 0);
    }

    #[test]
    fn test_heatmap_hour_totals() {
        let mut heatmap = InterruptionHeatmap::new();

        // Add interruptions at 9:00 across different days
        for day in [0, 1, 2] {
            let idx = day * 24 + 9;
            heatmap.cells[idx].interruption_count = 3;
        }

        assert_eq!(heatmap.hour_total(9), 9);
        assert_eq!(heatmap.hour_total(10), 0);
    }

    #[test]
    fn test_filter_by_source_type() {
        let analyzer = InterruptionHeatmapAnalyzer::new();
        let events = vec![
            InterruptionEvent {
                occurred_at: "2026-02-17T09:00:00+00:00".to_string(),
                duration_minutes: 5,
                source: InterruptionSource::Slack { priority: InterruptionPriority::Medium },
                impact: InterruptionImpact::Moderate,
            },
            InterruptionEvent {
                occurred_at: "2026-02-17T10:00:00+00:00".to_string(),
                duration_minutes: 3,
                source: InterruptionSource::Fatigue,
                impact: InterruptionImpact::Moderate,
            },
        ];

        let external = analyzer.filter_by_source_type(&events, InterruptionSourceType::External);
        assert_eq!(external.len(), 1);

        let internal = analyzer.filter_by_source_type(&events, InterruptionSourceType::Internal);
        assert_eq!(internal.len(), 1);
    }

    #[test]
    fn test_filter_by_source_name() {
        let analyzer = InterruptionHeatmapAnalyzer::new();
        let events = vec![
            InterruptionEvent {
                occurred_at: "2026-02-17T09:00:00+00:00".to_string(),
                duration_minutes: 5,
                source: InterruptionSource::Slack { priority: InterruptionPriority::Medium },
                impact: InterruptionImpact::Moderate,
            },
            InterruptionEvent {
                occurred_at: "2026-02-17T10:00:00+00:00".to_string(),
                duration_minutes: 3,
                source: InterruptionSource::Fatigue,
                impact: InterruptionImpact::Moderate,
            },
        ];

        let slack_events = analyzer.filter_by_source(&events, "slack");
        assert_eq!(slack_events.len(), 1);

        let fatigue_events = analyzer.filter_by_source(&events, "fatigue");
        assert_eq!(fatigue_events.len(), 1);
    }

    #[test]
    fn test_get_peak_hours() {
        let analyzer = InterruptionHeatmapAnalyzer::new();
        let mut heatmap = InterruptionHeatmap::new();

        // Set up some peak hours
        // Monday 9:00 - 10 interruptions
        heatmap.cells[1 * 24 + 9].interruption_count = 10;
        // Tuesday 14:00 - 8 interruptions
        heatmap.cells[2 * 24 + 14].interruption_count = 8;
        // Wednesday 10:00 - 12 interruptions
        heatmap.cells[3 * 24 + 10].interruption_count = 12;

        let peaks = analyzer.get_peak_hours(&heatmap, 5);

        assert_eq!(peaks.len(), 3);
        assert_eq!(peaks[0].0, 3); // Wednesday
        assert_eq!(peaks[0].1, 10); // 10:00
        assert_eq!(peaks[0].2, 12);
    }

    #[test]
    fn test_render_ascii_output() {
        let analyzer = InterruptionHeatmapAnalyzer::new();
        let mut heatmap = InterruptionHeatmap::new();

        // Add some data
        heatmap.cells[1 * 24 + 9].interruption_count = 5;
        heatmap.cells[1 * 24 + 14].interruption_count = 8;
        heatmap.total_interruptions = 2;

        let output = analyzer.render_ascii(&heatmap);

        assert!(output.contains("Interruption Heatmap"));
        assert!(output.contains("Mon"));
        assert!(output.contains("09:00"));
        assert!(output.contains("14:00"));
    }
}
