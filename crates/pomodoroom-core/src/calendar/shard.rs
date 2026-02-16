//! Calendar sharding strategy for multi-tenant event storage.
//!
//! Supports splitting calendar data by project or stream for scalability.

use serde::{Deserialize, Serialize};

/// Identifier for a calendar shard.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum CalendarShardId {
    /// Global shard for system-wide events
    Global,
    /// Project-specific shard
    Project { project_id: String },
    /// Stream-specific shard (e.g. focus, break, planning)
    Stream { stream_name: String },
    /// User-specific shard
    User { user_id: String },
}

impl CalendarShardId {
    /// Get the shard key for database lookup
    pub fn shard_key(&self) -> String {
        match self {
            CalendarShardId::Global => "global".to_string(),
            CalendarShardId::Project { project_id } => format!("project:{}", project_id),
            CalendarShardId::Stream { stream_name } => format!("stream:{}", stream_name),
            CalendarShardId::User { user_id } => format!("user:{}", user_id),
        }
    }

    /// Parse a shard key back into a CalendarShardId
    pub fn from_key(key: &str) -> Option<Self> {
        if key == "global" {
            return Some(CalendarShardId::Global);
        }
        if let Some(rest) = key.strip_prefix("project:") {
            return Some(CalendarShardId::Project {
                project_id: rest.to_string(),
            });
        }
        if let Some(rest) = key.strip_prefix("stream:") {
            return Some(CalendarShardId::Stream {
                stream_name: rest.to_string(),
            });
        }
        if let Some(rest) = key.strip_prefix("user:") {
            return Some(CalendarShardId::User {
                user_id: rest.to_string(),
            });
        }
        None
    }
}

/// Shard routing policy
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ShardPolicy {
    /// Route all events to global shard
    GlobalOnly,
    /// Route by project
    ByProject,
    /// Route by stream type
    ByStream,
    /// Route by user
    ByUser,
    /// Composite routing (project + stream)
    Composite { project_first: bool },
}

/// Shard routing configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShardConfig {
    pub policy: ShardPolicy,
    pub max_events_per_shard: usize,
    pub shard_rotation_days: Option<u64>,
}

impl Default for ShardConfig {
    fn default() -> Self {
        Self {
            policy: ShardPolicy::ByProject,
            max_events_per_shard: 100_000,
            shard_rotation_days: Some(90),
        }
    }
}

/// Shard routing engine
pub struct ShardRouter {
    config: ShardConfig,
}

impl ShardRouter {
    pub fn new(config: ShardConfig) -> Self {
        Self { config }
    }

    pub fn with_default_policy() -> Self {
        Self::new(ShardConfig::default())
    }

    /// Route an event to the appropriate shard
    pub fn route_event(
        &self,
        _event: &crate::Event,
        context: &RoutingContext,
    ) -> CalendarShardId {
        match &self.config.policy {
            ShardPolicy::GlobalOnly => CalendarShardId::Global,
            ShardPolicy::ByProject => {
                if let Some(project_id) = &context.project_id {
                    CalendarShardId::Project {
                        project_id: project_id.clone(),
                    }
                } else {
                    CalendarShardId::Global
                }
            }
            ShardPolicy::ByStream => {
                if let Some(stream) = &context.stream {
                    CalendarShardId::Stream {
                        stream_name: stream.clone(),
                    }
                } else {
                    CalendarShardId::Global
                }
            }
            ShardPolicy::ByUser => {
                if let Some(user_id) = &context.user_id {
                    CalendarShardId::User {
                        user_id: user_id.clone(),
                    }
                } else {
                    CalendarShardId::Global
                }
            }
            ShardPolicy::Composite { project_first } => {
                if *project_first {
                    if let Some(project_id) = &context.project_id {
                        CalendarShardId::Project {
                            project_id: project_id.clone(),
                        }
                    } else if let Some(stream) = &context.stream {
                        CalendarShardId::Stream {
                            stream_name: stream.clone(),
                        }
                    } else {
                        CalendarShardId::Global
                    }
                } else {
                    if let Some(stream) = &context.stream {
                        CalendarShardId::Stream {
                            stream_name: stream.clone(),
                        }
                    } else if let Some(project_id) = &context.project_id {
                        CalendarShardId::Project {
                            project_id: project_id.clone(),
                        }
                    } else {
                        CalendarShardId::Global
                    }
                }
            }
        }
    }

