use clap::Subcommand;
use chrono::{DateTime, Utc};
use pomodoroom_core::schedule::{DailyTemplate, TaskCategory};
use pomodoroom_core::scheduler::AutoScheduler;
use pomodoroom_core::storage::ScheduleDb;
use pomodoroom_core::timer::Schedule;
use pomodoroom_core::Config;

#[derive(Subcommand)]
pub enum ScheduleAction {
    /// Show current timer schedule
    TimerSchedule {
        /// Show current schedule
        #[arg(long)]
        list: bool,
        /// Set schedule from JSON string
        #[arg(long)]
        set: Option<String>,
        /// Reset to default progressive schedule
        #[arg(long)]
        reset: bool,
    },
    /// Task management
    Task {
        #[command(subcommand)]
        action: TaskAction,
    },
    /// Project management
    Project {
        #[command(subcommand)]
        action: ProjectAction,
    },
    /// Daily template management
    Template {
        #[command(subcommand)]
        action: TemplateAction,
    },
    /// Generate daily schedule
    Generate {
        /// Target date in ISO format (YYYY-MM-DD), defaults to today
        #[arg(short, long)]
        date: Option<String>,
    },
}

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
        project: Option<String>,
        /// Comma-separated tags
        #[arg(long)]
        tags: Option<String>,
        /// Estimated number of pomodoros
        #[arg(long = "estimated-pomodoros", default_value = "1")]
        estimated: i32,
        /// Task category (active or someday)
        #[arg(long, default_value = "active")]
        category: String,
    },
    /// List tasks
    List {
        /// Filter by project ID
        #[arg(long)]
        project: Option<String>,
        /// Filter by category (active or someday)
        #[arg(long)]
        category: Option<String>,
    },
    /// Delete a task
    Delete {
        /// Task ID
        id: String,
    },
}

#[derive(Subcommand)]
pub enum ProjectAction {
    /// Create a new project
    Create {
        /// Project name
        name: String,
        /// Project deadline (ISO 8601 format)
        #[arg(long)]
        deadline: Option<String>,
    },
    /// List all projects
    List,
}

#[derive(Subcommand)]
pub enum TemplateAction {
    /// Get current daily template
    Get,
    /// Set daily template from JSON file or string
    Set {
        /// Path to JSON file or JSON string
        template: String,
    },
}

pub fn run(action: ScheduleAction) -> Result<(), Box<dyn std::error::Error>> {
    match action {
        ScheduleAction::TimerSchedule { list, set, reset } => {
            run_timer_schedule(list, set, reset)?;
        }
        ScheduleAction::Task { action } => run_task(action)?,
        ScheduleAction::Project { action } => run_project(action)?,
        ScheduleAction::Template { action } => run_template(action)?,
        ScheduleAction::Generate { date } => run_generate(date)?,
    }
    Ok(())
}

fn run_timer_schedule(list: bool, set: Option<String>, reset: bool) -> Result<(), Box<dyn std::error::Error>> {
    if list {
        let config = Config::load_or_default();
        let schedule = config.schedule();
        println!("{}", serde_json::to_string_pretty(&schedule)?);
    } else if let Some(json) = set {
        let schedule: Schedule = serde_json::from_str(&json)?;
        let mut config = Config::load_or_default();
        config.schedule = Some(schedule);
        config.save()?;
        println!("Schedule updated");
    } else if reset {
        let mut config = Config::load_or_default();
        config.schedule = None;
        config.save()?;
        println!("Schedule reset to default progressive");
    } else {
        // Default: show list
        let config = Config::load_or_default();
        let schedule = config.schedule();
        println!("{}", serde_json::to_string_pretty(&schedule)?);
    }
    Ok(())
}

