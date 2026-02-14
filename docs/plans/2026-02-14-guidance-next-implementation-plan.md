# Guidance Board & Notification Controls Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Align the guidance board timer and next controls, CURRENT FOCUS panel, and notification dialog wiring so countdowns, actions, and blocking dialogs follow the updated behavior spec.

**Architecture:** Expand the GuidanceBoard and TaskCard components so the timer, NEXT, and CURRENT FOCUS sections render simplified borders, countdown progress, and consistent controls while delegating countdown math to new helper utilities; route notification-triggering buttons through the shared notification window.

**Tech Stack:** React and TypeScript with Vite, Tailwind-like utility classes, Tauri bridge for notifications, Rust scheduler core for start-time calculations, Vitest and Testing Library for unit tests.

---

### Task 1: Countdown and NEXT panel behavior

**Files:**
- Create helper files under src/utils for next task countdown and board selection with associated tests.
- Modify src/components/m3/GuidanceBoard.tsx and TaskCard.tsx to consume the helpers and render the updated layout.

**Step 1: Write the failing test**

Define tests that call the new utility to ensure it picks the earliest future start and returns a non-negative countdown.

**Step 2: Run the test**

Run vitest on the new helper tests and observe failure because the helper is missing.

**Step 3: Implement the minimal code**

Implement the helper functions, wire GuidanceBoard to use them for countdown text and progress, and render the default NEXT cards as simplified bordered tiles while showing the control panel only when toggled.

**Step 4: Run the tests**

Re-run vitest for the helper files and expect success.

**Step 5: Commit**

Add the modified and new files and commit with message "feat: align guidance board countdown and next controls".

### Task 2: Notification dialog wiring and control alignment

**Files:**
- Modify GuidanceBoard, TaskCard, ActionNotificationView, useActionNotification, ShellView, and task types to ensure buttons flow through the shared window.
- Add a new GuidanceBoard notification test file.

**Step 1: Write the failing test**

Render GuidanceBoard with a mocked notification callback, click the start button, and assert the callback was invoked.

**Step 2: Run the test**

Run vitest on the new component test to confirm it fails because wiring is absent.

**Step 3: Implement the minimal wiring**

Hook the buttons to call useActionNotification, ensure the notification view opens the dedicated dialog and closes after an action, align the timer/date row, position control rows with bottom alignment, and remove the NEXT label/TEST text in the default view.

**Step 4: Run the test**

Re-run vitest and expect the component test to pass.

**Step 5: Commit**

Add the affected files and commit with message "feat: wire guidance board actions to notification window".

### Task 3: CURRENT FOCUS controls and interrupt flow

**Files:**
- Modify GuidanceBoard, TaskOperations, useTaskStore, and the auto-schedule helper.
- Create tests covering the updated helper behavior.

**Step 1: Write the failing test**

Add a test ensuring the helper recomputes the display start time after schedule changes and produces a timestamp formatted as hours and minutes.

**Step 2: Run the test**

Run vitest for the helper test and observe failure.

**Step 3: Implement the minimal code**

Add getDisplayStartTime to return start time strings, update the CURRENT FOCUS anchor panel rendering, bottom-align controls, switch anchor selection on card clicks without entering edit mode, and ensure interrupt actions open the notification dialog with a required resume time.

**Step 4: Run the tests**

Re-run vitest on the helper tests and expect passing results.

**Step 5: Commit**

Stage the changed files and commit with message "feat: refresh current focus controls and schedule helper".

### Task 4: Project and group data model updates

**Files:**
- Modify the Rust task and schedule modules, Tauri bridge and schedule commands, front-end task/schedule types, the TasksView, and TaskCard to understand the richer model.
- Add a Rust test file covering tasks that belong to multiple groups and project references.

**Step 1: Write the failing test**

Add a Rust test verifying that a task can store multiple group identifiers and project reference entries.

**Step 2: Run cargo test**

Execute cargo test for the new suite and expect failure until the structures exist.

**Step 3: Implement the minimal code**

Introduce a ProjectReference struct, allow tasks to hold vectors of group IDs and project references, update serialization, and propagate the data through the Tauri bridge and front-end types.

**Step 4: Run cargo test**

Re-run cargo test to ensure the new test passes.

**Step 5: Commit**

Add the modified Rust and TypeScript files and commit with message "feat: expand project and group model".

***

Plan complete and saved to docs/plans/2026-02-14-guidance-next-implementation-plan.md. Two execution options:

1. Subagent-Driven (this session) – continue here using superpowers:subagent-driven-development.
2. Parallel Session – start a new session running superpowers:executing-plans with checkpoints.

Which approach do you prefer for executing this plan?
