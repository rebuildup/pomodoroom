# Google Tasks Integration

Complete documentation for Google Tasks integration in Pomodoroom.

## Overview

The Google Tasks integration allows Pomodoroom users to synchronize with Google Tasks for enhanced productivity workflow. Users can:

1. **Authenticate with Google OAuth2** - Secure connection to Google Tasks API
2. **Select a task list** - Choose which Google Tasks list to sync with
3. **Link tasks to Pomodoro sessions** - Associate a Google Task with the current timer session
4. **Auto-complete tasks** - Mark Google Tasks as completed when finishing Pomodoro sessions
5. **Create new tasks** - Add tasks directly to Google Tasks from Pomodoroom

The integration reuses the existing OAuth infrastructure from Google Calendar, sharing the same client credentials and token storage.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ useGoogleTasks Hook                               │  │
│  │  - Connection state management                      │  │
│  │  - Task list fetching                             │  │
│  │  - Task operations (complete, create)               │  │
│  │  - Session task association                        │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                            │                                  │
│                            ▼ Tauri IPC                       │
├─────────────────────────────────────────────────────────────────────┤
│                         Backend (Rust)                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ google_tasks.rs Module                             │  │
│  │  - OAuth flow handling                             │  │
│  │  - API requests to Google Tasks API v1             │  │
│  │  - Database persistence (KV store)                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                            │                                  │
│                            ▼                                  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              Google Tasks API v1                  │  │
│  │  https://www.googleapis.com/tasks/v1               │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Model

### TaskList
Represents a Google Tasks task list.

```typescript
interface TaskList {
    id: string;           // Unique task list ID
    title: string;        // Display name
    updated?: string;     // Last update timestamp (ISO 8601)
}
```

### GoogleTask
Represents a single Google Task.

```typescript
interface GoogleTask {
    id: string;                  // Unique task ID
    title: string;               // Task title
    notes?: string;              // Optional notes/description
    status: "needsAction" | "completed";
    due?: string;               // Optional due date (ISO 8601)
    updated?: string;            // Last update timestamp
}
```

### SessionTask
Associates a Google Task with the current Pomodoro session.

```typescript
interface SessionTask {
    taskId: string;        // Google Task ID
    tasklistId: string;   // Parent task list ID
    taskTitle: string;    // Task title for display
    isSet: boolean;       // Whether a session task is configured
}
```

### GoogleTasksState
Connection and sync state for Google Tasks integration.

```typescript
interface GoogleTasksState {
    isConnected: boolean;    // OAuth tokens present and valid
    isConnecting: boolean;   // OAuth flow in progress
    syncEnabled: boolean;    // User preference for sync
    error?: string;          // Last error message
    lastSync?: string;       // Last successful sync timestamp
}
```

## Rust API Commands

All commands are in `src-tauri/src/google_tasks.rs` and exposed via Tauri IPC.

### Authentication Commands

#### `cmd_google_tasks_auth_connect`

Initiates full OAuth flow to authenticate with Google Tasks.

**Parameters**: None

**Returns**:
```json
{
    "access_token": "ya29.a0AfH6...",  // Bearer token for API requests
    "expires_in": 3600,                 // Seconds until expiration
    "token_type": "Bearer",
    "authenticated": true
}
```

**Behavior**:
1. Generates OAuth authorization URL with CSRF state
2. Opens system browser for user authorization
3. Listens on localhost:19821 for callback
4. Exchanges authorization code for access tokens
5. Stores tokens securely in OS keyring

**Errors**:
- `"Google OAuth client_id is not configured. Set GOOGLE_CLIENT_ID."`
- `"OAuth callback timed out. Please try again."`
- `"State mismatch - possible CSRF attack"`

---

#### `cmd_google_tasks_auth_get_auth_url`

Generates OAuth URL for frontend-controlled OAuth flow.

**Parameters**: None

**Returns**:
```json
{
    "auth_url": "https://accounts.google.com/o/oauth2/v2/auth?...",
    "state": "random_csrf_token",
    "redirect_port": 19821
}
```

---

#### `cmd_google_tasks_auth_exchange_code`

Exchanges OAuth authorization code for access tokens.

**Parameters**:
- `code: String` - Authorization code from OAuth callback
- `state: String` - State parameter for CSRF validation
- `expected_state: String` - Expected state from `get_auth_url`

**Returns**:
```json
{
    "access_token": "ya29.a0AfH6...",
    "expires_in": 3600,
    "token_type": "Bearer",
    "authenticated": true
}
```

**Errors**:
- `"State parameter mismatch - possible CSRF attack"`
- `"Token exchange failed: {status} - {body}"`

---

#### `cmd_google_tasks_auth_disconnect`

Disconnects from Google Tasks and clears all stored tokens.

**Parameters**: None

**Returns**: `null` (on success)