fn run_task(action: TaskAction) -> Result<(), Box<dyn std::error::Error>> {
    let db = ScheduleDb::open()?;

    match action {
        TaskAction::Create {
            title,
            description,
            project,
            tags,
            estimated,
            category,
        } => {
            let task = pomodoroom_core::schedule::Task {
                id: uuid::Uuid::new_v4().to_string(),
                title,
                description,
                estimated_pomodoros: estimated,
                completed_pomodoros: 0,
                completed: false,
                project_id: project,
                tags: tags
                    .map(|t| t.split(',').map(|s| s.trim().to_string()).collect())
                    .unwrap_or_default(),
                priority: None,
                category: match category.as_str() {
                    "someday" => TaskCategory::Someday,
                    _ => TaskCategory::Active,
                },
                created_at: chrono::Utc::now(),
            };

            db.create_task(&task)?;
            println!("{}", serde_json::to_string_pretty(&task)?);
        }
        TaskAction::List { project, category } => {
            let all_tasks = db.list_tasks()?;

            let filtered: Vec<_> = all_tasks
                .into_iter()
                .filter(|task| {
                    if let Some(ref pid) = project {
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
        TaskAction::Delete { id } => {
            db.delete_task(&id)?;
            println!("Task deleted");
        }
    }

    Ok(())
}

fn run_project(action: ProjectAction) -> Result<(), Box<dyn std::error::Error>> {
    let db = ScheduleDb::open()?;

    match action {
        ProjectAction::Create { name, deadline } => {
            let deadline_dt = deadline
                .and_then(|d| chrono::DateTime::parse_from_rfc3339(&d).ok())
                .map(|dt| dt.with_timezone(&chrono::Utc));

            let project = pomodoroom_core::schedule::Project {
                id: uuid::Uuid::new_v4().to_string(),
                name,
                deadline: deadline_dt,
                tasks: Vec::new(),
                created_at: chrono::Utc::now(),
            };

            db.create_project(&project)?;
            println!("{}", serde_json::to_string_pretty(&project)?);
        }
        ProjectAction::List => {
            let projects = db.list_projects()?;
            println!("{}", serde_json::to_string_pretty(&projects)?);
        }
    }

    Ok(())
}

fn run_template(action: TemplateAction) -> Result<(), Box<dyn std::error::Error>> {
    let db = ScheduleDb::open()?;

    match action {
        TemplateAction::Get => {
            match db.get_daily_template()? {
                Some(template) => {
                    println!("{}", serde_json::to_string_pretty(&template)?);
                }
                None => {
                    // Return default template
                    let default = DailyTemplate {
                        wake_up: "07:00".to_string(),
                        sleep: "23:00".to_string(),
                        fixed_events: Vec::new(),
                        max_parallel_lanes: Some(2),
                    };
                    println!("{}", serde_json::to_string_pretty(&default)?);
                }
            }
        }
        TemplateAction::Set { template } => {
            // Try to read as file first, then as JSON string
            let json = if std::path::Path::new(&template).exists() {
                std::fs::read_to_string(&template)?
            } else {
                template
            };

            let daily_template: DailyTemplate = serde_json::from_str(&json)?;

            if db.get_daily_template()?.is_some() {
                db.update_daily_template(&daily_template)?;
            } else {
                db.create_daily_template(&daily_template)?;
            }

            println!("Daily template updated");
        }
    }

    Ok(())
}

fn run_generate(date_str: Option<String>) -> Result<(), Box<dyn std::error::Error>> {
    let db = ScheduleDb::open()?;

    // Get daily template
    let template = match db.get_daily_template()? {
        Some(t) => t,
        None => {
            eprintln!("No daily template found. Set one first with `schedule template set`.");
            return Ok(());
        }
    };

    // Get all tasks
    let tasks = db.list_tasks()?;

    // Parse date (use today if not provided)
    let date = if let Some(d) = date_str {
        // Parse YYYY-MM-DD format
        let naive_date = chrono::NaiveDate::parse_from_str(&d, "%Y-%m-%d")
            .map_err(|e| format!("Invalid date format: {e}. Use YYYY-MM-DD."))?;
        let datetime = naive_date.and_hms_opt(0, 0, 0)
            .ok_or_else(|| "Invalid date time".to_string())?;
        DateTime::<Utc>::from_naive_utc_and_offset(datetime, Utc)
    } else {
        Utc::now()
    };

    // Generate schedule using AutoScheduler
    let scheduler = AutoScheduler::new();
    let scheduled_blocks = scheduler.generate_schedule(&template, &tasks, &[], date);

    println!("{}", serde_json::to_string_pretty(&scheduled_blocks)?);

    Ok(())
}
