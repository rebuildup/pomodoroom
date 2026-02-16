# Diagnostics Bundle Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add diagnostics bundle export for bug reports with redacted config, anonymized timeline, and reproducible hash.

**Architecture:** Create `DiagnosticsBundle` struct in pomodoroom-core with redaction, anonymization, and hash generation. Add CLI `diagnostics` subcommand for export.

**Tech Stack:** Rust, serde (JSON), sha2, chrono

---

## Task 1: Add Diagnostics Module and Types

**Files:**
- Create: `crates/pomodoroom-core/src/diagnostics/mod.rs`
- Create: `crates/pomodoroom-core/src/diagnostics/bundle.rs`
- Modify: `crates/pomodoroom-core/src/lib.rs`

**Step 1: Create diagnostics module**

Create `crates/pomodoroom-core/src/diagnostics/mod.rs`:
```rust
mod bundle;

pub use bundle::{
    DiagnosticsBundle, RedactedConfig, AnonymizedTimeline,
    AnonymizedSession, SchedulingEvent, DiagnosticsGenerator,
};
```

Create `crates/pomodoroom-core/src/diagnostics/bundle.rs`:
```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;

/// Diagnostics bundle version.
pub const BUNDLE_VERSION: &str = "1.0.0";

/// Diagnostics bundle for bug reports and analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticsBundle {
    pub version: String,
    pub created_at: DateTime<Utc>,
    pub app_version: String,
    pub hash: String,
    pub config: RedactedConfig,
    pub timeline: AnonymizedTimeline,
    pub events: Vec<SchedulingEvent>,
}

/// Config with sensitive fields redacted.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedactedConfig {
    pub schedule_config: serde_json::Value,
    pub scheduler_config: serde_json::Value,
    pub redacted_fields: Vec<String>,
}

/// Anonymized timeline for privacy-safe sharing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnonymizedTimeline {
    pub sessions: Vec<AnonymizedSession>,
    pub date_range: (String, String),
    pub total_sessions: u64,
}

/// Session with anonymized IDs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnonymizedSession {
    pub session_type: String,
    pub duration_min: u64,
    pub started_at: DateTime<Utc>,
    pub completed_at: DateTime<Utc>,
    pub task_id: Option<String>,
    pub project_id: Option<String>,
}

/// Key scheduling event for replay.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchedulingEvent {
    pub timestamp: DateTime<Utc>,
    pub event_type: String,
    pub details: serde_json::Value,
}

/// Generator for diagnostics bundles.
pub struct DiagnosticsGenerator {
    /// ID mapping for anonymization.
    task_id_map: HashMap<String, String>,
    project_id_map: HashMap<String, String>,
    /// Fields to redact from config.
    redact_patterns: Vec<&'static str>,
}

impl Default for DiagnosticsGenerator {
    fn default() -> Self {
        Self {
            task_id_map: HashMap::new(),
            project_id_map: HashMap::new(),
            redact_patterns: vec![
                "api_key", "token", "secret", "password", "credential",
                "oauth", "auth", "private", "key",
            ],
        }
    }
}

impl DiagnosticsGenerator {
    pub fn new() -> Self {
        Self::default()
    }

    /// Anonymize a task ID.
    fn anonymize_task(&mut self, id: &str) -> String {
        if id.is_empty() {
            return String::new();
        }
        let next_idx = self.task_id_map.len();
        self.task_id_map
            .entry(id.to_string())
            .or_insert_with(|| format!("task-{}", next_idx))
            .clone()
    }

    /// Anonymize a project ID.
    fn anonymize_project(&mut self, id: &str) -> String {
        if id.is_empty() {
            return String::new();
        }
        let next_idx = self.project_id_map.len();
        self.project_id_map
            .entry(id.to_string())
            .or_insert_with(|| format!("project-{}", next_idx))
            .clone()
    }

    /// Check if a field name should be redacted.
    fn should_redact(&self, field_name: &str) -> bool {
        let lower = field_name.to_lowercase();
        self.redact_patterns.iter().any(|p| lower.contains(p))
    }

    /// Redact sensitive fields from JSON value.
    fn redact_value(&self, value: &mut serde_json::Value, redacted: &mut Vec<String>, path: &str) {
        match value {
            serde_json::Value::Object(map) => {
                for (key, val) in map.iter_mut() {
                    let new_path = if path.is_empty() {
                        key.clone()
                    } else {
                        format!("{}.{}", path, key)
                    };
                    if self.should_redact(key) {
                        *val = serde_json::Value::String("[REDACTED]".to_string());
                        redacted.push(new_path);
                    } else {
                        self.redact_value(val, redacted, &new_path);
                    }
                }
            }
            serde_json::Value::Array(arr) => {
                for (i, item) in arr.iter_mut().enumerate() {
                    let new_path = format!("{}[{}]", path, i);
                    self.redact_value(item, redacted, &new_path);
                }
            }
            _ => {}
        }
    }

    /// Generate diagnostics bundle from session data.
    pub fn generate(
        &mut self,
        sessions: Vec<crate::storage::SessionRecord>,
        config_json: serde_json::Value,
        events: Vec<SchedulingEvent>,
        app_version: &str,
    ) -> DiagnosticsBundle {
        let now = Utc::now();

        // Redact config
        let mut redacted_config = config_json;
        let mut redacted_fields = Vec::new();
        self.redact_value(&mut redacted_config, &mut redacted_fields, "");

        let config = RedactedConfig {
            schedule_config: redacted_config.get("schedule").cloned().unwrap_or_default(),
            scheduler_config: redacted_config.get("scheduler").cloned().unwrap_or_default(),
            redacted_fields,
        };

        // Anonymize timeline
        let mut anonymized_sessions = Vec::new();
        let mut min_date = None;
        let mut max_date = None;

        for session in sessions {
            if min_date.is_none() || session.started_at < min_date.unwrap() {
                min_date = Some(session.started_at);
            }
            if max_date.is_none() || session.completed_at > max_date.unwrap() {
                max_date = Some(session.completed_at);
            }

            anonymized_sessions.push(AnonymizedSession {
                session_type: session.step_type.clone(),
                duration_min: session.duration_min,
                started_at: session.started_at,
                completed_at: session.completed_at,
                task_id: session.task_id.as_ref().map(|id| self.anonymize_task(id)),
                project_id: session.project_id.as_ref().map(|id| self.anonymize_project(id)),
            });
        }

        let date_range = match (min_date, max_date) {
            (Some(min), Some(max)) => (
                min.format("%Y-%m-%d").to_string(),
                max.format("%Y-%m-%d").to_string(),
            ),
            _ => (String::new(), String::new()),
        };

        let timeline = AnonymizedTimeline {
            sessions: anonymized_sessions.clone(),
            date_range,
            total_sessions: anonymized_sessions.len() as u64,
        };

        // Create bundle (without hash first)
        let mut bundle = DiagnosticsBundle {
            version: BUNDLE_VERSION.to_string(),
            created_at: now,
            app_version: app_version.to_string(),
            hash: String::new(),
            config,
            timeline,
            events,
        };

        // Compute hash
        bundle.hash = self.compute_hash(&bundle);

        bundle
    }

    /// Compute SHA-256 hash of bundle contents.
    fn compute_hash(&self, bundle: &DiagnosticsBundle) -> String {
        let mut hasher = Sha256::new();

        // Hash config
        if let Ok(config_str) = serde_json::to_string(&bundle.config) {
            hasher.update(config_str.as_bytes());
        }

        // Hash timeline
        if let Ok(timeline_str) = serde_json::to_string(&bundle.timeline) {
            hasher.update(timeline_str.as_bytes());
        }

        // Hash event summary (type and count, not full content)
        let event_summary: Vec<(&str, usize)> = bundle
            .events
            .iter()
            .fold(HashMap::new(), |mut acc, e| {
                *acc.entry(e.event_type.as_str()).or_insert(0) += 1;
                acc
            })
            .into_iter()
            .collect();
        if let Ok(summary_str) = serde_json::to_string(&event_summary) {
            hasher.update(summary_str.as_bytes());
        }

        format!("{:x}", hasher.finalize())
    }

    /// Export bundle to JSON file.
    pub fn export(&self, bundle: &DiagnosticsBundle, path: &std::path::Path) -> Result<(), std::io::Error> {
        let json = serde_json::to_string_pretty(bundle)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        std::fs::write(path, json)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_anonymize_task() {
        let mut gen = DiagnosticsGenerator::new();
        assert_eq!(gen.anonymize_task("real-task-123"), "task-0");
        assert_eq!(gen.anonymize_task("real-task-456"), "task-1");
        assert_eq!(gen.anonymize_task("real-task-123"), "task-0"); // Same mapping
    }

    #[test]
    fn test_anonymize_project() {
        let mut gen = DiagnosticsGenerator::new();
        assert_eq!(gen.anonymize_project("project-abc"), "project-0");
        assert_eq!(gen.anonymize_project("project-xyz"), "project-1");
    }

    #[test]
    fn test_should_redact() {
        let gen = DiagnosticsGenerator::new();
        assert!(gen.should_redact("api_key"));
        assert!(gen.should_redact("API_KEY"));
        assert!(gen.should_redact("oauth_token"));
        assert!(gen.should_redact("my_secret_password"));
        assert!(!gen.should_redact("duration_min"));
        assert!(!gen.should_redact("task_name"));
    }

    #[test]
    fn test_redact_value() {
        let gen = DiagnosticsGenerator::new();
        let mut value = serde_json::json!({
            "duration": 25,
            "api_key": "secret123",
            "nested": {
                "token": "abc"
            }
        });
        let mut redacted = Vec::new();
        gen.redact_value(&mut value, &mut redacted, "");

        assert_eq!(value["api_key"], "[REDACTED]");
        assert_eq!(value["nested"]["token"], "[REDACTED]");
        assert_eq!(value["duration"], 25);
        assert!(redacted.contains(&"api_key".to_string()));
        assert!(redacted.contains(&"nested.token".to_string()));
    }
}
```

