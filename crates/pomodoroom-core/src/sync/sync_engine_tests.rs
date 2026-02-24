//! Tests for sync_engine module.

#[cfg(test)]
mod tests {
    use super::super::sync_engine::*;
    use crate::sync::types::{SyncEvent, SyncEventType};
    use chrono::{Utc, Duration};

    #[test]
    fn test_merge_decision_local_newer() {
        let local_time = Utc::now();
        let remote_time = local_time - Duration::hours(1);

        let decision = decide_merge(local_time, remote_time, false, false);
        assert_eq!(decision, MergeDecision::UseLocal);
    }

    #[test]
    fn test_merge_decision_remote_newer() {
        let local_time = Utc::now() - Duration::hours(1);
        let remote_time = Utc::now();

        let decision = decide_merge(local_time, remote_time, false, false);
        assert_eq!(decision, MergeDecision::UseRemote);
    }

    #[test]
    fn test_merge_decision_local_deleted() {
        let local = Utc::now() - Duration::hours(1);
        let remote = Utc::now();
        assert_eq!(
            decide_merge(local, remote, true, false),
            MergeDecision::UseLocal  // Already deleted locally
        );
    }

    #[test]
    fn test_merge_decision_remote_deleted() {
        let local = Utc::now();
        let remote = local - Duration::hours(1);
        assert_eq!(
            decide_merge(local, remote, false, true),
            MergeDecision::UseRemote  // Should delete local
        );
    }
}
