//! Schedule commands for Tauri IPC.
//!
//! This module provides Tauri command handlers for task, project, and
//! daily template management. Exposes the ScheduleDb functionality to
//! the frontend.

use chrono::{DateTime, Duration, Utc};
use pomodoroom_core::schedule::{DailyTemplate, Project, Task, TaskCategory};
use pomodoroom_core::scheduler::{AutoScheduler, CalendarEvent};
use pomodoroom_core::storage::ScheduleDb;
use serde_json::Value;
use uuid::Uuid;

// === Security Validation Constants ===

/// Maximum reasonable date offset from now (10 years in future)
const MAX_DATE_OFFSET_DAYS: i64 = 365 * 10;

/// Minimum reasonable date offset (100 years in past)
const MIN_DATE_OFFSET_DAYS: i64 = -365 * 100;

// === Security Validation Functions ===

/// Validate that a task ID is safe.
/// - Non-empty
/// - Reasonable length (< 100 chars)
/// - No null bytes or newlines
fn validate_task_id(id: &str) -> Result<(), String> {
    if id.is_empty() {
        return Err("Task ID cannot be empty".to_string());
    }
    if id.len() > 100 {
        return Err("Task ID is too long".to_string());
    }
    if id.contains('\0') || id.contains('\n') || id.contains('\r') {
        return Err("Task ID contains invalid characters".to_string());
    }
    Ok(())
}

/// Validate that a project ID is safe.
fn validate_project_id(id: &str) -> Result<(), String> {
    if id.is_empty() {
        return Err("Project ID cannot be empty".to_string());
    }
    if id.len() > 100 {
        return Err("Project ID is too long".to_string());
    }
    if id.contains('\0') || id.contains('\n') || id.contains('\r') {
        return Err("Project ID contains invalid characters".to_string());
    }
    Ok(())
}

/// Validate priority is within acceptable range (0-100).
fn validate_priority(priority: i32) -> Result<i32, String> {
    if priority < 0 || priority > 100 {
        Err(format!("Priority must be between 0 and 100, got {priority}"))
    } else {
        Ok(priority)
    }
}

/// Validate that a date string is within reasonable bounds.
/// Prevents unreasonably far future or past dates.
fn validate_date_bounds(dt: DateTime<Utc>) -> Result<DateTime<Utc>, String> {
    let now = Utc::now();
    let min_date = now + Duration::days(MIN_DATE_OFFSET_DAYS);
    let max_date = now + Duration::days(MAX_DATE_OFFSET_DAYS);

    if dt < min_date {
        Err(format!("Date is too far in the past: {}", dt.format("%Y-%m-%d")))
    } else if dt > max_date {
        Err(format!("Date is too far in the future: {}", dt.format("%Y-%m-%d")))
    } else {
        Ok(dt)
    }
}

/// Validate task/project name is safe.
/// - Non-empty
/// - Reasonable length (< 500 chars)
/// - No control characters (except whitespace)
fn validate_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Name cannot be empty".to_string());
    }
    if name.len() > 500 {
        return Err("Name is too long (max 500 characters)".to_string());
    }
    if name.chars().any(|c| c.is_control() && !c.is_whitespace()) {
        return Err("Name contains invalid control characters".to_string());
    }
    Ok(())
}

// === Constants ===

/// Default estimated pomodoros for a new task
const DEFAULT_ESTIMATED_POMODOROS: i32 = 1;

/// Default priority for a new task
const DEFAULT_PRIORITY: i32 = 50;

/// Default wake up time for daily template
const DEFAULT_WAKE_UP: &str = "07:00";

/// Default sleep time for daily template
const DEFAULT_SLEEP: &str = "23:00";

/// Default max parallel lanes for daily template
const DEFAULT_MAX_PARALLEL_LANES: Option<i32> = Some(2);

// === Helper Functions ===

/// Parse ISO date string (YYYY-MM-DD) to DateTime at midnight UTC
/// with date bounds validation
fn parse_date_iso(date_iso: &str) -> Result<DateTime<Utc>, String> {
    let dt = chrono::DateTime::parse_from_rfc3339(&format!("{}T00:00:00Z", date_iso))
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|e| format!("invalid date: {e}"))?;
    validate_date_bounds(dt)
}

