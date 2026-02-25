//! E2E test module for integration services.
//!
//! Tests use mocked HTTP responses to verify integration behavior
//! without requiring real credentials or external API access.

mod discord_e2e;
mod github_e2e;
mod google_e2e;
mod linear_e2e;
mod notion_e2e;
mod slack_e2e;

/// Mock keyring for testing - stores credentials in memory.
pub mod mock_keyring {
    use std::collections::HashMap;
    use std::sync::{LazyLock, Mutex};

    static STORE: LazyLock<Mutex<HashMap<String, String>>> =
        LazyLock::new(|| Mutex::new(HashMap::new()));

    pub fn get(key: &str) -> Result<Option<String>, Box<dyn std::error::Error>> {
        let store = STORE.lock().unwrap();
        Ok(store.get(key).cloned())
    }

    pub fn set(key: &str, value: &str) -> Result<(), Box<dyn std::error::Error>> {
        let mut store = STORE.lock().unwrap();
        store.insert(key.to_string(), value.to_string());
        Ok(())
    }

    pub fn delete(key: &str) -> Result<(), Box<dyn std::error::Error>> {
        let mut store = STORE.lock().unwrap();
        store.remove(key);
        Ok(())
    }

    pub fn clear() {
        let mut store = STORE.lock().unwrap();
        store.clear();
    }
}

/// Test helpers for creating mock data.
pub mod test_helpers {
    use chrono::Utc;
    use pomodoroom_core::storage::database::SessionRecord;

    pub fn create_test_session(step_label: &str, step_type: &str, duration_min: u64) -> SessionRecord {
        SessionRecord {
            id: 0, // Test ID
            step_label: step_label.to_string(),
            step_type: step_type.to_string(),
            duration_min,
            started_at: Utc::now(),
            completed_at: Utc::now(),
            task_id: None,
            project_id: None,
        }
    }
}
