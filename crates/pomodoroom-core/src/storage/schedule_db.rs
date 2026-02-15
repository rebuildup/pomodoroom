//! SQLite-based storage for tasks, projects, and daily templates.

use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use serde_json;
use uuid::Uuid;

use super::data_dir;
use super::migrations;
use crate::schedule::{DailyTemplate, FixedEvent, Group, Project, ScheduleBlock};
use crate::task::{EnergyLevel, Task, TaskCategory, TaskKind, TaskState};
use crate::schedule::ProjectReference;

// === Helper Functions ===

/// Parse task category from database string
fn parse_task_category(category_str: &str) -> TaskCategory {
    match category_str {
        "Someday" => TaskCategory::Someday,
        _ => TaskCategory::Active,
    }
}

/// Format task category for database storage
fn format_task_category(category: TaskCategory) -> &'static str {
    match category {
        TaskCategory::Active => "Active",
        TaskCategory::Someday => "Someday",
    }
}

/// Parse block type from database string
fn parse_block_type(block_type_str: &str) -> crate::schedule::BlockType {
    match block_type_str {
        "focus" => crate::schedule::BlockType::Focus,
        "break" => crate::schedule::BlockType::Break,
        "routine" => crate::schedule::BlockType::Routine,
        "calendar" => crate::schedule::BlockType::Calendar,
        _ => crate::schedule::BlockType::Focus,
    }
}

/// Format block type for database storage
fn format_block_type(block_type: crate::schedule::BlockType) -> &'static str {
    match block_type {
        crate::schedule::BlockType::Focus => "focus",
        crate::schedule::BlockType::Break => "break",
        crate::schedule::BlockType::Routine => "routine",
        crate::schedule::BlockType::Calendar => "calendar",
    }
}

/// Parse task state from database string
fn parse_task_state(state_str: &str) -> TaskState {
    match state_str {
        "RUNNING" => TaskState::Running,
        "PAUSED" => TaskState::Paused,
        "DONE" => TaskState::Done,
        _ => TaskState::Ready,
    }
}

/// Format task state for database storage
fn format_task_state(state: TaskState) -> &'static str {
    match state {
        TaskState::Ready => "READY",
        TaskState::Running => "RUNNING",
        TaskState::Paused => "PAUSED",
        TaskState::Done => "DONE",
    }
}

/// Parse task kind from database string
fn parse_task_kind(kind_str: Option<&str>) -> TaskKind {
    match kind_str {
        Some("fixed_event") => TaskKind::FixedEvent,
        Some("flex_window") => TaskKind::FlexWindow,
        Some("break") => TaskKind::Break,
        _ => TaskKind::DurationOnly,
    }
}

/// Format task kind for database storage
fn format_task_kind(kind: TaskKind) -> &'static str {
    match kind {
        TaskKind::FixedEvent => "fixed_event",
        TaskKind::FlexWindow => "flex_window",
        TaskKind::DurationOnly => "duration_only",
        TaskKind::Break => "break",
    }
}

/// Parse energy level from database string
fn parse_energy_level(energy_str: Option<&str>) -> EnergyLevel {
    match energy_str {
        Some("LOW") => EnergyLevel::Low,
        Some("HIGH") => EnergyLevel::High,
        _ => EnergyLevel::Medium,
    }
}

/// Format energy level for database storage
fn format_energy_level(energy: Option<&EnergyLevel>) -> Option<&'static str> {
    energy.map(|e| match e {
        EnergyLevel::Low => "LOW",
        EnergyLevel::Medium => "MEDIUM",
        EnergyLevel::High => "HIGH",
    })
}

/// Parse datetime from RFC3339 string with fallback to current time
fn parse_datetime_fallback(dt_str: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(dt_str)
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now())
}

/// Build a ScheduleBlock from a database row
fn row_to_schedule_block(row: &rusqlite::Row) -> Result<ScheduleBlock, rusqlite::Error> {
    let block_type_str: String = row.get(1)?;
    let block_type = parse_block_type(&block_type_str);

    let start_time_str: String = row.get(3)?;
    let start_time = parse_datetime_fallback(&start_time_str);

    let end_time_str: String = row.get(4)?;
    let end_time = parse_datetime_fallback(&end_time_str);

    Ok(ScheduleBlock {
        id: row.get(0)?,
        block_type,
        task_id: row.get(2)?,
        start_time,
        end_time,
        locked: row.get(5)?,
        label: row.get(6)?,
        lane: row.get(7)?,
    })
}

/// SQLite database for schedule storage.
///
/// Stores tasks, projects, and daily templates.
pub struct ScheduleDb {
    conn: Connection,
}

impl ScheduleDb {
    /// Open the schedule database at `~/.config/pomodoroom/pomodoroom.db`.
    ///
    /// Creates tables if they don't exist.
    ///
    /// # Errors
    /// Returns an error if the database cannot be opened or migrated.
    pub fn open() -> Result<Self, Box<dyn std::error::Error>> {
        let path = data_dir()?.join("pomodoroom.db");
        let conn = Connection::open(path)?;
        let db = Self { conn };
        db.migrate()?;
        Ok(db)
    }

