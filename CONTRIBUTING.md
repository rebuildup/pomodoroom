# Contributing to Pomodoroom

Thank you for your interest in contributing to Pomodoroom!

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Coding Conventions](#coding-conventions)
- [Branch Naming](#branch-naming)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Development Workflow](#development-workflow)

---

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow

---

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/pomodoroom-desktop.git
   cd pomodoroom-desktop
   ```
3. Add upstream remote:
   ```bash
   git remote add upstream https://github.com/rebuildup/pomodoroom-desktop.git
   ```
4. Install dependencies:
   ```bash
   pnpm install
   cargo build
   ```

---

## Coding Conventions

### Rust

**Formatting**:
```bash
cargo fmt
```

**Linting**:
```bash
cargo clippy -- -D warnings
```

**Naming**:
- Types: `PascalCase`
- Functions/Variables: `snake_case`
- Constants: `SCREAMING_SNAKE_CASE`

**Example**:
```rust
/// Calculate priority score for a task.
pub fn calculate_priority(task: &Task) -> u32 {
    let base_score = task.priority.unwrap_or(50);
    let urgency_factor = calculate_urgency(&task.deadline);
    base_score + urgency_factor
}
```

**Error Handling**:
- Use `Result<T, E>` for fallible operations
- Use `?` operator for error propagation
- Define custom errors in `src/error.rs`

```rust
use crate::error::CoreError;

pub fn do_something() -> Result<(), CoreError> {
    let result = risky_operation()?;
    Ok(())
}
```

### TypeScript

**Naming**:
- Components: `PascalCase`
- Functions/Variables: `camelCase`
- Types/Interfaces: `PascalCase`
- Constants: `SCREAMING_SNAKE_CASE`

**Component Structure**:
```tsx
// Use function components with hooks
interface TaskCardProps {
  task: Task;
  onStart: (id: string) => void;
}

export function TaskCard({ task, onStart }: TaskCardProps) {
  // Hooks at top
  const [isExpanded, setIsExpanded] = useState(false);

  // Event handlers
  const handleStart = () => {
    onStart(task.id);
  };

  // Render
  return (
    <div className="task-card">
      <h3>{task.title}</h3>
      <button onClick={handleStart}>Start</button>
    </div>
  );
}
```

**Type Safety**:
- Avoid `any`
- Use proper types for Tauri invoke calls
- Define types in `src/types/`

```typescript
// Good
const tasks = await invoke<Task[]>("cmd_task_list");

// Bad
const tasks = await invoke("cmd_task_list") as any[];
```

**Imports**:
```typescript
// Group imports: React → Third-party → Relative
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TaskCard } from "./components/TaskCard";
import type { Task } from "./types/task";
```

### Comments

- **English for code comments**: All code comments should be in English
- **Japanese for UI copy**: UI text should be in Japanese (see `docs/ui-redesign-strategy.md`)

---

## Branch Naming

Use the following pattern: `<type>/<short-description>`

### Types

| Type | Usage |
|------|-------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code refactoring |
| `docs` | Documentation changes |
| `test` | Test additions/changes |
| `chore` | Maintenance tasks |

### Examples

```
feat/timer-pause-button
fix/db-connection-leak
refactor/scheduler-module
docs/api-reference
test/integration-tests
chore/update-dependencies
```

---

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Test additions/changes
- `chore`: Maintenance tasks
- `perf`: Performance improvements

### Examples

```
feat(timer): add pause/resume functionality

Implement pause and resume buttons for the timer.
Updates state machine to handle Paused state.

Closes #123
```

```
fix(db): handle missing config file

When config file doesn't exist, create default
instead of crashing. Fixes #456.
```

```
refactor(core): extract scheduler to module

Move scheduler logic from core module to dedicated
scheduler module for better organization.
```

---

## Pull Request Process

### 1. Before Creating PR

- [ ] Run tests: `cargo test` and `pnpm run test`
- [ ] Format code: `cargo fmt`
- [ ] Run linter: `cargo clippy -- -D warnings`
- [ ] Update documentation if needed
- [ ] Add tests for new functionality

### 2. Create PR

1. Push your branch:
   ```bash
   git push origin feat/your-feature
   ```

2. Create PR on GitHub with:
   - **Title**: Follow commit message format
   - **Description**: Include:
     - What changed and why
     - How to test
     - Screenshots for UI changes
     - Related issues

3. Link to issue (if applicable):
   ```
   Closes #123
   Fixes #456
   ```

### 3. PR Review

- Address review feedback promptly
- Keep discussions constructive
- Ask for clarification if needed

### 4. Merge

Once approved:
- Squash commits if needed
- Ensure PR title is clear
- Delete branch after merge

---

## Development Workflow

### Issue-Driven Fast Path

Use this flow to start work from a GitHub issue quickly and consistently.

```powershell
# One-file autopilot (recommended)
pnpm run autopilot -- ops/autopilot/start-next.json

# End-to-end autopilot (recommended for agent chat)
# Runs: start -> checks -> PR -> check-wait -> merge
pnpm run autopilot -- ops/autopilot/full-next-draft-pr.json

# Optional: ensure status/size labels exist
pnpm run issue:labels

# Auto-pick next candidate issue
pnpm run issue:next

# Start from an issue (creates/checks out issue-* branch and notes file)
pnpm run issue:start -- 265

# Implement and verify
pnpm run check
cargo test -p pomodoroom-core
cargo test -p pomodoroom-cli -- --test-threads=1

# Create PR linked to issue (manual path)
pnpm run issue:pr
```

Rules:
- Use `issue-<number>-<slug>` branch names
- Include `Closes #<number>` in PR body
- Fill `Test Evidence` section in PR template
- Track progress with `status-*` labels
- Never merge before all local and GitHub checks are green
- `ops/autopilot/full-next-draft-pr.json` is the default chat shortcut for fully automated safe merge

### Feature Development

```bash
# 1. Create feature branch
git checkout -b feat/your-feature

# 2. Make changes
# ... edit files ...

# 3. Format and lint
cargo fmt
cargo clippy -- -D warnings

# 4. Run tests
cargo test
pnpm run test

# 5. Commit
git add .
git commit -m "feat: description"

# 6. Push and create PR
git push origin feat/your-feature
```

### Bug Fix Development

```bash
# 1. Create fix branch
git checkout -b fix/issue-description

# 2. Reproduce the bug
# ... run tests or manual steps ...

# 3. Add failing test (if applicable)
# ... write test that fails ...

# 4. Fix the bug
# ... edit code ...

# 5. Verify fix
cargo test
pnpm run test

# 6. Commit and PR
git add .
git commit -m "fix: description of fix"
git push origin fix/issue-description
```

### Keeping Your Branch Updated

```bash
# Fetch upstream
git fetch upstream

# Rebase your branch
git rebase upstream/main

# Push updated branch
git push origin feat/your-feature --force-with-lease
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
```

### Frontend Tests

```bash
# Run tests
pnpm run test

# Watch mode
pnpm run test:watch

# UI mode
pnpm run test:ui
```

### Manual Testing

Before submitting PR:
1. Start `tauri:dev`
2. Test all affected features
3. Test on all target platforms (if possible)

---

## Documentation

When adding new features:

1. **API Documentation**: Update `docs/API.md` if adding new commands
2. **Architecture**: Update `docs/ARCHITECTURE.md` if changing structure
3. **Types**: Add TypeScript types in `src/types/`
4. **Comments**: Add doc comments to Rust code

---

## Getting Help

- **Documentation**: Check `docs/` directory
- **Issues**: Search existing issues first
- **Discussions**: Use GitHub Discussions for questions
- **Discord**: (if available)

---

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.
