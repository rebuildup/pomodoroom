//! Energy curve learning module.
//!
//! This module provides energy curve inference from session history,
//! helping users understand their productivity patterns throughout the day.

mod curve;

pub use curve::{EnergyCurve, EnergyCurveAnalyzer, EnergySessionData, EnergyWindow};
