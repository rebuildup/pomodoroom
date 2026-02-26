# GCal Sync - Pomodoroom Calendar Creation Fix

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `cmd_integration_sync("google_calendar")` が `"primary"` ではなく専用の "Pomodoroom" カレンダーを使って同期するよう修正する。

**Architecture:**
`integration_commands.rs` に `get_or_create_pomodoroom_calendar_id()` を追加。
BRIDGE keyring（`pomodoroom-{env}` / `"google_calendar"`）のトークンで Google Calendar API を呼び出し、
"Pomodoroom" カレンダーを検索または作成してそのIDを返す。
`count_google_calendar_events()` でハードコードされていた `"primary"` をこのIDに置き換える。

**Tech Stack:** Rust, reqwest (async HTTP), Google Calendar API v3, BRIDGE OS Keyring

---

## Root Cause Summary

| # | 問題 | 場所 |
|---|------|------|
| 1 | `cmd_integration_sync` が `"primary"` を読むだけで Pomodoroom カレンダーを作成しない | `integration_commands.rs:count_google_calendar_events()` |
| 2 | `CalendarClient::ensure_pomodoroom_calendar()` は CORE keyring を使うため dead code 化 | `sync/calendar_client.rs` |
| 3 | `do_sync()` は keyring mismatch で即失敗、呼ばれるパスも実質未使用 | `sync_commands.rs` |

このプランは問題1を修正する（問題2,3 はスコープ外）。

---

## Task 1: `find_pomodoroom_in_calendar_list` ヘルパー + テスト

**Files:**
- Modify: `src-tauri/src/integration_commands.rs`

**概要:** カレンダーリストレスポンス（`Value`）から "Pomodoroom" のIDを抽出する純粋関数を追加。
テスト可能な最小単位として分離する。

---

### Step 1: テストを書く（FAILを確認）

`integration_commands.rs` の末尾の `#[cfg(test)] mod tests { ... }` ブロックに以下を追加：

```rust
#[test]
fn test_find_pomodoroom_in_calendar_list_found() {
    let body = serde_json::json!({
        "items": [
            {"id": "cal1", "summary": "Personal"},
            {"id": "pomodoroom_id", "summary": "Pomodoroom"},
            {"id": "cal3", "summary": "Work"},
        ]
    });
    let id = find_pomodoroom_in_calendar_list(&body);
    assert_eq!(id, Some("pomodoroom_id".to_string()));
}

#[test]
fn test_find_pomodoroom_in_calendar_list_not_found() {
    let body = serde_json::json!({
        "items": [
            {"id": "cal1", "summary": "Personal"},
            {"id": "cal2", "summary": "Work"},
        ]
    });
    let id = find_pomodoroom_in_calendar_list(&body);
    assert_eq!(id, None);
}

#[test]
fn test_find_pomodoroom_in_calendar_list_empty_items() {
    let body = serde_json::json!({"items": []});
    assert_eq!(find_pomodoroom_in_calendar_list(&body), None);
}

#[test]
fn test_find_pomodoroom_in_calendar_list_missing_items_key() {
    let body = serde_json::json!({});
    assert_eq!(find_pomodoroom_in_calendar_list(&body), None);
}
```

### Step 2: FAILを確認

```bash
cargo test -p pomodoroom-desktop -- test_find_pomodoroom_in_calendar_list 2>&1
```

Expected: FAIL — `find_pomodoroom_in_calendar_list` not found

### Step 3: ヘルパー関数を実装

`integration_commands.rs` の `fn count_google_calendar_events()` の直前に追加：

```rust
/// Find the "Pomodoroom" calendar ID in a Google Calendar calendarList response.
/// Returns None if not found.
fn find_pomodoroom_in_calendar_list(body: &Value) -> Option<String> {
    body["items"].as_array()?.iter().find_map(|cal| {
        if cal["summary"].as_str() == Some("Pomodoroom") {
            cal["id"].as_str().map(|s| s.to_string())
        } else {
            None
        }
    })
}
```

### Step 4: PASSを確認

```bash
cargo test -p pomodoroom-desktop -- test_find_pomodoroom_in_calendar_list 2>&1
```

Expected: 4 tests PASS

### Step 5: コミット

```bash
git add src-tauri/src/integration_commands.rs
git commit -m "feat(gcal): add find_pomodoroom_in_calendar_list helper with tests"
```

---

## Task 2: `create_pomodoroom_calendar()` async 関数

**Files:**
- Modify: `src-tauri/src/integration_commands.rs`

**概要:** "Pomodoroom" カレンダーを Google Calendar API で新規作成し、そのIDを返す。
BRIDGE keyring から取得したトークンを使用。

---

### Step 1: `use reqwest` を imports に追加

`integration_commands.rs` の先頭 `use` ブロックに追加：

```rust
use reqwest::Client;
```

（`google_calendar.rs` が既に使用しているため、クレートの依存は既存）

### Step 2: 関数を実装

`find_pomodoroom_in_calendar_list` の直後に追加：

