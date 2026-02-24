//! Google Calendar sync commands for Tauri IPC.
//!
//! Provides commands for:
//! - Startup sync (fetch remote changes on app launch)
//! - Manual sync (user-initiated sync)
//! - Sync status query

use chrono::Utc;
use pomodoroom_core::sync::{CalendarClient, SyncStatus};
use pomodoroom_core::integrations::{google::GoogleIntegration, Integration};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

/// Sync state managed across Tauri commands.
#[derive(Default)]
pub struct SyncState {
    /// Current sync status
    status: Mutex<SyncStatus>,
}

impl SyncState {
    pub fn new() -> Self {
        Self::default()
    }
}

/// Result of a sync operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    /// Whether sync was successful
    pub success: bool,
    /// Number of events processed
    pub events_processed: usize,
    /// Timestamp of sync completion
    pub synced_at: String,
    /// Error message if sync failed
    pub error: Option<String>,
}

/// Execute startup sync - fetch remote changes since last sync.
///
/// This should be called on app launch to pull any changes made
/// on other devices.
#[tauri::command]
pub async fn cmd_sync_startup(
    sync_state: State<'_, SyncState>,
) -> Result<SyncResult, String> {
    // Check and update status before sync
    {
        let mut status = sync_state.status.lock()
            .map_err(|e| format!("Lock error: {e}"))?;

        // Check if sync is already in progress
        if status.in_progress {
            return Ok(SyncResult {
                success: false,
                events_processed: 0,
                synced_at: Utc::now().to_rfc3339(),
                error: Some("Sync already in progress".to_string()),
            });
        }

        status.in_progress = true;
    } // Lock is released here

    // Perform sync (outside of lock)
    let result = do_sync().await;

    // Update status after sync
    {
        let mut status = sync_state.status.lock()
            .map_err(|e| format!("Lock error: {e}"))?;
        status.in_progress = false;

        if result.success {
            status.last_sync_at = Some(Utc::now());
            status.pending_count = 0;
        }
    }

    Ok(result)
}

/// Execute manual sync - user-initiated full sync.
///
/// Fetches remote changes and pushes local changes.
#[tauri::command]
pub async fn cmd_sync_manual(
    sync_state: State<'_, SyncState>,
) -> Result<SyncResult, String> {
    // For now, manual sync is same as startup sync
    // In future, will also push local changes
    cmd_sync_startup(sync_state).await
}

/// Get current sync status.
#[tauri::command]
pub fn cmd_sync_get_status(
    sync_state: State<'_, SyncState>,
) -> Result<SyncStatus, String> {
    sync_state.status.lock()
        .map_err(|e| format!("Lock error: {e}"))
        .map(|s| s.clone())
}

/// Perform the actual sync operation.
async fn do_sync() -> SyncResult {
    // Check if Google is authenticated
    let google = GoogleIntegration::new();
    if !google.is_authenticated() {
        return SyncResult {
            success: false,
            events_processed: 0,
            synced_at: Utc::now().to_rfc3339(),
            error: Some("Not authenticated with Google".to_string()),
        };
    }

    // Create calendar client
    let mut client = CalendarClient::new();

    // Ensure Pomodoroom calendar exists
    if let Err(e) = client.ensure_pomodoroom_calendar() {
        return SyncResult {
            success: false,
            events_processed: 0,
            synced_at: Utc::now().to_rfc3339(),
            error: Some(format!("Failed to ensure calendar: {e}")),
        };
    }

    // Fetch events (for now, just count them)
    // In full implementation, will decode and apply to local database
    let events = match client.fetch_events(None) {
        Ok(e) => e,
        Err(e) => return SyncResult {
            success: false,
            events_processed: 0,
            synced_at: Utc::now().to_rfc3339(),
            error: Some(format!("Failed to fetch events: {e}")),
        },
    };

    let count = events.len();

    SyncResult {
        success: true,
        events_processed: count,
        synced_at: Utc::now().to_rfc3339(),
        error: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sync_result_serialization() {
        let result = SyncResult {
            success: true,
            events_processed: 5,
            synced_at: "2025-02-25T12:00:00Z".to_string(),
            error: None,
        };

        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("\"success\":true"));
        assert!(json.contains("\"events_processed\":5"));
    }

    #[test]
    fn test_sync_result_with_error() {
        let result = SyncResult {
            success: false,
            events_processed: 0,
            synced_at: "2025-02-25T12:00:00Z".to_string(),
            error: Some("Authentication failed".to_string()),
        };

        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("\"success\":false"));
        assert!(json.contains("Authentication failed"));
    }

    #[test]
    fn test_sync_state_new() {
        let state = SyncState::new();
        let status = state.status.lock().unwrap();
        assert!(!status.in_progress);
        assert_eq!(status.pending_count, 0);
        assert!(status.last_sync_at.is_none());
    }
}
