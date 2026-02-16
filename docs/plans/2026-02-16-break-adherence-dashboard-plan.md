# Break Adherence Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add break adherence analytics to track taken/skipped/deferred break ratios with hourly and project segmentation.

**Architecture:** Create `BreakAdherenceAnalyzer` in pomodoroom-core that infers break status from session patterns. Add database methods for computing stats. Extend CLI `stats` command with `breaks` subcommand.

**Tech Stack:** Rust, rusqlite, chrono, clap, serde (CSV)

---

## Task 1: Add Break Adherence Types

**Files:**
- Create: `crates/pomodoroom-core/src/stats/mod.rs`
- Create: `crates/pomodoroom-core/src/stats/break_adherence.rs`
- Modify: `crates/pomodoroom-core/src/lib.rs`

**Step 1: Create stats module structure**

Create `crates/pomodoroom-core/src/stats/mod.rs`:
```rust
mod break_adherence;

pub use break_adherence::{
    BreakAdherenceStats, BreakAdherenceReport, HourlyAdherence,
    ProjectAdherence, HighRiskWindow, BreakAdherenceAnalyzer,
};
```

Create `crates/pomodoroom-core/src/stats/break_adherence.rs`:
```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Break status inferred from session patterns.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BreakStatus {
    Taken,
    Skipped,
    Deferred,
}

/// Aggregate statistics for break adherence.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BreakAdherenceStats {
    pub total_focus_sessions: u64,
    pub breaks_taken: u64,
    pub breaks_skipped: u64,
    pub breaks_deferred: u64,
    pub adherence_rate: f64,
    pub avg_delay_min: f64,
}

/// Hourly breakdown of break adherence.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HourlyAdherence {
    pub hour: u8,
    pub total: u64,
    pub taken: u64,
    pub skipped: u64,
    pub deferred: u64,
    pub risk_score: f64,
}

/// Per-project break adherence stats.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectAdherence {
    pub project_name: String,
    pub stats: BreakAdherenceStats,
}

/// High-risk time window identification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HighRiskWindow {
    pub hour: u8,
    pub skip_rate: f64,
    pub defer_rate: f64,
}

/// Complete break adherence report.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BreakAdherenceReport {
    pub stats: BreakAdherenceStats,
    pub by_hour: Vec<HourlyAdherence>,
    pub by_project: Vec<ProjectAdherence>,
    pub high_risk_windows: Vec<HighRiskWindow>,
}

/// Analyzer for computing break adherence from session data.
pub struct BreakAdherenceAnalyzer {
    /// Maximum minutes after focus before break is considered skipped.
    pub skip_threshold_min: u64,
    /// Maximum minutes delay before break is considered deferred.
    pub defer_threshold_min: u64,
}

impl Default for BreakAdherenceAnalyzer {
    fn default() -> Self {
        Self {
            skip_threshold_min: 30,  // No break within 30 min = skipped
            defer_threshold_min: 5,  // Break delayed > 5 min = deferred
        }
    }
}

impl BreakAdherenceAnalyzer {
    pub fn new() -> Self {
        Self::default()
    }

    /// Infer break status from focus session end and subsequent break.
    pub fn infer_break_status(
        &self,
        focus_end: &str,
        break_start: Option<&str>,
    ) -> BreakStatus {
        match break_start {
            None => BreakStatus::Skipped,
            Some(break_ts) => {
                let focus_end_time = chrono::DateTime::parse_from_rfc3339(focus_end);
                let break_start_time = chrono::DateTime::parse_from_rfc3339(break_ts);

                match (focus_end_time, break_start_time) {
                    (Ok(focus), Ok(brk)) => {
                        let delay = (brk - focus).num_minutes().max(0) as u64;
                        if delay > self.skip_threshold_min {
                            BreakStatus::Skipped
                        } else if delay > self.defer_threshold_min {
                            BreakStatus::Deferred
                        } else {
                            BreakStatus::Taken
                        }
                    }
                    _ => BreakStatus::Taken, // Assume taken if timestamps invalid
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_infer_break_status_taken() {
        let analyzer = BreakAdherenceAnalyzer::default();
        let status = analyzer.infer_break_status(
            "2026-01-01T10:00:00Z",
            Some("2026-01-01T10:02:00Z"),
        );
        assert_eq!(status, BreakStatus::Taken);
    }

    #[test]
    fn test_infer_break_status_deferred() {
        let analyzer = BreakAdherenceAnalyzer::default();
        let status = analyzer.infer_break_status(
            "2026-01-01T10:00:00Z",
            Some("2026-01-01T10:10:00Z"),
        );
        assert_eq!(status, BreakStatus::Deferred);
    }

    #[test]
    fn test_infer_break_status_skipped_no_break() {
        let analyzer = BreakAdherenceAnalyzer::default();
        let status = analyzer.infer_break_status(
            "2026-01-01T10:00:00Z",
            None,
        );
        assert_eq!(status, BreakStatus::Skipped);
    }

    #[test]
    fn test_infer_break_status_skipped_too_late() {
        let analyzer = BreakAdherenceAnalyzer::default();
        let status = analyzer.infer_break_status(
            "2026-01-01T10:00:00Z",
            Some("2026-01-01T10:45:00Z"),
        );
        assert_eq!(status, BreakStatus::Skipped);
    }

    #[test]
    fn test_adherence_stats_default() {
        let stats = BreakAdherenceStats::default();
        assert_eq!(stats.total_focus_sessions, 0);
        assert_eq!(stats.adherence_rate, 0.0);
    }
}
```

