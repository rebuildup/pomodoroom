import type { ShortcutCommandDef, ShortcutBindings, ShortcutBinding } from "@/types";

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
export const DEFAULT_SHORTCUT_BINDINGS: ShortcutBindings = DEFAULT_SHORTCUTS.reduce((acc, def) => {
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
		Escape: "Esc",
		ArrowUp: "Up",
		ArrowDown: "Down",
		ArrowLeft: "Left",
		ArrowRight: "Right",
	};

	const keyDisplay = keyMap[binding.key] || binding.key;
	parts.push(keyDisplay);

	return parts.join("+");
}

// Check if event matches binding
export function matchesBinding(event: KeyboardEvent, binding: ShortcutBinding): boolean {
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
