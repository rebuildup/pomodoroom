//! Task splitting templates for semantic decomposition.
//!
//! Provides rule-based templates for splitting long tasks into meaningful
//! segments based on task type (coding, writing, review, admin).

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Types of tasks that can be split using templates
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskType {
    /// Software development tasks
    Coding,
    /// Writing and documentation tasks
    Writing,
    /// Code review, document review tasks
    Review,
    /// Administrative tasks
    Admin,
    /// Research and investigation
    Research,
    /// Design and creative work
    Design,
}

impl TaskType {
    /// Get the default template for this task type
    pub fn default_template(&self) -> TaskSplitTemplate {
        match self {
            TaskType::Coding => TaskSplitTemplate::coding_template(),
            TaskType::Writing => TaskSplitTemplate::writing_template(),
            TaskType::Review => TaskSplitTemplate::review_template(),
            TaskType::Admin => TaskSplitTemplate::admin_template(),
            TaskType::Research => TaskSplitTemplate::research_template(),
            TaskType::Design => TaskSplitTemplate::design_template(),
        }
    }

    /// Get human-readable display name
    pub fn display_name(&self) -> &'static str {
        match self {
            TaskType::Coding => "Coding",
            TaskType::Writing => "Writing",
            TaskType::Review => "Review",
            TaskType::Admin => "Admin",
            TaskType::Research => "Research",
            TaskType::Design => "Design",
        }
    }
}

/// A segment definition within a split template
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SegmentDefinition {
    /// Segment name template (e.g., "Setup & Planning")
    pub name: String,
    /// Description of what this segment involves
    pub description: String,
    /// Expected output or deliverable
    pub expected_output: String,
    /// Typical percentage of total task time (0.0-1.0)
    pub time_ratio: f32,
    /// Whether this segment is optional
    pub optional: bool,
}

/// Template for splitting a task into segments
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSplitTemplate {
    /// Task type this template applies to
    pub task_type: TaskType,
    /// Template name
    pub name: String,
    /// Description of the template
    pub description: String,
    /// Segment definitions in order
    pub segments: Vec<SegmentDefinition>,
}

impl TaskSplitTemplate {
    /// Create coding task template
    pub fn coding_template() -> Self {
        Self {
            task_type: TaskType::Coding,
            name: "Standard Development".to_string(),
            description:
                "Split coding tasks into planning, implementation, testing, and refactoring phases"
                    .to_string(),
            segments: vec![
                SegmentDefinition {
                    name: "Setup & Planning".to_string(),
                    description:
                        "Environment setup, requirements review, and implementation planning"
                            .to_string(),
                    expected_output: "Design doc, task breakdown, environment ready".to_string(),
                    time_ratio: 0.15,
                    optional: false,
                },
                SegmentDefinition {
                    name: "Core Implementation".to_string(),
                    description: "Main feature implementation and business logic".to_string(),
                    expected_output: "Working code with core functionality".to_string(),
                    time_ratio: 0.40,
                    optional: false,
                },
                SegmentDefinition {
                    name: "Testing & Validation".to_string(),
                    description: "Unit tests, integration tests, and manual validation".to_string(),
                    expected_output: "Test suite passing, edge cases covered".to_string(),
                    time_ratio: 0.25,
                    optional: false,
                },
                SegmentDefinition {
                    name: "Refinement & Docs".to_string(),
                    description: "Code review fixes, documentation, and cleanup".to_string(),
                    expected_output: "Clean code with documentation, PR ready".to_string(),
                    time_ratio: 0.20,
                    optional: false,
                },
            ],
        }
    }

