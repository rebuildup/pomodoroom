# Pomodoroom API Documentation

Complete API reference for Pomodoroom Tauri IPC commands, CLI commands, and core library API.

## Table of Contents

- [Tauri IPC Commands](#tauri-ipc-commands)
  - [Timer Commands](#timer-commands)
  - [Task Commands](#task-commands)
  - [Project Commands](#project-commands)
  - [Schedule Commands](#schedule-commands)
  - [Template Commands](#template-commands)
  - [Config Commands](#config-commands)
  - [Stats Commands](#stats-commands)
  - [Timeline Commands](#timeline-commands)
  - [OAuth Commands](#oauth-commands)
- [CLI Commands](#cli-commands)
- [Core Library API](#core-library-api)

---

## Tauri IPC Commands

All Tauri commands return `Result<Value, String>` where `Value` is a `serde_json::Value`.

### Timer Commands

#### `cmd_timer_status`

Get the current timer state as a JSON snapshot.

**Parameters**: None

**Returns**: `StateSnapshot` event
```json
{
  "state": "idle" | "running" | "paused" | "completed",
  "step_index": 0,
  "step_type": "focus" | "break",
  "step_label": "Warm Up",
  "remaining_ms": 900000,
  "total_ms": 900000,
  "schedule_progress_pct": 0.0,
  "at": "2025-01-09T12:00:00+00:00"
}
```

**Example**:
```typescript
const status = await invoke("cmd_timer_status");
console.log(status.remaining_ms); // milliseconds remaining
```

---

#### `cmd_timer_tick`

Advance the timer and check for completion. Should be called periodically (e.g., every 100ms).

**Parameters**: None

**Returns**: `StateSnapshot` with optional `completed` event
```json
{
  "state": "running",
  "step_index": 0,
  "remaining_ms": 89900,
  "total_ms": 900000,
  "schedule_progress_pct": 0.1,
  "completed": null  // or TimerCompleted event when step finishes
}
```

**Example**:
```typescript
const result = await invoke("cmd_timer_tick");
if (result.completed) {
  console.log("Step completed!", result.completed);
}
```

---

#### `cmd_timer_start`

Start the timer, optionally at a specific step, with optional task/project linking.

**Parameters**:
```typescript
{
  step?: number,        // Step index to start at (0-based)
  task_id?: string,     // Task ID to link with this session
  project_id?: string   // Project ID to link with this session
}
```

**Returns**: `TimerStarted` event or `null` if already running
```json
{
  "step_index": 0,
  "step_type": "focus",
  "duration_secs": 1500,
  "at": "2025-01-09T12:00:00+00:00"
}
```

**Example**:
```typescript
const started = await invoke("cmd_timer_start", {
  task_id: "abc-123",
  project_id: "proj-456"
});
```

---

#### `cmd_timer_pause`

Pause the running timer.

**Parameters**: None

**Returns**: `TimerPaused` event or `null` if not running
```json
{
  "remaining_ms": 600000,
  "at": "2025-01-09T12:10:00+00:00"
}
```

---

#### `cmd_timer_resume`

Resume a paused timer.

**Parameters**: None

**Returns**: `TimerResumed` event or `null` if not paused
```json
{
  "remaining_ms": 600000,
  "at": "2025-01-09T12:15:00+00:00"
}
```

---

#### `cmd_timer_skip`

Skip to the next step in the schedule. Records the skipped session to database with `completed=false`.

**Parameters**: None

**Returns**: `TimerSkipped` event
```json
{
  "from_step": 0,
  "to_step": 1,
  "at": "2025-01-09T12:05:00+00:00"
}
```

---

#### `cmd_timer_reset`

Reset the timer to the initial state.

**Parameters**: None

**Returns**: `TimerReset` event
```json
{
  "at": "2025-01-09T12:05:00+00:00"
}
```

---

### Task Commands

#### `cmd_task_create`

Create a new task.

**Parameters**:
```typescript
{
  title: string,
  description?: string,
  project_id?: string,
  tags?: string[],
  estimated_pomodoros?: number,  // default: 1
  priority?: number,             // 0-100, default: 50
  category?: "active" | "someday"  // default: "active"
}
```

**Returns**: Created `Task` object
```json
{
  "id": "uuid-v4",
  "title": "My Task",
  "description": "Task description",
  "estimated_pomodoros": 2,
  "completed_pomodoros": 0,
  "completed": false,
  "state": "ready",
  "project_id": "project-uuid",
  "project_name": "My Project",
  "tags": ["deep", "admin"],
  "priority": 50,
  "category": "active",
  "estimated_minutes": null,
  "elapsed_minutes": 0,
  "energy": "medium",
  "group": null,
  "created_at": "2025-01-09T12:00:00+00:00",
  "updated_at": "2025-01-09T12:00:00+00:00",
  "completed_at": null,
  "paused_at": null
}
```

**Example**:
```typescript
const task = await invoke("cmd_task_create", {
  title: "Implement feature",
  description: "Add new feature to the app",
  project_id: "proj-123",
  tags: ["deep", "admin"],
  estimated_pomodoros: 3,
  priority: 75
});
```

---

#### `cmd_task_update`

Update an existing task. Only provided fields are updated.

**Parameters**:
```typescript
{
  id: string,
  title?: string,
  description?: string,
  project_id?: string,
  tags?: string[],
  estimated_pomodoros?: number,
  completed_pomodoros?: number,
  completed?: boolean,
  priority?: number,
  category?: "active" | "someday"
}
```

**Returns**: Updated `Task` object

**Example**:
```typescript
const updated = await invoke("cmd_task_update", {
  id: "task-123",
  priority: 90,
  tags: ["deep", "admin", "blocked"]
});
```

---

#### `cmd_task_delete`

Delete a task.

**Parameters**:
```typescript
{
  id: string
}
```

**Returns**: `void`

**Example**:
```typescript
await invoke("cmd_task_delete", { id: "task-123" });
```

---

#### `cmd_task_list`

List tasks with optional filtering.

**Parameters**:
```typescript
{
  project_id?: string,
  category?: "active" | "someday"
}
```

**Returns**: Array of `Task` objects

**Example**:
```typescript
// All active tasks
const allTasks = await invoke("cmd_task_list");

// Tasks for a specific project
const projectTasks = await invoke("cmd_task_list", {
  project_id: "proj-123"
});

// Someday tasks
const somedayTasks = await invoke("cmd_task_list", {
  category: "someday"
});
```

---

#### `cmd_task_get`

Get a single task by ID.

**Parameters**:
```typescript
{
  id: string
}
```

**Returns**: `Task` object or `null` if not found

**Example**:
```typescript
const task = await invoke("cmd_task_get", { id: "task-123" });
if (task) {
  console.log(task.title);
}
```

---

### Task State Transition Commands

#### `cmd_task_start`

Start a task: READY → RUNNING. Auto-pauses any other RUNNING tasks and starts the timer.

**Parameters**:
```typescript
{
  id: string
}
```

**Returns**: Updated `Task` object

**Example**:
```typescript
const runningTask = await invoke("cmd_task_start", { id: "task-123" });
// Timer is now started automatically
```

---

#### `cmd_task_pause`

Pause a running task: RUNNING → PAUSED. Also pauses the timer.

**Parameters**:
```typescript
{
  id: string
}
```

**Returns**: Updated `Task` object

---

#### `cmd_task_resume`

Resume a paused task: PAUSED → RUNNING. Auto-pauses other RUNNING tasks and resumes timer.

**Parameters**:
```typescript
{
  id: string
}
```

**Returns**: Updated `Task` object

---

#### `cmd_task_complete`

Complete a task: RUNNING → DONE. Resets the timer.

**Parameters**:
```typescript
{
  id: string
}
```

**Returns**: Updated `Task` object

---

#### `cmd_task_postpone`

Postpone a task: RUNNING → READY. Decreases priority by 20 (clamped to minimum -100). Resets timer.

**Parameters**:
```typescript
{
  id: string
}
```

**Returns**: Updated `Task` object

**Note**: Only RUNNING tasks can be postponed. Priority uses `saturating_sub(20)` with explicit clamp to -100.

---

#### `cmd_task_extend`

Extend a task's estimated time. Any state → same state with `estimated_minutes += N`.

**Parameters**:
```typescript
{
  id: string,
  minutes: number  // 1-480
}
```

**Returns**: Updated `Task` object

**Example**:
```typescript
await invoke("cmd_task_extend", { id: "task-123", minutes: 30 });
```

---

#### `cmd_task_available_actions`

Get available actions for a task based on its current state.

**Parameters**:
```typescript
{
  id: string
}
```

**Returns**: Array of action names
```json
["start", "pause", "complete", "postpone", "extend(30m)"]
```

**Example**:
```typescript
const actions = await invoke("cmd_task_available_actions", { id: "task-123" });
console.log(actions); // ["start", "complete", "postpone"]
```

---

### Project Commands

#### `cmd_project_create`

Create a new project.

**Parameters**:
```typescript
{
  name: string,
  deadline?: string  // ISO 8601 datetime string
}
```

**Returns**: Created `Project` object
```json
{
  "id": "uuid-v4",
  "name": "My Project",
  "deadline": "2025-12-31T23:59:59+00:00",
  "created_at": "2025-01-09T12:00:00+00:00"
}
```

**Example**:
```typescript
const project = await invoke("cmd_project_create", {
  name: "Website Redesign",
  deadline: "2025-03-31T23:59:59Z"
});
```

---

#### `cmd_project_list`

List all projects.

**Parameters**: None

**Returns**: Array of `Project` objects

**Example**:
```typescript
const projects = await invoke("cmd_project_list");
```

---

### Template Commands

#### `cmd_template_get`

Get the current daily template.

**Parameters**: None

**Returns**: `DailyTemplate` object or default template
```json
{
  "wake_up": "07:00",
  "sleep": "23:00",
  "fixed_events": [],
  "max_parallel_lanes": 2
}
```

---

#### `cmd_template_set`

Set the daily template. Creates new or updates existing.

**Parameters**:
```typescript
{
  template_json: DailyTemplate
}
```

**Returns**: `void`

**Example**:
```typescript
await invoke("cmd_template_set", {
  template_json: {
    wake_up: "06:00",
    sleep: "22:00",
    fixed_events: [],
    max_parallel_lanes: 3
  }
});
```

---

### Schedule Commands

#### `cmd_schedule_generate`

Generate a daily schedule from template and available tasks.

**Parameters**:
```typescript
{
  date_iso: string,              // YYYY-MM-DD
  calendar_events_json?: Array<{  // Optional calendar events to avoid
    id?: string,
    title: string,
    start_time: string,  // ISO 8601
    end_time: string     // ISO 8601
  }>
}
```

**Returns**: Array of `ScheduledBlock` objects

**Example**:
```typescript
const schedule = await invoke("cmd_schedule_generate", {
  date_iso: "2025-01-09",
  calendar_events_json: [
    {
      id: "cal-123",
      title: "Team Meeting",
      start_time: "2025-01-09T14:00:00Z",
      end_time: "2025-01-09T15:00:00Z"
    }
  ]
});
```

---

#### `cmd_schedule_auto_fill`

Auto-fill available time slots with top priority tasks.

**Parameters**: Same as `cmd_schedule_generate`

**Returns**: Array of `ScheduledBlock` objects

---

#### `cmd_schedule_create_block`

Create a manual schedule block.

**Parameters**:
```typescript
{
  block_json: {
    blockType: "focus" | "break" | "routine" | "calendar",
    startTime: string,   // ISO 8601
    endTime: string,     // ISO 8601
    taskId?: string,
    locked?: boolean,
    label?: string,
    lane?: number
  }
}
```

**Returns**: Created `ScheduleBlock` object

---

#### `cmd_schedule_update_block`

Update an existing schedule block.

**Parameters**:
```typescript
{
  id: string,
  startTime?: string,
  endTime?: string,
  lane?: number,
  label?: string
}
```

**Returns**: Updated `ScheduleBlock` object

---

#### `cmd_schedule_delete_block`

Delete a schedule block.

**Parameters**:
```typescript
{
  id: string
}
```

**Returns**: `void`

---

#### `cmd_schedule_list_blocks`

List schedule blocks for a date range.

**Parameters**:
```typescript
{
  start_iso: string,  // ISO 8601
  end_iso?: string    // Optional, defaults to start + 24h
}
```

**Returns**: Array of `ScheduleBlock` objects

---

### Config Commands

#### `cmd_config_get`

Get a configuration value by key.

**Parameters**:
```typescript
{
  key: string
}
```

**Returns**: Configuration value as string

**Example**:
```typescript
const focusDuration = await invoke("cmd_config_get", { key: "focus_duration" });
```

---

#### `cmd_config_set`

Set a configuration value.

**Parameters**:
```typescript
{
  key: string,
  value: string
}
```

**Returns**: `void`

**Example**:
```typescript
await invoke("cmd_config_set", {
  key: "focus_duration",
  value: "25"
});
```

---

#### `cmd_config_list`

List all configuration values.

**Parameters**: None

**Returns**: Complete configuration as JSON

---

### Stats Commands

#### `cmd_stats_today`

Get today's statistics.

**Parameters**: None

**Returns**: `Stats` object
```json
{
  "total_sessions": 10,
  "total_focus_min": 150,
  "total_break_min": 50,
  "completed_pomodoros": 6,
  "today_sessions": 4,
  "today_focus_min": 100
}
```

---

#### `cmd_stats_all`

Get all-time statistics.

**Parameters**: None

**Returns**: `Stats` object

---

### Timeline Commands

#### `cmd_timeline_detect_gaps`

Detect time gaps in a list of events.

**Parameters**:
```typescript
{
  events_json: Array<{
    start_time: string,  // ISO 8601
    end_time: string     // ISO 8601
  }>
}
```

**Returns**: Array of `TimeGap` objects
```json
[
  {
    "start": "2025-01-09T09:00:00+00:00",
    "end": "2025-01-09T10:00:00+00:00",
    "duration_min": 60
  }
]
```

---

#### `cmd_timeline_generate_proposals`

Generate task proposals based on time gaps.

**Parameters**:
```typescript
{
  gaps_json: TimeGap[],
  tasks_json: TimelineItem[]
}
```

**Returns**: Array of `TaskProposal` objects

---

#### `cmd_calculate_priority`

Calculate priority score for a single task.

**Parameters**:
```typescript
{
  task_json: TimelineItem
}
```

**Returns**: Priority score (0-100)

---

#### `cmd_calculate_priorities`

Calculate priority scores for multiple tasks.

**Parameters**:
```typescript
{
  tasks_json: TimelineItem[]
}
```

**Returns**: Array of objects with `task_id` and `priority`

---

### OAuth Commands

#### `cmd_store_oauth_tokens`

Store OAuth tokens securely in the OS keyring.

**Parameters**:
```typescript
{
  service_name: string,  // e.g., "google", "notion"
  tokens_json: string    // JSON string with OAuth tokens
}
```

**Returns**: `void`

**Example**:
```typescript
await invoke("cmd_store_oauth_tokens", {
  service_name: "google",
  tokens_json: JSON.stringify({
    accessToken: "...",
    refreshToken: "...",
    expiresIn: 3600
  })
});
```

---

#### `cmd_load_oauth_tokens`

Load OAuth tokens from the OS keyring.

**Parameters**:
```typescript
{
  service_name: string
}
```

**Returns**: OAuth tokens JSON string or `null` if not found

**Example**:
```typescript
const tokens = await invoke("cmd_load_oauth_tokens", {
  service_name: "google"
});
if (tokens) {
  const parsed = JSON.parse(tokens);
  console.log(parsed.accessToken);
}
```

---

#### `cmd_clear_oauth_tokens`

Clear OAuth tokens from the OS keyring.

**Parameters**:
```typescript
{
  service_name: string
}
```

**Returns**: `void`

---

### Cache Commands

#### `cmd_cache_get`

Get cached data from SQLite KV store with TTL check.

**Parameters**:
```typescript
{
  key: string,
  ttl?: number  // TTL in milliseconds for staleness check (optional)
}
```

**Returns**:
```typescript
{
  data: any | null,
  is_stale: boolean,
  last_updated: number | null  // Unix timestamp in milliseconds
}
```

**Example**:
```typescript
const cached = await invoke("cmd_cache_get", { 
  key: "cache:tasks", 
  ttl: 3600000  // 1 hour
});
if (cached.data && !cached.is_stale) {
  console.log("Fresh data:", cached.data);
}
```

---

#### `cmd_cache_set`

Set cached data in SQLite KV store with optional TTL.

**Parameters**:
```typescript
{
  key: string,
  data: any,
  ttl?: number | null  // TTL in milliseconds (null = no expiration)
}
```

**Returns**: `void`

**Example**:
```typescript
await invoke("cmd_cache_set", {
  key: "cache:tasks",
  data: tasks,
  ttl: 3600000  // 1 hour
});
```

---

#### `cmd_cache_delete`

Delete cached data by key.

**Parameters**:
```typescript
{
  key: string
}
```

**Returns**: `boolean` (true if key existed)

**Example**:
```typescript
const existed = await invoke("cmd_cache_delete", { key: "cache:tasks" });
```

---

#### `cmd_cache_clear_prefix`

Clear all cache entries with a specific prefix.

**Parameters**:
```typescript
{
  prefix: string
}
```

**Returns**: `number` (count of entries cleared)

**Example**:
```typescript
const cleared = await invoke("cmd_cache_clear_prefix", { prefix: "cache:calendar:" });
console.log(`Cleared ${cleared} calendar cache entries`);
```

---

## CLI Commands

### Timer

```bash
# Start the timer
pomodoroom-cli timer start

# Pause the timer
pomodoroom-cli timer pause

# Resume the timer
pomodoroom-cli timer resume

# Skip current step
pomodoroom-cli timer skip

# Reset timer
pomodoroom-cli timer reset

# Show timer status
pomodoroom-cli timer status
```

### Config

```bash
# Get a config value
pomodoroom-cli config get focus_duration

# Set a config value
pomodoroom-cli config set focus_duration 25

# List all config
pomodoroom-cli config list
```

### Stats

```bash
# Show today's stats
pomodoroom-cli stats today

# Show all-time stats
pomodoroom-cli stats all
```

### Schedule

```bash
# List schedule
pomodoroom-cli schedule list

# Generate schedule for a date
pomodoroom-cli schedule generate 2025-01-09

# Auto-fill available slots
pomodoroom-cli schedule autofill 2025-01-09
```

### Task

```bash
# Create a task
pomodoroom-cli task create "My Task" --project "proj-id" --tags deep,admin

# List tasks
pomodoroom-cli task list

# List tasks for project
pomodoroom-cli task list --project "proj-id"

# Update a task
pomodoroom-cli task update "task-id" --priority 80

# Delete a task
pomodoroom-cli task delete "task-id"

# Start a task (READY → RUNNING)
pomodoroom-cli task start "task-id"

# Pause a task (RUNNING → PAUSED)
pomodoroom-cli task pause "task-id"

# Resume a task (PAUSED → RUNNING)
pomodoroom-cli task resume "task-id"

# Complete a task (RUNNING → DONE)
pomodoroom-cli task complete "task-id"

# Postpone a task (RUNNING/PAUSED → READY)
pomodoroom-cli task postpone "task-id"
```

### Project

```bash
# Create a project
pomodoroom-cli project create "My Project" --deadline "2025-12-31"

# List projects
pomodoroom-cli project list
```

### Template

```bash
# Get daily template
pomodoroom-cli template get

# Set daily template
pomodoroom-cli template set --wake-up 07:00 --sleep 23:00

# Add fixed event
pomodoroom-cli template add-event "Lunch" 12:00 13:00
```

### Auth (Integrations)

```bash
# Authenticate with a service
pomodoroom-cli auth login google

# Disconnect from a service
pomodoroom-cli auth logout google

# List connected services
pomodoroom-cli auth list
```

### Sync

```bash
# Sync with all connected services
pomodoroom-cli sync all

# Sync with specific service
pomodoroom-cli sync google
```

### Shell Completions

```bash
# Generate completions
pomodoroom-cli complete bash > ~/.local/share/bash-completion/completions/pomodoroom-cli
pomodoroom-cli complete zsh > ~/.zsh/completions/_pomodoroom-cli
pomodoroom-cli complete fish > ~/.config/fish/completions/pomodoroom-cli.fish
```

---

## Core Library API

### TimerEngine

```rust
use pomodoroom_core::TimerEngine;

// Create engine with schedule
let mut engine = TimerEngine::new(schedule);

// Start timer
let event = engine.start();

// Pause timer
let event = engine.pause();

// Resume timer
let event = engine.resume();

// Skip to next step
let event = engine.skip();

// Reset timer
let event = engine.reset();

// Get current state
let state = engine.state();
let remaining = engine.remaining_ms();
let progress = engine.step_progress();

// Get full snapshot
let snapshot = engine.snapshot();
```

### Database

```rust
use pomodoroom_core::Database;

// Open database
let db = Database::open()?;

// Record a session
db.record_session(
    StepType::Focus,
    "Warm Up",
    25,  // duration_min
    started_at,
    completed_at,
    Some("task-id"),
    Some("project-id")
)?;

// Get statistics
let today_stats = db.stats_today()?;
let all_stats = db.stats_all()?;

// Key-value store
db.kv_set("last_sync", "2025-01-09")?;
let value = db.kv_get("last_sync")?;
```

### ScheduleDb

```rust
use pomodoroom_core::storage::ScheduleDb;

// Open database
let db = ScheduleDb::open()?;

// Create task
db.create_task(&task)?;

// Get task
let task = db.get_task("task-id")?;

// List tasks
let tasks = db.list_tasks()?;

// Update task
db.update_task(&task)?;

// Delete task
db.delete_task("task-id")?;

// Create project
db.create_project(&project)?;

// List projects
let projects = db.list_projects()?;

// Daily template
let template = db.get_daily_template()?;
db.create_daily_template(&template)?;
db.update_daily_template(&template)?;

// Schedule blocks
db.create_schedule_block(&block)?;
db.get_schedule_block("block-id")?;
db.update_schedule_block(&block)?;
db.delete_schedule_block("block-id")?;
db.list_schedule_blocks(Some(&start), Some(&end))?;
```

### Config

```rust
use pomodoroom_core::Config;

// Load or create default
let config = Config::load_or_default();

// Get value
let focus_duration = config.get("focus_duration");

// Set value
config.set("focus_duration", "25")?;

// Save changes
config.save()?;
```

### Integration Trait

```rust
use pomodoroom_core::integrations::Integration;

struct MyIntegration {
    name: String,
    authenticated: bool,
}

impl Integration for MyIntegration {
    fn name(&self) -> &str {
        &self.name
    }

    fn display_name(&self) -> &str {
        "My Integration"
    }

    fn is_authenticated(&self) -> bool {
        self.authenticated
    }

    fn authenticate(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        // Open browser or prompt for API key
        self.authenticated = true;
        Ok(())
    }

    fn disconnect(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        self.authenticated = false;
        Ok(())
    }

    fn on_focus_start(&self, label: &str, duration: u64) -> Result<(), Box<dyn std::error::Error>> {
        // Send notification, update status, etc.
        Ok(())
    }

    fn on_session_complete(&self, session: &SessionRecord) -> Result<(), Box<dyn std::error::Error>> {
        // Log completed session to external service
        Ok(())
    }
}
```

### AutoScheduler

```rust
use pomodoroom_core::scheduler::{AutoScheduler, CalendarEvent};

let scheduler = AutoScheduler::new();

// Generate schedule from template
let blocks = scheduler.generate_schedule(
    &template,
    &tasks,
    &calendar_events,
    date
);

// Auto-fill available time slots
let blocks = scheduler.auto_fill(
    &template,
    &tasks,
    &calendar_events,
    date
);
```

### Task State Machine

```rust
use pomodoroom_core::task::{TaskStateMachine, TransitionAction};

let mut state_machine = TaskStateMachine::new(task);

// Apply transition
state_machine.apply_action(TransitionAction::Start)?;

// Get available actions
let actions = state_machine.available_actions();

// Get modified task
let updated_task = state_machine.task;
```
