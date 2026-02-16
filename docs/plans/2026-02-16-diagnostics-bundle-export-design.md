# Diagnostics Bundle Export Design

> Issue #264

## Goal
Export reproducible diagnostics for bug reports and optimizer analysis.

## Design Approach

### Bundle Contents

The diagnostics bundle will be a JSON file containing:

1. **Metadata**
   - Bundle version
   - Creation timestamp
   - Hash for scenario identity
   - App version

2. **Config (redacted)**
   - ScheduleConfig
   - SchedulerConfig
   - Custom schedule (without sensitive data)
   - Redacted fields: API keys, tokens, personal paths

3. **Timeline (anonymized)**
   - Session records (focus/break)
   - Task IDs anonymized as `task-0`, `task-1`, etc.
   - Project IDs anonymized as `project-0`, `project-1`, etc.
   - Timestamps preserved for pattern analysis

4. **Event Log (recent)**
   - Last 100 scheduling events
   - Timer state transitions
   - Key decision points

### Data Model

```rust
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
    pub schedule_config: ScheduleConfig,
    pub scheduler_config: SchedulerConfig,
    pub redacted_fields: Vec<String>,
}

/// Anonymized timeline for privacy-safe sharing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnonymizedTimeline {
    pub sessions: Vec<AnonymizedSession>,
    pub date_range: (String, String),
}

/// Session with anonymized IDs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnonymizedSession {
    pub session_type: String,
    pub duration_min: u64,
    pub started_at: DateTime<Utc>,
    pub completed_at: DateTime<Utc>,
    pub task_id: Option<String>,  // Anonymized
    pub project_id: Option<String>,  // Anonymized
}

/// Key scheduling event for replay.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchedulingEvent {
    pub timestamp: DateTime<Utc>,
    pub event_type: String,
    pub details: serde_json::Value,
}
```

### CLI Commands

```bash
pomodoroom diagnostics export                    # Export to default location
pomodoroom diagnostics export --output bundle.json  # Custom output path
pomodoroom diagnostics export --full              # Include more events (1000)
pomodoroom diagnostics hash                       # Show bundle hash only
```

### Hash Generation

The bundle hash is computed from:
- Config (after redaction)
- Timeline (after anonymization)
- Event summary (not full events)

This allows linking bug reports to specific scenarios while maintaining privacy.

### Acceptance Criteria Mapping

| Criteria | Implementation |
|----------|---------------|
| Sensitive fields can be redacted | `RedactedConfig` with `redacted_fields` list |
| Bundle can replay key scheduling decisions | `SchedulingEvent` log |
| Bug reports can link to bundle hash | SHA-256 hash in bundle and CLI output |

## Implementation Plan

### Task 1: Add Diagnostics Types
- Create `crates/pomodoroom-core/src/diagnostics/mod.rs`
- Create `crates/pomodoroom-core/src/diagnostics/bundle.rs`
- Define `DiagnosticsBundle`, `RedactedConfig`, `AnonymizedTimeline`, `SchedulingEvent`

### Task 2: Add Config Redaction Logic
- Add `redact()` method to config types
- Identify and redact: API keys, tokens, file paths

### Task 3: Add Timeline Anonymization
- Add `anonymize()` method for sessions
- Create ID mapping: real -> anonymized

### Task 4: Add Bundle Generation
- Add `generate_diagnostics_bundle()` method
- Compute SHA-256 hash
- Add export to JSON file

### Task 5: Add CLI Diagnostics Command
- Add `diagnostics` subcommand with `export` action
- Add `--output` and `--full` flags

### Task 6: Add Integration Tests
- Test full bundle generation
- Verify redaction
- Verify anonymization
- Verify hash reproducibility
