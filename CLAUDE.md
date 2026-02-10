# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pomodoroom is a CLI-first Pomodoro timer with a Tauri desktop GUI. All business
logic lives in Rust (pomodoroom-core), exposed via both a standalone CLI binary
and a Tauri desktop application. The GUI is a thin React skin over the Rust core.

**Tech Stack:**
- Core: Rust (pomodoroom-core library)
- CLI: Rust + clap (pomodoroom-cli binary)
- Desktop: Tauri 2.x (pomodoroom-desktop)
- Frontend: React 19 + TypeScript 5 + Vite 7
- Styling: Tailwind CSS v4 (using `@import "tailwindcss"`)
- Storage: SQLite (`~/.pomodoroom/pomodoroom.db`) + TOML config (`~/.pomodoroom/config.toml`)

## Cargo Workspace

```
Cargo.toml                     # [workspace] root
crates/
  pomodoroom-core/             # Library: timer engine, storage, integrations
  pomodoroom-cli/              # Binary: standalone CLI
src-tauri/                     # Binary: Tauri desktop GUI
  src/
    main.rs                    # Entry point + plugin init
    bridge.rs                  # Tauri commands wrapping core
    window.rs                  # PureRef-style window management
    tray.rs                    # System tray with context menu
src/                           # React frontend
  components/PomodoroTimer.tsx # Main UI component
  hooks/                       # useLocalStorage, useNotifications, etc.
  types/                       # TypeScript type definitions
```

## Common Commands

### Development
```bash
# Build all Rust crates (core + cli + desktop)
cargo build

# Run CLI commands
cargo run -p pomodoroom-cli -- timer status
cargo run -p pomodoroom-cli -- config list
cargo run -p pomodoroom-cli -- schedule list

# Start Tauri development mode (frontend + desktop app)
pnpm run tauri:dev

# Run core tests
cargo test -p pomodoroom-core
```

### Building
```bash
# Build frontend only
pnpm run build

# Build Tauri application for production
pnpm run tauri:build
```

## UI Redesign (Current Priority)

The project is in a **UI-first redesign phase** targeting Material 3 (Google-style).
All design decisions, terminology, migration strategy, and milestone definitions
are documented in `docs/ui-redesign-strategy.md`. **Read that file before any UI work.**

Key rules:
- **No "Delay/遅延"** — use "Pressure" everywhere
- **Task states**: READY / RUNNING / PAUSED / DONE (strict transitions)
- **New M3 components** go in `src/components/m3/`
- **Old components** stay in `src/components/` until fully replaced
- **Milestones**: M0 (Foundation) → M1 (Shell) → M2 (Components) → M3 (Floating)
- **1 issue = 1 PR** (granularity rule)

## Architecture

### CLI-First Philosophy
- "CLI is the truth, GUI is a skin."
- All operations available via `pomodoroom-cli` commands
- Desktop app calls the same core library in-process (bridge.rs)
- Timer engine is a state machine: Idle -> Running -> Paused -> Completed

### Window Modes (PureRef-style)
| Mode          | Decorations | Always-on-top | Size    |
|---------------|-------------|---------------|---------|
| Normal        | Yes         | No            | 800x600 |
| Pinned        | Yes         | Yes           | 800x600 |
| Float (Timer) | No          | Yes           | 280x280 |

### Integration Plugin System
Each external service implements the `Integration` trait in pomodoroom-core.
Priority: Google > Notion > Linear > GitHub > Discord > Slack.

### Key Files
- `crates/pomodoroom-core/src/timer/engine.rs` -- Timer state machine
- `crates/pomodoroom-core/src/timer/schedule.rs` -- Progressive schedule
- `crates/pomodoroom-core/src/storage/database.rs` -- SQLite sessions/stats
- `crates/pomodoroom-core/src/storage/config.rs` -- TOML config management
- `crates/pomodoroom-core/src/integrations/traits.rs` -- Integration trait
- `src-tauri/src/bridge.rs` -- Tauri IPC commands
- `src-tauri/src/window.rs` -- Window state (always-on-top, float, drag)
- `src-tauri/src/tray.rs` -- System tray with Show/Pin/Float/Quit

### Tauri Capabilities
Window permissions and tray permissions are configured in
`src-tauri/capabilities/default.json`. Add new permissions there when
exposing new Tauri APIs to the frontend.

## Development Workflow

1. Add business logic in `crates/pomodoroom-core/`
2. Expose via CLI in `crates/pomodoroom-cli/`
3. Bridge to Tauri in `src-tauri/src/bridge.rs`
4. Build React UI in `src/components/`
5. Run `cargo test -p pomodoroom-core` before committing
6. Changes hot-reload during `pnpm run tauri:dev`

## Frontend Structure

Multi-Window Architecture (PureRef-style):
- `main.tsx` - Entry point, routes to views based on window label
- `views/` - Separate views for different windows:
  - `MiniTimerView.tsx` - Float timer (280x280, no decorations)
  - `StatsView.tsx` - Statistics dashboard
  - `SettingsView.tsx` - Configuration
  - `NoteView.tsx` - Session notes
  - `YouTubeView.tsx` - Music/lo-fi player
- `components/` - Shared UI components (PomodoroTimer, MiniTimer, etc.)

Window routing: `getCurrentWindow().label` determines which view renders.
Use `invoke('cmd_open_window', { label, title, width, height, ... })` to spawn new windows.

## Timer Engine Details

The timer uses wall-clock deltas (`now_ms()`) not internal threads. Caller must:
1. Call `engine.start()` to begin
2. Call `engine.tick()` periodically (frontend uses `setInterval`)
3. Flush elapsed time on pause/resume

State transitions: Idle -> Running -> (Paused | Completed) -> Idle

## Troubleshooting (Windows)

### Process won't die
```powershell
taskkill /F /IM pomodoroom-desktop.exe
taskkill /F /IM cargo.exe
taskkill /F /IM rustc.exe
```

### Port 1420 in use
```powershell
netstat -ano | findstr :1420
taskkill /F /PID <PID>
```
