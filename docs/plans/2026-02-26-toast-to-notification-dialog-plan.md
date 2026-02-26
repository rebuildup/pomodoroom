# Toast → Notification Dialog Migration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all GCal-sync toast notifications with the notification dialog system, add `timeout_ms` auto-close support, surface `calendar_created` feedback, and fix `InlineSyncStatus` keyring bug.

**Architecture:** Add `timeout_ms?: Option<u64>` to Rust `ActionNotification` and TS `ActionNotificationData`. `count_google_calendar_events()` returns `(usize, bool)`. `cmd_integration_sync` adds `calendar_created`. `SyncStatus.tsx` toast DOM removed; calls `showActionNotification` instead. `InlineSyncStatus.tsx` switches from dead `cmd_sync_manual` to `cmd_integration_sync`.

**Tech Stack:** Rust (serde), TypeScript 5, React 19, Tauri IPC (`invoke`)

---

## Task 1: Add `timeout_ms` to Rust `ActionNotification` struct

**Files:**
- Modify: `src-tauri/src/bridge.rs:1146-1150`

**Step 1: Add field**

In `src-tauri/src/bridge.rs`, find `struct ActionNotification` (line 1146) and add `timeout_ms`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionNotification {
    pub title: String,
    pub message: String,
    pub buttons: Vec<NotificationButton>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout_ms: Option<u64>,
}
```

**Step 2: Build to confirm**

```bash
cargo build -p pomodoroom-desktop 2>&1 | grep -E "^error|Finished"
```

Expected: `Finished`

**Step 3: Commit**

```bash
git add src-tauri/src/bridge.rs
git commit -m "feat(notification): add timeout_ms to ActionNotification struct"
```

---

## Task 2: Add `timeout_ms` to TypeScript types + ActionNotificationView auto-close

**Files:**
- Modify: `src/types/notification.ts:34-38`
- Modify: `src/views/ActionNotificationView.tsx:148-152` (local interface) and after line 231 (closeSelf)

**Step 1: Update `src/types/notification.ts`**

```typescript
export interface ActionNotificationData {
  title: string;
  message: string;
  buttons: NotificationButton[];
  timeout_ms?: number;
}
```

**Step 2: Update local interface in `ActionNotificationView.tsx` (line 148)**

```typescript
interface ActionNotificationData {
  title: string;
  message: string;
  buttons: NotificationButton[];
  timeout_ms?: number;
}
```

**Step 3: Add auto-close useEffect**

In `ActionNotificationView.tsx`, after the `closeSelf` useCallback (after line 231), add:

```typescript
// Auto-close when timeout_ms is set
useEffect(() => {
  if (!notification?.timeout_ms) return;
  const id = setTimeout(closeSelf, notification.timeout_ms);
  return () => clearTimeout(id);
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once after notification loads
}, [notification?.timeout_ms]);
```

Note: `closeSelf` is `useCallback([])` — stable reference, safe to omit from deps per existing pattern.

**Step 4: Type-check**

```bash
pnpm run type-check 2>&1 | tail -10
```

Expected: no errors

**Step 5: Commit**

```bash
git add src/types/notification.ts src/views/ActionNotificationView.tsx
git commit -m "feat(notification): add timeout_ms auto-close support"
```

---

## Task 3: Backend — `count_google_calendar_events` returns `(usize, bool)` + `calendar_created` in sync response

**Files:**
- Modify: `src-tauri/src/integration_commands.rs`

**Step 1: Write the failing test**

In the `#[cfg(test)] mod tests` block (end of file), add:

```rust
#[test]
fn test_integration_sync_response_has_calendar_created_field() {
    // calendar_created field must exist in the JSON shape.
    // This test documents the expected response structure.
    let resp = serde_json::json!({
        "service": "google_calendar",
        "synced_at": "2026-01-01T00:00:00Z",
        "status": "success",
        "items_fetched": 0,
        "items_created": 0,
        "items_updated": 0,
        "items_unchanged": 0,
        "calendar_created": false,
    });
    assert_eq!(resp["calendar_created"], false);
    let with_create = serde_json::json!({
        "calendar_created": true,
    });
    assert_eq!(with_create["calendar_created"], true);
}
```