    /// Create writing task template
    pub fn writing_template() -> Self {
        Self {
            task_type: TaskType::Writing,
            name: "Standard Writing".to_string(),
            description: "Split writing tasks into research, outline, draft, and editing phases"
                .to_string(),
            segments: vec![
                SegmentDefinition {
                    name: "Research & Notes".to_string(),
                    description: "Gather information, sources, and initial thoughts".to_string(),
                    expected_output: "Research notes, source list, key points".to_string(),
                    time_ratio: 0.20,
                    optional: false,
                },
                SegmentDefinition {
                    name: "Outline & Structure".to_string(),
                    description: "Create outline and structure the content".to_string(),
                    expected_output: "Detailed outline with section breakdown".to_string(),
                    time_ratio: 0.15,
                    optional: false,
                },
                SegmentDefinition {
                    name: "First Draft".to_string(),
                    description: "Write the complete first draft without editing".to_string(),
                    expected_output: "Complete rough draft of all sections".to_string(),
                    time_ratio: 0.35,
                    optional: false,
                },
                SegmentDefinition {
                    name: "Edit & Polish".to_string(),
                    description: "Revise, edit, and finalize the content".to_string(),
                    expected_output: "Final polished version ready to publish".to_string(),
                    time_ratio: 0.30,
                    optional: false,
                },
            ],
        }
    }

    /// Create review task template
    pub fn review_template() -> Self {
        Self {
            task_type: TaskType::Review,
            name: "Standard Review".to_string(),
            description: "Split review tasks into preparation, assessment, feedback, and follow-up"
                .to_string(),
            segments: vec![
                SegmentDefinition {
                    name: "Preparation".to_string(),
                    description: "Review context, requirements, and background".to_string(),
                    expected_output: "Understanding of context and criteria".to_string(),
                    time_ratio: 0.20,
                    optional: false,
                },
                SegmentDefinition {
                    name: "Initial Assessment".to_string(),
                    description: "First pass review and identify major issues".to_string(),
                    expected_output: "List of major concerns and questions".to_string(),
                    time_ratio: 0.30,
                    optional: false,
                },
                SegmentDefinition {
                    name: "Detailed Review".to_string(),
                    description: "Line-by-line or section-by-section review".to_string(),
                    expected_output: "Detailed feedback with specific suggestions".to_string(),
                    time_ratio: 0.35,
                    optional: false,
                },
                SegmentDefinition {
                    name: "Summary & Follow-up".to_string(),
                    description: "Compile feedback and create action items".to_string(),
                    expected_output: "Review summary with actionable next steps".to_string(),
                    time_ratio: 0.15,
                    optional: false,
                },
            ],
        }
    }

    /// Create admin task template
    pub fn admin_template() -> Self {
        Self {
            task_type: TaskType::Admin,
            name: "Standard Admin".to_string(),
            description: "Split administrative tasks into planning, execution, verification, and documentation".to_string(),
            segments: vec![
                SegmentDefinition {
                    name: "Planning".to_string(),
                    description: "Understand requirements and plan approach".to_string(),
                    expected_output: "Clear plan with steps identified".to_string(),
                    time_ratio: 0.15,
                    optional: false,
                },
                SegmentDefinition {
                    name: "Execution".to_string(),
                    description: "Perform the main administrative work".to_string(),
                    expected_output: "Task completed per requirements".to_string(),
                    time_ratio: 0.50,
                    optional: false,
                },
                SegmentDefinition {
                    name: "Verification".to_string(),
                    description: "Double-check work for accuracy and completeness".to_string(),
                    expected_output: "Confirmed accuracy, errors caught".to_string(),
                    time_ratio: 0.20,
                    optional: false,
                },
                SegmentDefinition {
                    name: "Documentation".to_string(),
                    description: "Record what was done and any follow-ups".to_string(),
                    expected_output: "Records updated, notes taken".to_string(),
                    time_ratio: 0.15,
                    optional: true,
                },
            ],
        }
    }

    /// Create research task template
    pub fn research_template() -> Self {
        Self {
            task_type: TaskType::Research,
            name: "Standard Research".to_string(),
            description: "Split research into scoping, exploration, analysis, and synthesis"
                .to_string(),
            segments: vec![
                SegmentDefinition {
                    name: "Scoping".to_string(),
                    description: "Define research questions and success criteria".to_string(),
                    expected_output: "Clear research scope and questions".to_string(),
                    time_ratio: 0.15,
                    optional: false,
                },
                SegmentDefinition {
                    name: "Exploration".to_string(),
                    description: "Gather information from multiple sources".to_string(),
                    expected_output: "Raw data and findings collected".to_string(),
                    time_ratio: 0.40,
                    optional: false,
                },
                SegmentDefinition {
                    name: "Analysis".to_string(),
                    description: "Analyze findings and identify patterns".to_string(),
                    expected_output: "Insights and patterns identified".to_string(),
                    time_ratio: 0.25,
                    optional: false,
                },
                SegmentDefinition {
                    name: "Synthesis".to_string(),
                    description: "Compile findings into actionable conclusions".to_string(),
                    expected_output: "Research report with recommendations".to_string(),
                    time_ratio: 0.20,
                    optional: false,
                },
            ],
        }
    }

