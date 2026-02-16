//! Shared focus windows and DND sync for team coordination.
//!
//! This module provides:
//! - Focus window publishing to shared calendar/feed
//! - DND status sync to Slack/Discord
//! - Overlap conflict detection and alternative suggestions

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Unique identifier for a focus window.
pub type WindowId = String;

/// Unique identifier for a workspace.
pub type WorkspaceId = String;

/// Unique identifier for a user.
pub type UserId = String;

/// A focus window representing a user's focus session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FocusWindow {
    /// Unique identifier for this window.
    pub id: WindowId,
    /// User who owns this focus window.
    pub user_id: UserId,
    /// User display name.
    pub user_name: String,
    /// Workspace this window belongs to (if any).
    pub workspace_id: Option<WorkspaceId>,
    /// Start time of the focus window.
    pub start_time: DateTime<Utc>,
    /// End time of the focus window.
    pub end_time: DateTime<Utc>,
    /// Task or activity being focused on (optional, for privacy).
    pub activity: Option<String>,
    /// Whether this window is visible to team members.
    pub is_shared: bool,
    /// Privacy level for shared windows.
    pub privacy_level: PrivacyLevel,
    /// DND sync status for each platform.
    pub dnd_status: HashMap<DndPlatform, DndSyncStatus>,
    /// Timestamp when the window was created.
    pub created_at: DateTime<Utc>,
}

impl FocusWindow {
    /// Create a new focus window.
    pub fn new(
        user_id: UserId,
        user_name: String,
        start_time: DateTime<Utc>,
        duration_minutes: u32,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            user_id,
            user_name,
            workspace_id: None,
            start_time,
            end_time: start_time + Duration::minutes(duration_minutes as i64),
            activity: None,
            is_shared: false,
            privacy_level: PrivacyLevel::default(),
            dnd_status: HashMap::new(),
            created_at: now,
        }
    }

    /// Get the duration of this focus window in minutes.
    pub fn duration_minutes(&self) -> i64 {
        (self.end_time - self.start_time).num_minutes()
    }

    /// Check if this window overlaps with another.
    pub fn overlaps_with(&self, other: &FocusWindow) -> bool {
        self.start_time < other.end_time && self.end_time > other.start_time
    }

    /// Check if this window is currently active.
    pub fn is_active(&self) -> bool {
        let now = Utc::now();
        now >= self.start_time && now <= self.end_time
    }
}

/// Privacy level for shared focus windows.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum PrivacyLevel {
    /// Only show that user is focusing, no details.
    #[default]
    Minimal,
    /// Show activity category (e.g., "coding", "writing").
    Category,
    /// Show full activity description.
    Full,
}

/// Platforms that support DND sync.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum DndPlatform {
    Slack,
    Discord,
    MicrosoftTeams,
    GoogleChat,
}

impl std::fmt::Display for DndPlatform {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DndPlatform::Slack => write!(f, "Slack"),
            DndPlatform::Discord => write!(f, "Discord"),
            DndPlatform::MicrosoftTeams => write!(f, "Microsoft Teams"),
            DndPlatform::GoogleChat => write!(f, "Google Chat"),
        }
    }
}

/// Status of DND sync for a platform.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DndSyncStatus {
    /// DND is successfully enabled.
    Enabled,
    /// DND sync failed.
    Failed(DndSyncError),
    /// Not configured for this platform.
    NotConfigured,
    /// Pending sync.
    Pending,
}

/// DND sync error types.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DndSyncError {
    /// Authentication failed.
    AuthFailed,
    /// Network error.
    NetworkError,
    /// Rate limited.
    RateLimited,
    /// API error.
    ApiError,
    /// Permission denied.
    PermissionDenied,
}

/// Workspace settings for focus window sharing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceSharingSettings {
    /// Workspace ID.
    pub workspace_id: WorkspaceId,
    /// Whether focus window sharing is enabled.
    pub sharing_enabled: bool,
    /// Default privacy level for shared windows.
    pub default_privacy: PrivacyLevel,
    /// Platforms to sync DND status.
    pub dnd_platforms: Vec<DndPlatform>,
    /// Whether to auto-share focus windows.
    pub auto_share: bool,
    /// Minimum focus duration (in minutes) to trigger sharing.
    pub min_share_duration: u32,
}

