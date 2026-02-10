//! Task management commands for CLI.

use clap::Subcommand;
use pomodoroom_core::schedule::{Task, TaskCategory};
use pomodoroom_core::storage::schedule_db::ScheduleDb;
use uuid::Uuid;
use chrono::Utc;

#[derive(Subcommand)]
pub enum TaskAction {
    /// Create a new task
    Create {
        /// Task title
        title: String,
        /// Task description
        #[arg(long)]
        description: Option<String>,
        /// Project ID to associate with
        #[arg(long)]
        project_id: Option<String>,
        /// Comma-separated tags
        #[arg(long)]
        tags: Option<String>,
        /// Estimated pomodoros (default: 1)
        #[arg(long, default_value = "1")]
        estimated_pomodoros: i32,
        /// Task category: active or someday (default: active)
        #[arg(long, default_value = "active")]
        category: String,
    },
    /// List tasks
    List {
        /// Filter by project ID
        #[arg(long)]
        project_id: Option<String>,
        /// Filter by category (active or someday)
        #[arg(long)]
        category: Option<String>,
    },
    /// Get task details
    Get {
        /// Task ID
        id: String,
    },
    /// Update a task
    Update {
        /// Task ID
        id: String,
        /// New title
        #[arg(long)]
        title: Option<String>,
        /// New description
        #[arg(long)]
        description: Option<String>,
        /// New project ID
        #[arg(long)]
        project_id: Option<String>,
        /// Comma-separated tags
        #[arg(long)]
        tags: Option<String>,
        /// New estimated pomodoros
        #[arg(long)]
        estimated_pomodoros: Option<i32>,
        /// Increment completed pomodoros
        #[arg(long)]
        inc_completed: Option<i32>,
        /// Set completed status
        #[arg(long)]
        completed: Option<bool>,
        /// New priority
        #[arg(long)]
        priority: Option<i32>,
        /// New category
        #[arg(long)]
        category: Option<String>,
    },
    /// Delete a task
    Delete {
        /// Task ID
        id: String,
    },
}

pub fn run(action: TaskAction) -> Result<(), Box<dyn std::error::Error>> {
    let db = ScheduleDb::open()?;

    match action {
        TaskAction::Create {
            title,
            description,
            project_id,
            tags,
            estimated_pomodoros,
            category,
        } => {
            let task = Task {
                id: Uuid::new_v4().to_string(),
                title,
                description,
                estimated_pomodoros,
                completed_pomodoros: 0,
                completed: false,
                project_id,
                tags: tags.map(|t| t.split(',').map(|s| s.trim().to_string()).collect()).unwrap_or_default(),
                priority: None,
                category: match category.as_str() {
                    "someday" => TaskCategory::Someday,
                    _ => TaskCategory::Active,
                },
                created_at: Utc::now(),
            };
            db.create_task(&task)?;
            println!("Task created: {}", task.id);
            println!("{}", serde_json::to_string_pretty(&task)?);
        }
        TaskAction::List { project_id, category } => {
            let all_tasks = db.list_tasks()?;
            let filtered: Vec<_> = all_tasks
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
            println!("{}", serde_json::to_string_pretty(&filtered)?);
        }
        TaskAction::Get { id } => {
            match db.get_task(&id)? {
                Some(task) => println!("{}", serde_json::to_string_pretty(&task)?),
                None => println!("Task not found: {id}"),
            }
        }
        TaskAction::Update {
            id,
            title,
            description,
            project_id,
            tags,
            estimated_pomodoros,
            inc_completed,
            completed,
            priority,
            category,
        } => {
            let mut task = db.get_task(&id)?.ok_or(format!("Task not found: {id}"))?;

            if let Some(t) = title { task.title = t; }
            if let Some(d) = description { task.description = Some(d); }
            if let Some(p) = project_id { task.project_id = Some(p); }
            if let Some(t) = tags {
                task.tags = t.split(',').map(|s| s.trim().to_string()).collect();
            }
            if let Some(e) = estimated_pomodoros { task.estimated_pomodoros = e; }
            if let Some(inc) = inc_completed { task.completed_pomodoros += inc; }
            if let Some(c) = completed { task.completed = c; }
            if let Some(p) = priority { task.priority = Some(p); }
            if let Some(c) = category {
                task.category = match c.as_str() {
                    "someday" => TaskCategory::Someday,
                    _ => TaskCategory::Active,
                };
            }

            db.update_task(&task)?;
            println!("Task updated:");
            println!("{}", serde_json::to_string_pretty(&task)?);
        }
        TaskAction::Delete { id } => {
            db.delete_task(&id)?;
            println!("Task deleted: {id}");
        }
    }
    Ok(())
}