    /// Determine if a shard needs rotation based on event count
    pub fn should_rotate_shard(&self, shard_event_count: usize) -> bool {
        shard_event_count >= self.config.max_events_per_shard
    }
}

/// Context for routing decisions
#[derive(Debug, Clone, Default)]
pub struct RoutingContext {
    pub project_id: Option<String>,
    pub stream: Option<String>,
    pub user_id: Option<String>,
}

impl RoutingContext {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_project(mut self, project_id: String) -> Self {
        self.project_id = Some(project_id);
        self
    }

    pub fn with_stream(mut self, stream: String) -> Self {
        self.stream = Some(stream);
        self
    }

    pub fn with_user(mut self, user_id: String) -> Self {
        self.user_id = Some(user_id);
        self
    }
}

/// Aggregated view across multiple shards
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AggregatedView {
    pub shards: Vec<String>,
    pub total_events: usize,
    pub latest_event_at: Option<String>,
}

impl AggregatedView {
    /// Create an empty aggregated view
    pub fn empty() -> Self {
        Self {
            shards: Vec::new(),
            total_events: 0,
            latest_event_at: None,
        }
    }

    /// Aggregate from shard information
    pub fn from_shards(shards: &[crate::storage::database::ShardInfo]) -> Self {
        let total_events: usize = shards.iter().map(|s| s.event_count).sum();
        let shard_keys: Vec<String> = shards.iter().map(|s| s.shard_key.clone()).collect();

        // Find latest event time (assuming created_at is a proxy)
        let latest = shards
            .iter()
            .filter_map(|s| s.rotated_at.as_ref().or(Some(&s.created_at)))
            .max()
            .map(|s| s.clone());

        Self {
            shards: shard_keys,
            total_events,
            latest_event_at: latest,
        }
    }

    /// Merge another aggregated view into this one
    pub fn merge(&mut self, other: AggregatedView) {
        self.total_events += other.total_events;
        self.shards.extend(other.shards);
        self.shards.sort();
        self.shards.dedup();

        if let Some(other_latest) = other.latest_event_at {
            if let Some(self_latest) = &self.latest_event_at {
                if other_latest > *self_latest {
                    self.latest_event_at = Some(other_latest);
                }
            } else {
                self.latest_event_at = Some(other_latest);
            }
        }
    }
}

/// Builder for aggregated queries across shards
pub struct ShardQueryBuilder {
    shard_ids: Vec<CalendarShardId>,
    filters: ShardQueryFilters,
}

#[derive(Debug, Clone, Default)]
pub struct ShardQueryFilters {
    pub since: Option<String>,
    pub until: Option<String>,
    pub limit: Option<usize>,
}

impl ShardQueryBuilder {
    pub fn new() -> Self {
        Self {
            shard_ids: Vec::new(),
            filters: ShardQueryFilters::default(),
        }
    }

    pub fn with_shard(mut self, shard_id: CalendarShardId) -> Self {
        self.shard_ids.push(shard_id);
        self
    }

    pub fn with_shards(mut self, shard_ids: Vec<CalendarShardId>) -> Self {
        self.shard_ids = shard_ids;
        self
    }

    pub fn since(mut self, timestamp: String) -> Self {
        self.filters.since = Some(timestamp);
        self
    }

    pub fn until(mut self, timestamp: String) -> Self {
        self.filters.until = Some(timestamp);
        self
    }

    pub fn limit(mut self, limit: usize) -> Self {
        self.filters.limit = Some(limit);
        self
    }

    /// Get the shard keys for database queries
    pub fn shard_keys(&self) -> Vec<String> {
        self.shard_ids.iter().map(|id| id.shard_key()).collect()
    }
}

