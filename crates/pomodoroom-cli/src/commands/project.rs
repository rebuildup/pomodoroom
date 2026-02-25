//! Project management commands for CLI.

use chrono::Utc;
use clap::Subcommand;
use pomodoroom_core::schedule::Project;
use pomodoroom_core::storage::schedule_db::ScheduleDb;
use uuid::Uuid;

#[derive(Subcommand)]
pub enum ProjectAction {
    /// Create a new project
    Create {
        /// Project name
        name: String,
        /// Deadline as ISO 8601 string
        #[arg(long)]
        deadline: Option<String>,
    },
    /// List all projects
    List,
}

pub fn run(action: ProjectAction) -> Result<(), Box<dyn std::error::Error>> {
    let db = ScheduleDb::open()?;

    match action {
        ProjectAction::Create { name, deadline } => {
            let deadline_dt = deadline
                .and_then(|d| chrono::DateTime::parse_from_rfc3339(&d).ok())
                .map(|dt| dt.with_timezone(&Utc));

            let project = Project {
                id: Uuid::new_v4().to_string(),
                name,
                deadline: deadline_dt,
                tasks: Vec::new(),
                created_at: Utc::now(),
                is_pinned: false,
                references: Vec::new(),
                default_tags: Vec::new(),
                color: None,
            };
            db.create_project(&project)?;
            println!("Project created: {}", project.id);
            println!("{}", serde_json::to_string_pretty(&project)?);
        }
        ProjectAction::List => {
            let projects = db.list_projects()?;
            println!("{}", serde_json::to_string_pretty(&projects)?);
        }
    }
    Ok(())
}
