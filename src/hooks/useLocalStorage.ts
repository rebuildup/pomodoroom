import { useCallback, useEffect, useRef, useState } from "react";

function typeGuard<T>(parsed: unknown, initialValue: T): boolean {
	if (Array.isArray(initialValue) && !Array.isArray(parsed)) return false;
	if (
		typeof initialValue === "object" &&
		initialValue !== null &&
		!Array.isArray(initialValue) &&
		(typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
	)
		return false;
	return true;
}

/**
 * @deprecated This hook uses localStorage which is being phased out.
 * Use Tauri IPC commands (cmd_config_*, cmd_cache_*) or specific hooks
 * (useConfig, useTaskStore, etc.) that integrate with the Rust backend.
 * 
 * Only use this hook for temporary UI state or during migration periods.
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
	const initialValueRef = useRef(initialValue);

	useEffect(() => {
		initialValueRef.current = initialValue;
	}, [initialValue]);

	// Log deprecation warning once per key
	useEffect(() => {
		console.warn(
			`[useLocalStorage] DEPRECATED: localStorage hook used for key "${key}". ` +
			`Migrate to Tauri backend (cmd_config_*, cmd_cache_*) or specialized hooks.`
		);
	}, [key]);

	const [storedValue, setStoredValue] = useState<T>(() => {
		try {
			const item = window.localStorage.getItem(key);
			if (item === null) return initialValueRef.current;
			const parsed = JSON.parse(item);
			if (!typeGuard(parsed, initialValueRef.current)) return initialValueRef.current;
			return parsed;
		} catch {
			return initialValueRef.current;
		}
	});

	const setValue = useCallback(
		(value: T | ((val: T) => T)) => {
			setStoredValue((prev) => {
				const valueToStore =
					typeof value === "function" ? (value as (val: T) => T)(prev) : value;
				try {
					window.localStorage.setItem(
						key,
						JSON.stringify(valueToStore),
					);
				} catch (error) {
					const err = error instanceof Error ? error : new Error(String(error));
					console.error(
						`[useLocalStorage] Error saving to localStorage key "${key}":`,
						err.message,
					);
				}
				return valueToStore;
			});
		},
		[key],
	);

	// Sync when key changes
	useEffect(() => {
		try {
			const item = window.localStorage.getItem(key);
			if (item === null) return;
			const parsed = JSON.parse(item);
			if (!typeGuard(parsed, initialValueRef.current)) return;
			setStoredValue(parsed);
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error(`[useLocalStorage] Error reading localStorage key "${key}":`, err.message);
		}
	}, [key]);

	// Cross-window sync: listen for storage events from other windows
	useEffect(() => {
		const handler = (e: StorageEvent) => {
			if (e.key !== key) return;
			try {
				if (e.newValue === null) {
					setStoredValue(initialValueRef.current);
					return;
				}
				const parsed = JSON.parse(e.newValue);
				if (!typeGuard(parsed, initialValueRef.current)) return;
				setStoredValue(parsed);
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error));
				console.error(`[useLocalStorage] Error syncing localStorage key "${key}":`, err.message);
			}
		};
		window.addEventListener("storage", handler);
		return () => window.removeEventListener("storage", handler);
	}, [key]);

	return [storedValue, setValue] as const;
}
