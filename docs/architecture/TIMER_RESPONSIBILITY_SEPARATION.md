# Timer Component Architecture: Responsibility Separation

> Issue: #301 - Legacy PomodoroTimerとGuidance系の責務分離

## Current State

### Component Hierarchy

```
App.tsx
├── main → MainView → ShellView
│                         ├── NavigationRail
│                         ├── GuidanceBoard (embedded)
│                         │   ├── Timer Panel
│                         │   ├── Current Focus Panel
│                         │   └── Next Tasks Panel
│                         ├── CalendarSidePanel
│                         └── TaskDetailDrawer
├── mini-timer → MiniTimerView
├── guidance_timer → GuidanceTimerWindowView
├── guidance_board → GuidanceBoardWindowView (standalone)
└── ...
```

### Components

| Component | Location | Status | Purpose |
|-----------|----------|--------|---------|
| `PomodoroTimer.tsx` | `src/components/` | ⚠️ Legacy | Standalone full-screen timer |
| `ShellView.tsx` | `src/views/` | ✅ Active | Main application shell |
| `GuidanceBoard.tsx` | `src/components/m3/` | ✅ Active | Task management panel |
| `MiniTimerView.tsx` | `src/views/` | ✅ Active | Floating mini timer |
| `GuidanceTimerWindowView.tsx` | `src/views/` | ✅ Active | Standalone timer window |

## Responsibility Matrix

### Timer Display

| Feature | PomodoroTimer | GuidancePrimaryTimerPanel | MiniTimerView |
|---------|:-------------:|:-------------------------:|:-------------:|
| H:M:S display | ✅ | ✅ | ✅ |
| Progress circle | ✅ | ✅ | ✅ |
| Date/Time display | ❌ | ✅ | ❌ |
| Milliseconds | ✅ | ❌ | ❌ |
| Schedule info | ✅ | ✅ | ❌ |

### Task Operations

| Operation | ShellView | GuidanceBoard | PomodoroTimer |
|-----------|:---------:|:-------------:|:-------------:|
| Start task | ✅ | ✅ | ❌ |
| Complete task | ✅ | ✅ | ✅ |
| Pause task | ✅ | ✅ | ✅ |
| Postpone task | ✅ | ✅ | ❌ |
| Interrupt task | ✅ | ✅ | ❌ |
| Extend task | ✅ | ✅ | ❌ |

### State Management

| Concern | Owner |
|---------|-------|
| Timer state | `useTauriTimer` hook |
| Task state | ShellView + `useTasks` |
| Navigation state | ShellView |
| Window state | Tauri (window.label) |

## Overlapping Code

### 1. Timer Hook Usage
Both `PomodoroTimer` and `ShellView` use `useTauriTimer` directly.
**Recommendation**: Consolidate into a shared context or keep hook-based but document clearly.

### 2. Task Operation Handlers
Similar operation handlers exist in:
- `ShellView.tsx` - comprehensive handlers
- `GuidanceBoard.tsx` - delegates to parent

**Recommendation**: GuidanceBoard should remain stateless, receiving handlers as props.

### 3. Notification Logic
Both components handle notifications independently.

**Recommendation**: Centralize in a `useNotifications` hook.

## Recommended Architecture

### Principle: Single Source of Truth

```
┌─────────────────────────────────────────────────────────┐
│                      ShellView                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │                 State Layer                      │   │
│  │  - useTauriTimer()                               │   │
│  │  - useTasks()                                    │   │
│  │  - useNavigation()                               │   │
│  └─────────────────────────────────────────────────┘   │
│                        │                               │
│                        ▼                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Handler Layer                       │   │
│  │  - handleTaskStart()                             │   │
│  │  - handleTaskComplete()                          │   │
│  │  - handleTaskPostpone()                          │   │
│  └─────────────────────────────────────────────────┘   │
│                        │                               │
│         ┌──────────────┼──────────────┐               │
│         ▼              ▼              ▼               │
│  ┌───────────┐  ┌───────────┐  ┌───────────────┐    │
│  │ NavRail   │  │ Guidance  │  │ CalendarPanel │    │
│  └───────────┘  │ Board     │  └───────────────┘    │
│                 └───────────┘                        │
└─────────────────────────────────────────────────────────┘
```

### Component Responsibilities

#### ShellView (Controller)
- **Owns**: All state and business logic
- **Provides**: Props and handlers to children
- **Does NOT**: Render timer UI directly

#### GuidanceBoard (View)
- **Receives**: Timer state, tasks, handlers as props
- **Renders**: Timer panel, focus panel, next tasks
- **Does NOT**: Manage state or call backend directly

#### PomodoroTimer (Legacy)
- **Status**: Deprecated
- **Action**: Remove after verifying no usage in routing

## Cleanup Roadmap

### Phase 1: Documentation (Current)
- [x] Document current state
- [x] Identify overlapping responsibilities
- [ ] Define target architecture

### Phase 2: Deprecation Markers
- [ ] Add `@deprecated` JSDoc to PomodoroTimer
- [ ] Add console warning when PomodoroTimer is used
- [ ] Update imports to point to GuidanceBoard

### Phase 3: Consolidation
- [ ] Extract shared timer utilities
- [ ] Create unified `useTimerOperations` hook
- [ ] Remove PomodoroTimer.tsx

### Phase 4: Verification
- [ ] Verify all window types work correctly
- [ ] Run full test suite
- [ ] Manual testing of task operations

## Decision Log

### 2026-02-15
- Documented current component responsibilities
- Identified PomodoroTimer as legacy/deprecated
- Established ShellView as the single source of truth
- GuidanceBoard to remain stateless (props-based)

## References

- [UI Redesign Strategy](./ui-redesign-strategy.md)
- [CLAUDE.md - UI Redesign Section](../CLAUDE.md)
