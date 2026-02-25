# Pomodoroom Data Model Reference

Complete reference for all data storage schemas in Pomodoroom.

## Table of Contents

- [SQLite Database Schema](#sqlite-database-schema)
  - [Sessions Table](#sessions-table)
  - [KeyValue Table](#keyvalue-table)
  - [Checkpoints Table](#checkpoints-table)
  - [OperationLog Table](#operationlog-table)
  - [CalendarShards Table](#calendarshards-table)
  - [Tasks Table](#tasks-table)
  - [Projects Table](#projects-table)
  - [DailyTemplate Table](#dailytemplate-table)
  - [ScheduleBlocks Table](#scheduleblocks-table)
- [TOML Configuration Schema](#toml-configuration-schema)
- [OS Keyring Entries](#os-keyring-entries)
- [TypeScript Type Definitions](#typescript-type-definitions)

---

## SQLite Database Schema

**Location**: `~/.config/pomodoroom/pomodoroom.db`

Database contains 9 tables for sessions, tasks, projects, templates, schedule blocks, checkpoints, operation logs, and calendar shards.

### Sessions Table

Stores completed Pomodoro sessions with task associations.

```sql
CREATE TABLE sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    step_type   TEXT NOT NULL,          -- 'focus' or 'break'
    step_label  TEXT NOT NULL DEFAULT '',
    duration_min INTEGER NOT NULL,      -- Duration in minutes
    started_at  TEXT NOT NULL,          -- ISO 8601 datetime
    completed_at TEXT NOT NULL,         -- ISO 8601 datetime
    task_id     TEXT,                   -- Associated task ID (optional)
    project_id  TEXT                    -- Associated project ID (optional)
);

CREATE INDEX idx_sessions_completed_at ON sessions(completed_at);
CREATE INDEX idx_sessions_step_type ON sessions(step_type);
CREATE INDEX idx_sessions_completed_at_step_type ON sessions(completed_at, step_type);
CREATE INDEX idx_sessions_task_id ON sessions(task_id);
CREATE INDEX idx_sessions_project_id ON sessions(project_id);
```

**Column Descriptions**:

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary key, auto-increment |
| `step_type` | TEXT | Session type: `focus` or `break` |
| `step_label` | TEXT | Human-readable label (e.g., "Warm Up") |
| `duration_min` | INTEGER | Session duration in minutes |
| `started_at` | TEXT | Start time as ISO 8601 string |
| `completed_at` | TEXT | Completion time as ISO 8601 string |
| `task_id` | TEXT | Optional associated task ID |
| `project_id` | TEXT | Optional associated project ID |

**Example Row**:
```json
{
  "id": 1,
  "step_type": "focus",
  "step_label": "Warm Up",
  "duration_min": 25,
  "started_at": "2025-01-09T09:00:00+00:00",
  "completed_at": "2025-01-09T09:25:00+00:00",
  "task_id": "abc-123-def",
  "project_id": "proj-456"
}
```

---

### KeyValue Table

Key-value store for application state.

```sql
CREATE TABLE kv (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

**Common Keys**:

| Key | Value | Description |
|-----|-------|-------------|
| `last_sync` | ISO 8601 datetime | Last successful sync time |
| `migration_version` | Integer | Database schema version |

---

### Checkpoints Table

Stores state snapshots for fast event replay and CRDT merge operations.

```sql
CREATE TABLE IF NOT EXISTS checkpoints (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    state_snapshot TEXT NOT NULL
);
```

**Column Descriptions**:

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | Unique checkpoint identifier |
| `created_at` | TEXT | ISO 8601 timestamp when checkpoint was created |
| `state_snapshot` | TEXT | JSON-serialized state snapshot |

---

### OperationLog Table

CRDT-style operation log for conflict-free merge across devices.

```sql
CREATE TABLE IF NOT EXISTS operation_log (
    id TEXT PRIMARY KEY,
    operation_type TEXT NOT NULL,
    data TEXT NOT NULL,
    lamport_ts INTEGER NOT NULL,
    device_id TEXT NOT NULL,
    vector_clock TEXT,
    created_at TEXT NOT NULL
);
```

**Column Descriptions**:

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | Unique operation identifier |
| `operation_type` | TEXT | Type of operation (e.g., "start", "pause", "complete") |
| `data` | TEXT | JSON-serialized operation data |
| `lamport_ts` | INTEGER | Lamport timestamp for ordering |
| `device_id` | TEXT | Device that originated the operation |
| `vector_clock` | TEXT | JSON-encoded vector clock for causality tracking |
| `created_at` | TEXT | ISO 8601 timestamp |

**Operation Types**:

| Type | Description |
|------|-------------|
| `start` | Task was started (READY → RUNNING) |
| `complete` | Task was completed (RUNNING → DONE) |
| `extend` | Task timer was extended (RUNNING → RUNNING) |
| `pause` | Task was paused (RUNNING → PAUSED) |
| `resume` | Task was resumed (PAUSED → RUNNING) |
| `defer` | Task was deferred (READY → READY) |
| `timeout` | Task timeout (RUNNING/PAUSED → DRIFTING) |

---

### CalendarShards Table

Multi-tenant event storage for Google Calendar integration.

```sql
CREATE TABLE IF NOT EXISTS calendar_shards (
    shard_key TEXT PRIMARY KEY,
    shard_type TEXT NOT NULL,
    event_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    rotated_at TEXT
);
```

**Column Descriptions**:

| Column | Type | Description |
|--------|------|-------------|
| `shard_key` | TEXT | Unique shard identifier |
| `shard_type` | TEXT | Type of shard (e.g., "primary", "backup") |
| `event_count` | INTEGER | Number of events in this shard |
| `created_at` | TEXT | ISO 8601 creation timestamp |
| `rotated_at` | TEXT | ISO 8601 timestamp when shard was rotated |

---

### Tasks Table

Stores task data with state machine support.

```sql
CREATE TABLE tasks (
    id                    TEXT PRIMARY KEY,
    title                 TEXT NOT NULL,
    description           TEXT,
    estimated_pomodoros   INTEGER NOT NULL DEFAULT 1,
    completed_pomodoros   INTEGER NOT NULL DEFAULT 0,
    completed             BOOLEAN NOT NULL DEFAULT 0,
    state                 TEXT NOT NULL DEFAULT 'READY',
    project_id            TEXT,
    project_name          TEXT,
    tags                  TEXT NOT NULL DEFAULT '[]',
    priority              INTEGER,
    category              TEXT NOT NULL DEFAULT 'active',
    estimated_minutes     INTEGER,
    elapsed_minutes       INTEGER NOT NULL DEFAULT 0,
    energy                TEXT NOT NULL DEFAULT 'medium',
    group_name            TEXT,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL,
    completed_at          TEXT,
    paused_at             TEXT,

    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX idx_tasks_state ON tasks(state);
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_category ON tasks(category);
CREATE INDEX idx_tasks_completed ON tasks(completed);
```

**Column Descriptions**:

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | UUID v4 primary key |
| `title` | TEXT | Task title (max 500 chars) |
| `description` | TEXT | Optional description |
| `estimated_pomodoros` | INTEGER | Estimated pomodoros to complete |
| `completed_pomodoros` | INTEGER | Number of completed pomodoros |
| `completed` | BOOLEAN | Legacy completion flag |
| `state` | TEXT | Task state: `READY`, `RUNNING`, `PAUSED`, `DONE`, `DRIFTING` |
| `project_id` | TEXT | Foreign key to projects table |
| `project_name` | TEXT | Denormalized project name |
| `tags` | TEXT | JSON array of tag strings |
| `priority` | INTEGER | Priority score 0-100 (null for default) |
| `category` | TEXT | `active`, `wait`, or `floating` (per CORE_POLICY.md §4.1) |
| `estimated_minutes` | INTEGER | Estimated time in minutes |
| `elapsed_minutes` | INTEGER | Actual time spent (minutes) |
| `energy` | TEXT | `high`, `medium`, `low` |
| `group_name` | TEXT | Optional group name |
| `created_at` | TEXT | ISO 8601 creation timestamp |
| `updated_at` | TEXT | ISO 8601 last update timestamp |
| `completed_at` | TEXT | ISO 8601 completion timestamp |
| `paused_at` | TEXT | ISO 8601 pause timestamp |

**State Transitions** (per CORE_POLICY.md §4.2):
```
              開始              完了/時間切れ
  READY ─────────────▶ RUNNING ─────────────▶ DONE
    ▲                     │                    ▲
    │    先送り            │  中断              │
    │  (優先度下げ)        ▼                    │
    │                   PAUSED                 │
    │                     │                    │
    │      再開            │            タイムアウト│
    │      ┌──────────────┘                    │
    │      │            タイムアウト           │
    └──────┴─────────▶ DRIFTING ───────────────┘
                         │
                         │ 延長/中断/完了
                         ▼
                    RUNNING/PAUSED/DONE
```

**DRIFTING State**:
- **Definition**: State entered when timer completes without user action
- **Tracked Fields**:
  - `break_debt_ms`: Drift duration accumulated as break debt
  - `escalation_level`: Intervention level (0-3, Gatekeeper protocol)
- **Transitions**: From RUNNING/PAUSED on timer timeout; to DONE/RUNNING/PAUSED on user action

**Task Category Classification** (per CORE_POLICY.md §4.1):

| Code State | Task Category | Condition |
|------------|---------------|-----------|
| `RUNNING` | **Active** | Always Active (max 1) |
| `PAUSED` + external block | **Wait** | External factors blocking |
| `READY` + low priority/energy | **Floating** | Scheduler assigns |
| `READY` + normal priority | Active candidate | Next Active proposal |
| `DONE` | - | Excluded from classification |

**Example Row**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Implement feature",
  "description": "Add new feature to the app",
  "estimated_pomodoros": 3,
  "completed_pomodoros": 1,
  "completed": false,
  "state": "running",
  "project_id": "proj-123",
  "project_name": "My Project",
  "tags": "[\"deep\", \"admin\"]",
  "priority": 75,
  "category": "active",
  "estimated_minutes": 90,
  "elapsed_minutes": 45,
  "energy": "high",
  "group_name": null,
  "created_at": "2025-01-09T08:00:00+00:00",
  "updated_at": "2025-01-09T12:00:00+00:00",
  "completed_at": null,
  "paused_at": null
}
```

---

### Projects Table

Stores project data.

```sql
CREATE TABLE projects (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    deadline   TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX idx_projects_deadline ON projects(deadline);
```

**Column Descriptions**:

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | UUID v4 primary key |
| `name` | TEXT | Project name (max 500 chars) |
| `deadline` | TEXT | ISO 8601 deadline (optional) |
| `created_at` | TEXT | ISO 8601 creation timestamp |

**Example Row**:
```json
{
  "id": "proj-123",
  "name": "Website Redesign",
  "deadline": "2025-03-31T23:59:59+00:00",
  "created_at": "2025-01-01T00:00:00+00:00"
}
```

---

### DailyTemplate Table

Stores daily schedule template.

```sql
CREATE TABLE daily_template (
    id                 TEXT PRIMARY KEY,
    wake_up            TEXT NOT NULL DEFAULT '07:00',
    sleep              TEXT NOT NULL DEFAULT '23:00',
    fixed_events       TEXT NOT NULL DEFAULT '[]',
    max_parallel_lanes INTEGER
);
```

**Column Descriptions**:

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | Always `"default"` (singleton table) |
| `wake_up` | TEXT | Wake up time in HH:MM format |
| `sleep` | TEXT | Sleep time in HH:MM format |
| `fixed_events` | TEXT | JSON array of fixed events |
| `max_parallel_lanes` | INTEGER | Maximum parallel task lanes (2-4 typical) |

**Fixed Events Schema**:
```typescript
interface FixedEvent {
  title: string;
  start: string;  // HH:MM format
  end: string;    // HH:MM format
  type?: "routine" | "calendar";
}
```

**Example Row**:
```json
{
  "id": "default",
  "wake_up": "07:00",
  "sleep": "23:00",
  "fixed_events": "[{\"title\":\"Lunch\",\"start\":\"12:00\",\"end\":\"13:00\",\"type\":\"routine\"}]",
  "max_parallel_lanes": 2
}
```

---

### ScheduleBlocks Table

Stores scheduled time blocks.

```sql
CREATE TABLE schedule_blocks (
    id         TEXT PRIMARY KEY,
    block_type TEXT NOT NULL,
    task_id    TEXT,
    start_time TEXT NOT NULL,
    end_time   TEXT NOT NULL,
    locked     BOOLEAN NOT NULL DEFAULT 0,
    label      TEXT,
    lane       INTEGER,

    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE INDEX idx_schedule_blocks_start_time ON schedule_blocks(start_time);
CREATE INDEX idx_schedule_blocks_end_time ON schedule_blocks(end_time);
CREATE INDEX idx_schedule_blocks_task_id ON schedule_blocks(task_id);
```

**Column Descriptions**:

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | UUID v4 primary key |
| `block_type` | TEXT | `focus`, `break`, `routine`, `calendar` |
| `task_id` | TEXT | Associated task ID (optional) |
| `start_time` | TEXT | ISO 8601 start time |
| `end_time` | TEXT | ISO 8601 end time |
| `locked` | BOOLEAN | User-pinned (true) or auto-scheduled (false) |
| `label` | TEXT | Optional display label |
| `lane` | INTEGER | Lane index for parallel scheduling (0-3) |

**Example Row**:
```json
{
  "id": "block-123",
  "block_type": "focus",
  "task_id": "task-456",
  "start_time": "2025-01-09T09:00:00+00:00",
  "end_time": "2025-01-09T09:25:00+00:00",
  "locked": true,
  "label": "Deep Work",
  "lane": 0
}
```

---

## TOML Configuration Schema

**Location**: `~/.config/pomodoroom/config.toml`

```toml
# Timer Configuration
focus_duration = 25     # Focus session duration (minutes)
short_break = 5         # Short break duration (minutes)
long_break = 15         # Long break duration (minutes)
sessions_until_long = 4 # Number of focus sessions before long break

# Sound Configuration
enable_sound = true     # Play sound on session complete
volume = 0.7            # Sound volume (0.0 - 1.0)

# Notification Configuration
enable_notification = true  # Show desktop notification
notification_title = "Pomodoro Complete"
notification_body = "Time for a break!"

# Theme Configuration
theme = "system"         # "light", "dark", "system"
accent_color = "#6200EE"

# Window Configuration
remember_position = true  # Save window position
always_on_top = false     # Window always on top

# Integration Configuration
# (OAuth tokens stored in OS keyring, not here)
google_enabled = false
notion_enabled = false
```

**Full Schema** (Rust):

```rust
pub struct Config {
    // Timer
    pub focus_duration: u32,
    pub short_break: u32,
    pub long_break: u32,
    pub sessions_until_long: u32,

    // Sound
    pub enable_sound: bool,
    pub volume: f32,

    // Notification
    pub enable_notification: bool,
    pub notification_title: String,
    pub notification_body: String,

    // Theme
    pub theme: String,
    pub accent_color: String,

    // Window
    pub remember_position: bool,
    pub always_on_top: bool,

    // Integrations
    pub google_enabled: bool,
    pub notion_enabled: bool,
}
```

---

## OS Keyring Entries

**Service Name**: `pomodoroom`

OAuth tokens are stored securely in the OS keyring, never in plaintext files.

### Entry Format

| Entry Name | Format | Description |
|------------|--------|-------------|
| `pomodoroom-google` | `service="pomodoroom", user="google"` | Google OAuth tokens |
| `pomodoroom-notion` | `service="pomodoroom", user="notion"` | Notion OAuth tokens |
| `pomodoroom-linear` | `service="pomodoroom", user="linear"` | Linear OAuth tokens |
| `pomodoroom-github` | `service="pomodoroom", user="github"` | GitHub OAuth tokens |
| `pomodoroom-discord` | `service="pomodoroom", user="discord"` | Discord OAuth tokens |
| `pomodoroom-slack` | `service="pomodoroom", user="slack"` | Slack OAuth tokens |

### Token Schema

```json
{
  "accessToken": "ya29.a0AfH6...",
  "refreshToken": "1//0gxxx...",
  "expiresIn": 3600,
  "tokenType": "Bearer",
  "scope": "https://www.googleapis.com/auth/calendar"
}
```

### Keyring Commands

```bash
# macOS (using security command)
security find-generic-password -s pomodoroom -a google

# Linux (using keyctl)
keyctl request key pomodoroom google @u

# Windows (using Credential Manager)
# Use Windows Credential Manager UI or cmdkey
```

---

## TypeScript Type Definitions

### Core Types

```typescript
// Timer State
type TimerState = "idle" | "running" | "paused" | "completed";

type StepType = "focus" | "break";

interface TimerSnapshot {
  state: TimerState;
  step_index: number;
  step_type: StepType;
  step_label: string;
  remaining_ms: number;
  total_ms: number;
  schedule_progress_pct: number;
  at: string; // ISO 8601
}

// Task State
type TaskState = "ready" | "running" | "paused" | "done";

type EnergyLevel = "high" | "medium" | "low";

type TaskCategory = "active" | "someday";

interface Task {
  id: string;
  title: string;
  description?: string;
  estimated_pomodoros: number;
  completed_pomodoros: number;
  completed: boolean;
  state: TaskState;
  project_id?: string;
  project_name?: string;
  tags: string[];
  priority?: number; // 0-100
  category: TaskCategory;
  estimated_minutes?: number;
  elapsed_minutes: number;
  energy: EnergyLevel;
  group?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  paused_at?: string;
}

// Project
interface Project {
  id: string;
  name: string;
  deadline?: string;
  created_at: string;
}

// Schedule
type BlockType = "focus" | "break" | "routine" | "calendar";

interface ScheduleBlock {
  id: string;
  block_type: BlockType;
  task_id?: string;
  start_time: string;
  end_time: string;
  locked: boolean;
  label?: string;
  lane?: number;
}

// Daily Template
interface FixedEvent {
  title: string;
  start: string; // HH:MM
  end: string;   // HH:MM
  type?: "routine" | "calendar";
}

interface DailyTemplate {
  wake_up: string; // HH:MM
  sleep: string;   // HH:MM
  fixed_events: FixedEvent[];
  max_parallel_lanes?: number;
}

// Session
interface SessionRecord {
  id: number;
  step_type: string;
  step_label: string;
  duration_min: number;
  started_at: string;
  completed_at: string;
  task_id?: string;
  project_id?: string;
}

// Stats
interface Stats {
  total_sessions: number;
  total_focus_min: number;
  total_break_min: number;
  completed_pomodoros: number;
  today_sessions: number;
  today_focus_min: number;
}
```

### Event Types

```typescript
type Event =
  | TimerStarted
  | TimerPaused
  | TimerResumed
  | TimerReset
  | TimerSkipped
  | TimerCompleted
  | StateSnapshot;

interface TimerStarted {
  type: "TimerStarted";
  step_index: number;
  step_type: StepType;
  duration_secs: number;
  at: string;
}

interface TimerCompleted {
  type: "TimerCompleted";
  step_index: number;
  step_type: StepType;
  at: string;
}
```
