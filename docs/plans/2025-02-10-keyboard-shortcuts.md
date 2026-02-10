# Keyboard Shortcuts System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a comprehensive keyboard shortcuts system for Pomodoroom with global shortcuts manager, command palette (Cmd/Ctrl+K), customizable bindings in SettingsView, and help modal documentation.

**Architecture:**
- `useKeyboardShortcuts` hook manages keyboard event listeners and shortcut registry
- Shortcuts stored in localStorage as user-configurable keybindings
- Command palette as modal dialog with fuzzy search
- Help modal displays all shortcuts in organized format

**Tech Stack:**
- React 19 hooks (useEffect, useCallback, useRef, useState)
- TypeScript 5
- localStorage via existing `useLocalStorage`
- Lucide React icons
- Tailwind CSS v4

---

## Task 1: Create shortcut types and constants

**Files:**
- Create: `src/types/shortcuts.ts`
- Modify: `src/types/index.ts` (add re-export)

**Step 1: Create shortcut type definitions**

Create `src/types/shortcuts.ts`:

```typescript
// Key binding definition
export interface ShortcutBinding {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean; // Cmd on Mac, Win on Linux
}

// Unique identifier for each command
export type ShortcutCommand =
  | "toggleTimer"
  | "skipSession"
  | "reset"
  | "newTask"
  | "commandPalette"
  | "openSettings"
  | "closePanel"
  | "openYouTube"
  | "openStats"
  | "openNotes"
  | "toggleFloatMode";

// Command metadata with display info
export interface ShortcutCommandDef {
  id: ShortcutCommand;
  defaultBinding: ShortcutBinding;
  description: string;
  category: "timer" | "navigation" | "window" | "tasks";
}

// User-customizable keybinding map
export type ShortcutBindings = Record<ShortcutCommand, ShortcutBinding>;

// Command for palette/search
export interface Command {
  id: ShortcutCommand;
  label: string;
  description: string;
  category: string;
  icon?: string;
  action: () => void | Promise<void>;
}
```

**Step 2: Add re-export to types/index.ts**

Add to `src/types/index.ts` at end:

```typescript
// Re-export shortcut types
export type {
  ShortcutBinding,
  ShortcutCommand,
  ShortcutCommandDef,
  ShortcutBindings,
  Command,
} from "./shortcuts";
```

**Step 3: Commit**

```bash
git add src/types/shortcuts.ts src/types/index.ts
git commit -m "feat: add shortcut type definitions"
```

---

## Task 2: Create default shortcuts constant

**Files:**
- Create: `src/constants/shortcuts.ts`

**Step 1: Define default shortcuts**

Create `src/constants/shortcuts.ts`:

```typescript
import type { ShortcutCommandDef, ShortcutBindings } from "@/types";

// Default shortcut definitions
export const DEFAULT_SHORTCUTS: ShortcutCommandDef[] = [
  {
    id: "toggleTimer",
    defaultBinding: { key: " " },
    description: "Start / Pause Timer",
    category: "timer",
  },
  {
    id: "skipSession",
    defaultBinding: { key: "s" },
    description: "Skip Session",
    category: "timer",
  },
  {
    id: "reset",
    defaultBinding: { key: "r" },
    description: "Reset Timer",
    category: "timer",
  },
  {
    id: "newTask",
    defaultBinding: { key: "n" },
    description: "Create New Task",
    category: "tasks",
  },
  {
    id: "commandPalette",
    defaultBinding: { key: "k", meta: true },
    description: "Command Palette",
    category: "navigation",
  },
  {
    id: "openSettings",
    defaultBinding: { key: ",", meta: true },
    description: "Open Settings",
    category: "navigation",
  },
  {
    id: "closePanel",
    defaultBinding: { key: "Escape" },
    description: "Close Panels / Dialogs",
    category: "window",
  },
  {
    id: "openYouTube",
    defaultBinding: { key: "y", meta: true },
    description: "Open YouTube Player",
    category: "navigation",
  },
  {
    id: "openStats",
    defaultBinding: { key: "i", meta: true },
    description: "Open Statistics",
    category: "navigation",
  },
  {
    id: "openNotes",
    defaultBinding: { key: "n", meta: true, shift: true },
    description: "Open Notes",
    category: "navigation",
  },
  {
    id: "toggleFloatMode",
    defaultBinding: { key: "f", meta: true },
    description: "Toggle Float Mode",
    category: "window",
  },
];

// Create default bindings map from definitions
export const DEFAULT_SHORTCUT_BINDINGS: ShortcutBindings =
  DEFAULT_SHORTCUTS.reduce((acc, def) => {
    acc[def.id] = def.defaultBinding;
    return acc;
  }, {} as ShortcutBindings);

// Format binding for display (e.g., "Cmd+K", "Space")
export function formatShortcut(binding: ShortcutBinding): string {
  const parts: string[] = [];
  const platform = navigator.platform.toLowerCase();

  if (binding.meta) {
    // Use Cmd on Mac, Ctrl on Windows/Linux
    parts.push(platform.includes("mac") ? "Cmd" : "Ctrl");
  }
  if (binding.ctrl) parts.push("Ctrl");
  if (binding.alt) parts.push("Alt");
  if (binding.shift) parts.push("Shift");

  // Handle special keys
  const keyMap: Record<string, string> = {
    " ": "Space",
    "Escape": "Esc",
    "ArrowUp": "Up",
    "ArrowDown": "Down",
    "ArrowLeft": "Left",
    "ArrowRight": "Right",
  };

  const keyDisplay = keyMap[binding.key] || binding.key;
  parts.push(keyDisplay);

  return parts.join("+");
}

// Check if event matches binding
export function matchesBinding(
  event: KeyboardEvent,
  binding: ShortcutBinding
): boolean {
  const platform = navigator.platform.toLowerCase();

  // For Mac, meta is Cmd; for Windows/Linux, we treat it as Win key
  // But for compatibility, when binding.meta is true, we accept either:
  // - Mac: event.metaKey (Cmd)
  // - Windows/Linux: event.ctrlKey (common convention for "Cmd+K" style shortcuts)
  const metaMatches = binding.meta
    ? platform.includes("mac")
      ? event.metaKey
      : event.ctrlKey
    : !event.metaKey;

  return (
    event.key === binding.key &&
    metaMatches &&
    (binding.ctrl ?? false) === event.ctrlKey &&
    (binding.alt ?? false) === event.altKey &&
    (binding.shift ?? false) === event.shiftKey
  );
}
```

**Step 2: Commit**

```bash
git add src/constants/shortcuts.ts
git commit -m "feat: add default shortcuts definitions and utilities"
```

---

## Task 3: Create useKeyboardShortcuts hook

**Files:**
- Create: `src/hooks/useKeyboardShortcuts.ts`

**Step 1: Write the hook**

Create `src/hooks/useKeyboardShortcuts.ts`:

```typescript
import { useCallback, useEffect, useRef } from "react";
import { useLocalStorage } from "./useLocalStorage";
import type { ShortcutBindings, ShortcutCommand, ShortcutBinding } from "@/types";
import { DEFAULT_SHORTCUT_BINDINGS, matchesBinding } from "@/constants/shortcuts";

interface UseKeyboardShortcutsOptions {
  // Disable shortcuts when input is focused
  ignoreInputs?: boolean;
}

interface ShortcutRegistration {
  command: ShortcutCommand;
  handler: (e: KeyboardEvent) => void;
  description?: string;
}

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions = {}) {
  const { ignoreInputs = true } = options;

  // User-customizable bindings
  const [bindings, setBindings] = useLocalStorage<ShortcutBindings>(
    "pomodoroom-shortcuts",
    DEFAULT_SHORTCUT_BINDINGS
  );

  // Registered command handlers
  const handlersRef = useRef<Map<ShortcutCommand, (e: KeyboardEvent) => void>>(
    new Map()
  );

  // Register a command handler
  const registerShortcut = useCallback(
    (registration: ShortcutRegistration) => {
      handlersRef.current.set(registration.command, registration.handler);
    },
    []
  );

  // Unregister a command handler
  const unregisterShortcut = useCallback((command: ShortcutCommand) => {
    handlersRef.current.delete(command);
  }, []);

  // Update a keybinding
  const updateBinding = useCallback((command: ShortcutCommand, binding: ShortcutBinding) => {
    setBindings((prev) => ({
      ...prev,
      [command]: binding,
    }));
  }, [setBindings]);

  // Reset to defaults
  const resetBindings = useCallback(() => {
    setBindings(DEFAULT_SHORTCUT_BINDINGS);
  }, [setBindings]);

  // Global keyboard event listener
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if typing in input/textarea
      if (
        ignoreInputs &&
        (event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement ||
          event.target instanceof HTMLSelectElement ||
          (event.target as HTMLElement).isContentEditable)
      ) {
        return;
      }

      // Check each binding
      for (const [command, binding] of Object.entries(bindings)) {
        if (matchesBinding(event, binding)) {
          const handler = handlersRef.current.get(command as ShortcutCommand);
          if (handler) {
            event.preventDefault();
            handler(event);
            return;
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [bindings, ignoreInputs]);

  return {
    bindings,
    registerShortcut,
    unregisterShortcut,
    updateBinding,
    resetBindings,
  };
}
```

