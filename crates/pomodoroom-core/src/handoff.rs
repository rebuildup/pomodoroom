//! Handoff packets for paused or reassigned tasks.
//!
//! This module standardizes handoff when work is interrupted or reassigned,
//! auto-generating summaries from session context with blockers, next steps,
//! and references.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

/// Unique identifier for a handoff packet.
pub type PacketId = String;

/// Unique identifier for a task.
pub type TaskId = String;

/// A handoff packet containing context for task transfer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HandoffPacket {
    /// Unique packet identifier
    pub id: PacketId,

    /// Task being handed off
    pub task_id: TaskId,

    /// Task title
    pub task_title: String,

    /// Who is handing off
    pub from_user: String,

    /// Who is receiving (if assigned)
    pub to_user: Option<String>,

    /// When the handoff was created
    pub created_at: DateTime<Utc>,

    /// Current state of the task
    pub task_state: HandoffTaskState,

    /// Work completed so far
    pub progress_summary: String,

    /// What was being worked on when interrupted
    pub current_focus: Option<String>,

    /// Blockers encountered
    pub blockers: Vec<BlockerInfo>,

    /// Recommended next steps
    pub next_steps: Vec<NextStep>,

    /// References and resources
    pub references: Vec<Reference>,

    /// Session context (recent activity)
    pub session_context: SessionContext,

    /// Parent task chain
    pub parent_chain: Vec<TaskLink>,

    /// Additional notes
    pub notes: Option<String>,

    /// Whether this packet has been acknowledged
    pub acknowledged_at: Option<DateTime<Utc>>,

    /// Who acknowledged the packet
    pub acknowledged_by: Option<String>,
}

/// State of a task in handoff.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HandoffTaskState {
    /// Task was paused mid-work
    Paused,

    /// Task was interrupted by higher priority
    Interrupted,

    /// Task is being reassigned
    Reassigned,

    /// Task is blocked and waiting
    Blocked,

    /// Task completed but needs review
    PendingReview,
}

/// Information about a blocker.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockerInfo {
    /// Blocker description
    pub description: String,

    /// Type of blocker
    pub blocker_type: BlockerType,

    /// When the blocker was encountered
    pub encountered_at: DateTime<Utc>,

    /// Whether the blocker is resolved
    pub resolved: bool,

    /// Resolution notes (if resolved)
    pub resolution: Option<String>,
}

/// Types of blockers.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BlockerType {
    /// Waiting for another person
    WaitingOnPerson,

    /// Waiting for information
    WaitingOnInfo,

    /// Technical issue
    Technical,

    /// Resource constraint
    Resource,

    /// External dependency
    ExternalDependency,

    /// Decision needed
    DecisionNeeded,

    /// Other
    Other,
}

/// A recommended next step.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NextStep {
    /// Step description
    pub description: String,

    /// Priority of this step
    pub priority: StepPriority,

    /// Estimated effort
    pub estimated_effort: Option<EffortEstimate>,

    /// Dependencies for this step
    pub dependencies: Vec<String>,
}

/// Priority of a next step.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StepPriority {
    Critical,
    High,
    Medium,
    Low,
}

/// Effort estimate.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct EffortEstimate {
    pub minutes: u32,
    pub confidence: f32, // 0.0 to 1.0
}

/// A reference or resource link.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reference {
    /// Reference type
    pub reference_type: ReferenceType,

    /// Title or description
    pub title: String,

    /// URL or location
    pub location: Option<String>,

    /// Why this is relevant
    pub relevance: Option<String>,
}

/// Types of references.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ReferenceType {
    Documentation,
    CodeFile,
    PullRequest,
    Issue,
    Meeting,
    Conversation,
    Design,
    ExternalLink,
    Other,
}

/// Session context for handoff.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionContext {
    /// Total time spent on this task (minutes)
    pub total_time_minutes: i64,

    /// Number of focus sessions
    pub focus_sessions: u32,

    /// Recent activity summary
    pub recent_activity: Vec<ActivityEntry>,

    /// Key decisions made
    pub decisions: Vec<String>,

    /// Files or components touched
    pub touched_items: Vec<String>,
}

/// An activity entry in session context.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityEntry {
    pub timestamp: DateTime<Utc>,
    pub description: String,
    pub activity_type: ActivityType,
}

/// Types of activities.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ActivityType {
    Focus,
    Break,
    ContextSwitch,
    Note,
    Milestone,
}