**Step 2: Run test (should PASS as JSON struct test)**

```bash
cargo test -p pomodoroom-desktop -- test_integration_sync_response_has_calendar_created_field 2>&1 | tail -5
```

Expected: PASS (it's a pure JSON value test — confirms the field name)

**Step 3: Change `count_google_calendar_events` return type**

Find `count_google_calendar_events` in `src-tauri/src/integration_commands.rs` and update:

```rust
/// Count events in the Pomodoroom calendar.
/// Finds or creates the "Pomodoroom" calendar using BRIDGE keyring tokens.
/// Returns (event_count, was_created) where was_created is true if calendar was newly created.
fn count_google_calendar_events() -> Result<(usize, bool), String> {
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
        let (calendar_id, was_created) =
            if let Some(id) = find_pomodoroom_in_calendar_list(&calendar_list) {
                (id, false)
            } else {
                let id = create_pomodoroom_calendar().await?;
                (id, true)
            };

        // Step 3: list events in the Pomodoroom calendar
        let events = crate::google_calendar::cmd_google_calendar_list_events(
            calendar_id,
            start,
            end,
        )
        .await?;

        Ok((events.as_array().map_or(0, |arr| arr.len()), was_created))
    })
}
```

**Step 4: Update `cmd_integration_sync` to use `(usize, bool)` and emit `calendar_created`**

In `cmd_integration_sync`, find the `"google_calendar"` branch (around line 676) and update:

```rust
"google_calendar" => {
    let (event_count, calendar_created_flag) = count_google_calendar_events()?;
    let task_counts = sync_google_tasks_and_count()?;
    counts.items_fetched = event_count + task_counts.items_fetched;
    counts.items_created = task_counts.items_created;
    counts.items_updated = task_counts.items_updated;
    counts.items_unchanged = task_counts.items_unchanged;
    calendar_created = calendar_created_flag;
}
```

This requires declaring `let mut calendar_created = false;` before the `match`. Add it after `let mut counts = SyncCounts::default();`:

```rust
let mut counts = SyncCounts::default();
let mut calendar_created = false;
```

And add `calendar_created` to the response JSON:

```rust
Ok(json!({
    "service": service_name,
    "synced_at": now.to_rfc3339(),
    "status": "success",
    "items_fetched": counts.items_fetched,
    "items_created": counts.items_created,
    "items_updated": counts.items_updated,
    "items_unchanged": counts.items_unchanged,
    "calendar_created": calendar_created,
}))
```

**Step 5: Build + run all desktop tests**

```bash
cargo build -p pomodoroom-desktop 2>&1 | grep -E "^error|Finished"
cargo test -p pomodoroom-desktop 2>&1 | tail -5
```

Expected: `Finished` + all tests PASS

**Step 6: Commit**

```bash
git add src-tauri/src/integration_commands.rs
git commit -m "feat(gcal): emit calendar_created in cmd_integration_sync response"
```

---

## Task 4: `SyncStatus.tsx` — remove toast, call `showActionNotification`

**Files:**
- Modify: `src/components/SyncStatus.tsx`

**Step 1: Add `calendar_created` to `IntegrationSyncResponse` interface**

```typescript
interface IntegrationSyncResponse {
  service: string;
  synced_at: string;
  status: string;
  items_fetched: number;
  items_created: number;
  items_updated: number;
  items_unchanged: number;
  calendar_created: boolean;
}
```

**Step 2: Import `showActionNotification`**

At the top of `SyncStatus.tsx`, add:

```typescript
import { showActionNotification } from "@/hooks/useActionNotification";
```

**Step 3: Replace component**

Replace the entire `SyncStatus.tsx` with the following. The component keeps the sync button but removes all toast state/DOM. Sync results go to the notification dialog.

```typescript
/**
 * Google Calendar Sync Status Component
 *
 * Provides a manual sync button for Google Calendar.
 * Sync results are surfaced via the notification dialog system.
 * Only visible when Google Calendar is connected.
 */

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauriEnvironment } from "@/lib/tauriEnv";
import { Icon } from "@/components/m3/Icon";
import { showActionNotification } from "@/hooks/useActionNotification";

interface IntegrationStatusResponse {
  service: string;
  connected: boolean;
  last_sync: string | null;
  features: string[];
}

interface IntegrationSyncResponse {
  service: string;
  synced_at: string;
  status: string;
  items_fetched: number;
  items_created: number;
  items_updated: number;
  items_unchanged: number;
  calendar_created: boolean;
}

export default function SyncStatus() {
  const [connected, setConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!isTauriEnvironment()) return;
    try {
      const result = await invoke<IntegrationStatusResponse>(
        "cmd_integration_get_status",
        { serviceName: "google_calendar" },
      );
      setConnected(result.connected);
    } catch (error) {
      console.error("[SyncStatus] Failed to fetch integration status:", error);
    }
  }, []);

  const handleManualSync = useCallback(async () => {
    if (!isTauriEnvironment() || isSyncing) return;

    setIsSyncing(true);
    try {
      const result = await invoke<IntegrationSyncResponse>(
        "cmd_integration_sync",
        { serviceName: "google_calendar" },
      );

      // Show calendar creation notification first (persistent — user must dismiss)
      if (result.calendar_created) {
        await showActionNotification({
          title: "Pomodoroom Calendar Created",
          message:
            'A dedicated "Pomodoroom" calendar was created in your Google Calendar. Events will sync there.',
          buttons: [{ label: "Got it", action: { dismiss: null } }],
        });
      }

      // Show sync complete (auto-closes after 3s)
      await showActionNotification({
        title: "Sync Complete",
        message: `Synced ${result.items_fetched} events, ${result.items_created} tasks created.`,
        buttons: [],
        timeout_ms: 3000,
      });

      await fetchStatus();
    } catch (error) {
      console.error("[SyncStatus] Manual sync failed:", error);
      const msg = error instanceof Error ? error.message : String(error);
      await showActionNotification({
        title: "Sync Failed",
        message: msg,
        buttons: [{ label: "Dismiss", action: { dismiss: null } }],
      });
    }
    setIsSyncing(false);
  }, [isSyncing, fetchStatus]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  if (!connected) return null;

  return (
    <button
      type="button"
      disabled={isSyncing}
      onClick={handleManualSync}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium"
      style={{
        backgroundColor: "var(--md-ref-color-surface-container-high)",
        color: "var(--md-ref-color-on-surface)",
        border: "1px solid var(--md-ref-color-outline-variant)",
        opacity: isSyncing ? 0.65 : 1,
      }}
    >
      <Icon
        name="sync"
        size={13}
        color="var(--md-ref-color-on-surface)"
        style={isSyncing ? { animation: "spin 1s linear infinite" } : undefined}
      />
      {isSyncing ? "Syncing..." : "Sync"}
    </button>
  );
}
```

**Step 4: Type-check**

```bash
pnpm run type-check 2>&1 | tail -10
```

Expected: no errors

**Step 5: Commit**

```bash
git add src/components/SyncStatus.tsx
git commit -m "refactor(sync): replace SyncStatus toast with notification dialog"
```

---

## Task 5: `InlineSyncStatus.tsx` — fix keyring bug + notification dialog

**Files:**
- Modify: `src/components/InlineSyncStatus.tsx`

**Step 1: Update `IntegrationSyncResponse` to include `calendar_created`**

```typescript
interface IntegrationSyncResponse {
  service: string;
  synced_at: string;
  status: string;
  items_fetched: number;
  items_created: number;
  items_updated: number;
  items_unchanged: number;
  calendar_created: boolean;
}
```

**Step 2: Import `showActionNotification`**

```typescript
import { showActionNotification } from "@/hooks/useActionNotification";
```

**Step 3: Replace `handleManualSync`**

Replace the entire `handleManualSync` function:

```typescript
const handleManualSync = useCallback(async () => {
  if (!isTauriEnvironment() || isSyncing) return;

  setIsSyncing(true);

  try {
    // Use cmd_integration_sync (bridge keyring path — correct)
    const result = await invoke<IntegrationSyncResponse>("cmd_integration_sync", {
      serviceName: "google_calendar",
    });

    if (result.calendar_created) {
      await showActionNotification({
        title: "Pomodoroom Calendar Created",
        message:
          'A dedicated "Pomodoroom" calendar was created in your Google Calendar. Events will sync there.',
        buttons: [{ label: "Got it", action: { dismiss: null } }],
      });
    }

    await showActionNotification({
      title: "Sync Complete",
      message: `Synced ${result.items_fetched} events, ${result.items_created} tasks created.`,
      buttons: [],
      timeout_ms: 3000,
    });

    await fetchStatus();
  } catch (error) {
    console.error("[InlineSyncStatus] Manual sync failed:", error);
    const msg = error instanceof Error ? error.message : String(error);
    await showActionNotification({
      title: "Sync Failed",
      message: msg,
      buttons: [{ label: "Dismiss", action: { dismiss: null } }],
    });
  }
  setIsSyncing(false);
}, [isSyncing, fetchStatus]);
```

**Step 4: Remove now-unused state and imports**

Remove:
- `lastResult` state and `setLastResult` (no longer used)
- `SyncResult` import from `@/types/sync`

Keep: `status` state (used in the JSX for last_sync_at display), `isSyncing`.

**Step 5: Type-check**

```bash
pnpm run type-check 2>&1 | tail -10
```

Expected: no errors

**Step 6: Commit**

```bash
git add src/components/InlineSyncStatus.tsx
git commit -m "fix(sync): replace cmd_sync_manual with cmd_integration_sync in InlineSyncStatus"
```

---

## Task 6: `IntegrationSettings.tsx` — update google_calendar description

**Files:**
- Modify: `src/components/m3/IntegrationSettings.tsx:69-77`

**Step 1: Update description string**

Find `SERVICE_DESCRIPTIONS` in `IntegrationSettings.tsx` and change the `google_calendar` entry:

```typescript
const SERVICE_DESCRIPTIONS: Record<IntegrationService, string> = {
  google_calendar:
    'Syncs events and tasks. A "Pomodoroom" calendar is automatically created in your Google Calendar on first sync.',
  // ... rest unchanged
```

**Step 2: Type-check + build**

```bash
pnpm run type-check 2>&1 | tail -5
pnpm run build 2>&1 | tail -5
```

Expected: both PASS

**Step 3: Commit**

```bash
git add src/components/m3/IntegrationSettings.tsx
git commit -m "docs(ui): explain Pomodoroom calendar auto-creation in integration description"
```

---

## Task 7: Full regression check

**Step 1: Core tests**

```bash
cargo test -p pomodoroom-core 2>&1 | tail -5
```

Expected: all PASS

**Step 2: Desktop tests**

```bash
cargo test -p pomodoroom-desktop 2>&1 | tail -5
```

Expected: all PASS

**Step 3: Frontend build**

```bash
pnpm run build 2>&1 | tail -5
```

Expected: `✓ built in`

---

## Verification Checklist

- [ ] `cargo build -p pomodoroom-desktop` PASS
- [ ] `cargo test -p pomodoroom-desktop` — all PASS (including `test_find_pomodoroom_in_calendar_list_*`)
- [ ] `cargo test -p pomodoroom-core` PASS
- [ ] `pnpm run type-check` PASS
- [ ] `pnpm run build` PASS
- [ ] `SyncStatus.tsx` has no toast DOM (no `fixed top-3 right-3` div)
- [ ] `InlineSyncStatus.tsx` no longer references `cmd_sync_manual`
- [ ] `ActionNotificationView.tsx` has `timeout_ms` auto-close effect

---

## Out of Scope

- Caching `calendar_id` to avoid repeated `calendarList` API calls
- Push path: local changes → Google Calendar
- Non-sync toasts (timer/task — already use notification dialog)
