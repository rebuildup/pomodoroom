//! Pair-focus sessions with shared contracts.
//!
//! This module supports pair/mob programming sessions where participants
//! share focus/break policies and coordinate their work sessions.

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

/// Unique identifier for a shared session room.
pub type RoomId = String;

/// Unique identifier for a participant.
pub type ParticipantId = String;

/// A shared session room for pair/mob focus sessions.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SharedSessionRoom {
    /// Unique room identifier
    pub id: RoomId,

    /// Room name/title
    pub name: String,

    /// Room creator
    pub creator_id: ParticipantId,

    /// Shared policy for the room
    pub policy: SharedPolicy,

    /// Current room state
    pub state: RoomState,

    /// All participants (active and inactive)
    pub participants: HashMap<ParticipantId, Participant>,

    /// Room creation timestamp
    pub created_at: DateTime<Utc>,

    /// Session start time (when focus began)
    pub session_started_at: Option<DateTime<Utc>>,

    /// Session end time
    pub session_ended_at: Option<DateTime<Utc>>,
}

/// State of a shared session room.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RoomState {
    /// Room created, waiting for participants to join
    Waiting,

    /// Actively in a focus session
    FocusActive,

    /// On a break
    BreakActive,

    /// Session paused
    Paused,

    /// Session ended
    Ended,
}

/// Shared policy for a session room.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SharedPolicy {
    /// Focus duration in minutes
    pub focus_duration_minutes: i64,

    /// Break duration in minutes
    pub break_duration_minutes: i64,

    /// Number of focus cycles before a long break
    pub cycles_before_long_break: u32,

    /// Long break duration in minutes
    pub long_break_minutes: i64,

    /// Require consensus to start/break
    pub require_consensus: bool,

    /// Minimum participants required for session
    pub min_participants: u32,

    /// Allow individual opt-out
    pub allow_opt_out: bool,
}

impl Default for SharedPolicy {
    fn default() -> Self {
        Self {
            focus_duration_minutes: 25,
            break_duration_minutes: 5,
            cycles_before_long_break: 4,
            long_break_minutes: 15,
            require_consensus: false,
            min_participants: 2,
            allow_opt_out: true,
        }
    }
}

/// A participant in a shared session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Participant {
    /// Unique participant identifier
    pub id: ParticipantId,

    /// Display name
    pub name: String,

    /// Current participation status
    pub status: ParticipantStatus,

    /// Time joined the room
    pub joined_at: DateTime<Utc>,

    /// Time left the room (if applicable)
    pub left_at: Option<DateTime<Utc>>,

    /// Current vote (if consensus required)
    pub vote: Option<Vote>,

    /// Opt-out records
    pub opt_outs: Vec<OptOutRecord>,
}

/// Participation status of a participant.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ParticipantStatus {
    /// Actively participating
    Active,

    /// Temporarily stepped away
    Away,

    /// Opted out of current phase
    OptedOut,

    /// Left the room
    Left,
}

/// A vote for consensus decisions.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Vote {
    /// Agree to proceed
    Agree,

    /// Disagree / need more time
    Disagree,

    /// No vote cast yet
    Pending,
}

impl Default for Vote {
    fn default() -> Self {
        Vote::Pending
    }
}

/// Record of a participant opting out.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptOutRecord {
    /// Unique record ID
    pub id: String,

    /// Participant who opted out
    pub participant_id: ParticipantId,

    /// Reason for opt-out
    pub reason: OptOutReason,

    /// When the opt-out occurred
    pub timestamp: DateTime<Utc>,

    /// Which phase was opted out of
    pub phase: SessionPhase,

    /// Duration of opt-out (if temporary)
    pub duration_minutes: Option<i64>,
}

/// Reasons for opting out.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OptOutReason {
    /// Need to handle urgent task
    UrgentTask,

    /// Personal break needed
    PersonalBreak,

    /// Meeting conflict
    Meeting,

    /// Technical issues
    TechnicalIssue,

    /// Other reason (with description)
    Other(String),
}

/// Phase of the session.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionPhase {
    Focus,
    ShortBreak,
    LongBreak,
}