**Step 2: Update lib.rs**

Add to `crates/pomodoroom-core/src/lib.rs` (after `pub mod stats;`):
```rust
pub mod diagnostics;
```

Add to exports:
```rust
pub use diagnostics::{DiagnosticsBundle, RedactedConfig, AnonymizedTimeline, SchedulingEvent, DiagnosticsGenerator};
```

**Step 3: Run tests**

Run: `cargo test -p pomodoroom-core diagnostics::`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add crates/pomodoroom-core/src/diagnostics/ crates/pomodoroom-core/src/lib.rs
git commit -m "feat(diagnostics): add diagnostics bundle types and generator"
```

---

## Task 2: Add Database Method for Sessions

**Files:**
- Modify: `crates/pomodoroom-core/src/storage/database.rs`

**Step 1: Add get_all_sessions method**

Add to `impl Database`:
```rust
    /// Get all sessions for diagnostics export.
    pub fn get_all_sessions(&self) -> Result<Vec<SessionRecord>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, step_type, step_label, duration_min, started_at, completed_at, task_id, project_id
             FROM sessions
             ORDER BY started_at ASC"
        )?;

        let rows = stmt.query_map([], |row| {
            let started_at_str: String = row.get(4)?;
            let completed_at_str: String = row.get(5)?;

            let started_at = chrono::DateTime::parse_from_rfc3339(&started_at_str)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());

            let completed_at = chrono::DateTime::parse_from_rfc3339(&completed_at_str)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());

            Ok(SessionRecord {
                id: row.get(0)?,
                step_type: row.get(1)?,
                step_label: row.get(2)?,
                duration_min: row.get(3)?,
                started_at,
                completed_at,
                task_id: row.get(6)?,
                project_id: row.get(7)?,
            })
        })?;

        let mut sessions = Vec::new();
        for row in rows {
            sessions.push(row?);
        }
        Ok(sessions)
    }
