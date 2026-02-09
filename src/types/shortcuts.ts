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
