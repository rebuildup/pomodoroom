//! Guided onboarding calibration wizard for new users.
//!
//! This module provides:
//! - Interactive question flow for task mix, interruptions, energy patterns
//! - Starter profile generation from responses
//! - Wizard re-run capability from settings

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Unique identifier for a wizard session.
pub type SessionId = String;

/// A question in the onboarding wizard.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WizardQuestion {
    /// Unique identifier for the question.
    pub id: String,
    /// Question text.
    pub text: String,
    /// Available choices.
    pub choices: Vec<QuestionChoice>,
    /// Whether this question can be skipped.
    pub skippable: bool,
    /// Help text (optional).
    pub help: Option<String>,
    /// Question category.
    pub category: QuestionCategory,
}

/// A choice option for a question.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionChoice {
    /// Choice identifier.
    pub id: String,
    /// Display text.
    pub text: String,
    /// Score adjustments when this choice is selected.
    pub score_adjustments: ScoreAdjustments,
}

/// Score adjustments for profile generation.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ScoreAdjustments {
    /// Focus duration adjustment (minutes).
    pub focus_duration_delta: i32,
    /// Short break duration adjustment (minutes).
    pub short_break_delta: i32,
    /// Long break duration adjustment (minutes).
    pub long_break_delta: i32,
    /// Daily pomodoro target adjustment.
    pub daily_target_delta: i32,
    /// Tolerance for interruptions (0-100).
    pub interruption_tolerance: Option<i32>,
    /// Energy curve type preference.
    pub energy_curve: Option<EnergyCurveType>,
}

/// Category of wizard question.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum QuestionCategory {
    /// Questions about task types.
    TaskMix,
    /// Questions about interruption patterns.
    Interruptions,
    /// Questions about energy patterns.
    EnergyPattern,
    /// Questions about work schedule.
    Schedule,
    /// Intro/outro questions.
    General,
}

/// Type of energy curve preference.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum EnergyCurveType {
    /// Peak performance in the morning.
    MorningPeak,
    /// Peak performance in the afternoon.
    AfternoonPeak,
    /// Peak performance in the evening.
    EveningPeak,
    /// Relatively flat energy throughout the day.
    #[default]
    Flat,
}

/// Response to a wizard question.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionResponse {
    /// Question ID.
    pub question_id: String,
    /// Selected choice ID (None if skipped).
    pub choice_id: Option<String>,
    /// Timestamp of response.
    pub responded_at: DateTime<Utc>,
}

/// A wizard session tracking progress.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WizardSession {
    /// Unique session identifier.
    pub id: SessionId,
    /// When the session was started.
    pub started_at: DateTime<Utc>,
    /// When the session was completed (if finished).
    pub completed_at: Option<DateTime<Utc>>,
    /// Current question index.
    pub current_index: usize,
    /// All responses so far.
    pub responses: Vec<QuestionResponse>,
    /// Whether the user chose to skip the wizard.
    pub skipped: bool,
    /// Generated profile (after completion).
    pub generated_profile: Option<StarterProfile>,
}

impl WizardSession {
    /// Create a new wizard session.
    pub fn new() -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            started_at: Utc::now(),
            completed_at: None,
            current_index: 0,
            responses: Vec::new(),
            skipped: false,
            generated_profile: None,
        }
    }

    /// Check if the session is complete.
    pub fn is_complete(&self) -> bool {
        self.completed_at.is_some() || self.skipped
    }

    /// Get total time spent in the wizard.
    pub fn duration_seconds(&self) -> i64 {
        let end = self.completed_at.unwrap_or_else(Utc::now);
        (end - self.started_at).num_seconds()
    }

    /// Check if the wizard was completed within the target time.
    pub fn is_within_target_time(&self) -> bool {
        self.duration_seconds() <= 180 // 3 minutes = 180 seconds
    }
}

impl Default for WizardSession {
    fn default() -> Self {
        Self::new()
    }
}

/// The generated starter profile from the wizard.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StarterProfile {
    /// Focus duration in minutes.
    pub focus_duration: u32,
    /// Short break duration in minutes.
    pub short_break_duration: u32,
    /// Long break duration in minutes.
    pub long_break_duration: u32,
    /// Daily pomodoro target.
    pub daily_target: u32,
    /// Long break interval (pomodoros between long breaks).
    pub long_break_interval: u32,
    /// Energy curve type.
    pub energy_curve: EnergyCurveType,
    /// Interruption tolerance level.
    pub interruption_tolerance: u32,
    /// Suggested work hours.
    pub suggested_work_hours: u32,
    /// Profile name.
    pub name: String,
    /// Profile description.
    pub description: String,
    /// Confidence score (0-100).
    pub confidence: u32,
    /// Based on response count.
    pub based_on_responses: usize,
}