/// A link to a related task.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskLink {
    pub task_id: TaskId,
    pub title: String,
    pub relationship: TaskRelationship,
}

/// Relationship between tasks.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TaskRelationship {
    Parent,
    Child,
    BlockedBy,
    Blocking,
    Related,
}

/// Generator for handoff packets.
pub struct HandoffGenerator {
    /// Packets stored by ID
    packets: HashMap<PacketId, HandoffPacket>,

    /// Packets indexed by task ID
    by_task: HashMap<TaskId, Vec<PacketId>>,

    /// Searchable history
    history: Vec<HandoffHistoryEntry>,
}

impl HandoffGenerator {
    /// Create a new generator.
    pub fn new() -> Self {
        Self {
            packets: HashMap::new(),
            by_task: HashMap::new(),
            history: Vec::new(),
        }
    }

    /// Generate a handoff packet from paused task context.
    pub fn generate(
        &mut self,
        task_id: TaskId,
        task_title: String,
        from_user: String,
        task_state: HandoffTaskState,
        context: SessionContext,
    ) -> PacketId {
        let packet_id = Uuid::new_v4().to_string();
        let now = Utc::now();

        // Generate progress summary from context
        let progress_summary = self.generate_progress_summary(&context);

        // Extract blockers from recent activity
        let blockers = self.extract_blockers(&context);

        // Generate next steps
        let next_steps = self.suggest_next_steps(&context, &blockers);

        let packet = HandoffPacket {
            id: packet_id.clone(),
            task_id: task_id.clone(),
            task_title,
            from_user,
            to_user: None,
            created_at: now,
            task_state,
            progress_summary,
            current_focus: context.recent_activity.last().map(|a| a.description.clone()),
            blockers,
            next_steps,
            references: Vec::new(),
            session_context: context,
            parent_chain: Vec::new(),
            notes: None,
            acknowledged_at: None,
            acknowledged_by: None,
        };

        // Clone from_user before moving packet
        let from_user_for_history = packet.from_user.clone();

        // Store packet
        self.packets.insert(packet_id.clone(), packet);

        // Index by task
        self.by_task
            .entry(task_id.clone())
            .or_default()
            .push(packet_id.clone());

        // Add to history
        self.history.push(HandoffHistoryEntry {
            packet_id: packet_id.clone(),
            task_id,
            created_at: now,
            from_user: from_user_for_history,
            to_user: None,
            state: HandoffState::Pending,
        });

        packet_id
    }

    /// Generate progress summary from context.
    fn generate_progress_summary(&self, context: &SessionContext) -> String {
        let hours = context.total_time_minutes / 60;
        let minutes = context.total_time_minutes % 60;

        let time_str = if hours > 0 {
            format!("{}h {}m", hours, minutes)
        } else {
            format!("{}m", minutes)
        };

        let decisions_summary = if context.decisions.is_empty() {
            String::new()
        } else {
            format!(" Key decisions: {}.", context.decisions.join(", "))
        };

        format!(
            "Worked on this task for {} across {} focus sessions.{}",
            time_str, context.focus_sessions, decisions_summary
        )
    }

    /// Extract blockers from context.
    fn extract_blockers(&self, context: &SessionContext) -> Vec<BlockerInfo> {
        // In a real implementation, this would analyze activity entries
        // to identify blockers. For now, return empty.
        Vec::new()
    }

    /// Suggest next steps based on context.
    fn suggest_next_steps(&self, context: &SessionContext, _blockers: &[BlockerInfo]) -> Vec<NextStep> {
        let mut steps = Vec::new();

        // If there are touched items, suggest continuing work
        if !context.touched_items.is_empty() {
            steps.push(NextStep {
                description: format!("Continue work on {}", context.touched_items.first().unwrap()),
                priority: StepPriority::High,
                estimated_effort: Some(EffortEstimate {
                    minutes: 25,
                    confidence: 0.5,
                }),
                dependencies: Vec::new(),
            });
        }

        steps
    }

    /// Add a blocker to a packet.
    pub fn add_blocker(&mut self, packet_id: &PacketId, blocker: BlockerInfo) -> Result<(), HandoffError> {
        let packet = self
            .packets
            .get_mut(packet_id)
            .ok_or(HandoffError::PacketNotFound)?;

        packet.blockers.push(blocker);
        Ok(())
    }

