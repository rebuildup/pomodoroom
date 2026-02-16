use clap::Subcommand;
use std::path::PathBuf;
use chrono::{Duration, Utc};
use pomodoroom_core::storage::Database;
use pomodoroom_core::{BreakAdherenceAnalyzer, BreakAdherenceReport};

#[derive(Subcommand)]
pub enum StatsAction {
    /// Today's stats
    Today,
    /// All-time stats
    All,
    /// Break adherence statistics
    Breaks {
        /// Start date (YYYY-MM-DD)
        #[arg(long)]
        start: Option<String>,
        /// End date (YYYY-MM-DD)
        #[arg(long)]
        end: Option<String>,
        /// Filter by project ID
        #[arg(long)]
        project: Option<String>,
        /// Show hourly breakdown
        #[arg(long)]
        by_hour: bool,
        /// Show project breakdown
        #[arg(long)]
        by_project: bool,
        /// Export to CSV
        #[arg(long)]
        export: Option<PathBuf>,
    },
}

pub fn run(action: StatsAction) -> Result<(), Box<dyn std::error::Error>> {
    let db = Database::open()?;

    match action {
        StatsAction::Today => {
            let stats = db.stats_today()?;
            println!("{}", serde_json::to_string_pretty(&stats)?);
        }
        StatsAction::All => {
            let stats = db.stats_all()?;
            println!("{}", serde_json::to_string_pretty(&stats)?);
        }
        StatsAction::Breaks { start, end, project, by_hour, by_project, export } => {
            show_break_adherence(&db, start, end, project, by_hour, by_project, export)?;
        }
    }
    Ok(())
}

/// Show break adherence statistics
fn show_break_adherence(
    db: &Database,
    start: Option<String>,
    end: Option<String>,
    project: Option<String>,
    by_hour: bool,
    by_project: bool,
    export: Option<PathBuf>,
) -> Result<(), Box<dyn std::error::Error>> {
    // Default date range: last 30 days to today
    let today = Utc::now();
    let default_start = (today - Duration::days(30)).format("%Y-%m-%d").to_string();
    let default_end = today.format("%Y-%m-%d").to_string();

    let start_date = start.unwrap_or(default_start);
    let end_date = end.unwrap_or(default_end);

    println!("Break Adherence Report");
    println!("Period: {} to {}", start_date, end_date);
    if let Some(ref proj) = project {
        println!("Project filter: {}", proj);
    }
    println!();

    // Fetch data from database
    let rows = db.get_break_adherence_data(&start_date, &end_date, project.as_deref())?;

    // Generate report
    let analyzer = BreakAdherenceAnalyzer::new();
    let report = analyzer.generate_report(&rows);

    // Print summary
    print_summary(&report);

    // Print hourly breakdown if requested
    if by_hour {
        print_hourly_breakdown(&report);
    }

    // Print project breakdown if requested
    if by_project {
        print_project_breakdown(&report);
    }

    // Show high-risk windows
    print_high_risk_windows(&report);

    // Export to CSV if requested
    if let Some(path) = export {
        export_break_report_csv(&report, &path)?;
        println!("\nReport exported to: {}", path.display());
    }

    Ok(())
}

/// Print summary statistics
fn print_summary(report: &BreakAdherenceReport) {
    let stats = &report.stats;
    println!("=== Summary ===");
    println!("Total focus sessions: {}", stats.total_focus_sessions);
    println!("Breaks taken on time: {}", stats.breaks_taken);
    println!("Breaks skipped: {}", stats.breaks_skipped);
    println!("Breaks deferred: {}", stats.breaks_deferred);
    println!(
        "Adherence rate: {:.1}%",
        stats.adherence_rate * 100.0
    );
    if stats.breaks_deferred > 0 {
        println!("Average delay: {:.1} min", stats.avg_delay_min);
    }
    println!();
}

/// Print hourly breakdown
fn print_hourly_breakdown(report: &BreakAdherenceReport) {
    if report.by_hour.is_empty() {
        return;
    }

    println!("=== Hourly Breakdown ===");
    println!("{:<6} {:<8} {:<8} {:<8} {:<8} {:<10} {:<10}",
        "Hour", "Total", "Taken", "Skipped", "Deferred", "Skip%", "Defer%");
    println!("{}", "-".repeat(64));

    // Sort by hour
    let mut hourly = report.by_hour.clone();
    hourly.sort_by_key(|h| h.hour);

    for h in hourly {
        println!(
            "{:<6} {:<8} {:<8} {:<8} {:<8} {:<9.1}% {:<9.1}%",
            format!("{}:00", h.hour),
            h.total,
            h.taken,
            h.skipped,
            h.deferred,
            h.skip_rate * 100.0,
            h.defer_rate * 100.0
        );
    }
    println!();
}

