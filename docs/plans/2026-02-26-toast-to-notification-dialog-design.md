# Toast → Notification Dialog Migration Design

**Goal:** Replace all toast notifications with the notification dialog system. Add Google Calendar "Pomodoroom" calendar creation feedback and explanation copy.

---

## Scope

Three layers of changes:

1. **Backend** — `cmd_integration_sync` returns `calendar_created: bool`
2. **Notification system** — `ActionNotificationData` gains `timeout_ms?: number`; `ActionNotificationView` auto-closes on timeout
3. **UI** — `SyncStatus.tsx` toast removed; `InlineSyncStatus.tsx` keyring bug fixed; `IntegrationSettings.tsx` description updated

---

## Notification Types

| Case | Title | Body | Timeout | Buttons |
|---|---|---|---|---|
| Pomodoroom calendar newly created | "Pomodoroom Calendar Created" | "A dedicated calendar was created in your Google Calendar." | none (persistent) | "Got it" → dismiss |
| Sync success | "Sync Complete" | "Synced X events, Y tasks." | 3000ms | none |
| Sync error | "Sync Failed" | error message | none (persistent) | "Retry" → re-sync, "Dismiss" → dismiss |

---

## Backend Changes (`src-tauri/src/integration_commands.rs`)

### `count_google_calendar_events()` return type

```rust
// Before
fn count_google_calendar_events() -> Result<usize, String>

// After
fn count_google_calendar_events() -> Result<(usize, bool), String>
//                                               ↑      ↑
//                                           events  was_created
```

- Pomodoroom calendar found → `false`
- `create_pomodoroom_calendar()` called → `true`

### `cmd_integration_sync` response

```json
{
  "service": "google_calendar",
  "synced_at": "...",
  "status": "success",
  "items_fetched": 42,
  "items_created": 3,
  "items_updated": 5,
  "items_unchanged": 34,
  "calendar_created": false
}
```

`calendar_created` is always `false` for non-Google-Calendar services.

---

## Notification System Changes

### `src/types/notification.ts`

```typescript
interface ActionNotificationData {
  title: string;
  message: string;
  buttons: NotificationButton[];
  timeout_ms?: number; // when set: auto-close, no buttons needed
}
```

### `src/views/ActionNotificationView.tsx`

```typescript
useEffect(() => {
  if (!notification.timeout_ms) return;
  const id = setTimeout(closeSelf, notification.timeout_ms);
  return () => clearTimeout(id);
}, []); // closeSelf is useCallback([])
```

---

## UI Changes

### `IntegrationSettings.tsx` — description copy

```typescript
google_calendar: "Syncs events and tasks. A \"Pomodoroom\" calendar is automatically created in your Google Calendar on first sync.",
```

### `SyncStatus.tsx` — toast → notification dialog

Remove: state management, animation, auto-dismiss logic, toast DOM.
Keep: `cmd_integration_sync` call, pass result to `showActionNotification`.

```typescript
// On sync success
showActionNotification({
  title: "Sync Complete",
  message: `Synced ${result.items_fetched} events, ${result.items_created} tasks created.`,
  buttons: [],
  timeout_ms: 3000,
});

// On calendar created (shown before sync complete)
if (result.calendar_created) {
  showActionNotification({
    title: "Pomodoroom Calendar Created",
    message: "A dedicated calendar was created in your Google Calendar.",
    buttons: [{ label: "Got it", action: { dismiss: null } }],
  });
}

// On error
showActionNotification({
  title: "Sync Failed",
  message: errorMessage,
  buttons: [
    { label: "Retry", action: { dismiss: null } }, // caller re-triggers sync
    { label: "Dismiss", action: { dismiss: null } },
  ],
});
```

### `InlineSyncStatus.tsx` — keyring bugfix

```typescript
// Before
cmd_sync_manual(...)

// After
invoke("cmd_integration_sync", { serviceName: "google_calendar" })
```

---

## Out of Scope

- Caching `calendar_id` to avoid repeated `calendarList` API calls on every sync
- Push path: local changes → Google Calendar
- Migration of non-sync toasts (timer completion, task notifications — already using notification dialog)