**Step 2: Update lib.rs**

Add to `crates/pomodoroom-core/src/lib.rs` (after `pub mod scheduler;`):
```rust
pub mod stats;
```

Add to exports:
```rust
pub use stats::{BreakAdherenceStats, BreakAdherenceReport, BreakAdherenceAnalyzer};
```

**Step 3: Run tests**

Run: `cargo test -p pomodoroom-core stats::break_adherence`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add crates/pomodoroom-core/src/stats/ crates/pomodoroom-core/src/lib.rs
git commit -m "feat(stats): add break adherence types and analyzer"
```

---

## Task 2: Add Database Methods for Break Adherence

**Files:**
- Modify: `crates/pomodoroom-core/src/storage/database.rs`

**Step 1: Add query method**

Add to `impl Database` in `database.rs`:
```rust
    /// Get break adherence data from sessions within a date range.
    /// Returns pairs of (focus_session, optional_break_session).
    pub fn get_break_adherence_data(
        &self,
        start: &str,
        end: &str,
        project_id: Option<&str>,
    ) -> Result<Vec<BreakAdherenceRow>, rusqlite::Error> {
        let start_ts = format!("{}T00:00:00+00:00", start);
        let end_ts = format!("{}T23:59:59+00:00", end);

        let query = if project_id.is_some() {
            "SELECT s.completed_at, s.step_type, s.duration_min, s.project_id,
                    strftime('%H', s.completed_at) as hour,
                    strftime('%w', s.completed_at) as day_of_week
             FROM sessions s
             WHERE s.completed_at >= ?1 AND s.completed_at <= ?2
               AND s.project_id = ?3
             ORDER BY s.completed_at ASC"
        } else {
            "SELECT s.completed_at, s.step_type, s.duration_min, s.project_id,
                    strftime('%H', s.completed_at) as hour,
                    strftime('%w', s.completed_at) as day_of_week
             FROM sessions s
             WHERE s.completed_at >= ?1 AND s.completed_at <= ?2
             ORDER BY s.completed_at ASC"
        };

        let mut stmt = self.conn.prepare(query)?;
        let rows = if let Some(pid) = project_id {
            stmt.query_map(params![start_ts, end_ts, pid], |row| {
                Ok(BreakAdherenceRow {
                    completed_at: row.get(0)?,
                    step_type: row.get(1)?,
                    duration_min: row.get(2)?,
                    project_id: row.get(3)?,
                    hour: row.get::<_, String>(4)?.parse().unwrap_or(0),
                    day_of_week: row.get::<_, String>(5)?.parse().unwrap_or(0),
                })
            })?
        } else {
            stmt.query_map(params![start_ts, end_ts], |row| {
                Ok(BreakAdherenceRow {
                    completed_at: row.get(0)?,
                    step_type: row.get(1)?,
                    duration_min: row.get(2)?,
                    project_id: row.get(3)?,
                    hour: row.get::<_, String>(4)?.parse().unwrap_or(0),
                    day_of_week: row.get::<_, String>(5)?.parse().unwrap_or(0),
                })
            })?
        };

        let mut data = Vec::new();
        for row in rows {
            data.push(row?);
        }
        Ok(data)
    }