/// Attendance timeline entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttendanceEntry {
    /// Participant ID
    pub participant_id: ParticipantId,

    /// Participant name
    pub participant_name: String,

    /// Event type
    pub event: AttendanceEvent,

    /// When the event occurred
    pub timestamp: DateTime<Utc>,
}

/// Attendance event types.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AttendanceEvent {
    Joined,
    Left,
    Away,
    Returned,
    OptedOut,
    Rejoined,
}

/// Session summary with attendance timeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSummary {
    /// Room ID
    pub room_id: RoomId,

    /// Room name
    pub room_name: String,

    /// Session start time
    pub started_at: DateTime<Utc>,

    /// Session end time
    pub ended_at: DateTime<Utc>,

    /// Total focus time (minutes)
    pub total_focus_minutes: i64,

    /// Total break time (minutes)
    pub total_break_minutes: i64,

    /// Number of completed cycles
    pub completed_cycles: u32,

    /// Attendance timeline
    pub attendance: Vec<AttendanceEntry>,

    /// Final participant states
    pub final_participants: Vec<ParticipantSummary>,
}

/// Summary of a participant's session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParticipantSummary {
    pub id: ParticipantId,
    pub name: String,
    pub total_focus_minutes: i64,
    pub total_break_minutes: i64,
    pub opt_out_count: usize,
}

/// Manager for shared session rooms.
pub struct PairFocusManager {
    rooms: HashMap<RoomId, SharedSessionRoom>,
    attendance_logs: HashMap<RoomId, Vec<AttendanceEntry>>,
}

impl PairFocusManager {
    /// Create a new manager.
    pub fn new() -> Self {
        Self {
            rooms: HashMap::new(),
            attendance_logs: HashMap::new(),
        }
    }

    /// Create a new room.
    pub fn create_room(
        &mut self,
        name: String,
        creator_id: ParticipantId,
        creator_name: String,
        policy: SharedPolicy,
    ) -> RoomId {
        let room_id = Uuid::new_v4().to_string();
        let now = Utc::now();

        let mut participants = HashMap::new();
        participants.insert(
            creator_id.clone(),
            Participant {
                id: creator_id.clone(),
                name: creator_name,
                status: ParticipantStatus::Active,
                joined_at: now,
                left_at: None,
                vote: Some(Vote::Pending),
                opt_outs: Vec::new(),
            },
        );

        let room = SharedSessionRoom {
            id: room_id.clone(),
            name,
            creator_id: creator_id.clone(),
            policy,
            state: RoomState::Waiting,
            participants,
            created_at: now,
            session_started_at: None,
            session_ended_at: None,
        };

        self.rooms.insert(room_id.clone(), room);
        self.attendance_logs.insert(room_id.clone(), Vec::new());

        room_id
    }

    /// Join a room.
    pub fn join_room(
        &mut self,
        room_id: &RoomId,
        participant_id: ParticipantId,
        participant_name: String,
    ) -> Result<(), PairFocusError> {
        let room = self.rooms.get_mut(room_id).ok_or(PairFocusError::RoomNotFound)?;

        if room.state == RoomState::Ended {
            return Err(PairFocusError::SessionEnded);
        }

        let now = Utc::now();
        room.participants.insert(
            participant_id.clone(),
            Participant {
                id: participant_id.clone(),
                name: participant_name,
                status: ParticipantStatus::Active,
                joined_at: now,
                left_at: None,
                vote: Some(Vote::Pending),
                opt_outs: Vec::new(),
            },
        );

        // Log attendance
        if let Some(log) = self.attendance_logs.get_mut(room_id) {
            log.push(AttendanceEntry {
                participant_id: participant_id.clone(),
                participant_name: room.participants.get(&participant_id).unwrap().name.clone(),
                event: AttendanceEvent::Joined,
                timestamp: now,
            });
        }

        Ok(())
    }

    /// Leave a room.
    pub fn leave_room(
        &mut self,
        room_id: &RoomId,
        participant_id: &ParticipantId,
    ) -> Result<(), PairFocusError> {
        let room = self.rooms.get_mut(room_id).ok_or(PairFocusError::RoomNotFound)?;

        let participant = room
            .participants
            .get_mut(participant_id)
            .ok_or(PairFocusError::ParticipantNotFound)?;

        let now = Utc::now();
        participant.status = ParticipantStatus::Left;
        participant.left_at = Some(now);

        // Log attendance
        if let Some(log) = self.attendance_logs.get_mut(room_id) {
            log.push(AttendanceEntry {
                participant_id: participant_id.clone(),
                participant_name: participant.name.clone(),
                event: AttendanceEvent::Left,
                timestamp: now,
            });
        }

        Ok(())
    }