/// Parse calendar events from JSON value
/// with date bounds validation
fn parse_calendar_events(events_json: Value) -> Result<Vec<CalendarEvent>, String> {
    let events_array = events_json
        .as_array()
        .ok_or_else(|| "calendar_events must be an array".to_string())?;

    let mut events = Vec::new();
    for event_json in events_array {
        let start_str = event_json
            .get("start_time")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "missing start_time".to_string())?;
        let end_str = event_json
            .get("end_time")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "missing end_time".to_string())?;

        let start_time = DateTime::parse_from_rfc3339(start_str)
            .map_err(|e| format!("invalid start_time: {e}"))?
            .with_timezone(&Utc);
        let end_time = DateTime::parse_from_rfc3339(end_str)
            .map_err(|e| format!("invalid end_time: {e}"))?
            .with_timezone(&Utc);

        // Validate date bounds
        let start_time = validate_date_bounds(start_time)?;
        let end_time = validate_date_bounds(end_time)?;

        events.push(CalendarEvent::new(
            event_json
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            event_json
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("Event")
                .to_string(),
            start_time,
            end_time,
        ));
    }
    Ok(events)
}

/// Load daily template from database
fn load_daily_template(db: &ScheduleDb) -> Result<DailyTemplate, String> {
    db.get_daily_template()
        .map_err(|e| format!("Failed to get template: {e}"))?
        .ok_or_else(|| "No daily template found".to_string())
}

/// Load all tasks from database
fn load_all_tasks(db: &ScheduleDb) -> Result<Vec<Task>, String> {
    db.list_tasks()
        .map_err(|e| format!("Failed to get tasks: {e}"))
}

// === Task commands ===

/// Creates a new task.
///
/// # Arguments
/// * `title` - Task title
/// * `description` - Optional task description
/// * `project_id` - Optional project ID to associate with
/// * `tags` - Optional list of tags
/// * `estimated_pomodoros` - Estimated number of pomodoros (default: 1)
/// * `priority` - Optional priority 0-100 (default: 50)
/// * `category` - Task category: "active" or "someday" (default: "active")
///
/// # Returns
/// The created task as JSON
#[tauri::command]
pub fn cmd_task_create(
    title: String,
    description: Option<String>,
    project_id: Option<String>,
    tags: Option<Vec<String>>,
    estimated_pomodoros: Option<i32>,
    priority: Option<i32>,
    category: Option<String>,
) -> Result<Value, String> {
    // Validate title
    validate_name(&title)?;

    // Validate project_id if provided
    if let Some(ref pid) = project_id {
        validate_project_id(pid)?;
    }

    // Validate and clamp priority
    let validated_priority = match priority {
        Some(p) => Some(validate_priority(p)?),
        None => Some(DEFAULT_PRIORITY),
    };

    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;

    let task = Task {
        id: Uuid::new_v4().to_string(),
        title,
        description,
        estimated_pomodoros: estimated_pomodoros.unwrap_or(DEFAULT_ESTIMATED_POMODOROS),
        completed_pomodoros: 0,
        completed: false,
        project_id,
        tags: tags.unwrap_or_default(),
        priority: validated_priority,
        category: match category.as_deref() {
            Some("someday") => TaskCategory::Someday,
            _ => TaskCategory::Active,
        },
        created_at: Utc::now(),
    };

    db.create_task(&task)
        .map_err(|e| format!("Failed to create task: {e}"))?;

    serde_json::to_value(&task).map_err(|e| format!("JSON error: {e}"))
}

/// Updates an existing task.
///
/// # Arguments
/// * `id` - Task ID to update
/// * `title` - New title (optional)
/// * `description` - New description (optional)
/// * `project_id` - New project ID (optional)
/// * `tags` - New tags (optional)
/// * `estimated_pomodoros` - New estimate (optional)
/// * `completed_pomodoros` - New completed count (optional)
/// * `completed` - New completion status (optional)
/// * `priority` - New priority (optional)
/// * `category` - New category (optional)
///
/// # Returns
/// The updated task as JSON
#[tauri::command]
pub fn cmd_task_update(
    id: String,
    title: Option<String>,
    description: Option<String>,
    project_id: Option<String>,
    tags: Option<Vec<String>>,
    estimated_pomodoros: Option<i32>,
    completed_pomodoros: Option<i32>,
    completed: Option<bool>,
    priority: Option<i32>,
    category: Option<String>,
) -> Result<Value, String> {
    // Validate task ID
    validate_task_id(&id)?;

    // Validate title if provided
    if let Some(ref t) = title {
        validate_name(t)?;
    }

    // Validate project_id if provided
    if let Some(ref pid) = project_id {
        validate_project_id(pid)?;
    }

    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;

    let mut task = db
        .get_task(&id)
        .map_err(|e| format!("Failed to get task: {e}"))?
        .ok_or_else(|| format!("Task not found: {id}"))?;

    if let Some(t) = title {
        task.title = t;
    }
    if let Some(d) = description {
        task.description = Some(d);
    }
    if let Some(p) = project_id {
        task.project_id = Some(p);
    }
    if let Some(t) = tags {
        task.tags = t;
    }
    if let Some(e) = estimated_pomodoros {
        task.estimated_pomodoros = e;
    }
    if let Some(c) = completed_pomodoros {
        task.completed_pomodoros = c;
    }
    if let Some(c) = completed {
        task.completed = c;
    }
    if let Some(p) = priority {
        task.priority = Some(validate_priority(p)?);
    }
    if let Some(c) = category {
        task.category = match c.as_str() {
            "someday" => TaskCategory::Someday,
            _ => TaskCategory::Active,
        };
    }

    db.update_task(&task)
        .map_err(|e| format!("Failed to update task: {e}"))?;

    serde_json::to_value(&task).map_err(|e| format!("JSON error: {e}"))
}

