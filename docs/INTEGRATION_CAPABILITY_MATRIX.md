# Integration Capability Matrix

> 各サービスの実装済み/未実装機能を明示し、期待値を管理するドキュメント。
> Last updated: 2026-02-15

## Services Overview

| Priority | Service | Auth Type | Status |
|----------|---------|-----------|--------|
| 1 | Google Calendar & Tasks | OAuth2 | ✅ Implemented |
| 2 | Notion | API Token | ✅ Implemented |
| 3 | Linear | API Key | ⚠️ Partial |
| 4 | GitHub | PAT | ✅ Implemented |
| 5 | Discord | Webhook | ✅ Implemented |
| 6 | Slack | API Token | ✅ Implemented |

## Capability Matrix

### Core Features

| Feature | Google | Notion | Linear | GitHub | Discord | Slack |
|---------|:------:|:------:|:------:|:------:|:-------:|:-----:|
| **Authentication** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Disconnect** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Token Refresh** | ✅ Auto | ❌ Manual | ❌ Manual | ❌ Manual | N/A | ❌ Manual |
| **Status Check** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### Session Lifecycle Hooks

| Callback | Google | Notion | Linear | GitHub | Discord | Slack |
|----------|:------:|:------:|:------:|:------:|:-------:|:-----:|
| **on_focus_start** | ✅ Calendar event | ❌ No-op | ⚠️ Marker only | ✅ Set status | ✅ Post message | ✅ Status + DND |
| **on_break_start** | ❌ No-op | ❌ No-op | ❌ No-op | ✅ Set status | ❌ No-op | ✅ Clear DND |
| **on_session_complete** | ❌ No-op* | ✅ Create page | ⚠️ Clear marker | ✅ Clear status | ✅ Post message | ✅ Clear status |

*Google Calendar events have built-in end time, no explicit action needed.

### Feature Details

#### Google Calendar & Tasks

| Feature | Status | Notes |
|---------|:------:|-------|
| OAuth2 Flow | ✅ | Localhost callback on port 19821 |
| Calendar Event Creation | ✅ | Creates event with focus duration |
| Tasks API | ⚠️ | Scope requested, not yet used |
| Auto Token Refresh | ✅ | 60s buffer before expiry |

#### Notion

| Feature | Status | Notes |
|---------|:------:|-------|
| API Token Auth | ✅ | Requires database ID |
| Page Creation | ✅ | On session complete only |
| Properties: Name, Type, Duration, Date | ✅ | Standard properties |

#### Linear

| Feature | Status | Notes |
|---------|:------:|-------|
| API Key Auth | ✅ | GraphQL API |
| Time Tracking | ❌ | Waiting for public API |
| Issue Tracking Marker | ⚠️ | Keyring-based flag |
| Session Logging | ❌ | Not implemented |

#### GitHub

| Feature | Status | Notes |
|---------|:------:|-------|
| PAT Auth | ✅ | Requires `user` scope |
| Status Emoji | ✅ | :tomato: for focus, :coffee: for break |
| Status Message | ✅ | Task name included |
| Auto Clear | ✅ | On session complete |

#### Discord

| Feature | Status | Notes |
|---------|:------:|-------|
| Webhook Auth | ✅ | URL validation |
| Focus Start Message | ✅ | "Started focus session: X (Ym)" |
| Session Complete Message | ✅ | "Completed X session: Y (Zm)" |
| Rich Embed | ❌ | Plain text only |

#### Slack

| Feature | Status | Notes |
|---------|:------:|-------|
| API Token Auth | ✅ | `auth.test` validation |
| Profile Status | ✅ | With expiration |
| DND Mode | ✅ | `dnd.setSnooze` |
| Status Emoji | ✅ | :tomato: / :coffee: |
| Auto Clear | ✅ | On complete |

## Not Implemented / Future

### High Priority

| Service | Feature | Priority | Notes |
|---------|---------|----------|-------|
| Linear | Time Tracking API | High | Waiting for Linear public API |
| Google | Tasks Integration | High | Scope exists, implementation needed |
| Notion | Focus Start Logging | Medium | Currently write-on-complete only |

### Medium Priority

| Service | Feature | Priority | Notes |
|---------|---------|----------|-------|
| Discord | Rich Embeds | Medium | Better visual formatting |
| Slack | Rich Formatting | Medium | Blocks/attachments |
| GitHub | Commit Status | Low | For PR review mode |

### Low Priority / Moonshot

| Service | Feature | Priority | Notes |
|---------|---------|----------|-------|
| All | Bi-directional Sync | Moonshot | Read external changes |
| All | Offline Queue | Moonshot | Retry failed requests |

## Testing Coverage

See [Integration E2E Test Matrix](./issues/303-integration-e2e-test-matrix.md) for test coverage details.

| Service | Unit Tests | E2E Tests | Mock Coverage |
|---------|:----------:|:---------:|:-------------:|
| Google | ❌ | ✅ | ✅ |
| Notion | ❌ | ✅ | ✅ |
| Linear | ❌ | ✅ | ✅ |
| GitHub | ❌ | ✅ | ✅ |
| Discord | ❌ | ✅ | ✅ |
| Slack | ❌ | ✅ | ✅ |

## Changelog

### 2026-02-15
- Created initial capability matrix
- Added E2E test coverage for all 6 services
- Documented partial implementations (Linear)

### Before 2026-02-15
- All 6 integrations implemented with basic functionality
- OAuth2 for Google, API tokens for others
- Session lifecycle hooks for focus/break/complete