    /// Cast a vote for consensus.
    pub fn cast_vote(
        &mut self,
        room_id: &RoomId,
        participant_id: &ParticipantId,
        vote: Vote,
    ) -> Result<(), PairFocusError> {
        let room = self.rooms.get_mut(room_id).ok_or(PairFocusError::RoomNotFound)?;

        let participant = room
            .participants
            .get_mut(participant_id)
            .ok_or(PairFocusError::ParticipantNotFound)?;

        participant.vote = Some(vote);
        Ok(())
    }

    /// Check if consensus is reached.
    pub fn check_consensus(&self, room_id: &RoomId) -> Result<bool, PairFocusError> {
        let room = self.rooms.get(room_id).ok_or(PairFocusError::RoomNotFound)?;

        if !room.policy.require_consensus {
            return Ok(true);
        }

        let active_participants: Vec<_> = room
            .participants
            .values()
            .filter(|p| p.status == ParticipantStatus::Active)
            .collect();

        if active_participants.is_empty() {
            return Ok(false);
        }

        // Check if all active participants have agreed
        Ok(active_participants.iter().all(|p| p.vote == Some(Vote::Agree)))
    }

    /// Start a focus session.
    pub fn start_focus(&mut self, room_id: &RoomId) -> Result<(), PairFocusError> {
        // First check consensus if required (using immutable borrow)
        let require_consensus = {
            let room = self.rooms.get(room_id).ok_or(PairFocusError::RoomNotFound)?;
            room.policy.require_consensus
        };

        if require_consensus && !self.check_consensus(room_id)? {
            return Err(PairFocusError::ConsensusNotReached);
        }

        // Now use mutable borrow
        let room = self.rooms.get_mut(room_id).ok_or(PairFocusError::RoomNotFound)?;

        // Check minimum participants
        let active_count = room
            .participants
            .values()
            .filter(|p| p.status == ParticipantStatus::Active)
            .count();

        if (active_count as u32) < room.policy.min_participants {
            return Err(PairFocusError::NotEnoughParticipants);
        }

        room.state = RoomState::FocusActive;
        room.session_started_at = Some(Utc::now());

        // Reset votes
        for participant in room.participants.values_mut() {
            participant.vote = Some(Vote::Pending);
        }

        Ok(())
    }

    /// Start a break.
    pub fn start_break(&mut self, room_id: &RoomId, is_long_break: bool) -> Result<(), PairFocusError> {
        // First check consensus if required (using immutable borrow)
        let (require_consensus, is_focus_active) = {
            let room = self.rooms.get(room_id).ok_or(PairFocusError::RoomNotFound)?;
            (room.policy.require_consensus, room.state == RoomState::FocusActive)
        };

        if !is_focus_active {
            return Err(PairFocusError::NotInFocusSession);
        }

        if require_consensus && !self.check_consensus(room_id)? {
            return Err(PairFocusError::ConsensusNotReached);
        }

        // Now use mutable borrow
        let room = self.rooms.get_mut(room_id).ok_or(PairFocusError::RoomNotFound)?;

        room.state = if is_long_break {
            RoomState::BreakActive // Could have separate state for long break
        } else {
            RoomState::BreakActive
        };

        // Reset votes
        for participant in room.participants.values_mut() {
            participant.vote = Some(Vote::Pending);
        }

        Ok(())
    }

