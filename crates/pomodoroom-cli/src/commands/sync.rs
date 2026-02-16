//! Sync subcommand for integrating with external services.
//!
//! Replaces legacy "Would sync" placeholders with concrete sync flows.

use std::{collections::HashMap, error::Error};

use chrono::Utc;
use clap::Subcommand;
use pomodoroom_core::{
    integrations::{
        google::GoogleIntegration,
        oauth::{self, OAuthConfig},
        Integration,
    },
    storage::schedule_db::ScheduleDb,
    task::{Task, TaskState},
};
use reqwest::Client;
use serde_json::Value;

fn encode_component(input: &str) -> String {
    url::form_urlencoded::byte_serialize(input.as_bytes()).collect()
}

/// Sync actions for external services.
#[derive(Subcommand)]
pub enum SyncAction {
    /// Synchronize with a specific service
    Service {
        /// Service name (google, notion, linear, github, discord, slack)
        service: String,
        /// Preview changes without applying them
        #[arg(long)]
        dry_run: bool,
    },
    /// Synchronize with all authenticated services
    All {
        /// Preview changes without applying them
        #[arg(long)]
        dry_run: bool,
    },
    /// Show sync status for all services
    Status {
        /// Optional service name to check status for specific service
        #[arg(short, long)]
        service: Option<String>,
    },
}

#[derive(Debug, Clone)]
struct LocalTaskSnapshot {
    title: String,
    description: Option<String>,
    state: TaskState,
}

#[derive(Debug, Clone)]
struct RemoteTaskSnapshot {
    external_id: String,
    list_title: String,
    title: String,
    notes: Option<String>,
    state: TaskState,
}

#[derive(Debug, Clone, Copy)]
enum SyncChangeKind {
    Create,
    Update,
    Unchanged,
}

#[derive(Debug, Default)]
struct SyncSummary {
    fetched: usize,
    creates: usize,
    updates: usize,
    unchanged: usize,
}

/// Run the sync command.
pub fn run(action: SyncAction) -> Result<(), Box<dyn Error>> {
    match action {
        SyncAction::Service { service, dry_run } => run_service_sync(&service, dry_run)?,
        SyncAction::All { dry_run } => run_all_sync(dry_run)?,
        SyncAction::Status { service } => show_status(service)?,
    }
    Ok(())
}

/// Run sync for a specific service.
fn run_service_sync(service: &str, dry_run: bool) -> Result<(), Box<dyn Error>> {
    let service_lower = service.to_lowercase();
    if dry_run {
        println!("Dry run mode for {service}");
    }

    match service_lower.as_str() {
        "google" => sync_google(dry_run)?,
        "notion" => sync_notion(dry_run)?,
        "linear" => sync_linear(dry_run)?,
        "github" => sync_github(dry_run)?,
        "discord" => sync_discord(dry_run)?,
        "slack" => sync_slack(dry_run)?,
        _ => {
            return Err(format!(
                "Unknown service: {service}. Valid services: google, notion, linear, github, discord, slack"
            )
            .into())
        }
    }
    Ok(())
}

/// Run sync for all authenticated services.
fn run_all_sync(dry_run: bool) -> Result<(), Box<dyn Error>> {
    println!("Syncing all authenticated services...");
    let services = ["google", "notion", "linear", "github", "discord", "slack"];
    let mut synced: Vec<&str> = vec![];
    let mut skipped: Vec<&str> = vec![];

    for service in services {
        let is_auth = match service {
            "google" => GoogleIntegration::new().is_authenticated(),
            "notion" => {
                use pomodoroom_core::integrations::notion::NotionIntegration;
                NotionIntegration::new().is_authenticated()
            }
            "linear" => {
                use pomodoroom_core::integrations::linear::LinearIntegration;
                LinearIntegration::new().is_authenticated()
            }
            "github" => {
                use pomodoroom_core::integrations::github::GitHubIntegration;
                GitHubIntegration::new().is_authenticated()
            }
            "discord" => {
                use pomodoroom_core::integrations::discord::DiscordIntegration;
                DiscordIntegration::new().is_authenticated()
            }
            "slack" => {
                use pomodoroom_core::integrations::slack::SlackIntegration;
                SlackIntegration::new().is_authenticated()
            }
            _ => false,
        };

        if !is_auth {
            skipped.push(service);
            continue;
        }

        match run_service_sync(service, dry_run) {
            Ok(_) => synced.push(service),
            Err(e) => eprintln!("  {service}: sync failed - {e}"),
        }
    }

    if dry_run {
        println!("\nDry run complete.");
    } else {
        println!("\nSynced: {}", synced.join(", "));
    }
    if !skipped.is_empty() {
        println!("Skipped (not authenticated): {}", skipped.join(", "));
    }
    Ok(())
}