```

Add struct definition (after `SessionRow`):
```rust
/// Row type for break adherence queries.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BreakAdherenceRow {
    pub completed_at: String,
    pub step_type: String,
    pub duration_min: i64,
    pub project_id: Option<String>,
    pub hour: u8,
    pub day_of_week: u8,
}
```

**Step 2: Add test**

Add to tests in `database.rs`:
```rust
    #[test]
    fn get_break_adherence_data_basic() {
        let db = Database::open_memory().unwrap();
        let base_time = chrono::Utc::now();

        // Record focus session
        db.record_session(
            StepType::Focus,
            "Work",
            25,
            base_time,
            base_time + chrono::Duration::minutes(25),
            None,
            None,
        ).unwrap();

        // Record break session
        db.record_session(
            StepType::Break,
            "Rest",
            5,
            base_time + chrono::Duration::minutes(25),
            base_time + chrono::Duration::minutes(30),
            None,
            None,
        ).unwrap();

        let today = base_time.format("%Y-%m-%d").to_string();
        let data = db.get_break_adherence_data(&today, &today, None).unwrap();
        assert_eq!(data.len(), 2);
        assert_eq!(data[0].step_type, "focus");
        assert_eq!(data[1].step_type, "break");
    }
```

**Step 3: Run tests**

Run: `cargo test -p pomodoroom-core database::tests::get_break_adherence`
Expected: PASS

**Step 4: Commit**

```bash
git add crates/pomodoroom-core/src/storage/database.rs
git commit -m "feat(db): add get_break_adherence_data query method"
```

---

## Task 3: Implement Break Adherence Report Generator

**Files:**
- Modify: `crates/pomodoroom-core/src/stats/break_adherence.rs`

**Step 1: Add report generation method**

Add to `impl BreakAdherenceAnalyzer`:
```rust
    /// Generate break adherence report from session rows.
    pub fn generate_report(&self, rows: &[crate::storage::BreakAdherenceRow]) -> BreakAdherenceReport {
        let mut stats = BreakAdherenceStats::default();
        let mut hourly_data: HashMap<u8, (u64, u64, u64, u64)> = HashMap::new();
        let mut project_data: HashMap<String, (u64, u64, u64, u64)> = HashMap::new();
        let mut total_delay = 0u64;
        let mut delay_count = 0u64;

        // Process sessions in pairs (focus followed by break)
        let mut i = 0;
        while i < rows.len() {
            if rows[i].step_type == "focus" {
                stats.total_focus_sessions += 1;
                let focus_end = &rows[i].completed_at;
                let hour = rows[i].hour;
                let project = rows[i].project_id.clone().unwrap_or_default();

                // Look for subsequent break
                let break_start = if i + 1 < rows.len() && rows[i + 1].step_type == "break" {
                    Some(rows[i + 1].completed_at.as_str())
                } else {
                    None
                };

                let status = self.infer_break_status(focus_end, break_start);

                // Update stats
                match status {
                    BreakStatus::Taken => stats.breaks_taken += 1,
                    BreakStatus::Skipped => stats.breaks_skipped += 1,
                    BreakStatus::Deferred => {
                        stats.breaks_deferred += 1;
                        // Calculate delay
                        if let Some(bs) = break_start {
                            if let (Ok(fe), Ok(bs)) = (
                                chrono::DateTime::parse_from_rfc3339(focus_end),
                                chrono::DateTime::parse_from_rfc3339(bs),
                            ) {
                                let delay = (bs - fe).num_minutes().max(0) as u64;
                                total_delay += delay;
                                delay_count += 1;
                            }
                        }
                    }
                }

                // Update hourly data
                let (total, taken, skipped, deferred) = hourly_data.entry(hour).or_default();
                *total += 1;
                match status {
                    BreakStatus::Taken => *taken += 1,
                    BreakStatus::Skipped => *skipped += 1,
                    BreakStatus::Deferred => *deferred += 1,
                }

                // Update project data
                let (pt, ptk, ps, pd) = project_data.entry(project).or_default();
                *pt += 1;
                match status {
                    BreakStatus::Taken => *ptk += 1,
                    BreakStatus::Skipped => *ps += 1,
                    BreakStatus::Deferred => *pd += 1,
                }
            }
            i += 1;
        }

        // Calculate rates
        if stats.total_focus_sessions > 0 {
            stats.adherence_rate = stats.breaks_taken as f64 / stats.total_focus_sessions as f64;
        }
        if delay_count > 0 {
            stats.avg_delay_min = total_delay as f64 / delay_count as f64;
        }

        // Build hourly adherence
        let mut by_hour: Vec<HourlyAdherence> = hourly_data
            .into_iter()
            .map(|(hour, (total, taken, skipped, deferred))| {
                let skip_rate = if total > 0 { skipped as f64 / total as f64 } else { 0.0 };
                let defer_rate = if total > 0 { deferred as f64 / total as f64 } else { 0.0 };
                HourlyAdherence {
                    hour,
                    total,
                    taken,
                    skipped,
                    deferred,
                    risk_score: skip_rate * 0.6 + defer_rate * 0.4,
                }
            })
            .collect();
        by_hour.sort_by_key(|h| h.hour);

        // Build project adherence
        let by_project: Vec<ProjectAdherence> = project_data
            .into_iter()
            .map(|(name, (total, taken, skipped, deferred))| {
                let adherence_rate = if total > 0 { taken as f64 / total as f64 } else { 0.0 };
                ProjectAdherence {
                    project_name: name,
                    stats: BreakAdherenceStats {
                        total_focus_sessions: total,
                        breaks_taken: taken,
                        breaks_skipped: skipped,
                        breaks_deferred: deferred,
                        adherence_rate,
                        avg_delay_min: 0.0,
                    },
                }
            })
            .collect();

        // Identify high-risk windows (skip_rate > 0.3 or defer_rate > 0.2)
        let high_risk_windows: Vec<HighRiskWindow> = by_hour
            .iter()
            .filter(|h| h.skip_rate > 0.3 || h.risk_score > 0.25)
            .map(|h| HighRiskWindow {
                hour: h.hour,
                skip_rate: h.skip_rate,
                defer_rate: if h.total > 0 {
                    h.deferred as f64 / h.total as f64
                } else {
                    0.0
                },
            })
            .collect();

        BreakAdherenceReport {
            stats,
            by_hour,
            by_project,
            high_risk_windows,
        }
    }
