# Policy Import/Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add policy import/export with semantic versioning compatibility checks to allow users to share and version their scheduling policies.

**Architecture:** Create a new `policy` module in pomodoroom-core with `PolicyBundle` struct containing version, metadata, and policy data. Add CLI `policy` subcommand with export/import actions. Version compatibility uses semantic versioning where Major mismatch rejects import with hints.

**Tech Stack:** Rust, serde (JSON), clap (CLI), chrono (timestamps)

---

## Task 1: Create Policy Module Structure

**Files:**
- Create: `crates/pomodoroom-core/src/policy/mod.rs`
- Create: `crates/pomodoroom-core/src/policy/bundle.rs`
- Modify: `crates/pomodoroom-core/src/lib.rs`

**Step 1: Write the failing test**

```rust
// crates/pomodoroom-core/src/policy/bundle.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_policy_bundle_serialization() {
        let bundle = PolicyBundle::default();
        let json = serde_json::to_string(&bundle).unwrap();
        assert!(json.contains("\"version\""));
    }
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p pomodoroom-core policy::bundle::tests::test_policy_bundle_serialization`
Expected: FAIL (module not found)

**Step 3: Create module files**

Create `crates/pomodoroom-core/src/policy/mod.rs`:
```rust
mod bundle;

pub use bundle::{PolicyBundle, PolicyData, PolicyMetadata};
```

Create `crates/pomodoroom-core/src/policy/bundle.rs`:
```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::timer::Schedule;

/// Current policy schema version.
pub const POLICY_VERSION: &str = "1.0.0";

/// Human-readable metadata for a policy bundle.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyMetadata {
    /// Name of this policy preset.
    pub name: String,
    /// Author email or identifier.
    #[serde(default)]
    pub author: Option<String>,
    /// Intended use case or scenario.
    #[serde(default)]
    pub intent: Option<String>,
    /// Additional notes or description.
    #[serde(default)]
    pub notes: Option<String>,
    /// When this bundle was created.
    pub created_at: DateTime<Utc>,
}

impl Default for PolicyMetadata {
    fn default() -> Self {
        Self {
            name: "Unnamed Policy".to_string(),
            author: None,
            intent: None,
            notes: None,
            created_at: Utc::now(),
        }
    }
}

/// The actual policy data extracted from Config.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyData {
    /// Focus duration in minutes.
    pub focus_duration: u32,
    /// Short break duration in minutes.
    pub short_break: u32,
    /// Long break duration in minutes.
    pub long_break: u32,
    /// Number of pomodoros before long break.
    pub pomodoros_before_long_break: u32,
    /// Break placement policy for parallel lanes.
    pub parallel_break_policy: String,
    /// Custom schedule steps (if any).
    #[serde(default)]
    pub custom_schedule: Option<Schedule>,
}

impl Default for PolicyData {
    fn default() -> Self {
        Self {
            focus_duration: 25,
            short_break: 5,
            long_break: 15,
            pomodoros_before_long_break: 4,
            parallel_break_policy: "shared".to_string(),
            custom_schedule: None,
        }
    }
}

/// Complete policy bundle ready for export/import.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyBundle {
    /// Semantic version of the policy schema.
    pub version: String,
    /// Human-readable metadata.
    pub metadata: PolicyMetadata,
    /// The actual policy settings.
    pub policy: PolicyData,
}

impl Default for PolicyBundle {
    fn default() -> Self {
        Self {
            version: POLICY_VERSION.to_string(),
            metadata: PolicyMetadata::default(),
            policy: PolicyData::default(),
        }
    }
}

impl PolicyBundle {
    /// Create a new bundle from the current config.
    pub fn from_config(config: &crate::storage::Config) -> Self {
        Self {
            version: POLICY_VERSION.to_string(),
            metadata: PolicyMetadata::default(),
            policy: PolicyData {
                focus_duration: config.schedule.focus_duration,
                short_break: config.schedule.short_break,
                long_break: config.schedule.long_break,
                pomodoros_before_long_break: config.schedule.pomodoros_before_long_break,
                parallel_break_policy: "shared".to_string(), // Default, could be extended
                custom_schedule: config.custom_schedule.clone(),
            },
        }
    }

    /// Export to JSON string.
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }

    /// Import from JSON string.
    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_policy_bundle_serialization() {
        let bundle = PolicyBundle::default();
        let json = serde_json::to_string(&bundle).unwrap();
        assert!(json.contains("\"version\""));
    }

    #[test]
    fn test_policy_bundle_roundtrip() {
        let original = PolicyBundle {
            version: "1.0.0".to_string(),
            metadata: PolicyMetadata {
                name: "Test Policy".to_string(),
                author: Some("test@example.com".to_string()),
                intent: Some("Deep work".to_string()),
                notes: None,
                created_at: Utc::now(),
            },
            policy: PolicyData::default(),
        };

        let json = original.to_json().unwrap();
        let parsed = PolicyBundle::from_json(&json).unwrap();

        assert_eq!(parsed.version, original.version);
        assert_eq!(parsed.metadata.name, original.metadata.name);
        assert_eq!(parsed.policy.focus_duration, original.policy.focus_duration);
    }

    #[test]
    fn test_policy_data_defaults() {
        let data = PolicyData::default();
        assert_eq!(data.focus_duration, 25);
        assert_eq!(data.short_break, 5);
        assert_eq!(data.long_break, 15);
        assert_eq!(data.pomodoros_before_long_break, 4);
    }
}
```

