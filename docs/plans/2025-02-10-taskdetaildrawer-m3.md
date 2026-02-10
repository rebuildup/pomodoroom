# TaskDetailDrawer M3 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create Material 3 TaskDetailDrawer and TaskHistory components with slide-in animation

**Architecture:**
- M3 TaskDetailDrawer: Slide-in from right drawer using Material 3 design tokens
- M3 TaskHistory: Extracted sub-component for displaying task history timeline
- Reuse existing M3 Icon component for all icons
- Support both Task (schedule.ts) and TaskStreamItem (taskstream.ts) types

**Tech Stack:** React 19, TypeScript 5, Tailwind CSS v4, Material 3 design tokens

---

## Task 1: Create M3 TaskDetailDrawer component

**Files:**
- Create: `src/components/m3/TaskDetailDrawer.tsx`
- Reference: `src/components/TaskDetailDrawer.tsx` (existing implementation)
- Types: `src/types/schedule.ts`, `src/types/taskstream.ts`

**Step 1: Write the component structure**

Create `src/components/m3/TaskDetailDrawer.tsx`:
```tsx
/**
 * TaskDetailDrawer — Material 3 slide-out drawer for task details.
 *
 * Features:
 * - Slide-in animation from right
 * - Close on backdrop click, ESC key, or close button
 * - Mobile responsive (full screen on mobile, 360px drawer on desktop)
 * - Read-only view with edit button to open TaskDialog
 * - Displays: title, description, tags, project, pomodoros, timestamps, history
 *
 * Usage:
 * ```tsx
 * <TaskDetailDrawer
 *   isOpen={isDrawerOpen}
 *   onClose={() => setIsDrawerOpen(false)}
 *   task={selectedTask}
 *   projects={projects}
 *   onEdit={() => { setIsDrawerOpen(false); setIsDialogOpen(true); }}
 * />
 * ```
 */
import { useState, useEffect } from "react";
import { Icon } from "./Icon";
import type { MSIconName } from "./Icon";
import type { Project } from "@/types";
import type { Task as TaskType } from "@/types/schedule";
import type { TaskStreamItem } from "@/types/taskstream";

// ─── Types ────────────────────────────────────────────────────────────────────────

export type TaskDetailProps = TaskType | TaskStreamItem;

interface TaskDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  task?: TaskDetailProps | null;
  projects?: Project[];
  onEdit?: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function getTaskStatusInfo(task: TaskDetailProps): { icon: MSIconName; label: string; color: string } {
  if ("completedPomodoros" in task) {
    // Task type
    if (task.completed) {
      return { icon: "check_circle", label: "Completed", color: "text-green-emphasis" };
    }
    if (task.completedPomodoros > 0) {
      return { icon: "radio_button_checked", label: "In Progress", color: "text-primary-emphasis" };
    }
    return { icon: "circle", label: "Not Started", color: "text-outline" };
  }
  // TaskStreamItem type
  switch (task.status) {
    case "doing":
      return { icon: "radio_button_checked", label: "In Progress", color: "text-primary-emphasis" };
    case "log":
      return { icon: "check_circle", label: "Completed", color: "text-green-emphasis" };
    case "interrupted":
      return { icon: "warning", label: "Interrupted", color: "text-tertiary" };
    case "defer":
    case "routine":
      return { icon: "archive", label: task.status === "defer" ? "Deferred" : "Routine", color: "text-secondary" };
    default:
      return { icon: "circle", label: "Planned", color: "text-outline" };
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────────

interface InfoItemProps {
  icon: MSIconName;
  label: string;
  value: React.ReactNode;
}

function InfoItem({ icon, label, value }: InfoItemProps) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <div className="shrink-0 mt-0.5 text-icon">
        <Icon name={icon} size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-on-surface-variant uppercase tracking-wide">
          {label}
        </div>
        <div className="text-on-surface break-words">
          {value}
        </div>
      </div>
    </div>
  );
}

interface HistoryEntryProps {
  timestamp: string;
  action: string;
}

function HistoryEntry({ timestamp, action }: HistoryEntryProps) {
  return (
    <div className="flex items-start gap-3 text-xs">
      <span className="shrink-0 text-on-surface-variant font-mono tabular-nums">
        {formatDate(timestamp)}
      </span>
      <span className="flex-1 text-on-surface">
        {action}
      </span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────────

export function TaskDetailDrawer({
  isOpen,
  onClose,
  task,
  projects = [],
  onEdit,
}: TaskDetailDrawerProps) {
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (!isOpen) return;

    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen || !task) {
    return null;
  }

  // Get project name
  const projectName = task.projectId
    ? projects.find((p) => p.id === task.projectId)?.name
    : null;

  // Get status info
  const statusInfo = getTaskStatusInfo(task);

  // Generate history entries
  const historyEntries: Array<{ timestamp: string; action: string }> = [];

  if ("createdAt" in task) {
    historyEntries.push({
      timestamp: task.createdAt,
      action: "Task created",
    });
  }

  if ("startedAt" in task && task.startedAt) {
    historyEntries.push({
      timestamp: task.startedAt,
      action: "Started working",
    });
  }

  if ("completedAt" in task && task.completedAt) {
    historyEntries.push({
      timestamp: task.completedAt,
      action: "Completed",
    });
  }

  // Sort by timestamp (newest first)
  historyEntries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Pomodoro info
  const pomodoroInfo = "estimatedPomodoros" in task
    ? `${task.completedPomodoros} / ${task.estimatedPomodoros} pomodoros`
    : "estimatedMinutes" in task
      ? `Estimated: ${formatMinutes(task.estimatedMinutes)}`
      : null;

  const actualTime = "actualMinutes" in task && task.actualMinutes > 0
    ? `Actual: ${formatMinutes(task.actualMinutes)}`
    : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[100] bg-scrim transition-opacity duration-200 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed z-[101] top-0 bottom-0 right-0 shadow-2xl transition-transform duration-300 ease-out ${
          isMobile ? "w-full" : "w-[360px]"
        } ${isOpen ? "translate-x-0" : "translate-x-full"} bg-surface-container-low`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant shrink-0 bg-surface">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Icon name={statusInfo.icon} size={16} className={statusInfo.color} />
              <span className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                {statusInfo.label}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  className="p-2 rounded-full hover:bg-on-surface/10 text-on-surface-variant hover:text-on-surface transition-colors"
                  aria-label="Edit task"
                >
                  <Icon name="edit" size={18} />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-full hover:bg-on-surface/10 text-on-surface-variant hover:text-on-surface transition-colors"
                aria-label="Close"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {/* Title */}
            <div>
              <h2 className="text-lg font-semibold text-on-surface">
                {task.title}
              </h2>
            </div>

            {/* Description / Markdown */}
            {"description" in task && task.description && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide mb-2 text-on-surface-variant">
                  Description
                </h3>
                <div className="text-sm whitespace-pre-wrap break-words text-on-surface-variant">
                  {task.description}
                </div>
              </div>
            )}

            {"markdown" in task && task.markdown && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide mb-2 text-on-surface-variant">
                  Notes
                </h3>
                <div className="text-sm whitespace-pre-wrap break-words text-on-surface-variant">
                  {task.markdown}
                </div>
              </div>
            )}

            {/* Info Grid */}
            <div className="grid grid-cols-1 gap-3">
              {/* Project */}
              {projectName && (
                <InfoItem
                  icon="folder_open"
                  label="Project"
                  value={projectName}
                />
              )}

              {/* Pomodoros / Time */}
              {pomodoroInfo && (
                <InfoItem
                  icon="flag"
                  label="Progress"
                  value={
                    <div className="flex flex-col gap-0.5">
                      <span>{pomodoroInfo}</span>
                      {actualTime && (
                        <span className="text-xs text-on-surface-variant">
                          {actualTime}
                        </span>
                      )}
                    </div>
                  }
                />
              )}

              {/* Tags */}
              {"tags" in task && task.tags && task.tags.length > 0 && (
                <InfoItem
                  icon="hashtag"
                  label="Tags"
                  value={
                    <div className="flex flex-wrap gap-1">
                      {task.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-secondary-container text-on-secondary-container"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  }
                />
              )}

              {/* Priority (Task type only) */}
              {"priority" in task && task.priority !== undefined && (
                <InfoItem
                  icon="warning"
                  label="Priority"
                  value={
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-1.5 w-20 rounded-full ${
                          task.priority >= 80
                            ? "bg-error"
                            : task.priority >= 50
                              ? "bg-tertiary"
                              : task.priority >= 20
                                ? "bg-primary"
                                : "bg-outline"
                        }`}
                      />
                      <span className="text-xs">{task.priority}</span>
                    </div>
                  }
                />
              )}

              {/* Created At */}
              {"createdAt" in task && (
                <InfoItem
                  icon="calendar_month"
                  label="Created"
                  value={formatDate(task.createdAt)}
                />
              )}
            </div>

            {/* History */}
            {historyEntries.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5 text-on-surface-variant">
                  <Icon name="history" size={14} />
                  History
                </h3>
                <div className="space-y-1.5">
                  {historyEntries.map((entry, idx) => (
                    <HistoryEntry
                      key={idx}
                      timestamp={entry.timestamp}
                      action={entry.action}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Interrupt count (TaskStreamItem only) */}
            {"interruptCount" in task && task.interruptCount > 0 && (
              <InfoItem
                icon="warning"
                label="Interrupted"
                value={`${task.interruptCount} time${task.interruptCount > 1 ? "s" : ""}`}
              />
            )}

            {/* Category (Task type only) */}
            {"category" in task && (
              <InfoItem
                icon="circle"
                label="Category"
                value={
                  task.category === "active" ? "Active Tasks" : "Someday / Maybe"
                }
              />
            )}

            {/* Routine days (TaskStreamItem only) */}
            {"routineDays" in task && task.routineDays && task.routineDays.length > 0 && (
              <InfoItem
                icon="schedule"
                label="Repeats on"
                value={
                  <span className="capitalize">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
                      .filter((_, i) => task.routineDays?.includes(i))
                      .join(", ")}
                  </span>
                }
              />
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-outline-variant shrink-0 bg-surface">
            <span className="text-xs text-on-surface-variant">
              {task.id}
            </span>
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="px-4 py-2 rounded-full text-sm font-medium bg-primary text-on-primary hover:bg-primary-hover transition-colors"
              >
                Edit Task
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default TaskDetailDrawer;
```

**Step 2: Add missing MSIconName entries**

Edit `src/components/m3/Icon.tsx` to add missing icons:
```tsx
// Add to MSIconName type union:
| 'check_circle'
| 'circle'
| 'radio_button_checked'
```

**Step 3: Run dev server to verify**

Run: `pnpm run tauri:dev`
Expected: Drawer renders without errors

**Step 4: Commit**

```bash
git add src/components/m3/TaskDetailDrawer.tsx src/components/m3/Icon.tsx
git commit -m "feat(m3): add TaskDetailDrawer component with slide-in animation"
```

---

## Task 2: Create M3 TaskHistory component

**Files:**
- Create: `src/components/m3/TaskHistory.tsx`
- Reference: Extracted from TaskDetailDrawer history section

**Step 1: Write the TaskHistory component**

Create `src/components/m3/TaskHistory.tsx`:
```tsx
/**
 * TaskHistory — Material 3 timeline component for task history.
 *
 * Displays a chronological list of task events with timestamps.
 * Supports vertical timeline with connected dots.
 *
 * Usage:
 * ```tsx
 * <TaskHistory
 *   entries={[
 *     { timestamp: "2025-02-10T10:00:00Z", action: "Task created" },
 *     { timestamp: "2025-02-10T10:30:00Z", action: "Started working" },
 *   ]}
 * />
 * ```
 */
import { Icon } from "./Icon";

// ─── Types ────────────────────────────────────────────────────────────────────────

export interface HistoryEntry {
  timestamp: string;
  action: string;
  icon?: string; // Optional icon for the entry
}

export interface TaskHistoryProps {
  entries: HistoryEntry[];
  emptyMessage?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

// ─── Main Component ───────────────────────────────────────────────────────────────

export function TaskHistory({ entries, emptyMessage = "No history yet" }: TaskHistoryProps) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Icon name="history" size={32} className="text-outline mb-2" />
        <p className="text-sm text-on-surface-variant">{emptyMessage}</p>
      </div>
    );
  }

  // Sort entries by timestamp (newest first)
  const sortedEntries = [...entries].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <div className="space-y-0">
      {sortedEntries.map((entry, idx) => (
        <div key={idx} className="flex items-start gap-3 text-xs relative">
          {/* Timeline connector (not on last item) */}
          {idx < sortedEntries.length - 1 && (
            <div className="absolute left-[5px] top-6 bottom-0 w-px bg-outline-variant" />
          )}

          {/* Timeline dot */}
          <div className="shrink-0 mt-0.5">
            <div className="w-2.5 h-2.5 rounded-full bg-primary border-2 border-surface-container" />
          </div>

          {/* Entry content */}
          <div className="flex-1 min-w-0 pb-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-on-surface">{entry.action}</span>
              <time className="shrink-0 text-on-surface-variant font-mono tabular-nums">
                {formatRelativeTime(entry.timestamp)}
              </time>
            </div>
            <div className="mt-0.5 text-on-surface-variant text-[11px]">
              {formatDate(entry.timestamp)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default TaskHistory;
```

**Step 2: Update TaskDetailDrawer to use TaskHistory**

Edit `src/components/m3/TaskDetailDrawer.tsx`:
```tsx
// Add import at top:
import { TaskHistory, type HistoryEntry as TaskHistoryEntry } from "./TaskHistory";

// Replace the history section in the drawer with:
{historyEntries.length > 0 && (
  <div>
    <h3 className="text-xs font-semibold uppercase tracking-wide mb-3 text-on-surface-variant flex items-center gap-1.5">
      <Icon name="history" size={14} />
      History
    </h3>
    <TaskHistory entries={historyEntries} />
  </div>
)}
```

**Step 3: Run dev server to verify**

Run: `pnpm run tauri:dev`
Expected: History renders with timeline dots and connectors

**Step 4: Commit**

```bash
git add src/components/m3/TaskHistory.tsx src/components/m3/TaskDetailDrawer.tsx
git commit -m "feat(m3): add TaskHistory component with timeline"
```

---

## Task 3: Export M3 components from index

**Files:**
- Modify: `src/components/m3/index.ts`

**Step 1: Create or update index file**

Edit `src/components/m3/index.ts`:
```tsx
// Material 3 Components
export { Icon } from './Icon';
export type { MSIconName, IconProps } from './Icon';

export { TaskDetailDrawer } from './TaskDetailDrawer';
export type { TaskDetailProps } from './TaskDetailDrawer';

export { TaskHistory, HistoryEntry } from './TaskHistory';
export type { HistoryEntry as TaskHistoryEntry, TaskHistoryProps } from './TaskHistory';
```

**Step 2: Verify exports work**

Run: `pnpm run build`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/components/m3/index.ts
git commit -m "feat(m3): export TaskDetailDrawer and TaskHistory from index"
```

---

## Task 4: Add Storybook/Example for testing

**Files:**
- Create: `src/components/m3/TaskDetailDrawer.example.tsx`

**Step 1: Create example file**

Create `src/components/m3/TaskDetailDrawer.example.tsx`:
```tsx
/**
 * TaskDetailDrawer Example
 *
 * Usage examples for the M3 TaskDetailDrawer component.
 */
import { useState } from "react";
import { TaskDetailDrawer } from "./TaskDetailDrawer";
import type { Task } from "@/types/schedule";

// Mock data
const mockTask: Task = {
  id: "task-1",
  title: "Implement M3 TaskDetailDrawer",
  description: "Create a Material 3 slide-out drawer for viewing task details.",
  estimatedPomodoros: 3,
  completedPomodoros: 1,
  completed: false,
  state: "RUNNING",
  projectId: "p-m3",
  tags: ["m3", "ui", "drawer"],
  priority: 75,
  category: "active",
  createdAt: "2025-02-10T08:00:00Z",
};

const mockProjects = [
  { id: "p-m3", name: "M3 UI Redesign", deadline: "2025-03-01", tasks: [], createdAt: "2025-02-01T00:00:00Z" },
];

export function TaskDetailDrawerExample() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="p-4">
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-primary text-on-primary rounded-full"
      >
        Open Task Detail Drawer
      </button>

      <TaskDetailDrawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        task={mockTask}
        projects={mockProjects}
        onEdit={() => console.log("Edit clicked")}
      />
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add src/components/m3/TaskDetailDrawer.example.tsx
git commit -m "feat(m3): add TaskDetailDrawer example component"
```

---

## Summary

This plan creates:
1. **M3 TaskDetailDrawer** - Slide-in drawer component with Material 3 styling
2. **M3 TaskHistory** - Reusable timeline component for task history
3. Proper exports from `m3/index.ts`
4. Example component for testing

**Key M3 tokens used:**
- Colors: `surface`, `surface-container-low`, `on-surface`, `on-surface-variant`, `primary`, `scrim`
- Typography: Standard heading/body classes
- Shape: Full/rounded corners on buttons and chips
- Elevation: Shadow on drawer, scrim backdrop