/// Show sync status for all or a specific service.
fn show_status(service: Option<String>) -> Result<(), Box<dyn Error>> {
    if let Some(s) = service {
        let s_lower = s.to_lowercase();
        match s_lower.as_str() {
            "google" => show_service_status("Google", "google"),
            "notion" => show_service_status("Notion", "notion"),
            "linear" => show_service_status("Linear", "linear"),
            "github" => show_service_status("GitHub", "github"),
            "discord" => show_service_status("Discord", "discord"),
            "slack" => show_service_status("Slack", "slack"),
            _ => return Err(format!("Unknown service: {s}").into()),
        }
    } else {
        println!("Sync Status:\n");
        for (display_name, service_name) in [
            ("Google", "google"),
            ("Notion", "notion"),
            ("Linear", "linear"),
            ("GitHub", "github"),
            ("Discord", "discord"),
            ("Slack", "slack"),
        ] {
            show_service_status(display_name, service_name);
            println!();
        }
    }
    Ok(())
}

/// Show status for a specific service.
fn show_service_status(display_name: &str, service_name: &str) {
    let (is_auth, status) = match service_name {
        "google" => (GoogleIntegration::new().is_authenticated(), "authenticated".to_string()),
        "notion" => {
            use pomodoroom_core::integrations::notion::NotionIntegration;
            (NotionIntegration::new().is_authenticated(), "authenticated".to_string())
        }
        "linear" => {
            use pomodoroom_core::integrations::linear::LinearIntegration;
            (LinearIntegration::new().is_authenticated(), "authenticated".to_string())
        }
        "github" => {
            use pomodoroom_core::integrations::github::GitHubIntegration;
            (GitHubIntegration::new().is_authenticated(), "authenticated".to_string())
        }
        "discord" => {
            use pomodoroom_core::integrations::discord::DiscordIntegration;
            (DiscordIntegration::new().is_authenticated(), "configured".to_string())
        }
        "slack" => {
            use pomodoroom_core::integrations::slack::SlackIntegration;
            (SlackIntegration::new().is_authenticated(), "authenticated".to_string())
        }
        _ => (false, "unknown".to_string()),
    };

    print!("{display_name}: ");
    if is_auth {
        println!("{status}");
    } else {
        println!("not {status}");
    }
}

fn classify_sync_change(remote: &RemoteTaskSnapshot, existing: Option<&LocalTaskSnapshot>) -> SyncChangeKind {
    match existing {
        None => SyncChangeKind::Create,
        Some(local) => {
            if local.title == remote.title
                && local.description == remote.notes
                && local.state == remote.state
            {
                SyncChangeKind::Unchanged
            } else {
                SyncChangeKind::Update
            }
        }
    }
}

fn build_task_from_remote(remote: &RemoteTaskSnapshot, existing: Option<&LocalTaskSnapshot>) -> Task {
    let now = Utc::now();
    let mut task = Task::new(remote.title.clone());
    task.description = remote.notes.clone();
    task.tags = vec!["google_tasks".to_string(), format!("google_list:{}", remote.list_title)];
    task.estimated_minutes = Some(25);
    task.required_minutes = Some(25);
    task.source_service = Some("google_tasks".to_string());
    task.source_external_id = Some(remote.external_id.clone());
    task.updated_at = now;

    let mut state = remote.state;
    if let Some(local) = existing {
        if matches!(local.state, TaskState::Running | TaskState::Paused) && remote.state == TaskState::Ready {
            state = local.state;
        }
    }

    task.state = state;
    if state == TaskState::Done {
        task.completed = true;
        task.completed_at = Some(now);
    } else {
        task.completed = false;
        task.completed_at = None;
    }
    task
}

fn read_google_tokens() -> Result<oauth::OAuthTokens, Box<dyn Error>> {
    oauth::load_tokens("google").ok_or_else(|| "Google OAuth token not found".into())
}

fn build_google_oauth_config() -> Result<OAuthConfig, Box<dyn Error>> {
    let client_id = pomodoroom_core::integrations::keyring_store::get("google_client_id")?
        .ok_or("Google client_id is not configured")?;
    let client_secret = pomodoroom_core::integrations::keyring_store::get("google_client_secret")?
        .ok_or("Google client_secret is not configured")?;

    Ok(OAuthConfig {
        service_name: "google".to_string(),
        client_id,
        client_secret,
        auth_url: "https://accounts.google.com/o/oauth2/v2/auth".to_string(),
        token_url: "https://oauth2.googleapis.com/token".to_string(),
        scopes: vec![
            "https://www.googleapis.com/auth/tasks".to_string(),
            "https://www.googleapis.com/auth/tasks.readonly".to_string(),
        ],
        redirect_port: 19821,
    })
}