**Step 4: Update lib.rs to export policy module**

Modify `crates/pomodoroom-core/src/lib.rs`, add after line 33:
```rust
pub mod policy;
```

Add to exports (after line 45):
```rust
pub use policy::{PolicyBundle, PolicyData, PolicyMetadata, POLICY_VERSION};
```

**Step 5: Run tests to verify they pass**

Run: `cargo test -p pomodoroom-core policy`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add crates/pomodoroom-core/src/policy/ crates/pomodoroom-core/src/lib.rs
git commit -m "feat(policy): add PolicyBundle struct with JSON serialization"
```

---

## Task 2: Add Version Compatibility Checker

**Files:**
- Create: `crates/pomodoroom-core/src/policy/compat.rs`
- Modify: `crates/pomodoroom-core/src/policy/mod.rs`

**Step 1: Write the failing test**

```rust
// In crates/pomodoroom-core/src/policy/compat.rs tests
#[test]
fn test_major_mismatch_is_incompatible() {
    let result = check_compatibility("2.0.0", "1.0.0");
    assert!(matches!(result, Compatibility::Incompatible(_)));
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p pomodoroom-core policy::compat`
Expected: FAIL (module not found)

**Step 3: Create compat.rs**

Create `crates/pomodoroom-core/src/policy/compat.rs`:
```rust
use std::fmt;

/// Result of version compatibility check.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Compatibility {
    /// Versions are fully compatible.
    Compatible,
    /// Minor version newer, may have unknown fields but safe to import.
    MinorNewer { current: String, import: String },
    /// Incompatible major version, import rejected.
    Incompatible { current: String, import: String, hints: Vec<String> },
}

impl fmt::Display for Compatibility {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Compatibility::Compatible => write!(f, "Compatible"),
            Compatibility::MinorNewer { current, import } => {
                write!(f, "Warning: import version {} is newer than current {}", import, current)
            }
            Compatibility::Incompatible { current, import, hints } => {
                write!(f, "Error: incompatible version {} (expected {})\n\nMigration hints:\n", import, current)?;
                for hint in hints {
                    writeln!(f, "  - {}", hint)?;
                }
                Ok(())
            }
        }
    }
}