impl Default for StarterProfile {
    fn default() -> Self {
        Self {
            focus_duration: 25,
            short_break_duration: 5,
            long_break_duration: 15,
            daily_target: 8,
            long_break_interval: 4,
            energy_curve: EnergyCurveType::default(),
            interruption_tolerance: 50,
            suggested_work_hours: 8,
            name: "Default Profile".to_string(),
            description: "Standard Pomodoro settings".to_string(),
            confidence: 50,
            based_on_responses: 0,
        }
    }
}

/// Manager for the onboarding wizard.
#[derive(Debug, Clone)]
pub struct OnboardingWizard {
    /// All questions in the wizard.
    questions: Vec<WizardQuestion>,
    /// Active sessions.
    sessions: HashMap<SessionId, WizardSession>,
    /// Configuration.
    config: WizardConfig,
}

/// Configuration for the wizard.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WizardConfig {
    /// Target completion time in seconds.
    pub target_time_seconds: u32,
    /// Minimum questions to answer (others can be skipped).
    pub min_questions: usize,
    /// Whether to allow full skip.
    pub allow_skip: bool,
}

impl Default for WizardConfig {
    fn default() -> Self {
        Self {
            target_time_seconds: 180, // 3 minutes
            min_questions: 3,
            allow_skip: true,
        }
    }
}

/// Error type for wizard operations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WizardError {
    /// Session not found.
    SessionNotFound(SessionId),
    /// Invalid question index.
    InvalidQuestionIndex(usize),
    /// Invalid choice for question.
    InvalidChoice(String, String),
    /// Session already complete.
    AlreadyComplete(SessionId),
    /// Question cannot be skipped.
    CannotSkip(String),
    /// Not enough responses to generate profile.
    InsufficientResponses(usize, usize),
}

impl std::fmt::Display for WizardError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WizardError::SessionNotFound(id) => write!(f, "Session not found: {}", id),
            WizardError::InvalidQuestionIndex(idx) => write!(f, "Invalid question index: {}", idx),
            WizardError::InvalidChoice(q, c) => write!(f, "Invalid choice {} for question {}", c, q),
            WizardError::AlreadyComplete(id) => write!(f, "Session already complete: {}", id),
            WizardError::CannotSkip(q) => write!(f, "Question {} cannot be skipped", q),
            WizardError::InsufficientResponses(have, need) => {
                write!(f, "Need {} responses, got {}", need, have)
            }
        }
    }
}

impl std::error::Error for WizardError {}

impl OnboardingWizard {
    /// Create a new wizard with default questions.
    pub fn new() -> Self {
        Self {
            questions: Self::create_default_questions(),
            sessions: HashMap::new(),
            config: WizardConfig::default(),
        }
    }

    /// Create a wizard with custom config.
    pub fn with_config(config: WizardConfig) -> Self {
        Self {
            questions: Self::create_default_questions(),
            sessions: HashMap::new(),
            config,
        }
    }