    /// Opt out of current phase.
    pub fn opt_out(
        &mut self,
        room_id: &RoomId,
        participant_id: &ParticipantId,
        reason: OptOutReason,
        phase: SessionPhase,
        duration_minutes: Option<i64>,
    ) -> Result<(), PairFocusError> {
        let room = self.rooms.get_mut(room_id).ok_or(PairFocusError::RoomNotFound)?;

        if !room.policy.allow_opt_out {
            return Err(PairFocusError::OptOutNotAllowed);
        }

        let participant = room
            .participants
            .get_mut(participant_id)
            .ok_or(PairFocusError::ParticipantNotFound)?;

        let opt_out = OptOutRecord {
            id: Uuid::new_v4().to_string(),
            participant_id: participant_id.clone(),
            reason,
            timestamp: Utc::now(),
            phase,
            duration_minutes,
        };

        participant.opt_outs.push(opt_out);
        participant.status = ParticipantStatus::OptedOut;

        // Log attendance
        if let Some(log) = self.attendance_logs.get_mut(room_id) {
            log.push(AttendanceEntry {
                participant_id: participant_id.clone(),
                participant_name: participant.name.clone(),
                event: AttendanceEvent::OptedOut,
                timestamp: Utc::now(),
            });
        }

        Ok(())
    }

    /// Rejoin after opt-out.
    pub fn rejoin(
        &mut self,
        room_id: &RoomId,
        participant_id: &ParticipantId,
    ) -> Result<(), PairFocusError> {
        let room = self.rooms.get_mut(room_id).ok_or(PairFocusError::RoomNotFound)?;

        let participant = room
            .participants
            .get_mut(participant_id)
            .ok_or(PairFocusError::ParticipantNotFound)?;

        if participant.status != ParticipantStatus::OptedOut {
            return Err(PairFocusError::NotOptedOut);
        }

        participant.status = ParticipantStatus::Active;

        // Log attendance
        if let Some(log) = self.attendance_logs.get_mut(room_id) {
            log.push(AttendanceEntry {
                participant_id: participant_id.clone(),
                participant_name: participant.name.clone(),
                event: AttendanceEvent::Rejoined,
                timestamp: Utc::now(),
            });
        }

        Ok(())
    }

    /// End a session.
    pub fn end_session(&mut self, room_id: &RoomId) -> Result<SessionSummary, PairFocusError> {
        let room = self.rooms.get_mut(room_id).ok_or(PairFocusError::RoomNotFound)?;

        room.state = RoomState::Ended;
        room.session_ended_at = Some(Utc::now());

        let start = room.session_started_at.unwrap_or(room.created_at);
        let end = room.session_ended_at.unwrap_or(Utc::now());

        // Calculate focus/break time (simplified)
        let total_minutes = (end - start).num_minutes().max(0);
        let cycle_minutes = room.policy.focus_duration_minutes + room.policy.break_duration_minutes;
        let completed_cycles = (total_minutes / cycle_minutes) as u32;
        let total_focus_minutes = completed_cycles as i64 * room.policy.focus_duration_minutes;
        let total_break_minutes = completed_cycles as i64 * room.policy.break_duration_minutes;

        let attendance = self.attendance_logs.get(room_id).cloned().unwrap_or_default();

        let final_participants: Vec<ParticipantSummary> = room
            .participants
            .values()
            .map(|p| {
                let focus_time = if p.status == ParticipantStatus::Active
                    || p.status == ParticipantStatus::Left
                {
                    total_focus_minutes
                } else {
                    0
                };
                ParticipantSummary {
                    id: p.id.clone(),
                    name: p.name.clone(),
                    total_focus_minutes: focus_time,
                    total_break_minutes: total_break_minutes,
                    opt_out_count: p.opt_outs.len(),
                }
            })
            .collect();

        Ok(SessionSummary {
            room_id: room.id.clone(),
            room_name: room.name.clone(),
            started_at: start,
            ended_at: end,
            total_focus_minutes,
            total_break_minutes,
            completed_cycles,
            attendance,
            final_participants,
        })
    }

    /// Get room by ID.
    pub fn get_room(&self, room_id: &RoomId) -> Option<&SharedSessionRoom> {
        self.rooms.get(room_id)
    }

    /// Propagate policy to all participants.
    pub fn propagate_policy(&mut self, room_id: &RoomId, policy: SharedPolicy) -> Result<(), PairFocusError> {
        let room = self.rooms.get_mut(room_id).ok_or(PairFocusError::RoomNotFound)?;
        room.policy = policy;
        Ok(())
    }
}