**Step 2: Commit**

```bash
git add src/hooks/useKeyboardShortcuts.ts
git commit -m "feat: add useKeyboardShortcuts hook"
```

---

## Task 4: Create Command Palette component

**Files:**
- Create: `src/components/CommandPalette.tsx`

**Step 1: Create Command Palette component**

Create `src/components/CommandPalette.tsx`:

```typescript
import { useCallback, useEffect, useState } from "react";
import { X, Search } from "lucide-react";
import type { Command } from "@/types";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
  theme?: "light" | "dark";
}

export function CommandPalette({
  isOpen,
  onClose,
  commands,
  theme = "dark",
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter commands by query
  const filteredCommands = commands.filter((cmd) => {
    const q = query.toLowerCase();
    return (
      cmd.label.toLowerCase().includes(q) ||
      cmd.description.toLowerCase().includes(q) ||
      cmd.category.toLowerCase().includes(q)
    );
  });

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) =>
          i < filteredCommands.length - 1 ? i + 1 : i
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i > 0 ? i - 1 : 0));
      } else if (e.key === "Enter" && filteredCommands[selectedIndex]) {
        e.preventDefault();
        filteredCommands[selectedIndex].action();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, filteredCommands, selectedIndex]);

  // Clear query on open
  useEffect(() => {
    if (isOpen) setQuery("");
  }, [isOpen]);

  const handleSelect = useCallback((command: Command) => {
    command.action();
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-xl rounded-xl shadow-2xl ${
          theme === "dark"
            ? "bg-gray-800 text-white"
            : "bg-white text-gray-900"
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center gap-3 px-4 py-3 border-b ${
            theme === "dark" ? "border-gray-700" : "border-gray-200"
          }`}
        >
          <Search size={18} className="opacity-50" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent outline-none text-sm"
            autoFocus
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10"
          >
            <X size={18} className="opacity-50" />
          </button>
        </div>

        {/* Command list */}
        <div className="max-h-80 overflow-y-auto py-2">
          {filteredCommands.length === 0 ? (
            <div
              className={`px-4 py-8 text-center text-sm ${
                theme === "dark" ? "text-gray-500" : "text-gray-400"
              }`}
            >
              No commands found
            </div>
          ) : (
            <>
              {/* Group by category */}
              {Array.from(
                new Set(filteredCommands.map((c) => c.category))
              ).map((category) => (
                <div key={category}>
                  <div
                    className={`px-4 py-1 text-xs font-semibold uppercase tracking-wider ${
                      theme === "dark" ? "text-gray-500" : "text-gray-400"
                    }`}
                  >
                    {category}
                  </div>
                  {filteredCommands
                    .filter((c) => c.category === category)
                    .map((command, idx) => {
                      const globalIndex = filteredCommands.indexOf(command);
                      const isSelected = globalIndex === selectedIndex;
                      return (
                        <button
                          key={command.id}
                          type="button"
                          onClick={() => handleSelect(command)}
                          className={`w-full px-4 py-2 flex items-center gap-3 text-left text-sm transition-colors ${
                            isSelected
                              ? theme === "dark"
                                ? "bg-blue-500/20 text-blue-400"
                                : "bg-blue-50 text-blue-600"
                              : theme === "dark"
                                ? "hover:bg-white/5"
                                : "hover:bg-black/5"
                          }`}
                        >
                          {command.icon && (
                            <span className="opacity-70">{command.icon}</span>
                          )}
                          <div className="flex-1">
                            <div className="font-medium">{command.label}</div>
                            <div
                              className={`text-xs ${
                                theme === "dark"
                                  ? "text-gray-500"
                                  : "text-gray-400"
                              }`}
                            >
                              {command.description}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer hint */}
        <div
          className={`px-4 py-2 border-t text-xs ${
            theme === "dark"
              ? "border-gray-700 text-gray-500"
              : "border-gray-200 text-gray-400"
          }`}
        >
          Use arrow keys to navigate, Enter to select
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/CommandPalette.tsx
git commit -m "feat: add CommandPalette component"
```

---

## Task 5: Create Shortcuts Help modal

**Files:**
- Create: `src/components/ShortcutsHelp.tsx`

**Step 1: Create Shortcuts Help modal**

Create `src/components/ShortcutsHelp.tsx`:

```typescript
import { X, Keyboard } from "lucide-react";
import { DEFAULT_SHORTCUTS, formatShortcut } from "@/constants/shortcuts";

interface ShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: "light" | "dark";
}

export function ShortcutsHelp({
  isOpen,
  onClose,
  theme = "dark",
}: ShortcutsHelpProps) {
  if (!isOpen) return null;

  // Group shortcuts by category
  const byCategory = DEFAULT_SHORTCUTS.reduce((acc, shortcut) => {
    if (!acc[shortcut.category]) {
      acc[shortcut.category] = [];
    }
    acc[shortcut.category].push(shortcut);
    return acc;
  }, {} as Record<string, typeof DEFAULT_SHORTCUTS>);

  const categoryLabels: Record<string, string> = {
    timer: "Timer Controls",
    navigation: "Navigation",
    window: "Window Management",
    tasks: "Tasks",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-lg rounded-xl shadow-2xl ${
          theme === "dark"
            ? "bg-gray-800 text-white"
            : "bg-white text-gray-900"
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-5 py-4 border-b ${
            theme === "dark" ? "border-gray-700" : "border-gray-200"
          }`}
        >
          <div className="flex items-center gap-2">
            <Keyboard size={20} />
            <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 max-h-[60vh] overflow-y-auto">
          {Object.entries(byCategory).map(([category, shortcuts]) => (
            <div key={category} className="mb-6 last:mb-0">
              <h3
                className={`text-xs font-bold uppercase tracking-wider mb-3 ${
                  theme === "dark" ? "text-gray-500" : "text-gray-400"
                }`}
              >
                {categoryLabels[category] || category}
              </h3>
              <div className="space-y-2">
                {shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span
                      className={
                        theme === "dark" ? "text-gray-300" : "text-gray-700"
                      }
                    >
                      {shortcut.description}
                    </span>
                    <kbd
                      className={`px-2 py-1 rounded text-xs font-mono ${
                        theme === "dark"
                          ? "bg-gray-700 text-gray-300"
                          : "bg-gray-100 text-gray-700 border border-gray-200"
                      }`}
                    >
                      {formatShortcut(shortcut.defaultBinding)}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div
          className={`px-5 py-3 border-t text-xs ${
            theme === "dark"
              ? "border-gray-700 text-gray-500"
              : "border-gray-200 text-gray-400"
          }`}
        >
          Tip: Customize these shortcuts in Settings
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/ShortcutsHelp.tsx
git commit -m "feat: add ShortcutsHelp modal"
```

---

## Task 6: Create Shortcut Editor component for Settings

**Files:**
- Create: `src/components/ShortcutEditor.tsx`

**Step 1: Create Shortcut Editor component**

Create `src/components/ShortcutEditor.tsx`:

```typescript
import { useCallback, useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import type { ShortcutBinding, ShortcutCommand } from "@/types";
import { formatShortcut } from "@/constants/shortcuts";

interface ShortcutEditorProps {
  command: ShortcutCommand;
  label: string;
  binding: ShortcutBinding;
  onUpdate: (binding: ShortcutBinding) => void;
  theme?: "light" | "dark";
}

export function ShortcutEditor({
  command,
  label,
  binding,
  onUpdate,
  theme = "dark",
}: ShortcutEditorProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedKeys, setRecordedKeys] = useState<ShortcutBinding | null>(null);

  const startRecording = useCallback(() => {
    setIsRecording(true);
    setRecordedKeys(null);
  }, []);

  const cancelRecording = useCallback(() => {
    setIsRecording(false);
    setRecordedKeys(null);
  }, []);

  const confirmRecording = useCallback(() => {
    if (recordedKeys) {
      onUpdate(recordedKeys);
    }
    setIsRecording(false);
    setRecordedKeys(null);
  }, [recordedKeys, onUpdate]);

  // Handle key recording
  useEffect(() => {
    if (!isRecording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Escape cancels
      if (e.key === "Escape") {
        cancelRecording();
        return;
      }

      // Build binding from event
      const newBinding: ShortcutBinding = {
        key: e.key,
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        meta: e.metaKey,
      };

      setRecordedKeys(newBinding);
    };

    const handleKeyUp = () => {
      // Auto-confirm on key up if we have a binding
      if (recordedKeys) {
        // Delay slightly to allow the keydown to register
        setTimeout(() => {
          // confirmRecording will be called by the button click or Enter
        }, 100);
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("keyup", handleKeyUp, { capture: true });
    };
  }, [isRecording, recordedKeys, cancelRecording]);

  return (
    <div className="flex items-center justify-between text-sm">
      <span className={theme === "dark" ? "text-gray-300" : "text-gray-700"}>
        {label}
      </span>

      {isRecording ? (
        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1.5 rounded-lg text-xs font-mono ${
              theme === "dark"
                ? "bg-blue-500/20 text-blue-400 animate-pulse"
                : "bg-blue-50 text-blue-600 animate-pulse"
            }`}
          >
            Press keys...
          </span>
          {recordedKeys && (
            <>
              <button
                type="button"
                onClick={confirmRecording}
                className="p-1 rounded hover:bg-green-500/20 text-green-400"
                title="Confirm"
              >
                <Check size={16} />
              </button>
              <button
                type="button"
                onClick={cancelRecording}
                className="p-1 rounded hover:bg-red-500/20 text-red-400"
                title="Cancel"
              >
                <X size={16} />
              </button>
            </>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={startRecording}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
            theme === "dark"
              ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
              : "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200"
          }`}
        >
          {formatShortcut(binding)}
        </button>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/ShortcutEditor.tsx
git commit -m "feat: add ShortcutEditor component for settings"
```

---

## Task 7: Update SettingsView with shortcuts customization

**Files:**
- Modify: `src/views/SettingsView.tsx`

**Step 1: Add keyboard shortcuts section**

Update `src/views/SettingsView.tsx`:

1. Add imports after line 25:
```typescript
import { ShortcutEditor } from "@/components/ShortcutEditor";
import { ShortcutsHelp } from "@/components/ShortcutsHelp";
import { DEFAULT_SHORTCUTS } from "@/constants/shortcuts";
import type { ShortcutCommand } from "@/types";
```

2. Add state after `customBackground` definition (around line 54):
```typescript
const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
```

3. Replace the existing "Keyboard Shortcuts" section (lines 454-493) with:
```typescript
{/* ─── Keyboard Shortcuts ────────────────────── */}
<section>
  <div className="flex items-center justify-between mb-4">
    <h3
      className={`text-xs font-bold uppercase tracking-widest ${
        theme === "dark" ? "text-gray-500" : "text-gray-400"
      }`}
    >
      Keyboard Shortcuts
    </h3>
    <button
      type="button"
      onClick={() => setShowShortcutsHelp(true)}
      className={`text-xs px-2 py-1 rounded transition-colors ${
        theme === "dark"
          ? "bg-white/5 hover:bg-white/10 text-gray-400"
          : "bg-black/5 hover:bg-black/10 text-gray-600"
      }`}
    >
      View All
    </button>
  </div>

  <div className="space-y-3">
    {DEFAULT_SHORTCUTS.map((shortcut) => (
      <ShortcutEditor
        key={shortcut.id}
        command={shortcut.id}
        label={shortcut.description}
        binding={bindings[shortcut.id]}
        onUpdate={(binding) => updateBinding(shortcut.id, binding)}
        theme={theme}
      />
    ))}
  </div>

  <button
    type="button"
    onClick={resetBindings}
    className={`w-full mt-3 py-2 rounded-lg text-xs font-medium transition-colors ${
      theme === "dark"
        ? "bg-white/5 hover:bg-white/10 text-gray-400"
        : "bg-black/5 hover:bg-black/10 text-gray-600"
    }`}
  >
    Reset to Defaults
  </button>
</section>

{/* Help Modal */}
<ShortcutsHelp
  isOpen={showShortcutsHelp}
  onClose={() => setShowShortcutsHelp(false)}
  theme={theme}
/>
```

4. Update component signature to use shortcuts hook - add after line 37:
```typescript
const { bindings, updateBinding, resetBindings } = useKeyboardShortcuts();
```

5. Add import at top (around line 18):
```typescript
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
```

**Step 2: Commit**

```bash
git add src/views/SettingsView.tsx
git commit -m "feat: add shortcuts customization to SettingsView"
```

---

## Task 8: Create Keyboard Shortcuts Provider for app-wide usage

**Files:**
- Create: `src/components/KeyboardShortcutsProvider.tsx`

**Step 1: Create provider component**

Create `src/components/KeyboardShortcutsProvider.tsx`:

```typescript
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { CommandPalette } from "@/components/CommandPalette";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ShortcutCommand, Command } from "@/types";
import type { TimerState, SessionType } from "@/types";

interface KeyboardShortcutsContextValue {
  toggleTimer: () => void;
  skipSession: () => void;
  resetTimer: () => void;
}

const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextValue | null>(null);

export function useKeyboardShortcutsActions() {
  const context = useContext(KeyboardShortcutsContext);
  if (!context) {
    throw new Error("useKeyboardShortcutsActions must be used within KeyboardShortcutsProvider");
  }
  return context;
}

interface KeyboardShortcutsProviderProps {
  children: React.ReactNode;
  theme?: "light" | "dark";
  timerState?: TimerState;
  sessionType?: SessionType;
}

export function KeyboardShortcutsProvider({
  children,
  theme = "dark",
  timerState = "idle",
  sessionType = "work",
}: KeyboardShortcutsProviderProps) {
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  // Timer actions
  const toggleTimer = useCallback(async () => {
    try {
      if (timerState === "running") {
        await invoke("cmd_timer_pause");
      } else {
        await invoke("cmd_timer_start");
      }
    } catch (error) {
      console.error("Failed to toggle timer:", error);
    }
  }, [timerState]);

  const skipSession = useCallback(async () => {
    try {
      await invoke("cmd_timer_skip");
    } catch (error) {
      console.error("Failed to skip session:", error);
    }
  }, []);

  const resetTimer = useCallback(async () => {
    try {
      await invoke("cmd_timer_reset");
    } catch (error) {
      console.error("Failed to reset timer:", error);
    }
  }, []);

  // Window actions
  const openSettings = useCallback(async () => {
    try {
      await invoke("cmd_open_window", {
        label: "settings",
        title: "Settings",
        width: 600,
        height: 700,
      });
    } catch (error) {
      console.error("Failed to open settings:", error);
    }
  }, []);

  const openYouTube = useCallback(async () => {
    try {
      await invoke("cmd_open_window", {
        label: "youtube",
        title: "YouTube",
        width: 500,
        height: 400,
      });
    } catch (error) {
      console.error("Failed to open YouTube:", error);
    }
  }, []);

  const openStats = useCallback(async () => {
    try {
      await invoke("cmd_open_window", {
        label: "stats",
        title: "Statistics",
        width: 700,
        height: 500,
      });
    } catch (error) {
      console.error("Failed to open stats:", error);
    }
  }, []);

  const openNotes = useCallback(async () => {
    try {
      await invoke("cmd_open_window", {
        label: `note-${Date.now()}`,
        title: "Notes",
        width: 400,
        height: 500,
      });
    } catch (error) {
      console.error("Failed to open notes:", error);
    }
  }, []);

  const closePanel = useCallback(async () => {
    try {
      const currentWindow = getCurrentWindow();
      await currentWindow.close();
    } catch (error) {
      console.error("Failed to close panel:", error);
    }
  }, []);

  const toggleFloatMode = useCallback(async () => {
    try {
      await invoke("cmd_toggle_float_mode");
    } catch (error) {
      console.error("Failed to toggle float mode:", error);
    }
  }, []);

  // New task action (placeholder - will be implemented with task system)
  const newTask = useCallback(() => {
    // TODO: Implement when task system is ready
    console.log("New task shortcut triggered");
  }, []);

  // Register shortcuts
  const { registerShortcut } = useKeyboardShortcuts();

  useEffect(() => {
    // Timer shortcuts
    registerShortcut({
      command: "toggleTimer",
      handler: toggleTimer,
    });
    registerShortcut({
      command: "skipSession",
      handler: skipSession,
    });
    registerShortcut({
      command: "reset",
      handler: resetTimer,
    });
    registerShortcut({
      command: "newTask",
      handler: newTask,
    });

    // Navigation shortcuts
    registerShortcut({
      command: "commandPalette",
      handler: () => setShowCommandPalette(true),
    });
    registerShortcut({
      command: "openSettings",
      handler: openSettings,
    });
    registerShortcut({
      command: "openYouTube",
      handler: openYouTube,
    });
    registerShortcut({
      command: "openStats",
      handler: openStats,
    });
    registerShortcut({
      command: "openNotes",
      handler: openNotes,
    });

    // Window shortcuts
    registerShortcut({
      command: "closePanel",
      handler: closePanel,
    });
    registerShortcut({
      command: "toggleFloatMode",
      handler: toggleFloatMode,
    });
  }, [
    registerShortcut,
    toggleTimer,
    skipSession,
    resetTimer,
    newTask,
    openSettings,
    openYouTube,
    openStats,
    openNotes,
    closePanel,
    toggleFloatMode,
  ]);

  // Build command palette commands
  const commands: Command[] = [
    {
      id: "toggleTimer",
      label: timerState === "running" ? "Pause Timer" : "Start Timer",
      description: "Start or pause the current Pomodoro session",
      category: "Timer",
      action: toggleTimer,
    },
    {
      id: "skipSession",
      label: "Skip Session",
      description: "Skip to the next session",
      category: "Timer",
      action: skipSession,
    },
    {
      id: "reset",
      label: "Reset Timer",
      description: "Reset the current timer",
      category: "Timer",
      action: resetTimer,
    },
    {
      id: "openSettings",
      label: "Open Settings",
      description: "Open the settings window",
      category: "Navigation",
      action: openSettings,
    },
    {
      id: "openYouTube",
      label: "Open YouTube",
      description: "Open the YouTube music player",
      category: "Navigation",
      action: openYouTube,
    },
    {
      id: "openStats",
      label: "Open Statistics",
      description: "View your Pomodoro statistics",
      category: "Navigation",
      action: openStats,
    },
    {
      id: "openNotes",
      label: "Open Notes",
      description: "Open a new notes window",
      category: "Navigation",
      action: openNotes,
    },
    {
      id: "toggleFloatMode",
      label: "Toggle Float Mode",
      description: "Toggle always-on-top float mode",
      category: "Window",
      action: toggleFloatMode,
    },
  ];

  const contextValue: KeyboardShortcutsContextValue = {
    toggleTimer,
    skipSession,
    resetTimer,
  };

  return (
    <KeyboardShortcutsContext.Provider value={contextValue}>
      {children}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        commands={commands}
        theme={theme}
      />
    </KeyboardShortcutsContext.Provider>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/KeyboardShortcutsProvider.tsx
git commit -m "feat: add KeyboardShortcutsProvider for app-wide shortcuts"
```

---

## Task 9: Integrate provider into main App

**Files:**
- Modify: `src/App.tsx`

**Step 1: Wrap app with provider**

Update `src/App.tsx`:

1. Add import after line 15:
```typescript
import { KeyboardShortcutsProvider } from "@/components/KeyboardShortcutsProvider";
```

2. Wrap the ThemeProvider content (around line 166):
```typescript
return (
  <AppErrorBoundary>
    <KeyboardShortcutsProvider theme={settings?.theme}>
      <ThemeProvider>
        <div className="relative w-full h-screen overflow-hidden">
          <MainView />
        </div>
      </ThemeProvider>
    </KeyboardShortcutsProvider>
  </AppErrorBoundary>
);
```

Note: We need to get the settings to pass theme. For now, we can pass a default or read from localStorage directly. Let's simplify:

```typescript
// At the top of App function, after state declarations:
const [theme, setTheme] = useState<"light" | "dark">("dark");

useEffect(() => {
  const stored = localStorage.getItem("pomodoroom-settings");
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      setTheme(parsed.theme || "dark");
    } catch {
      // ignore
    }
  }
}, []);
```

Then use `<KeyboardShortcutsProvider theme={theme}>`

**Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "feat: integrate KeyboardShortcutsProvider into App"
```

---

## Task 10: Update other views to use shortcuts

**Files:**
- Modify: `src/views/MiniTimerView.tsx`
- Modify: `src/views/YouTubeView.tsx`
- Modify: `src/views/StatsView.tsx`
- Modify: `src/views/NoteView.tsx`

**Step 1: Add shortcuts provider to each view**

Each view should wrap its content with the shortcuts provider. For example in `MiniTimerView.tsx`:

```typescript
// Add import
import { KeyboardShortcutsProvider } from "@/components/KeyboardShortcutsProvider";

// Wrap the return content with provider
return (
  <KeyboardShortcutsProvider theme={theme}>
    {/* existing content */}
  </KeyboardShortcutsProvider>
);
```

Repeat for other views similarly.

**Step 2: Commit**

```bash
git add src/views/MiniTimerView.tsx src/views/YouTubeView.tsx src/views/StatsView.tsx src/views/NoteView.tsx
git commit -m "feat: add keyboard shortcuts to all views"
```

---

## Task 11: Remove old keyboard handlers from SettingsView

**Files:**
- Modify: `src/views/SettingsView.tsx`

**Step 1: Remove duplicate Escape handler**

Remove the old keyboard handler (lines 98-117) since it's now handled by the shortcuts system.

**Step 2: Commit**

```bash
git add src/views/SettingsView.tsx
git commit -m "refactor: remove old keyboard handler, use shortcuts system"
```

---

## Task 12: Update types to include shortcuts in settings (optional)

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/constants/defaults.ts`

**Step 1: Add shortcuts to settings type**

Add to `PomodoroSettings` interface (after line 16):
```typescript
keyboardShortcuts?: ShortcutBindings;
```

**Step 2: Add to defaults**

Add to `DEFAULT_SETTINGS` (after line 22):
```typescript
keyboardShortcuts: DEFAULT_SHORTCUT_BINDINGS,
```

**Step 3: Commit**

```bash
git add src/types/index.ts src/constants/defaults.ts
git commit -m "feat: add keyboard shortcuts to settings"
```

---

## Testing

After implementation, test the following:

1. **Basic shortcuts work:**
   - Space starts/pauses timer
   - S skips session
   - R resets timer
   - Escape closes panels

2. **Command palette:**
   - Cmd/Ctrl+K opens palette
   - Arrow keys navigate
   - Enter selects command
   - Escape closes
   - Search filtering works

3. **Settings customization:**
   - Click shortcut to edit
   - Press new key combination
   - Confirm/cancel works
   - Reset to defaults works

4. **Help modal:**
   - View All button opens help
   - All shortcuts displayed
   - Grouped by category

5. **Multiple windows:**
   - Shortcuts work in all windows
   - Command palette context-aware
   - No conflicts between windows
