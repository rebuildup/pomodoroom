//! PR-focused mode for GitHub/Linear workflows.
//!
//! This module provides automatic profile switching when working on
//! pull requests or Linear issues. It enables shorter review cycles
//! and links segments to source issue/PR.
//!
//! ## Features
//! - Automatic mode detection from GitHub/Linear item types
//! - Reversible profile switching with backup
//! - Segment linking to source issue/PR
//! - No default behavior regression when integrations disabled

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

/// Source type for PR-focused mode triggers.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SourceType {
    /// GitHub pull request.
    GitHubPr,
    /// GitHub issue (when in review context).
    GitHubIssue,
    /// Linear issue (when in review context).
    LinearIssue,
    /// Manual trigger.
    Manual,
}

/// Linked item reference for tracking source issue/PR.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkedItem {
    /// Source type (GitHub, Linear, etc.).
    pub source: SourceType,
    /// Repository or project identifier (e.g., "owner/repo").
    pub repository: Option<String>,
    /// Item number (PR # or issue #).
    pub number: Option<i64>,
    /// Item title.
    pub title: Option<String>,
    /// Item URL.
    pub url: Option<String>,
    /// When this item was linked.
    pub linked_at: DateTime<Utc>,
}

/// PR-focused mode state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrFocusedState {
    /// Whether PR-focused mode is active.
    pub active: bool,
    /// Previous profile pack ID before switching.
    pub previous_profile: Option<String>,
    /// When the mode was activated.
    pub activated_at: Option<DateTime<Utc>>,
    /// Linked item for this session.
    pub linked_item: Option<LinkedItem>,
    /// Reason for activation.
    pub reason: String,
}

impl Default for PrFocusedState {
    fn default() -> Self {
        Self {
            active: false,
            previous_profile: None,
            activated_at: None,
            linked_item: None,
            reason: String::new(),
        }
    }
}

/// Result of a mode switch operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModeSwitchResult {
    /// Whether the switch was successful.
    pub success: bool,
    /// Current state after the switch.
    pub state: PrFocusedState,
    /// Message describing what happened.
    pub message: String,
}

/// Statistics for PR-focused mode usage.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PrFocusedStats {
    /// Total times mode was activated.
    pub total_activations: u64,
    /// Total time spent in PR-focused mode (minutes).
    pub total_minutes: u64,
    /// Activations by source type.
    pub by_source: HashMap<String, u64>,
    /// Most recent activation.
    pub last_activation: Option<DateTime<Utc>>,
}

/// Manager for PR-focused mode state.
pub struct PrFocusedManager {
    /// Current state.
    state: Mutex<PrFocusedState>,
    /// Usage statistics.
    stats: Mutex<PrFocusedStats>,
}

impl PrFocusedManager {
    /// Create a new PR-focused mode manager.
    pub fn new() -> Self {
        Self {
            state: Mutex::new(PrFocusedState::default()),
            stats: Mutex::new(PrFocusedStats::default()),
        }
    }

    /// Get the current state.
    pub fn get_state(&self) -> Result<PrFocusedState, String> {
        let state = self.state.lock().map_err(|e| format!("Lock failed: {e}"))?;
        Ok(state.clone())
    }

    /// Check if PR-focused mode is active.
    pub fn is_active(&self) -> Result<bool, String> {
        let state = self.state.lock().map_err(|e| format!("Lock failed: {e}"))?;
        Ok(state.active)
    }

