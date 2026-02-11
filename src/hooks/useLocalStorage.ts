import { useCallback, useEffect, useState } from "react";

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

export function useLocalStorage<T>(key: string, initialValue: T) {
	const [storedValue, setStoredValue] = useState<T>(() => {
		try {
			const item = window.localStorage.getItem(key);
			if (item === null) return initialValue;
			const parsed = JSON.parse(item);
			if (!typeGuard(parsed, initialValue)) return initialValue;
			return parsed;
		} catch {
			return initialValue;
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
			if (!typeGuard(parsed, initialValue)) return;
			setStoredValue(parsed);
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error(`[useLocalStorage] Error reading localStorage key "${key}":`, err.message);
		}
	}, [key, initialValue]);

	// Cross-window sync: listen for storage events from other windows
	useEffect(() => {
		const handler = (e: StorageEvent) => {
			if (e.key !== key) return;
			try {
				if (e.newValue === null) {
					setStoredValue(initialValue);
					return;
				}
				const parsed = JSON.parse(e.newValue);
				if (!typeGuard(parsed, initialValue)) return;
				setStoredValue(parsed);
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error));
				console.error(`[useLocalStorage] Error syncing localStorage key "${key}":`, err.message);
			}
		};
		window.addEventListener("storage", handler);
		return () => window.removeEventListener("storage", handler);
	}, [key, initialValue]);

	return [storedValue, setValue] as const;
}