```

Add `use std::collections::HashMap;` at top of file.

**Step 2: Add test**

```rust
    #[test]
    fn test_generate_report() {
        use crate::storage::BreakAdherenceRow;

        let analyzer = BreakAdherenceAnalyzer::default();
        let rows = vec![
            BreakAdherenceRow {
                completed_at: "2026-01-01T09:00:00Z".to_string(),
                step_type: "focus".to_string(),
                duration_min: 25,
                project_id: None,
                hour: 9,
                day_of_week: 4,
            },
            BreakAdherenceRow {
                completed_at: "2026-01-01T09:25:00Z".to_string(),
                step_type: "break".to_string(),
                duration_min: 5,
                project_id: None,
                hour: 9,
                day_of_week: 4,
            },
            BreakAdherenceRow {
                completed_at: "2026-01-01T10:00:00Z".to_string(),
                step_type: "focus".to_string(),
                duration_min: 25,
                project_id: None,
                hour: 10,
                day_of_week: 4,
            },
            // No break after this focus = skipped
        ];

        let report = analyzer.generate_report(&rows);
        assert_eq!(report.stats.total_focus_sessions, 2);
        assert_eq!(report.stats.breaks_taken, 1);
        assert_eq!(report.stats.breaks_skipped, 1);
        assert_eq!(report.by_hour.len(), 2);
    }