/// Parse a semver string into (major, minor, patch).
fn parse_version(version: &str) -> Option<(u32, u32, u32)> {
    let parts: Vec<&str> = version.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    let major = parts[0].parse().ok()?;
    let minor = parts[1].parse().ok()?;
    let patch = parts[2].parse().ok()?;
    Some((major, minor, patch))
}

/// Check compatibility between current and import versions.
pub fn check_compatibility(current: &str, import: &str) -> Compatibility {
    let current_parts = match parse_version(current) {
        Some(p) => p,
        None => return Compatibility::Incompatible {
            current: current.to_string(),
            import: import.to_string(),
            hints: vec!["Invalid current version format".to_string()],
        },
    };

    let import_parts = match parse_version(import) {
        Some(p) => p,
        None => return Compatibility::Incompatible {
            current: current.to_string(),
            import: import.to_string(),
            hints: vec!["Invalid import version format".to_string()],
        },
    };

    // Major version mismatch = incompatible
    if import_parts.0 != current_parts.0 {
        return Compatibility::Incompatible {
            current: current.to_string(),
            import: import.to_string(),
            hints: generate_migration_hints(current_parts.0, import_parts.0),
        };
    }

    // Minor version newer = warn but proceed
    if import_parts.1 > current_parts.1 {
        return Compatibility::MinorNewer {
            current: current.to_string(),
            import: import.to_string(),
        };
    }

    // Same major, same or older minor = compatible
    Compatibility::Compatible
}