/// Deletes a task.
///
/// # Arguments
/// * `id` - Task ID to delete
#[tauri::command]
pub fn cmd_task_delete(id: String) -> Result<(), String> {
    // Validate task ID
    validate_task_id(&id)?;

    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;
    db.delete_task(&id)
        .map_err(|e| format!("Failed to delete task: {e}"))
}

/// Lists tasks with optional filtering.
///
/// # Arguments
/// * `project_id` - Optional project ID to filter by
/// * `category` - Optional category filter ("active" or "someday")
///
/// # Returns
/// Array of tasks as JSON
#[tauri::command]
pub fn cmd_task_list(
    project_id: Option<String>,
    category: Option<String>,
) -> Result<Value, String> {
    // Validate project_id if provided
    if let Some(ref pid) = project_id {
        validate_project_id(pid)?;
    }

    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;

    let all_tasks = db
        .list_tasks()
        .map_err(|e| format!("Failed to list tasks: {e}"))?;

    let filtered: Vec<Task> = all_tasks
        .into_iter()
        .filter(|task| {
            if let Some(ref pid) = project_id {
                if task.project_id.as_ref() != Some(pid) {
                    return false;
                }
            }
            if let Some(ref cat) = category {
                let task_cat = match task.category {
                    TaskCategory::Active => "active",
                    TaskCategory::Someday => "someday",
                };
                if task_cat != cat.as_str() {
                    return false;
                }
            }
            true
        })
        .collect();

    serde_json::to_value(&filtered).map_err(|e| format!("JSON error: {e}"))
}

/// Gets a single task by ID.
///
/// # Arguments
/// * `id` - Task ID to retrieve
///
/// # Returns
/// The task as JSON, or null if not found
#[tauri::command]
pub fn cmd_task_get(id: String) -> Result<Value, String> {
    // Validate task ID
    validate_task_id(&id)?;

    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;

    match db
        .get_task(&id)
        .map_err(|e| format!("Failed to get task: {e}"))?
    {
        Some(task) => serde_json::to_value(&task).map_err(|e| format!("JSON error: {e}")),
        None => Ok(Value::Null),
    }
}

// === Project commands ===

/// Creates a new project.
///
/// # Arguments
/// * `name` - Project name
/// * `deadline` - Optional deadline as ISO 8601 string
///
/// # Returns
/// The created project as JSON
#[tauri::command]
pub fn cmd_project_create(name: String, deadline: Option<String>) -> Result<Value, String> {
    // Validate name
    validate_name(&name)?;

    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;

    let deadline_dt = if let Some(d) = deadline {
        let dt = chrono::DateTime::parse_from_rfc3339(&d)
            .map_err(|e| format!("invalid deadline: {e}"))?
            .with_timezone(&Utc);
        Some(validate_date_bounds(dt)?)
    } else {
        None
    };

    let project = Project {
        id: Uuid::new_v4().to_string(),
        name,
        deadline: deadline_dt,
        tasks: Vec::new(),
        created_at: Utc::now(),
    };

    db.create_project(&project)
        .map_err(|e| format!("Failed to create project: {e}"))?;

    serde_json::to_value(&project).map_err(|e| format!("JSON error: {e}"))
}

/// Lists all projects.
///
/// # Returns
/// Array of projects as JSON
#[tauri::command]
pub fn cmd_project_list() -> Result<Value, String> {
    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;

    let projects = db
        .list_projects()
        .map_err(|e| format!("Failed to list projects: {e}"))?;

    serde_json::to_value(&projects).map_err(|e| format!("JSON error: {e}"))
}

