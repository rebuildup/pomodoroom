//! Context-switch cost matrix for schedule optimization.
//!
//! This module models asymmetric switch costs between different contexts
//! (projects, tags) and provides scoring for schedule optimization.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

/// Default switch cost in minutes when no specific cost is defined.
const DEFAULT_SWITCH_COST_MINUTES: i32 = 5;

/// Maximum switch cost in minutes (cap for learned costs).
const MAX_SWITCH_COST_MINUTES: i32 = 30;

/// Minimum switch cost in minutes (floor for learned costs).
const MIN_SWITCH_COST_MINUTES: i32 = 1;

/// Context identifier (project name or tag).
pub type ContextId = String;

/// Switch cost matrix storing asymmetric transition costs.
///
/// Costs represent the cognitive overhead (in minutes) of switching
/// from one context to another. Lower costs indicate smoother transitions.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SwitchCostMatrix {
    /// Base costs: from_context -> to_context -> cost_minutes
    costs: HashMap<ContextId, HashMap<ContextId, i32>>,

    /// Default cost for undefined transitions
    default_cost: i32,

    /// Learned transition counts for adaptive costs
    #[serde(default)]
    transition_counts: HashMap<ContextId, HashMap<ContextId, u32>>,

    /// Learned successful transition counts (no interruptions)
    #[serde(default)]
    successful_counts: HashMap<ContextId, HashMap<ContextId, u32>>,
}

impl SwitchCostMatrix {
    /// Create a new empty matrix with default cost.
    pub fn new() -> Self {
        Self {
            costs: HashMap::new(),
            default_cost: DEFAULT_SWITCH_COST_MINUTES,
            transition_counts: HashMap::new(),
            successful_counts: HashMap::new(),
        }
    }

    /// Create a matrix with a custom default cost.
    pub fn with_default_cost(default_cost: i32) -> Self {
        Self {
            costs: HashMap::new(),
            default_cost: default_cost.clamp(MIN_SWITCH_COST_MINUTES, MAX_SWITCH_COST_MINUTES),
            transition_counts: HashMap::new(),
            successful_counts: HashMap::new(),
        }
    }

    /// Set the switch cost from one context to another.
    pub fn set_cost(&mut self, from: &str, to: &str, cost_minutes: i32) {
        let clamped_cost = cost_minutes.clamp(MIN_SWITCH_COST_MINUTES, MAX_SWITCH_COST_MINUTES);
        self.costs
            .entry(from.to_string())
            .or_default()
            .insert(to.to_string(), clamped_cost);
    }

    /// Get the switch cost from one context to another.
    /// Returns the default cost if no specific cost is defined.
    pub fn get_cost(&self, from: &str, to: &str) -> i32 {
        if from == to {
            return 0; // Same context = no switch cost
        }
        self.costs
            .get(from)
            .and_then(|inner| inner.get(to))
            .copied()
            .unwrap_or(self.default_cost)
    }

    /// Record a transition observation for learning.
    /// Call this when a context switch actually occurs.
    pub fn record_transition(&mut self, from: &str, to: &str, successful: bool) {
        *self
            .transition_counts
            .entry(from.to_string())
            .or_default()
            .entry(to.to_string())
            .or_default() += 1;

        if successful {
            *self
                .successful_counts
                .entry(from.to_string())
                .or_default()
                .entry(to.to_string())
                .or_default() += 1;
        }
    }

    /// Learn costs from recorded observations.
    /// Adjusts costs based on success rates.
    pub fn learn_from_observations(&mut self) {
        // Clone data to avoid borrow checker issues
        let transition_counts = self.transition_counts.clone();
        let successful_counts = self.successful_counts.clone();

        // Collect updates
        let updates: Vec<(String, String, i32)> = transition_counts
            .iter()
            .flat_map(|(from, to_map)| {
                to_map.iter().filter_map(|(to, total)| {
                    let successful = successful_counts
                        .get(from)
                        .and_then(|m| m.get(to))
                        .copied()
                        .unwrap_or(0);

                    if *total >= 3 {
                        // Need at least 3 observations
                        let success_rate = successful as f32 / *total as f32;
                        // Lower success rate = higher cost
                        // High success rate (>=0.8) = reduce cost to min
                        // Low success rate (<0.5) = increase cost toward max
                        let base_cost = self.get_cost(from, to);
                        let learned_cost = if success_rate >= 0.8 {
                            MIN_SWITCH_COST_MINUTES
                        } else if success_rate < 0.5 {
                            (base_cost as f32 * 1.5).min(MAX_SWITCH_COST_MINUTES as f32) as i32
                        } else {
                            base_cost
                        };
                        Some((from.clone(), to.clone(), learned_cost))
                    } else {
                        None
                    }
                })
            })
            .collect();

        // Apply updates
        for (from, to, cost) in updates {
            self.set_cost(&from, &to, cost);
        }
    }

    /// Calculate the total switch cost for a sequence of contexts.
    pub fn calculate_sequence_cost(&self, contexts: &[&str]) -> i32 {
        if contexts.len() <= 1 {
            return 0;
        }
        contexts
            .windows(2)
            .map(|pair| self.get_cost(pair[0], pair[1]))
            .sum()
    }

