//! Basic CLI E2E tests.
//!
//! Tests invoke CLI commands via cargo run and verify outputs.

use std::process::Command;

/// Run a CLI command and return output.
fn run_cli(args: &[&str]) -> (String, String, i32) {
    let output = Command::new("cargo")
        .args(["run", "-p", "pomodoroom-cli", "--"])
        .args(args)
        .output()
        .expect("Failed to execute CLI command");

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let code = output.status.code().unwrap_or(-1);

    (stdout, stderr, code)
}

/// Assert command succeeded.
fn assert_success(result: &(String, String, i32), context: &str) {
    let (stdout, stderr, code) = result;
    if *code != 0 {
        panic!(
            "{} failed with code {}\nSTDOUT:\n{}\nSTDERR:\n{}",
            context, code, stdout, stderr
        );
    }
}

#[test]
fn test_task_create() {
    let output = run_cli(&["task", "create", "Test Task"]);
    assert_success(&output, "test_task_create");
    assert!(output.0.contains("Task created:") || output.0.contains("State:"));
}

#[test]
fn test_task_list() {
    let output = run_cli(&["task", "list"]);
    assert_success(&output, "test_task_list");
}

#[test]
fn test_task_list_json() {
    let output = run_cli(&["task", "list", "--json"]);
    assert_success(&output, "test_task_list_json");
    let parsed: Result<serde_json::Value, _> = serde_json::from_str(&output.0);
    assert!(parsed.is_ok(), "Failed to parse JSON");
}

#[test]
fn test_task_lifecycle() {
    // robust test using unique task
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_micros();
    let title = format!("Lifecycle Task {}", now);

    let _ = run_cli(&["task", "create", &title]);

    // Find ID
    let list_output = run_cli(&["task", "list", "--json"]);
    assert_success(&list_output, "list");
    let parsed: serde_json::Value =
        serde_json::from_str(&list_output.0).expect("Failed to parse JSON");
    let task_id = parsed
        .as_array()
        .expect("Tasks array")
        .iter()
        .find(|t| t["title"].as_str() == Some(&title))
        .expect("Created task not found")["id"]
        .as_str()
        .unwrap()
        .to_string();

    // Start
    let start_output = run_cli(&["task", "start", &task_id]);
    assert_success(&start_output, "start");

    // Pause
    let pause_output = run_cli(&["task", "pause", &task_id]);
    assert_success(&pause_output, "pause");

    // Resume
    let resume_output = run_cli(&["task", "resume", &task_id]);
    assert_success(&resume_output, "resume");

    // Complete
    let complete_output = run_cli(&["task", "complete", &task_id]);
    assert_success(&complete_output, "complete");
}

#[test]
fn test_timer_status() {
    let output = run_cli(&["timer", "status"]);
    assert_success(&output, "test_timer_status");
    let parsed: Result<serde_json::Value, _> = serde_json::from_str(&output.0);
    assert!(parsed.is_ok(), "Failed to parse JSON");
    assert!(parsed.unwrap().is_object(), "Timer status should be object");
}

#[test]
fn test_timer_start() {
    let output = run_cli(&["timer", "start"]);
    assert_success(&output, "test_timer_start");
}

#[test]
fn test_timer_pause() {
    let _ = run_cli(&["timer", "start"]);
    let output = run_cli(&["timer", "pause"]);
    assert_success(&output, "test_timer_pause");
}

#[test]
fn test_timer_reset() {
    let output = run_cli(&["timer", "reset"]);
    assert_success(&output, "test_timer_reset");
}

#[test]
fn test_config_get() {
    let output = run_cli(&["config", "get", "ui.dark_mode"]);
    assert_success(&output, "test_config_get");
}

#[test]
fn test_config_set() {
    let output = run_cli(&["config", "set", "ui.dark_mode", "true"]);
    assert_success(&output, "test_config_set");
}

#[test]
fn test_config_list() {
    let output = run_cli(&["config", "list"]);
    assert_success(&output, "test_config_list");
}

#[test]
fn test_stats_today() {
    let output = run_cli(&["stats", "today"]);
    assert_success(&output, "test_stats_today");
}

#[test]
fn test_stats_all() {
    let output = run_cli(&["stats", "all"]);
    assert_success(&output, "test_stats_all");
}

#[test]
fn test_schedule_generate() {
    let output = run_cli(&["schedule", "generate"]);
    assert_success(&output, "test_schedule_generate");
}

#[test]
fn test_schedule_show() {
    let output = run_cli(&["schedule", "show"]);
    assert_success(&output, "test_schedule_show");
}

#[test]
fn test_project_create() {
    let output = run_cli(&["project", "create", "Test Project"]);
    assert_success(&output, "test_project_create");
}

#[test]
fn test_project_list() {
    let output = run_cli(&["project", "list"]);
    assert_success(&output, "test_project_list");
    let parsed: Result<serde_json::Value, _> = serde_json::from_str(&output.0);
    assert!(parsed.is_ok(), "Failed to parse JSON");
    assert!(
        parsed.unwrap().is_array(),
        "Project list should return JSON array"
    );
}

#[test]
fn test_timer_skip() {
    // Start timer first
    let _ = run_cli(&["timer", "start"]);
    // Then skip to next step
    let output = run_cli(&["timer", "skip"]);
    assert_success(&output, "test_timer_skip");
}

#[test]
fn test_task_update() {
    // Create a task first
    let create_output = run_cli(&["task", "create", "Task to Update"]);
    assert_success(&create_output, "test_task_update create");

    // Get the task ID
    let list_output = run_cli(&["task", "list", "--json"]);
    assert_success(&list_output, "test_task_update list");

    let task_id = if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&list_output.0) {
        if let Some(tasks) = parsed.as_array() {
            tasks
                .iter()
                .find(|t| t["title"].as_str() == Some("Task to Update"))
                .and_then(|t| t["id"].as_str())
                .map(|s| s.to_string())
        } else {
            None
        }
    } else {
        None
    };

    if let Some(task_id) = task_id {
        // Update the task
        let update_output = run_cli(&["task", "update", &task_id, "--title", "Updated Task Title"]);
        assert_success(&update_output, "test_task_update update");
    }
}

#[test]
fn test_config_reset() {
    // Reset config to defaults
    let output = run_cli(&["config", "reset"]);
    assert_success(&output, "test_config_reset");
}
