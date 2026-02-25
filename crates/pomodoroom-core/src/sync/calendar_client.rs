//! Google Calendar API client for sync operations.

use crate::sync::types::{SyncEvent, SyncError, SyncEventType};
use crate::integrations::google::GoogleIntegration;
use crate::integrations::traits::Integration;
use chrono::{DateTime, Utc};
use serde_json::json;

/// Google Calendar API client.
pub struct CalendarClient {
    google: GoogleIntegration,
    calendar_id: Option<String>,
}

impl CalendarClient {
    /// Create new client.
    pub fn new() -> Self {
        Self {
            google: GoogleIntegration::new(),
            calendar_id: None,
        }
    }

    /// Ensure Pomodoroom calendar exists, returning its ID.
    pub fn ensure_pomodoroom_calendar(&mut self) -> Result<String, SyncError> {
        if let Some(ref id) = self.calendar_id {
            return Ok(id.clone());
        }

        if !self.google.is_authenticated() {
            return Err(SyncError::AuthenticationRequired);
        }

        // Try to find existing calendar
        if let Some(id) = self.find_or_create_pomodoroom_calendar()? {
            self.calendar_id = Some(id.clone());
            return Ok(id);
        }

        Err(SyncError::CalendarNotFound)
    }

    /// Find existing Pomodoroom calendar or create new one.
    fn find_or_create_pomodoroom_calendar(&self) -> Result<Option<String>, SyncError> {
        let token = self.google.access_token()
            .map_err(|e| SyncError::CalendarApi(e.to_string()))?;

        // List calendars to find Pomodoroom
        let calendars: serde_json::Value = tokio::runtime::Handle::current()
            .block_on(async {
                reqwest::Client::new()
                    .get("https://www.googleapis.com/calendar/v3/users/me/calendarList")
                    .bearer_auth(&token)
                    .send()
                    .await?
                    .json()
                    .await
            })?;

        if let Some(items) = calendars["items"].as_array() {
            for cal in items {
                if cal["summary"].as_str() == Some("Pomodoroom") {
                    return Ok(cal["id"].as_str().map(|s| s.to_string()));
                }
            }
        }

        // Not found - create new calendar
        let new_cal: serde_json::Value = tokio::runtime::Handle::current()
            .block_on(async {
                reqwest::Client::new()
                    .post("https://www.googleapis.com/calendar/v3/calendars")
                    .bearer_auth(&token)
                    .json(&json!({"summary": "Pomodoroom"}))
                    .send()
                    .await?
                    .json()
                    .await
            })?;

        Ok(new_cal["id"].as_str().map(|s| s.to_string()))
    }

    /// Fetch events since last sync.
    pub fn fetch_events(
        &self,
        since: Option<DateTime<Utc>>,
    ) -> Result<Vec<serde_json::Value>, SyncError> {
        let calendar_id = self.calendar_id.as_ref()
            .ok_or(SyncError::CalendarNotFound)?;
        let token = self.google.access_token()
            .map_err(|e| SyncError::CalendarApi(e.to_string()))?;

        let mut url = format!(
            "https://www.googleapis.com/calendar/v3/calendars/{}/events",
            calendar_id
        );

        let mut params = vec![
            ("singleEvents".to_string(), "true".to_string()),
            ("orderBy".to_string(), "startTime".to_string()),
        ];

        if let Some(since) = since {
            params.push(("timeMin".to_string(), since.to_rfc3339()));
        }

        // Build query string
        let query = params.iter()
            .map(|(k, v)| format!("{}={}", k, urlencoding::encode(v)))
            .collect::<Vec<_>>()
            .join("&");
        url.push('?');
        url.push_str(&query);

        let response: serde_json::Value = tokio::runtime::Handle::current()
            .block_on(async {
                reqwest::Client::new()
                    .get(&url)
                    .bearer_auth(&token)
                    .send()
                    .await?
                    .json()
                    .await
            })?;

        Ok(response["items"]
            .as_array()
            .cloned()
            .unwrap_or_default())
    }

    /// Batch upsert events.
    pub fn batch_upsert(&self, events: &[SyncEvent]) -> Result<(), SyncError> {
        let calendar_id = self.calendar_id.as_ref()
            .ok_or(SyncError::CalendarNotFound)?;

        for event in events {
            let gcal_event = to_gcal_event(event, calendar_id)?;
            self.upsert_event(&gcal_event)?;
        }

        Ok(())
    }