    /// Find the optimal ordering of contexts to minimize total switch cost.
    /// Uses a greedy nearest-neighbor heuristic.
    pub fn optimize_order(&self, contexts: &[ContextId]) -> Vec<ContextId> {
        if contexts.len() <= 1 {
            return contexts.to_vec();
        }

        let mut remaining: Vec<_> = contexts.to_vec();
        let mut result = Vec::with_capacity(contexts.len());

        // Start with the first context
        let first = remaining.remove(0);
        result.push(first);

        while !remaining.is_empty() {
            let current = result.last().unwrap();
            // Find the context with minimum switch cost from current
            let best_idx = remaining
                .iter()
                .enumerate()
                .min_by_key(|(_, next)| self.get_cost(current, next))
                .map(|(idx, _)| idx)
                .unwrap_or(0);
            result.push(remaining.remove(best_idx));
        }

        result
    }

    /// Get all defined contexts.
    pub fn contexts(&self) -> Vec<&ContextId> {
        let mut contexts: std::collections::HashSet<&ContextId> = std::collections::HashSet::new();
        for from in self.costs.keys() {
            contexts.insert(from);
        }
        for from in self.transition_counts.keys() {
            contexts.insert(from);
        }
        contexts.into_iter().collect()
    }

    /// Export the matrix as a JSON string.
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }

    /// Import the matrix from a JSON string.
    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }
}

/// Saved switch overhead statistics for reporting.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SwitchOverheadReport {
    /// Total switch overhead saved by batching (in minutes)
    pub saved_minutes: i32,

    /// Number of switches avoided
    pub switches_avoided: u32,

    /// Breakdown by context pair
    pub savings_by_pair: HashMap<(ContextId, ContextId), i32>,
}

impl SwitchOverheadReport {
    /// Create a new empty report.
    pub fn new() -> Self {
        Self::default()
    }

    /// Record savings from batching.
    pub fn record_savings(&mut self, from: ContextId, to: ContextId, minutes: i32) {
        self.saved_minutes += minutes;
        self.switches_avoided += 1;
        *self
            .savings_by_pair
            .entry((from, to))
            .or_default() += minutes;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_same_context_zero_cost() {
        let matrix = SwitchCostMatrix::new();
        assert_eq!(matrix.get_cost("project-a", "project-a"), 0);
    }

    #[test]
    fn test_default_cost_for_undefined() {
        let matrix = SwitchCostMatrix::new();
        assert_eq!(matrix.get_cost("project-a", "project-b"), DEFAULT_SWITCH_COST_MINUTES);
    }

    #[test]
    fn test_set_and_get_cost() {
        let mut matrix = SwitchCostMatrix::new();
        matrix.set_cost("dev", "admin", 15);
        assert_eq!(matrix.get_cost("dev", "admin"), 15);
    }

    #[test]
    fn test_asymmetric_costs() {
        let mut matrix = SwitchCostMatrix::new();
        matrix.set_cost("deep-work", "email", 10);
        matrix.set_cost("email", "deep-work", 20);
        assert_eq!(matrix.get_cost("deep-work", "email"), 10);
        assert_eq!(matrix.get_cost("email", "deep-work"), 20);
    }

    #[test]
    fn test_cost_clamping() {
        let mut matrix = SwitchCostMatrix::new();
        matrix.set_cost("a", "b", 100); // Should clamp to MAX
        matrix.set_cost("a", "c", -5);  // Should clamp to MIN
        assert_eq!(matrix.get_cost("a", "b"), MAX_SWITCH_COST_MINUTES);
        assert_eq!(matrix.get_cost("a", "c"), MIN_SWITCH_COST_MINUTES);
    }

    #[test]
    fn test_sequence_cost() {
        let mut matrix = SwitchCostMatrix::new();
        matrix.set_cost("a", "b", 5);
        matrix.set_cost("b", "c", 10);
        let cost = matrix.calculate_sequence_cost(&["a", "b", "c"]);
        assert_eq!(cost, 15); // 5 + 10
    }

    #[test]
    fn test_optimize_order() {
        let mut matrix = SwitchCostMatrix::new();
        // a->b is cheap (2), a->c is expensive (20)
        // b->c is cheap (3)
        matrix.set_cost("a", "b", 2);
        matrix.set_cost("a", "c", 20);
        matrix.set_cost("b", "c", 3);
        matrix.set_cost("b", "a", 10);
        matrix.set_cost("c", "a", 10);
        matrix.set_cost("c", "b", 10);

        let optimized = matrix.optimize_order(&["a".to_string(), "b".to_string(), "c".to_string()]);
        // Should order as a -> b -> c (total: 2 + 3 = 5)
        assert_eq!(optimized, vec!["a", "b", "c"]);
    }

    #[test]
    fn test_record_transition_and_learn() {
        let mut matrix = SwitchCostMatrix::new();
        matrix.set_cost("a", "b", 10);

        // Record successful transitions
        for _ in 0..5 {
            matrix.record_transition("a", "b", true);
        }

        matrix.learn_from_observations();

        // High success rate should reduce cost
        assert_eq!(matrix.get_cost("a", "b"), MIN_SWITCH_COST_MINUTES);
    }

    #[test]
    fn test_json_roundtrip() {
        let mut matrix = SwitchCostMatrix::new();
        matrix.set_cost("dev", "admin", 15);
        matrix.set_cost("admin", "dev", 25);

        let json = matrix.to_json().unwrap();
        let restored = SwitchCostMatrix::from_json(&json).unwrap();

        assert_eq!(restored.get_cost("dev", "admin"), 15);
        assert_eq!(restored.get_cost("admin", "dev"), 25);
    }
}