```rust
/// Create a new "Pomodoroom" calendar via Google Calendar API.
/// Uses BRIDGE keyring tokens (pomodoroom-{env} / "google_calendar").
async fn create_pomodoroom_calendar() -> Result<String, String> {
    let tokens_json =
        crate::bridge::cmd_load_oauth_tokens("google_calendar".to_string())?;
    let tokens: crate::google_calendar::StoredTokens =
        serde_json::from_str(&tokens_json.ok_or("No Google Calendar tokens found")?)
            .map_err(|e| format!("Invalid tokens: {e}"))?;

    let client = Client::new();
    let resp = client
        .post("https://www.googleapis.com/calendar/v3/calendars")
        .bearer_auth(&tokens.access_token)
        .json(&json!({"summary": "Pomodoroom"}))
        .send()
        .await
        .map_err(|e| format!("Failed to create Pomodoroom calendar: {e}"))?;

    let status = resp.status();
    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse create calendar response: {e}"))?;

    if !status.is_success() {
        return Err(format!(
            "Calendar create failed: {} - {}",
            status,
            body.get("error")
                .and_then(|e| e.get("message"))
                .and_then(|m| m.as_str())
                .unwrap_or("unknown error")
        ));
    }

    body["id"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Missing id in calendar create response".to_string())
}
```

### Step 3: ビルド確認

```bash
cargo build -p pomodoroom-desktop 2>&1
```

Expected: PASS（コンパイルエラーなし）

---

## Task 3: `count_google_calendar_events()` を Pomodoroom カレンダー向けに修正

**Files:**
- Modify: `src-tauri/src/integration_commands.rs`

**概要:** ハードコードされた `"primary"` を `get_or_create_pomodoroom_calendar_id()` に置き換える。
単一の tokio runtime でカレンダー取得→作成→イベント取得を一気に処理する。

---

### Step 1: 現在の `count_google_calendar_events` を確認

`src-tauri/src/integration_commands.rs:220-234` を確認：
```rust
fn count_google_calendar_events() -> Result<usize, String> {
    let now = Utc::now();
    let start = (now - Duration::days(7)).to_rfc3339();
    let end = (now + Duration::days(30)).to_rfc3339();
    let rt = tokio::runtime::Runtime::new().map_err(|e| format!("Failed to create runtime: {e}"))?;
    let events = rt.block_on(async {
        crate::google_calendar::cmd_google_calendar_list_events(
            "primary".to_string(),   // ← ここを直す
            start,
            end,
        )
        .await
    })?;
    Ok(events.as_array().map_or(0, |arr| arr.len()))
}
```

### Step 2: 関数を置き換え

`count_google_calendar_events` 全体を以下で置き換え：

```rust
/// Count events in the Pomodoroom calendar.
/// Finds or creates the "Pomodoroom" calendar using BRIDGE keyring tokens.
fn count_google_calendar_events() -> Result<usize, String> {
    let now = Utc::now();
    let start = (now - Duration::days(7)).to_rfc3339();
    let end = (now + Duration::days(30)).to_rfc3339();

    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| format!("Failed to create runtime: {e}"))?;

    rt.block_on(async {
        // Step 1: list calendars to find existing Pomodoroom calendar
        let calendar_list =
            crate::google_calendar::cmd_google_calendar_list_calendars().await?;

        // Step 2: find or create the Pomodoroom calendar
        let calendar_id =
            if let Some(id) = find_pomodoroom_in_calendar_list(&calendar_list) {
                id
            } else {
                create_pomodoroom_calendar().await?
            };

        // Step 3: list events in the Pomodoroom calendar
        let events = crate::google_calendar::cmd_google_calendar_list_events(
            calendar_id,
            start,
            end,
        )
        .await?;

        Ok(events.as_array().map_or(0, |arr| arr.len()))
    })
}
```

### Step 3: ビルド確認

```bash
cargo build -p pomodoroom-desktop 2>&1
```

Expected: PASS

### Step 4: 既存テストが通ることを確認

```bash
cargo test -p pomodoroom-desktop 2>&1
```

Expected: 全テスト PASS（既存テスト + Task 1 で追加したテスト）

### Step 5: コミット

```bash
git add src-tauri/src/integration_commands.rs
git commit -m "fix(gcal): create/find Pomodoroom calendar instead of using primary"
```

---

## Task 4: core テスト + frontend ビルド確認

**概要:** リグレッションなしを確認する。

### Step 1: core テスト

```bash
cargo test -p pomodoroom-core 2>&1
```

Expected: 全テスト PASS

### Step 2: frontend ビルド

```bash
pnpm run build 2>&1
```

Expected: PASS

### Step 3: 完了コミット

```bash
git add -A
git commit -m "chore: verify gcal sync pomodoroom calendar fix passes all tests"
```

---

## Verification Checklist

- [ ] `test_find_pomodoroom_in_calendar_list_found` PASS
- [ ] `test_find_pomodoroom_in_calendar_list_not_found` PASS
- [ ] `test_find_pomodoroom_in_calendar_list_empty_items` PASS
- [ ] `test_find_pomodoroom_in_calendar_list_missing_items_key` PASS
- [ ] `cargo build -p pomodoroom-desktop` PASS
- [ ] `cargo test -p pomodoroom-core` PASS
- [ ] `pnpm run build` PASS

---

## Out of Scope（別イシュー）

- `do_sync()` / `cmd_sync_startup` / `cmd_sync_manual` の CORE keyring mismatch 修正
- `CalendarClient` を BRIDGE keyring に対応させる
- Pomodoroom calendar ID のローカルキャッシュ（DB kv_store）
- イベントの双方向同期（Push path: ローカル変更 → Google Calendar）
