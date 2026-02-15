//! Schedule commands for Tauri IPC.
//!
//! This module provides Tauri command handlers for task, project, and
//! daily template management. Exposes the ScheduleDb functionality to
//! the frontend.
//!
//! Task operations (start/pause/complete) are integrated with the timer engine
//! for automatic focus session management.

use chrono::{DateTime, Duration, Utc};
use pomodoroom_core::schedule::{
    DailyTemplate, Group, Project, ProjectReference, Task, TaskCategory, TaskKind,
};
use pomodoroom_core::scheduler::{AutoScheduler, CalendarEvent};
use pomodoroom_core::storage::{DataResetOptions, ScheduleDb};
use pomodoroom_core::task::{TaskState, TaskStateMachine, TransitionAction};
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
use tauri::State;
use uuid::Uuid;

// Re-use timer state from bridge module
use crate::bridge::{
    internal_timer_pause, internal_timer_reset, internal_timer_start, EngineState,
};

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

/// Validate that a group ID is safe.
fn validate_group_id(id: &str) -> Result<(), String> {
    if id.is_empty() {
        return Err("Group ID cannot be empty".to_string());
    }
    if id.len() > 100 {
        return Err("Group ID is too long".to_string());
    }
    if id.contains('\0') || id.contains('\n') || id.contains('\r') {
        return Err("Group ID contains invalid characters".to_string());
    }
    Ok(())
}