/// Generate human-readable migration hints for major version changes.
fn generate_migration_hints(current_major: u32, import_major: u32) -> Vec<String> {
    // These hints would be updated when breaking changes are introduced
    vec![
        format!("Policy format changed in version {}", import_major),
        "Please update your application or use a compatible policy file".to_string(),
        "Export your current policy to see the expected format".to_string(),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_version_valid() {
        assert_eq!(parse_version("1.2.3"), Some((1, 2, 3)));
        assert_eq!(parse_version("0.0.0"), Some((0, 0, 0)));
        assert_eq!(parse_version("10.20.30"), Some((10, 20, 30)));
    }

    #[test]
    fn test_parse_version_invalid() {
        assert_eq!(parse_version("1.2"), None);
        assert_eq!(parse_version("1.2.3.4"), None);
        assert_eq!(parse_version("abc"), None);
        assert_eq!(parse_version(""), None);
    }

    #[test]
    fn test_major_mismatch_is_incompatible() {
        let result = check_compatibility("1.0.0", "2.0.0");
        assert!(matches!(result, Compatibility::Incompatible { .. }));

        let result = check_compatibility("2.0.0", "1.0.0");
        assert!(matches!(result, Compatibility::Incompatible { .. }));
    }

    #[test]
    fn test_same_version_is_compatible() {
        let result = check_compatibility("1.0.0", "1.0.0");
        assert_eq!(result, Compatibility::Compatible);
    }

    #[test]
    fn test_minor_newer_is_minor_newer() {
        let result = check_compatibility("1.0.0", "1.1.0");
        assert_eq!(result, Compatibility::MinorNewer {
            current: "1.0.0".to_string(),
            import: "1.1.0".to_string(),
        });
    }

    #[test]
    fn test_minor_older_is_compatible() {
        let result = check_compatibility("1.2.0", "1.0.0");
        assert_eq!(result, Compatibility::Compatible);
    }

    #[test]
    fn test_patch_difference_is_compatible() {
        let result = check_compatibility("1.0.0", "1.0.5");
        assert_eq!(result, Compatibility::Compatible);

        let result = check_compatibility("1.0.5", "1.0.0");
        assert_eq!(result, Compatibility::Compatible);
    }

    #[test]
    fn test_incompatible_display_includes_hints() {
        let result = check_compatibility("1.0.0", "2.0.0");
        let display = format!("{}", result);
        assert!(display.contains("incompatible"));
        assert!(display.contains("Migration hints"));
    }
}
```

**Step 4: Update mod.rs to export compat**

Modify `crates/pomodoroom-core/src/policy/mod.rs`:
```rust
mod bundle;
mod compat;

pub use bundle::{PolicyBundle, PolicyData, PolicyMetadata, POLICY_VERSION};
pub use compat::{check_compatibility, Compatibility};
```

**Step 5: Run tests to verify they pass**

Run: `cargo test -p pomodoroom-core policy`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add crates/pomodoroom-core/src/policy/
git commit -m "feat(policy): add version compatibility checker with migration hints"
```

---

## Task 3: Add Policy Export/Import Methods

**Files:**
- Modify: `crates/pomodoroom-core/src/policy/bundle.rs`

**Step 1: Write the failing test**

```rust
// Add to tests in bundle.rs
#[test]
fn test_apply_to_config() {
    let bundle = PolicyBundle {
        version: "1.0.0".to_string(),
        metadata: PolicyMetadata::default(),
        policy: PolicyData {
            focus_duration: 50,
            short_break: 10,
            long_break: 30,
            pomodoros_before_long_break: 2,
            parallel_break_policy: "shared".to_string(),
            custom_schedule: None,
        },
    };

    let mut config = Config::default();
    bundle.apply_to_config(&mut config);

    assert_eq!(config.schedule.focus_duration, 50);
    assert_eq!(config.schedule.short_break, 10);
    assert_eq!(config.schedule.long_break, 30);
    assert_eq!(config.schedule.pomodoros_before_long_break, 2);
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p pomodoroom-core policy::bundle::tests::test_apply_to_config`
Expected: FAIL (method not found)

**Step 3: Add apply_to_config method**

Add to `impl PolicyBundle` in `bundle.rs`:
```rust
    /// Apply this policy to a config, overwriting schedule settings.
    pub fn apply_to_config(&self, config: &mut crate::storage::Config) {
        config.schedule.focus_duration = self.policy.focus_duration;
        config.schedule.short_break = self.policy.short_break;
        config.schedule.long_break = self.policy.long_break;
        config.schedule.pomodoros_before_long_break = self.policy.pomodoros_before_long_break;
        config.custom_schedule = self.policy.custom_schedule.clone();
    }
```

Add import at top of bundle.rs:
```rust
use crate::storage::Config;
```

**Step 4: Run tests to verify they pass**

Run: `cargo test -p pomodoroom-core policy`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add crates/pomodoroom-core/src/policy/bundle.rs
git commit -m "feat(policy): add apply_to_config method for policy import"
```

---

## Task 4: Add CLI Policy Subcommand

**Files:**
- Create: `crates/pomodoroom-cli/src/commands/policy.rs`
- Modify: `crates/pomodoroom-cli/src/commands/mod.rs`
- Modify: `crates/pomodoroom-cli/src/main.rs`

**Step 1: Write the command structure**

Create `crates/pomodoroom-cli/src/commands/policy.rs`:
```rust
use clap::Subcommand;
use pomodoroom_core::{check_compatibility, Compatibility, Config, PolicyBundle, PolicyMetadata, POLICY_VERSION};
use std::fs;
use std::path::PathBuf;

#[derive(Subcommand)]
pub enum PolicyAction {
    /// Export current policy to a JSON file
    Export {
        /// Output file path (prints to stdout if not specified)
        #[arg(short, long)]
        output: Option<PathBuf>,
        /// Policy name
        #[arg(long)]
        name: Option<String>,
        /// Author identifier
        #[arg(long)]
        author: Option<String>,
        /// Intended use case
        #[arg(long)]
        intent: Option<String>,
        /// Additional notes
        #[arg(long)]
        notes: Option<String>,
    },
    /// Import policy from a JSON file
    Import {
        /// Input file path
        file: PathBuf,
        /// Validate without applying changes
        #[arg(long)]
        dry_run: bool,
        /// Skip compatibility checks
        #[arg(long)]
        force: bool,
    },
    /// Show current policy schema version
    Version,
}

pub fn run(action: PolicyAction) -> Result<(), Box<dyn std::error::Error>> {
    match action {
        PolicyAction::Export { output, name, author, intent, notes } => {
            export_policy(output, name, author, intent, notes)
        }
        PolicyAction::Import { file, dry_run, force } => {
            import_policy(file, dry_run, force)
        }
        PolicyAction::Version => {
            println!("Policy schema version: {}", POLICY_VERSION);
            Ok(())
        }
    }
}

fn export_policy(
    output: Option<PathBuf>,
    name: Option<String>,
    author: Option<String>,
    intent: Option<String>,
    notes: Option<String>,
) -> Result<(), Box<dyn std::error::Error>> {
    let config = Config::load_or_default();
    let mut bundle = PolicyBundle::from_config(&config);

    // Override metadata if provided
    if let Some(n) = name {
        bundle.metadata.name = n;
    }
    if let Some(a) = author {
        bundle.metadata.author = Some(a);
    }
    if let Some(i) = intent {
        bundle.metadata.intent = Some(i);
    }
    if let Some(n) = notes {
        bundle.metadata.notes = Some(n);
    }

    let json = bundle.to_json()?;

    match output {
        Some(path) => {
            fs::write(&path, &json)?;
            println!("Policy exported to: {}", path.display());
        }
        None => {
            println!("{}", json);
        }
    }

    Ok(())
}

fn import_policy(
    file: PathBuf,
    dry_run: bool,
    force: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let json = fs::read_to_string(&file)?;
    let bundle = PolicyBundle::from_json(&json)?;

    // Check compatibility
    let compat = check_compatibility(POLICY_VERSION, &bundle.version);

    match &compat {
        Compatibility::Compatible => {}
        Compatibility::MinorNewer { import, .. } => {
            eprintln!("Warning: importing newer policy format ({})", import);
        }
        Compatibility::Incompatible { .. } if !force => {
            eprintln!("{}", compat);
            eprintln!("\nUse --force to import anyway (may cause errors)");
            return Err("Incompatible policy version".into());
        }
        Compatibility::Incompatible { .. } => {
            eprintln!("Warning: forcing import of incompatible policy");
            eprintln!("{}", compat);
        }
    }

    if dry_run {
        println!("Dry run - policy validated but not applied:");
        println!("  Name: {}", bundle.metadata.name);
        println!("  Version: {}", bundle.version);
        println!("  Focus: {}min, Short break: {}min, Long break: {}min",
            bundle.policy.focus_duration,
            bundle.policy.short_break,
            bundle.policy.long_break);
        println!("  Pomodoros before long break: {}", bundle.policy.pomodoros_before_long_break);
        return Ok(());
    }

    // Apply to config
    let mut config = Config::load_or_default();
    bundle.apply_to_config(&mut config);
    config.save()?;

    println!("Policy imported: {}", bundle.metadata.name);
    Ok(())
}
```

**Step 2: Update commands/mod.rs**

Add to `crates/pomodoroom-cli/src/commands/mod.rs`:
```rust
pub mod policy;
```

**Step 3: Update main.rs**

Add `Policy` variant to `Commands` enum in `main.rs` (after `Sync`):
```rust
    /// Policy import/export
    Policy {
        #[command(subcommand)]
        action: commands::policy::PolicyAction,
    },
```

Add match arm in `main()` function:
```rust
        Commands::Policy { action } => commands::policy::run(action),
```

**Step 4: Build and test CLI**

Run: `cargo build -p pomodoroom-cli`
Expected: BUILD SUCCESS

Run: `cargo run -p pomodoroom-cli -- policy version`
Expected: "Policy schema version: 1.0.0"

**Step 5: Commit**

```bash
git add crates/pomodoroom-cli/src/
git commit -m "feat(cli): add policy export/import subcommands"
```

---

## Task 5: Add Integration Tests

**Files:**
- Create: `crates/pomodoroom-core/tests/policy_integration.rs`

**Step 1: Write integration test**

Create `crates/pomodoroom-core/tests/policy_integration.rs`:
```rust
use pomodoroom_core::{check_compatibility, Compatibility, Config, PolicyBundle, PolicyData, PolicyMetadata, POLICY_VERSION};

#[test]
fn test_export_import_roundtrip() {
    // Create a config with custom settings
    let mut config = Config::default();
    config.schedule.focus_duration = 45;
    config.schedule.short_break = 10;
    config.schedule.long_break = 20;
    config.schedule.pomodoros_before_long_break = 3;

    // Export to bundle
    let bundle = PolicyBundle::from_config(&config);
    let json = bundle.to_json().unwrap();

    // Import back
    let imported = PolicyBundle::from_json(&json).unwrap();

    // Verify
    assert_eq!(imported.policy.focus_duration, 45);
    assert_eq!(imported.policy.short_break, 10);
    assert_eq!(imported.policy.long_break, 20);
    assert_eq!(imported.policy.pomodoros_before_long_break, 3);
}

#[test]
fn test_import_rejects_incompatible_version() {
    let json = r#"{
        "version": "2.0.0",
        "metadata": {
            "name": "Future Policy",
            "created_at": "2026-01-01T00:00:00Z"
        },
        "policy": {
            "focus_duration": 25,
            "short_break": 5,
            "long_break": 15,
            "pomodoros_before_long_break": 4,
            "parallel_break_policy": "shared",
            "custom_schedule": null
        }
    }"#;

    let bundle = PolicyBundle::from_json(json).unwrap();
    let compat = check_compatibility(POLICY_VERSION, &bundle.version);

    assert!(matches!(compat, Compatibility::Incompatible { .. }));
}