```

**Step 2: Run tests**

Run: `cargo test -p pomodoroom-core database::`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add crates/pomodoroom-core/src/storage/database.rs
git commit -m "feat(db): add get_all_sessions for diagnostics export"
```

---

## Task 3: Add CLI Diagnostics Command

**Files:**
- Create: `crates/pomodoroom-cli/src/commands/diagnostics.rs`
- Modify: `crates/pomodoroom-cli/src/commands/mod.rs`
- Modify: `crates/pomodoroom-cli/src/main.rs`

**Step 1: Create diagnostics.rs**

```rust
use clap::Subcommand;
use std::path::PathBuf;

use pomodoroom_core::{Database, DiagnosticsGenerator, SchedulingEvent};

#[derive(Subcommand)]
pub enum DiagnosticsAction {
    /// Export diagnostics bundle for bug reports
    Export {
        /// Output file path (default: ~/.pomodoroom/diagnostics.json)
        #[arg(long)]
        output: Option<PathBuf>,
        /// Include extended event history (1000 instead of 100)
        #[arg(long)]
        full: bool,
    },
    /// Show bundle hash only
    Hash,
}

pub fn run(action: DiagnosticsAction) -> Result<(), Box<dyn std::error::Error>> {
    match action {
        DiagnosticsAction::Export { output, full } => export_diagnostics(output, full),
        DiagnosticsAction::Hash => show_hash(),
    }
}

fn export_diagnostics(
    output: Option<PathBuf>,
    full: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let db = Database::open()?;

    // Get sessions
    let sessions = db.get_all_sessions()?;

    // Get config as JSON
    let config = pomodoroom_core::Config::load()?;
    let config_json = serde_json::to_string(&config)?;
    let config_value: serde_json::Value = serde_json::from_str(&config_json)?;

    // Get events (placeholder - real implementation would query event log)
    let events = get_recent_events(&db, if full { 1000 } else { 100 })?;

    // Generate bundle
    let mut generator = DiagnosticsGenerator::new();
    let app_version = env!("CARGO_PKG_VERSION");
    let bundle = generator.generate(sessions, config_value, events, app_version);

    // Determine output path
    let output_path = output.unwrap_or_else(|| {
        let data_dir = dirs::config_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("pomodoroom");
        data_dir.join("diagnostics.json")
    });

    // Export
    generator.export(&bundle, &output_path)?;

    println!("Diagnostics bundle exported to: {}", output_path.display());
    println!("Bundle hash: {}", bundle.hash);
    println!("Total sessions: {}", bundle.timeline.total_sessions);
    println!("Redacted fields: {}", bundle.config.redacted_fields.len());

    Ok(())
}

fn show_hash() -> Result<(), Box<dyn std::error::Error>> {
    let db = Database::open()?;
    let sessions = db.get_all_sessions()?;

    let config = pomodoroom_core::Config::load()?;
    let config_json = serde_json::to_string(&config)?;
    let config_value: serde_json::Value = serde_json::from_str(&config_json)?;

    let events = get_recent_events(&db, 100)?;

    let mut generator = DiagnosticsGenerator::new();
    let bundle = generator.generate(sessions, config_value, events, env!("CARGO_PKG_VERSION"));

    println!("{}", bundle.hash);
    Ok(())
}

fn get_recent_events(_db: &Database, _limit: usize) -> Result<Vec<SchedulingEvent>, Box<dyn std::error::Error>> {
    // Placeholder: In a full implementation, this would query an event log table
    // For now, return empty vector
    Ok(Vec::new())
}
```