**Behavior**:
- Removes tokens from OS keyring
- Clears all local state

---

### Task List Commands

#### `cmd_google_tasks_list_tasklists`

Lists all task lists for the authenticated user.

**Parameters**: None

**Returns**:
```json
[
    {
        "id": "MDMyMDEwMjA3NDc1NzQ4MjIwMDA6MDow",
        "title": "My Tasks",
        "updated": "2024-01-15T10:00:00.000Z"
    }
]
```

**Errors**:
- `"No stored tokens found. Please authenticate first."`
- `"Tasks API error: {status} - {body}"`

---

#### `cmd_google_tasks_get_selected_tasklist`

Gets the user's selected task list ID from database.

**Parameters**: None

**Returns**:
```json
{
    "tasklist_id": "MDMyMDEwMjA3NDc1NzQ4MjIwMDA6MDow",
    "is_default": false
}
```

If no selection exists:
```json
{
    "tasklist_id": null,
    "is_default": true
}
```

---

#### `cmd_google_tasks_set_selected_tasklist`

Sets the user's selected task list for synchronization.

**Parameters**:
- `tasklist_id: String` - Task list ID to use for task sync

**Returns**: `null` (on success)

**Errors**:
- `"Task list ID cannot be empty"`

---

### Task Commands

#### `cmd_google_tasks_list_tasks`

Lists tasks from a specific task list.

**Parameters**:
- `tasklist_id: String` - Task list ID
- `show_completed: Option<bool>` - Include completed tasks (default: false)
- `show_hidden: Option<bool>` - Include hidden tasks (default: false)

**Returns**:
```json
[
    {
        "id": "MDMyMDEwMjA3NDc1NzQ4MjIwMDA6MDo",
        "title": "Complete project documentation",
        "notes": "Write comprehensive docs",
        "status": "needsAction",
        "due": "2024-01-20T00:00:00.000Z",
        "updated": "2024-01-15T10:00:00.000Z"
    }
]
```

**Errors**:
- `"No stored tokens found. Please authenticate first."`
- `"Tasks API error: {status} - {body}"`

---

#### `cmd_google_tasks_complete_task`

Marks a task as completed.

**Parameters**:
- `tasklist_id: String` - Task list ID
- `task_id: String` - ID of task to complete

**Returns**:
```json
{
    "id": "MDMyMDEwMjA3NDc1NzQ4MjIwMDA6MDo",
    "title": "Complete project documentation",
    "status": "completed",
    "completed": "2024-01-15T10:30:00.000Z"
}
```

**Errors**:
- `"No stored tokens found. Please authenticate first."`
- `"Tasks API error: {status} - {body}"`

---

#### `cmd_google_tasks_create_task`

Creates a new task in a task list.

**Parameters**:
- `tasklist_id: String` - Task list ID
- `title: String` - Task title (required)
- `notes: Option<String>` - Optional notes/description
- `due: Option<String>` - Optional due date (ISO 8601 format)

**Returns**:
```json
{
    "id": "MDMyMDEwMjA3NDc1NzQ4MjIwMDA6MDo",
    "title": "Review pull request",
    "notes": "Check for any issues",
    "status": "needsAction",
    "due": "2024-01-20T00:00:00.000Z"
}
```

**Errors**:
- `"Task title cannot be empty"`
- `"Invalid datetime format 'invalid-date'"`
- `"Tasks API error: {status} - {body}"`

---

### Session Task Commands

#### `cmd_google_tasks_get_session_task`

Gets the task associated with the current Pomodoro session.

**Parameters**: None

**Returns**:
```json
{
    "task_id": "MDMyMDEwMjA3NDc1NzQ4MjIwMDA6MDo",
    "tasklist_id": "MDMyMDEwMjA3NDc1NzQ4MjIwMDA6MDow",
    "task_title": "Complete project documentation",
    "is_set": true
}
```

If no session task is set:
```json
{
    "task_id": null,
    "tasklist_id": null,
    "task_title": null,
    "is_set": false
}
```

---

#### `cmd_google_tasks_set_session_task`

Associates a Google Task with the current Pomodoro session.

**Parameters**:
- `task_id: String` - Google Task ID to complete on session finish
- `tasklist_id: String` - Task list ID containing the task
- `task_title: String` - Task title for display purposes

**Returns**: `null` (on success)

**Errors**:
- `"Task ID cannot be empty"`
- `"Task list ID cannot be empty"`

---

#### `cmd_google_tasks_clear_session_task`

Removes the session task association.

**Parameters**: None

**Returns**: `null` (on success)

**Behavior**:
- Clears the session task from database
- Does NOT complete the task via API
- After calling this, no task will be auto-completed on session finish

---

#### `cmd_google_tasks_complete_session_task`

Completes the task associated with the current session and clears the association.

