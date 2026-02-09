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
