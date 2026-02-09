use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StepType {
    Focus,
    Break,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Step {
    pub step_type: StepType,
    /// Duration in minutes.
    pub duration_min: u64,
    pub label: String,
    #[serde(default)]
    pub description: String,
}

impl Step {
    /// Get step duration in milliseconds.
    ///
    /// Uses saturating arithmetic to prevent overflow with large values.
    /// Returns u64::MAX if the calculation would overflow.
    pub fn duration_ms(&self) -> u64 {
        self.duration_min
            .saturating_mul(60)
            .saturating_mul(1000)
    }

    /// Get step duration in seconds.
    ///
    /// Uses saturating arithmetic to prevent overflow with large values.
    pub fn duration_secs(&self) -> u64 {
        self.duration_min.saturating_mul(60)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Schedule {
    pub steps: Vec<Step>,
}

impl Schedule {
    /// The default progressive schedule.
    pub fn default_progressive() -> Self {
        Self {
            steps: vec![
                Step {
                    step_type: StepType::Focus,
                    duration_min: 15,
                    label: "Warm Up".into(),
                    description: String::new(),
                },
                Step {
                    step_type: StepType::Break,
                    duration_min: 5,
                    label: "Short Break".into(),
                    description: String::new(),
                },
                Step {
                    step_type: StepType::Focus,
                    duration_min: 30,
                    label: "Deep Work I".into(),
                    description: String::new(),
                },
                Step {
                    step_type: StepType::Break,
                    duration_min: 5,
                    label: "Short Break".into(),
                    description: String::new(),
                },
                Step {
                    step_type: StepType::Focus,
                    duration_min: 45,
                    label: "Deep Work II".into(),
                    description: String::new(),
                },
                Step {
                    step_type: StepType::Break,
                    duration_min: 5,
                    label: "Short Break".into(),
                    description: String::new(),
                },
                Step {
                    step_type: StepType::Focus,
                    duration_min: 60,
                    label: "Flow State I".into(),
                    description: String::new(),
                },
                Step {
                    step_type: StepType::Break,
                    duration_min: 5,
                    label: "Short Break".into(),
                    description: String::new(),
                },
                Step {
                    step_type: StepType::Focus,
                    duration_min: 75,
                    label: "Flow State II".into(),
                    description: String::new(),
                },
                Step {
                    step_type: StepType::Break,
                    duration_min: 30,
                    label: "Long Break".into(),
                    description: String::new(),
                },
            ],
        }
    }

    pub fn total_duration_min(&self) -> u64 {
        self.steps.iter().map(|s| s.duration_min).sum()
    }

    pub fn focus_count(&self) -> usize {
        self.steps
            .iter()
            .filter(|s| s.step_type == StepType::Focus)
            .count()
    }

    /// Cumulative minutes completed up to (but not including) `step_index`.
    pub fn cumulative_min(&self, step_index: usize) -> u64 {
        self.steps
            .iter()
            .take(step_index)
            .map(|s| s.duration_min)
            .sum()
    }
}

impl Default for Schedule {
    fn default() -> Self {
        Self::default_progressive()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_schedule_has_10_steps() {
        let s = Schedule::default();
        assert_eq!(s.steps.len(), 10);
    }

    #[test]
    fn default_schedule_focus_count() {
        let s = Schedule::default();
        assert_eq!(s.focus_count(), 5);
    }

    #[test]
    fn total_duration() {
        let s = Schedule::default();
        assert_eq!(s.total_duration_min(), 15 + 5 + 30 + 5 + 45 + 5 + 60 + 5 + 75 + 30);
    }
}
