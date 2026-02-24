//! In-memory sync queue with debounce support.

use crate::sync::types::SyncEvent;
use crate::storage::data_dir;
use chrono::{DateTime, Utc, Duration};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// Pending sync event with debounce timestamp.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct PendingEvent {
    event: SyncEvent,
    debounce_until: DateTime<Utc>,
}

/// Sync queue for batching upload operations.
pub struct SyncQueue {
    /// Pending events by ID for debounce.
    pending: HashMap<String, PendingEvent>,
    /// When to next process debounced events.
    next_process: Option<DateTime<Utc>>,
    /// Persistent queue file path.
    queue_file: PathBuf,
}

impl SyncQueue {
    /// Create new sync queue.
    pub fn new() -> Self {
        let data_dir = data_dir()
            .unwrap_or_else(|_| PathBuf::from("."));
        let queue_file = data_dir.join("sync_queue.json");

        Self {
            pending: HashMap::new(),
            next_process: None,
            queue_file,
        }
    }

    /// Create new sync queue with specific path (for testing).
    pub fn new_with_path(path: PathBuf) -> Self {
        Self {
            pending: HashMap::new(),
            next_process: None,
            queue_file: path,
        }
    }

    /// Enqueue an event for sync (with debounce).
    pub fn enqueue(&mut self, event: SyncEvent) {
        let debounce_until = Utc::now() + Duration::seconds(3);
        self.pending.insert(
            event.id.clone(),
            PendingEvent {
                event,
                debounce_until,
            },
        );

        // Update next process time
        self.update_next_process();
    }

    /// Drain up to n events ready for sync.
    pub fn drain_up_to(&mut self, n: usize) -> Vec<SyncEvent> {
        let now = Utc::now();
        let mut ready = Vec::new();

        self.pending.retain(|_, pending| {
            if pending.debounce_until <= now && ready.len() < n {
                ready.push(pending.event.clone());
                false // Remove from pending
            } else {
                true // Keep in pending
            }
        });

        self.update_next_process();
        ready
    }

    /// Get number of pending events.
    pub fn len(&self) -> usize {
        self.pending.len()
    }

    /// Check if queue is empty.
    pub fn is_empty(&self) -> bool {
        self.pending.is_empty()
    }

    /// Get time until next batch is ready.
    pub fn time_until_next_batch(&self) -> Option<Duration> {
        self.next_process.map(|t| {
            let now = Utc::now();
            if t > now {
                t - now
            } else {
                Duration::zero()
            }
        })
    }

    /// Persist queue to disk.
    pub fn persist(&self) -> Result<(), std::io::Error> {
        let data = serde_json::to_string_pretty(&self.pending)?;
        std::fs::write(&self.queue_file, data)?;
        Ok(())
    }

    /// Load queue from disk.
    pub fn load(&mut self) -> Result<(), std::io::Error> {
        if !self.queue_file.exists() {
            return Ok(());
        }

        let content = std::fs::read_to_string(&self.queue_file)?;
        let loaded: HashMap<String, PendingEvent> = serde_json::from_str(&content)?;
        self.pending = loaded;
        self.update_next_process();
        Ok(())
    }

    /// Update next process time based on earliest debounce.
    fn update_next_process(&mut self) {
        self.next_process = self.pending
            .values()
            .map(|p| p.debounce_until)
            .min();
    }
}

impl Default for SyncQueue {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync::types::{SyncEvent, SyncEventType};
    use chrono::Utc;

    #[test]
    fn test_enqueue_and_drain() {
        let mut queue = SyncQueue::new();
        let event = SyncEvent {
            id: "test-1".to_string(),
            event_type: SyncEventType::Task,
            data: serde_json::json!({}),
            updated_at: Utc::now(),
            deleted: false,
        };

        queue.enqueue(event.clone());
        assert_eq!(queue.len(), 1);

        // Wait for debounce
        std::thread::sleep(std::time::Duration::from_secs(4));

        let drained = queue.drain_up_to(10);
        assert_eq!(drained.len(), 1);
        assert_eq!(queue.len(), 0);
    }

    #[test]
    fn test_debounce_same_id() {
        let mut queue = SyncQueue::new();

        let event1 = SyncEvent {
            id: "test-1".to_string(),
            event_type: SyncEventType::Task,
            data: serde_json::json!({"v": 1}),
            updated_at: Utc::now(),
            deleted: false,
        };

        let event2 = SyncEvent {
            id: "test-1".to_string(),
            event_type: SyncEventType::Task,
            data: serde_json::json!({"v": 2}),
            updated_at: Utc::now() + chrono::Duration::seconds(1),
            deleted: false,
        };

        queue.enqueue(event1);
        queue.enqueue(event2);

        // Should have only 1 (debounced)
        assert_eq!(queue.len(), 1);

        // Wait for debounce
        std::thread::sleep(std::time::Duration::from_secs(4));

        let drained = queue.drain_up_to(10);
        assert_eq!(drained[0].data["v"], 2);
    }

    #[test]
    fn test_is_empty() {
        let mut queue = SyncQueue::new();
        assert!(queue.is_empty());

        let event = SyncEvent {
            id: "test-1".to_string(),
            event_type: SyncEventType::Task,
            data: serde_json::json!({}),
            updated_at: Utc::now(),
            deleted: false,
        };
        queue.enqueue(event);
        assert!(!queue.is_empty());
    }

    #[test]
    fn test_time_until_next_batch() {
        let mut queue = SyncQueue::new();
        assert!(queue.time_until_next_batch().is_none());

        let event = SyncEvent {
            id: "test-1".to_string(),
            event_type: SyncEventType::Task,
            data: serde_json::json!({}),
            updated_at: Utc::now(),
            deleted: false,
        };
        queue.enqueue(event);

        // Should be some duration (about 3 seconds)
        let next = queue.time_until_next_batch();
        assert!(next.is_some());
        let duration = next.unwrap();
        assert!(duration.num_seconds() > 0);
        assert!(duration.num_seconds() <= 4);
    }

    #[test]
    fn test_drain_limit() {
        let mut queue = SyncQueue::new();

        for i in 0..5 {
            let event = SyncEvent {
                id: format!("test-{}", i),
                event_type: SyncEventType::Task,
                data: serde_json::json!({"i": i}),
                updated_at: Utc::now(),
                deleted: false,
            };
            queue.enqueue(event);
        }

        // Wait for debounce
        std::thread::sleep(std::time::Duration::from_secs(4));

        // Drain only 3
        let drained = queue.drain_up_to(3);
        assert_eq!(drained.len(), 3);
        assert_eq!(queue.len(), 2);
    }

    #[test]
    fn test_persist_and_load() {
        use tempfile::TempDir;

        let temp_dir = TempDir::new().unwrap();
        let mut queue = SyncQueue::new_with_path(temp_dir.path().join("queue.json"));

        let event = SyncEvent {
            id: "persist-test".to_string(),
            event_type: SyncEventType::Task,
            data: serde_json::json!({"key": "value"}),
            updated_at: Utc::now(),
            deleted: false,
        };

        queue.enqueue(event.clone());
        queue.persist().unwrap();

        // Load into new queue
        let mut queue2 = SyncQueue::new_with_path(temp_dir.path().join("queue.json"));
        queue2.load().unwrap();
        assert_eq!(queue2.len(), 1);

        // Wait for debounce
        std::thread::sleep(std::time::Duration::from_secs(4));

        let drained = queue2.drain_up_to(10);
        assert_eq!(drained.len(), 1);
        assert_eq!(drained[0].id, "persist-test");
        assert_eq!(drained[0].data["key"], "value");
    }
}
