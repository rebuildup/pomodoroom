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
    let (_stdout, _stderr, code) = result;
    if *code != 0 {
        panic!("{} failed with code {}", context, code);
    }
}

#[test]
fn test_task_create() {
    let output = run_cli(&["task", "create", "Test Task"]);
    assert_success(&output, "test_task_create");
    assert!(output.1.contains("Task created:") || output.1.contains("State:"));
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
    let parsed: Result<serde_json::Value, _> = serde_json::from_str(&output.1);
    assert!(parsed.is_ok(), "Failed to parse JSON");
}

#[test]
fn test_task_start() {
    let _ = run_cli(&["task", "create", "Start Test"]);
    let list_output = run_cli(&["task", "list", "--json"]);
    assert_success(&list_output, "test_task_start list");

    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&list_output.1) {
        if let Some(tasks) = parsed.as_array() {
            if !tasks.is_empty() {
                let task_id = tasks[0]["id"].as_str().unwrap();
                let start_output = run_cli(&["task", "start", task_id]);
                assert_success(&start_output, "test_task_start");
            }
        }
    }
}

#[test]
fn test_task_complete() {
    let _ = run_cli(&["task", "create", "Complete Test"]);
    let list_output = run_cli(&["task", "list", "--json"]);
    assert_success(&list_output, "test_task_complete list");

    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&list_output.1) {
        if let Some(tasks) = parsed.as_array() {
            if !tasks.is_empty() {
                let task_id = tasks[0]["id"].as_str().unwrap();
                let _ = run_cli(&["task", "start", task_id]);
                let complete_output = run_cli(&["task", "complete", task_id]);
                assert_success(&complete_output, "test_task_complete");
            }
        }
    }
}

#[test]
fn test_task_pause() {
    let _ = run_cli(&["task", "create", "Pause Test"]);
    let list_output = run_cli(&["task", "list", "--json"]);
    assert_success(&list_output, "test_task_pause list");

    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&list_output.1) {
        if let Some(tasks) = parsed.as_array() {
            if !tasks.is_empty() {
                let task_id = tasks[0]["id"].as_str().unwrap();
                let _ = run_cli(&["task", "start", task_id]);
                let pause_output = run_cli(&["task", "pause", task_id]);
                assert_success(&pause_output, "test_task_pause");
            }
        }
    }
}

#[test]
fn test_timer_status() {
    let output = run_cli(&["timer", "status"]);
    assert_success(&output, "test_timer_status");
    let parsed: Result<serde_json::Value, _> = serde_json::from_str(&output.1);
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
    let parsed: Result<serde_json::Value, _> = serde_json::from_str(&output.1);
    assert!(parsed.is_ok(), "Failed to parse JSON");
    assert!(parsed.unwrap().is_array(), "Project list should return JSON array");
}