    /// Activate PR-focused mode.
    pub fn activate(
        &self,
        previous_profile: Option<String>,
        linked_item: Option<LinkedItem>,
        reason: String,
    ) -> Result<ModeSwitchResult, String> {
        let mut state = self.state.lock().map_err(|e| format!("Lock failed: {e}"))?;

        if state.active {
            return Ok(ModeSwitchResult {
                success: false,
                state: state.clone(),
                message: "PR-focused mode is already active".to_string(),
            });
        }

        state.active = true;
        state.previous_profile = previous_profile;
        state.activated_at = Some(Utc::now());
        state.linked_item = linked_item.clone();
        state.reason = reason.clone();

        // Update stats
        let mut stats = self.stats.lock().map_err(|e| format!("Lock failed: {e}"))?;
        stats.total_activations += 1;
        stats.last_activation = Some(Utc::now());

        if let Some(ref item) = linked_item {
            let source_key = format!("{:?}", item.source);
            *stats.by_source.entry(source_key).or_insert(0) += 1;
        }

        Ok(ModeSwitchResult {
            success: true,
            state: state.clone(),
            message: format!("Activated PR-focused mode: {}", reason),
        })
    }

    /// Deactivate PR-focused mode.
    pub fn deactivate(&self, duration_minutes: Option<u64>) -> Result<ModeSwitchResult, String> {
        let mut state = self.state.lock().map_err(|e| format!("Lock failed: {e}"))?;

        if !state.active {
            return Ok(ModeSwitchResult {
                success: false,
                state: state.clone(),
                message: "PR-focused mode is not active".to_string(),
            });
        }

        let previous_profile = state.previous_profile.clone();

        // Update stats with duration
        if let Some(minutes) = duration_minutes {
            let mut stats = self.stats.lock().map_err(|e| format!("Lock failed: {e}"))?;
            stats.total_minutes += minutes;
        }

        // Reset state
        *state = PrFocusedState::default();

        let message = match previous_profile {
            Some(ref profile) => format!("Deactivated PR-focused mode. Restore profile: {}", profile),
            None => "Deactivated PR-focused mode".to_string(),
        };

        Ok(ModeSwitchResult {
            success: true,
            state: state.clone(),
            message,
        })
    }

    /// Link an item to the current session.
    pub fn link_item(&self, item: LinkedItem) -> Result<(), String> {
        let mut state = self.state.lock().map_err(|e| format!("Lock failed: {e}"))?;
        state.linked_item = Some(item);
        Ok(())
    }

    /// Get the currently linked item.
    pub fn get_linked_item(&self) -> Result<Option<LinkedItem>, String> {
        let state = self.state.lock().map_err(|e| format!("Lock failed: {e}"))?;
        Ok(state.linked_item.clone())
    }

    /// Get usage statistics.
    pub fn get_stats(&self) -> Result<PrFocusedStats, String> {
        let stats = self.stats.lock().map_err(|e| format!("Lock failed: {e}"))?;
        Ok(stats.clone())
    }

    /// Clear statistics.
    pub fn clear_stats(&self) -> Result<(), String> {
        let mut stats = self.stats.lock().map_err(|e| format!("Lock failed: {e}"))?;
        *stats = PrFocusedStats::default();
        Ok(())
    }
}