impl Default for WorkspaceSharingSettings {
    fn default() -> Self {
        Self {
            workspace_id: String::new(),
            sharing_enabled: false,
            default_privacy: PrivacyLevel::Minimal,
            dnd_platforms: vec![DndPlatform::Slack],
            auto_share: false,
            min_share_duration: 15,
        }
    }
}

/// An overlap conflict between focus windows.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlapConflict {
    /// The user's focus window.
    pub my_window: FocusWindow,
    /// Conflicting focus window from another user.
    pub other_window: FocusWindow,
    /// Overlap duration in minutes.
    pub overlap_minutes: i64,
    /// Severity of the conflict.
    pub severity: ConflictSeverity,
    /// Suggested alternatives.
    pub alternatives: Vec<AlternativeSlot>,
}

/// Severity of an overlap conflict.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ConflictSeverity {
    /// Minor overlap (< 15 minutes).
    Minor,
    /// Moderate overlap (15-30 minutes).
    Moderate,
    /// Major overlap (> 30 minutes).
    Major,
}

/// An alternative time slot suggestion.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlternativeSlot {
    /// Suggested start time.
    pub start_time: DateTime<Utc>,
    /// Suggested end time.
    pub end_time: DateTime<Utc>,
    /// Why this slot is better.
    pub reason: String,
    /// Confidence score (0.0 - 1.0).
    pub confidence: f32,
}

/// Manager for focus window sharing and DND sync.
#[derive(Debug, Clone)]
pub struct FocusWindowManager {
    /// Active focus windows by user.
    windows: HashMap<UserId, Vec<FocusWindow>>,
    /// Workspace sharing settings.
    workspace_settings: HashMap<WorkspaceId, WorkspaceSharingSettings>,
    /// User workspace memberships.
    user_workspaces: HashMap<UserId, Vec<WorkspaceId>>,
    /// DND sync retry queue.
    dnd_retry_queue: Vec<DndRetryEntry>,
    /// Configuration.
    config: FocusWindowConfig,
}

/// Configuration for focus window manager.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FocusWindowConfig {
    /// Maximum retries for DND sync.
    pub max_dnd_retries: u32,
    /// Delay between retries in seconds.
    pub retry_delay_seconds: u32,
    /// Enable conflict detection.
    pub enable_conflict_detection: bool,
    /// Minimum overlap duration (minutes) to report.
    pub min_overlap_minutes: i64,
}

impl Default for FocusWindowConfig {
    fn default() -> Self {
        Self {
            max_dnd_retries: 3,
            retry_delay_seconds: 60,
            enable_conflict_detection: true,
            min_overlap_minutes: 5,
        }
    }
}

/// Entry in the DND retry queue.
#[derive(Debug, Clone)]
struct DndRetryEntry {
    window_id: WindowId,
    platform: DndPlatform,
    retry_count: u32,
    next_retry: DateTime<Utc>,
    error: DndSyncError,
}

/// Error type for focus window operations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FocusWindowError {
    /// User not found.
    UserNotFound(UserId),
    /// Workspace not found.
    WorkspaceNotFound(WorkspaceId),
    /// Window not found.
    WindowNotFound(WindowId),
    /// Not authorized to share.
    NotAuthorized,
    /// Invalid time range.
    InvalidTimeRange,
    /// DND sync failed.
    DndSyncFailed(DndPlatform, DndSyncError),
    /// Sharing disabled for workspace.
    SharingDisabled(WorkspaceId),
}

impl std::fmt::Display for FocusWindowError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FocusWindowError::UserNotFound(id) => write!(f, "User not found: {}", id),
            FocusWindowError::WorkspaceNotFound(id) => write!(f, "Workspace not found: {}", id),
            FocusWindowError::WindowNotFound(id) => write!(f, "Window not found: {}", id),
            FocusWindowError::NotAuthorized => write!(f, "Not authorized"),
            FocusWindowError::InvalidTimeRange => write!(f, "Invalid time range"),
            FocusWindowError::DndSyncFailed(platform, error) => {
                write!(f, "DND sync failed for {:?}: {:?}", platform, error)
            }
            FocusWindowError::SharingDisabled(id) => {
                write!(f, "Sharing disabled for workspace: {}", id)
            }
        }
    }
}

impl std::error::Error for FocusWindowError {}

impl FocusWindowManager {
    /// Create a new focus window manager.
    pub fn new() -> Self {
        Self {
            windows: HashMap::new(),
            workspace_settings: HashMap::new(),
            user_workspaces: HashMap::new(),
            dnd_retry_queue: Vec::new(),
            config: FocusWindowConfig::default(),
        }
    }

