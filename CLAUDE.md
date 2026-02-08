# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pomodoroom Desktop is a Tauri-based desktop application for Pomodoro timer functionality. It combines a React frontend with a Rust backend.

**Tech Stack:**
- Frontend: React 19.2.4 + TypeScript 5.9.3 + Vite 7.3.1
- Backend: Rust + Tauri 2.x
- Styling: Tailwind CSS v4.1.18 (using `@import "tailwindcss"`)
- Build: Tauri CLI

## Common Commands

### Development
```bash
# Start Tauri development mode (frontend + desktop app)
npm run tauri:dev

# Or use the batch file
start.bat
```

### Building
```bash
# Build frontend only
npm run build

# Build Tauri application for production
npm run tauri:build
```

### Troubleshooting
```bash
# Kill stuck processes (window not showing, port conflicts)
taskkill /F /IM pomodoroom-desktop.exe
taskkill /F /IM node.exe

# Check/fix window position issues
powershell -ExecutionPolicy Bypass -File scripts\check_window_pos.ps1

# Clean Rust build artifacts
cd src-tauri && cargo clean
```

## Architecture

### Directory Structure
```
src/              # React frontend (TypeScript)
├── main.tsx      # React entry point
├── App.tsx       # Root component
└── index.css     # Tailwind v4 (@import "tailwindcss")

src-tauri/        # Rust backend
├── src/main.rs   # Tauri entry point with plugin initialization
├── Cargo.toml    # Rust dependencies
└── tauri.conf.json # App configuration (window, build, security)
```

### Key Configuration Files

**vite.config.ts**: Dev server on port 1420, ignores src-tauri for hot-reload

**tailwind.config.js**: Content paths for index.html and src/**/*.{js,ts,jsx,tsx}

**postcss.config.js**: Minimal - only autoprefixer (Tailwind v4 requires no PostCSS plugin)

**tsconfig.json**: Strict mode enabled, unused locals/parameters checked

**tauri.conf.json**:
- Dev URL: `http://localhost:1420`
- Frontend dist: `../dist`
- Window: 800x600, resizable, centered
- CSP disabled (null)

### Tailwind CSS v4 Notes
- Uses `@import "tailwindcss"` in index.css (NOT `@tailwind` directives)
- PostCSS config only includes autoprefixer
- Config via tailwind.config.js content paths

### Tauri Commands (src-tauri/)
Current main.rs is minimal boilerplate. Add Tauri commands here for frontend-backend communication:
```rust
#[tauri::command]
fn my_command() -> Result<(), String> {
    // implementation
}
```
Then register in `.invoke_handler()` and call from frontend via `invoke('my_command')`.

## Development Workflow

1. Edit React components in `src/`
2. Add Rust commands in `src-tauri/src/main.rs` for native functionality
3. Changes hot-reload during `npm run tauri:dev`
4. Test window behavior - Tauri apps can have window positioning issues on Windows