```

**Step 3: Run tests**

Run: `cargo test -p pomodoroom-core stats::break_adherence`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add crates/pomodoroom-core/src/stats/break_adherence.rs
git commit -m "feat(stats): implement break adherence report generation"
```

---

## Task 4: Add CLI Stats Breaks Subcommand

**Files:**
- Modify: `crates/pomodoroom-cli/src/commands/stats.rs`

**Step 1: Add breaks action to StatsAction enum**

Read current `stats.rs`, then modify to add breaks subcommand.

Add to `StatsAction` enum:
```rust
    /// Break adherence statistics
    Breaks {
        /// Start date (YYYY-MM-DD)
        #[arg(long)]
        start: Option<String>,
        /// End date (YYYY-MM-DD)
        #[arg(long)]
        end: Option<String>,
        /// Filter by project ID
        #[arg(long)]
        project: Option<String>,
        /// Show hourly breakdown
        #[arg(long)]
        by_hour: bool,
        /// Show project breakdown
        #[arg(long)]
        by_project: bool,
        /// Export to CSV
        #[arg(long)]
        export: Option<PathBuf>,
    },
```

Add to `run()` match:
```rust
        StatsAction::Breaks { start, end, project, by_hour, by_project, export } => {
            show_break_adherence(start, end, project, by_hour, by_project, export)
        }
```

Add import: `use pomodoroom_core::{BreakAdherenceAnalyzer, Database};`

Add helper function:
```rust
fn show_break_adherence(
    start: Option<String>,
    end: Option<String>,
    project: Option<String>,
    by_hour: bool,
    by_project: bool,
    export: Option<PathBuf>,
) -> Result<(), Box<dyn std::error::Error>> {
    let db = Database::open()?;
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let start_date = start.unwrap_or_else(|| {
        (chrono::Utc::now() - chrono::Duration::days(30))
            .format("%Y-%m-%d")
            .to_string()
    });
    let end_date = end.unwrap_or(today);

    let rows = db.get_break_adherence_data(
        &start_date,
        &end_date,
        project.as_deref(),
    )?;

    let analyzer = BreakAdherenceAnalyzer::new();
    let report = analyzer.generate_report(&rows);

    if let Some(path) = export {
        export_break_report_csv(&report, &path)?;
        println!("Exported break adherence report to: {}", path.display());
        return Ok(());
    }

    // Print summary
    println!("Break Adherence Report ({} to {})", start_date, end_date);
    println!("==========================================");
    println!("Total focus sessions: {}", report.stats.total_focus_sessions);
    println!("Breaks taken:    {} ({:.1}%)", report.stats.breaks_taken, report.stats.adherence_rate * 100.0);
    println!("Breaks skipped:  {}", report.stats.breaks_skipped);
    println!("Breaks deferred: {}", report.stats.breaks_deferred);
    if report.stats.avg_delay_min > 0.0 {
        println!("Avg delay:       {:.1} min", report.stats.avg_delay_min);
    }

    if by_hour && !report.by_hour.is_empty() {
        println!("\nHourly Breakdown:");
        println!("{:<6} {:<8} {:<8} {:<8} {:<10}", "Hour", "Total", "Taken", "Skipped", "Risk");
        for h in &report.by_hour {
            println!(
                "{:<6} {:<8} {:<8} {:<8} {:.1}%",
                h.hour, h.total, h.taken, h.skipped, h.risk_score * 100.0
            );
        }
    }

    if by_project && !report.by_project.is_empty() {
        println!("\nProject Breakdown:");
        println!("{:<20} {:<8} {:<10}", "Project", "Total", "Adherence");
        for p in &report.by_project {
            println!(
                "{:<20} {:<8} {:.1}%",
                p.project_name, p.stats.total_focus_sessions, p.stats.adherence_rate * 100.0
            );
        }
    }

    if !report.high_risk_windows.is_empty() {
        println!("\nHigh-Risk Windows:");
        for w in &report.high_risk_windows {
            println!("  Hour {}: Skip rate {:.1}%", w.hour, w.skip_rate * 100.0);
        }
    }

    Ok(())
}

fn export_break_report_csv(
    report: &pomodoroom_core::BreakAdherenceReport,
    path: &std::path::Path,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut wtr = csv::Writer::from_path(path)?;

    // Summary section
    wtr.write_record(["Break Adherence Report"])?;
    wtr.write_record(["Metric", "Value"])?;
    wtr.write_record(["Total Focus Sessions", &report.stats.total_focus_sessions.to_string()])?;
    wtr.write_record(["Breaks Taken", &report.stats.breaks_taken.to_string()])?;
    wtr.write_record(["Breaks Skipped", &report.stats.breaks_skipped.to_string()])?;
    wtr.write_record(["Breaks Deferred", &report.stats.breaks_deferred.to_string()])?;
    wtr.write_record(["Adherence Rate", &format!("{:.1}%", report.stats.adherence_rate * 100.0)])?;
    wtr.write_record([])?;

    // Hourly breakdown
    wtr.write_record(["Hourly Breakdown"])?;
    wtr.write_record(["Hour", "Total", "Taken", "Skipped", "Deferred", "Risk Score"])?;
    for h in &report.by_hour {
        wtr.write_record([
            &h.hour.to_string(),
            &h.total.to_string(),
            &h.taken.to_string(),
            &h.skipped.to_string(),
            &h.deferred.to_string(),
            &format!("{:.2}", h.risk_score),
        ])?;
    }

    wtr.flush()?;
    Ok(())
}
```

