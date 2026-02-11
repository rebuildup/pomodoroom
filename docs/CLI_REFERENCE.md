# Pomodoroom CLI Reference

Complete reference for all pomodoroom-cli commands and options.

## Table of Contents

- [Installation](#installation)
- [Global Options](#global-options)
- [Commands](#commands)
- [Shell Completions](#shell-completions)
- [Scripting Guide](#scripting-guide)
- [Exit Codes](#exit-codes)

---

## Installation

```bash
# Build from source
cargo build --release -p pomodoroom-cli

# Binary location
./target/release/pomodoroom-cli
```

### System-wide Installation

```bash
# Linux/macOS
sudo cp ./target/release/pomodoroom-cli /usr/local/bin/pomodoroom

# Windows
# Add to PATH manually or use:
copy target\release\pomodoroom-cli.exe C:\Windows\System32\
```

---

## Global Options

```bash
pomodoroom-cli [OPTIONS] <COMMAND>
```

| Option | Description |
|--------|-------------|
| `-h, --help` | Print help information |
| `-V, --version` | Print version information |
| `-v, --verbose` | Increase verbosity (can be used multiple times) |

---

## Commands

### Timer

Control the Pomodoro timer.

```bash
pomodoroom-cli timer <ACTION>
```

#### Actions

**`start`** - Start the timer

```bash
pomodoroom-cli timer start
```

Options:
- `--step <N>` - Start at specific step (0-based index)

**`pause`** - Pause the running timer

```bash
pomodoroom-cli timer pause
```

**`resume`** - Resume a paused timer

```bash
pomodoroom-cli timer resume
```

**`skip`** - Skip to the next step

```bash
pomodoroom-cli timer skip
```

**`reset`** - Reset the timer

```bash
pomodoroom-cli timer reset
```

**`status`** - Show current timer status

```bash
pomodoroom-cli timer status
```

Output:
```
Timer Status
━━━━━━━━━━━━
State:         Running
Current Step:  Focus (15m)
Remaining:     12:34
Progress:      16%
```

---

### Config

Manage configuration.

```bash
pomodoroom-cli config <ACTION>
```

#### Actions

**`get`** - Get a configuration value

```bash
pomodoroom-cli config get <KEY>
```

Examples:
```bash
pomodoroom-cli config get focus_duration    # 25
pomodoroom-cli config get theme             # dark
pomodoroom-cli config get enable_sound      # true
```

**`set`** - Set a configuration value

```bash
pomodoroom-cli config set <KEY> <VALUE>
```

Examples:
```bash
pomodoroom-cli config set focus_duration 30
pomodoroom-cli config set short_break 10
pomodoroom-cli config set theme light
pomodoroom-cli config set volume 0.8
```

**`list`** - List all configuration values

```bash
pomodoroom-cli config list
```

Output:
```
Configuration
━━━━━━━━━━━━
focus_duration       = 25
short_break          = 5
long_break           = 15
sessions_until_long  = 4
enable_sound         = true
volume               = 0.7
theme                = dark
```

---

### Stats

View session statistics.

```bash
pomodoroom-cli stats <ACTION>
```

#### Actions

**`today`** - Show today's statistics

```bash
pomodoroom-cli stats today
```

Output:
```
Today's Statistics
━━━━━━━━━━━━━━━━━━
Sessions:        6
Focus Time:      2h 30m
Break Time:      45m
Pomodoros:       4
```

**`all`** - Show all-time statistics

```bash
pomodoroom-cli stats all
```

Output:
```
All-Time Statistics
━━━━━━━━━━━━━━━━━
Total Sessions:   234
Total Focus:      97h 30m
Total Break:      29h 15m
Pomodoros:        156
```

---

### Task

Manage tasks.

```bash
pomodoroom-cli task <ACTION>
```

#### Actions

**`create`** - Create a new task

```bash
pomodoroom-cli task create <TITLE> [OPTIONS]
```

Options:
- `-d, --description <TEXT>` - Task description
- `-p, --project <ID>` - Associate with project
- `-t, --tags <TAGS>` - Comma-separated tags
- `-e, --estimate <N>` - Estimated pomodoros (default: 1)
- `-P, --priority <N>` - Priority 0-100 (default: 50)
- `-c, --category <active|someday>` - Task category (default: active)

Examples:
```bash
# Simple task
pomodoroom-cli task create "Review PR"

# Full task
pomodoroom-cli task create "Implement feature" \
  --description "Add new feature to the app" \
  --project proj-123 \
  --tags deep,admin \
  --estimate 3 \
  --priority 75

# Someday task
pomodoroom-cli task create "Learn Rust" \
  --category someday
```

**`update`** - Update an existing task

```bash
pomodoroom-cli task update <ID> [OPTIONS]
```

Options: Same as `create`, plus:
- `--title <TITLE>` - New title
- `--completed` - Mark as completed
- `--no-completed` - Mark as incomplete

Examples:
```bash
pomodoroom-cli task update task-123 --priority 90
pomodoroom-cli task update task-123 --tags "deep,admin,blocked"
pomodoroom-cli task update task-123 --completed
```

**`delete`** - Delete a task

```bash
pomodoroom-cli task delete <ID>
```

**`list`** - List tasks

```bash
pomodoroom-cli task list [OPTIONS]
```

Options:
- `-p, --project <ID>` - Filter by project
- `-c, --category <active|someday>` - Filter by category
- `-s, --state <ready|running|paused|done>` - Filter by state

Examples:
```bash
# All tasks
pomodoroom-cli task list

# Active tasks only
pomodoroom-cli task list --category active

# Tasks for a project
pomodoroom-cli task list --project proj-123

# Running tasks
pomodoroom-cli task list --state running
```

Output:
```
Tasks (4)
━━━━━━━━
✓ Implement feature    [running]  ★75  deep,admin
  Review PR             [ready]    ★50  code
  Write docs            [ready]    ★30  docs
  Learn Rust            [someday]  ★20  learning
```

**`get`** - Get a single task

```bash
pomodoroom-cli task get <ID>
```

**`start`** - Start a task (READY → RUNNING)

```bash
pomodoroom-cli task start <ID>
```

**`pause`** - Pause a task (RUNNING → PAUSED)

```bash
pomodoroom-cli task pause <ID>
```

**`resume`** - Resume a task (PAUSED → RUNNING)

```bash
pomodoroom-cli task resume <ID>
```

**`complete`** - Complete a task (RUNNING → DONE)

```bash
pomodoroom-cli task complete <ID>
```

**`postpone`** - Postpone a task (RUNNING/PAUSED → READY, priority -20)

```bash
pomodoroom-cli task postpone <ID>
```

---

### Project

Manage projects.

```bash
pomodoroom-cli project <ACTION>
```

#### Actions

**`create`** - Create a new project

```bash
pomodoroom-cli project create <NAME> [OPTIONS]
```

Options:
- `-d, --deadline <DATE>` - Deadline (ISO 8601 date)

Examples:
```bash
pomodoroom-cli project create "Website Redesign"
pomodoroom-cli project create "Q1 Release" --deadline "2025-03-31"
```

**`list`** - List all projects

```bash
pomodoroom-cli project list
```

Output:
```
Projects (2)
━━━━━━━━━━━
Website Redesign     [Due: 2025-03-31]
Q1 Release          [Due: 2025-03-31]
Mobile App          [No deadline]
```

---

### Template

Manage daily schedule template.

```bash
pomodoroom-cli template <ACTION>
```

#### Actions

**`get`** - Get current template

```bash
pomodoroom-cli template get
```

**`set`** - Set template values

```bash
pomodoroom-cli template set [OPTIONS]
```

Options:
- `-w, --wake-up <TIME>` - Wake up time (HH:MM)
- `-s, --sleep <TIME>` - Sleep time (HH:MM)
- `-l, --lanes <N>` - Max parallel lanes

Examples:
```bash
pomodoroom-cli template set --wake-up 07:00 --sleep 23:00
pomodoroom-cli template set --lanes 3
```

**`add-event`** - Add a fixed event

```bash
pomodoroom-cli template add-event <TITLE> <START> <END> [OPTIONS]
```

Options:
- `-t, --type <routine|calendar>` - Event type (default: routine)

Examples:
```bash
pomodoroom-cli template add-event "Lunch" 12:00 13:00
pomodoroom-cli template add-event "Team Standup" 09:00 09:15 --type routine
```

**`clear-events`** - Clear all fixed events

```bash
pomodoroom-cli template clear-events
```

---

### Schedule

Manage and generate schedules.

```bash
pomodoroom-cli schedule <ACTION>
```

#### Actions

**`list`** - List schedule for a date

```bash
pomodoroom-cli schedule list [DATE] [OPTIONS]
```

Options:
- `--start <TIME>` - Start time filter
- `--end <TIME>` - End time filter
- `-l, --lane <N>` - Filter by lane

Examples:
```bash
# Today's schedule
pomodoroom-cli schedule list

# Specific date
pomodoroom-cli schedule list 2025-01-09

# Time range
pomodoroom-cli schedule list --start 09:00 --end 17:00
```

Output:
```
Schedule for 2025-01-09
━━━━━━━━━━━━━━━━━━━━━━━
09:00 - 09:25  Focus: Deep Work           [Lane 0] ✓ locked
09:25 - 09:30  Break: Short Break
09:30 - 10:30  Focus: Implement Feature    [Lane 1]
09:30 - 09:55  Focus: Code Review         [Lane 0]
...
```

**`generate`** - Generate schedule from template

```bash
pomodoroom-cli schedule generate <DATE> [OPTIONS]
```

Options:
- `--events <FILE>` - Calendar events JSON file
- `-o, --output <FILE>` - Output to file

**`autofill`** - Auto-fill available time slots

```bash
pomodoroom-cli schedule autofill <DATE> [OPTIONS]
```

Options: Same as `generate`

---

### Auth

Manage integration authentication.

```bash
pomodoroom-cli auth <ACTION>
```

#### Actions

**`login`** - Authenticate with a service

```bash
pomodoroom-cli auth login <SERVICE>
```

Services: `google`, `notion`, `linear`, `github`, `discord`, `slack`

Examples:
```bash
pomodoroom-cli auth login google
# Opens browser for OAuth flow

pomodoroom-cli auth login github
# Prompts for personal access token
```

**`logout`** - Disconnect from a service

```bash
pomodoroom-cli auth logout <SERVICE>
```

**`list`** - List connected services

```bash
pomodoroom-cli auth list
```

Output:
```
Connected Services
━━━━━━━━━━━━━━━━━
✓ google    (connected)
✗ notion    (not connected)
✗ linear    (not connected)
```

**`status`** - Check authentication status

```bash
pomodoroom-cli auth status <SERVICE>
```

---

### Sync

Synchronize with external services.

```bash
pomodoroom-cli sync <ACTION>
```

#### Actions

**`all`** - Sync with all connected services

```bash
pomodoroom-cli sync all
```

**`<SERVICE>`** - Sync with specific service

```bash
pomodoroom-cli sync <SERVICE>
```

Services: `google`, `notion`, `linear`, `github`, `discord`, `slack`

Examples:
```bash
pomodoroom-cli sync google
pomodoroom-cli sync notion
```

---

### Complete

Generate shell completion scripts.

```bash
pomodoroom-cli complete <SHELL>
```

Shells: `bash`, `zsh`, `fish`, `elvish`, `powershell`

Examples:
```bash
# Generate and save completions
pomodoroom-cli complete bash > ~/.local/share/bash-completion/completions/pomodoroom-cli
pomodoroom-cli complete zsh > ~/.zsh/completions/_pomodoroom-cli
pomodoroom-cli complete fish > ~/.config/fish/completions/pomodoroom-cli.fish
pomodoroom-cli complete powershell > pomodoroom-cli.ps1
```

---

## Shell Completions

### Bash

```bash
# Generate completion file
pomodoroom-cli complete bash > ~/.local/share/bash-completion/completions/pomodoroom-cli

# Source it in .bashrc
echo 'source ~/.local/share/bash-completion/completions/pomodoroom-cli' >> ~/.bashrc
```

### Zsh

```bash
# Generate completion file
pomodoroom-cli complete zsh > ~/.zsh/completions/_pomodoroom-cli

# Add to fpath in .zshrc
mkdir -p ~/.zsh/completions
echo 'fpath=(~/.zsh/completions $fpath)' >> ~/.zshrc
echo 'autoload -U compinit && compinit' >> ~/.zshrc
```

### Fish

```bash
# Generate completion file
pomodoroom-cli complete fish > ~/.config/fish/completions/pomodoroom-cli.fish
```

### PowerShell

```bash
# Generate completion script
pomodoroom-cli complete powershell > pomodoroom-cli.ps1

# Source in profile
echo '. ./pomodoroom-cli.ps1' >> $PROFILE
```

---

## Scripting Guide

### Basic Scripting

```bash
#!/bin/bash
# morning-routine.sh

# Start first focus session
pomodoroom-cli task start "$(pomodoroom-cli task list --state ready | head -n 1 | cut -d' ' -f3)"
pomodoroom-cli timer start
```

### Task Automation

```bash
#!/bin/bash
# create-and-start.sh

TITLE="$1"
pomodoroom-cli task create "$TITLE" --tags deep

# Get the created task ID
TASK_ID=$(pomodoroom-cli task list | grep "$TITLE" | tail -n 1 | cut -d' ' -f3)

# Start the task
pomodoroom-cli task start "$TASK_ID"
pomodoroom-cli timer start
```

### Status Checking

```bash
#!/bin/bash
# check-progress.sh

STATUS=$(pomodoroom-cli timer status | grep "State:" | awk '{print $2}')
if [ "$STATUS" = "Running" ]; then
  echo "Timer is running"
else
  echo "Timer is not running"
fi
```

### Statistics Query

```bash
#!/bin/bash
# daily-report.sh

TODAY_FOCUS=$(pomodoroom-cli stats today | grep "Focus Time:" | awk '{print $3}')
TOTAL_POMODOROS=$(pomodoroom-cli stats all | grep "Pomodoros:" | awk '{print $2}')

echo "Today: $TODAY_FOCUS focus time"
echo "All-time: $TOTAL_POMODOROS pomodoros completed"
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid usage |
| 3 | Database error |
| 4 | Authentication error |
| 5 | Network error |

### Example Exit Code Handling

```bash
#!/bin/bash

pomodoroom-cli task start "$TASK_ID"
EXIT_CODE=$?

case $EXIT_CODE in
  0) echo "Task started successfully" ;;
  1) echo "General error occurred" ;;
  2) echo "Invalid task ID or state" ;;
  3) echo "Database error - check permissions" ;;
  4) echo "Authentication required" ;;
  *) echo "Unknown error: $EXIT_CODE" ;;
esac
```

---

## Tips and Tricks

### Quick Task Creation

```bash
# Create and start in one command
alias pstart='pomodoroom-cli task create "$1" && pomodoroom-cli timer start'
```

### Status Line for Shell Prompt

```bash
# Add to .bashrc or .zshrc
_pomodoroom_status() {
  local status=$(pomodoroom-cli timer status 2>/dev/null | grep "State:" | awk '{print $2}')
  if [ "$status" = "Running" ]; then
    echo "🍅"
  fi
}
export PS1='$(_pomodoroom_status) \u@\h:\w$ '
```

### Timer Notifications

```bash
# Run command when timer completes
pomodoroom-cli timer start && notify-send "Pomodoro Complete"
```
