# Pomodoroom v2 Architecture

## Philosophy

**"CLI is the truth, GUI is a skin."**

All application logic lives in Rust. The GUI (Tauri WebView) is a thin
rendering layer that invokes the CLI binary for every operation. This means:

- The app works headless (`pomodoroom-cli timer start`)
- Scripts, cron, and CI/CD can drive the app
- The GUI can be replaced without touching business logic
- Testing is straightforward (CLI input/output assertions)

## Binary Structure

Two independent binaries sharing a library crate:

```
pomodoroom/
  Cargo.toml                   # [workspace]
  crates/
    pomodoroom-core/           # Library: engine, storage, integrations
    pomodoroom-cli/            # Binary: CLI interface
  src-tauri/                   # Binary: Tauri desktop GUI
  src/                         # React frontend
```

`pomodoroom-core` is the shared library. Both the CLI and the desktop app
depend on it. The desktop app also invokes `pomodoroom-cli` as a subprocess
for operations that benefit from process isolation.

## Layer Architecture

```
GUI (React)  ──invoke()──>  Tauri IPC  ──>  pomodoroom-core (lib)
                                              |
CLI (clap)   ─────────────────────────>  pomodoroom-core (lib)
                                              |
                                         Storage (SQLite + Keyring + TOML)
                                              |
                                         Integration Plugins
```

## Timer Engine

State machine with these states:

```
Idle ──start──> Running ──pause──> Paused ──resume──> Running
  ^                |                                     |
  |                +──complete──> Completed ──next──>────+
  |                                  |
  +──────────────reset───────────────+
```

Progressive schedule (default):

| Step | Type  | Duration | Label          |
|------|-------|----------|----------------|
| 1    | focus | 15m      | Warm Up        |
| 2    | break | 5m       | Short Break    |
| 3    | focus | 30m      | Deep Work I    |
| 4    | break | 5m       | Short Break    |
| 5    | focus | 45m      | Deep Work II   |
| 6    | break | 5m       | Short Break    |
| 7    | focus | 60m      | Flow State I   |
| 8    | break | 5m       | Short Break    |
| 9    | focus | 75m      | Flow State II  |
| 10   | break | 30m      | Long Break     |

Schedule is fully customizable via config or CLI.

## Storage

- **SQLite** (`~/.pomodoroom/pomodoroom.db`): sessions, stats, widget state
- **OS Keyring**: OAuth tokens (Windows Credential Manager / macOS Keychain / Linux Secret Service)
- **TOML** (`~/.pomodoroom/config.toml`): user preferences, schedule

## Window Modes (PureRef-style)

| Mode          | Decorations | Transparent | Always-on-top | Input     |
|---------------|-------------|-------------|---------------|-----------|
| Normal        | Yes         | No          | No            | Full      |
| Pinned        | Yes         | No          | Yes           | Full      |
| Float (Timer) | No          | Yes         | Yes           | R-click   |
| Tray-only     | Hidden      | N/A         | N/A           | Tray menu |

Float mode: frameless transparent window showing only the circular timer.
Right-click opens context menu (pause/skip/pin/exit). Left-drag to move.

## Integration Plugin System

Each integration implements a common trait:

```rust
pub trait Integration: Send + Sync {
    fn name(&self) -> &str;
    fn is_authenticated(&self) -> bool;
    fn authenticate(&mut self) -> Result<()>;
    fn on_focus_start(&self, session: &Session) -> Result<()>;
    fn on_break_start(&self, session: &Session) -> Result<()>;
    fn on_session_complete(&self, session: &Session) -> Result<()>;
    fn disconnect(&mut self) -> Result<()>;
}
```

### Integration Priority

1. Google (Calendar + Todo)
2. Notion
3. Linear
4. GitHub
5. Discord
6. Slack

### Per-integration Behavior

| Service  | Focus Start           | Break Start          | Session Complete           |
|----------|-----------------------|----------------------|----------------------------|
| Google   | Calendar event create | --                   | Event end time update      |
| Notion   | --                    | --                   | Session log write          |
| Linear   | Issue time tracking   | --                   | Time tracking stop         |
| GitHub   | Status "Focusing"     | Status "On Break"    | Commit time tag            |
| Discord  | Rich Presence         | Rich Presence update | Presence clear             |
| Slack    | Status + DND on       | Status clear         | --                         |

## CLI Command Tree

```
pomodoroom-cli
  timer
    start [--step N]
    pause
    resume
    skip
    reset
    status              # JSON output
  config
    get <key>
    set <key> <value>
    list
    reset
  auth
    <service> login
    <service> logout
    <service> status
  sync
    <service> [--dry-run]
  stats
    today
    week
    month
    export [--format csv|json]
  schedule
    list
    set <json>
    reset
```

## Mobile Considerations

Tauri 2.x supports iOS/Android. Desktop-only features (tray, transparency,
always-on-top) are behind `#[cfg(desktop)]` guards. Mobile gets:

- Timer + controls
- Session stats
- Integration sync
- Simplified widget layout

No architectural changes needed for mobile -- just conditional compilation
and responsive UI.

## Implementation Phases

| Phase | Scope                                    |
|-------|------------------------------------------|
| P0    | Cargo workspace, core lib, CLI, storage  |
| P1    | Window features (pin, float, tray)       |
| P2    | Google integration (OAuth + Calendar)    |
| P3    | Notion, Linear, GitHub integrations      |
| P4    | Discord, Slack integrations              |
| P5    | Cross-platform builds (macOS, Linux)     |
| P6    | Mobile (iOS, Android)                    |