    /// Create the default question set.
    fn create_default_questions() -> Vec<WizardQuestion> {
        vec![
            // Task Mix Questions
            WizardQuestion {
                id: "task_mix_primary".to_string(),
                text: "What type of work do you do most?".to_string(),
                choices: vec![
                    QuestionChoice {
                        id: "coding".to_string(),
                        text: "Software development / Coding".to_string(),
                        score_adjustments: ScoreAdjustments {
                            focus_duration_delta: 10,
                            long_break_delta: 5,
                            ..Default::default()
                        },
                    },
                    QuestionChoice {
                        id: "writing".to_string(),
                        text: "Writing / Content creation".to_string(),
                        score_adjustments: ScoreAdjustments {
                            focus_duration_delta: 5,
                            ..Default::default()
                        },
                    },
                    QuestionChoice {
                        id: "meetings".to_string(),
                        text: "Meetings / Communication".to_string(),
                        score_adjustments: ScoreAdjustments {
                            focus_duration_delta: -10,
                            short_break_delta: 2,
                            ..Default::default()
                        },
                    },
                    QuestionChoice {
                        id: "analysis".to_string(),
                        text: "Analysis / Research".to_string(),
                        score_adjustments: ScoreAdjustments {
                            focus_duration_delta: 15,
                            long_break_delta: 10,
                            ..Default::default()
                        },
                    },
                ],
                skippable: false,
                help: Some("This helps us understand your focus needs".to_string()),
                category: QuestionCategory::TaskMix,
            },
            WizardQuestion {
                id: "task_complexity".to_string(),
                text: "How complex are your typical tasks?".to_string(),
                choices: vec![
                    QuestionChoice {
                        id: "simple".to_string(),
                        text: "Simple, repetitive tasks".to_string(),
                        score_adjustments: ScoreAdjustments {
                            focus_duration_delta: -5,
                            daily_target_delta: 2,
                            ..Default::default()
                        },
                    },
                    QuestionChoice {
                        id: "moderate".to_string(),
                        text: "Moderate complexity".to_string(),
                        score_adjustments: ScoreAdjustments::default(),
                    },
                    QuestionChoice {
                        id: "complex".to_string(),
                        text: "Highly complex, deep thinking".to_string(),
                        score_adjustments: ScoreAdjustments {
                            focus_duration_delta: 15,
                            long_break_delta: 10,
                            daily_target_delta: -2,
                            ..Default::default()
                        },
                    },
                ],
                skippable: true,
                help: None,
                category: QuestionCategory::TaskMix,
            },
            // Interruption Questions
            WizardQuestion {
                id: "interruption_frequency".to_string(),
                text: "How often are you interrupted during work?".to_string(),
                choices: vec![
                    QuestionChoice {
                        id: "rarely".to_string(),
                        text: "Rarely (1-2 times per day)".to_string(),
                        score_adjustments: ScoreAdjustments {
                            focus_duration_delta: 10,
                            interruption_tolerance: Some(20),
                            ..Default::default()
                        },
                    },
                    QuestionChoice {
                        id: "sometimes".to_string(),
                        text: "Sometimes (3-5 times per day)".to_string(),
                        score_adjustments: ScoreAdjustments {
                            interruption_tolerance: Some(50),
                            ..Default::default()
                        },
                    },
                    QuestionChoice {
                        id: "often".to_string(),
                        text: "Often (6-10 times per day)".to_string(),
                        score_adjustments: ScoreAdjustments {
                            focus_duration_delta: -5,
                            short_break_delta: 2,
                            interruption_tolerance: Some(80),
                            ..Default::default()
                        },
                    },
                    QuestionChoice {
                        id: "constantly".to_string(),
                        text: "Constantly (10+ times per day)".to_string(),
                        score_adjustments: ScoreAdjustments {
                            focus_duration_delta: -10,
                            short_break_delta: 5,
                            daily_target_delta: -2,
                            interruption_tolerance: Some(100),
                            ..Default::default()
                        },
                    },
                ],
                skippable: false,
                help: Some("Includes messages, calls, and in-person interruptions".to_string()),
                category: QuestionCategory::Interruptions,
            },
            WizardQuestion {
                id: "interruption_handling".to_string(),
                text: "How do you usually handle interruptions?".to_string(),
                choices: vec![
                    QuestionChoice {
                        id: "ignore".to_string(),
                        text: "I try to ignore them and continue".to_string(),
                        score_adjustments: ScoreAdjustments {
                            focus_duration_delta: 5,
                            ..Default::default()
                        },
                    },
                    QuestionChoice {
                        id: "pause".to_string(),
                        text: "I pause and resume after handling".to_string(),
                        score_adjustments: ScoreAdjustments::default(),
                    },
                    QuestionChoice {
                        id: "stop".to_string(),
                        text: "I stop the timer and restart later".to_string(),
                        score_adjustments: ScoreAdjustments {
                            focus_duration_delta: -5,
                            ..Default::default()
                        },
                    },
                ],
                skippable: true,
                help: None,
                category: QuestionCategory::Interruptions,
            },
            // Energy Pattern Questions
            WizardQuestion {
                id: "energy_peak".to_string(),
                text: "When do you feel most productive?".to_string(),
                choices: vec![
                    QuestionChoice {
                        id: "morning".to_string(),
                        text: "Morning (6am - 12pm)".to_string(),
                        score_adjustments: ScoreAdjustments {
                            energy_curve: Some(EnergyCurveType::MorningPeak),
                            ..Default::default()
                        },
                    },
                    QuestionChoice {
                        id: "afternoon".to_string(),
                        text: "Afternoon (12pm - 6pm)".to_string(),
                        score_adjustments: ScoreAdjustments {
                            energy_curve: Some(EnergyCurveType::AfternoonPeak),
                            ..Default::default()
                        },
                    },
                    QuestionChoice {
                        id: "evening".to_string(),
                        text: "Evening (6pm - 12am)".to_string(),
                        score_adjustments: ScoreAdjustments {
                            energy_curve: Some(EnergyCurveType::EveningPeak),
                            ..Default::default()
                        },
                    },
                    QuestionChoice {
                        id: "varies".to_string(),
                        text: "It varies / No clear pattern".to_string(),
                        score_adjustments: ScoreAdjustments {
                            energy_curve: Some(EnergyCurveType::Flat),
                            ..Default::default()
                        },
                    },
                ],
                skippable: false,
                help: Some("We'll suggest scheduling deep work during your peak hours".to_string()),
                category: QuestionCategory::EnergyPattern,
            },
            WizardQuestion {
                id: "energy_duration".to_string(),
                text: "How long can you maintain deep focus?".to_string(),
                choices: vec![
                    QuestionChoice {
                        id: "short".to_string(),
                        text: "15-20 minutes".to_string(),
                        score_adjustments: ScoreAdjustments {
                            focus_duration_delta: -10,
                            ..Default::default()
                        },
                    },
                    QuestionChoice {
                        id: "medium".to_string(),
                        text: "25-30 minutes".to_string(),
                        score_adjustments: ScoreAdjustments::default(),
                    },
                    QuestionChoice {
                        id: "long".to_string(),
                        text: "45-60 minutes".to_string(),
                        score_adjustments: ScoreAdjustments {
                            focus_duration_delta: 20,
                            long_break_delta: 10,
                            ..Default::default()
                        },
                    },
                    QuestionChoice {
                        id: "extended".to_string(),
                        text: "60+ minutes".to_string(),
                        score_adjustments: ScoreAdjustments {
                            focus_duration_delta: 35,
                            long_break_delta: 15,
                            daily_target_delta: -2,
                            ..Default::default()
                        },
                    },
                ],
                skippable: true,
                help: None,
                category: QuestionCategory::EnergyPattern,
            },
            // Schedule Questions
            WizardQuestion {
                id: "work_hours".to_string(),
                text: "How many hours do you typically work per day?".to_string(),
                choices: vec![
                    QuestionChoice {
                        id: "part_time".to_string(),
                        text: "Less than 6 hours".to_string(),
                        score_adjustments: ScoreAdjustments {
                            daily_target_delta: -2,
                            ..Default::default()
                        },
                    },
                    QuestionChoice {
                        id: "standard".to_string(),
                        text: "6-8 hours".to_string(),
                        score_adjustments: ScoreAdjustments::default(),
                    },
                    QuestionChoice {
                        id: "extended".to_string(),
                        text: "8-10 hours".to_string(),
                        score_adjustments: ScoreAdjustments {
                            daily_target_delta: 2,
                            ..Default::default()
                        },
                    },
                    QuestionChoice {
                        id: "long".to_string(),
                        text: "More than 10 hours".to_string(),
                        score_adjustments: ScoreAdjustments {
                            daily_target_delta: 4,
                            long_break_delta: 5,
                            ..Default::default()
                        },
                    },
                ],
                skippable: true,
                help: None,
                category: QuestionCategory::Schedule,
            },
        ]
    }