impl Default for PrFocusedManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Detect if a task title suggests PR-focused work.
pub fn detect_pr_focused_context(title: &str) -> Option<(SourceType, String)> {
    let lower = title.to_lowercase();

    // Check for PR-related keywords
    if lower.contains("pr:") || lower.contains("pull request") || lower.contains("review pr") {
        return Some((SourceType::GitHubPr, "PR review detected".to_string()));
    }

    if lower.contains("review #") || lower.contains("code review") {
        return Some((SourceType::GitHubPr, "Code review detected".to_string()));
    }

    if lower.contains("linear:") || lower.contains("[lin-") || lower.contains("[eng-") {
        return Some((SourceType::LinearIssue, "Linear issue detected".to_string()));
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_manager() -> PrFocusedManager {
        PrFocusedManager::new()
    }

    #[test]
    fn manager_starts_inactive() {
        let manager = create_manager();
        assert!(!manager.is_active().unwrap());
    }

    #[test]
    fn activate_sets_state() {
        let manager = create_manager();
        let result = manager.activate(
            Some("deep-work".to_string()),
            None,
            "Manual activation".to_string(),
        ).unwrap();

        assert!(result.success);
        assert!(manager.is_active().unwrap());
        assert_eq!(result.state.previous_profile, Some("deep-work".to_string()));
    }

    #[test]
    fn activate_when_already_active_fails() {
        let manager = create_manager();
        manager.activate(None, None, "First".to_string()).unwrap();

        let result = manager.activate(None, None, "Second".to_string()).unwrap();
        assert!(!result.success);
        assert!(result.message.contains("already active"));
    }

    #[test]
    fn deactivate_resets_state() {
        let manager = create_manager();
        manager.activate(Some("balanced".to_string()), None, "Test".to_string()).unwrap();

        let result = manager.deactivate(Some(30)).unwrap();
        assert!(result.success);
        assert!(!manager.is_active().unwrap());
        assert!(result.message.contains("balanced"));
    }

    #[test]
    fn deactivate_when_not_active_fails() {
        let manager = create_manager();
        let result = manager.deactivate(None).unwrap();
        assert!(!result.success);
        assert!(result.message.contains("not active"));
    }

    #[test]
    fn link_item_works() {
        let manager = create_manager();
        manager.activate(None, None, "Test".to_string()).unwrap();

        let item = LinkedItem {
            source: SourceType::GitHubPr,
            repository: Some("owner/repo".to_string()),
            number: Some(123),
            title: Some("Fix bug".to_string()),
            url: Some("https://github.com/owner/repo/pull/123".to_string()),
            linked_at: Utc::now(),
        };

        manager.link_item(item.clone()).unwrap();
        let linked = manager.get_linked_item().unwrap();
        assert!(linked.is_some());
        assert_eq!(linked.unwrap().number, Some(123));
    }

    #[test]
    fn stats_track_activations() {
        let manager = create_manager();

        manager.activate(None, None, "Test 1".to_string()).unwrap();
        manager.deactivate(Some(25)).unwrap();

        let stats = manager.get_stats().unwrap();
        assert_eq!(stats.total_activations, 1);
        assert_eq!(stats.total_minutes, 25);
    }

    #[test]
    fn stats_by_source() {
        let manager = create_manager();

        let item = LinkedItem {
            source: SourceType::GitHubPr,
            repository: None,
            number: None,
            title: None,
            url: None,
            linked_at: Utc::now(),
        };

        manager.activate(None, Some(item), "Test".to_string()).unwrap();
        manager.deactivate(None).unwrap();

        let stats = manager.get_stats().unwrap();
        assert!(stats.by_source.contains_key("GitHubPr"));
    }

    #[test]
    fn detect_pr_context_pr_title() {
        let result = detect_pr_focused_context("Review PR #123");
        assert!(result.is_some());
        let (source, _) = result.unwrap();
        assert_eq!(source, SourceType::GitHubPr);
    }

    #[test]
    fn detect_pr_context_code_review() {
        let result = detect_pr_focused_context("Code review for feature X");
        assert!(result.is_some());
        let (source, _) = result.unwrap();
        assert_eq!(source, SourceType::GitHubPr);
    }

    #[test]
    fn detect_pr_context_linear() {
        let result = detect_pr_focused_context("[LIN-456] Fix bug");
        assert!(result.is_some());
        let (source, _) = result.unwrap();
        assert_eq!(source, SourceType::LinearIssue);
    }

    #[test]
    fn detect_pr_context_no_match() {
        let result = detect_pr_focused_context("Write documentation");
        assert!(result.is_none());
    }

    #[test]
    fn state_default() {
        let state = PrFocusedState::default();
        assert!(!state.active);
        assert!(state.previous_profile.is_none());
        assert!(state.activated_at.is_none());
        assert!(state.linked_item.is_none());
        assert!(state.reason.is_empty());
    }

    #[test]
    fn clear_stats() {
        let manager = create_manager();
        manager.activate(None, None, "Test".to_string()).unwrap();
        manager.deactivate(Some(10)).unwrap();

        manager.clear_stats().unwrap();
        let stats = manager.get_stats().unwrap();
        assert_eq!(stats.total_activations, 0);
        assert_eq!(stats.total_minutes, 0);
    }
}
