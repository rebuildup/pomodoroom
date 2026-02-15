# Integration E2E Test Matrix

> Issue: #303 - [Treasure][QA] Integration E2Eテスト行列（service x action）整備

## Goal

接続・同期・切断・再認証の主要シナリオをE2Eでカバーする。

## Services

| Priority | Service | Auth Type | Credential Storage |
|----------|---------|-----------|-------------------|
| 1 | Google | OAuth2 (Authorization Code) | keyring: google_client_id, google_client_secret, tokens |
| 2 | Notion | API Token + Database ID | keyring: notion_token, notion_database_id |
| 3 | Linear | API Key | keyring: linear_api_key, linear_tracking_issue |
| 4 | GitHub | Personal Access Token | keyring: github_token |
| 5 | Discord | Webhook URL | keyring: discord_webhook_url |
| 6 | Slack | API Token | keyring: slack_token |

## Test Matrix

### Core Actions (Service × Action)

| Service | `authenticate()` | `is_authenticated()` | `disconnect()` | Re-auth / Token Refresh |
|---------|:----------------:|:--------------------:|:--------------:|:-----------------------:|
| Google  | ✅ OAuth2 flow + localhost callback | ✅ Token exists | ✅ Delete tokens | ✅ Auto refresh (60s buffer) |
| Notion  | ✅ Verify via /users/me | ✅ Token + DB ID | ✅ Delete both | ⚠️ Manual verify required |
| Linear  | ✅ GraphQL viewer query | ✅ API key exists | ✅ Delete key + issue | ⚠️ Manual verify required |
| GitHub  | ✅ Verify via /user | ✅ Token exists | ✅ Delete token | ⚠️ Manual verify required |
| Discord | ✅ Validate URL format | ✅ URL exists | ✅ Delete URL | ⚠️ Manual verify required |
| Slack   | ✅ auth.test API call | ✅ Token exists | ✅ Delete token | ⚠️ Manual verify required |

### Session Callbacks (Service × Callback)

| Service | `on_focus_start()` | `on_break_start()` | `on_session_complete()` |
|---------|:------------------:|:------------------:|:-----------------------:|
| Google  | ✅ Create calendar event | ⚪ no-op | ⚪ no-op (event auto-ends) |
| Notion  | ⚪ no-op | ⚪ no-op | ✅ Create database page |
| Linear  | ✅ Set tracking marker | ⚪ no-op | ✅ Clear tracking marker |
| GitHub  | ✅ Set status (`:tomato:` + message) | ✅ Set status (`:coffee:` + "On Break") | ✅ Clear status |
| Discord | ✅ Post webhook message | ⚪ no-op | ✅ Post completion message |
| Slack   | ✅ Set status + enable DND | ✅ Clear DND + set break status | ✅ Clear status + end DND |

Legend:
- ✅ Implemented action to test
- ⚪ No-op (default behavior)
- ⚠️ Requires manual intervention

## E2E Test Scenarios

### Scenario 1: Connect (Initial Authentication)

```
GIVEN: No credentials stored
WHEN: User initiates authentication
THEN: Credentials are validated and stored in keyring
AND: is_authenticated() returns true
```

| Service | Test Case | Mock Strategy |
|---------|-----------|---------------|
| Google | OAuth2 flow completes, tokens stored | Mock localhost HTTP server, mock token exchange |
| Notion | API token validated, database ID stored | Mock Notion API: 200 OK on /users/me |
| Linear | API key validated | Mock Linear GraphQL: 200 OK with viewer data |
| GitHub | PAT validated | Mock GitHub API: 200 OK on /user |
| Discord | Webhook URL format validated | Validate URL regex, mock webhook POST |
| Slack | Token validated via auth.test | Mock Slack API: 200 OK with `{"ok": true}` |

### Scenario 2: Sync (Session Callbacks)

```
GIVEN: Valid credentials stored
WHEN: Timer triggers session callbacks
THEN: External service receives correct API calls
```

| Service | on_focus_start | on_break_start | on_session_complete |
|---------|----------------|----------------|---------------------|
| Google | POST calendar/v3/events (create) | - | - |
| Notion | - | - | POST v1/pages (create) |
| Linear | keyring set tracking_active | - | keyring delete tracking_active |
| GitHub | POST graphql (setStatus) | POST graphql (setStatus) | POST graphql (clearStatus) |
| Discord | POST webhook (focus msg) | - | POST webhook (complete msg) |
| Slack | POST users.profile.set + dnd.setSnooze | POST dnd.endSnooze + profile.set | POST profile.set (clear) |

### Scenario 3: Disconnect

```
GIVEN: Valid credentials stored
WHEN: User initiates disconnect
THEN: All credentials removed from keyring
AND: is_authenticated() returns false
```

### Scenario 4: Re-authentication

```
GIVEN: Credentials expired or revoked
WHEN: Timer triggers callback
THEN: Appropriate error handling occurs
```

| Service | Expiration Behavior | Re-auth Strategy |
|---------|--------------------|--------------------|
| Google | Auto-refresh via refresh_token | Silent refresh 60s before expiry |
| Notion | API returns 401 | User must re-authenticate manually |
| Linear | API returns 401 | User must re-authenticate manually |
| GitHub | API returns 401 | User must re-authenticate manually |
| Discord | Webhook POST fails | User must re-configure webhook |
| Slack | API returns `{"ok": false}` | User must re-authenticate manually |

## Test Infrastructure

### Mock Server Setup

```rust
// tests/integration_mocks.rs
pub struct MockServer {
    pub google: mockito::ServerGuard,
    pub notion: mockito::ServerGuard,
    pub linear: mockito::ServerGuard,
    pub github: mockito::ServerGuard,
    pub discord: mockito::ServerGuard,
    pub slack: mockito::ServerGuard,
}
```

### Test Module Structure

```
crates/pomodoroom-core/
├── src/integrations/
│   ├── mod.rs
│   ├── traits.rs
│   ├── google.rs
│   ├── notion.rs
│   ├── linear.rs
│   ├── github.rs
│   ├── discord.rs
│   └── slack.rs
└── tests/
    └── integration_e2e/
        ├── mod.rs
        ├── google_e2e.rs
        ├── notion_e2e.rs
        ├── linear_e2e.rs
        ├── github_e2e.rs
        ├── discord_e2e.rs
        └── slack_e2e.rs
```

## Implementation Checklist

- [ ] Create `tests/integration_e2e/` directory
- [ ] Add `mockito` dev-dependency for HTTP mocking
- [ ] Implement mock keyring for tests (in-memory)
- [ ] Google E2E tests (OAuth2 + calendar callbacks)
- [ ] Notion E2E tests (auth + page creation)
- [ ] Linear E2E tests (auth + tracking marker)
- [ ] GitHub E2E tests (auth + status management)
- [ ] Discord E2E tests (webhook validation + posting)
- [ ] Slack E2E tests (auth + status/DND management)
- [ ] Add CI workflow for integration tests

## Notes

- Real E2E tests require actual credentials (manual testing)
- Automated tests use mocked HTTP responses
- Keyring interactions are mocked in CI environments
- OAuth2 callback tests require localhost server simulation