    /// Start a new wizard session.
    pub fn start_session(&mut self) -> WizardSession {
        let session = WizardSession::new();
        self.sessions.insert(session.id.clone(), session.clone());
        session
    }

    /// Get the current question for a session.
    pub fn get_current_question(&self, session_id: &SessionId) -> Result<&WizardQuestion, WizardError> {
        let session = self.sessions.get(session_id)
            .ok_or_else(|| WizardError::SessionNotFound(session_id.clone()))?;

        if session.is_complete() {
            return Err(WizardError::AlreadyComplete(session_id.clone()));
        }

        self.questions.get(session.current_index)
            .ok_or(WizardError::InvalidQuestionIndex(session.current_index))
    }

    /// Get all remaining questions (including current).
    pub fn get_remaining_questions(&self, session_id: &SessionId) -> Result<Vec<&WizardQuestion>, WizardError> {
        let session = self.sessions.get(session_id)
            .ok_or_else(|| WizardError::SessionNotFound(session_id.clone()))?;

        if session.is_complete() {
            return Ok(Vec::new());
        }

        Ok(self.questions[session.current_index..].iter().collect())
    }

    /// Answer the current question.
    /// Returns Ok(Some(next_question)) if there are more questions,
    /// or Ok(None) if the wizard is complete.
    pub fn answer_question(
        &mut self,
        session_id: &SessionId,
        choice_id: &str,
    ) -> Result<Option<&WizardQuestion>, WizardError> {
        let session = self.sessions.get(session_id)
            .ok_or_else(|| WizardError::SessionNotFound(session_id.clone()))?;

        if session.is_complete() {
            return Err(WizardError::AlreadyComplete(session_id.clone()));
        }

        let question = self.questions.get(session.current_index)
            .ok_or(WizardError::InvalidQuestionIndex(session.current_index))?;

        // Validate choice
        if !question.choices.iter().any(|c| c.id == choice_id) {
            return Err(WizardError::InvalidChoice(question.id.clone(), choice_id.to_string()));
        }

        // Record response
        let response = QuestionResponse {
            question_id: question.id.clone(),
            choice_id: Some(choice_id.to_string()),
            responded_at: Utc::now(),
        };

        let session = self.sessions.get_mut(session_id).unwrap();
        session.responses.push(response);
        session.current_index += 1;

        // Check if done
        if session.current_index >= self.questions.len() {
            self.complete_session(session_id)?;
            return Ok(None);
        }

        self.get_current_question(session_id).map(Some)
    }

