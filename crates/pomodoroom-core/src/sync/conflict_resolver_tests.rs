//! Tests for conflict_resolver module.

#[cfg(test)]
mod tests {
    use super::super::conflict_resolver::*;
    use crate::task::{Task, TaskState};
    use chrono::Utc;

    #[test]
    fn test_merge_task_state() {
        let local = Task {
            id: "test".to_string(),
            title: "Test".to_string(),
            state: TaskState::Ready,
            ..Default::default()
        };

        let remote = Task {
            id: "test".to_string(),
            title: "Test".to_string(),
            state: TaskState::Running,
            ..Default::default()
        };

        let merged = merge_task_state(local.state, remote.state);
        assert_eq!(merged, TaskState::Running); // RUNNING > READY
    }

    #[test]
    fn test_field_merge_tasks() {
        let local = Task {
            id: "test".to_string(),
            title: "Local Title".to_string(),
            state: TaskState::Running,
            tags: vec!["local".to_string()],
            updated_at: Utc::now() - chrono::Duration::minutes(10),
            ..Default::default()
        };

        let remote = Task {
            id: "test".to_string(),
            title: "Remote Title".to_string(),
            state: TaskState::Ready,
            tags: vec!["remote".to_string()],
            updated_at: Utc::now(),
            ..Default::default()
        };

        let merged = merge_task_fields(&local, &remote);
        assert_eq!(merged.title, "Remote Title"); // Remote wins (newer)
        assert_eq!(merged.state, TaskState::Running); // RUNNING > READY
        // Tags should be merged (union)
        assert!(merged.tags.contains(&"local".to_string()));
        assert!(merged.tags.contains(&"remote".to_string()));
    }

    #[test]
    fn test_merge_task_state_priority() {
        // DONE beats everything
        assert_eq!(merge_task_state(TaskState::Done, TaskState::Ready), TaskState::Done);
        assert_eq!(merge_task_state(TaskState::Ready, TaskState::Done), TaskState::Done);

        // RUNNING beats PAUSED and READY
        assert_eq!(merge_task_state(TaskState::Running, TaskState::Paused), TaskState::Running);
        assert_eq!(merge_task_state(TaskState::Ready, TaskState::Running), TaskState::Running);

        // PAUSED beats READY
        assert_eq!(merge_task_state(TaskState::Paused, TaskState::Ready), TaskState::Paused);
        assert_eq!(merge_task_state(TaskState::Ready, TaskState::Paused), TaskState::Paused);

        // Same states
        assert_eq!(merge_task_state(TaskState::Ready, TaskState::Ready), TaskState::Ready);
    }

    #[test]
    fn test_merge_string_lists() {
        let local = vec!["a".to_string(), "b".to_string()];
        let remote = vec!["b".to_string(), "c".to_string()];
        let merged = merge_string_lists(&local, &remote);

        assert_eq!(merged.len(), 3);
        assert!(merged.contains(&"a".to_string()));
        assert!(merged.contains(&"b".to_string()));
        assert!(merged.contains(&"c".to_string()));
    }
}
