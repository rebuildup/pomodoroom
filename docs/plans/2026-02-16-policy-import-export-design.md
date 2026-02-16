# Policy Import/Export with Compatibility Checks

## Overview

Allow users to share and version their scheduling policies through JSON export/import with semantic versioning compatibility checks.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | Full policy | Includes ScheduleConfig, SchedulerConfig, and custom_schedule |
| Format | JSON | Web API compatibility, TypeScript-friendly |
| Versioning | Semantic (Major.Minor.Patch) | Industry standard, clear compatibility rules |
| Migration | Hints only | Safer, user maintains control |

## Data Structure

### Export Format

```json
{
  "version": "1.0.0",
  "metadata": {
    "name": "My Custom Schedule",
    "author": "user@example.com",
    "intent": "Deep work focus with long breaks",
    "notes": "Best for creative work",
    "created_at": "2026-02-16T10:00:00Z"
  },
  "policy": {
    "focus_duration": 25,
    "short_break": 5,
    "long_break": 15,
    "pomodoros_before_long_break": 4,
    "parallel_break_policy": "shared",
    "custom_schedule": null
  }
}
```

### PolicyBundle Struct

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyBundle {
    pub version: String,           // Semantic version "1.0.0"
    pub metadata: PolicyMetadata,
    pub policy: PolicyData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyMetadata {
    pub name: String,
    pub author: Option<String>,
    pub intent: Option<String>,
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyData {
    pub focus_duration: u32,
    pub short_break: u32,
    pub long_break: u32,
    pub pomodoros_before_long_break: u32,
    pub parallel_break_policy: String,
    pub custom_schedule: Option<Schedule>,
}
```

## Compatibility Rules

### Version Comparison

```
Current Version: 1.2.3
Import Version:  X.Y.Z

Major (X) != 1  → REJECT (incompatible)
Minor (Y) > 2   → WARN (newer format, may have unknown fields)
Patch (Z)       → IGNORE (compatible)
```

### Import Results

| Scenario | Action |
|----------|--------|
| Major mismatch | Reject with migration hints |
| Minor newer | Warn but proceed |
| Minor older or equal | Proceed silently |

### Error Messages

```
Error: Incompatible policy version 2.0.0 (expected 1.x)

Migration hints:
  - Version 2.0 uses 'break_duration' instead of 'short_break'/'long_break'
  - Recurring schedules are not supported in this version

Please update your application or use a compatible policy file.
```

## CLI Commands

### Export

```bash
# Export current policy to stdout
pomodoroom policy export

# Export to file
pomodoroom policy export --output my-policy.json

# Export with metadata
pomodoroom policy export --name "Deep Work" --intent "Focus sessions"
```

### Import

```bash
# Import from file
pomodoroom policy import my-policy.json

# Import with dry-run (validate only)
pomodoroom policy import my-policy.json --dry-run

# Force import (skip compatibility checks)
pomodoroom policy import my-policy.json --force
```

## Implementation Plan

### Phase 1: Core Types (pomodoroom-core)

1. Create `crates/pomodoroom-core/src/policy/mod.rs`
2. Define `PolicyBundle`, `PolicyMetadata`, `PolicyData`
3. Implement `Version` parsing and comparison
4. Add compatibility check logic

### Phase 2: CLI Commands (pomodoroom-cli)

1. Add `policy` subcommand with `export` and `import`
2. Implement file I/O
3. Add `--dry-run` and `--force` flags
4. Pretty-print error messages with hints

### Phase 3: Tauri Bridge

1. Add `cmd_policy_export` and `cmd_policy_import` to bridge.rs
2. Support file dialog for import/export in GUI

## Acceptance Criteria

- [x] Import rejects incompatible versions safely
- [x] Export includes complete policy context
- [x] Migration hints are human-readable

## File Locations

```
crates/pomodoroom-core/src/policy/
  mod.rs           - Module exports
  bundle.rs        - PolicyBundle, PolicyMetadata, PolicyData
  version.rs       - Semantic version parsing and comparison
  compat.rs        - Compatibility checking logic

crates/pomodoroom-cli/src/commands/
  policy.rs        - CLI policy subcommand

src-tauri/src/
  bridge.rs        - Add cmd_policy_export, cmd_policy_import
```

## Current Version

Policy schema version: `1.0.0`

Bump Major when:
- Removing or renaming required fields
- Changing field types incompatibly

Bump Minor when:
- Adding new optional fields
- Adding new enum variants

Bump Patch when:
- Documentation changes
- Bug fixes in validation
