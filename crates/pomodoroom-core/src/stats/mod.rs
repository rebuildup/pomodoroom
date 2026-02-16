//! Statistics module for Pomodoroom
//!
//! This module provides analytics and statistics for Pomodoro sessions,
//! including break adherence tracking, estimate accuracy, and interruption heatmap.

mod break_adherence;
mod estimate_accuracy;
mod interruption_heatmap;

pub use break_adherence::{
    BreakStatus, BreakAdherenceStats, BreakAdherenceReport,
    HourlyAdherence, ProjectAdherence, HighRiskWindow, BreakAdherenceAnalyzer,
};

pub use estimate_accuracy::{
    EstimateAccuracy, AccuracyStats, GroupBy, AccuracySessionData, EstimateAccuracyTracker,
};

pub use interruption_heatmap::{
    InterruptionHeatmap, HeatmapCell, InterruptionEvent, InterruptionSource,
    InterruptionSourceType, InterruptionPriority, InterruptionImpact,
    InterruptionHeatmapAnalyzer,
};
