//! Energy curve command for displaying productivity patterns.

use clap::Subcommand;
use chrono::{Datelike, Local, Timelike};

use pomodoroom_core::{Database, EnergyCurveAnalyzer};
use pomodoroom_core::storage::data_dir;

#[derive(Subcommand)]
pub enum EnergyAction {
    /// Show current energy curve
    Show {
        /// Day of week (0-6 or sun/mon/tue/wed/thu/fri/sat)
        #[arg(long)]
        day: Option<String>,
    },
    /// Force recalculation of energy curve
    Update {
        /// Start date (YYYY-MM-DD)
        #[arg(long)]
        start: Option<String>,
        /// End date (YYYY-MM-DD)
        #[arg(long)]
        end: Option<String>,
    },
    /// Get time-based recommendations
    Recommend,
}

pub fn run(action: EnergyAction) -> Result<(), Box<dyn std::error::Error>> {
    match action {
        EnergyAction::Show { day } => show_energy_curve(day),
        EnergyAction::Update { start, end } => update_energy_curve(start, end),
        EnergyAction::Recommend => show_recommendations(),
    }
}

fn parse_day(day_str: &str) -> Option<u8> {
    let lower = day_str.to_lowercase();
    match lower.as_str() {
        "0" | "sun" | "sunday" => Some(0),
        "1" | "mon" | "monday" => Some(1),
        "2" | "tue" | "tuesday" => Some(2),
        "3" | "wed" | "wednesday" => Some(3),
        "4" | "thu" | "thursday" => Some(4),
        "5" | "fri" | "friday" => Some(5),
        "6" | "sat" | "saturday" => Some(6),
        _ => None,
    }
}

fn show_energy_curve(day: Option<String>) -> Result<(), Box<dyn std::error::Error>> {
    let db = Database::open()?;
    let rows = db.get_energy_curve_data(None, None)?;

    let analyzer = EnergyCurveAnalyzer::new();
    let curve = analyzer.compute_curve_from_aggregates(&rows);

    let day_of_week = if let Some(day_str) = day {
        parse_day(&day_str).ok_or_else(|| {
            format!(
                "Invalid day: '{}'. Use 0-6 or sun/mon/tue/wed/thu/fri/sat",
                day_str
            )
        })?
    } else {
        // Default to today
        Local::now().weekday().num_days_from_sunday() as u8
    };

    println!("{}", curve.render_ascii_chart(day_of_week));

    // Show summary
    let total_samples: u64 = curve.windows.iter().map(|w| w.sample_count).sum();
    let windows_with_data = curve.windows.iter().filter(|w| w.sample_count > 0).count();

    println!("\nSummary:");
    println!("  Total sessions analyzed: {}", total_samples);
    println!("  Hour/day windows with data: {}/168", windows_with_data);
    println!("  Last updated: {}", curve.last_updated.format("%Y-%m-%d %H:%M:%S UTC"));

    if windows_with_data < 10 {
        println!("\n  Tip: Keep using the timer to build your energy profile.");
    }

    Ok(())
}

fn update_energy_curve(
    start: Option<String>,
    end: Option<String>,
) -> Result<(), Box<dyn std::error::Error>> {
    let db = Database::open()?;

    let start_date = start.as_deref();
    let end_date = end.as_deref();

    let rows = db.get_energy_curve_data(start_date, end_date)?;

    let analyzer = EnergyCurveAnalyzer::new();
    let curve = analyzer.compute_curve_from_aggregates(&rows);

    // Save the curve
    let curve_json = serde_json::to_string(&curve)?;
    let curve_path = data_dir()?.join("energy_curve.json");
    std::fs::write(&curve_path, &curve_json)?;

    println!("Energy curve updated!");
    println!("  Sessions analyzed: {}", rows.iter().map(|r| r.session_count).sum::<u64>());
    println!("  Date range: {}",
        if let (Some(s), Some(e)) = (start_date, end_date) {
            format!("{} to {}", s, e)
        } else {
            "all time".to_string()
        }
    );
    println!("  Saved to: {}", curve_path.display());

    Ok(())
}

fn show_recommendations() -> Result<(), Box<dyn std::error::Error>> {
    let db = Database::open()?;
    let rows = db.get_energy_curve_data(None, None)?;

    let analyzer = EnergyCurveAnalyzer::new();
    let curve = analyzer.compute_curve_from_aggregates(&rows);

    let recommendations = analyzer.get_recommendations(&curve);

    println!("\nEnergy-Based Recommendations\n");
    println!("{}", "=".repeat(50));

    for rec in recommendations {
        println!("\n{}", rec);
    }

    println!("\n{}", "=".repeat(50));
    println!("\nCurrent time: {} ({})",
        Local::now().format("%H:%M"),
        Local::now().format("%A")
    );

    // Show current hour's energy
    let now = Local::now();
    let hour = now.hour() as u8;
    let day = now.weekday().num_days_from_sunday() as u8;
    let current_energy = curve.get_energy(hour, day);
    let current_confidence = curve.get_confidence(hour, day);

    println!("Current energy level: {:.0}% (confidence: {:.0}%)",
        current_energy * 100.0,
        current_confidence * 100.0
    );

    Ok(())
}