    /// Create a new focus window manager with custom config.
    pub fn with_config(config: FocusWindowConfig) -> Self {
        Self {
            windows: HashMap::new(),
            workspace_settings: HashMap::new(),
            user_workspaces: HashMap::new(),
            dnd_retry_queue: Vec::new(),
            config,
        }
    }

    /// Register a user to a workspace.
    pub fn register_user_to_workspace(
        &mut self,
        user_id: UserId,
        workspace_id: WorkspaceId,
    ) {
        self.user_workspaces
            .entry(user_id)
            .or_default()
            .push(workspace_id);
    }

    /// Configure workspace sharing settings.
    pub fn configure_workspace(
        &mut self,
        settings: WorkspaceSharingSettings,
    ) {
        self.workspace_settings.insert(settings.workspace_id.clone(), settings);
    }

    /// Start a new focus window.
    pub fn start_focus_window(
        &mut self,
        user_id: UserId,
        user_name: String,
        start_time: DateTime<Utc>,
        duration_minutes: u32,
        activity: Option<String>,
        workspace_id: Option<WorkspaceId>,
    ) -> Result<FocusWindow, FocusWindowError> {
        if duration_minutes == 0 {
            return Err(FocusWindowError::InvalidTimeRange);
        }

        let mut window = FocusWindow::new(user_id.clone(), user_name, start_time, duration_minutes);
        window.activity = activity;
        window.workspace_id = workspace_id.clone();

        // Check if auto-sharing is enabled for the workspace
        if let Some(ws_id) = &workspace_id {
            if let Some(settings) = self.workspace_settings.get(ws_id) {
                if settings.auto_share && duration_minutes >= settings.min_share_duration {
                    window.is_shared = true;
                    window.privacy_level = settings.default_privacy;
                }
            }
        }

        self.windows
            .entry(user_id.clone())
            .or_default()
            .push(window.clone());

        Ok(window)
    }

    /// End a focus window.
    pub fn end_focus_window(
        &mut self,
        window_id: &WindowId,
    ) -> Result<FocusWindow, FocusWindowError> {
        for windows in self.windows.values_mut() {
            if let Some(idx) = windows.iter().position(|w| w.id == *window_id) {
                return Ok(windows.remove(idx));
            }
        }
        Err(FocusWindowError::WindowNotFound(window_id.clone()))
    }

    /// Toggle sharing for a focus window.
    pub fn toggle_sharing(
        &mut self,
        window_id: &WindowId,
        is_shared: bool,
        privacy_level: Option<PrivacyLevel>,
    ) -> Result<FocusWindow, FocusWindowError> {
        for windows in self.windows.values_mut() {
            if let Some(window) = windows.iter_mut().find(|w| w.id == *window_id) {
                // Check workspace settings
                if is_shared {
                    if let Some(ws_id) = &window.workspace_id {
                        let settings = self.workspace_settings.get(ws_id);
                        if settings.map_or(true, |s| !s.sharing_enabled) {
                            return Err(FocusWindowError::SharingDisabled(ws_id.clone()));
                        }
                    }
                }

                window.is_shared = is_shared;
                if let Some(level) = privacy_level {
                    window.privacy_level = level;
                }
                return Ok(window.clone());
            }
        }
        Err(FocusWindowError::WindowNotFound(window_id.clone()))
    }

    /// Sync DND status for a focus window.
    pub fn sync_dnd(
        &mut self,
        window_id: &WindowId,
        platform: DndPlatform,
    ) -> Result<DndSyncStatus, FocusWindowError> {
        let window = self.find_window(window_id)?;

        // Check if platform is configured for the workspace
        let is_configured = window.workspace_id.as_ref().map_or(false, |ws_id| {
            self.workspace_settings
                .get(ws_id)
                .map_or(false, |s| s.dnd_platforms.contains(&platform))
        });

        if !is_configured {
            // Allow sync even if not in workspace settings (user may want to enable manually)
        }

        // In a real implementation, this would call the actual Slack/Discord APIs
        // For now, simulate a successful sync
        let status = DndSyncStatus::Enabled;

        // Update the window's DND status
        for windows in self.windows.values_mut() {
            if let Some(w) = windows.iter_mut().find(|w| w.id == *window_id) {
                w.dnd_status.insert(platform, status);
            }
        }

        Ok(status)
    }