impl Default for PairFocusManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Errors for pair-focus sessions.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PairFocusError {
    RoomNotFound,
    ParticipantNotFound,
    SessionEnded,
    NotEnoughParticipants,
    ConsensusNotReached,
    NotInFocusSession,
    OptOutNotAllowed,
    NotOptedOut,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_manager() -> PairFocusManager {
        PairFocusManager::new()
    }

    #[test]
    fn test_create_room() {
        let mut manager = make_manager();
        let room_id = manager.create_room(
            "Test Room".to_string(),
            "user1".to_string(),
            "Alice".to_string(),
            SharedPolicy::default(),
        );

        assert!(!room_id.is_empty());
        assert!(manager.get_room(&room_id).is_some());
        assert_eq!(manager.get_room(&room_id).unwrap().participants.len(), 1);
    }

    #[test]
    fn test_join_room() {
        let mut manager = make_manager();
        let room_id = manager.create_room(
            "Test Room".to_string(),
            "user1".to_string(),
            "Alice".to_string(),
            SharedPolicy::default(),
        );

        let result = manager.join_room(&room_id, "user2".to_string(), "Bob".to_string());
        assert!(result.is_ok());
        assert_eq!(manager.get_room(&room_id).unwrap().participants.len(), 2);
    }

    #[test]
    fn test_join_nonexistent_room() {
        let mut manager = make_manager();
        let result = manager.join_room(&"nonexistent".to_string(), "user1".to_string(), "Alice".to_string());
        assert!(matches!(result, Err(PairFocusError::RoomNotFound)));
    }

    #[test]
    fn test_leave_room() {
        let mut manager = make_manager();
        let room_id = manager.create_room(
            "Test Room".to_string(),
            "user1".to_string(),
            "Alice".to_string(),
            SharedPolicy::default(),
        );
        manager.join_room(&room_id, "user2".to_string(), "Bob".to_string()).unwrap();

        let result = manager.leave_room(&room_id, &"user2".to_string());
        assert!(result.is_ok());

        let room = manager.get_room(&room_id).unwrap();
        let participant = room.participants.get("user2").unwrap();
        assert_eq!(participant.status, ParticipantStatus::Left);
    }

    #[test]
    fn test_start_focus_requires_minimum_participants() {
        let mut manager = make_manager();
        let policy = SharedPolicy {
            min_participants: 2,
            ..Default::default()
        };
        let room_id = manager.create_room(
            "Test Room".to_string(),
            "user1".to_string(),
            "Alice".to_string(),
            policy,
        );

        // Only 1 participant
        let result = manager.start_focus(&room_id);
        assert!(matches!(result, Err(PairFocusError::NotEnoughParticipants)));

        // Add second participant
        manager.join_room(&room_id, "user2".to_string(), "Bob".to_string()).unwrap();
        let result = manager.start_focus(&room_id);
        assert!(result.is_ok());
    }

    #[test]
    fn test_consensus_required() {
        let mut manager = make_manager();
        let policy = SharedPolicy {
            require_consensus: true,
            ..Default::default()
        };
        let room_id = manager.create_room(
            "Test Room".to_string(),
            "user1".to_string(),
            "Alice".to_string(),
            policy,
        );
        manager.join_room(&room_id, "user2".to_string(), "Bob".to_string()).unwrap();

        // Without votes
        let result = manager.start_focus(&room_id);
        assert!(matches!(result, Err(PairFocusError::ConsensusNotReached)));

        // Cast agreeing votes
        manager.cast_vote(&room_id, &"user1".to_string(), Vote::Agree).unwrap();
        manager.cast_vote(&room_id, &"user2".to_string(), Vote::Agree).unwrap();

        let result = manager.start_focus(&room_id);
        assert!(result.is_ok());
    }

    #[test]
    fn test_opt_out() {
        let mut manager = make_manager();
        let room_id = manager.create_room(
            "Test Room".to_string(),
            "user1".to_string(),
            "Alice".to_string(),
            SharedPolicy::default(),
        );
        manager.join_room(&room_id, "user2".to_string(), "Bob".to_string()).unwrap();
        manager.start_focus(&room_id).unwrap();

        let result = manager.opt_out(
            &room_id,
            &"user2".to_string(),
            OptOutReason::PersonalBreak,
            SessionPhase::Focus,
            Some(5),
        );
        assert!(result.is_ok());

        let room = manager.get_room(&room_id).unwrap();
        let participant = room.participants.get("user2").unwrap();
        assert_eq!(participant.status, ParticipantStatus::OptedOut);
        assert_eq!(participant.opt_outs.len(), 1);
    }

