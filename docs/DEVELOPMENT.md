# Pomodoroom Developer Guide

Complete guide for setting up, building, testing, and contributing to Pomodoroom.

## Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Project Setup](#project-setup)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Building](#building)
- [Code Style Guidelines](#code-style-guidelines)
- [Common Issues](#common-issues)

---

## Quick Start

```bash
# Clone repository
git clone https://github.com/rebuildup/pomodoroom-desktop.git
cd pomodoroom-desktop

# Install dependencies
pnpm install
cargo build

# Start development mode
pnpm run tauri:dev
```

---

## Prerequisites

### Required

- **Node.js** >= 18.0.0
- **pnpm** >= 9.0.0
- **Rust** stable toolchain
- **Cargo** (comes with Rust)

### Recommended

- **Git** for version control
- **VS Code** with extensions:
  - `rust-analyzer` for Rust
  - `TypeScript and JavaScript Language Features` for frontend

### Platform-Specific

#### Windows

- Microsoft C++ Build Tools (for Rust compilation)
- WebView2 Runtime (usually pre-installed on Windows 11)

#### macOS

- Xcode Command Line Tools
  ```bash
  xcode-select --install
  ```

#### Linux

```bash
# Ubuntu/Debian
sudo apt install build-essential libwebkit2gtk-4.1-dev libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

# Fedora
sudo dnf install gcc-c++ libwebkit2gtk4.1-devel openssl-devel libappindicator-gtk3-devel

# Arch Linux
sudo pacman -Syu base-devel webkit2gtk-4.1 openssl libappindicator-gtk3
```

---

## Project Setup

### 1. Clone Repository

```bash
git clone https://github.com/rebuildup/pomodoroom-desktop.git
cd pomodoroom-desktop
```

### 2. Install Frontend Dependencies

```bash
pnpm install
```

### 3. Build Rust Workspace

```bash
cargo build
```

This builds:
- `pomodoroom-core` (library)
- `pomodoroom-cli` (CLI binary)
- `pomodoroom-desktop` (Tauri app)

### 4. Verify Installation

```bash
# Test CLI
cargo run -p pomodoroom-cli -- timer status

# Test core library
cargo test -p pomodoroom-core
```

---

## Development Workflow

### Project Structure

```
pomodoroom/
├── Cargo.toml                 # Workspace root
├── package.json               # Frontend config
├── crates/
│   ├── pomodoroom-core/       # Core library (shared)
│   └── pomodoroom-cli/        # CLI binary
├── src-tauri/                 # Tauri desktop app
│   ├── src/
│   │   ├── bridge.rs          # IPC commands
│   │   ├── schedule_commands.rs
│   │   ├── window.rs          # Window management
│   │   └── main.rs            # Entry point
│   ├── Cargo.toml
│   └── tauri.conf.json        # Tauri config
├── src/                       # React frontend
│   ├── main.tsx               # Entry point
│   ├── App.tsx
│   ├── components/
│   │   └── m3/                # Material 3 components
│   ├── views/                 # Window views
│   ├── hooks/                 # React hooks
│   └── types/                 # TypeScript definitions
├── docs/                      # Documentation
└── CLAUDE.md                  # Project guidelines
```

### Adding Business Logic

1. **Core Logic** (`crates/pomodoroom-core/`):
   ```bash
   # Edit core library
   code crates/pomodoroom-core/src/

   # Run tests
   cargo test -p pomodoroom-core
   ```

2. **CLI Exposure** (`crates/pomodoroom-cli/`):
   ```bash
   # Add command handler
   code crates/pomodoroom-cli/src/commands/

   # Test CLI
   cargo run -p pomodoroom-cli -- your-command
   ```

3. **Tauri Bridge** (`src-tauri/src/`):
   ```bash
   # Add IPC command
   code src-tauri/src/bridge.rs

   # Restart tauri:dev
   ```

4. **React UI** (`src/`):
   ```bash
   # Edit components
   code src/components/

   # Hot reload works automatically
   ```

### Development Commands

```bash
# Start Tauri development mode (hot reload)
pnpm run tauri:dev

# Frontend only (for UI work without Rust)
pnpm run dev

# Run CLI commands
cargo run -p pomodoroom-cli -- timer start
cargo run -p pomodoroom-cli -- task list

# Core library tests
cargo test -p pomodoroom-core

# Build for production
pnpm run build
pnpm run tauri:build
```

### Git Workflow

1. Create feature branch:
   ```bash
   git checkout -b feature/your-feature
   ```

2. Make changes and commit:
   ```bash
   git add .
   git commit -m "feat: description"
   ```

3. Run tests before pushing:
   ```bash
   cargo test
   pnpm run test
   ```

4. Push and create PR:
   ```bash
   git push origin feature/your-feature
   ```

---

## Testing

### Rust Tests

```bash
# Run all tests
cargo test

# Run specific package
cargo test -p pomodoroom-core

# Run with output
cargo test -- --nocapture

# Run specific test
cargo test test_name

# Run ignored tests
cargo test -- --ignored
```

### Frontend Tests

```bash
# Run tests
pnpm run test

# Watch mode
pnpm run test:watch

# UI mode
pnpm run test:ui

# Build check (type checking)
pnpm run build:check
```

### Integration Testing

To test Tauri commands:

```typescript
// In your test file
import { invoke } from "@tauri-apps/api/core";

test("cmd_timer_start returns event", async () => {
  const result = await invoke("cmd_timer_start");
  expect(result).toHaveProperty("step_type");
});
```

### Test Coverage

Core library has unit tests in each module:
- `timer/engine.rs` - Timer state machine tests
- `storage/database.rs` - Database operation tests
- `storage/config.rs` - Config management tests

---

## Building

### Development Build

```bash
# Frontend only
pnpm run build

# Tauri app (development)
pnpm run tauri:build --debug
```

### Production Build

```bash
# Tauri app (production)
pnpm run tauri:build
```

Output locations:
- **Windows**: `src-tauri/target/release/pomodoroom-desktop.exe`
- **macOS**: `src-tauri/target/release/bundle/macos/Pomodoroom.app`
- **Linux**: `src-tauri/target/release/pomodoroom-desktop`

### CLI Build

```bash
cargo build --release -p pomodoroom-cli
```

Output: `crates/pomodoroom-cli/target/release/pomodoroom-cli`

---

## Code Style Guidelines

### Rust

1. **Use `cargo fmt`**:
   ```bash
   cargo fmt
   ```

2. **Use `cargo clippy`** for lints:
   ```bash
   cargo clippy -- -D warnings
   ```

3. **Naming conventions**:
   - Types: `PascalCase`
   - Functions/Variables: `snake_case`
   - Constants: `SCREAMING_SNAKE_CASE`

4. **Error handling**:
   - Use `Result<T, E>` for fallible operations
   - Use `?` operator for error propagation
   - Define custom errors in `src/error.rs`

5. **Documentation**:
   - Add module-level docs: `//! Module description`
   - Add item docs: `/// Function description`
   - Include examples in doc comments

### TypeScript

1. **Naming conventions**:
   - Components: `PascalCase`
   - Functions/Variables: `camelCase`
   - Types/Interfaces: `PascalCase`
   - Constants: `SCREAMING_SNAKE_CASE`

2. **Component structure**:
   ```tsx
   // Use function components with hooks
   export function MyComponent({ prop }: Props) {
     // Hooks at top
     const [state, setState] = useState();

     // Event handlers
     const handleClick = () => {
       // ...
     };

     // Render
     return (
       <div onClick={handleClick}>
         {/* ... */}
       </div>
     );
   }
   ```

3. **Type safety**:
   - Avoid `any`
   - Use proper types for Tauri invoke calls
   - Define types in `src/types/`

4. **Imports**:
   - Group imports: React → Third-party → Relative
   - Use type-only imports when possible: `import type { ... }`

### Comments

- **English for code comments**: Use English for all code comments
- **Japanese for UI copy**: UI text should be in Japanese (see `docs/ui-redesign-strategy.md`)

### Commit Messages

Follow conventional commits:
```
type(scope): description

feat(timer): add pause functionality
fix(db): handle missing config file
docs(api): update command examples
refactor(core): extract scheduler to module
test(timer): add state transition tests
```

---

## Common Issues

### Windows: Process Won't Die

```powershell
taskkill /F /IM pomodoroom-desktop.exe
taskkill /F /IM cargo.exe
taskkill /F /IM rustc.exe
```

### Port 1420 Already in Use

```powershell
netstat -ano | findstr :1420
taskkill /F /PID <PID>
```

### Tauri Dev Won't Start

1. Clear cache:
   ```bash
   rm -rf src-tauri/target
   rm -rf node_modules
   pnpm install
   ```

2. Check WebView2 on Windows:
   ```powershell
   # Check if WebView2 is installed
   Get-AppxPackage *Microsoft.WebView2*
   ```

### Database Locked

```bash
# SQLite locks are usually released when process ends
# If stuck, remove lock file:
rm ~/.config/pomodoroom/pomodoroom.db-shm
rm ~/.config/pomodoroom/pomodoroom.db-wal
```

### Rust Compile Errors

1. Update Rust:
   ```bash
   rustup update
   ```

2. Clean build:
   ```bash
   cargo clean
   cargo build
   ```

3. Check Rust version:
   ```bash
   rustc --version
   ```

### Hot Reload Not Working

1. Check Vite is running:
   ```bash
   # Should see output in terminal
   pnpm run dev
   ```

2. Check Tauri dev mode:
   ```bash
   pnpm run tauri:dev
   ```

3. Restart dev servers if stale

---

## Contributing

### Before Contributing

1. Read `CLAUDE.md` for project guidelines
2. Read `docs/ui-redesign-strategy.md` for UI work
3. Check existing issues for similar work

### Making Changes

1. **Small, focused commits**:
   - One logical change per commit
   - Clear commit messages

2. **Test your changes**:
   - Run `cargo test`
   - Run `pnpm run test`
   - Manual testing in `tauri:dev`

3. **Document changes**:
   - Update API docs in `docs/API.md` if adding commands
   - Update architecture docs in `docs/ARCHITECTURE.md` if changing structure

### Pull Requests

1. Fork and create feature branch
2. Make changes with tests
3. Update documentation
4. Create PR with:
   - Description of changes
   - Testing performed
   - Screenshots for UI changes

---

## Useful Resources

### Project Documentation

- `docs/ARCHITECTURE.md` - Architecture overview
- `docs/API.md` - Complete API reference
- `docs/ui-redesign-strategy.md` - UI design guidelines
- `CLAUDE.md` - Project guidelines

### External Resources

- [Tauri Documentation](https://tauri.app/v1/guides/)
- [Rust Book](https://doc.rust-lang.org/book/)
- [React Documentation](https://react.dev/)
- [Material 3 Guidelines](https://m3.material.io/)
