//! CLI E2E test suite - main module declarations.
//! Test-only modules - excluded from release builds

#[cfg(test)]
mod common;

#[cfg(test)]
mod task_lifecycle;

#[cfg(test)]
mod schedule_commands;

#[cfg(test)]
mod config_commands;

#[cfg(test)]
mod timer_commands;

#[cfg(test)]
mod stats_commands;

#[cfg(test)]
mod project_commands;
