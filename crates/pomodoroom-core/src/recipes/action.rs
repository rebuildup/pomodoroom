//! Action definitions for recipe engine.
//!
//! Actions define what happens when a recipe's triggers match.

use serde::{Deserialize, Serialize};

/// An action that can be executed by the recipe engine
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum Action {
    #[serde(rename = "CreateBreak")]
    CreateBreak {
        /// Duration of the break in minutes
        duration_mins: u32,
    },
}

impl Action {
    /// Get a human-readable description of this action
    ///
    /// Note: Some actions may be placeholders. See individual action
    /// documentation for implementation status.
    pub fn description(&self) -> String {
        match self {
            Action::CreateBreak { duration_mins } => {
                format!("Create {} minute break [placeholder - not yet implemented]", duration_mins)
            }
        }
    }


    /// Get the type name of this action
    pub fn type_name(&self) -> &'static str {
        match self {
            Action::CreateBreak { .. } => "CreateBreak",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_action_serialize() {
        let action = Action::CreateBreak { duration_mins: 5 };
        let toml = toml::to_string(&action).unwrap();
        assert!(toml.contains(r#"type = "CreateBreak""#));
        assert!(toml.contains("duration_mins = 5"));
    }

    #[test]
    fn test_action_description() {
        let action = Action::CreateBreak { duration_mins: 10 };
        assert!(action.description().contains("Create 10 minute break"));
        assert!(action.description().contains("[placeholder"));
    }
}
