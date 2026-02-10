//! SQLite-based storage for tasks, projects, and daily templates.

use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use serde_json;
use uuid::Uuid;

use super::data_dir;
use crate::schedule::{DailyTemplate, FixedEvent, Project, ScheduleBlock, Task, TaskCategory};

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
                created_at TEXT NOT NULL
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
        Ok(())
    }

    // === Task CRUD ===

    /// Create a new task.
    pub fn create_task(&self, task: &Task) -> Result<(), rusqlite::Error> {
        let tags_json = serde_json::to_string(&task.tags).unwrap();
        let category_str = match task.category {
            TaskCategory::Active => "Active",
            TaskCategory::Someday => "Someday",
        };

        self.conn.execute(
            "INSERT INTO tasks (id, title, description, estimated_pomodoros, completed_pomodoros,
                               completed, project_id, tags, priority, category, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
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
            ],
        )?;
        Ok(())
    }

    /// Get a task by ID.
    pub fn get_task(&self, id: &str) -> Result<Option<Task>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, description, estimated_pomodoros, completed_pomodoros,
                    completed, project_id, tags, priority, category, created_at
             FROM tasks WHERE id = ?1",
        )?;

        let result = stmt.query_row(params![id], |row| {
            let tags_json: String = row.get(7)?;
            let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();

            let category_str: String = row.get(9)?;
            let category = match category_str.as_str() {
                "Someday" => TaskCategory::Someday,
                _ => TaskCategory::Active,
            };

            let created_at_str: String = row.get(10)?;
            let created_at = DateTime::parse_from_rfc3339(&created_at_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());

            Ok(Task {
                id: row.get(0)?,
                title: row.get(1)?,
                description: row.get(2)?,
                estimated_pomodoros: row.get(3)?,
                completed_pomodoros: row.get(4)?,
                completed: row.get(5)?,
                project_id: row.get(6)?,
                tags,
                priority: row.get(8)?,
                category,
                created_at,
            })
        });

        match result {
            Ok(task) => Ok(Some(task)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// List all tasks.
    pub fn list_tasks(&self) -> Result<Vec<Task>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, description, estimated_pomodoros, completed_pomodoros,
                    completed, project_id, tags, priority, category, created_at
             FROM tasks",
        )?;

        let tasks = stmt.query_map([], |row| {
            let tags_json: String = row.get(7)?;
            let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();

            let category_str: String = row.get(9)?;
            let category = match category_str.as_str() {
                "Someday" => TaskCategory::Someday,
                _ => TaskCategory::Active,
            };

            let created_at_str: String = row.get(10)?;
            let created_at = DateTime::parse_from_rfc3339(&created_at_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());

            Ok(Task {
                id: row.get(0)?,
                title: row.get(1)?,
                description: row.get(2)?,
                estimated_pomodoros: row.get(3)?,
                completed_pomodoros: row.get(4)?,
                completed: row.get(5)?,
                project_id: row.get(6)?,
                tags,
                priority: row.get(8)?,
                category,
                created_at,
            })
        })?;

        tasks.collect()
    }

    /// Update an existing task.
    pub fn update_task(&self, task: &Task) -> Result<(), rusqlite::Error> {
        let tags_json = serde_json::to_string(&task.tags).unwrap();
        let category_str = match task.category {
            TaskCategory::Active => "Active",
            TaskCategory::Someday => "Someday",
        };

        self.conn.execute(
            "UPDATE tasks
             SET title = ?1, description = ?2, estimated_pomodoros = ?3, completed_pomodoros = ?4,
                 completed = ?5, project_id = ?6, tags = ?7, priority = ?8, category = ?9
             WHERE id = ?10",
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
                task.id,
            ],
        )?;
        Ok(())
    }

    /// Delete a task.
    pub fn delete_task(&self, id: &str) -> Result<(), rusqlite::Error> {
        self.conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])?;
        Ok(())
    }

    // === Project CRUD ===

    /// Create a new project.
    pub fn create_project(&self, project: &Project) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "INSERT INTO projects (id, name, deadline, created_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                project.id,
                project.name,
                project.deadline.map(|d| d.to_rfc3339()),
                project.created_at.to_rfc3339(),
            ],
        )?;
        Ok(())
    }

    /// Get a project by ID (without tasks).
    pub fn get_project(&self, id: &str) -> Result<Option<Project>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, deadline, created_at FROM projects WHERE id = ?1",
        )?;

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
            })
        });

        match result {
            Ok(project) => Ok(Some(project)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// List all projects.
    pub fn list_projects(&self) -> Result<Vec<Project>, rusqlite::Error> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, deadline, created_at FROM projects")?;

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
            })
        })?;

        projects.collect()
    }

    /// Update a project.
    pub fn update_project(&self, project: &Project) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "UPDATE projects SET name = ?1, deadline = ?2 WHERE id = ?3",
            params![
                project.name,
                project.deadline.map(|d| d.to_rfc3339()),
                project.id,
            ],
        )?;
        Ok(())
    }

    /// Delete a project.
    pub fn delete_project(&self, id: &str) -> Result<(), rusqlite::Error> {
        self.conn.execute("DELETE FROM projects WHERE id = ?1", params![id])?;
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
        use crate::schedule::BlockType;

        let block_type_str = match block.block_type {
            BlockType::Focus => "focus",
            BlockType::Break => "break",
            BlockType::Routine => "routine",
            BlockType::Calendar => "calendar",
        };

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
        use crate::schedule::BlockType;

        let mut stmt = self.conn.prepare(
            "SELECT id, block_type, task_id, start_time, end_time, locked, label, lane
             FROM schedule_blocks WHERE id = ?1",
        )?;

        let result = stmt.query_row(params![id], |row| {
            let block_type_str: String = row.get(1)?;
            let block_type = match block_type_str.as_str() {
                "focus" => BlockType::Focus,
                "break" => BlockType::Break,
                "routine" => BlockType::Routine,
                "calendar" => BlockType::Calendar,
                _ => BlockType::Focus,
            };

            let start_time_str: String = row.get(3)?;
            let start_time = DateTime::parse_from_rfc3339(&start_time_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());

            let end_time_str: String = row.get(4)?;
            let end_time = DateTime::parse_from_rfc3339(&end_time_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());

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
        });

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
        use crate::schedule::BlockType;

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

        let blocks = if let (Some(ref st), Some(ref et)) = (start_str, end_str) {
            stmt.query_map([st as &str, et as &str], |row| {
                let block_type_str: String = row.get(1)?;
                let block_type = match block_type_str.as_str() {
                    "focus" => BlockType::Focus,
                    "break" => BlockType::Break,
                    "routine" => BlockType::Routine,
                    "calendar" => BlockType::Calendar,
                    _ => BlockType::Focus,
                };

                let start_time_str: String = row.get(3)?;
                let start_time = DateTime::parse_from_rfc3339(&start_time_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now());

                let end_time_str: String = row.get(4)?;
                let end_time = DateTime::parse_from_rfc3339(&end_time_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now());

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
            })?.collect()
        } else if let Some(st) = start_str {
            stmt.query_map([&st], |row| {
                let block_type_str: String = row.get(1)?;
                let block_type = match block_type_str.as_str() {
                    "focus" => BlockType::Focus,
                    "break" => BlockType::Break,
                    "routine" => BlockType::Routine,
                    "calendar" => BlockType::Calendar,
                    _ => BlockType::Focus,
                };

                let start_time_str: String = row.get(3)?;
                let start_time = DateTime::parse_from_rfc3339(&start_time_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now());

                let end_time_str: String = row.get(4)?;
                let end_time = DateTime::parse_from_rfc3339(&end_time_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now());

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
            })?.collect()
        } else if let Some(et) = end_str {
            stmt.query_map([&et], |row| {
                let block_type_str: String = row.get(1)?;
                let block_type = match block_type_str.as_str() {
                    "focus" => BlockType::Focus,
                    "break" => BlockType::Break,
                    "routine" => BlockType::Routine,
                    "calendar" => BlockType::Calendar,
                    _ => BlockType::Focus,
                };

                let start_time_str: String = row.get(3)?;
                let start_time = DateTime::parse_from_rfc3339(&start_time_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now());

                let end_time_str: String = row.get(4)?;
                let end_time = DateTime::parse_from_rfc3339(&end_time_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now());

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
            })?.collect()
        } else {
            stmt.query_map([], |row| {
                let block_type_str: String = row.get(1)?;
                let block_type = match block_type_str.as_str() {
                    "focus" => BlockType::Focus,
                    "break" => BlockType::Break,
                    "routine" => BlockType::Routine,
                    "calendar" => BlockType::Calendar,
                    _ => BlockType::Focus,
                };

                let start_time_str: String = row.get(3)?;
                let start_time = DateTime::parse_from_rfc3339(&start_time_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now());

                let end_time_str: String = row.get(4)?;
                let end_time = DateTime::parse_from_rfc3339(&end_time_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now());

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
            })?.collect()
        };

        blocks
    }

    /// Update an existing schedule block.
    pub fn update_schedule_block(&self, block: &ScheduleBlock) -> Result<(), rusqlite::Error> {
        use crate::schedule::BlockType;

        let block_type_str = match block.block_type {
            BlockType::Focus => "focus",
            BlockType::Break => "break",
            BlockType::Routine => "routine",
            BlockType::Calendar => "calendar",
        };

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
        self.conn.execute("DELETE FROM schedule_blocks WHERE id = ?1", params![id])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_task() -> Task {
        Task {
            id: Uuid::new_v4().to_string(),
            title: "Test task".to_string(),
            description: Some("A test task".to_string()),
            estimated_pomodoros: 4,
            completed_pomodoros: 0,
            completed: false,
            project_id: None,
            tags: vec!["test".to_string()],
            priority: Some(1),
            category: TaskCategory::Active,
            created_at: Utc::now(),
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
}