    /// Create design task template
    pub fn design_template() -> Self {
        Self {
            task_type: TaskType::Design,
            name: "Standard Design".to_string(),
            description: "Split design work into discovery, ideation, prototyping, and refinement"
                .to_string(),
            segments: vec![
                SegmentDefinition {
                    name: "Discovery".to_string(),
                    description: "Understand requirements and constraints".to_string(),
                    expected_output: "Design brief with requirements mapped".to_string(),
                    time_ratio: 0.20,
                    optional: false,
                },
                SegmentDefinition {
                    name: "Ideation".to_string(),
                    description: "Generate multiple design concepts".to_string(),
                    expected_output: "Multiple concept sketches or wireframes".to_string(),
                    time_ratio: 0.25,
                    optional: false,
                },
                SegmentDefinition {
                    name: "Prototyping".to_string(),
                    description: "Create detailed designs or prototypes".to_string(),
                    expected_output: "High-fidelity mockups or prototypes".to_string(),
                    time_ratio: 0.35,
                    optional: false,
                },
                SegmentDefinition {
                    name: "Refinement".to_string(),
                    description: "Iterate based on feedback and finalize".to_string(),
                    expected_output: "Final design assets ready for handoff".to_string(),
                    time_ratio: 0.20,
                    optional: false,
                },
            ],
        }
    }

    /// Calculate estimated minutes for each segment based on total time
    pub fn calculate_segment_times(&self, total_minutes: u32) -> Vec<u32> {
        let total_ratio: f32 = self.segments.iter().map(|s| s.time_ratio).sum();

        self.segments
            .iter()
            .map(|segment| {
                let normalized_ratio = segment.time_ratio / total_ratio;
                (total_minutes as f32 * normalized_ratio).round() as u32
            })
            .collect()
    }
}

/// Registry of available split templates
pub struct TemplateRegistry {
    templates: HashMap<TaskType, Vec<TaskSplitTemplate>>,
}

impl TemplateRegistry {
    /// Create a new registry with default templates
    pub fn new() -> Self {
        let mut templates = HashMap::new();

        for task_type in [
            TaskType::Coding,
            TaskType::Writing,
            TaskType::Review,
            TaskType::Admin,
            TaskType::Research,
            TaskType::Design,
        ] {
            templates.insert(task_type, vec![task_type.default_template()]);
        }

        Self { templates }
    }

    /// Get templates for a specific task type
    pub fn get_templates(&self, task_type: TaskType) -> Option<&Vec<TaskSplitTemplate>> {
        self.templates.get(&task_type)
    }

    /// Get default template for a task type
    pub fn get_default_template(&self, task_type: TaskType) -> Option<TaskSplitTemplate> {
        self.templates
            .get(&task_type)
            .and_then(|templates| templates.first().cloned())
    }

    /// Add a custom template
    pub fn add_template(&mut self, template: TaskSplitTemplate) {
        self.templates
            .entry(template.task_type)
            .or_insert_with(Vec::new)
            .push(template);
    }

    /// Get all available task types
    pub fn available_task_types(&self) -> Vec<TaskType> {
        self.templates.keys().cloned().collect()
    }
}

impl Default for TemplateRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// Split a task into child segments using a template
#[derive(Debug, Clone)]
pub struct TaskSplitResult {
    /// Parent task ID
    pub parent_id: String,
    /// Generated child segments
    pub segments: Vec<TaskSegment>,
    /// Template used for splitting
    pub template_used: TaskSplitTemplate,
}

/// A child segment generated from task splitting
#[derive(Debug, Clone)]
pub struct TaskSegment {
    /// Segment ID
    pub id: String,
    /// Segment name (editable)
    pub name: String,
    /// Description
    pub description: String,
    /// Expected output
    pub expected_output: String,
    /// Estimated minutes
    pub estimated_minutes: u32,
    /// Whether this segment is optional
    pub optional: bool,
    /// Order in the sequence
    pub order: usize,
}

