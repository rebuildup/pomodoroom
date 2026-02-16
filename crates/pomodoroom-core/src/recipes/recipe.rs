//! Recipe definition for the recipe engine.
//!
//! A recipe defines a complete if-this-then-that automation rule.

use serde::{Deserialize, Serialize};
use super::{Trigger, Action};

/// A complete recipe with triggers and actions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Recipe {
    /// Human-readable name
    pub name: String,

    /// Human-readable description
    pub description: String,

    /// Whether this recipe is enabled
    #[serde(default = "default_enabled")]
    pub enabled: bool,

    /// Triggers that cause this recipe to evaluate
    pub triggers: Vec<Trigger>,

    /// Actions to execute when triggers match
    pub actions: Vec<Action>,
}

fn default_enabled() -> bool {
    true
}

impl Recipe {
    /// Check if this recipe matches the given event
    /// Returns Some(actions) if any trigger matches, None otherwise
    pub fn matches_event(&self, event: &crate::Event) -> Option<&[Action]> {
        if !self.enabled {
            return None;
        }

        for trigger in &self.triggers {
            if self.trigger_matches(trigger, event) {
                return Some(&self.actions);
            }
        }

        None
    }

    fn trigger_matches(&self, trigger: &Trigger, event: &crate::Event) -> bool {
        match (trigger, event) {
            (Trigger::TimerCompleted { step_type: s1 },
             crate::Event::TimerCompleted { step_type: s2, .. }) => {
                s1 == s2
            }
            (Trigger::TimerSkipped { from_step: s1 },
             crate::Event::TimerSkipped { from_step, .. }) => {
                s1 == from_step
            }
            (Trigger::TimerStarted { step_type: s1 },
             crate::Event::TimerStarted { step_type: s2, .. }) => {
                s1 == s2
            }
            (Trigger::TimerReset, crate::Event::TimerReset { .. }) => true,
            _ => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Event;
    use chrono::Utc;

    #[test]
    fn test_recipe_matches_focus_completion() {
        let recipe = Recipe {
            name: "test".to_string(),
            description: "test".to_string(),
            enabled: true,
            triggers: vec![Trigger::TimerCompleted {
                step_type: crate::timer::StepType::Focus,
            }],
            actions: vec![Action::CreateBreak { duration_mins: 5 }],
        };

        let event = Event::TimerCompleted {
            step_index: 0,
            step_type: crate::timer::StepType::Focus,
            at: Utc::now(),
        };

        assert!(recipe.matches_event(&event).is_some());
    }

    #[test]
    fn test_disabled_recipe_never_matches() {
        let recipe = Recipe {
            name: "test".to_string(),
            description: "test".to_string(),
            enabled: false,
            triggers: vec![Trigger::TimerReset],
            actions: vec![],
        };

        let event = Event::TimerReset { at: Utc::now() };
        assert!(recipe.matches_event(&event).is_none());
    }
}
