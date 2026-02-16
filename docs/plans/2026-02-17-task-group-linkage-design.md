# Task/Project/Group Linkage Bug Fix Design

> Issue #397

## Problem Analysis

The task-to-project and task-to-group linkage functionality is not working due to type mismatches between Rust and TypeScript.

### Current State

**Rust (`crates/pomodoroom-core/src/task/mod.rs`):**
```rust
pub struct Task {
    pub project_id: Option<String>,        // Single project
    pub project_name: Option<String>,       // Display name
    pub project_ids: Vec<String>,          // Multiple projects
    pub group: Option<String>,              // Single group
    pub group_ids: Vec<String>,            // Multiple groups
    // ... other fields
}
```

**TypeScript (`src/types/task.ts`):**
```typescript
export interface Task extends Omit<ScheduleTask, "priority" | "projectId"> {
    project: string | null;               // ❌ Different from Rust
    group: string | null;                 // ✓ Matches Rust group
    // ❌ Missing: project_ids, group_ids, project_name
}
```

**TypeScript (`src/types/schedule.ts`):**
```typescript
export interface Task {
    projectId?: string;                   // ❌ Snake_case from Rust
}
```

### Issues

1. **Field name mismatch**: Rust uses `project_id`, TypeScript uses `project` or `projectId`
2. **Missing fields**: TypeScript lacks `project_ids`, `group_ids`, `project_name`
3. **Inconsistent base**: `schedule.Task` uses `projectId` but v2 `Task` uses `project`

## Solution

### Approach

1. **Rust-side**: Use serde `rename` attribute to map field names to match TypeScript expectations
2. **TypeScript-side**: Add missing fields (`project_ids`, `group_ids`) for multi-association support

### Rust Changes

Add serde aliases to preserve compatibility:

```rust
pub struct Task {
    #[serde(alias = "projectId")]
    pub project_id: Option<String>,

    #[serde(alias = "project")]
    pub project_name: Option<String>,

    #[serde(alias = "projectIds")]
    pub project_ids: Vec<String>,

    pub group: Option<String>,

    #[serde(alias = "groupIds")]
    pub group_ids: Vec<String>,
}
```

### TypeScript Changes

Update `src/types/task.ts` to include all fields:

```typescript
export interface Task extends Omit<ScheduleTask, "priority" | "projectId"> {
    /** Single project name (for display/backward compat) */
    project: string | null;

    /** Single project ID (from legacy system) */
    projectId?: string;

    /** Display name for the project */
    projectName?: string | null;

    /** Multiple project IDs */
    projectIds: string[];

    /** Single group name */
    group: string | null;

    /** Multiple group IDs */
    groupIds: string[];

    // ... other fields
}
```

## Acceptance Criteria

- [ ] Tasks can be linked to projects via `projectIds` array
- [ ] Tasks can be linked to groups via `groupIds` array
- [ ] Legacy `project` field still works for single-project display
- [ ] Filtering by project works in UI
- [ ] Filtering by group works in UI

## Files Modified

- `crates/pomodoroom-core/src/task/mod.rs` - Add serde aliases
- `src/types/task.ts` - Add missing fields
- `src/components/TaskCard.tsx` - Update to use new fields
