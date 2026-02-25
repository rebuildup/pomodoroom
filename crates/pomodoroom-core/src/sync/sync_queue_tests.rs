//! Tests for sync_queue module. TDD: Write failing tests first.

#[cfg(test)]
mod tests {
    use super::super::sync_queue::*;
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

        // Wait for debounce period (3 seconds)
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

        // Wait for debounce period
        std::thread::sleep(std::time::Duration::from_secs(4));

        let drained = queue.drain_up_to(10);
        assert_eq!(drained.len(), 1);
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

        // Wait for debounce period
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

        // Wait for debounce period
        std::thread::sleep(std::time::Duration::from_secs(4));

        let drained = queue2.drain_up_to(10);
        assert_eq!(drained.len(), 1);
        assert_eq!(drained[0].id, "persist-test");
        assert_eq!(drained[0].data["key"], "value");
    }
}