/// Print project breakdown
fn print_project_breakdown(report: &BreakAdherenceReport) {
    if report.by_project.is_empty() {
        println!("No project data available.\n");
        return;
    }

    println!("=== Project Breakdown ===");
    println!("{:<20} {:<8} {:<8} {:<8} {:<8} {:<12}",
        "Project", "Total", "Taken", "Skipped", "Deferred", "Adherence%");
    println!("{}", "-".repeat(72));

    for p in &report.by_project {
        println!(
            "{:<20} {:<8} {:<8} {:<8} {:<8} {:<11.1}%",
            truncate(&p.project_name, 20),
            p.stats.total_focus_sessions,
            p.stats.breaks_taken,
            p.stats.breaks_skipped,
            p.stats.breaks_deferred,
            p.stats.adherence_rate * 100.0
        );
    }
    println!();
}

/// Print high-risk windows
fn print_high_risk_windows(report: &BreakAdherenceReport) {
    if report.high_risk_windows.is_empty() {
        println!("No high-risk windows detected.");
        return;
    }

    println!("=== High-Risk Windows ===");
    println!("Times when you're most likely to skip or defer breaks:");
    println!();

    for window in &report.high_risk_windows {
        println!(
            "  {} - Skip: {:.1}%, Defer: {:.1}%",
            format_hour(window.hour),
            window.skip_rate * 100.0,
            window.defer_rate * 100.0
        );
    }
    println!();
}

/// Format hour in 12-hour format
fn format_hour(hour: u32) -> String {
    match hour {
        0 => "12 AM".to_string(),
        1..=11 => format!("{} AM", hour),
        12 => "12 PM".to_string(),
        13..=23 => format!("{} PM", hour - 12),
        _ => format!("{}", hour),
    }
}

/// Truncate string to max length
fn truncate(s: &str, max_len: usize) -> String {
    if s.len() > max_len {
        format!("{}...", &s[..max_len - 3])
    } else {
        s.to_string()
    }
}

/// Export report to CSV
fn export_break_report_csv(report: &BreakAdherenceReport, path: &PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    use std::fs::File;
    use std::io::Write;

    let mut file = File::create(path)?;

    // Summary section
    writeln!(file, "Break Adherence Report")?;
    writeln!(file, "Metric,Value")?;
    writeln!(file, "Total focus sessions,{}", report.stats.total_focus_sessions)?;
    writeln!(file, "Breaks taken on time,{}", report.stats.breaks_taken)?;
    writeln!(file, "Breaks skipped,{}", report.stats.breaks_skipped)?;
    writeln!(file, "Breaks deferred,{}", report.stats.breaks_deferred)?;
    writeln!(file, "Adherence rate,{:.4}", report.stats.adherence_rate)?;
    writeln!(file, "Average delay (min),{:.2}", report.stats.avg_delay_min)?;
    writeln!(file)?;

    // Hourly breakdown
    if !report.by_hour.is_empty() {
        writeln!(file, "Hourly Breakdown")?;
        writeln!(file, "Hour,Total,Taken,Skipped,Deferred,Skip Rate,Defer Rate,Risk Score")?;

        let mut hourly = report.by_hour.clone();
        hourly.sort_by_key(|h| h.hour);

        for h in hourly {
            writeln!(
                file,
                "{},{},{},{},{},{:.4},{:.4},{:.4}",
                h.hour, h.total, h.taken, h.skipped, h.deferred,
                h.skip_rate, h.defer_rate, h.risk_score
            )?;
        }
        writeln!(file)?;
    }

    // Project breakdown
    if !report.by_project.is_empty() {
        writeln!(file, "Project Breakdown")?;
        writeln!(file, "Project,Total,Taken,Skipped,Deferred,Adherence Rate")?;

        for p in &report.by_project {
            writeln!(
                file,
                "{},{},{},{},{},{:.4}",
                p.project_name,
                p.stats.total_focus_sessions,
                p.stats.breaks_taken,
                p.stats.breaks_skipped,
                p.stats.breaks_deferred,
                p.stats.adherence_rate
            )?;
        }
        writeln!(file)?;
    }

    // High-risk windows
    if !report.high_risk_windows.is_empty() {
        writeln!(file, "High-Risk Windows")?;
        writeln!(file, "Hour,Skip Rate,Defer Rate")?;

        for window in &report.high_risk_windows {
            writeln!(
                file,
                "{},{:.4},{:.4}",
                window.hour, window.skip_rate, window.defer_rate
            )?;
        }
    }

    Ok(())
}