    /// Add a reference to a packet.
    pub fn add_reference(&mut self, packet_id: &PacketId, reference: Reference) -> Result<(), HandoffError> {
        let packet = self
            .packets
            .get_mut(packet_id)
            .ok_or(HandoffError::PacketNotFound)?;

        packet.references.push(reference);
        Ok(())
    }

    /// Add a next step to a packet.
    pub fn add_next_step(&mut self, packet_id: &PacketId, step: NextStep) -> Result<(), HandoffError> {
        let packet = self
            .packets
            .get_mut(packet_id)
            .ok_or(HandoffError::PacketNotFound)?;

        packet.next_steps.push(step);
        Ok(())
    }

    /// Update notes on a packet.
    pub fn update_notes(&mut self, packet_id: &PacketId, notes: String) -> Result<(), HandoffError> {
        let packet = self
            .packets
            .get_mut(packet_id)
            .ok_or(HandoffError::PacketNotFound)?;

        packet.notes = Some(notes);
        Ok(())
    }

    /// Assign packet to a user.
    pub fn assign(&mut self, packet_id: &PacketId, to_user: String) -> Result<(), HandoffError> {
        let packet = self
            .packets
            .get_mut(packet_id)
            .ok_or(HandoffError::PacketNotFound)?;

        packet.to_user = Some(to_user.clone());

        // Update history
        if let Some(entry) = self.history.iter_mut().find(|e| &e.packet_id == packet_id) {
            entry.to_user = Some(to_user);
        }

        Ok(())
    }

    /// Acknowledge a packet.
    pub fn acknowledge(
        &mut self,
        packet_id: &PacketId,
        acknowledged_by: String,
    ) -> Result<(), HandoffError> {
        let packet = self
            .packets
            .get_mut(packet_id)
            .ok_or(HandoffError::PacketNotFound)?;

        let now = Utc::now();
        packet.acknowledged_at = Some(now);
        packet.acknowledged_by = Some(acknowledged_by.clone());

        // Update history
        if let Some(entry) = self.history.iter_mut().find(|e| &e.packet_id == packet_id) {
            entry.state = HandoffState::Acknowledged;
        }

        Ok(())
    }

    /// Add parent task to chain.
    pub fn add_parent(&mut self, packet_id: &PacketId, parent: TaskLink) -> Result<(), HandoffError> {
        let packet = self
            .packets
            .get_mut(packet_id)
            .ok_or(HandoffError::PacketNotFound)?;

        packet.parent_chain.push(parent);
        Ok(())
    }

    /// Get packet by ID.
    pub fn get_packet(&self, packet_id: &PacketId) -> Option<&HandoffPacket> {
        self.packets.get(packet_id)
    }

    /// Get all packets for a task.
    pub fn get_packets_for_task(&self, task_id: &TaskId) -> Vec<&HandoffPacket> {
        if let Some(packet_ids) = self.by_task.get(task_id) {
            packet_ids
                .iter()
                .filter_map(|id| self.packets.get(id))
                .collect()
        } else {
            Vec::new()
        }
    }

    /// Search handoff history.
    pub fn search_history(&self, query: &str) -> Vec<&HandoffHistoryEntry> {
        let query_lower = query.to_lowercase();
        self.history
            .iter()
            .filter(|entry| {
                // Search in task_id, from_user, to_user
                entry.task_id.to_lowercase().contains(&query_lower)
                    || entry.from_user.to_lowercase().contains(&query_lower)
                    || entry
                        .to_user
                        .as_ref()
                        .map(|u| u.to_lowercase().contains(&query_lower))
                        .unwrap_or(false)
            })
            .collect()
    }

    /// Get full history.
    pub fn get_history(&self) -> &[HandoffHistoryEntry] {
        &self.history
    }

