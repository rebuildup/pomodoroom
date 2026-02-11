import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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

	// User-customizable bindings from backend
	const [bindings, setBindingsState] = useState<ShortcutBindings>(DEFAULT_SHORTCUT_BINDINGS);
	const [isLoading, setIsLoading] = useState(true);

	// Load bindings from backend on mount
	useEffect(() => {
		const loadBindings = async () => {
			try {
				const result = await invoke<ShortcutBindings>("cmd_shortcuts_get");
				setBindingsState(result.length > 0 ? result : DEFAULT_SHORTCUT_BINDINGS);
			} catch (error) {
				console.error("[useKeyboardShortcuts] Failed to load bindings:", error);
				// Fallback to localStorage
				const stored = localStorage.getItem("pomodoroom-shortcuts");
				if (stored) {
					try {
						setBindingsState(JSON.parse(stored));
					} catch {
						setBindingsState(DEFAULT_SHORTCUT_BINDINGS);
					}
				}
			} finally {
				setIsLoading(false);
			}
		};
		loadBindings();
	}, []);

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
	const updateBinding = useCallback(async (command: ShortcutCommand, binding: ShortcutBinding) => {
		const newBindings = { ...bindings, [command]: binding };
		setBindingsState(newBindings);

		try {
			await invoke("cmd_shortcuts_set", { bindingsJson: newBindings });
			// Update localStorage as backup
			localStorage.setItem("pomodoroom-shortcuts", JSON.stringify(newBindings));
		} catch (error) {
			console.error("[useKeyboardShortcuts] Failed to save bindings:", error);
			// Still update localStorage as fallback
			localStorage.setItem("pomodoroom-shortcuts", JSON.stringify(newBindings));
		}
	}, [bindings]);

	// Reset to defaults
	const resetBindings = useCallback(async () => {
		setBindingsState(DEFAULT_SHORTCUT_BINDINGS);
		try {
			await invoke("cmd_shortcuts_set", { bindingsJson: DEFAULT_SHORTCUT_BINDINGS });
			localStorage.setItem("pomodoroom-shortcuts", JSON.stringify(DEFAULT_SHORTCUT_BINDINGS));
		} catch (error) {
			console.error("[useKeyboardShortcuts] Failed to reset bindings:", error);
			localStorage.setItem("pomodoroom-shortcuts", JSON.stringify(DEFAULT_SHORTCUT_BINDINGS));
		}
	}, []);

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
		isLoading,
		registerShortcut,
		unregisterShortcut,
		updateBinding,
		resetBindings,
	};
}
