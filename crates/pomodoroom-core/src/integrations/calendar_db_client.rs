//! CalendarDbClient: Google Calendar append-only operations.

use chrono::{DateTime, Duration, Utc};
use reqwest::Client;
use serde_json::json;

use super::calendar_db::{
    CalendarCheckpoint, CalendarDbConfig, CalendarEventPayload, CalendarEventType, CalendarLogEntry,
    CalendarLogStats,
};
use super::oauth::{self, OAuthConfig};

/// Client for Calendar-DB operations.
pub struct CalendarDbClient {
    config: CalendarDbConfig,
    oauth_config: OAuthConfig,
    http_client: Client,
}

impl CalendarDbClient {
    /// Create a new CalendarDbClient.
    pub fn new(config: CalendarDbConfig, oauth_config: OAuthConfig) -> Self {
        Self {
            config,
            oauth_config,
            http_client: Client::new(),
        }
    }

    /// Get access token, refreshing if necessary.
    async fn access_token(&self) -> Result<String, Box<dyn std::error::Error>> {
        let tokens = oauth::load_tokens("google").ok_or("Not authenticated with Google")?;

        if !oauth::is_expired(&tokens) {
            return Ok(tokens.access_token);
        }

        let refresh_token = tokens
            .refresh_token
            .as_deref()
            .ok_or("No refresh token available")?;

        let refreshed = oauth::refresh_token(&self.oauth_config, refresh_token).await?;
        Ok(refreshed.access_token)
    }

    /// Create a dedicated calendar for Pomodoroom event logs.
    pub async fn create_calendar(&mut self) -> Result<String, Box<dyn std::error::Error>> {
        let token = self.access_token().await?;

        let body = json!({
            "summary": &self.config.calendar_name,
            "description": "Pomodoroom append-only event log calendar",
            "timeZone": "UTC",
        });

        let resp: serde_json::Value = self
            .http_client
            .post("https://www.googleapis.com/calendar/v3/calendars")
            .bearer_auth(&token)
            .json(&body)
            .send()
            .await?
            .json()
            .await?;

        if let Some(err) = resp.get("error") {
            return Err(format!("Failed to create calendar: {err}").into());
        }

        let calendar_id = resp["id"]
            .as_str()
            .ok_or("Missing calendar ID in response")?;

        self.config.calendar_id = calendar_id.to_string();
        self.config.enabled = true;

        Ok(calendar_id.to_string())
    }

    /// Append an event to the calendar log.
    pub async fn append_event(
        &self,
        payload: &CalendarEventPayload,
    ) -> Result<String, Box<dyn std::error::Error>> {
        if !self.config.enabled || self.config.calendar_id.is_empty() {
            return Err("Calendar-DB not configured".into());
        }

        let token = self.access_token().await?;

        // Use a short duration event to represent the log entry
        let now = Utc::now();
        let end = now + Duration::minutes(1);

        let payload_json = payload.to_json()?;

        let body = json!({
            "summary": format!("[{}] {}", payload.event_type.as_str(), payload.entity_id),
            "description": payload_json,
            "start": {
                "dateTime": now.to_rfc3339(),
            },
            "end": {
                "dateTime": end.to_rfc3339(),
            },
            "extendedProperties": {
                "private": {
                    "pomodoroom_event_type": payload.event_type.as_str(),
                    "pomodoroom_entity_id": &payload.entity_id,
                    "pomodoroom_lamport_ts": payload.lamport_ts.to_string(),
                    "pomodoroom_version": payload.version.to_string(),
                    "pomodoroom_device_id": &payload.device_id,
                }
            }
        });

        let url = format!(
            "https://www.googleapis.com/calendar/v3/calendars/{}/events",
            self.config.calendar_id
        );

        let resp: serde_json::Value = self
            .http_client
            .post(&url)
            .bearer_auth(&token)
            .json(&body)
            .send()
            .await?
            .json()
            .await?;

        if let Some(err) = resp.get("error") {
            return Err(format!("Failed to append event: {err}").into());
        }

        let event_id = resp["id"]
            .as_str()
            .ok_or("Missing event ID in response")?;

        Ok(event_id.to_string())
    }

    /// Replay events from a given timestamp.
    pub async fn replay_events(
        &self,
        since: Option<DateTime<Utc>>,
    ) -> Result<Vec<CalendarLogEntry>, Box<dyn std::error::Error>> {
        if !self.config.enabled || self.config.calendar_id.is_empty() {
            return Ok(Vec::new());
        }

        let token = self.access_token().await?;

        let time_min = since
            .map(|dt| dt.to_rfc3339())
            .unwrap_or_else(|| "1970-01-01T00:00:00Z".to_string());

        let url = format!(
            "https://www.googleapis.com/calendar/v3/calendars/{}/events",
            self.config.calendar_id
        );

        let mut entries = Vec::new();
        let mut page_token: Option<String> = None;

        loop {
            let mut request = self
                .http_client
                .get(&url)
                .bearer_auth(&token)
                .query(&[
                    ("timeMin", &time_min),
                    ("orderBy", &"startTime".to_string()),
                    ("singleEvents", &"true".to_string()),
                    ("maxResults", &"250".to_string()),
                ]);

            if let Some(token) = &page_token {
                request = request.query(&[("pageToken", token)]);
            }

            let resp: serde_json::Value = request.send().await?.json().await?;

            if let Some(err) = resp.get("error") {
                return Err(format!("Failed to fetch events: {err}").into());
            }

            if let Some(items) = resp["items"].as_array() {
                for item in items {
                    if let Some(entry) = self.parse_event(item)? {
                        entries.push(entry);
                    }
                }
            }

            page_token = resp["nextPageToken"].as_str().map(|s| s.to_string());

            if page_token.is_none() {
                break;
            }
        }

        // Sort by Lamport timestamp for causal ordering
        entries.sort_by_key(|e| e.payload.lamport_ts);

        Ok(entries)
    }