/// Task splitter that applies templates to create segments
pub struct TaskSplitter {
    registry: TemplateRegistry,
}

impl TaskSplitter {
    /// Create a new task splitter with default templates
    pub fn new() -> Self {
        Self {
            registry: TemplateRegistry::new(),
        }
    }

    /// Split a task using the specified template
    pub fn split_task(
        &self,
        parent_id: String,
        task_type: TaskType,
        total_minutes: u32,
    ) -> Option<TaskSplitResult> {
        let template = self.registry.get_default_template(task_type)?;
        let segment_times = template.calculate_segment_times(total_minutes);

        let segments: Vec<TaskSegment> = template
            .segments
            .iter()
            .enumerate()
            .map(|(i, def)| TaskSegment {
                id: format!("{}-seg-{}", parent_id, i + 1),
                name: def.name.clone(),
                description: def.description.clone(),
                expected_output: def.expected_output.clone(),
                estimated_minutes: segment_times.get(i).copied().unwrap_or(0),
                optional: def.optional,
                order: i,
            })
            .collect();

        Some(TaskSplitResult {
            parent_id,
            segments,
            template_used: template,
        })
    }

    /// Update segment name (editable after generation)
    pub fn update_segment_name(
        &self,
        result: &mut TaskSplitResult,
        segment_index: usize,
        new_name: String,
    ) -> Result<(), String> {
        if let Some(segment) = result.segments.get_mut(segment_index) {
            segment.name = new_name;
            Ok(())
        } else {
            Err(format!("Segment index {} not found", segment_index))
        }
    }

    /// Get the template registry
    pub fn registry(&self) -> &TemplateRegistry {
        &self.registry
    }
}

impl Default for TaskSplitter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_coding_template_structure() {
        let template = TaskSplitTemplate::coding_template();
        assert_eq!(template.task_type, TaskType::Coding);
        assert_eq!(template.segments.len(), 4);
        assert_eq!(template.segments[0].name, "Setup & Planning");
    }

    #[test]
    fn test_segment_time_calculation() {
        let template = TaskSplitTemplate::coding_template();
        let times = template.calculate_segment_times(100);

        assert_eq!(times.len(), 4);
        // Sum should be close to 100 (allowing for rounding)
        let total: u32 = times.iter().sum();
        assert!(total >= 99 && total <= 100);
    }

    #[test]
    fn test_task_splitter() {
        let splitter = TaskSplitter::new();
        let result = splitter.split_task("task-123".to_string(), TaskType::Coding, 120);

        assert!(result.is_some());
        let split = result.unwrap();
        assert_eq!(split.parent_id, "task-123");
        assert_eq!(split.segments.len(), 4);

        // Check segment IDs are traceable to parent
        assert!(split.segments[0].id.starts_with("task-123"));
    }

    #[test]
    fn test_update_segment_name() {
        let splitter = TaskSplitter::new();
        let mut result = splitter
            .split_task("task-123".to_string(), TaskType::Writing, 60)
            .unwrap();

        let original_name = result.segments[0].name.clone();
        splitter
            .update_segment_name(&mut result, 0, "Custom Name".to_string())
            .unwrap();

        assert_eq!(result.segments[0].name, "Custom Name");
        assert_ne!(result.segments[0].name, original_name);
    }

    #[test]
    fn test_all_task_types_have_templates() {
        let registry = TemplateRegistry::new();

        for task_type in [
            TaskType::Coding,
            TaskType::Writing,
            TaskType::Review,
            TaskType::Admin,
            TaskType::Research,
            TaskType::Design,
        ] {
            assert!(
                registry.get_default_template(task_type).is_some(),
                "Missing template for {:?}",
                task_type
            );
        }
    }

    #[test]
    fn test_task_type_display_names() {
        assert_eq!(TaskType::Coding.display_name(), "Coding");
        assert_eq!(TaskType::Writing.display_name(), "Writing");
        assert_eq!(TaskType::Review.display_name(), "Review");
    }
}