    /// Skip the current question.
    /// Returns Ok(Some(next_question)) if there are more questions,
    /// or Ok(None) if the wizard is complete.
    pub fn skip_question(&mut self, session_id: &SessionId) -> Result<Option<&WizardQuestion>, WizardError> {
        let session = self.sessions.get(session_id)
            .ok_or_else(|| WizardError::SessionNotFound(session_id.clone()))?;

        if session.is_complete() {
            return Err(WizardError::AlreadyComplete(session_id.clone()));
        }

        let question = self.questions.get(session.current_index)
            .ok_or(WizardError::InvalidQuestionIndex(session.current_index))?;

        if !question.skippable {
            return Err(WizardError::CannotSkip(question.id.clone()));
        }

        // Record skip
        let response = QuestionResponse {
            question_id: question.id.clone(),
            choice_id: None,
            responded_at: Utc::now(),
        };

        let session = self.sessions.get_mut(session_id).unwrap();
        session.responses.push(response);
        session.current_index += 1;

        // Check if done
        if session.current_index >= self.questions.len() {
            self.complete_session(session_id)?;
            return Ok(None);
        }

        self.get_current_question(session_id).map(Some)
    }

    /// Skip the entire wizard.
    pub fn skip_wizard(&mut self, session_id: &SessionId) -> Result<StarterProfile, WizardError> {
        let session = self.sessions.get_mut(session_id)
            .ok_or_else(|| WizardError::SessionNotFound(session_id.clone()))?;

        if session.is_complete() {
            return Err(WizardError::AlreadyComplete(session_id.clone()));
        }

        if !self.config.allow_skip {
            return Err(WizardError::CannotSkip("entire wizard".to_string()));
        }

        session.skipped = true;
        session.completed_at = Some(Utc::now());
        session.generated_profile = Some(StarterProfile::default());

        Ok(session.generated_profile.clone().unwrap())
    }

    /// Complete the session and generate a profile.
    fn complete_session(&mut self, session_id: &SessionId) -> Result<StarterProfile, WizardError> {
        // First check and get data needed
        let (answered_count, responses_clone) = {
            let session = self.sessions.get(session_id)
                .ok_or_else(|| WizardError::SessionNotFound(session_id.clone()))?;

            let answered_count = session.responses.iter()
                .filter(|r| r.choice_id.is_some())
                .count();

            (answered_count, session.responses.clone())
        };

        if answered_count < self.config.min_questions {
            return Err(WizardError::InsufficientResponses(
                answered_count,
                self.config.min_questions,
            ));
        }

        // Generate profile from responses
        let profile = self.generate_profile_from_responses(&responses_clone, answered_count);

        // Update session
        let session = self.sessions.get_mut(session_id).unwrap();
        session.generated_profile = Some(profile.clone());
        session.completed_at = Some(Utc::now());

        Ok(profile)
    }

    /// Generate a starter profile from responses.
    fn generate_profile_from_responses(&self, responses: &[QuestionResponse], answered_count: usize) -> StarterProfile {
        let mut adjustments = ScoreAdjustments::default();

        // Aggregate all score adjustments
        for response in responses {
            if let Some(choice_id) = &response.choice_id {
                if let Some(question) = self.questions.iter().find(|q| q.id == response.question_id) {
                    if let Some(choice) = question.choices.iter().find(|c| &c.id == choice_id) {
                        adjustments.focus_duration_delta += choice.score_adjustments.focus_duration_delta;
                        adjustments.short_break_delta += choice.score_adjustments.short_break_delta;
                        adjustments.long_break_delta += choice.score_adjustments.long_break_delta;
                        adjustments.daily_target_delta += choice.score_adjustments.daily_target_delta;

                        // Use last set values for these
                        if let Some(tol) = choice.score_adjustments.interruption_tolerance {
                            adjustments.interruption_tolerance = Some(tol);
                        }
                        if let Some(curve) = choice.score_adjustments.energy_curve {
                            adjustments.energy_curve = Some(curve);
                        }
                    }
                }
            }
        }

        // Calculate final values
        let base = StarterProfile::default();
        let focus_duration = (base.focus_duration as i32 + adjustments.focus_duration_delta)
            .clamp(15, 60) as u32;
        let short_break_duration = (base.short_break_duration as i32 + adjustments.short_break_delta)
            .clamp(3, 15) as u32;
        let long_break_duration = (base.long_break_duration as i32 + adjustments.long_break_delta)
            .clamp(10, 30) as u32;
        let daily_target = (base.daily_target as i32 + adjustments.daily_target_delta)
            .clamp(4, 16) as u32;

        let total_questions = self.questions.len();

        // Calculate confidence based on response rate
        let confidence = (answered_count * 100 / total_questions.max(1)) as u32;

        // Generate name and description
        let (name, description) = self.generate_profile_description(&adjustments, focus_duration);

        StarterProfile {
            focus_duration,
            short_break_duration,
            long_break_duration,
            daily_target,
            long_break_interval: base.long_break_interval,
            energy_curve: adjustments.energy_curve.unwrap_or_default(),
            interruption_tolerance: adjustments.interruption_tolerance.unwrap_or(50) as u32,
            suggested_work_hours: 8,
            name,
            description,
            confidence,
            based_on_responses: answered_count,
        }
    }