fn get_google_access_token() -> Result<String, Box<dyn Error>> {
    let tokens = read_google_tokens()?;
    if !oauth::is_expired(&tokens) {
        return Ok(tokens.access_token);
    }
    let refresh_token = tokens
        .refresh_token
        .as_deref()
        .ok_or("Google refresh token is missing")?;
    let config = build_google_oauth_config()?;
    let rt = tokio::runtime::Runtime::new()?;
    let refreshed = rt.block_on(async { oauth::refresh_token(&config, refresh_token).await })?;
    Ok(refreshed.access_token)
}

fn parse_remote_task(list_id: &str, list_title: &str, raw: &Value) -> Option<RemoteTaskSnapshot> {
    let task_id = raw.get("id")?.as_str()?.trim();
    if task_id.is_empty() {
        return None;
    }
    let title = raw
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("(untitled)")
        .trim()
        .to_string();
    let notes = raw
        .get("notes")
        .and_then(Value::as_str)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let status = raw
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("needsAction");
    let state = if status.eq_ignore_ascii_case("completed") {
        TaskState::Done
    } else {
        TaskState::Ready
    };
    Some(RemoteTaskSnapshot {
        external_id: format!("{list_id}:{task_id}"),
        list_title: list_title.to_string(),
        title,
        notes,
        state,
    })
}

fn fetch_google_remote_tasks(access_token: &str) -> Result<Vec<RemoteTaskSnapshot>, Box<dyn Error>> {
    let token = access_token.to_string();
    let rt = tokio::runtime::Runtime::new()?;
    rt.block_on(async move {
        let client = Client::new();
        let lists_resp = client
            .get("https://www.googleapis.com/tasks/v1/users/@me/lists")
            .bearer_auth(&token)
            .send()
            .await?;
        if !lists_resp.status().is_success() {
            return Err(format!("Google Tasks list API failed: {}", lists_resp.status()).into());
        }
        let lists_json: Value = lists_resp.json().await?;
        let mut tasks = Vec::new();

        if let Some(lists) = lists_json.get("items").and_then(Value::as_array) {
            for list in lists {
                let list_id = match list.get("id").and_then(Value::as_str) {
                    Some(v) if !v.trim().is_empty() => v,
                    _ => continue,
                };
                let list_title = list
                    .get("title")
                    .and_then(Value::as_str)
                    .unwrap_or("untitled-list");
                let tasks_resp = client
                    .get(format!(
                        "https://www.googleapis.com/tasks/v1/lists/{}/tasks",
                        encode_component(list_id)
                    ))
                    .query(&[("showCompleted", "true"), ("showHidden", "false")])
                    .bearer_auth(&token)
                    .send()
                    .await?;
                if !tasks_resp.status().is_success() {
                    continue;
                }
                let tasks_json: Value = tasks_resp.json().await?;
                if let Some(items) = tasks_json.get("items").and_then(Value::as_array) {
                    for raw_task in items {
                        if let Some(task) = parse_remote_task(list_id, list_title, raw_task) {
                            tasks.push(task);
                        }
                    }
                }
            }
        }
        Ok(tasks)
    })
}

fn load_existing_google_snapshots(
    db: &ScheduleDb,
) -> Result<HashMap<String, LocalTaskSnapshot>, Box<dyn Error>> {
    let tasks = db.list_tasks()?;
    let mut map = HashMap::new();
    for task in tasks {
        if task.source_service.as_deref() != Some("google_tasks") {
            continue;
        }
        let Some(source_id) = task.source_external_id.clone() else {
            continue;
        };
        map.insert(
            source_id,
            LocalTaskSnapshot {
                title: task.title,
                description: task.description,
                state: task.state,
            },
        );
    }
    Ok(map)
}

fn sync_google(dry_run: bool) -> Result<(), Box<dyn Error>> {
    let integration = GoogleIntegration::new();
    if !integration.is_authenticated() {
        return Err("Google is not authenticated. Run 'pomodoroom-cli auth login google' first.".into());
    }

    let access_token = get_google_access_token()?;
    let remote_tasks = fetch_google_remote_tasks(&access_token)?;
    let db = ScheduleDb::open()?;
    let existing = load_existing_google_snapshots(&db)?;

    let mut summary = SyncSummary {
        fetched: remote_tasks.len(),
        ..SyncSummary::default()
    };

    for remote in &remote_tasks {
        let existing_snapshot = existing.get(&remote.external_id);
        match classify_sync_change(remote, existing_snapshot) {
            SyncChangeKind::Create => summary.creates += 1,
            SyncChangeKind::Update => summary.updates += 1,
            SyncChangeKind::Unchanged => summary.unchanged += 1,
        }

        if !dry_run {
            let task = build_task_from_remote(remote, existing_snapshot);
            db.upsert_task_from_source(&task)?;
        }
    }

    println!("Google Tasks sync:");
    println!("  fetched   : {}", summary.fetched);
    println!("  create    : {}", summary.creates);
    println!("  update    : {}", summary.updates);
    println!("  unchanged : {}", summary.unchanged);
    if dry_run {
        println!("  mode      : dry-run");
    } else {
        println!("  mode      : applied");
    }

    Ok(())
}