/// Validate priority is within acceptable range (0-100).
fn validate_priority(priority: i32) -> Result<i32, String> {
    if priority < 0 || priority > 100 {
        Err(format!(
            "Priority must be between 0 and 100, got {priority}"
        ))
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
        Err(format!(
            "Date is too far in the past: {}",
            dt.format("%Y-%m-%d")
        ))
    } else if dt > max_date {
        Err(format!(
            "Date is too far in the future: {}",
            dt.format("%Y-%m-%d")
        ))
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

fn parse_project_deadline_input(input: &str) -> Result<DateTime<Utc>, String> {
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(input) {
        return Ok(dt.with_timezone(&Utc));
    }
    if let Ok(date) = chrono::NaiveDate::parse_from_str(input, "%Y-%m-%d") {
        let dt = date
            .and_hms_opt(0, 0, 0)
            .ok_or_else(|| "invalid date".to_string())?;
        return Ok(DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc));
    }
    Err("invalid deadline format; expected RFC3339 or YYYY-MM-DD".to_string())
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

fn parse_optional_datetime(
    value: Option<String>,
    field_name: &str,
) -> Result<Option<DateTime<Utc>>, String> {
    let Some(v) = value else {
        return Ok(None);
    };
    let dt = DateTime::parse_from_rfc3339(&v)
        .map_err(|e| format!("invalid {field_name}: {e}"))?
        .with_timezone(&Utc);
    Ok(Some(validate_date_bounds(dt)?))
}

fn parse_task_kind(value: Option<String>) -> Result<TaskKind, String> {
    match value.as_deref() {
        Some("fixed_event") => Ok(TaskKind::FixedEvent),
        Some("flex_window") => Ok(TaskKind::FlexWindow),
        Some("duration_only") | None => Ok(TaskKind::DurationOnly),
        Some("break") => Ok(TaskKind::Break),
        Some(other) => Err(format!("invalid kind: {other}")),
    }
}

fn validate_task_kind_fields(
    kind: TaskKind,
    required_minutes: Option<u32>,
    fixed_start_at: Option<DateTime<Utc>>,
    fixed_end_at: Option<DateTime<Utc>>,
    window_start_at: Option<DateTime<Utc>>,
    window_end_at: Option<DateTime<Utc>>,
) -> Result<(), String> {
    let has_fixed = fixed_start_at.is_some() || fixed_end_at.is_some();
    let has_window = window_start_at.is_some() || window_end_at.is_some();

    match kind {
        TaskKind::FixedEvent => {
            let (Some(start), Some(end)) = (fixed_start_at, fixed_end_at) else {
                return Err("fixed_event requires fixed_start_at and fixed_end_at".to_string());
            };
            if end <= start {
                return Err("fixed_end_at must be later than fixed_start_at".to_string());
            }
            if has_window {
                return Err("fixed_event cannot have window_start_at/window_end_at".to_string());
            }
        }
        TaskKind::FlexWindow => {
            if let (Some(start), Some(end)) = (window_start_at, window_end_at) {
                if end <= start {
                    return Err("window_end_at must be later than window_start_at".to_string());
                }
            }
            if !has_window {
                return Err("flex_window requires window_start_at and/or window_end_at".to_string());
            }
            if has_fixed {
                return Err("flex_window cannot have fixed_start_at/fixed_end_at".to_string());
            }
            if required_minutes.unwrap_or(0) == 0 {
                return Err("flex_window requires required_minutes > 0".to_string());
            }
        }
        TaskKind::DurationOnly | TaskKind::Break => {
            if has_fixed || has_window {
                return Err("duration_only/break cannot have fixed/window times".to_string());
            }
            if required_minutes.unwrap_or(0) == 0 {
                return Err("duration_only/break requires required_minutes > 0".to_string());
            }
        }
    }
    Ok(())
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
    kind: Option<String>,
    required_minutes: Option<u32>,
    fixed_start_at: Option<String>,
    fixed_end_at: Option<String>,
    window_start_at: Option<String>,
    window_end_at: Option<String>,
    estimated_start_at: Option<String>,
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

    let kind = parse_task_kind(kind)?;
    let fixed_start_at = parse_optional_datetime(fixed_start_at, "fixed_start_at")?;
    let fixed_end_at = parse_optional_datetime(fixed_end_at, "fixed_end_at")?;
    let window_start_at = parse_optional_datetime(window_start_at, "window_start_at")?;
    let window_end_at = parse_optional_datetime(window_end_at, "window_end_at")?;
    let estimated_start_at = parse_optional_datetime(estimated_start_at, "estimated_start_at")?;

    validate_task_kind_fields(
        kind,
        required_minutes,
        fixed_start_at.clone(),
        fixed_end_at.clone(),
        window_start_at.clone(),
        window_end_at.clone(),
    )?;

    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;

    let now = Utc::now();
    let task = Task {
        id: Uuid::new_v4().to_string(),
        title,
        description,
        estimated_pomodoros: estimated_pomodoros.unwrap_or(DEFAULT_ESTIMATED_POMODOROS),
        completed_pomodoros: 0,
        completed: false,
        state: pomodoroom_core::task::TaskState::Ready,
        project_id: project_id.clone(),
        project_name: None, // Will be resolved from database if needed
        project_ids: project_id.clone().map(|id| vec![id]).unwrap_or_default(),
        kind,
        required_minutes,
        fixed_start_at,
        fixed_end_at,
        window_start_at,
        window_end_at,
        tags: tags.unwrap_or_default(),
        priority: validated_priority,
        category: match category.as_deref() {
            Some("someday") => TaskCategory::Someday,
            _ => TaskCategory::Active,
        },
        estimated_minutes: None,
        estimated_start_at,
        elapsed_minutes: 0,
        energy: pomodoroom_core::task::EnergyLevel::Medium,
        group: None,
        group_ids: Vec::new(),
        created_at: now,
        updated_at: now,
        completed_at: None,
        paused_at: None,
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
    required_minutes: Option<u32>,
    fixed_start_at: Option<String>,
    fixed_end_at: Option<String>,
    window_start_at: Option<String>,
    window_end_at: Option<String>,
    estimated_start_at: Option<String>,
    clear_fixed_start_at: Option<bool>,
    clear_fixed_end_at: Option<bool>,
    clear_window_start_at: Option<bool>,
    clear_window_end_at: Option<bool>,
    clear_estimated_start_at: Option<bool>,
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

    let fixed_start_at = parse_optional_datetime(fixed_start_at, "fixed_start_at")?;
    let fixed_end_at = parse_optional_datetime(fixed_end_at, "fixed_end_at")?;
    let window_start_at = parse_optional_datetime(window_start_at, "window_start_at")?;
    let window_end_at = parse_optional_datetime(window_end_at, "window_end_at")?;
    let estimated_start_at = parse_optional_datetime(estimated_start_at, "estimated_start_at")?;

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
    if let Some(minutes) = required_minutes {
        task.required_minutes = Some(minutes);
    }
    if clear_fixed_start_at.unwrap_or(false) {
        task.fixed_start_at = None;
    } else if fixed_start_at.is_some() {
        task.fixed_start_at = fixed_start_at;
    }
    if clear_fixed_end_at.unwrap_or(false) {
        task.fixed_end_at = None;
    } else if fixed_end_at.is_some() {
        task.fixed_end_at = fixed_end_at;
    }
    if clear_window_start_at.unwrap_or(false) {
        task.window_start_at = None;
    } else if window_start_at.is_some() {
        task.window_start_at = window_start_at;
    }
    if clear_window_end_at.unwrap_or(false) {
        task.window_end_at = None;
    } else if window_end_at.is_some() {
        task.window_end_at = window_end_at;
    }
    if clear_estimated_start_at.unwrap_or(false) {
        task.estimated_start_at = None;
    } else if estimated_start_at.is_some() {
        task.estimated_start_at = estimated_start_at;
    }

    validate_task_kind_fields(
        task.kind,
        task.required_minutes,
        task.fixed_start_at.clone(),
        task.fixed_end_at.clone(),
        task.window_start_at.clone(),
        task.window_end_at.clone(),
    )?;

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
#[derive(Debug, Clone, Deserialize)]
pub struct ProjectReferenceInput {
    pub id: Option<String>,
    pub kind: String,
    pub value: String,
    pub label: Option<String>,
}

#[tauri::command]
pub fn cmd_project_create(
    name: String,
    deadline: Option<String>,
    references: Option<Vec<ProjectReferenceInput>>,
    description: Option<String>,
    is_pinned: Option<bool>,
) -> Result<Value, String> {
    // Validate name
    validate_name(&name)?;

    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;

    let deadline_dt = if let Some(d) = deadline {
        let dt = parse_project_deadline_input(&d).map_err(|e| format!("invalid deadline: {e}"))?;
        Some(validate_date_bounds(dt)?)
    } else {
        None
    };
    let now = Utc::now();
    let project_id = Uuid::new_v4().to_string();
    let mut project_references: Vec<ProjectReference> = references
        .unwrap_or_default()
        .into_iter()
        .enumerate()
        .filter(|(_, input)| !input.value.trim().is_empty())
        .map(|(index, input)| ProjectReference {
            id: Uuid::new_v4().to_string(),
            project_id: project_id.clone(),
            kind: if input.kind.trim().is_empty() {
                "link".to_string()
            } else {
                input.kind.trim().to_string()
            },
            value: input.value.trim().to_string(),
            label: input
                .label
                .map(|label| label.trim().to_string())
                .filter(|label| !label.is_empty()),
            meta_json: None,
            order_index: index as i32,
            created_at: now,
            updated_at: now,
        })
        .collect();
    if let Some(desc) = description.map(|d| d.trim().to_string()).filter(|d| !d.is_empty()) {
        project_references.push(ProjectReference {
            id: Uuid::new_v4().to_string(),
            project_id: project_id.clone(),
            kind: "note".to_string(),
            value: desc,
            label: Some("description".to_string()),
            meta_json: None,
            order_index: project_references.len() as i32,
            created_at: now,
            updated_at: now,
        });
    }

    let project = Project {
        id: project_id,
        name,
        deadline: deadline_dt,
        tasks: Vec::new(),
        created_at: now,
        is_pinned: is_pinned.unwrap_or(false),
        references: project_references,
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

/// Updates a project.
#[tauri::command]
pub fn cmd_project_update(
    project_id: String,
    name: Option<String>,
    deadline: Option<String>,
    references: Option<Vec<ProjectReferenceInput>>,
    is_pinned: Option<bool>,
) -> Result<Value, String> {
    validate_project_id(&project_id)?;
    if let Some(ref n) = name {
        validate_name(n)?;
    }

    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;
    let mut project = db
        .get_project(&project_id)
        .map_err(|e| format!("Failed to get project: {e}"))?
        .ok_or_else(|| format!("Project not found: {project_id}"))?;

    if let Some(new_name) = name {
        project.name = new_name;
    }

    if let Some(deadline_raw) = deadline {
        if deadline_raw.trim().is_empty() {
            project.deadline = None;
        } else {
            let dt =
                parse_project_deadline_input(&deadline_raw).map_err(|e| format!("invalid deadline: {e}"))?;
            project.deadline = Some(validate_date_bounds(dt)?);
        }
    }

    if let Some(ref_inputs) = references {
        let now = Utc::now();
        let existing_by_id: HashMap<String, ProjectReference> = project
            .references
            .iter()
            .cloned()
            .map(|reference| (reference.id.clone(), reference))
            .collect();
        project.references = ref_inputs
            .into_iter()
            .enumerate()
            .filter(|(_, input)| !input.value.trim().is_empty())
            .map(|(index, input)| {
                let existing = input
                    .id
                    .as_ref()
                    .and_then(|id| existing_by_id.get(id));
                ProjectReference {
                    id: existing
                        .map(|reference| reference.id.clone())
                        .unwrap_or_else(|| Uuid::new_v4().to_string()),
                    project_id: project.id.clone(),
                    kind: if input.kind.trim().is_empty() {
                        "link".to_string()
                    } else {
                        input.kind.trim().to_string()
                    },
                    value: input.value.trim().to_string(),
                    label: input
                        .label
                        .map(|label| label.trim().to_string())
                        .filter(|label| !label.is_empty()),
                    meta_json: existing.and_then(|reference| reference.meta_json.clone()),
                    order_index: index as i32,
                    created_at: existing.map(|reference| reference.created_at).unwrap_or(now),
                    updated_at: now,
                }
            })
            .collect();
    }

    if let Some(pinned) = is_pinned {
        project.is_pinned = pinned;
    }

    db.update_project(&project)
        .map_err(|e| format!("Failed to update project: {e}"))?;
    serde_json::to_value(&project).map_err(|e| format!("JSON error: {e}"))
}

/// Deletes a project.
#[tauri::command]
pub fn cmd_project_delete(project_id: String, delete_tasks: bool) -> Result<(), String> {
    validate_project_id(&project_id)?;
    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;
    db.delete_project_with_tasks_transactional(&project_id, delete_tasks)
        .map_err(|e| format!("Failed to delete project: {e}"))
}

/// Creates a new group.
#[tauri::command]
pub fn cmd_group_create(name: String, parent_id: Option<String>) -> Result<Value, String> {
    validate_name(&name)?;
    if let Some(ref pid) = parent_id {
        validate_group_id(pid)?;
    }

    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;
    let now = Utc::now();
    let group = Group {
        id: Uuid::new_v4().to_string(),
        name,
        parent_id,
        order_index: 0,
        created_at: now,
        updated_at: now,
    };

    db.create_group(&group)
        .map_err(|e| format!("Failed to create group: {e}"))?;

    serde_json::to_value(&group).map_err(|e| format!("JSON error: {e}"))
}

/// Lists all groups.
#[tauri::command]
pub fn cmd_group_list() -> Result<Value, String> {
    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;
    let groups = db
        .list_groups()
        .map_err(|e| format!("Failed to list groups: {e}"))?;
    serde_json::to_value(&groups).map_err(|e| format!("JSON error: {e}"))
}

/// Updates a group.
#[tauri::command]
pub fn cmd_group_update(
    group_id: String,
    name: Option<String>,
    parent_id: Option<String>,
    clear_parent: Option<bool>,
    order: Option<i32>,
) -> Result<(), String> {
    validate_group_id(&group_id)?;
    if let Some(ref n) = name {
        validate_name(n)?;
    }
    if let Some(ref pid) = parent_id {
        validate_group_id(pid)?;
    }

    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;
    let mut groups = db
        .list_groups()
        .map_err(|e| format!("Failed to list groups: {e}"))?;
    let mut group = groups
        .drain(..)
        .find(|g| g.id == group_id)
        .ok_or_else(|| format!("Group not found: {group_id}"))?;

    if let Some(n) = name {
        group.name = n;
    }
    if clear_parent.unwrap_or(false) {
        group.parent_id = None;
    } else if let Some(pid) = parent_id {
        if pid == group_id {
            return Err("Group cannot be its own parent".to_string());
        }
        group.parent_id = Some(pid);
    }
    if let Some(o) = order {
        group.order_index = o;
    }
    group.updated_at = Utc::now();

    db.update_group(&group)
        .map_err(|e| format!("Failed to update group: {e}"))?;
    Ok(())
}

/// Deletes a group.
#[tauri::command]
pub fn cmd_group_delete(group_id: String) -> Result<(), String> {
    validate_group_id(&group_id)?;
    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;
    db.delete_group(&group_id)
        .map_err(|e| format!("Failed to delete group: {e}"))
}

/// Resets selected data domains (tasks/schedule/projects/groups) in one transaction.
///
/// # Arguments
/// * `delete_tasks` - Delete all tasks
/// * `delete_schedule_blocks` - Delete all schedule blocks
/// * `delete_projects` - Delete all projects and project references
/// * `delete_groups` - Delete all groups
///
/// # Returns
/// JSON summary containing deleted row counts.
#[tauri::command]
pub fn cmd_data_reset(
    delete_tasks: bool,
    delete_schedule_blocks: bool,
    delete_projects: bool,
    delete_groups: bool,
) -> Result<Value, String> {
    if !(delete_tasks || delete_schedule_blocks || delete_projects || delete_groups) {
        return Err("No delete targets selected".to_string());
    }

    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;
    let summary = db
        .reset_selected_data(DataResetOptions {
            tasks: delete_tasks,
            schedule_blocks: delete_schedule_blocks,
            projects: delete_projects,
            groups: delete_groups,
        })
        .map_err(|e| format!("Failed to reset selected data: {e}"))?;

    Ok(serde_json::json!({
        "deleted_tasks": summary.deleted_tasks,
        "deleted_schedule_blocks": summary.deleted_schedule_blocks,
        "deleted_projects": summary.deleted_projects,
        "deleted_groups": summary.deleted_groups
    }))
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

    let template: DailyTemplate =
        serde_json::from_value(template_json).map_err(|e| format!("Invalid template JSON: {e}"))?;

    if db
        .get_daily_template()
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
pub fn cmd_schedule_generate(
    date_iso: String,
    calendar_events_json: Option<Value>,
) -> Result<Value, String> {
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
pub fn cmd_schedule_auto_fill(
    date_iso: String,
    calendar_events_json: Option<Value>,
) -> Result<Value, String> {
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

use pomodoroom_core::schedule::{BlockType, ScheduleBlock};

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

    let block_type_str = block_json
        .get("blockType")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing blockType".to_string())?;

    let block_type = match block_type_str {
        "focus" => BlockType::Focus,
        "break" => BlockType::Break,
        "routine" => BlockType::Routine,
        "calendar" => BlockType::Calendar,
        _ => return Err(format!("invalid blockType: {block_type_str}")),
    };

    let start_time_str = block_json
        .get("startTime")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing startTime".to_string())?;

    let end_time_str = block_json
        .get("endTime")
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
        task_id: block_json
            .get("taskId")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        start_time,
        end_time,
        locked: block_json
            .get("locked")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        label: block_json
            .get("label")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        lane: block_json
            .get("lane")
            .and_then(|v| v.as_i64())
            .map(|v| v as i32),
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
    #[allow(non_snake_case)] startTime: Option<String>,
    #[allow(non_snake_case)] endTime: Option<String>,
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
pub fn cmd_schedule_list_blocks(
    start_iso: String,
    end_iso: Option<String>,
) -> Result<Value, String> {
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

// === Task Operation Commands ===
//
// These commands handle state transitions for tasks using the TaskStateMachine.
// Multiple RUNNING tasks are allowed.

/// Start a task: READY → RUNNING
///
/// # Arguments
/// * `id` - Task ID to start
///
/// # Returns
/// The updated task as JSON
///
/// # Behavior
/// - Transitions task from READY to RUNNING
/// - Clears paused_at timestamp
/// - **Automatically starts the timer** (timer ↔ task integration)
#[tauri::command]
pub fn cmd_task_start(id: String, engine: State<'_, EngineState>) -> Result<Value, String> {
    validate_task_id(&id)?;

    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;

    // Get the task
    let task = db
        .get_task(&id)
        .map_err(|e| format!("Failed to get task: {e}"))?
        .ok_or_else(|| format!("Task not found: {id}"))?;

    // Apply the start transition
    let mut state_machine = TaskStateMachine::new(task);
    state_machine
        .apply_action(TransitionAction::Start)
        .map_err(|e| format!("Cannot start task: {e}"))?;

    // Persist to database
    let updated_task = state_machine.task;
    db.update_task(&updated_task)
        .map_err(|e| format!("Failed to update task: {e}"))?;

    // Auto-start timer with task_id integration
    if internal_timer_start(&engine, Some(id.clone()), updated_task.project_id.clone()).is_none() {
        eprintln!("Task started but timer did not start for task {}", id);
    }

    serde_json::to_value(&updated_task).map_err(|e| format!("JSON error: {e}"))
}

/// Pause a running task: RUNNING → PAUSED
///
/// # Arguments
/// * `id` - Task ID to pause
///
/// # Returns
/// The updated task as JSON
///
/// # Behavior
/// - Transitions task from RUNNING to PAUSED
/// - Sets paused_at timestamp
/// - **Also pauses the timer** (timer ↔ task integration)
#[tauri::command]
pub fn cmd_task_pause(id: String, engine: State<'_, EngineState>) -> Result<Value, String> {
    validate_task_id(&id)?;

    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;

    let task = db
        .get_task(&id)
        .map_err(|e| format!("Failed to get task: {e}"))?
        .ok_or_else(|| format!("Task not found: {id}"))?;

    let mut state_machine = TaskStateMachine::new(task);
    state_machine
        .apply_action(TransitionAction::Pause)
        .map_err(|e| format!("Cannot pause task: {e}"))?;

    let updated_task = state_machine.task;
    db.update_task(&updated_task)
        .map_err(|e| format!("Failed to update task: {e}"))?;

    // Also pause the timer (linked behavior)
    if internal_timer_pause(&engine).is_none() {
        eprintln!("Task paused but timer did not pause for task {}", id);
    }

    serde_json::to_value(&updated_task).map_err(|e| format!("JSON error: {e}"))
}

/// Interrupt a running task with mandatory resume time: RUNNING → PAUSED + estimated_start_at
///
/// # Arguments
/// * `id` - Task ID to interrupt
/// * `resume_at` - Required resume datetime (RFC3339)
///
/// # Returns
/// The updated task as JSON
#[tauri::command]
pub fn cmd_task_interrupt(
    id: String,
    resume_at: String,
    engine: State<'_, EngineState>,
) -> Result<Value, String> {
    validate_task_id(&id)?;

    let resume_at_dt = DateTime::parse_from_rfc3339(&resume_at)
        .map_err(|e| format!("invalid resume_at: {e}"))?
        .with_timezone(&Utc);
    let resume_at_dt = validate_date_bounds(resume_at_dt)?;
    if resume_at_dt <= Utc::now() {
        return Err("invalid resume_at: must be in the future".to_string());
    }

    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;

    let task = db
        .get_task(&id)
        .map_err(|e| format!("Failed to get task: {e}"))?
        .ok_or_else(|| format!("Task not found: {id}"))?;

    let mut state_machine = TaskStateMachine::new(task);
    state_machine
        .apply_action(TransitionAction::Pause)
        .map_err(|e| format!("Cannot interrupt task: {e}"))?;

    let mut updated_task = state_machine.task;
    updated_task.estimated_start_at = Some(resume_at_dt);

    db.update_task(&updated_task)
        .map_err(|e| format!("Failed to update task: {e}"))?;

    // Also pause the timer (linked behavior)
    if internal_timer_pause(&engine).is_none() {
        eprintln!("Task interrupted but timer did not pause for task {}", id);
    }

    serde_json::to_value(&updated_task).map_err(|e| format!("JSON error: {e}"))
}

/// Resume a paused task: PAUSED → RUNNING
///
/// # Arguments
/// * `id` - Task ID to resume
///
/// # Returns
/// The updated task as JSON
///
/// # Behavior
/// - Transitions task from PAUSED to RUNNING
/// - Clears paused_at timestamp
/// - **Also resumes the timer** (timer ↔ task integration)
#[tauri::command]
pub fn cmd_task_resume(id: String, engine: State<'_, EngineState>) -> Result<Value, String> {
    validate_task_id(&id)?;

    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;

    let task = db
        .get_task(&id)
        .map_err(|e| format!("Failed to get task: {e}"))?
        .ok_or_else(|| format!("Task not found: {id}"))?;

    let mut state_machine = TaskStateMachine::new(task);
    state_machine
        .apply_action(TransitionAction::Resume)
        .map_err(|e| format!("Cannot resume task: {e}"))?;

    let updated_task = state_machine.task;
    db.update_task(&updated_task)
        .map_err(|e| format!("Failed to update task: {e}"))?;

    // Also resume the timer (linked behavior)
    if internal_timer_start(&engine, Some(id.clone()), updated_task.project_id.clone()).is_none() {
        eprintln!("Task resumed but timer did not start for task {}", id);
    }

    serde_json::to_value(&updated_task).map_err(|e| format!("JSON error: {e}"))
}

/// Complete a task: RUNNING → DONE
///
/// # Arguments
/// * `id` - Task ID to complete
///
/// # Returns
/// The updated task as JSON
///
/// # Behavior
/// - Transitions task from RUNNING to DONE
/// - Sets completed = true
/// - Sets completed_at timestamp
/// - Clears paused_at timestamp
/// - **Also resets the timer** (timer ↔ task integration)
#[tauri::command]
pub fn cmd_task_complete(id: String, engine: State<'_, EngineState>) -> Result<Value, String> {
    validate_task_id(&id)?;

    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;

    let task = db
        .get_task(&id)
        .map_err(|e| format!("Failed to get task: {e}"))?
        .ok_or_else(|| format!("Task not found: {id}"))?;

    let mut state_machine = TaskStateMachine::new(task);
    state_machine
        .apply_action(TransitionAction::Complete)
        .map_err(|e| format!("Cannot complete task: {e}"))?;

    let updated_task = state_machine.task;
    db.update_task(&updated_task)
        .map_err(|e| format!("Failed to update task: {e}"))?;

    // Also reset the timer (linked behavior)
    if internal_timer_reset(&engine).is_none() {
        eprintln!("Task completed but timer did not reset for task {}", id);
    }

    serde_json::to_value(&updated_task).map_err(|e| format!("JSON error: {e}"))
}

/// Postpone a task: RUNNING/PAUSED → READY (priority -= 20)
///
/// # Arguments
/// * `id` - Task ID to postpone
///
/// # Returns
/// The updated task as JSON
///
/// # Behavior
/// - Transitions task from RUNNING or PAUSED to READY
/// - Decreases priority by 20 (minimum -100)
/// - Clears paused_at timestamp
/// - **Also resets the timer** (timer ↔ task integration)
#[tauri::command]
pub fn cmd_task_postpone(id: String, engine: State<'_, EngineState>) -> Result<Value, String> {
    validate_task_id(&id)?;

    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;

    let task = db
        .get_task(&id)
        .map_err(|e| format!("Failed to get task: {e}"))?
        .ok_or_else(|| format!("Task not found: {id}"))?;

    let mut state_machine = TaskStateMachine::new(task);
    state_machine
        .apply_action(TransitionAction::Postpone)
        .map_err(|e| format!("Cannot postpone task: {e}"))?;

    let updated_task = state_machine.task;
    db.update_task(&updated_task)
        .map_err(|e| format!("Failed to update task: {e}"))?;

    // Also reset the timer (linked behavior)
    if internal_timer_reset(&engine).is_none() {
        eprintln!("Task postponed but timer did not reset for task {}", id);
    }

    serde_json::to_value(&updated_task).map_err(|e| format!("JSON error: {e}"))
}

/// Defer a task until specified datetime.
///
/// # Arguments
/// * `id` - Task ID to defer
/// * `defer_until` - Deferred start datetime (RFC3339)
///
/// # Returns
/// The updated task as JSON
#[tauri::command]
pub fn cmd_task_defer_until(
    id: String,
    defer_until: String,
    engine: State<'_, EngineState>,
) -> Result<Value, String> {
    validate_task_id(&id)?;

    let defer_until_dt = DateTime::parse_from_rfc3339(&defer_until)
        .map_err(|e| format!("invalid defer_until: {e}"))?
        .with_timezone(&Utc);
    let defer_until_dt = validate_date_bounds(defer_until_dt)?;

    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;

    let mut task = db
        .get_task(&id)
        .map_err(|e| format!("Failed to get task: {e}"))?
        .ok_or_else(|| format!("Task not found: {id}"))?;

    // Fixed/window scheduled tasks are locked and should not be moved.
    if task.fixed_start_at.is_some() || task.window_start_at.is_some() {
        return Err("Cannot defer fixed/window scheduled task".to_string());
    }

    // If currently paused/running, move back to READY via state machine action.
    let was_running = task.state == TaskState::Running;
    if task.state == TaskState::Paused || task.state == TaskState::Running {
        let mut state_machine = TaskStateMachine::new(task);
        state_machine
            .apply_action(TransitionAction::Postpone)
            .map_err(|e| format!("Cannot defer task: {e}"))?;
        task = state_machine.task;
    }

    task.estimated_start_at = Some(defer_until_dt);
    task.paused_at = None;

    db.update_task(&task)
        .map_err(|e| format!("Failed to update task: {e}"))?;

    if was_running && internal_timer_reset(&engine).is_none() {
        eprintln!("Task deferred but timer did not reset for task {}", id);
    }

    serde_json::to_value(&task).map_err(|e| format!("JSON error: {e}"))
}

/// Extend a task's estimated time: any state → same state (estimated_minutes += N)
///
/// # Arguments
/// * `id` - Task ID to extend
/// * `minutes` - Additional minutes to add to estimated_minutes
///
/// # Returns
/// The updated task as JSON
///
/// # Behavior
/// - Does NOT change task state
/// - Adds minutes to estimated_minutes
/// - Works from any state except DONE
#[tauri::command]
pub fn cmd_task_extend(id: String, minutes: u32) -> Result<Value, String> {
    validate_task_id(&id)?;

    if minutes == 0 || minutes > 480 {
        return Err("minutes must be between 1 and 480".to_string());
    }

    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;

    let task = db
        .get_task(&id)
        .map_err(|e| format!("Failed to get task: {e}"))?
        .ok_or_else(|| format!("Task not found: {id}"))?;

    // Cannot extend completed tasks
    if task.state == TaskState::Done {
        return Err("Cannot extend a completed task".to_string());
    }

    let mut state_machine = TaskStateMachine::new(task);
    state_machine
        .apply_action(TransitionAction::Extend { minutes })
        .map_err(|e| format!("Cannot extend task: {e}"))?;

    let updated_task = state_machine.task;
    db.update_task(&updated_task)
        .map_err(|e| format!("Failed to update task: {e}"))?;

    serde_json::to_value(&updated_task).map_err(|e| format!("JSON error: {e}"))
}

/// Get available actions for a task.
///
/// # Arguments
/// * `id` - Task ID to query
///
/// # Returns
/// Array of available action names as strings (e.g., ["start", "pause", "complete"])
#[tauri::command]
pub fn cmd_task_available_actions(id: String) -> Result<Value, String> {
    validate_task_id(&id)?;

    let db = ScheduleDb::open().map_err(|e| format!("Database error: {e}"))?;

    let task = db
        .get_task(&id)
        .map_err(|e| format!("Failed to get task: {e}"))?
        .ok_or_else(|| format!("Task not found: {id}"))?;

    let state_machine = TaskStateMachine::new(task);
    let actions = state_machine.available_actions();

    // Convert actions to string representation
    let action_names: Vec<String> = actions
        .iter()
        .map(|a| match a {
            TransitionAction::Start => "start".to_string(),
            TransitionAction::Pause => "pause".to_string(),
            TransitionAction::Resume => "resume".to_string(),
            TransitionAction::Complete => "complete".to_string(),
            TransitionAction::Postpone => "postpone".to_string(),
            TransitionAction::Extend { minutes } => format!("extend({}m)", minutes),
        })
        .collect();

    serde_json::to_value(&action_names).map_err(|e| format!("JSON error: {e}"))
}