    /// Generate a starter profile from session responses.
    fn generate_profile(&self, session: &WizardSession) -> StarterProfile {
        let mut adjustments = ScoreAdjustments::default();

        // Aggregate all score adjustments
        for response in &session.responses {
            if let Some(choice_id) = &response.choice_id {
                if let Some(question) = self.questions.iter().find(|q| q.id == response.question_id) {
                    if let Some(choice) = question.choices.iter().find(|c| &c.id == choice_id) {
                        adjustments.focus_duration_delta += choice.score_adjustments.focus_duration_delta;
                        adjustments.short_break_delta += choice.score_adjustments.short_break_delta;
                        adjustments.long_break_delta += choice.score_adjustments.long_break_delta;
                        adjustments.daily_target_delta += choice.score_adjustments.daily_target_delta;

                        // Use last set values for these
                        if let Some(tol) = choice.score_adjustments.interruption_tolerance {
                            adjustments.interruption_tolerance = Some(tol);
                        }
                        if let Some(curve) = choice.score_adjustments.energy_curve {
                            adjustments.energy_curve = Some(curve);
                        }
                    }
                }
            }
        }

        // Calculate final values
        let base = StarterProfile::default();
        let focus_duration = (base.focus_duration as i32 + adjustments.focus_duration_delta)
            .clamp(15, 60) as u32;
        let short_break_duration = (base.short_break_duration as i32 + adjustments.short_break_delta)
            .clamp(3, 15) as u32;
        let long_break_duration = (base.long_break_duration as i32 + adjustments.long_break_delta)
            .clamp(10, 30) as u32;
        let daily_target = (base.daily_target as i32 + adjustments.daily_target_delta)
            .clamp(4, 16) as u32;

        let answered_count = session.responses.iter()
            .filter(|r| r.choice_id.is_some())
            .count();
        let total_questions = self.questions.len();

        // Calculate confidence based on response rate
        let confidence = (answered_count * 100 / total_questions.max(1)) as u32;

        // Generate name and description
        let (name, description) = self.generate_profile_description(&adjustments, focus_duration);

        StarterProfile {
            focus_duration,
            short_break_duration,
            long_break_duration,
            daily_target,
            long_break_interval: base.long_break_interval,
            energy_curve: adjustments.energy_curve.unwrap_or_default(),
            interruption_tolerance: adjustments.interruption_tolerance.unwrap_or(50) as u32,
            suggested_work_hours: 8,
            name,
            description,
            confidence,
            based_on_responses: answered_count,
        }
    }

    /// Generate a descriptive name and description for the profile.
    fn generate_profile_description(
        &self,
        adjustments: &ScoreAdjustments,
        focus_duration: u32,
    ) -> (String, String) {
        let name = if focus_duration >= 50 {
            "Deep Work Profile"
        } else if focus_duration >= 35 {
            "Extended Focus Profile"
        } else if focus_duration <= 20 {
            "Quick Sprint Profile"
        } else if adjustments.interruption_tolerance.unwrap_or(50) >= 80 {
            "Flexible Profile"
        } else {
            "Balanced Profile"
        }.to_string();

        let description = format!(
            "{} min focus, {} min short breaks, {} min long breaks. {} daily target.",
            focus_duration,
            5 + adjustments.short_break_delta,
            15 + adjustments.long_break_delta,
            (8 + adjustments.daily_target_delta).clamp(4, 16),
        );

        (name, description)
    }