/// Sync Notion database.
fn sync_notion(dry_run: bool) -> Result<(), Box<dyn Error>> {
    use pomodoroom_core::integrations::notion::NotionIntegration;
    let n = NotionIntegration::new();
    if !n.is_authenticated() {
        return Err("Notion is not authenticated. Run 'pomodoroom-cli auth login notion' first.".into());
    }
    if dry_run {
        println!("Notion: authenticated, push-only integration currently (no pull diff)");
    } else {
        println!("Notion: authenticated (session-based push integration)");
    }
    Ok(())
}

/// Sync Linear tasks.
fn sync_linear(dry_run: bool) -> Result<(), Box<dyn Error>> {
    use pomodoroom_core::integrations::linear::LinearIntegration;
    let l = LinearIntegration::new();
    if !l.is_authenticated() {
        return Err("Linear is not authenticated. Run 'pomodoroom-cli auth login linear' first.".into());
    }
    if dry_run {
        println!("Linear: authenticated, push-only integration currently (no pull diff)");
    } else {
        println!("Linear: authenticated");
    }
    Ok(())
}

/// Sync GitHub status.
fn sync_github(dry_run: bool) -> Result<(), Box<dyn Error>> {
    use pomodoroom_core::integrations::github::GitHubIntegration;
    let g = GitHubIntegration::new();
    if !g.is_authenticated() {
        return Err("GitHub is not authenticated. Run 'pomodoroom-cli auth login github' first.".into());
    }
    if dry_run {
        println!("GitHub: authenticated, push-only integration currently (no pull diff)");
    } else {
        println!("GitHub: authenticated");
    }
    Ok(())
}

/// Sync Discord webhook.
fn sync_discord(dry_run: bool) -> Result<(), Box<dyn Error>> {
    use pomodoroom_core::integrations::discord::DiscordIntegration;
    let d = DiscordIntegration::new();
    if !d.is_authenticated() {
        return Err("Discord is not configured. Run 'pomodoroom-cli auth login discord' first.".into());
    }
    if dry_run {
        println!("Discord: configured, push-only integration currently (no pull diff)");
    } else {
        println!("Discord: configured");
    }
    Ok(())
}

/// Sync Slack status.
fn sync_slack(dry_run: bool) -> Result<(), Box<dyn Error>> {
    use pomodoroom_core::integrations::slack::SlackIntegration;
    let s = SlackIntegration::new();
    if !s.is_authenticated() {
        return Err("Slack is not authenticated. Run 'pomodoroom-cli auth login slack' first.".into());
    }
    if dry_run {
        println!("Slack: authenticated, push-only integration currently (no pull diff)");
    } else {
        println!("Slack: authenticated");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{classify_sync_change, LocalTaskSnapshot, RemoteTaskSnapshot, SyncChangeKind};
    use pomodoroom_core::task::TaskState;

    fn remote() -> RemoteTaskSnapshot {
        RemoteTaskSnapshot {
            external_id: "list-1:task-1".to_string(),
            list_title: "Inbox".to_string(),
            title: "Write docs".to_string(),
            notes: Some("details".to_string()),
            state: TaskState::Ready,
        }
    }

    #[test]
    fn classify_new_task_as_create() {
        let change = classify_sync_change(&remote(), None);
        assert!(matches!(change, SyncChangeKind::Create));
    }

    #[test]
    fn classify_same_content_as_unchanged() {
        let existing = LocalTaskSnapshot {
            title: "Write docs".to_string(),
            description: Some("details".to_string()),
            state: TaskState::Ready,
        };
        let change = classify_sync_change(&remote(), Some(&existing));
        assert!(matches!(change, SyncChangeKind::Unchanged));
    }

    #[test]
    fn classify_field_change_as_update() {
        let existing = LocalTaskSnapshot {
            title: "Old".to_string(),
            description: Some("details".to_string()),
            state: TaskState::Ready,
        };
        let change = classify_sync_change(&remote(), Some(&existing));
        assert!(matches!(change, SyncChangeKind::Update));
    }
}
