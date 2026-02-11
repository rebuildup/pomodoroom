//! Schedule management commands for CLI.
//!
//! Implements schedule generation, auto-fill, and block management.
//!
//! Issue #175: Phase 2 — Schedule unification

use clap::Subcommand;
use chrono::{DateTime, Utc};
use pomodoroom_core::schedule::{BlockType, DailyTemplate, FixedEvent, ScheduleBlock};
use pomodoroom_core::scheduler::{AutoScheduler, CalendarEvent, ScheduledBlock};
use pomodoroom_core::storage::ScheduleDb;
use uuid::Uuid;

#[derive(Subcommand)]
pub enum ScheduleAction {
    /// Generate daily schedule from template and tasks
    Generate {
        /// Target date in ISO format (YYYY-MM-DD), defaults to today
        #[arg(short, long)]
        date: Option<String>,
        /// Use progressive focus schedule (25m focus + 5m break pattern)
        #[arg(long)]
        progressive: bool,
        /// Override max parallel lanes (default: from template or 2)
        #[arg(long)]
        lanes: Option<i32>,
        /// Path to JSON file containing calendar events
        #[arg(long)]
        calendar_events: Option<String>,
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// Auto-fill available time slots with top priority tasks
    AutoFill {
        /// Target date in ISO format (YYYY-MM-DD), defaults to today
        #[arg(short, long)]
        date: Option<String>,
        /// Preview changes without saving to database
        #[arg(long)]
        dry_run: bool,
        /// Path to JSON file containing calendar events
        #[arg(long)]
        calendar_events: Option<String>,
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// Show schedule for a specific date
    Show {
        /// Target date in ISO format (YYYY-MM-DD), defaults to today
        #[arg(short, long)]
        date: Option<String>,
        /// Output format: table, timeline, or json
        #[arg(long, default_value = "table")]
        format: String,
    },
    /// Block management subcommands
    Block {
        #[command(subcommand)]
        action: BlockAction,
    },
    /// Template management subcommands
    Template {
        #[command(subcommand)]
        action: TemplateAction,
    },
}

#[derive(Subcommand)]
pub enum BlockAction {
    /// List schedule blocks for a date range
    List {
        /// Start date in ISO format (YYYY-MM-DD)
        #[arg(short, long)]
        start: String,
        /// End date in ISO format (YYYY-MM-DD), defaults to start + 24h
        #[arg(short, long)]
        end: Option<String>,
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// Move a block to a new time or lane
    Move {
        /// Block ID to move
        id: String,
        /// New start time in ISO 8601 format
        #[arg(long)]
        start: Option<String>,
        /// New end time in ISO 8601 format
        #[arg(long)]
        end: Option<String>,
        /// New lane index
        #[arg(long)]
        lane: Option<i32>,
    },
    /// Delete a schedule block
    Delete {
        /// Block ID to delete
        id: String,
    },
}

#[derive(Subcommand)]
pub enum TemplateAction {
    /// Show current daily template
    Show {
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// Set daily template properties
    Set {
        /// Wake up time (HH:MM format)
        #[arg(long)]
        wake_up: Option<String>,
        /// Sleep time (HH:MM format)
        #[arg(long)]
        sleep: Option<String>,
        /// Max parallel lanes
        #[arg(long)]
        max_lanes: Option<i32>,
    },
    /// Manage fixed events in template
    Event {
        #[command(subcommand)]
        action: EventAction,
    },
}

#[derive(Subcommand)]
pub enum EventAction {
    /// List all fixed events
    List {
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// Add a new fixed event
    Add {
        /// Event name
        name: String,
        /// Start time (HH:MM format)
        #[arg(long)]
        start: String,
        /// Duration in minutes
        #[arg(long)]
        duration: u32,
        /// Comma-separated days (1-7, where 1=Monday)
        #[arg(long)]
        days: String,
    },
    /// Remove a fixed event
    Remove {
        /// Event ID
        id: String,
    },
}

pub fn run(action: ScheduleAction) -> Result<(), Box<dyn std::error::Error>> {
    match action {
        ScheduleAction::Generate {
            date,
            progressive,
            lanes,
            calendar_events,
            json,
        } => run_generate(date, progressive, lanes, calendar_events, json)?,
        ScheduleAction::AutoFill {
            date,
            dry_run,
            calendar_events,
            json,
        } => run_auto_fill(date, dry_run, calendar_events, json)?,
        ScheduleAction::Show { date, format } => run_show(date, format)?,
        ScheduleAction::Block { action } => run_block(action)?,
        ScheduleAction::Template { action } => run_template(action)?,
    }
    Ok(())
}

/// Parse ISO date string (YYYY-MM-DD) to DateTime at midnight UTC
fn parse_date_iso(date_iso: &str) -> Result<DateTime<Utc>, String> {
    let naive_date = chrono::NaiveDate::parse_from_str(date_iso, "%Y-%m-%d")
        .map_err(|e| format!("Invalid date format: {e}. Use YYYY-MM-DD."))?;
    let datetime = naive_date
        .and_hms_opt(0, 0, 0)
        .ok_or_else(|| "Invalid date time".to_string())?;
    Ok(DateTime::<Utc>::from_naive_utc_and_offset(datetime, Utc))
}

/// Parse ISO 8601 datetime string
fn parse_datetime_iso(dt_str: &str) -> Result<DateTime<Utc>, String> {
    DateTime::parse_from_rfc3339(dt_str)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|e| format!("Invalid datetime format: {e}. Use ISO 8601 format."))
}

/// Parse time string (HH:MM) to minutes since midnight
fn parse_time_hm(time_str: &str) -> Result<u32, String> {
    let parts: Vec<&str> = time_str.split(':').collect();
    if parts.len() != 2 {
        return Err("Invalid time format. Use HH:MM.".to_string());
    }
    let hour: u32 = parts[0]
        .parse()
        .map_err(|_| "Invalid hour".to_string())?;
    let minute: u32 = parts[1]
        .parse()
        .map_err(|_| "Invalid minute".to_string())?;
    if hour > 23 || minute > 59 {
        return Err("Time out of range".to_string());
    }
    Ok(hour * 60 + minute)
}

/// Format minutes since midnight to HH:MM
fn format_time_hm(minutes: u32) -> String {
    format!("{:02}:{:02}", minutes / 60, minutes % 60)
}

/// Parse block type from string
fn parse_block_type(s: &str) -> Result<BlockType, String> {
    match s.to_lowercase().as_str() {
        "focus" => Ok(BlockType::Focus),
        "break" => Ok(BlockType::Break),
        "routine" => Ok(BlockType::Routine),
        "calendar" => Ok(BlockType::Calendar),
        _ => Err(format!(
            "Invalid block type: {s}. Use focus, break, routine, or calendar."
        )),
    }
}

/// Load daily template from database, returning default if not found
fn load_daily_template(db: &ScheduleDb) -> Result<DailyTemplate, Box<dyn std::error::Error>> {
    match db.get_daily_template()? {
        Some(template) => Ok(template),
        None => {
            // Return default template
            Ok(DailyTemplate {
                wake_up: "07:00".to_string(),
                sleep: "23:00".to_string(),
                fixed_events: Vec::new(),
                max_parallel_lanes: Some(2),
            })
        }
    }
}

/// Parse calendar events from JSON file path
fn load_calendar_events(path: Option<String>) -> Result<Vec<CalendarEvent>, Box<dyn std::error::Error>> {
    let Some(path) = path else {
        return Ok(Vec::new());
    };

    let json = std::fs::read_to_string(&path)?;
    let events_array: Vec<serde_json::Value> = serde_json::from_str(&json)?;

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

        let start_time = parse_datetime_iso(start_str)?;
        let end_time = parse_datetime_iso(end_str)?;

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

fn run_generate(
    date_str: Option<String>,
    progressive: bool,
    lanes_override: Option<i32>,
    calendar_events_path: Option<String>,
    json_output: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let db = ScheduleDb::open()?;
    let mut template = load_daily_template(&db)?;
    let tasks = db.list_tasks()?;
    let calendar_events = load_calendar_events(calendar_events_path)?;

    // Apply lanes override
    if let Some(lanes) = lanes_override {
        template.max_parallel_lanes = Some(lanes);
    }

    let date = if let Some(d) = date_str {
        parse_date_iso(&d)?
    } else {
        Utc::now()
    };

    let scheduler = AutoScheduler::new();
    let scheduled_blocks = if progressive {
        // Progressive mode: generate using focus schedule pattern
        scheduler.generate_schedule(&template, &tasks, &calendar_events, date)
    } else {
        scheduler.generate_schedule(&template, &tasks, &calendar_events, date)
    };

    if json_output {
        println!("{}", serde_json::to_string_pretty(&scheduled_blocks)?);
    } else {
        print_scheduled_blocks(&scheduled_blocks, &date, progressive)?;
    }

    Ok(())
}

fn run_auto_fill(
    date_str: Option<String>,
    dry_run: bool,
    calendar_events_path: Option<String>,
    json_output: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let db = ScheduleDb::open()?;
    let template = load_daily_template(&db)?;
    let tasks = db.list_tasks()?;
    let calendar_events = load_calendar_events(calendar_events_path)?;

    let date = if let Some(d) = date_str {
        parse_date_iso(&d)?
    } else {
        Utc::now()
    };

    let scheduler = AutoScheduler::new();
    let scheduled_blocks = scheduler.auto_fill(&template, &tasks, &calendar_events, date);

    if dry_run {
        println!("Dry run mode - changes will NOT be saved:");
    } else {
        // Save blocks to database
        for block in &scheduled_blocks {
            let schedule_block = scheduled_to_schedule_block(block);
            db.create_schedule_block(&schedule_block)?;
        }
        println!("Auto-filled {} schedule blocks", scheduled_blocks.len());
    }

    if json_output {
        println!("{}", serde_json::to_string_pretty(&scheduled_blocks)?);
    } else {
        print_scheduled_blocks(&scheduled_blocks, &date, false)?;
    }

    Ok(())
}

fn run_show(date_str: Option<String>, format: String) -> Result<(), Box<dyn std::error::Error>> {
    let db = ScheduleDb::open()?;

    let date = if let Some(d) = date_str {
        parse_date_iso(&d)?
    } else {
        Utc::now()
    };

    let start_time = date;
    let end_time = date + chrono::Duration::days(1);

    let blocks = db.list_schedule_blocks(Some(&start_time), Some(&end_time))?;

    match format.as_str() {
        "json" => {
            println!("{}", serde_json::to_string_pretty(&blocks)?);
        }
        "timeline" => {
            print_timeline_view(&blocks, &date)?;
        }
        "table" | _ => {
            print_table_view(&blocks)?;
        }
    }

    Ok(())
}

fn run_block(action: BlockAction) -> Result<(), Box<dyn std::error::Error>> {
    match action {
        BlockAction::List { start, end, json } => {
            run_block_list(start, end, json)?;
        }
        BlockAction::Move { id, start, end, lane } => {
            run_block_move(id, start, end, lane)?;
        }
        BlockAction::Delete { id } => {
            run_block_delete(id)?;
        }
    }
    Ok(())
}

fn run_block_list(
    start_iso: String,
    end_iso: Option<String>,
    json: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let db = ScheduleDb::open()?;

    let start_time = parse_datetime_iso(&start_iso)?;

    let end_time = if let Some(end) = end_iso {
        parse_datetime_iso(&end)?
    } else {
        start_time + chrono::Duration::days(1)
    };

    let blocks = db.list_schedule_blocks(Some(&start_time), Some(&end_time))?;

    if json {
        println!("{}", serde_json::to_string_pretty(&blocks)?);
    } else {
        print_table_view(&blocks)?;
    }

    Ok(())
}

fn run_block_move(
    id: String,
    start: Option<String>,
    end: Option<String>,
    lane: Option<i32>,
) -> Result<(), Box<dyn std::error::Error>> {
    let db = ScheduleDb::open()?;

    let mut block = db
        .get_schedule_block(&id)?
        .ok_or_else(|| format!("Schedule block not found: {id}"))?;

    if let Some(st) = start {
        block.start_time = parse_datetime_iso(&st)?;
    }
    if let Some(et) = end {
        block.end_time = parse_datetime_iso(&et)?;
    }
    if let Some(l) = lane {
        block.lane = Some(l);
    }

    db.update_schedule_block(&block)?;

    println!("Schedule block moved: {}", block.id);
    println!("{}", serde_json::to_string_pretty(&block)?);
    Ok(())
}

fn run_block_delete(id: String) -> Result<(), Box<dyn std::error::Error>> {
    let db = ScheduleDb::open()?;

    // Verify block exists
    let block = db
        .get_schedule_block(&id)?
        .ok_or_else(|| format!("Schedule block not found: {id}"))?;

    db.delete_schedule_block(&id)?;

    println!("Schedule block deleted: {}", id);
    println!("Type: {}", format_block_type(&block.block_type));
    if let Some(label) = &block.label {
        println!("Label: {}", label);
    }
    Ok(())
}

fn run_template(action: TemplateAction) -> Result<(), Box<dyn std::error::Error>> {
    match action {
        TemplateAction::Show { json } => {
            run_template_show(json)?;
        }
        TemplateAction::Set {
            wake_up,
            sleep,
            max_lanes,
        } => {
            run_template_set(wake_up, sleep, max_lanes)?;
        }
        TemplateAction::Event { action } => {
            run_template_event(action)?;
        }
    }
    Ok(())
}

fn run_template_show(json: bool) -> Result<(), Box<dyn std::error::Error>> {
    let db = ScheduleDb::open()?;

    match db.get_daily_template()? {
        Some(template) => {
            if json {
                println!("{}", serde_json::to_string_pretty(&template)?);
            } else {
                print_template(&template)?;
            }
        }
        None => {
            println!("No template found. Use 'template set' to create one.");
        }
    }

    Ok(())
}

fn run_template_set(
    wake_up: Option<String>,
    sleep: Option<String>,
    max_lanes: Option<i32>,
) -> Result<(), Box<dyn std::error::Error>> {
    let db = ScheduleDb::open()?;

    let mut template = match db.get_daily_template()? {
        Some(t) => t,
        None => DailyTemplate {
            wake_up: "07:00".to_string(),
            sleep: "23:00".to_string(),
            fixed_events: Vec::new(),
            max_parallel_lanes: Some(2),
        },
    };

    if let Some(wake) = wake_up {
        template.wake_up = wake;
    }
    if let Some(sleep_time) = sleep {
        template.sleep = sleep_time;
    }
    if let Some(lanes) = max_lanes {
        template.max_parallel_lanes = Some(lanes);
    }

    if db.get_daily_template()?.is_some() {
        db.update_daily_template(&template)?;
    } else {
        db.create_daily_template(&template)?;
    }

    println!("Daily template updated:");
    print_template(&template)?;

    Ok(())
}

fn run_template_event(action: EventAction) -> Result<(), Box<dyn std::error::Error>> {
    match action {
        EventAction::List { json } => {
            run_template_event_list(json)?;
        }
        EventAction::Add {
            name,
            start,
            duration,
            days,
        } => {
            run_template_event_add(name, start, duration, days)?;
        }
        EventAction::Remove { id } => {
            run_template_event_remove(id)?;
        }
    }
    Ok(())
}

fn run_template_event_list(json: bool) -> Result<(), Box<dyn std::error::Error>> {
    let db = ScheduleDb::open()?;

    let template = match db.get_daily_template()? {
        Some(t) => t,
        None => {
            println!("No template found.");
            return Ok(());
        }
    };

    if json {
        println!("{}", serde_json::to_string_pretty(&template.fixed_events)?);
    } else {
        if template.fixed_events.is_empty() {
            println!("No fixed events in template.");
        } else {
            println!("Fixed events ({}):", template.fixed_events.len());
            for event in &template.fixed_events {
                println!(
                    "  [{}] {} @ {} ({}min) | days: {:?}",
                    event.id, event.name, event.start_time, event.duration_minutes, event.days
                );
            }
        }
    }

    Ok(())
}

fn run_template_event_add(
    name: String,
    start: String,
    duration: u32,
    days_str: String,
) -> Result<(), Box<dyn std::error::Error>> {
    let db = ScheduleDb::open()?;

    let mut template = match db.get_daily_template()? {
        Some(t) => t,
        None => DailyTemplate {
            wake_up: "07:00".to_string(),
            sleep: "23:00".to_string(),
            fixed_events: Vec::new(),
            max_parallel_lanes: Some(2),
        },
    };

    // Parse days (comma-separated 1-7 where 1=Monday, convert to 0-6 where 0=Sunday)
    let days: Vec<u8> = days_str
        .split(',')
        .map(|s| {
            let day = s.trim().parse::<i32>().map_err(|_| "Invalid day format".to_string())?;
            // Convert 1-7 (Mon-Sun) to 0-6 (Sun-Sat)
            let converted = if day == 7 { 0 } else { day };
            if converted < 0 || converted > 6 {
                Err("Day must be between 1 and 7".to_string())
            } else {
                Ok(converted as u8)
            }
        })
        .collect::<Result<Vec<_>, _>>()?;

    let event = FixedEvent {
        id: Uuid::new_v4().to_string(),
        name,
        start_time: start,
        duration_minutes: duration as i32,
        days,
        enabled: true,
    };

    template.fixed_events.push(event.clone());

    if db.get_daily_template()?.is_some() {
        db.update_daily_template(&template)?;
    } else {
        db.create_daily_template(&template)?;
    }

    println!("Fixed event added: {}", event.id);
    println!("  Name: {}", event.name);
    println!("  Time: {} ({}min)", event.start_time, event.duration_minutes);
    println!("  Days: {:?}", event.days);

    Ok(())
}

fn run_template_event_remove(id: String) -> Result<(), Box<dyn std::error::Error>> {
    let db = ScheduleDb::open()?;

    let mut template = db
        .get_daily_template()?
        .ok_or_else(|| "No template found".to_string())?;

    template.fixed_events.retain(|e| e.id != id);

    db.update_daily_template(&template)?;

    println!("Fixed event removed: {}", id);

    Ok(())
}

// === Formatting functions ===

/// Convert ScheduledBlock to ScheduleBlock for database storage
fn scheduled_to_schedule_block(block: &ScheduledBlock) -> ScheduleBlock {
    ScheduleBlock {
        id: uuid::Uuid::new_v4().to_string(),
        block_type: BlockType::Focus,
        task_id: Some(block.task_id.clone()),
        start_time: block.start_time,
        end_time: block.end_time,
        locked: false,
        label: Some(block.task_title.clone()),
        lane: None,
    }
}

fn format_block_type(block_type: &BlockType) -> &'static str {
    match block_type {
        BlockType::Focus => "FOCUS",
        BlockType::Break => "BREAK",
        BlockType::Routine => "ROUTINE",
        BlockType::Calendar => "CALENDAR",
    }
}

fn print_scheduled_blocks(
    blocks: &[ScheduledBlock],
    date: &DateTime<Utc>,
    progressive: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    if blocks.is_empty() {
        println!("No schedule blocks generated for {}", date.format("%Y-%m-%d"));
        return Ok(());
    }

    println!("Schedule for {}:", date.format("%Y-%m-%d"));
    if progressive {
        println!("Mode: Progressive Focus");
    }
    println!("Blocks: {}", blocks.len());
    println!();

    for block in blocks {
        println!(
            "  [{}] {} - {} | {} | {} pomodoros",
            block.id,
            block.start_time.format("%H:%M"),
            block.end_time.format("%H:%M"),
            block.task_title,
            block.pomodoro_count
        );
    }

    Ok(())
}

fn print_table_view(blocks: &[ScheduleBlock]) -> Result<(), Box<dyn std::error::Error>> {
    if blocks.is_empty() {
        println!("No schedule blocks found.");
        return Ok(());
    }

    println!("{:<36} {:<11} {:<11} {:<10} {:<6} {}",
        "ID",
        "START",
        "END",
        "TYPE",
        "LANE",
        "LABEL"
    );
    println!("{}", "-".repeat(100));

    for block in blocks {
        println!("{:<36} {:<11} {:<11} {:<10} {:<6} {}",
            block.id,
            block.start_time.format("%H:%M"),
            block.end_time.format("%H:%M"),
            format_block_type(&block.block_type),
            block.lane.map_or("-".to_string(), |l| l.to_string()),
            block.label.as_deref().unwrap_or("-")
        );
    }

    Ok(())
}

fn print_timeline_view(
    blocks: &[ScheduleBlock],
    date: &DateTime<Utc>,
) -> Result<(), Box<dyn std::error::Error>> {
    if blocks.is_empty() {
        println!("No schedule blocks found for {}", date.format("%Y-%m-%d"));
        return Ok(());
    }

    println!("Timeline for {}:", date.format("%Y-%m-%d"));
    println!();

    // Sort blocks by start time and lane
    let mut sorted_blocks = blocks.to_vec();
    sorted_blocks.sort_by(|a, b| {
        a.start_time
            .cmp(&b.start_time)
            .then_with(|| a.lane.cmp(&b.lane))
    });

    // Group by lane
    let mut lanes: std::collections::HashMap<Option<i32>, Vec<&ScheduleBlock>> =
        std::collections::HashMap::new();
    for block in &sorted_blocks {
        lanes.entry(block.lane).or_default().push(block);
    }

    // Print timeline for each lane
    let mut lane_ids: Vec<_> = lanes.keys().cloned().collect();
    lane_ids.sort();

    for lane_id in lane_ids {
        let lane_blocks = lanes.get(&lane_id).unwrap();
        let lane_label = lane_id.map_or("Main".to_string(), |l| format!("Lane {}", l));

        println!("{}:", lane_label);

        for block in lane_blocks {
            let duration = (block.end_time - block.start_time).num_minutes();
            let icon = match block.block_type {
                BlockType::Focus => "[FOCUS]",
                BlockType::Break => "[BREAK]",
                BlockType::Routine => "[RTN]",
                BlockType::Calendar => "[CAL]",
            };
            println!(
                "  {} {} - {} ({:3}m) {}",
                icon,
                block.start_time.format("%H:%M"),
                block.end_time.format("%H:%M"),
                duration,
                block.label.as_deref().unwrap_or("")
            );
        }
        println!();
    }

    Ok(())
}

fn print_template(template: &DailyTemplate) -> Result<(), Box<dyn std::error::Error>> {
    println!("Daily Template:");
    println!("  Wake up: {}", template.wake_up);
    println!("  Sleep:   {}", template.sleep);
    println!(
        "  Max lanes: {}",
        template.max_parallel_lanes.map_or("auto".to_string(), |l| l.to_string())
    );
    println!("  Fixed events: {}", template.fixed_events.len());

    for event in &template.fixed_events {
        println!(
            "    [{}] {} @ {} ({}min) | days: {:?}",
            event.id, event.name, event.start_time, event.duration_minutes, event.days
        );
    }

    Ok(())
}