    /// Get the generated profile for a completed session.
    pub fn get_profile(&self, session_id: &SessionId) -> Result<Option<&StarterProfile>, WizardError> {
        let session = self.sessions.get(session_id)
            .ok_or_else(|| WizardError::SessionNotFound(session_id.clone()))?;

        Ok(session.generated_profile.as_ref())
    }

    /// Get progress information.
    pub fn get_progress(&self, session_id: &SessionId) -> Result<WizardProgress, WizardError> {
        let session = self.sessions.get(session_id)
            .ok_or_else(|| WizardError::SessionNotFound(session_id.clone()))?;

        let total = self.questions.len();
        let answered = session.responses.iter()
            .filter(|r| r.choice_id.is_some())
            .count();
        let skipped = session.responses.len() - answered;

        Ok(WizardProgress {
            current_index: session.current_index,
            total_questions: total,
            answered_questions: answered,
            skipped_questions: skipped,
            is_complete: session.is_complete(),
            is_skipped: session.skipped,
            duration_seconds: session.duration_seconds(),
        })
    }
}

impl Default for OnboardingWizard {
    fn default() -> Self {
        Self::new()
    }
}

/// Progress information for a wizard session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WizardProgress {
    /// Current question index.
    pub current_index: usize,
    /// Total number of questions.
    pub total_questions: usize,
    /// Number of answered questions.
    pub answered_questions: usize,
    /// Number of skipped questions.
    pub skipped_questions: usize,
    /// Whether the session is complete.
    pub is_complete: bool,
    /// Whether the user skipped the wizard.
    pub is_skipped: bool,
    /// Time spent so far in seconds.
    pub duration_seconds: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wizard_session_creation() {
        let session = WizardSession::new();
        assert!(!session.is_complete());
        assert_eq!(session.current_index, 0);
        assert!(session.responses.is_empty());
    }

    #[test]
    fn test_wizard_start_and_progress() {
        let mut wizard = OnboardingWizard::new();
        let session = wizard.start_session();

        let progress = wizard.get_progress(&session.id).unwrap();
        assert_eq!(progress.current_index, 0);
        assert!(!progress.is_complete);
    }

    #[test]
    fn test_answer_question() {
        let mut wizard = OnboardingWizard::new();
        let session = wizard.start_session();

        let question = wizard.get_current_question(&session.id).unwrap();
        assert_eq!(question.id, "task_mix_primary");

        // Answer the first question
        wizard.answer_question(&session.id, "coding").unwrap();

        let progress = wizard.get_progress(&session.id).unwrap();
        assert_eq!(progress.current_index, 1);
        assert_eq!(progress.answered_questions, 1);
    }

    #[test]
    fn test_invalid_choice() {
        let mut wizard = OnboardingWizard::new();
        let session = wizard.start_session();

        let result = wizard.answer_question(&session.id, "invalid_choice");
        assert!(matches!(result, Err(WizardError::InvalidChoice(_, _))));
    }

    #[test]
    fn test_skip_question() {
        let mut wizard = OnboardingWizard::new();
        let session = wizard.start_session();

        // Move to a skippable question (index 1 - task_complexity)
        wizard.answer_question(&session.id, "coding").unwrap();

        // Skip it
        wizard.skip_question(&session.id).unwrap();

        let progress = wizard.get_progress(&session.id).unwrap();
        assert_eq!(progress.skipped_questions, 1);
    }

    #[test]
    fn test_cannot_skip_mandatory_question() {
        let mut wizard = OnboardingWizard::new();
        let session = wizard.start_session();

        // First question is not skippable
        let result = wizard.skip_question(&session.id);
        assert!(matches!(result, Err(WizardError::CannotSkip(_))));
    }

    #[test]
    fn test_complete_wizard() {
        let mut wizard = OnboardingWizard::new();
        wizard.config.min_questions = 1;

        let session = wizard.start_session();

        // Answer all questions
        wizard.answer_question(&session.id, "coding").unwrap();
        wizard.answer_question(&session.id, "moderate").unwrap();
        wizard.answer_question(&session.id, "sometimes").unwrap();
        wizard.answer_question(&session.id, "pause").unwrap();
        wizard.answer_question(&session.id, "morning").unwrap();
        wizard.answer_question(&session.id, "medium").unwrap();
        wizard.answer_question(&session.id, "standard").unwrap();

        let profile = wizard.get_profile(&session.id).unwrap();
        assert!(profile.is_some());

        let profile = profile.unwrap();
        assert!(profile.focus_duration > 0);
        assert!(profile.confidence > 0);
        assert!(!profile.name.is_empty());
    }

    #[test]
    fn test_skip_wizard_entirely() {
        let mut wizard = OnboardingWizard::new();
        let session = wizard.start_session();

        let profile = wizard.skip_wizard(&session.id).unwrap();
        assert_eq!(profile.focus_duration, 25); // Default

        let progress = wizard.get_progress(&session.id).unwrap();
        assert!(progress.is_complete);
        assert!(progress.is_skipped);
    }

    #[test]
    fn test_generate_profile_adjustments() {
        let mut wizard = OnboardingWizard::new();
        wizard.config.min_questions = 3;

        let session = wizard.start_session();

        // Answer with choices that increase focus duration
        wizard.answer_question(&session.id, "analysis").unwrap(); // +15 focus
        wizard.answer_question(&session.id, "complex").unwrap(); // +15 focus
        wizard.answer_question(&session.id, "rarely").unwrap(); // +10 focus
        wizard.answer_question(&session.id, "ignore").unwrap(); // +5 focus
        wizard.answer_question(&session.id, "morning").unwrap();
        wizard.answer_question(&session.id, "extended").unwrap(); // +35 focus
        wizard.answer_question(&session.id, "standard").unwrap();

        let profile = wizard.get_profile(&session.id).unwrap().unwrap();

        // Total +80 from base 25 = 105, clamped to 60
        assert_eq!(profile.focus_duration, 60);
        assert_eq!(profile.energy_curve, EnergyCurveType::MorningPeak);
    }

    #[test]
    fn test_session_within_target_time() {
        let session = WizardSession::new();
        // Just created, should be within 3 minutes
        assert!(session.is_within_target_time());
    }

    #[test]
    fn test_profile_description_generation() {
        let wizard = OnboardingWizard::new();

        let adj = ScoreAdjustments {
            focus_duration_delta: 30,
            ..Default::default()
        };
        let (name, _) = wizard.generate_profile_description(&adj, 50);
        assert_eq!(name, "Deep Work Profile");

        let adj = ScoreAdjustments {
            focus_duration_delta: -10,
            ..Default::default()
        };
        let (name, _) = wizard.generate_profile_description(&adj, 20);
        assert_eq!(name, "Quick Sprint Profile");

        let adj = ScoreAdjustments {
            focus_duration_delta: 0,
            ..Default::default()
        };
        let (name, _) = wizard.generate_profile_description(&adj, 25);
        assert_eq!(name, "Balanced Profile");
    }

    #[test]
    fn test_get_remaining_questions() {
        let mut wizard = OnboardingWizard::new();
        let session = wizard.start_session();

        // Initially all questions remaining
        let remaining = wizard.get_remaining_questions(&session.id).unwrap();
        assert_eq!(remaining.len(), wizard.questions.len());

        // Answer first question
        wizard.answer_question(&session.id, "coding").unwrap();

        // One fewer remaining
        let remaining = wizard.get_remaining_questions(&session.id).unwrap();
        assert_eq!(remaining.len(), wizard.questions.len() - 1);
    }

    #[test]
    fn test_confidence_based_on_responses() {
        let mut wizard = OnboardingWizard::new();
        wizard.config.min_questions = 1;
        let total = wizard.questions.len();

        let session = wizard.start_session();

        // Answer all questions
        wizard.answer_question(&session.id, "coding").unwrap();
        wizard.answer_question(&session.id, "moderate").unwrap();
        wizard.answer_question(&session.id, "sometimes").unwrap();
        wizard.answer_question(&session.id, "pause").unwrap();
        wizard.answer_question(&session.id, "morning").unwrap();
        wizard.answer_question(&session.id, "medium").unwrap();
        wizard.answer_question(&session.id, "standard").unwrap();

        let profile = wizard.get_profile(&session.id).unwrap().unwrap();
        // 100% confidence since all answered
        assert_eq!(profile.confidence, 100);
        assert_eq!(profile.based_on_responses, total);
    }

    #[test]
    fn test_interruption_tolerance_setting() {
        let mut wizard = OnboardingWizard::new();
        wizard.config.min_questions = 1;

        let session = wizard.start_session();

        // Answer with high interruption choice
        wizard.answer_question(&session.id, "coding").unwrap();
        wizard.answer_question(&session.id, "moderate").unwrap();
        wizard.answer_question(&session.id, "constantly").unwrap(); // tolerance: 100
        wizard.answer_question(&session.id, "pause").unwrap();
        wizard.answer_question(&session.id, "morning").unwrap();
        wizard.answer_question(&session.id, "medium").unwrap();
        wizard.answer_question(&session.id, "standard").unwrap();

        let profile = wizard.get_profile(&session.id).unwrap().unwrap();
        assert_eq!(profile.interruption_tolerance, 100);
    }
}
