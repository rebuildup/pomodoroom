//! Statistics module for Pomodoroom
//!
//! This module provides analytics and statistics for Pomodoro sessions,
//! including break adherence tracking.

mod break_adherence;

pub use break_adherence::{
    BreakStatus, BreakAdherenceStats, BreakAdherenceReport,
    HourlyAdherence, ProjectAdherence, HighRiskWindow, BreakAdherenceAnalyzer,
};