impl Default for ShardQueryBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Event;
    use chrono::Utc;

    #[test]
    fn shard_key_round_trip() {
        let id = CalendarShardId::Project {
            project_id: "proj-123".to_string(),
        };
        let key = id.shard_key();
        let restored = CalendarShardId::from_key(&key).unwrap();
        assert_eq!(id, restored);
    }

    #[test]
    fn route_by_project() {
        let router = ShardRouter::new(ShardConfig {
            policy: ShardPolicy::ByProject,
            max_events_per_shard: 1000,
            shard_rotation_days: None,
        });

        let context = RoutingContext::new()
            .with_project("proj-abc".to_string())
            .with_stream("focus".to_string());

        let event = create_test_event();
        let shard = router.route_event(&event, &context);

        assert_eq!(
            shard,
            CalendarShardId::Project {
                project_id: "proj-abc".to_string()
            }
        );
    }

    #[test]
    fn route_composite_falls_back_to_stream() {
        let router = ShardRouter::new(ShardConfig {
            policy: ShardPolicy::Composite {
                project_first: true,
            },
            max_events_per_shard: 1000,
            shard_rotation_days: None,
        });

        let context = RoutingContext::new().with_stream("break".to_string());

        let event = create_test_event();
        let shard = router.route_event(&event, &context);

        assert_eq!(
            shard,
            CalendarShardId::Stream {
                stream_name: "break".to_string()
            }
        );
    }

    #[test]
    fn should_rotate_when_limit_reached() {
        let router = ShardRouter::new(ShardConfig {
            policy: ShardPolicy::ByProject,
            max_events_per_shard: 100,
            shard_rotation_days: None,
        });

        assert!(!router.should_rotate_shard(99));
        assert!(router.should_rotate_shard(100));
        assert!(router.should_rotate_shard(101));
    }

    fn create_test_event() -> Event {
        Event::TimerStarted {
            step_index: 0,
            step_type: crate::timer::StepType::Focus,
            duration_secs: 1500,
            at: Utc::now(),
        }
    }

    #[test]
    fn aggregated_view_from_shards() {
        use crate::storage::database::ShardInfo;

        let shards = vec![
            ShardInfo {
                shard_key: "global".to_string(),
                shard_type: "global".to_string(),
                event_count: 100,
                created_at: "2026-01-01T00:00:00Z".to_string(),
                rotated_at: None,
            },
            ShardInfo {
                shard_key: "project:p1".to_string(),
                shard_type: "project".to_string(),
                event_count: 50,
                created_at: "2026-01-02T00:00:00Z".to_string(),
                rotated_at: Some("2026-02-01T00:00:00Z".to_string()),
            },
        ];

        let view = AggregatedView::from_shards(&shards);
        assert_eq!(view.total_events, 150);
        assert_eq!(view.shards.len(), 2);
        assert_eq!(view.latest_event_at, Some("2026-02-01T00:00:00Z".to_string()));
    }

    #[test]
    fn aggregated_view_merge() {
        let mut view1 = AggregatedView {
            shards: vec!["global".to_string()],
            total_events: 100,
            latest_event_at: Some("2026-01-01T00:00:00Z".to_string()),
        };

        let view2 = AggregatedView {
            shards: vec!["project:p1".to_string()],
            total_events: 50,
            latest_event_at: Some("2026-02-01T00:00:00Z".to_string()),
        };

        view1.merge(view2);
        assert_eq!(view1.total_events, 150);
        assert_eq!(view1.shards.len(), 2);
        assert_eq!(view1.latest_event_at, Some("2026-02-01T00:00:00Z".to_string()));
    }

    #[test]
    fn shard_query_builder() {
        let builder = ShardQueryBuilder::new()
            .with_shard(CalendarShardId::Global)
            .with_shard(CalendarShardId::Project {
                project_id: "p1".to_string(),
            })
            .since("2026-01-01T00:00:00Z".to_string())
            .limit(100);

        let keys = builder.shard_keys();
        assert_eq!(keys.len(), 2);
        assert!(keys.contains(&"global".to_string()));
        assert!(keys.contains(&"project:p1".to_string()));
    }
}