// === DailyTemplate commands ===

/// Gets the current daily template.
///
/// # Returns
/// The daily template as JSON, or a default template if none exists
#[tauri::command]
pub fn cmd_template_get() -> Result<Value, String> {
    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;

    match db
        .get_daily_template()
        .map_err(|e| format!("Failed to get template: {e}"))?
    {
        Some(template) => serde_json::to_value(&template).map_err(|e| format!("JSON error: {e}")),
        None => {
            // Return default template
            let default = DailyTemplate {
                wake_up: DEFAULT_WAKE_UP.to_string(),
                sleep: DEFAULT_SLEEP.to_string(),
                fixed_events: Vec::new(),
                max_parallel_lanes: DEFAULT_MAX_PARALLEL_LANES,
            };
            serde_json::to_value(&default).map_err(|e| format!("JSON error: {e}"))
        }
    }
}

/// Sets the daily template.
///
/// # Arguments
/// * `template_json` - Daily template as JSON
///
/// If no template exists in the database, a new one is created.
/// Otherwise, the existing template is updated.
#[tauri::command]
pub fn cmd_template_set(template_json: Value) -> Result<(), String> {
    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;

    let template: DailyTemplate = serde_json::from_value(template_json)
        .map_err(|e| format!("Invalid template JSON: {e}"))?;

    if db.get_daily_template()
        .map_err(|e| format!("Failed to check template: {e}"))?
        .is_some()
    {
        db.update_daily_template(&template)
            .map_err(|e| format!("Failed to update template: {e}"))?;
    } else {
        db.create_daily_template(&template)
            .map_err(|e| format!("Failed to create template: {e}"))?;
    }

    Ok(())
}

// === Scheduler commands ===

/// Generates a daily schedule from template and available tasks.
///
/// # Arguments
/// * `date_iso` - Target date in ISO format (YYYY-MM-DD)
/// * `calendar_events_json` - Optional array of calendar events to avoid
///
/// # Returns
/// Array of scheduled Pomodoro blocks
#[tauri::command]
pub fn cmd_schedule_generate(date_iso: String, calendar_events_json: Option<Value>) -> Result<Value, String> {
    let date = parse_date_iso(&date_iso)?;
    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;
    let template = load_daily_template(&db)?;
    let tasks = load_all_tasks(&db)?;
    let calendar_events = calendar_events_json
        .map(parse_calendar_events)
        .transpose()?
        .unwrap_or_default();

    let scheduler = AutoScheduler::new();
    let scheduled_blocks = scheduler.generate_schedule(&template, &tasks, &calendar_events, date);

    serde_json::to_value(&scheduled_blocks).map_err(|e| format!("JSON error: {e}"))
}

/// Auto-fills available time slots with top priority tasks.
///
/// Simpler version that automatically fills all available gaps.
///
/// # Arguments
/// * `date_iso` - Target date in ISO format (YYYY-MM-DD)
/// * `calendar_events_json` - Optional array of calendar events to avoid
///
/// # Returns
/// Array of scheduled Pomodoro blocks
#[tauri::command]
pub fn cmd_schedule_auto_fill(date_iso: String, calendar_events_json: Option<Value>) -> Result<Value, String> {
    let date = parse_date_iso(&date_iso)?;
    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;
    let template = load_daily_template(&db)?;
    let tasks = load_all_tasks(&db)?;
    let calendar_events = calendar_events_json
        .map(parse_calendar_events)
        .transpose()?
        .unwrap_or_default();

    let scheduler = AutoScheduler::new();
    let scheduled_blocks = scheduler.auto_fill(&template, &tasks, &calendar_events, date);

    serde_json::to_value(&scheduled_blocks).map_err(|e| format!("JSON error: {e}"))
}

// === Schedule Block commands ===

use pomodoroom_core::schedule::{ScheduleBlock, BlockType};