    /// Parse a calendar event into a log entry.
    fn parse_event(&self, event: &serde_json::Value) -> Result<Option<CalendarLogEntry>, Box<dyn std::error::Error>> {
        let event_id = event["id"].as_str();
        let description = event["description"].as_str();
        let created = event["created"].as_str();

        match (event_id, description, created) {
            (Some(id), Some(desc), Some(created_str)) => {
                let payload = CalendarEventPayload::from_json(desc)?;
                let created_at = DateTime::parse_from_rfc3339(created_str)?
                    .with_timezone(&Utc);

                Ok(Some(CalendarLogEntry {
                    log_id: id.to_string(),
                    created_at,
                    payload,
                }))
            }
            _ => Ok(None),
        }
    }

    /// Get log statistics.
    pub async fn get_stats(&self) -> Result<CalendarLogStats, Box<dyn std::error::Error>> {
        let entries = self.replay_events(None).await?;

        let mut stats = CalendarLogStats::default();
        stats.total_events = entries.len();

        for entry in &entries {
            *stats
                .events_by_type
                .entry(entry.payload.event_type.clone())
                .or_insert(0) += 1;

            if stats.oldest_event.is_none() || Some(entry.created_at) < stats.oldest_event {
                stats.oldest_event = Some(entry.created_at);
            }

            if stats.newest_event.is_none() || Some(entry.created_at) > stats.newest_event {
                stats.newest_event = Some(entry.created_at);
            }
        }

        Ok(stats)
    }

    /// Create a checkpoint event.
    pub async fn create_checkpoint(
        &self,
        state_snapshot: serde_json::Value,
    ) -> Result<CalendarCheckpoint, Box<dyn std::error::Error>> {
        let entries = self.replay_events(None).await?;
        let max_lamport = entries.iter().map(|e| e.payload.lamport_ts).max().unwrap_or(0);
        let last_log_id = entries.last().map(|e| e.log_id.clone()).unwrap_or_default();

        let checkpoint = CalendarCheckpoint {
            id: format!("checkpoint_{}", Utc::now().timestamp()),
            created_at: Utc::now(),
            last_log_id,
            lamport_ts: max_lamport,
            state_snapshot,
        };

        let payload = CalendarEventPayload::new(
            CalendarEventType::Checkpoint,
            &checkpoint.id,
            serde_json::to_value(&checkpoint)?,
            &self.config.device_id,
        ).with_lamport_ts(max_lamport + 1);

        self.append_event(&payload).await?;

        Ok(checkpoint)
    }

    /// Get the current configuration.
    pub fn config(&self) -> &CalendarDbConfig {
        &self.config
    }

    /// Update configuration.
    pub fn set_config(&mut self, config: CalendarDbConfig) {
        self.config = config;
    }
}

impl CalendarEventType {
    /// Get string representation for storage.
    fn as_str(&self) -> &'static str {
        match self {
            CalendarEventType::TaskCreated => "task_created",
            CalendarEventType::TaskUpdated => "task_updated",
            CalendarEventType::TaskStateChanged => "task_state_changed",
            CalendarEventType::TaskDeleted => "task_deleted",
            CalendarEventType::SessionStarted => "session_started",
            CalendarEventType::SessionCompleted => "session_completed",
            CalendarEventType::Checkpoint => "checkpoint",
            CalendarEventType::ConfigChanged => "config_changed",
        }
    }
}

use std::str::FromStr;

impl FromStr for CalendarEventType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "task_created" => Ok(CalendarEventType::TaskCreated),
            "task_updated" => Ok(CalendarEventType::TaskUpdated),
            "task_state_changed" => Ok(CalendarEventType::TaskStateChanged),
            "task_deleted" => Ok(CalendarEventType::TaskDeleted),
            "session_started" => Ok(CalendarEventType::SessionStarted),
            "session_completed" => Ok(CalendarEventType::SessionCompleted),
            "checkpoint" => Ok(CalendarEventType::Checkpoint),
            "config_changed" => Ok(CalendarEventType::ConfigChanged),
            _ => Err(format!("Unknown event type: {}", s)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_event_type_as_str() {
        assert_eq!(CalendarEventType::TaskCreated.as_str(), "task_created");
        assert_eq!(CalendarEventType::Checkpoint.as_str(), "checkpoint");
    }

    #[test]
    fn test_event_type_from_str() {
        assert_eq!(
            CalendarEventType::from_str("task_created").unwrap(),
            CalendarEventType::TaskCreated
        );
        assert!(CalendarEventType::from_str("unknown").is_err());
    }
}
