# Task/Project/Group Linkage Implementation Plan

> Issue #397

## Overview

Fix the task-to-project and task-to-group linkage functionality by aligning Rust and TypeScript type definitions.

## Tasks

### Task 1: Add Serde Aliases to Rust Task (15 min)
- [ ] Add `#[serde(alias = "projectId")]` to `project_id` field
- [ ] Add `#[serde(alias = "project")]` to `project_name` field
- [ ] Add `#[serde(alias = "projectIds")]` to `project_ids` field
- [ ] Add `#[serde(alias = "groupIds")]` to `group_ids` field
- [ ] Add unit tests for serialization compatibility

**Files:**
- `crates/pomodoroom-core/src/task/mod.rs` (modify)

### Task 2: Update TypeScript Task Type (15 min)
- [ ] Add `projectId?: string` field for backward compat
- [ ] Add `projectName?: string | null` field
- [ ] Add `projectIds: string[]` field
- [ ] Add `groupIds: string[]` field
- [ ] Update `createTask()` helper to initialize new fields

**Files:**
- `src/types/task.ts` (modify)

### Task 3: Update TaskCard Component (20 min)
- [ ] Display single project name (legacy compat)
- [ ] Display multiple project badges if present
- [ ] Display group name/badges if present
- [ ] Handle empty project/group arrays

**Files:**
- `src/components/TaskCard.tsx` (modify)

### Task 4: Add Helper Methods (10 min)
- [ ] Add `has_projects()` method to Task
- [ ] Add `has_groups()` method to Task
- [ ] Add `get_display_projects()` method
- [ ] Add `get_display_groups()` method

**Files:**
- `crates/pomodoroom-core/src/task/mod.rs` (modify)
- `src/types/task.ts` (modify)

## Acceptance Criteria

- [ ] Tasks can be linked to projects via `projectIds` array
- [ ] Tasks can be linked to groups via `groupIds` array
- [ ] Legacy `project` field still works for single-project display
- [ ] Filtering by project works in UI
- [ ] Filtering by group works in UI

## Dependencies

- serde (already in deps)
- Existing Task type definitions
