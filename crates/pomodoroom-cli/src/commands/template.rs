//! Daily template management commands for CLI.

use clap::Subcommand;
use pomodoroom_core::schedule::{DailyTemplate, FixedEvent};
use pomodoroom_core::storage::schedule_db::ScheduleDb;
use uuid::Uuid;

#[derive(Subcommand)]
pub enum TemplateAction {
    /// Get the daily template
    Get,
    /// Set the daily template from JSON
    Set {
        /// Daily template as JSON
        json: String,
    },
    /// Reset to default template
    Reset,
}

pub fn run(action: TemplateAction) -> Result<(), Box<dyn std::error::Error>> {
    let db = ScheduleDb::open()?;

    match action {
        TemplateAction::Get => {
            match db.get_daily_template()? {
                Some(template) => println!("{}", serde_json::to_string_pretty(&template)?),
                None => println!("No template found. Use 'template set' to create one."),
            }
        }
        TemplateAction::Set { json } => {
            let template: DailyTemplate = serde_json::from_str(&json)?;
            if db.get_daily_template()?.is_some() {
                db.update_daily_template(&template)?;
            } else {
                db.create_daily_template(&template)?;
            }
            println!("Daily template updated.");
        }
        TemplateAction::Reset => {
            let default = DailyTemplate {
                wake_up: "07:00".to_string(),
                sleep: "23:00".to_string(),
                fixed_events: vec![
                    FixedEvent {
                        id: Uuid::new_v4().to_string(),
                        name: "Lunch".to_string(),
                        start_time: "12:00".to_string(),
                        duration_minutes: 60,
                        days: vec![1, 2, 3, 4, 5], // Mon-Fri
                        enabled: true,
                    },
                ],
                max_parallel_lanes: Some(2),
            };
            if db.get_daily_template()?.is_some() {
                db.update_daily_template(&default)?;
            } else {
                db.create_daily_template(&default)?;
            }
            println!("Daily template reset to default:");
            println!("{}", serde_json::to_string_pretty(&default)?);
        }
    }
    Ok(())
}