    /// Upsert single event.
    fn upsert_event(&self, event: &serde_json::Value) -> Result<(), SyncError> {
        let calendar_id = self.calendar_id.as_ref()
            .ok_or(SyncError::CalendarNotFound)?;
        let token = self.google.access_token()
            .map_err(|e| SyncError::CalendarApi(e.to_string()))?;

        let event_id = event["extendedProperties"]["private"]["pomodoroom_id"]
            .as_str()
            .ok_or(SyncError::CalendarApi("Missing event ID".into()))?;

        let url = format!(
            "https://www.googleapis.com/calendar/v3/calendars/{}/events/{}",
            calendar_id, event_id
        );

        // Try PUT (update) first, fall back to POST (create)
        let result = tokio::runtime::Handle::current().block_on(async {
            reqwest::Client::new()
                .put(&url)
                .bearer_auth(&token)
                .json(event)
                .send()
                .await
        });

        match result {
            Ok(resp) if resp.status().is_success() => Ok(()),
            Ok(_) => {
                // Not found, try creating
                let url = format!(
                    "https://www.googleapis.com/calendar/v3/calendars/{}/events",
                    calendar_id
                );
                tokio::runtime::Handle::current().block_on(async {
                    reqwest::Client::new()
                        .post(&url)
                        .bearer_auth(&token)
                        .json(event)
                        .send()
                        .await?
                        .error_for_status()
                        .map(|_| ())
                        .map_err(|e| SyncError::CalendarApi(e.to_string()))
                })
            }
            Err(e) => Err(SyncError::CalendarApi(e.to_string())),
        }
    }
}

impl Default for CalendarClient {
    fn default() -> Self {
        Self::new()
    }
}

/// Convert SyncEvent to Google Calendar event format.
///
/// Follows integrator.md §3.2-3.4 specification:
/// - description contains user-friendly text + structured metadata
/// - extendedProperties.private contains machine-readable keys (strings only)
pub fn to_gcal_event(
    event: &SyncEvent,
    _calendar_id: &str,
) -> Result<serde_json::Value, SyncError> {
    let prefix = event.event_type.event_prefix();
    let summary = format!("{} {}", prefix, event.id);

    // Build description with metadata separator (integrator.md §3.3)
    let description = build_description_with_metadata(event);

    // Build extendedProperties (integrator.md §3.4)
    let extended_props = build_extended_properties(event)?;

    // Use updated_at for both start and end (all-day event)
    let date_str = event.updated_at.format("%Y-%m-%d").to_string();

    let mut gcal_event = json!({
        "summary": summary,
        "start": {"date": date_str},
        "end": {"date": date_str},
        "description": description,
        "extendedProperties": {
            "private": extended_props
        }
    });

    if event.deleted {
        gcal_event["status"] = json!("cancelled");
    }

    Ok(gcal_event)
}

/// Build description field with metadata separator (integrator.md §3.3).
fn build_description_with_metadata(event: &SyncEvent) -> String {
    // Extract user-friendly description from data if available
    let user_desc = extract_user_description(&event.data, &event.event_type);

    // Build metadata JSON
    let metadata_json = serde_json::to_string_pretty(&event.data)
        .unwrap_or_else(|_| "{}".to_string());

    // Combine with separator
    format!(
        "{}\n\n───────── pomodoroom-metadata ─────────\n{}",
        user_desc, metadata_json
    )
}

/// Extract user-friendly description from event data.
fn extract_user_description(data: &serde_json::Value, event_type: &SyncEventType) -> String {
    match event_type {
        SyncEventType::Task => {
            data["description"]
                .as_str()
                .or_else(|| data["title"].as_str())
                .unwrap_or("")
                .to_string()
        }
        SyncEventType::Project => {
            data["description"]
                .as_str()
                .unwrap_or("")
                .to_string()
        }
        SyncEventType::Group => {
            data["description"]
                .as_str()
                .unwrap_or("")
                .to_string()
        }
        _ => String::new(),
    }
}

/// Build extendedProperties.private (integrator.md §3.4).
/// All values must be strings (Google Calendar API constraint).
fn build_extended_properties(event: &SyncEvent) -> Result<serde_json::Value, SyncError> {
    let mut props = json!({
        "pomodoroom_version": "1",
        "pomodoroom_id": event.id,
        "pomodoroom_type": format!("{:?}", event.event_type),
        "pomodoroom_updated": event.updated_at.to_rfc3339(),
    });

    // Add type-specific properties (integrator.md §3.4)
    match &event.event_type {
        SyncEventType::Task => {
            if let Some(state) = event.data.get("state").and_then(|v| v.as_str()) {
                props["pomodoroom_state"] = json!(state);
            }
            if let Some(priority) = event.data.get("priority").and_then(|v| v.as_i64()) {
                props["pomodoroom_priority"] = json!(priority.to_string());
            }
            if let Some(energy) = event.data.get("energy").and_then(|v| v.as_str()) {
                props["pomodoroom_energy"] = json!(energy);
            }
            if let Some(project_id) = event.data.get("project_id")
                .or(event.data.get("projectId"))
                .and_then(|v| v.as_str()) {
                props["pomodoroom_project"] = json!(project_id);
            }
        }
        SyncEventType::ScheduleBlock => {
            if let Some(block_type) = event.data.get("block_type")
                .or(event.data.get("blockType"))
                .and_then(|v| v.as_str()) {
                props["pomodoroom_block_type"] = json!(block_type);
            }
            if let Some(task_id) = event.data.get("task_id")
                .or(event.data.get("taskId"))
                .and_then(|v| v.as_str()) {
                props["pomodoroom_task_id"] = json!(task_id);
            }
            if let Some(locked) = event.data.get("locked").and_then(|v| v.as_bool()) {
                props["pomodoroom_locked"] = json!(locked.to_string());
            }
        }
        SyncEventType::Project => {
            // Projects use all-day events (integrator.md §3.6)
        }
        _ => {}
    }

    Ok(props)
}

