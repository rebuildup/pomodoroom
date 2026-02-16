//! Trigger definitions for recipe engine.
//!
//! Triggers define when a recipe should be evaluated based on system events.

use serde::{Deserialize, Serialize};
use crate::timer::StepType;

/// A trigger that causes recipe evaluation
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum Trigger {
    #[serde(rename = "TimerCompleted")]
    TimerCompleted {
        /// Only trigger for specific step type (Focus, ShortBreak, LongBreak)
        step_type: StepType,
    },

    #[serde(rename = "TimerSkipped")]
    TimerSkipped {
        /// Only trigger when skipping from this step index
        from_step: usize,
    },

    #[serde(rename = "TimerStarted")]
    TimerStarted {
        step_type: StepType,
    },

    #[serde(rename = "TimerReset")]
    TimerReset,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_trigger_serialize() {
        let trigger = Trigger::TimerCompleted {
            step_type: StepType::Focus,
        };
        let toml = toml::to_string(&trigger).unwrap();
        assert!(toml.contains(r#"type = "TimerCompleted""#));
        assert!(toml.contains(r#"step_type = "focus""#));
    }

    #[test]
    fn test_trigger_deserialize() {
        let toml = r#"
            type = "TimerCompleted"
            step_type = "focus"
        "#;
        let trigger: Trigger = toml::from_str(toml).unwrap();
        assert_eq!(trigger, Trigger::TimerCompleted { step_type: StepType::Focus });
    }
}