**Parameters**: None

**Returns**: Updated task data (same as `cmd_google_tasks_complete_task`), or `null` if no session task was set

**Behavior**:
1. Retrieves session task from database
2. Clears session task from database
3. Marks task as completed via Google Tasks API
4. Returns updated task data

**Errors**:
- `"Failed to parse session task config: {error}"`

---

## React Hook API

The `useGoogleTasks` hook in `src/hooks/useGoogleTasks.ts` provides all Google Tasks functionality to React components.

### Hook Return Value

```typescript
const {
    // State
    state,                  // GoogleTasksState object

    // Data
    tasklists,              // TaskList[] - All user's task lists
    tasks,                  // GoogleTask[] - Tasks from selected list

    // Authentication
    connectInteractive,       // () => Promise<void> - Start OAuth flow
    disconnect,              // () => Promise<void> - Disconnect and clear tokens

    // Task Lists
    fetchTasklists,          // () => Promise<TaskList[]> - Refresh task lists
    getSelectedTasklist,      // () => Promise<string | null> - Get stored list ID
    setSelectedTasklist,      // (id: string) => Promise<boolean> - Store list ID

    // Tasks
    fetchTasks,              // (tasklistId?: string) => Promise<GoogleTask[]> - Get tasks
    completeTask,            // (taskId: string, tasklistId?: string) => Promise<void> - Complete task
    createTask,              // (title: string, notes?: string) => Promise<GoogleTask> - Create task

    // Session Tasks
    getSelectedTaskId,        // () => Promise<SessionTask | null> - Get session task
    setSelectedTaskId,        // (taskId: string, tasklistId: string, taskTitle: string) => Promise<boolean> - Set session task
    completeCurrentSessionTask, // () => Promise<GoogleTask | null> - Complete session task

    // Control
    toggleSync,              // (enabled: boolean) => void - Enable/disable sync
} = useGoogleTasks();
```

### Usage Examples

#### Authentication

```typescript
const { state, connectInteractive, disconnect } = useGoogleTasks();

// Connect (opens browser for OAuth)
await connectInteractive();

// Disconnect
await disconnect();
```

#### Task List Selection

```typescript
const { tasklists, fetchTasklists, getSelectedTasklist, setSelectedTasklist } = useGoogleTasks();

useEffect(() => {
    fetchTasklists();
}, []);

const handleSelectList = async (listId: string) => {
    await setSelectedTasklist(listId);
};
```

#### Fetching Tasks

```typescript
const { tasks, fetchTasks } = useGoogleTasks();

// Fetch from selected list
const tasks = await fetchTasks();

// Fetch from specific list
const tasks = await fetchTasks("list-id");
```

#### Completing Tasks

```typescript
const { completeTask } = useGoogleTasks();

const handleComplete = async (taskId: string) => {
    await completeTask(taskId);
};
```

#### Session Task Integration

```typescript
const {
    getSelectedTaskId,
    setSelectedTaskId,
    completeCurrentSessionTask
} = useGoogleTasks();

// Set task for current session
await setSelectedTaskId(
    "task-id",
    "tasklist-id",
    "Task Title"
);

// Complete when Pomodoro finishes
const completed = await completeCurrentSessionTask();
```

## Environment Variables

The Google Tasks integration reuses the OAuth configuration from Google Calendar.

### Development

Create a `.env` file in the project root:

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

### Production Build

Set environment variables at compile time:

```bash
GOOGLE_CLIENT_ID=your-client-id cargo tauri build
GOOGLE_CLIENT_SECRET=your-client-secret cargo tauri build
```

Or in `src-tauri/Cargo.toml`:

```toml
[env]
GOOGLE_CLIENT_ID = "your-client-id"
GOOGLE_CLIENT_SECRET = "your-client-secret"
```

### Obtaining Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable "Tasks API" under APIs & Services
4. Create OAuth 2.0 credentials:
   - Application type: Desktop app
   - Authorized redirect URIs: `http://localhost:19821/callback`
5. Copy Client ID and Client Secret

## OAuth Scopes

The Google Tasks integration uses the following OAuth scope:

| Scope | Purpose | Already in Calendar |
|-------|---------|-------------------|
| `https://www.googleapis.com/auth/tasks` | Read/write access to Google Tasks | Yes |

The Tasks scope is already included in the Google Calendar OAuth setup, so no additional scope approval is needed for users who have already connected Google Calendar.

## Database Storage

All Google Tasks configuration is stored in the SQLite key-value store (`~/.pomodoroom/pomodoroom.db`).

| Key | Value | Purpose |
|-----|--------|---------|
| `google_tasks:selected_tasklist` | `SelectedTaskListConfig` JSON | User's selected task list |
| `google_tasks:session_task` | `SessionTaskConfig` JSON | Task for current Pomodoro session |