    /// Export packet as editable text.
    pub fn export_as_text(&self, packet_id: &PacketId) -> Result<String, HandoffError> {
        let packet = self
            .packets
            .get(packet_id)
            .ok_or(HandoffError::PacketNotFound)?;

        let mut text = format!(
            "# Handoff Packet: {}\n\n\
             **Task:** {} ({} / {})\n\
             **State:** {:?}\n\
             **Created:** {}\n\n\
             ## Progress Summary\n{}\n\n",
            packet.task_title,
            packet.task_title,
            packet.task_id,
            packet.from_user,
            packet.task_state,
            packet.created_at.format("%Y-%m-%d %H:%M UTC"),
            packet.progress_summary
        );

        if let Some(ref focus) = packet.current_focus {
            text.push_str(&format!("## Current Focus\n{}\n\n", focus));
        }

        if !packet.blockers.is_empty() {
            text.push_str("## Blockers\n");
            for blocker in &packet.blockers {
                let status = if blocker.resolved { "[Resolved]" } else { "[Open]" };
                text.push_str(&format!("- {} {:?}: {}\n", status, blocker.blocker_type, blocker.description));
            }
            text.push_str("\n");
        }

        if !packet.next_steps.is_empty() {
            text.push_str("## Next Steps\n");
            for (i, step) in packet.next_steps.iter().enumerate() {
                text.push_str(&format!("{}. [{:?}] {}\n", i + 1, step.priority, step.description));
            }
            text.push_str("\n");
        }

        if !packet.references.is_empty() {
            text.push_str("## References\n");
            for reference in &packet.references {
                let location = reference.location.as_deref().unwrap_or("N/A");
                text.push_str(&format!("- [{:?}] {} - {}\n", reference.reference_type, reference.title, location));
            }
            text.push_str("\n");
        }

        if let Some(ref notes) = packet.notes {
            text.push_str(&format!("## Notes\n{}\n\n", notes));
        }

        Ok(text)
    }
}

impl Default for HandoffGenerator {
    fn default() -> Self {
        Self::new()
    }
}

/// History entry for handoff packets.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HandoffHistoryEntry {
    pub packet_id: PacketId,
    pub task_id: TaskId,
    pub created_at: DateTime<Utc>,
    pub from_user: String,
    pub to_user: Option<String>,
    pub state: HandoffState,
}

/// State of a handoff.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HandoffState {
    Pending,
    Acknowledged,
    Accepted,
    Declined,
    Expired,
}