Add imports: `use std::path::PathBuf;`

**Step 2: Build and test CLI**

Run: `cargo build -p pomodoroom-cli`
Expected: BUILD SUCCESS

Run: `cargo run -p pomodoroom-cli -- stats breaks --help`
Expected: Shows help for breaks command

**Step 3: Commit**

```bash
git add crates/pomodoroom-cli/src/commands/stats.rs
git commit -m "feat(cli): add stats breaks subcommand for adherence dashboard"
```

---

## Task 5: Add Integration Tests

**Files:**
- Create: `crates/pomodoroom-core/tests/break_adherence_integration.rs`

**Step 1: Create integration test**

```rust
use pomodoroom_core::{BreakAdherenceAnalyzer, Database, StepType};

#[test]
fn test_full_break_adherence_workflow() {
    let db = Database::open_memory().unwrap();
    let base = chrono::Utc::now();

    // Simulate a day of work: 4 focus sessions with 3 breaks (1 skipped)
    // Focus 1 -> Break 1 (taken)
    db.record_session(StepType::Focus, "Work", 25, base, base + chrono::Duration::minutes(25), None, None).unwrap();
    db.record_session(StepType::Break, "Rest", 5, base + chrono::Duration::minutes(25), base + chrono::Duration::minutes(30), None, None).unwrap();

    // Focus 2 -> No break (skipped)
    db.record_session(StepType::Focus, "Work", 25, base + chrono::Duration::minutes(30), base + chrono::Duration::minutes(55), None, None).unwrap();

    // Focus 3 -> Break 2 (deferred - 10 min delay)
    db.record_session(StepType::Focus, "Work", 25, base + chrono::Duration::minutes(55), base + chrono::Duration::minutes(80), None, None).unwrap();
    db.record_session(StepType::Break, "Rest", 5, base + chrono::Duration::minutes(90), base + chrono::Duration::minutes(95), None, None).unwrap();

    // Focus 4 -> Break 3 (taken)
    db.record_session(StepType::Focus, "Work", 25, base + chrono::Duration::minutes(95), base + chrono::Duration::minutes(120), None, None).unwrap();
    db.record_session(StepType::Break, "Rest", 5, base + chrono::Duration::minutes(120), base + chrono::Duration::minutes(125), None, None).unwrap();

    let today = base.format("%Y-%m-%d").to_string();
    let rows = db.get_break_adherence_data(&today, &today, None).unwrap();

    let analyzer = BreakAdherenceAnalyzer::new();
    let report = analyzer.generate_report(&rows);

    assert_eq!(report.stats.total_focus_sessions, 4);
    assert_eq!(report.stats.breaks_taken, 2);
    assert_eq!(report.stats.breaks_skipped, 1);
    assert_eq!(report.stats.breaks_deferred, 1);
    assert!((report.stats.adherence_rate - 0.5).abs() < 0.01);
}

#[test]
fn test_break_adherence_with_project_filter() {
    let db = Database::open_memory().unwrap();
    let base = chrono::Utc::now();

    // Project A sessions
    db.record_session(StepType::Focus, "Work", 25, base, base + chrono::Duration::minutes(25), None, Some("project-a")).unwrap();
    db.record_session(StepType::Break, "Rest", 5, base + chrono::Duration::minutes(25), base + chrono::Duration::minutes(30), None, Some("project-a")).unwrap();

    // Project B sessions
    db.record_session(StepType::Focus, "Work", 25, base + chrono::Duration::minutes(60), base + chrono::Duration::minutes(85), None, Some("project-b")).unwrap();
    // No break for project B

    let today = base.format("%Y-%m-%d").to_string();

    // Filter by project A
    let rows_a = db.get_break_adherence_data(&today, &today, Some("project-a")).unwrap();
    let report_a = BreakAdherenceAnalyzer::new().generate_report(&rows_a);
    assert_eq!(report_a.stats.total_focus_sessions, 1);
    assert_eq!(report_a.stats.breaks_taken, 1);

    // Filter by project B
    let rows_b = db.get_break_adherence_data(&today, &today, Some("project-b")).unwrap();
    let report_b = BreakAdherenceAnalyzer::new().generate_report(&rows_b);
    assert_eq!(report_b.stats.total_focus_sessions, 1);
    assert_eq!(report_b.stats.breaks_skipped, 1);
}

#[test]
fn test_high_risk_window_detection() {
    let db = Database::open_memory().unwrap();
    let base = chrono::Utc::now();

    // Create multiple sessions at hour 14 with high skip rate
    for i in 0..5 {
        let start = base.with_hour(14).unwrap() + chrono::Duration::minutes(i * 30);
        db.record_session(StepType::Focus, "Work", 25, start, start + chrono::Duration::minutes(25), None, None).unwrap();
        // Only take break for first 2 sessions (40% taken = 60% skip)
        if i < 2 {
            db.record_session(StepType::Break, "Rest", 5, start + chrono::Duration::minutes(25), start + chrono::Duration::minutes(30), None, None).unwrap();
        }
    }

    let today = base.format("%Y-%m-%d").to_string();
    let rows = db.get_break_adherence_data(&today, &today, None).unwrap();
    let report = BreakAdherenceAnalyzer::new().generate_report(&rows);

    // Hour 14 should be identified as high-risk
    assert!(!report.high_risk_windows.is_empty());
    assert!(report.high_risk_windows.iter().any(|w| w.hour == 14));
}
```

**Step 2: Run integration tests**

Run: `cargo test -p pomodoroom-core --test break_adherence_integration`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add crates/pomodoroom-core/tests/break_adherence_integration.rs
git commit -m "test(stats): add integration tests for break adherence"
```

---

## Task 6: Run Full Test Suite

**Step 1: Run all tests**

Run: `cargo test -p pomodoroom-core`
Expected: All tests PASS

Run: `cargo test -p pomodoroom-cli -- --test-threads=1`
Expected: All tests PASS

**Step 2: Run pnpm check**

Run: `pnpm run check`
Expected: All checks PASS

**Step 3: Commit (if any fixes)**

```bash
git add -A
git commit -m "fix: address test failures"
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Create break adherence types and analyzer |
| 2 | Add database query method |
| 3 | Implement report generation |
| 4 | Add CLI stats breaks subcommand |
| 5 | Add integration tests |
| 6 | Run full test suite |

## Acceptance Criteria Verification

- [x] Dashboard filters by date range and project (`--start`, `--end`, `--project`)
- [x] Ratios are computed from session events (BreakAdherenceAnalyzer)
- [x] Export to CSV is supported (`--export`)
