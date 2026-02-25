//! Tests for event_codec module.

#[cfg(test)]
mod tests {
    use super::super::event_codec::*;
    use crate::task::{Task, TaskState, TaskKind, EnergyLevel, TaskCategory};
    use crate::schedule::{Project, Group};
    use crate::sync::types::SyncEventType;
    use chrono::Utc;

    #[test]
    fn test_task_to_sync_event() {
        let task = Task {
            id: "task-123".to_string(),
            title: "Test Task".to_string(),
            description: None,
            state: TaskState::Ready,
            kind: TaskKind::DurationOnly,
            energy: EnergyLevel::Medium,
            category: TaskCategory::Active,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            elapsed_minutes: 0,
            ..Default::default()
        };

        let sync_event = task_to_sync_event(&task).unwrap();
        assert_eq!(sync_event.id, "task-123");
        assert_eq!(sync_event.event_type, SyncEventType::Task);
        assert_eq!(sync_event.data["title"], "Test Task");
        assert!(!sync_event.deleted);
    }

    #[test]
    fn test_sync_event_to_task() {
        let data = serde_json::json!({
            "id": "task-456",
            "title": "Another Task",
            "state": "RUNNING",
            "estimated_pomodoros": 1,
            "completed_pomodoros": 0,
            "completed": false,
            "kind": "duration_only",
            "energy": "medium",
            "category": "active",
            "tags": [],
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
            "elapsed_minutes": 0
        });

        let task = sync_event_to_task("task-456", &data).unwrap();
        assert_eq!(task.id, "task-456");
        assert_eq!(task.title, "Another Task");
        assert_eq!(task.state, TaskState::Running);
    }

    #[test]
    fn test_task_deletion_event() {
        let task = Task {
            id: "task-789".to_string(),
            title: "Delete Me".to_string(),
            state: TaskState::Done,
            kind: TaskKind::DurationOnly,
            energy: EnergyLevel::Medium,
            category: TaskCategory::Active,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            elapsed_minutes: 25,
            ..Default::default()
        };

        let event = task_deletion_event(&task);
        assert_eq!(event.id, "task-789");
        assert_eq!(event.event_type, SyncEventType::Task);
        assert!(event.deleted);
    }

    #[test]
    fn test_project_to_sync_event() {
        let project = Project {
            id: "project-123".to_string(),
            name: "Test Project".to_string(),
            deadline: None,
            tasks: vec![],
            created_at: Utc::now(),
            is_pinned: false,
            references: vec![],
            default_tags: vec![],
            color: None,
        };

        let sync_event = project_to_sync_event(&project).unwrap();
        assert_eq!(sync_event.id, "project-123");
        assert_eq!(sync_event.event_type, SyncEventType::Project);
        assert_eq!(sync_event.data["name"], "Test Project");
    }

    #[test]
    fn test_sync_event_to_project() {
        let data = serde_json::json!({
            "id": "project-456",
            "name": "Another Project",
            "is_pinned": true,
            "tasks": [],
            "deadline": null,
            "created_at": "2024-01-01T00:00:00Z",
            "references": []
        });

        let project = sync_event_to_project("project-456", &data).unwrap();
        assert_eq!(project.id, "project-456");
        assert_eq!(project.name, "Another Project");
    }

    #[test]
    fn test_group_to_sync_event() {
        let group = Group {
            id: "group-123".to_string(),
            name: "Backend".to_string(),
            parent_id: None,
            order_index: 0,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        let sync_event = group_to_sync_event(&group).unwrap();
        assert_eq!(sync_event.id, "group-123");
        assert_eq!(sync_event.event_type, SyncEventType::Group);
        assert_eq!(sync_event.data["name"], "Backend");
    }

    #[test]
    fn test_sync_event_to_group() {
        let data = serde_json::json!({
            "id": "group-456",
            "name": "Frontend",
            "order_index": 1,
            "parent_id": null,
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z"
        });

        let group = sync_event_to_group("group-456", &data).unwrap();
        assert_eq!(group.id, "group-456");
        assert_eq!(group.name, "Frontend");
    }
}
