//! Sync engine for bidirectional calendar synchronization.

use crate::sync::types::{SyncEvent, SyncError, SyncStatus};
use chrono::{DateTime, Utc, Duration};
use std::sync::{Arc, Mutex};

/// Merge decision for conflicting events.
#[derive(Debug, Clone, PartialEq)]
pub enum MergeDecision {
    UseLocal,
    UseRemote,
    Merged(SyncEvent),
    NeedsUserChoice,
}

/// Sync engine managing bidirectional sync.
pub struct SyncEngine {
    last_sync_at: Arc<Mutex<Option<DateTime<Utc>>>>,
}

impl SyncEngine {
    /// Create new sync engine.
    pub fn new() -> Self {
        Self {
            last_sync_at: Arc::new(Mutex::new(None)),
        }
    }

    /// Perform initial sync on startup.
    pub fn startup_sync(&mut self) -> Result<SyncStatus, SyncError> {
        // Update last sync time
        *self.last_sync_at.lock().unwrap() = Some(Utc::now());

        Ok(SyncStatus {
            last_sync_at: Some(Utc::now()),
            pending_count: 0,
            in_progress: false,
        })
    }

    /// Get current sync status.
    pub fn status(&self) -> SyncStatus {
        let guard = self.last_sync_at.lock().unwrap();
        SyncStatus {
            last_sync_at: *guard,
            pending_count: 0,
            in_progress: false,
        }
    }
}

impl Default for SyncEngine {
    fn default() -> Self {
        Self::new()
    }
}

/// Decide merge outcome based on timestamps and deletion status.
pub fn decide_merge(
    local_updated: DateTime<Utc>,
    remote_updated: DateTime<Utc>,
    local_deleted: bool,
    remote_deleted: bool,
) -> MergeDecision {
    let day = Duration::days(1);
    let time_diff = remote_updated - local_updated;

    // Deletion conflicts - deletion always wins
    match (local_deleted, remote_deleted) {
        (true, _) => return MergeDecision::UseLocal,  // Local already deleted
        (_, true) => return MergeDecision::UseRemote, // Mark local for deletion
        (false, false) => {} // Continue to timestamp comparison
    }

    // Clear time difference wins
    if time_diff > day {
        return MergeDecision::UseRemote;
    } else if time_diff < -day {
        return MergeDecision::UseLocal;
    }

    // Within same day - newer timestamp wins
    if remote_updated > local_updated {
        MergeDecision::UseRemote
    } else {
        MergeDecision::UseLocal
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decide_merge_local_newer() {
        let local = Utc::now();
        let remote = local - Duration::hours(2);
        assert_eq!(
            decide_merge(local, remote, false, false),
            MergeDecision::UseLocal
        );
    }

    #[test]
    fn test_decide_merge_remote_newer() {
        let local = Utc::now() - Duration::hours(2);
        let remote = Utc::now();
        assert_eq!(
            decide_merge(local, remote, false, false),
            MergeDecision::UseRemote
        );
    }

    #[test]
    fn test_decide_merge_local_deleted() {
        let local = Utc::now() - Duration::hours(1);
        let remote = Utc::now();
        assert_eq!(
            decide_merge(local, remote, true, false),
            MergeDecision::UseLocal  // Already deleted locally
        );
    }

    #[test]
    fn test_decide_merge_remote_deleted() {
        let local = Utc::now();
        let remote = local - Duration::hours(1);
        assert_eq!(
            decide_merge(local, remote, false, true),
            MergeDecision::UseRemote  // Should delete local
        );
    }
}