    #[test]
    fn test_opt_out_not_allowed() {
        let mut manager = make_manager();
        let policy = SharedPolicy {
            allow_opt_out: false,
            ..Default::default()
        };
        let room_id = manager.create_room(
            "Test Room".to_string(),
            "user1".to_string(),
            "Alice".to_string(),
            policy,
        );
        manager.join_room(&room_id, "user2".to_string(), "Bob".to_string()).unwrap();
        manager.start_focus(&room_id).unwrap();

        let result = manager.opt_out(
            &room_id,
            &"user2".to_string(),
            OptOutReason::PersonalBreak,
            SessionPhase::Focus,
            None,
        );
        assert!(matches!(result, Err(PairFocusError::OptOutNotAllowed)));
    }

    #[test]
    fn test_rejoin() {
        let mut manager = make_manager();
        let room_id = manager.create_room(
            "Test Room".to_string(),
            "user1".to_string(),
            "Alice".to_string(),
            SharedPolicy::default(),
        );
        manager.join_room(&room_id, "user2".to_string(), "Bob".to_string()).unwrap();
        manager.start_focus(&room_id).unwrap();
        manager.opt_out(
            &room_id,
            &"user2".to_string(),
            OptOutReason::PersonalBreak,
            SessionPhase::Focus,
            None,
        ).unwrap();

        let result = manager.rejoin(&room_id, &"user2".to_string());
        assert!(result.is_ok());

        let room = manager.get_room(&room_id).unwrap();
        let participant = room.participants.get("user2").unwrap();
        assert_eq!(participant.status, ParticipantStatus::Active);
    }

    #[test]
    fn test_end_session() {
        let mut manager = make_manager();
        let room_id = manager.create_room(
            "Test Room".to_string(),
            "user1".to_string(),
            "Alice".to_string(),
            SharedPolicy::default(),
        );
        manager.join_room(&room_id, "user2".to_string(), "Bob".to_string()).unwrap();
        manager.start_focus(&room_id).unwrap();

        let result = manager.end_session(&room_id);
        assert!(result.is_ok());

        let summary = result.unwrap();
        assert!(!summary.attendance.is_empty());
        assert_eq!(summary.final_participants.len(), 2);
    }

    #[test]
    fn test_propagate_policy() {
        let mut manager = make_manager();
        let room_id = manager.create_room(
            "Test Room".to_string(),
            "user1".to_string(),
            "Alice".to_string(),
            SharedPolicy::default(),
        );

        let new_policy = SharedPolicy {
            focus_duration_minutes: 50,
            ..Default::default()
        };
        let result = manager.propagate_policy(&room_id, new_policy.clone());
        assert!(result.is_ok());

        let room = manager.get_room(&room_id).unwrap();
        assert_eq!(room.policy.focus_duration_minutes, 50);
    }

    #[test]
    fn test_attendance_timeline_includes_events() {
        let mut manager = make_manager();
        let room_id = manager.create_room(
            "Test Room".to_string(),
            "user1".to_string(),
            "Alice".to_string(),
            SharedPolicy::default(),
        );
        manager.join_room(&room_id, "user2".to_string(), "Bob".to_string()).unwrap();
        manager.start_focus(&room_id).unwrap();
        manager.opt_out(
            &room_id,
            &"user2".to_string(),
            OptOutReason::PersonalBreak,
            SessionPhase::Focus,
            None,
        ).unwrap();
        manager.rejoin(&room_id, &"user2".to_string()).unwrap();

        let summary = manager.end_session(&room_id).unwrap();

        // Should have join events for both users + opt-out + rejoin
        assert!(summary.attendance.iter().any(|e| matches!(e.event, AttendanceEvent::Joined)));
        assert!(summary.attendance.iter().any(|e| matches!(e.event, AttendanceEvent::OptedOut)));
        assert!(summary.attendance.iter().any(|e| matches!(e.event, AttendanceEvent::Rejoined)));
    }
}