/// Find Pomodoroom calendar in a list of calendars.
pub fn find_pomodoroom_calendar_in_list(
    calendars: &[serde_json::Value],
) -> Option<String> {
    calendars
        .iter()
        .find(|c| c["summary"].as_str() == Some("Pomodoroom"))
        .and_then(|c| c["id"].as_str())
        .map(|s| s.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync::types::{SyncEvent, SyncEventType};
    use chrono::Utc;

    #[test]
    fn test_calendar_event_from_sync_event() {
        let sync_event = SyncEvent {
            id: "task-123".to_string(),
            event_type: SyncEventType::Task,
            data: serde_json::json!({"title": "Test Task"}),
            updated_at: Utc::now(),
            deleted: false,
        };

        let gcal_event = to_gcal_event(&sync_event, "Pomodoroom").unwrap();
        assert!(gcal_event["summary"].as_str().unwrap().starts_with("[TASK]"));
        assert_eq!(gcal_event["extendedProperties"]["private"]["pomodoroom_id"], "task-123");
    }

    #[test]
    fn test_find_pomodoroom_calendar() {
        // Mock test - actual API calls require auth
        let calendars = vec![
            serde_json::json!({"id": "cal1", "summary": "Personal"}),
            serde_json::json!({"id": "cal2", "summary": "Pomodoroom"}),
        ];
        let found = find_pomodoroom_calendar_in_list(&calendars);
        assert_eq!(found, Some("cal2".to_string()));
    }

    #[test]
    fn test_find_pomodoroom_calendar_not_found() {
        let calendars = vec![
            serde_json::json!({"id": "cal1", "summary": "Personal"}),
            serde_json::json!({"id": "cal2", "summary": "Work"}),
        ];
        let found = find_pomodoroom_calendar_in_list(&calendars);
        assert_eq!(found, None);
    }

    #[test]
    fn test_to_gcal_event_with_deletion() {
        let sync_event = SyncEvent {
            id: "task-456".to_string(),
            event_type: SyncEventType::Task,
            data: serde_json::json!({"title": "Deleted Task"}),
            updated_at: Utc::now(),
            deleted: true,
        };

        let gcal_event = to_gcal_event(&sync_event, "Pomodoroom").unwrap();
        assert_eq!(gcal_event["status"], "cancelled");
    }

    #[test]
    fn test_to_gcal_event_extended_properties() {
        let sync_event = SyncEvent {
            id: "session-789".to_string(),
            event_type: SyncEventType::Session,
            data: serde_json::json!({"duration": 25}),
            updated_at: Utc::now(),
            deleted: false,
        };

        let gcal_event = to_gcal_event(&sync_event, "Pomodoroom").unwrap();
        let props = &gcal_event["extendedProperties"]["private"];

        assert_eq!(props["pomodoroom_type"], "Session");
        assert_eq!(props["pomodoroom_id"], "session-789");
        assert_eq!(props["pomodoroom_version"], "1");
    }

    #[test]
    fn test_to_gcal_event_with_metadata_separator() {
        let sync_event = SyncEvent {
            id: "task-with-desc".to_string(),
            event_type: SyncEventType::Task,
            data: serde_json::json!({
                "title": "Test Task",
                "description": "User description here",
                "state": "READY",
                "priority": 75,
                "energy": "high"
            }),
            updated_at: Utc::now(),
            deleted: false,
        };

        let gcal_event = to_gcal_event(&sync_event, "Pomodoroom").unwrap();
        let description = gcal_event["description"].as_str().unwrap();

        // Check separator exists
        assert!(description.contains("───────── pomodoroom-metadata ─────────"));
        // Check user description is included
        assert!(description.contains("User description here"));
        // Check JSON metadata is included
        assert!(description.contains("\"title\":"));
        assert!(description.contains("\"state\":"));

        // Check extendedProperties
        let props = &gcal_event["extendedProperties"]["private"];
        assert_eq!(props["pomodoroom_state"], "READY");
        assert_eq!(props["pomodoroom_priority"], "75");
        assert_eq!(props["pomodoroom_energy"], "high");
    }

    #[test]
    fn test_to_gcal_event_schedule_block_extended_props() {
        let sync_event = SyncEvent {
            id: "block-123".to_string(),
            event_type: SyncEventType::ScheduleBlock,
            data: serde_json::json!({
                "block_type": "focus",
                "task_id": "task-456",
                "locked": true
            }),
            updated_at: Utc::now(),
            deleted: false,
        };

        let gcal_event = to_gcal_event(&sync_event, "Pomodoroom").unwrap();
        let props = &gcal_event["extendedProperties"]["private"];

        assert_eq!(props["pomodoroom_block_type"], "focus");
        assert_eq!(props["pomodoroom_task_id"], "task-456");
        assert_eq!(props["pomodoroom_locked"], "true");
    }
}
