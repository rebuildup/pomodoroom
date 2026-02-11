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

#[test]
fn test_task_create() {
    let output = run_cli(&["task", "create", "Test Task"]);
    assert!(output.0 == 0, "Task create failed");
    assert!(output.1.contains("Task created:") || output.1.contains("State:"));
}

#[test]
fn test_task_list() {
    let output = run_cli(&["task", "list"]);
    assert!(output.0 == 0, "Task list failed");
}

#[test]
fn test_task_list_json() {
    let output = run_cli(&["task", "list", "--json"]);
    assert!(output.0 == 0, "Task list JSON failed");
}

#[test]
fn test_task_start() {
    let _ = run_cli(&["task", "create", "Start Test"]);
    let list_output = run_cli(&["task", "list"]);
    assert!(list_output.0 == 0, "Task list failed");

    let list_output = run_cli(&["task", "list", "--json"]);
    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&list_output.1) {
        if let Some(tasks) = parsed.as_array() {
            if !tasks.is_empty() {
                let task_id = tasks[0]["id"].as_str().unwrap();
                let start_output = run_cli(&["task", "start", task_id]);
                assert!(start_output.0 == 0, "Task start failed");
            }
        }
    }
}

#[test]
fn test_task_complete() {
    let _ = run_cli(&["task", "create", "Complete Test"]);
    let list_output = run_cli(&["task", "list"]);
    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&list_output.1) {
        if let Some(tasks) = parsed.as_array() {
            if !tasks.is_empty() {
                let task_id = tasks[0]["id"].as_str().unwrap();
                let _ = run_cli(&["task", "start", task_id]);
                let complete_output = run_cli(&["task", "complete", task_id]);
                assert!(complete_output.0 == 0, "Task complete failed");
            }
        }
    }
}

#[test]
fn test_task_pause() {
    let _ = run_cli(&["task", "create", "Pause Test"]);
    let list_output = run_cli(&["task", "list"]);
    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&list_output.1) {
        if let Some(tasks) = parsed.as_array() {
            if !tasks.is_empty() {
                let task_id = tasks[0]["id"].as_str().unwrap();
                let _ = run_cli(&["task", "start", task_id]);
                let pause_output = run_cli(&["task", "pause", task_id]);
                assert!(pause_output.0 == 0, "Task pause failed");
            }
        }
    }
}

#[test]
fn test_timer_status() {
    let output = run_cli(&["timer", "status"]);
    assert!(output.0 == 0, "Timer status failed");
}

#[test]
fn test_timer_start() {
    let output = run_cli(&["timer", "start"]);
    assert!(output.0 == 0, "Timer start failed");
}

#[test]
fn test_timer_pause() {
    let _ = run_cli(&["timer", "start"]);
    let output = run_cli(&["timer", "pause"]);
    assert!(output.0 == 0, "Timer pause failed");
}

#[test]
fn test_timer_reset() {
    let output = run_cli(&["timer", "reset"]);
    assert!(output.0 == 0, "Timer reset failed");
}

#[test]
fn test_config_get() {
    let output = run_cli(&["config", "get", "ui.dark_mode"]);
    assert!(output.0 == 0, "Config get failed");
}

#[test]
fn test_config_set() {
    let output = run_cli(&["config", "set", "ui.dark_mode", "true"]);
    assert!(output.0 == 0, "Config set failed");
}

#[test]
fn test_config_list() {
    let output = run_cli(&["config", "list"]);
    assert!(output.0 == 0, "Config list failed");
}

#[test]
fn test_stats_today() {
    let output = run_cli(&["stats", "today"]);
    assert!(output.0 == 0, "Stats today failed");
}

#[test]
fn test_stats_all() {
    let output = run_cli(&["stats", "all"]);
    assert!(output.0 == 0, "Stats all failed");
}

#[test]
fn test_schedule_generate() {
    let output = run_cli(&["schedule", "generate"]);
    assert!(output.0 == 0, "Schedule generate failed");
}

#[test]
fn test_schedule_show() {
    let output = run_cli(&["schedule", "show"]);
    assert!(output.0 == 0, "Schedule show failed");
}

#[test]
fn test_project_create() {
    let output = run_cli(&["project", "create", "Test Project"]);
    assert!(output.0 == 0, "Project create failed");
}

#[test]
fn test_project_list() {
    let output = run_cli(&["project", "list"]);
    assert!(output.0 == 0, "Project list failed");
}