#[test]
fn test_import_accepts_minor_newer() {
    let json = r#"{
        "version": "1.5.0",
        "metadata": {
            "name": "Newer Minor",
            "created_at": "2026-01-01T00:00:00Z"
        },
        "policy": {
            "focus_duration": 25,
            "short_break": 5,
            "long_break": 15,
            "pomodoros_before_long_break": 4,
            "parallel_break_policy": "shared",
            "custom_schedule": null
        }
    }"#;

    let bundle = PolicyBundle::from_json(json).unwrap();
    let compat = check_compatibility(POLICY_VERSION, &bundle.version);

    assert!(matches!(compat, Compatibility::MinorNewer { .. }));
}

#[test]
fn test_apply_overwrites_config() {
    let bundle = PolicyBundle {
        version: "1.0.0".to_string(),
        metadata: PolicyMetadata::default(),
        policy: PolicyData {
            focus_duration: 60,
            short_break: 15,
            long_break: 30,
            pomodoros_before_long_break: 2,
            parallel_break_policy: "shared".to_string(),
            custom_schedule: None,
        },
    };

    let mut config = Config::default();
    let original_focus = config.schedule.focus_duration;
    assert_ne!(original_focus, 60);

    bundle.apply_to_config(&mut config);
    assert_eq!(config.schedule.focus_duration, 60);
}
```

**Step 2: Run integration tests**

Run: `cargo test -p pomodoroom-core --test policy_integration`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add crates/pomodoroom-core/tests/policy_integration.rs
git commit -m "test(policy): add integration tests for export/import roundtrip"
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

**Step 3: Commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address test failures"
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Create PolicyBundle struct with JSON serialization |
| 2 | Add version compatibility checker |
| 3 | Add apply_to_config method |
| 4 | Add CLI policy subcommand |
| 5 | Add integration tests |
| 6 | Run full test suite |

## Acceptance Criteria Verification

- [x] Import rejects incompatible versions safely (Task 2, 5)
- [x] Export includes complete policy context (Task 1, 3)
- [x] Migration hints are human-readable (Task 2)
