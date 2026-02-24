//! Tests for calendar_client module. TDD: Write failing tests first.

#[cfg(test)]
mod tests {
    use super::super::calendar_client::*;
    use crate::sync::types::{SyncEvent, SyncEventType};
    use chrono::Utc;

    #[test]
    fn test_calendar_event_from_sync_event() {
        let sync_event = SyncEvent {
            id: "task-123".to_string(),
            event_type: SyncEventType::Task,
            data: serde_json::json!({"title": "Test Task"}),
            updated_at: Utc::now(),
            deleted: false,
        };

        let gcal_event = to_gcal_event(&sync_event, "Pomodoroom").unwrap();
        assert!(gcal_event["summary"].as_str().unwrap().starts_with("[TASK]"));
        assert_eq!(gcal_event["extendedProperties"]["private"]["pomodoroom_id"], "task-123");
    }

    #[test]
    fn test_find_pomodoroom_calendar() {
        // Mock test - actual API calls require auth
        let calendars = vec![
            serde_json::json!({"id": "cal1", "summary": "Personal"}),
            serde_json::json!({"id": "cal2", "summary": "Pomodoroom"}),
        ];
        let found = find_pomodoroom_calendar_in_list(&calendars);
        assert_eq!(found, Some("cal2".to_string()));
    }

    #[test]
    fn test_find_pomodoroom_calendar_not_found() {
        let calendars = vec![
            serde_json::json!({"id": "cal1", "summary": "Personal"}),
            serde_json::json!({"id": "cal2", "summary": "Work"}),
        ];
        let found = find_pomodoroom_calendar_in_list(&calendars);
        assert_eq!(found, None);
    }

    #[test]
    fn test_to_gcal_event_with_deletion() {
        let sync_event = SyncEvent {
            id: "task-456".to_string(),
            event_type: SyncEventType::Task,
            data: serde_json::json!({"title": "Deleted Task"}),
            updated_at: Utc::now(),
            deleted: true,
        };

        let gcal_event = to_gcal_event(&sync_event, "Pomodoroom").unwrap();
        assert_eq!(gcal_event["status"], "cancelled");
    }

    #[test]
    fn test_to_gcal_event_extended_properties() {
        let sync_event = SyncEvent {
            id: "session-789".to_string(),
            event_type: SyncEventType::Session,
            data: serde_json::json!({"duration": 25}),
            updated_at: Utc::now(),
            deleted: false,
        };

        let gcal_event = to_gcal_event(&sync_event, "Pomodoroom").unwrap();
        let props = &gcal_event["extendedProperties"]["private"];

        assert_eq!(props["pomodoroom_type"], "Session");
        assert_eq!(props["pomodoroom_id"], "session-789");
        assert_eq!(props["pomodoroom_version"], "1");
    }
}
