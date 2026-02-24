//! Tests for sync types module.

#[cfg(test)]
mod tests {
    use super::super::types::*;

    #[test]
    fn test_sync_event_creation() {
        let event = SyncEvent {
            id: "test-123".to_string(),
            event_type: SyncEventType::Task,
            data: serde_json::json!({"title": "Test"}),
            updated_at: chrono::Utc::now(),
            deleted: false,
        };
        assert_eq!(event.id, "test-123");
        assert_eq!(event.event_type, SyncEventType::Task);
        assert!(!event.deleted);
    }

    #[test]
    fn test_sync_status() {
        let status = SyncStatus {
            last_sync_at: None,
            pending_count: 5,
            in_progress: true,
        };
        assert_eq!(status.pending_count, 5);
        assert!(status.in_progress);
    }

    #[test]
    fn test_sync_event_type_prefixes() {
        assert_eq!(SyncEventType::Task.event_prefix(), "[TASK]");
        assert_eq!(SyncEventType::Project.event_prefix(), "[PROJECT]");
        assert_eq!(SyncEventType::Group.event_prefix(), "[GROUP]");
        assert_eq!(SyncEventType::Session.event_prefix(), "[SESSION]");
        assert_eq!(SyncEventType::Config.event_prefix(), "[CONFIG]");
    }

    #[test]
    fn test_sync_event_serialization() {
        let event = SyncEvent {
            id: "test-456".to_string(),
            event_type: SyncEventType::DailyTemplate,
            data: serde_json::json!({"name": "Morning"}),
            updated_at: chrono::Utc::now(),
            deleted: false,
        };

        let serialized = serde_json::to_string(&event).unwrap();
        let deserialized: SyncEvent = serde_json::from_str(&serialized).unwrap();

        assert_eq!(deserialized.id, "test-456");
        assert_eq!(deserialized.event_type, SyncEventType::DailyTemplate);
    }
}