    /// Open an in-memory database (for tests).
    #[cfg(test)]
    pub fn open_memory() -> Result<Self, Box<dyn std::error::Error>> {
        let conn = Connection::open_in_memory()?;
        let db = Self { conn };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> Result<(), rusqlite::Error> {
        // Create base tables (v1 schema) first
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS tasks (
                id                    TEXT PRIMARY KEY,
                title                 TEXT NOT NULL,
                description           TEXT,
                estimated_pomodoros   INTEGER NOT NULL DEFAULT 0,
                completed_pomodoros   INTEGER NOT NULL DEFAULT 0,
                completed             INTEGER NOT NULL DEFAULT 0,
                project_id            TEXT,
                tags                  TEXT NOT NULL DEFAULT '[]',
                priority              INTEGER,
                category              TEXT NOT NULL DEFAULT 'Active',
                created_at            TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS projects (
                id         TEXT PRIMARY KEY,
                name       TEXT NOT NULL,
                deadline   TEXT,
                created_at TEXT NOT NULL,
                is_pinned  INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS daily_templates (
                id                 TEXT PRIMARY KEY,
                wake_up            TEXT NOT NULL,
                sleep              TEXT NOT NULL,
                fixed_events       TEXT NOT NULL DEFAULT '[]',
                max_parallel_lanes INTEGER
            );

            CREATE TABLE IF NOT EXISTS fixed_events (
                id               TEXT PRIMARY KEY,
                name             TEXT NOT NULL,
                start_time       TEXT NOT NULL,
                duration_minutes INTEGER NOT NULL,
                days             TEXT NOT NULL DEFAULT '[]',
                enabled          INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS schedule_blocks (
                id         TEXT PRIMARY KEY,
                block_type TEXT NOT NULL,
                task_id    TEXT,
                start_time TEXT NOT NULL,
                end_time   TEXT NOT NULL,
                locked     INTEGER NOT NULL DEFAULT 0,
                label      TEXT,
                lane       INTEGER
            );",
        )?;

        // Run incremental migrations (v1 -> v2 -> v3, etc.)
        migrations::migrate(&self.conn)?;

        Ok(())
    }

    fn set_task_projects(&self, task_id: &str, project_ids: &[String]) -> Result<(), rusqlite::Error> {
        self.conn
            .execute("DELETE FROM task_projects WHERE task_id = ?1", params![task_id])?;
        for (index, project_id) in project_ids.iter().enumerate() {
            self.conn.execute(
                "INSERT INTO task_projects (task_id, project_id, order_index) VALUES (?1, ?2, ?3)",
                params![task_id, project_id, index as i64],
            )?;
        }
        Ok(())
    }

    fn load_task_projects(&self, task_id: &str) -> Result<Vec<String>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT project_id FROM task_projects WHERE task_id = ?1 ORDER BY order_index ASC",
        )?;
        let mut rows = stmt.query(params![task_id])?;
        let mut values = Vec::new();
        while let Some(row) = rows.next()? {
            values.push(row.get(0)?);
        }
        Ok(values)
    }

    fn set_task_groups(&self, task_id: &str, group_ids: &[String]) -> Result<(), rusqlite::Error> {
        self.conn
            .execute("DELETE FROM task_groups WHERE task_id = ?1", params![task_id])?;
        for (index, group_id) in group_ids.iter().enumerate() {
            self.conn.execute(
                "INSERT INTO task_groups (task_id, group_id, order_index) VALUES (?1, ?2, ?3)",
                params![task_id, group_id, index as i64],
            )?;
        }
        Ok(())
    }

    fn load_task_groups(&self, task_id: &str) -> Result<Vec<String>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT group_id FROM task_groups WHERE task_id = ?1 ORDER BY order_index ASC",
        )?;
        let mut rows = stmt.query(params![task_id])?;
        let mut values = Vec::new();
        while let Some(row) = rows.next()? {
            values.push(row.get(0)?);
        }
        Ok(values)
    }

    fn set_project_references(
        &self,
        project_id: &str,
        references: &[ProjectReference],
    ) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "DELETE FROM project_references WHERE project_id = ?1",
            params![project_id],
        )?;
        for reference in references {
            self.conn.execute(
                "INSERT INTO project_references (id, project_id, kind, value, label, meta_json, order_index, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    reference.id,
                    project_id,
                    reference.kind,
                    reference.value,
                    reference.label,
                    reference.meta_json,
                    reference.order_index,
                    reference.created_at.to_rfc3339(),
                    reference.updated_at.to_rfc3339(),
                ],
            )?;
        }
        Ok(())
    }

    fn load_project_references(&self, project_id: &str) -> Result<Vec<ProjectReference>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, kind, value, label, meta_json, order_index, created_at, updated_at
             FROM project_references
             WHERE project_id = ?1
             ORDER BY order_index ASC",
        )?;
        let mut rows = stmt.query(params![project_id])?;
        let mut results = Vec::new();
        while let Some(row) = rows.next()? {
            let created_at = DateTime::parse_from_rfc3339(&row.get::<_, String>(6)?)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());
            let updated_at = DateTime::parse_from_rfc3339(&row.get::<_, String>(7)?)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());
            results.push(ProjectReference {
                id: row.get(0)?,
                project_id: project_id.to_string(),
                kind: row.get(1)?,
                value: row.get(2)?,
                label: row.get(3)?,
                meta_json: row.get(4)?,
                order_index: row.get(5)?,
                created_at,
                updated_at,
            });
        }
        Ok(results)
    }

    // === Task CRUD ===

    /// Create a new task.
    pub fn create_task(&self, task: &Task) -> Result<(), rusqlite::Error> {
        let tags_json = serde_json::to_string(&task.tags).unwrap();
        let category_str = format_task_category(task.category);
        let state_str = format_task_state(task.state);
        let kind_str = format_task_kind(task.kind);
        let energy_str = format_energy_level(Some(&task.energy));

        self.conn.execute(
            "INSERT INTO tasks (
                id, title, description, estimated_pomodoros, completed_pomodoros,
                completed, project_id, tags, priority, category, created_at,
                state, estimated_minutes, elapsed_minutes, energy, group_name,
                updated_at, completed_at, paused_at, project_name, kind,
                required_minutes, fixed_start_at, fixed_end_at, window_start_at, window_end_at, estimated_start_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27)",
            params![
                task.id,
                task.title,
                task.description,
                task.estimated_pomodoros,
                task.completed_pomodoros,
                task.completed,
                task.project_id,
                tags_json,
                task.priority,
                category_str,
                task.created_at.to_rfc3339(),
                state_str,
                task.estimated_minutes,
                task.elapsed_minutes,
                energy_str,
                task.group,
                task.updated_at.to_rfc3339(),
                task.completed_at.map(|dt| dt.to_rfc3339()),
                task.paused_at.map(|dt| dt.to_rfc3339()),
                task.project_name,
                kind_str,
                task.required_minutes,
                task.fixed_start_at.map(|dt| dt.to_rfc3339()),
                task.fixed_end_at.map(|dt| dt.to_rfc3339()),
                task.window_start_at.map(|dt| dt.to_rfc3339()),
                task.window_end_at.map(|dt| dt.to_rfc3339()),
                task.estimated_start_at.map(|dt| dt.to_rfc3339()),
            ],
        )?;
        self.set_task_projects(&task.id, &task.project_ids)?;
        self.set_task_groups(&task.id, &task.group_ids)?;
        Ok(())
    }

    /// Get a task by ID.
    pub fn get_task(&self, id: &str) -> Result<Option<Task>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, description, estimated_pomodoros, completed_pomodoros,
                    completed, project_id, tags, priority, category, created_at,
                    state, estimated_minutes, elapsed_minutes, energy, group_name,
                    updated_at, completed_at, paused_at, project_name, kind,
                    required_minutes, fixed_start_at, fixed_end_at, window_start_at, window_end_at, estimated_start_at
             FROM tasks WHERE id = ?1",
        )?;

        let result = stmt.query_row(params![id], |row| {
            let tags_json: String = row.get(7)?;
            let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();

            let category_str: String = row.get(9)?;
            let category = parse_task_category(&category_str);

            let created_at_str: String = row.get(10)?;
            let created_at = parse_datetime_fallback(&created_at_str);

            // New v2 fields
            let state_str: String = row.get(11)?;
            let state = parse_task_state(&state_str);

            let energy_str: Option<String> = row.get(14)?;
            let energy = parse_energy_level(energy_str.as_deref());
            let kind_str: Option<String> = row.get(20)?;
            let kind = parse_task_kind(kind_str.as_deref());

            let updated_at_str: String = row.get(16)?;
            let updated_at = parse_datetime_fallback(&updated_at_str);

            let completed_at_str: Option<String> = row.get(17)?;
            let completed_at = completed_at_str
                .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.with_timezone(&Utc));

            let paused_at_str: Option<String> = row.get(18)?;
            let paused_at = paused_at_str
                .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.with_timezone(&Utc));
            let fixed_start_at_str: Option<String> = row.get(22)?;
            let fixed_start_at = fixed_start_at_str
                .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.with_timezone(&Utc));
            let fixed_end_at_str: Option<String> = row.get(23)?;
            let fixed_end_at = fixed_end_at_str
                .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.with_timezone(&Utc));
            let window_start_at_str: Option<String> = row.get(24)?;
            let window_start_at = window_start_at_str
                .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.with_timezone(&Utc));
            let window_end_at_str: Option<String> = row.get(25)?;
            let window_end_at = window_end_at_str
                .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.with_timezone(&Utc));
            let estimated_start_at_str: Option<String> = row.get(26)?;
            let estimated_start_at = estimated_start_at_str
                .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.with_timezone(&Utc));

            Ok(Task {
                id: row.get(0)?,
                title: row.get(1)?,
                description: row.get(2)?,
                estimated_pomodoros: row.get(3)?,
                completed_pomodoros: row.get(4)?,
                completed: row.get(5)?,
                state,
                project_id: row.get(6)?,
                project_name: row.get(19)?,
                project_ids: Vec::new(),
                kind,
                required_minutes: row.get(21)?,
                fixed_start_at,
                fixed_end_at,
                window_start_at,
                window_end_at,
                tags,
                priority: row.get(8)?,
                category,
                estimated_minutes: row.get(12)?,
                estimated_start_at,
                elapsed_minutes: row.get(13)?,
                energy,
                group: row.get(15)?,
                group_ids: Vec::new(),
                created_at,
                updated_at,
                completed_at,
                paused_at,
            })
        });

        match result {
            Ok(mut task) => {
                task.project_ids = self.load_task_projects(&task.id)?;
                task.group_ids = self.load_task_groups(&task.id)?;
                Ok(Some(task))
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// List all tasks.
    pub fn list_tasks(&self) -> Result<Vec<Task>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, description, estimated_pomodoros, completed_pomodoros,
                    completed, project_id, tags, priority, category, created_at,
                    state, estimated_minutes, elapsed_minutes, energy, group_name,
                    updated_at, completed_at, paused_at, project_name, kind,
                    required_minutes, fixed_start_at, fixed_end_at, window_start_at, window_end_at, estimated_start_at
             FROM tasks",
        )?;

        let tasks = stmt.query_map([], |row| {
            let tags_json: String = row.get(7)?;
            let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();

            let category_str: String = row.get(9)?;
            let category = parse_task_category(&category_str);

            let created_at_str: String = row.get(10)?;
            let created_at = parse_datetime_fallback(&created_at_str);

            // New v2 fields
            let state_str: String = row.get(11)?;
            let state = parse_task_state(&state_str);

            let energy_str: Option<String> = row.get(14)?;
            let energy = parse_energy_level(energy_str.as_deref());
            let kind_str: Option<String> = row.get(20)?;
            let kind = parse_task_kind(kind_str.as_deref());

            let updated_at_str: String = row.get(16)?;
            let updated_at = parse_datetime_fallback(&updated_at_str);

            let completed_at_str: Option<String> = row.get(17)?;
            let completed_at = completed_at_str
                .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.with_timezone(&Utc));

            let paused_at_str: Option<String> = row.get(18)?;
            let paused_at = paused_at_str
                .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.with_timezone(&Utc));
            let fixed_start_at_str: Option<String> = row.get(22)?;
            let fixed_start_at = fixed_start_at_str
                .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.with_timezone(&Utc));
            let fixed_end_at_str: Option<String> = row.get(23)?;
            let fixed_end_at = fixed_end_at_str
                .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.with_timezone(&Utc));
            let window_start_at_str: Option<String> = row.get(24)?;
            let window_start_at = window_start_at_str
                .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.with_timezone(&Utc));
            let window_end_at_str: Option<String> = row.get(25)?;
            let window_end_at = window_end_at_str
                .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.with_timezone(&Utc));
            let estimated_start_at_str: Option<String> = row.get(26)?;
            let estimated_start_at = estimated_start_at_str
                .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.with_timezone(&Utc));

            Ok(Task {
                id: row.get(0)?,
                title: row.get(1)?,
                description: row.get(2)?,
                estimated_pomodoros: row.get(3)?,
                completed_pomodoros: row.get(4)?,
                completed: row.get(5)?,
                state,
                project_id: row.get(6)?,
                project_name: row.get(19)?,
                project_ids: Vec::new(),
                kind,
                required_minutes: row.get(21)?,
                fixed_start_at,
                fixed_end_at,
                window_start_at,
                window_end_at,
                tags,
                priority: row.get(8)?,
                category,
                estimated_minutes: row.get(12)?,
                estimated_start_at,
                elapsed_minutes: row.get(13)?,
                energy,
                group: row.get(15)?,
                group_ids: Vec::new(),
                created_at,
                updated_at,
                completed_at,
                paused_at,
            })
        })?;

        tasks.collect()
    }

    /// Update an existing task.
    pub fn update_task(&self, task: &Task) -> Result<(), rusqlite::Error> {
        let tags_json = serde_json::to_string(&task.tags).unwrap();
        let category_str = format_task_category(task.category);
        let state_str = format_task_state(task.state);
        let kind_str = format_task_kind(task.kind);
        let energy_str = format_energy_level(Some(&task.energy));

        self.conn.execute(
            "UPDATE tasks
             SET title = ?1, description = ?2, estimated_pomodoros = ?3, completed_pomodoros = ?4,
                 completed = ?5, project_id = ?6, tags = ?7, priority = ?8, category = ?9,
                 state = ?10, estimated_minutes = ?11, elapsed_minutes = ?12, energy = ?13,
                 group_name = ?14, updated_at = ?15, completed_at = ?16, paused_at = ?17,
                 project_name = ?18, kind = ?19, required_minutes = ?20, fixed_start_at = ?21,
                 fixed_end_at = ?22, window_start_at = ?23, window_end_at = ?24, estimated_start_at = ?25
             WHERE id = ?26",
            params![
                task.title,
                task.description,
                task.estimated_pomodoros,
                task.completed_pomodoros,
                task.completed,
                task.project_id,
                tags_json,
                task.priority,
                category_str,
                state_str,
                task.estimated_minutes,
                task.elapsed_minutes,
                energy_str,
                task.group,
                task.updated_at.to_rfc3339(),
                task.completed_at.map(|dt| dt.to_rfc3339()),
                task.paused_at.map(|dt| dt.to_rfc3339()),
                task.project_name,
                kind_str,
                task.required_minutes,
                task.fixed_start_at.map(|dt| dt.to_rfc3339()),
                task.fixed_end_at.map(|dt| dt.to_rfc3339()),
                task.window_start_at.map(|dt| dt.to_rfc3339()),
                task.window_end_at.map(|dt| dt.to_rfc3339()),
                task.estimated_start_at.map(|dt| dt.to_rfc3339()),
                task.id,
            ],
        )?;
        Ok(())
    }

    /// Delete a task.
    pub fn delete_task(&self, id: &str) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "DELETE FROM task_projects WHERE task_id = ?1",
            params![id],
        )?;
        self.conn
            .execute("DELETE FROM task_groups WHERE task_id = ?1", params![id])?;
        self.conn
            .execute("DELETE FROM tasks WHERE id = ?1", params![id])?;
        Ok(())
    }

    // === Project CRUD ===

    /// Create a new project.
    pub fn create_project(&self, project: &Project) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "INSERT INTO projects (id, name, deadline, created_at, is_pinned)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                project.id,
                project.name,
                project.deadline.map(|d| d.to_rfc3339()),
                project.created_at.to_rfc3339(),
                if project.is_pinned { 1 } else { 0 },
            ],
        )?;
        self.set_project_references(&project.id, &project.references)?;
        Ok(())
    }

    /// Get a project by ID (without tasks).
    pub fn get_project(&self, id: &str) -> Result<Option<Project>, rusqlite::Error> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, deadline, created_at, is_pinned FROM projects WHERE id = ?1")?;

        let result = stmt.query_row(params![id], |row| {
            let deadline_str: Option<String> = row.get(2)?;
            let deadline = deadline_str
                .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.with_timezone(&Utc));

            let created_at_str: String = row.get(3)?;
            let created_at = DateTime::parse_from_rfc3339(&created_at_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());

            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                deadline,
                tasks: Vec::new(), // Tasks loaded separately
                created_at,
                is_pinned: row.get::<_, i32>(4)? != 0,
                references: Vec::new(),
            })
        });

        match result {
            Ok(mut project) => {
                project.references = self.load_project_references(&project.id)?;
                Ok(Some(project))
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// List all projects.
    pub fn list_projects(&self) -> Result<Vec<Project>, rusqlite::Error> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, deadline, created_at, is_pinned FROM projects")?;

        let projects = stmt.query_map([], |row| {
            let deadline_str: Option<String> = row.get(2)?;
            let deadline = deadline_str
                .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.with_timezone(&Utc));

            let created_at_str: String = row.get(3)?;
            let created_at = DateTime::parse_from_rfc3339(&created_at_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());

            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                deadline,
                tasks: Vec::new(),
                created_at,
                is_pinned: row.get::<_, i32>(4)? != 0,
                references: Vec::new(),
            })
        })?;
        let mut items = projects.collect::<Result<Vec<Project>, _>>()?;
        for project in &mut items {
            project.references = self.load_project_references(&project.id)?;
        }
        Ok(items)
    }

    /// Update a project.
    pub fn update_project(&self, project: &Project) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "UPDATE projects SET name = ?1, deadline = ?2, is_pinned = ?3 WHERE id = ?4",
            params![
                project.name,
                project.deadline.map(|d| d.to_rfc3339()),
                if project.is_pinned { 1 } else { 0 },
                project.id,
            ],
        )?;
        self.set_project_references(&project.id, &project.references)?;
        Ok(())
    }

    /// Delete a project.
    pub fn delete_project(&self, id: &str) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "DELETE FROM project_references WHERE project_id = ?1",
            params![id],
        )?;
        self.conn
            .execute("DELETE FROM projects WHERE id = ?1", params![id])?;
        Ok(())
    }

    // === Group CRUD ===

    /// Create a new group.
    pub fn create_group(&self, group: &Group) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "INSERT INTO groups (id, name, parent_id, order_index, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                group.id,
                group.name,
                group.parent_id,
                group.order_index,
                group.created_at.to_rfc3339(),
                group.updated_at.to_rfc3339(),
            ],
        )?;
        Ok(())
    }

    /// List all groups.
    pub fn list_groups(&self) -> Result<Vec<Group>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, parent_id, order_index, created_at, updated_at
             FROM groups
             ORDER BY order_index ASC, created_at ASC",
        )?;
        let groups = stmt.query_map([], |row| {
            let created_at = parse_datetime_fallback(&row.get::<_, String>(4)?);
            let updated_at = parse_datetime_fallback(&row.get::<_, String>(5)?);
            Ok(Group {
                id: row.get(0)?,
                name: row.get(1)?,
                parent_id: row.get(2)?,
                order_index: row.get(3)?,
                created_at,
                updated_at,
            })
        })?;
        groups.collect()
    }

    /// Update a group.
    pub fn update_group(&self, group: &Group) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "UPDATE groups
             SET name = ?1, parent_id = ?2, order_index = ?3, updated_at = ?4
             WHERE id = ?5",
            params![
                group.name,
                group.parent_id,
                group.order_index,
                group.updated_at.to_rfc3339(),
                group.id,
            ],
        )?;
        Ok(())
    }

    /// Delete a group.
    pub fn delete_group(&self, id: &str) -> Result<(), rusqlite::Error> {
        self.conn
            .execute("DELETE FROM task_groups WHERE group_id = ?1", params![id])?;
        self.conn
            .execute("DELETE FROM groups WHERE id = ?1", params![id])?;
        Ok(())
    }

    // === DailyTemplate CRUD ===

    /// Create a new daily template.
    pub fn create_daily_template(&self, template: &DailyTemplate) -> Result<(), rusqlite::Error> {
        let id = Uuid::new_v4().to_string();
        let events_json = serde_json::to_string(&template.fixed_events).unwrap();

        self.conn.execute(
            "INSERT INTO daily_templates (id, wake_up, sleep, fixed_events, max_parallel_lanes)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                id,
                template.wake_up,
                template.sleep,
                events_json,
                template.max_parallel_lanes,
            ],
        )?;
        Ok(())
    }

    /// Get the daily template (returns first one, assumes single template).
    pub fn get_daily_template(&self) -> Result<Option<DailyTemplate>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT wake_up, sleep, fixed_events, max_parallel_lanes
             FROM daily_templates
             LIMIT 1",
        )?;

        let result = stmt.query_row([], |row| {
            let events_json: String = row.get(2)?;
            let fixed_events: Vec<FixedEvent> =
                serde_json::from_str(&events_json).unwrap_or_default();

            Ok(DailyTemplate {
                wake_up: row.get(0)?,
                sleep: row.get(1)?,
                fixed_events,
                max_parallel_lanes: row.get(3)?,
            })
        });

        match result {
            Ok(template) => Ok(Some(template)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// Update the daily template.
    pub fn update_daily_template(&self, template: &DailyTemplate) -> Result<(), rusqlite::Error> {
        let events_json = serde_json::to_string(&template.fixed_events).unwrap();

        self.conn.execute(
            "UPDATE daily_templates
             SET wake_up = ?1, sleep = ?2, fixed_events = ?3, max_parallel_lanes = ?4
             WHERE id = (SELECT id FROM daily_templates LIMIT 1)",
            params![
                template.wake_up,
                template.sleep,
                events_json,
                template.max_parallel_lanes,
            ],
        )?;
        Ok(())
    }

    // === ScheduleBlock CRUD ===

    /// Create a new schedule block.
    pub fn create_schedule_block(&self, block: &ScheduleBlock) -> Result<(), rusqlite::Error> {
        let block_type_str = format_block_type(block.block_type);

        self.conn.execute(
            "INSERT INTO schedule_blocks (id, block_type, task_id, start_time, end_time, locked, label, lane)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                block.id,
                block_type_str,
                block.task_id,
                block.start_time.to_rfc3339(),
                block.end_time.to_rfc3339(),
                block.locked,
                block.label,
                block.lane,
            ],
        )?;
        Ok(())
    }

    /// Get a schedule block by ID.
    pub fn get_schedule_block(&self, id: &str) -> Result<Option<ScheduleBlock>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, block_type, task_id, start_time, end_time, locked, label, lane
             FROM schedule_blocks WHERE id = ?1",
        )?;

        let result = stmt.query_row(params![id], |row| row_to_schedule_block(row));

        match result {
            Ok(block) => Ok(Some(block)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// List schedule blocks within a time range.
    pub fn list_schedule_blocks(
        &self,
        start_time: Option<&DateTime<Utc>>,
        end_time: Option<&DateTime<Utc>>,
    ) -> Result<Vec<ScheduleBlock>, rusqlite::Error> {
        let mut query = "SELECT id, block_type, task_id, start_time, end_time, locked, label, lane FROM schedule_blocks".to_string();
        let mut where_clauses = Vec::new();

        if start_time.is_some() {
            where_clauses.push("start_time >= ?");
        }
        if end_time.is_some() {
            where_clauses.push("end_time <= ?");
        }

        if !where_clauses.is_empty() {
            query += " WHERE ";
            query += &where_clauses.join(" AND ");
        }

        let start_str = start_time.as_ref().map(|t| t.to_rfc3339());
        let end_str = end_time.as_ref().map(|t| t.to_rfc3339());

        let mut stmt = self.conn.prepare(&query)?;

        let blocks = if let (Some(st), Some(et)) = (&start_str, &end_str) {
            stmt.query_map([st.as_str(), et.as_str()], |row| row_to_schedule_block(row))?
                .collect()
        } else if let Some(st) = &start_str {
            stmt.query_map([st.as_str()], |row| row_to_schedule_block(row))?
                .collect()
        } else if let Some(et) = &end_str {
            stmt.query_map([et.as_str()], |row| row_to_schedule_block(row))?
                .collect()
        } else {
            stmt.query_map([], |row| row_to_schedule_block(row))?
                .collect()
        };

        blocks
    }

    /// Update an existing schedule block.
    pub fn update_schedule_block(&self, block: &ScheduleBlock) -> Result<(), rusqlite::Error> {
        let block_type_str = format_block_type(block.block_type);

        self.conn.execute(
            "UPDATE schedule_blocks
             SET block_type = ?1, task_id = ?2, start_time = ?3, end_time = ?4, locked = ?5, label = ?6, lane = ?7
             WHERE id = ?8",
            params![
                block_type_str,
                block.task_id,
                block.start_time.to_rfc3339(),
                block.end_time.to_rfc3339(),
                block.locked,
                block.label,
                block.lane,
                block.id,
            ],
        )?;
        Ok(())
    }

    /// Delete a schedule block.
    pub fn delete_schedule_block(&self, id: &str) -> Result<(), rusqlite::Error> {
        self.conn
            .execute("DELETE FROM schedule_blocks WHERE id = ?1", params![id])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schedule::Group;

    fn make_test_task() -> Task {
        Task {
            id: Uuid::new_v4().to_string(),
            title: "Test task".to_string(),
            description: Some("A test task".to_string()),
            estimated_pomodoros: 4,
            completed_pomodoros: 0,
            completed: false,
            state: TaskState::Ready,
            project_id: None,
            project_name: None,
            project_ids: vec![],
            kind: TaskKind::DurationOnly,
            required_minutes: Some(100),
            fixed_start_at: None,
            fixed_end_at: None,
            window_start_at: None,
            window_end_at: None,
            tags: vec!["test".to_string()],
            priority: Some(1),
            category: TaskCategory::Active,
            estimated_minutes: None,
            estimated_start_at: None,
            elapsed_minutes: 0,
            energy: EnergyLevel::Medium,
            group: None,
            group_ids: vec![],
            created_at: Utc::now(),
            updated_at: Utc::now(),
            completed_at: None,
            paused_at: None,
        }
    }

    #[test]
    fn create_and_get_task() {
        let db = ScheduleDb::open_memory().unwrap();
        let task = make_test_task();
        db.create_task(&task).unwrap();

        let retrieved = db.get_task(&task.id).unwrap().unwrap();
        assert_eq!(retrieved.title, "Test task");
        assert_eq!(retrieved.estimated_pomodoros, 4);
        assert_eq!(retrieved.tags, vec!["test"]);
    }

    #[test]
    fn list_tasks() {
        let db = ScheduleDb::open_memory().unwrap();
        let task1 = make_test_task();
        let mut task2 = make_test_task();
        task2.title = "Another task".to_string();

        db.create_task(&task1).unwrap();
        db.create_task(&task2).unwrap();

        let tasks = db.list_tasks().unwrap();
        assert_eq!(tasks.len(), 2);
    }

    #[test]
    fn update_task() {
        let db = ScheduleDb::open_memory().unwrap();
        let mut task = make_test_task();
        db.create_task(&task).unwrap();

        task.title = "Updated task".to_string();
        task.completed_pomodoros = 2;
        db.update_task(&task).unwrap();

        let retrieved = db.get_task(&task.id).unwrap().unwrap();
        assert_eq!(retrieved.title, "Updated task");
        assert_eq!(retrieved.completed_pomodoros, 2);
    }

    #[test]
    fn delete_task() {
        let db = ScheduleDb::open_memory().unwrap();
        let task = make_test_task();
        db.create_task(&task).unwrap();

        db.delete_task(&task.id).unwrap();
        assert!(db.get_task(&task.id).unwrap().is_none());
    }

    #[test]
    fn create_and_get_project() {
        let db = ScheduleDb::open_memory().unwrap();
        let project = Project {
            id: Uuid::new_v4().to_string(),
            name: "Test Project".to_string(),
            deadline: None,
            tasks: vec![],
            created_at: Utc::now(),
            is_pinned: false,
            references: vec![],
        };

        db.create_project(&project).unwrap();

        let retrieved = db.get_project(&project.id).unwrap().unwrap();
        assert_eq!(retrieved.name, "Test Project");
    }

    #[test]
    fn daily_template() {
        let db = ScheduleDb::open_memory().unwrap();
        let template = DailyTemplate {
            wake_up: "07:00".to_string(),
            sleep: "23:00".to_string(),
            fixed_events: vec![FixedEvent {
                id: Uuid::new_v4().to_string(),
                name: "Lunch".to_string(),
                start_time: "12:00".to_string(),
                duration_minutes: 60,
                days: vec![1, 2, 3, 4, 5],
                enabled: true,
            }],
            max_parallel_lanes: Some(2),
        };

        db.create_daily_template(&template).unwrap();

        let retrieved = db.get_daily_template().unwrap().unwrap();
        assert_eq!(retrieved.wake_up, "07:00");
        assert_eq!(retrieved.fixed_events.len(), 1);
        assert_eq!(retrieved.fixed_events[0].name, "Lunch");
    }

    #[test]
    fn task_v2_fields_round_trip() {
        let db = ScheduleDb::open_memory().unwrap();
        let mut task = make_test_task();

        // Set all v2 fields
        task.state = TaskState::Running;
        task.estimated_minutes = Some(120);
        task.elapsed_minutes = 45;
        task.energy = EnergyLevel::High;
        task.group = Some("development".to_string());
        task.updated_at = Utc::now();
        task.paused_at = Some(Utc::now());

        db.create_task(&task).unwrap();

        let retrieved = db.get_task(&task.id).unwrap().unwrap();
        assert_eq!(retrieved.state, TaskState::Running);
        assert_eq!(retrieved.estimated_minutes, Some(120));
        assert_eq!(retrieved.elapsed_minutes, 45);
        assert_eq!(retrieved.energy, EnergyLevel::High);
        assert_eq!(retrieved.group, Some("development".to_string()));
        assert!(retrieved.paused_at.is_some());
    }

    #[test]
    fn task_state_migration_from_completed() {
        // Create a v1-style database and migrate it
        let conn = Connection::open_in_memory().unwrap();

        // Create v1 schema (without v2 columns)
        conn.execute_batch(
            "CREATE TABLE tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                estimated_pomodoros INTEGER NOT NULL DEFAULT 0,
                completed_pomodoros INTEGER NOT NULL DEFAULT 0,
                completed INTEGER NOT NULL DEFAULT 0,
                project_id TEXT,
                tags TEXT NOT NULL DEFAULT '[]',
                priority INTEGER,
                category TEXT NOT NULL DEFAULT 'Active',
                created_at TEXT NOT NULL
            );",
        )
        .unwrap();

        // Insert v1 data with completed=1
        conn.execute(
            "INSERT INTO tasks (id, title, completed, created_at)
             VALUES ('v1-task', 'Old completed task', 1, '2024-01-01T12:00:00Z')",
            [],
        )
        .unwrap();

        // Run v2 migration
        migrations::migrate(&conn).unwrap();

        // Check that state is DONE using raw SQL
        let state: String = conn
            .query_row("SELECT state FROM tasks WHERE id = 'v1-task'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(state, "DONE");

        // Check completed_at is set
        let completed_at: Option<String> = conn
            .query_row(
                "SELECT completed_at FROM tasks WHERE id = 'v1-task'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(completed_at.is_some());
    }

    #[test]
    fn task_state_migration_from_active() {
        // Create a v1-style database and migrate it
        let conn = Connection::open_in_memory().unwrap();

        // Create v1 schema
        conn.execute_batch(
            "CREATE TABLE tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                completed INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );",
        )
        .unwrap();

        // Insert v1 data with completed=0
        conn.execute(
            "INSERT INTO tasks (id, title, completed, created_at)
             VALUES ('v1-task2', 'Old active task', 0, '2024-01-01T12:00:00Z')",
            [],
        )
        .unwrap();

        // Run v2 migration
        migrations::migrate(&conn).unwrap();

        // Check that state is READY
        let state: String = conn
            .query_row("SELECT state FROM tasks WHERE id = 'v1-task2'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(state, "READY");

        // Check completed_at is NOT set
        let completed_at: Option<String> = conn
            .query_row(
                "SELECT completed_at FROM tasks WHERE id = 'v1-task2'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(completed_at.is_none());
    }

    #[test]
    fn task_update_v2_fields() {
        let db = ScheduleDb::open_memory().unwrap();
        let mut task = make_test_task();
        db.create_task(&task).unwrap();

        // Update v2 fields
        task.state = TaskState::Paused;
        task.elapsed_minutes = 30;
        task.paused_at = Some(Utc::now());
        db.update_task(&task).unwrap();

        let retrieved = db.get_task(&task.id).unwrap().unwrap();
        assert_eq!(retrieved.state, TaskState::Paused);
        assert_eq!(retrieved.elapsed_minutes, 30);
        assert!(retrieved.paused_at.is_some());
    }

    #[test]
    fn group_crud_round_trip() {
        let db = ScheduleDb::open_memory().unwrap();
        let now = Utc::now();
        let group = Group {
            id: Uuid::new_v4().to_string(),
            name: "仕事".to_string(),
            parent_id: None,
            order_index: 0,
            created_at: now,
            updated_at: now,
        };

        db.create_group(&group).unwrap();

        let groups = db.list_groups().unwrap();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].name, "仕事");

        db.delete_group(&group.id).unwrap();
        assert!(db.list_groups().unwrap().is_empty());
    }
}