/// Errors for handoff operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum HandoffError {
    PacketNotFound,
    InvalidState,
    AlreadyAcknowledged,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_context() -> SessionContext {
        SessionContext {
            total_time_minutes: 90,
            focus_sessions: 3,
            recent_activity: vec![ActivityEntry {
                timestamp: Utc::now(),
                description: "Working on authentication flow".to_string(),
                activity_type: ActivityType::Focus,
            }],
            decisions: vec!["Use JWT for auth".to_string()],
            touched_items: vec!["src/auth.rs".to_string()],
        }
    }

    #[test]
    fn test_generate_packet() {
        let mut generator = HandoffGenerator::new();
        let packet_id = generator.generate(
            "task-123".to_string(),
            "Implement authentication".to_string(),
            "alice".to_string(),
            HandoffTaskState::Paused,
            make_context(),
        );

        assert!(!packet_id.is_empty());

        let packet = generator.get_packet(&packet_id).unwrap();
        assert_eq!(packet.task_id, "task-123");
        assert_eq!(packet.from_user, "alice");
        assert_eq!(packet.task_state, HandoffTaskState::Paused);
    }

    #[test]
    fn test_progress_summary_includes_time() {
        let mut generator = HandoffGenerator::new();
        let packet_id = generator.generate(
            "task-123".to_string(),
            "Test task".to_string(),
            "alice".to_string(),
            HandoffTaskState::Paused,
            make_context(),
        );

        let packet = generator.get_packet(&packet_id).unwrap();
        assert!(packet.progress_summary.contains("1h 30m"));
        assert!(packet.progress_summary.contains("3 focus sessions"));
    }

    #[test]
    fn test_add_blocker() {
        let mut generator = HandoffGenerator::new();
        let packet_id = generator.generate(
            "task-123".to_string(),
            "Test task".to_string(),
            "alice".to_string(),
            HandoffTaskState::Blocked,
            make_context(),
        );

        let blocker = BlockerInfo {
            description: "Waiting for API key".to_string(),
            blocker_type: BlockerType::WaitingOnInfo,
            encountered_at: Utc::now(),
            resolved: false,
            resolution: None,
        };

        let result = generator.add_blocker(&packet_id, blocker);
        assert!(result.is_ok());

        let packet = generator.get_packet(&packet_id).unwrap();
        assert_eq!(packet.blockers.len(), 1);
    }

    #[test]
    fn test_add_reference() {
        let mut generator = HandoffGenerator::new();
        let packet_id = generator.generate(
            "task-123".to_string(),
            "Test task".to_string(),
            "alice".to_string(),
            HandoffTaskState::Paused,
            make_context(),
        );

        let reference = Reference {
            reference_type: ReferenceType::Documentation,
            title: "API Docs".to_string(),
            location: Some("https://api.example.com/docs".to_string()),
            relevance: Some("Authentication endpoints".to_string()),
        };

        let result = generator.add_reference(&packet_id, reference);
        assert!(result.is_ok());

        let packet = generator.get_packet(&packet_id).unwrap();
        assert_eq!(packet.references.len(), 1);
    }

    #[test]
    fn test_assign_and_acknowledge() {
        let mut generator = HandoffGenerator::new();
        let packet_id = generator.generate(
            "task-123".to_string(),
            "Test task".to_string(),
            "alice".to_string(),
            HandoffTaskState::Reassigned,
            make_context(),
        );

        // Assign
        let result = generator.assign(&packet_id, "bob".to_string());
        assert!(result.is_ok());

        let packet = generator.get_packet(&packet_id).unwrap();
        assert_eq!(packet.to_user, Some("bob".to_string()));

        // Acknowledge
        let result = generator.acknowledge(&packet_id, "bob".to_string());
        assert!(result.is_ok());

        let packet = generator.get_packet(&packet_id).unwrap();
        assert!(packet.acknowledged_at.is_some());
        assert_eq!(packet.acknowledged_by, Some("bob".to_string()));
    }

    #[test]
    fn test_get_packets_for_task() {
        let mut generator = HandoffGenerator::new();

        // Generate multiple packets for same task
        let id1 = generator.generate(
            "task-123".to_string(),
            "Test task".to_string(),
            "alice".to_string(),
            HandoffTaskState::Paused,
            make_context(),
        );
        let id2 = generator.generate(
            "task-123".to_string(),
            "Test task".to_string(),
            "bob".to_string(),
            HandoffTaskState::Reassigned,
            make_context(),
        );

        let packets = generator.get_packets_for_task(&"task-123".to_string());
        assert_eq!(packets.len(), 2);
    }

    #[test]
    fn test_search_history() {
        let mut generator = HandoffGenerator::new();

        generator.generate(
            "auth-task".to_string(),
            "Auth task".to_string(),
            "alice".to_string(),
            HandoffTaskState::Paused,
            make_context(),
        );
        generator.generate(
            "db-task".to_string(),
            "DB task".to_string(),
            "bob".to_string(),
            HandoffTaskState::Reassigned,
            make_context(),
        );

        let results = generator.search_history("alice");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].from_user, "alice");
    }

    #[test]
    fn test_export_as_text() {
        let mut generator = HandoffGenerator::new();
        let packet_id = generator.generate(
            "task-123".to_string(),
            "Implement authentication".to_string(),
            "alice".to_string(),
            HandoffTaskState::Paused,
            make_context(),
        );

        let text = generator.export_as_text(&packet_id).unwrap();

        assert!(text.contains("# Handoff Packet"));
        assert!(text.contains("Implement authentication"));
        assert!(text.contains("alice"));
        assert!(text.contains("Progress Summary"));
    }

    #[test]
    fn test_parent_chain() {
        let mut generator = HandoffGenerator::new();
        let packet_id = generator.generate(
            "task-123".to_string(),
            "Sub task".to_string(),
            "alice".to_string(),
            HandoffTaskState::Paused,
            make_context(),
        );

        let parent = TaskLink {
            task_id: "task-100".to_string(),
            title: "Parent task".to_string(),
            relationship: TaskRelationship::Parent,
        };

        let result = generator.add_parent(&packet_id, parent);
        assert!(result.is_ok());

        let packet = generator.get_packet(&packet_id).unwrap();
        assert_eq!(packet.parent_chain.len(), 1);
        assert_eq!(packet.parent_chain[0].relationship, TaskRelationship::Parent);
    }

    #[test]
    fn test_update_notes() {
        let mut generator = HandoffGenerator::new();
        let packet_id = generator.generate(
            "task-123".to_string(),
            "Test task".to_string(),
            "alice".to_string(),
            HandoffTaskState::Paused,
            make_context(),
        );

        let result = generator.update_notes(&packet_id, "Some additional context".to_string());
        assert!(result.is_ok());

        let packet = generator.get_packet(&packet_id).unwrap();
        assert_eq!(packet.notes, Some("Some additional context".to_string()));
    }
}