OAuth tokens are stored securely in the OS keyring via `cmd_store_oauth_tokens` with service name `"google_tasks"`.

## Components

### GoogleTasksSettingsModal

Located at `src/components/GoogleTasksSettingsModal.tsx`.

**Props**:
```typescript
interface GoogleTasksSettingsModalProps {
    theme: "light" | "dark";
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
}
```

**Features**:
- Task list selection with radio buttons
- OAuth connection flow initiation
- Loading and error states
- Save/Cancel actions

### IntegrationsPanel Card

The Google Tasks card in `src/components/IntegrationsPanel.tsx` shows:

- Connection status (Connected/Not connected)
- Settings button (opens GoogleTasksSettingsModal)
- Connect button (initiates OAuth flow)

## API Endpoints

Google Tasks API v1 endpoints used:

| Operation | HTTP Method | Endpoint |
|----------|--------------|----------|
| List task lists | GET | `/users/@me/lists` |
| List tasks | GET | `/lists/{tasklist}/tasks` |
| Get task | GET | `/lists/{tasklist}/tasks/{task}` |
| Create task | POST | `/lists/{tasklist}/tasks` |
| Update task | PATCH | `/lists/{tasklist}/tasks/{task}` |
| Delete task | DELETE | `/lists/{tasklist}/tasks/{task}` |

Base URL: `https://www.googleapis.com/tasks/v1`

## Error Handling

All commands return `Result<Value, String>` where the error string provides:

- **User-friendly error messages** for display in UI
- **Context** about what operation failed
- **Suggested actions** when applicable (e.g., "Please authenticate first.")

Common error scenarios:

| Error | Cause | Resolution |
|-------|--------|------------|
| `"Google OAuth client_id is not configured"` | Missing `GOOGLE_CLIENT_ID` | Set environment variable |
| `"OAuth callback timed out"` | User didn't complete flow | Try authentication again |
| `"No stored tokens found"` | Not authenticated | Call `connectInteractive()` |
| `"Tasks API error: 401"` | Invalid credentials | Re-authenticate |
| `"Tasks API error: 403"` | Invalid task list ID | Check task list selection |
| `"Tasks API error: 404"` | Task not found | Task may have been deleted |

## Testing

### Unit Tests

Run Rust unit tests:

```bash
cargo test -p pomodoroom-desktop
```

### Integration Testing

Manual testing checklist:

- [ ] OAuth flow completes successfully
- [ ] Task lists load after authentication
- [ ] Task list selection persists across restarts
- [ ] Tasks load from selected list
- [ ] Task completion updates Google Tasks
- [ ] Session task association works
- [ ] Session task completes on timer finish
- [ ] Disconnect clears all data
- [ ] Token refresh works when expired

## Security Considerations

1. **CSRF Protection**: OAuth flow uses cryptographically random state parameter
2. **Token Storage**: Tokens stored in OS keyring, not in database
3. **Redirect URI**: Hardcoded to `localhost:19821` (cannot be intercepted)
4. **Scope Limiting**: Only requests `tasks` scope (minimal permissions)
5. **PKCE**: Not implemented (desktop app - no public client secret exposure)

## Troubleshooting

### OAuth Callback Fails

**Issue**: Port 19821 already in use

**Solution**:
```powershell
netstat -ano | findstr :19821
taskkill /F /PID <PID>
```

### Tasks Not Loading

**Issue**: `fetchTasks()` returns empty array

**Check**:
1. User is authenticated (`state.isConnected`)
2. Task list is selected (`getSelectedTasklist()`)
3. API tokens are valid (check browser DevTools Network tab)

### Token Expired

**Issue**: API returns 401 Unauthorized

**Resolution**: Token refresh is automatic. If it fails:
1. Call `disconnect()`
2. Call `connectInteractive()` to re-authenticate

## Future Enhancements

Potential improvements for future versions:

- [ ] Task subtasks support
- [ ] Task due date editing
- [ ] Bulk task operations
- [ ] Task search and filtering
- [ ] Real-time sync (WebSocket)
- [ ] Offline task queue
- [ ] Task move/reorder
- [ ] Task notes editing

## Related Files

| File | Purpose |
|------|---------|
| `src-tauri/src/google_tasks.rs` | Backend API commands |
| `src/hooks/useGoogleTasks.ts` | Frontend state management |
| `src/components/GoogleTasksSettingsModal.tsx` | Settings UI |
| `src/components/IntegrationsPanel.tsx` | Integration card in settings |
| `src-tauri/src/google_calendar.rs` | Shared OAuth infrastructure |
| `src-tauri/src/bridge.rs` | Token storage commands |

## References

- [Google Tasks API Documentation](https://developers.google.com/tasks/reference/rest/v1/)
- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Project Implementation Plan](./plans/2025-02-12-google-tasks-integration.md)