    /// Record a DND sync failure for retry.
    pub fn record_dnd_failure(
        &mut self,
        window_id: WindowId,
        platform: DndPlatform,
        error: DndSyncError,
    ) {
        self.dnd_retry_queue.push(DndRetryEntry {
            window_id,
            platform,
            retry_count: 0,
            next_retry: Utc::now() + Duration::seconds(self.config.retry_delay_seconds as i64),
            error,
        });
    }

    /// Process pending DND retries.
    pub fn process_dnd_retries(&mut self) -> Vec<Result<(WindowId, DndPlatform), (WindowId, DndPlatform, DndSyncError)>> {
        let now = Utc::now();
        let mut results = Vec::new();

        // Take ownership of the retry queue to avoid double borrow
        let retry_queue = std::mem::take(&mut self.dnd_retry_queue);

        let mut remaining = Vec::new();

        for mut entry in retry_queue {
            if entry.next_retry <= now && entry.retry_count < self.config.max_dnd_retries {
                // Attempt retry
                match self.sync_dnd(&entry.window_id, entry.platform) {
                    Ok(DndSyncStatus::Enabled) => {
                        results.push(Ok((entry.window_id, entry.platform)));
                    }
                    _ => {
                        entry.retry_count += 1;
                        if entry.retry_count < self.config.max_dnd_retries {
                            entry.next_retry = now + Duration::seconds(self.config.retry_delay_seconds as i64);
                            remaining.push(entry);
                        } else {
                            results.push(Err((entry.window_id, entry.platform, entry.error)));
                        }
                    }
                }
            } else if entry.retry_count < self.config.max_dnd_retries {
                remaining.push(entry);
            }
        }

        self.dnd_retry_queue = remaining;
        results
    }

    /// Get pending DND failures for display.
    pub fn get_dnd_failures(&self) -> Vec<(WindowId, DndPlatform, DndSyncError)> {
        self.dnd_retry_queue
            .iter()
            .map(|e| (e.window_id.clone(), e.platform, e.error))
            .collect()
    }