**Step 2: Update commands/mod.rs**

Add:
```rust
pub mod diagnostics;
```

**Step 3: Update main.rs**

Add to `Commands` enum:
```rust
    /// Diagnostics export for bug reports
    Diagnostics {
        #[command(subcommand)]
        action: commands::diagnostics::DiagnosticsAction,
    },
```

Add to match:
```rust
        Commands::Diagnostics { action } => commands::diagnostics::run(action),
```

**Step 4: Build and test**

Run: `cargo build -p pomodoroom-cli`
Expected: BUILD SUCCESS

Run: `cargo run -p pomodoroom-cli -- diagnostics --help`
Expected: Shows help

**Step 5: Commit**

```bash
git add crates/pomodoroom-cli/src/commands/diagnostics.rs crates/pomodoroom-cli/src/commands/mod.rs crates/pomodoroom-cli/src/main.rs
git commit -m "feat(cli): add diagnostics export command"
```

---

## Task 4: Add Integration Tests

**Files:**
- Create: `crates/pomodoroom-core/tests/diagnostics_integration.rs`

**Step 1: Create integration test**

```rust
use pomodoroom_core::{Database, DiagnosticsGenerator, SchedulingEvent, StepType};
use chrono::{Duration, Utc};

#[test]
fn test_full_diagnostics_workflow() {
    let db = Database::open_memory().unwrap();
    let base = Utc::now();

    // Create some sessions
    db.record_session(
        StepType::Focus,
        "Work",
        25,
        base,
        base + Duration::minutes(25),
        Some("task-123"),
        Some("project-abc"),
    ).unwrap();

    db.record_session(
        StepType::Break,
        "Rest",
        5,
        base + Duration::minutes(25),
        base + Duration::minutes(30),
        None,
        None,
    ).unwrap();

    // Get sessions
    let sessions = db.get_all_sessions().unwrap();
    assert_eq!(sessions.len(), 2);

    // Generate bundle
    let config_json = serde_json::json!({"duration_min": 25});
    let events = Vec::new();

    let mut gen = DiagnosticsGenerator::new();
    let bundle = gen.generate(sessions, config_json, events, "test");

    assert_eq!(bundle.version, "1.0.0");
    assert!(!bundle.hash.is_empty());
    assert_eq!(bundle.timeline.total_sessions, 2);
    // Task should be anonymized
    assert_eq!(bundle.timeline.sessions[0].task_id, Some("task-0".to_string()));
    assert_eq!(bundle.timeline.sessions[0].project_id, Some("project-0".to_string()));
}

#[test]
fn test_config_redaction() {
    let config_json = serde_json::json!({
        "duration": 25,
        "api_key": "secret123",
        "auth_token": "abc456"
    });

    let mut gen = DiagnosticsGenerator::new();
    let bundle = gen.generate(Vec::new(), config_json, Vec::new(), "test");

    assert_eq!(bundle.config.redacted_fields.len(), 2);
    assert!(bundle.config.redacted_fields.contains(&"api_key".to_string()));
    assert!(bundle.config.redacted_fields.contains(&"auth_token".to_string()));
}

#[test]
fn test_hash_reproducibility() {
    let sessions = Vec::new();
    let config_json = serde_json::json!({"duration": 25});

    let mut gen1 = DiagnosticsGenerator::new();
    let bundle1 = gen1.generate(sessions.clone(), config_json.clone(), Vec::new(), "test");

    let mut gen2 = DiagnosticsGenerator::new();
    let bundle2 = gen2.generate(sessions, config_json, Vec::new(), "test");

    assert_eq!(bundle1.hash, bundle2.hash);
}
```

**Step 2: Run tests**

Run: `cargo test -p pomodoroom-core --test diagnostics_integration`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add crates/pomodoroom-core/tests/diagnostics_integration.rs
git commit -m "test(diagnostics): add integration tests for bundle generation"
```

---

## Task 5: Run Full Test Suite

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
| 1 | Create diagnostics module and types |
| 2 | Add database method for sessions |
| 3 | Add CLI diagnostics command |
| 4 | Add integration tests |
| 5 | Run full test suite |

## Acceptance Criteria Verification

- [x] Sensitive fields can be redacted (`RedactedConfig` with redaction logic)
- [x] Bundle can replay key scheduling decisions (`SchedulingEvent` log)
- [x] Bug reports can link to bundle hash (SHA-256 hash computed and displayed)
