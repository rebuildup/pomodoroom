//! Common utilities for CLI E2E tests.

use std::process::Command;

/// Invoke a CLI command and return the output.
pub fn run_cli(args: &[&str]) -> (String, String, i32) {
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

/// Invoke a CLI command and expect success.
pub fn run_cli_success(args: &[&str]) -> String {
    let (stdout, stderr, code) = run_cli(args);
    if code != 0 && !stderr.is_empty() {
        eprintln!("CLI error output: {}", stderr);
    }
    assert_eq!(code, 0, "CLI command failed with code {}: {:?}", code, args);
    stdout
}

/// Invoke a CLI command and expect failure.
pub fn run_cli_failure(args: &[&str]) -> (String, String, i32) {
    let (stdout, stderr, code) = run_cli(args);
    assert!(code != 0, "CLI command unexpectedly succeeded: {:?}", args);
    (stdout, stderr, code)
}

/// Parse JSON output from CLI.
pub fn parse_json<T: for<'de> serde::Deserialize<'de>>(json: &str) -> T {
    serde_json::from_str(json).expect("Failed to parse JSON output")
}

/// Check if string contains substring
pub fn assert_contains(haystack: &str, needle: &str) {
    assert!(
        haystack.contains(needle),
        "Expected '{}' to contain '{}'",
        haystack, needle
    );
}

/// Check if JSON has a specific field
pub fn assert_json_field(json: &serde_json::Value, field: &str) {
    if let Some(obj) = json.as_object() {
        assert!(
            obj.contains_key(field),
            "Expected JSON to contain field '{}', got keys: {:?}",
            field,
            obj.keys().collect::<Vec<_>>()
        );
    } else {
        panic!("Expected JSON object, got: {:?}", json);
    }
}