    /// Detect overlap conflicts for a user's focus windows.
    pub fn detect_conflicts(
        &self,
        user_id: &UserId,
    ) -> Vec<OverlapConflict> {
        if !self.config.enable_conflict_detection {
            return Vec::new();
        }

        let my_windows = self.windows.get(user_id);
        let my_workspaces = self.user_workspaces.get(user_id);

        let mut conflicts = Vec::new();

        if let (Some(windows), Some(workspaces)) = (my_windows, my_workspaces) {
            for my_window in windows {
                if !my_window.is_shared {
                    continue;
                }

                // Check for conflicts with other users in the same workspaces
                for ws_id in workspaces {
                    for (other_user_id, other_windows) in &self.windows {
                        if other_user_id == user_id {
                            continue;
                        }

                        for other_window in other_windows {
                            if !other_window.is_shared {
                                continue;
                            }

                            if other_window.workspace_id.as_ref() != Some(ws_id) {
                                continue;
                            }

                            if my_window.overlaps_with(other_window) {
                                let overlap = std::cmp::min(
                                    my_window.end_time, other_window.end_time
                                ) - std::cmp::max(my_window.start_time, other_window.start_time);

                                if overlap.num_minutes() >= self.config.min_overlap_minutes {
                                    let severity = if overlap.num_minutes() < 15 {
                                        ConflictSeverity::Minor
                                    } else if overlap.num_minutes() < 30 {
                                        ConflictSeverity::Moderate
                                    } else {
                                        ConflictSeverity::Major
                                    };

                                    // Generate alternatives
                                    let alternatives = self.generate_alternatives(
                                        my_window,
                                        overlap.num_minutes(),
                                    );

                                    conflicts.push(OverlapConflict {
                                        my_window: my_window.clone(),
                                        other_window: other_window.clone(),
                                        overlap_minutes: overlap.num_minutes(),
                                        severity,
                                        alternatives,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        conflicts
    }

    /// Generate alternative time slots.
    fn generate_alternatives(
        &self,
        window: &FocusWindow,
        _overlap_minutes: i64,
    ) -> Vec<AlternativeSlot> {
        let mut alternatives = Vec::new();

        // Suggest starting earlier
        let earlier_start = window.start_time - Duration::minutes(window.duration_minutes());
        alternatives.push(AlternativeSlot {
            start_time: earlier_start,
            end_time: window.start_time,
            reason: "Start earlier to avoid overlap".to_string(),
            confidence: 0.7,
        });

        // Suggest starting later
        let later_start = window.end_time;
        alternatives.push(AlternativeSlot {
            start_time: later_start,
            end_time: later_start + Duration::minutes(window.duration_minutes()),
            reason: "Start after the conflicting session".to_string(),
            confidence: 0.8,
        });

        alternatives
    }

    /// Get all shared focus windows for a workspace.
    pub fn get_workspace_windows(
        &self,
        workspace_id: &WorkspaceId,
    ) -> Vec<&FocusWindow> {
        self.windows
            .values()
            .flat_map(|windows| windows.iter())
            .filter(|w| w.is_shared && w.workspace_id.as_ref() == Some(workspace_id))
            .collect()
    }

    /// Get active focus windows for a user.
    pub fn get_user_active_windows(
        &self,
        user_id: &UserId,
    ) -> Vec<&FocusWindow> {
        self.windows
            .get(user_id)
            .map(|windows| windows.iter().filter(|w| w.is_active()).collect())
            .unwrap_or_default()
    }

    /// Find a window by ID.
    fn find_window(&self, window_id: &WindowId) -> Result<FocusWindow, FocusWindowError> {
        for windows in self.windows.values() {
            if let Some(window) = windows.iter().find(|w| w.id == *window_id) {
                return Ok(window.clone());
            }
        }
        Err(FocusWindowError::WindowNotFound(window_id.clone()))
    }
}

impl Default for FocusWindowManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Result of a DND sync operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DndSyncResult {
    /// Platform that was synced.
    pub platform: DndPlatform,
    /// Whether the sync was successful.
    pub success: bool,
    /// Error message if failed.
    pub error: Option<String>,
    /// Timestamp of the sync.
    pub synced_at: DateTime<Utc>,
}

/// Exported focus window data for calendar/feed publishing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublishedFocusWindow {
    /// User display name.
    pub user_name: String,
    /// Start time.
    pub start_time: DateTime<Utc>,
    /// End time.
    pub end_time: DateTime<Utc>,
    /// Activity (privacy-filtered).
    pub activity: Option<String>,
    /// Privacy level used.
    pub privacy_level: PrivacyLevel,
}

impl From<&FocusWindow> for PublishedFocusWindow {
    fn from(window: &FocusWindow) -> Self {
        let activity = match window.privacy_level {
            PrivacyLevel::Minimal => None,
            PrivacyLevel::Category => window.activity.as_ref().map(|_| "Focus session".to_string()),
            PrivacyLevel::Full => window.activity.clone(),
        };

        Self {
            user_name: window.user_name.clone(),
            start_time: window.start_time,
            end_time: window.end_time,
            activity,
            privacy_level: window.privacy_level,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_manager() -> FocusWindowManager {
        let mut manager = FocusWindowManager::new();

        // Configure a workspace
        let settings = WorkspaceSharingSettings {
            workspace_id: "ws-1".to_string(),
            sharing_enabled: true,
            default_privacy: PrivacyLevel::Minimal,
            dnd_platforms: vec![DndPlatform::Slack, DndPlatform::Discord],
            auto_share: true,
            min_share_duration: 15,
        };
        manager.configure_workspace(settings);

        // Register users
        manager.register_user_to_workspace("user-1".to_string(), "ws-1".to_string());
        manager.register_user_to_workspace("user-2".to_string(), "ws-1".to_string());

        manager
    }

    #[test]
    fn test_start_focus_window() {
        let mut manager = setup_manager();
        let start = Utc::now();

        let window = manager.start_focus_window(
            "user-1".to_string(),
            "Alice".to_string(),
            start,
            25,
            Some("Coding".to_string()),
            Some("ws-1".to_string()),
        ).unwrap();

        assert_eq!(window.user_id, "user-1");
        assert_eq!(window.duration_minutes(), 25);
        assert!(window.is_shared); // auto_share is enabled
        assert_eq!(window.privacy_level, PrivacyLevel::Minimal);
    }

    #[test]
    fn test_short_window_not_auto_shared() {
        let mut manager = setup_manager();
        let start = Utc::now();

        let window = manager.start_focus_window(
            "user-1".to_string(),
            "Alice".to_string(),
            start,
            10, // Less than min_share_duration (15)
            Some("Quick task".to_string()),
            Some("ws-1".to_string()),
        ).unwrap();

        assert!(!window.is_shared);
    }

    #[test]
    fn test_toggle_sharing() {
        let mut manager = setup_manager();
        let start = Utc::now();

        let window = manager.start_focus_window(
            "user-1".to_string(),
            "Alice".to_string(),
            start,
            25,
            None,
            Some("ws-1".to_string()),
        ).unwrap();

        // Disable sharing
        let updated = manager.toggle_sharing(&window.id, false, None).unwrap();
        assert!(!updated.is_shared);

        // Re-enable with higher privacy
        let updated = manager.toggle_sharing(
            &window.id,
            true,
            Some(PrivacyLevel::Full),
        ).unwrap();
        assert!(updated.is_shared);
        assert_eq!(updated.privacy_level, PrivacyLevel::Full);
    }

    #[test]
    fn test_sharing_disabled_for_workspace() {
        let mut manager = FocusWindowManager::new();

        // Configure workspace with sharing disabled
        let settings = WorkspaceSharingSettings {
            workspace_id: "ws-1".to_string(),
            sharing_enabled: false,
            ..Default::default()
        };
        manager.configure_workspace(settings);

        let start = Utc::now();
        let window = manager.start_focus_window(
            "user-1".to_string(),
            "Alice".to_string(),
            start,
            25,
            None,
            Some("ws-1".to_string()),
        ).unwrap();

        // Try to enable sharing
        let result = manager.toggle_sharing(&window.id, true, None);
        assert!(matches!(result, Err(FocusWindowError::SharingDisabled(_))));
    }

    #[test]
    fn test_dnd_sync() {
        let mut manager = setup_manager();
        let start = Utc::now();

        let window = manager.start_focus_window(
            "user-1".to_string(),
            "Alice".to_string(),
            start,
            25,
            None,
            Some("ws-1".to_string()),
        ).unwrap();

        let status = manager.sync_dnd(&window.id, DndPlatform::Slack).unwrap();
        assert_eq!(status, DndSyncStatus::Enabled);
    }

    #[test]
    fn test_overlap_detection() {
        let mut manager = setup_manager();
        let now = Utc::now();

        // User 1: 10:00 - 10:30
        manager.start_focus_window(
            "user-1".to_string(),
            "Alice".to_string(),
            now,
            30,
            Some("Task A".to_string()),
            Some("ws-1".to_string()),
        ).unwrap();

        // User 2: 10:15 - 10:45 (overlaps by 15 minutes)
        manager.start_focus_window(
            "user-2".to_string(),
            "Bob".to_string(),
            now + Duration::minutes(15),
            30,
            Some("Task B".to_string()),
            Some("ws-1".to_string()),
        ).unwrap();

        let conflicts = manager.detect_conflicts(&"user-1".to_string());
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].overlap_minutes, 15);
        assert_eq!(conflicts[0].severity, ConflictSeverity::Moderate);
    }

    #[test]
    fn test_no_overlap_when_not_shared() {
        let mut manager = setup_manager();
        let now = Utc::now();

        // User 1: shared
        manager.start_focus_window(
            "user-1".to_string(),
            "Alice".to_string(),
            now,
            30,
            None,
            Some("ws-1".to_string()),
        ).unwrap();

        // User 2: not shared (short duration)
        manager.start_focus_window(
            "user-2".to_string(),
            "Bob".to_string(),
            now,
            10, // Will not be auto-shared
            None,
            Some("ws-1".to_string()),
        ).unwrap();

        let conflicts = manager.detect_conflicts(&"user-1".to_string());
        assert!(conflicts.is_empty());
    }

    #[test]
    fn test_alternative_generation() {
        let mut manager = setup_manager();
        let now = Utc::now();

        let window = manager.start_focus_window(
            "user-1".to_string(),
            "Alice".to_string(),
            now,
            30,
            None,
            Some("ws-1".to_string()),
        ).unwrap();

        manager.start_focus_window(
            "user-2".to_string(),
            "Bob".to_string(),
            now + Duration::minutes(15),
            30,
            None,
            Some("ws-1".to_string()),
        ).unwrap();

        let conflicts = manager.detect_conflicts(&"user-1".to_string());
        assert!(!conflicts.is_empty());
        assert!(!conflicts[0].alternatives.is_empty());

        // Should have "start earlier" and "start later" alternatives
        assert!(conflicts[0].alternatives.iter().any(|a| a.reason.contains("earlier")));
        assert!(conflicts[0].alternatives.iter().any(|a| a.reason.contains("after")));
    }

    #[test]
    fn test_dnd_retry_queue() {
        let mut manager = FocusWindowManager::new();
        manager.config.max_dnd_retries = 2;
        manager.config.retry_delay_seconds = 0;

        let window = FocusWindow::new(
            "user-1".to_string(),
            "Alice".to_string(),
            Utc::now(),
            25,
        );
        let window_id = window.id.clone();
        manager.windows.insert("user-1".to_string(), vec![window]);

        manager.record_dnd_failure(
            window_id.clone(),
            DndPlatform::Slack,
            DndSyncError::NetworkError,
        );

        let failures = manager.get_dnd_failures();
        assert_eq!(failures.len(), 1);
        assert_eq!(failures[0].1, DndPlatform::Slack);
    }

    #[test]
    fn test_published_window_privacy() {
        let minimal_window = FocusWindow {
            id: "1".to_string(),
            user_id: "u1".to_string(),
            user_name: "Alice".to_string(),
            workspace_id: None,
            start_time: Utc::now(),
            end_time: Utc::now() + Duration::minutes(25),
            activity: Some("Deep work on API".to_string()),
            is_shared: true,
            privacy_level: PrivacyLevel::Minimal,
            dnd_status: HashMap::new(),
            created_at: Utc::now(),
        };

        let published = PublishedFocusWindow::from(&minimal_window);
        assert!(published.activity.is_none());

        let full_window = FocusWindow {
            privacy_level: PrivacyLevel::Full,
            ..minimal_window.clone()
        };

        let published = PublishedFocusWindow::from(&full_window);
        assert_eq!(published.activity, Some("Deep work on API".to_string()));
    }

    #[test]
    fn test_window_overlaps() {
        let now = Utc::now();

        let window1 = FocusWindow::new(
            "u1".to_string(),
            "Alice".to_string(),
            now,
            30,
        );

        // Overlapping window
        let window2 = FocusWindow::new(
            "u2".to_string(),
            "Bob".to_string(),
            now + Duration::minutes(15),
            30,
        );
        assert!(window1.overlaps_with(&window2));

        // Non-overlapping window
        let window3 = FocusWindow::new(
            "u3".to_string(),
            "Charlie".to_string(),
            now + Duration::minutes(30),
            30,
        );
        assert!(!window1.overlaps_with(&window3));
    }

    #[test]
    fn test_window_is_active() {
        let now = Utc::now();

        let active_window = FocusWindow::new(
            "u1".to_string(),
            "Alice".to_string(),
            now - Duration::minutes(10),
            30,
        );
        assert!(active_window.is_active());

        let past_window = FocusWindow::new(
            "u2".to_string(),
            "Bob".to_string(),
            now - Duration::hours(2),
            30,
        );
        assert!(!past_window.is_active());

        let future_window = FocusWindow::new(
            "u3".to_string(),
            "Charlie".to_string(),
            now + Duration::hours(1),
            30,
        );
        assert!(!future_window.is_active());
    }

    #[test]
    fn test_get_workspace_windows() {
        let mut manager = setup_manager();
        let now = Utc::now();

        manager.start_focus_window(
            "user-1".to_string(),
            "Alice".to_string(),
            now,
            25,
            None,
            Some("ws-1".to_string()),
        ).unwrap();

        manager.start_focus_window(
            "user-2".to_string(),
            "Bob".to_string(),
            now,
            25,
            None,
            Some("ws-1".to_string()),
        ).unwrap();

        let ws_windows = manager.get_workspace_windows(&"ws-1".to_string());
        assert_eq!(ws_windows.len(), 2);
    }

    #[test]
    fn test_end_focus_window() {
        let mut manager = setup_manager();
        let now = Utc::now();

        let window = manager.start_focus_window(
            "user-1".to_string(),
            "Alice".to_string(),
            now,
            25,
            None,
            Some("ws-1".to_string()),
        ).unwrap();

        let ended = manager.end_focus_window(&window.id).unwrap();
        assert_eq!(ended.id, window.id);

        // Should be removed from manager
        let active = manager.get_user_active_windows(&"user-1".to_string());
        assert!(active.is_empty());
    }
}