/// Creates a new schedule block.
///
/// # Arguments
/// * `block_json` - Schedule block as JSON
///
/// # Returns
/// The created block as JSON
#[tauri::command]
pub fn cmd_schedule_create_block(block_json: Value) -> Result<Value, String> {
    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;

    let block_type_str = block_json.get("blockType")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing blockType".to_string())?;

    let block_type = match block_type_str {
        "focus" => BlockType::Focus,
        "break" => BlockType::Break,
        "routine" => BlockType::Routine,
        "calendar" => BlockType::Calendar,
        _ => return Err(format!("invalid blockType: {block_type_str}")),
    };

    let start_time_str = block_json.get("startTime")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing startTime".to_string())?;

    let end_time_str = block_json.get("endTime")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing endTime".to_string())?;

    let start_time = DateTime::parse_from_rfc3339(start_time_str)
        .map_err(|e| format!("invalid startTime: {e}"))?
        .with_timezone(&Utc);

    let end_time = DateTime::parse_from_rfc3339(end_time_str)
        .map_err(|e| format!("invalid endTime: {e}"))?
        .with_timezone(&Utc);

    // Validate date bounds
    let start_time = validate_date_bounds(start_time)?;
    let end_time = validate_date_bounds(end_time)?;

    let block = ScheduleBlock {
        id: Uuid::new_v4().to_string(),
        block_type,
        task_id: block_json.get("taskId").and_then(|v| v.as_str()).map(|s| s.to_string()),
        start_time,
        end_time,
        locked: block_json.get("locked").and_then(|v| v.as_bool()).unwrap_or(false),
        label: block_json.get("label").and_then(|v| v.as_str()).map(|s| s.to_string()),
        lane: block_json.get("lane").and_then(|v| v.as_i64()).map(|v| v as i32),
    };

    db.create_schedule_block(&block)
        .map_err(|e| format!("Failed to create schedule block: {e}"))?;

    serde_json::to_value(&block).map_err(|e| format!("JSON error: {e}"))
}

/// Updates an existing schedule block.
///
/// # Arguments
/// * `id` - Block ID to update
/// * `startTime` - New start time (optional)
/// * `endTime` - New end time (optional)
/// * `lane` - New lane index (optional)
/// * `label` - New label (optional)
///
/// # Returns
/// The updated block as JSON
#[tauri::command]
pub fn cmd_schedule_update_block(
    id: String,
    #[allow(non_snake_case)]
    startTime: Option<String>,
    #[allow(non_snake_case)]
    endTime: Option<String>,
    lane: Option<i32>,
    label: Option<String>,
) -> Result<Value, String> {
    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;

    let mut block = db
        .get_schedule_block(&id)
        .map_err(|e| format!("Failed to get block: {e}"))?
        .ok_or_else(|| format!("Schedule block not found: {id}"))?;

    if let Some(st) = startTime {
        let dt = DateTime::parse_from_rfc3339(&st)
            .map_err(|e| format!("invalid startTime: {e}"))?
            .with_timezone(&Utc);
        block.start_time = validate_date_bounds(dt)?;
    }

    if let Some(et) = endTime {
        let dt = DateTime::parse_from_rfc3339(&et)
            .map_err(|e| format!("invalid endTime: {e}"))?
            .with_timezone(&Utc);
        block.end_time = validate_date_bounds(dt)?;
    }

    if let Some(l) = lane {
        block.lane = Some(l);
    }

    if let Some(lb) = label {
        block.label = Some(lb);
    }

    db.update_schedule_block(&block)
        .map_err(|e| format!("Failed to update schedule block: {e}"))?;

    serde_json::to_value(&block).map_err(|e| format!("JSON error: {e}"))
}

/// Deletes a schedule block.
///
/// # Arguments
/// * `id` - Block ID to delete
#[tauri::command]
pub fn cmd_schedule_delete_block(id: String) -> Result<(), String> {
    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;
    db.delete_schedule_block(&id)
        .map_err(|e| format!("Failed to delete schedule block: {e}"))
}

/// Lists all schedule blocks for a date range.
///
/// # Arguments
/// * `start_iso` - Start of date range in ISO format
/// * `end_iso` - End of date range in ISO format (optional, defaults to start + 24h)
///
/// # Returns
/// Array of schedule blocks as JSON
#[tauri::command]
pub fn cmd_schedule_list_blocks(start_iso: String, end_iso: Option<String>) -> Result<Value, String> {
    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;

    let start_time = DateTime::parse_from_rfc3339(&start_iso)
        .map_err(|e| format!("invalid start time: {e}"))?
        .with_timezone(&Utc);

    let end_time = if let Some(end) = end_iso {
        DateTime::parse_from_rfc3339(&end)
            .map_err(|e| format!("invalid end time: {e}"))?
            .with_timezone(&Utc)
    } else {
        start_time + chrono::Duration::days(1)
    };

    let blocks = db
        .list_schedule_blocks(Some(&start_time), Some(&end_time))
        .map_err(|e| format!("Failed to list schedule blocks: {e}"))?;

    serde_json::to_value(&blocks).map_err(|e| format!("JSON error: {e}"))
}
