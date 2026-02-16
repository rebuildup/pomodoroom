//! Statistics module for Pomodoroom
//!
//! This module provides analytics and statistics for Pomodoro sessions,
//! including break adherence tracking and estimate accuracy.

mod break_adherence;
mod estimate_accuracy;

pub use break_adherence::{
    BreakStatus, BreakAdherenceStats, BreakAdherenceReport,
    HourlyAdherence, ProjectAdherence, HighRiskWindow, BreakAdherenceAnalyzer,
};

pub use estimate_accuracy::{
    EstimateAccuracy, AccuracyStats, GroupBy, AccuracySessionData, EstimateAccuracyTracker,
};
