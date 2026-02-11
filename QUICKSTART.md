# Quick Start Guide

Get Pomodoroom up and running in 5 minutes.

## Prerequisites

- **Node.js** >= 18.0.0
- **pnpm** >= 9.0.0
- **Rust** stable toolchain

### Install Rust

```bash
# macOS/Linux
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Windows
# Download from https://rustup.rs/
```

### Install pnpm

```bash
npm install -g pnpm
```

---

## Installation

```bash
# Clone repository
git clone https://github.com/rebuildup/pomodoroom-desktop.git
cd pomodoroom-desktop

# Install frontend dependencies
pnpm install

# Build Rust workspace
cargo build
```

---

## Running the Application

### Desktop App (Development)

```bash
pnpm run tauri:dev
```

Or use the batch file (Windows):
```bash
start.bat
```

### CLI Only

```bash
# Build CLI
cargo build -p pomodoroom-cli

# Run commands
./target/debug/pomodoroom-cli timer start
./target/debug/pomodoroom-cli task list
```

---

## Quick Verification

### 1. Test CLI

```bash
cargo run -p pomodoroom-cli -- timer status
```

Expected output:
```
Timer Status
━━━━━━━━━━━━
State: Idle
Step: Focus (15m)
```

### 2. Test Desktop App

```bash
pnpm run tauri:dev
```

The application window should open with:
- Timer display
- Task list
- Settings panel

### 3. Run Tests

```bash
# Rust tests
cargo test -p pomodoroom-core

# Frontend tests
pnpm run test
```

---

## Common Commands

### Timer

```bash
# Start timer
cargo run -p pomodoroom-cli -- timer start

# Pause timer
cargo run -p pomodoroom-cli -- timer pause

# Resume timer
cargo run -p pomodoroom-cli -- timer resume

# Reset timer
cargo run -p pomodoroom-cli -- timer reset

# Show status
cargo run -p pomodoroom-cli -- timer status
```

### Tasks

```bash
# Create task
cargo run -p pomodoroom-cli -- task create "My Task" --tags deep

# List tasks
cargo run -p pomodoroom-cli -- task list

# Start task
cargo run -p pomodoroom-cli -- task start <task-id>

# Complete task
cargo run -p pomodoroom-cli -- task complete <task-id>
```

### Projects

```bash
# Create project
cargo run -p pomodoroom-cli -- project create "My Project"

# List projects
cargo run -p pomodoroom-cli -- project list
```

---

## Data Location

Your data is stored at:

| Platform | Location |
|----------|----------|
| **Linux** | `~/.config/pomodoroom/` |
| **macOS** | `~/Library/Application Support/pomodoroom/` |
| **Windows** | `%APPDATA%\pomodoroom\` |

Files:
- `pomodoroom.db` - SQLite database (sessions, tasks, projects)
- `config.toml` - Application configuration

---

## Next Steps

1. **Read full documentation**:
   - `docs/ARCHITECTURE.md` - System architecture
   - `docs/API.md` - Complete API reference
   - `docs/DEVELOPMENT.md` - Development guide

2. **Configure your schedule**:
   ```bash
   cargo run -p pomodoroom-cli -- template set --wake-up 07:00 --sleep 23:00
   ```

3. **Connect integrations**:
   ```bash
   cargo run -p pomodoroom-cli -- auth login google
   ```

---

## Troubleshooting

### Port 1420 Already in Use

```bash
# macOS/Linux
lsof -ti:1420 | xargs kill -9

# Windows (PowerShell)
netstat -ano | findstr :1420
taskkill /F /PID <PID>
```

### Rust Build Fails

```bash
# Update Rust
rustup update

# Clean build
cargo clean
cargo build
```

### Database Locked

```bash
# Close all Pomodoroom processes
# Remove lock files (Linux/macOS)
rm ~/.config/pomodoroom/pomodoroom.db-shm
rm ~/.config/pomodoroom/pomodoroom.db-wal

# Windows
del %APPDATA%\pomodoroom\pomodoroom.db-shm
del %APPDATA%\pomodoroom\pomodoroom.db-wal
```

### Window Not Visible (Windows)

If the window opens but is not visible:

```powershell
cd C:\Users\rebui\Desktop\pomodoroom-desktop
powershell -ExecutionPolicy Bypass -File scripts\check_window_pos.ps1
```

---

## Getting Help

- **Documentation**: `docs/` directory
- **Issues**: https://github.com/rebuildup/pomodoroom-desktop/issues
- **Discussions**: https://github.com/rebuildup/pomodoroom-desktop/discussions
