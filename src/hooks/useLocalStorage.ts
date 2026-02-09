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
	const keyRef = useRef(key);
	keyRef.current = key;

	const setValue = useCallback(
		(value: T | ((val: T) => T)) => {
			setStoredValue((prev) => {
				const valueToStore =
					typeof value === "function" ? (value as (val: T) => T)(prev) : value;
				try {
					window.localStorage.setItem(
						keyRef.current,
						JSON.stringify(valueToStore),
					);
				} catch (error) {
					console.error(
						`Error saving to localStorage key "${keyRef.current}":`,
						error,
					);
				}
				return valueToStore;
			});
		},
		[],
	);

	// Sync when key changes
	useEffect(() => {
		try {
			const item = window.localStorage.getItem(key);
			if (item === null) return;
			const parsed = JSON.parse(item);
			if (!typeGuard(parsed, initialValue)) return;
			setStoredValue(parsed);
		} catch {
			// ignore
		}
	}, [key]); // eslint-disable-line -- initialValue is stable by contract

	// Cross-window sync: listen for storage events from other windows
	useEffect(() => {
		const handler = (e: StorageEvent) => {
			if (e.key !== keyRef.current) return;
			try {
				if (e.newValue === null) {
					setStoredValue(initialValue);
					return;
				}
				const parsed = JSON.parse(e.newValue);
				if (!typeGuard(parsed, initialValue)) return;
				setStoredValue(parsed);
			} catch {
				// ignore
			}
		};
		window.addEventListener("storage", handler);
		return () => window.removeEventListener("storage", handler);
	}, []); // eslint-disable-line -- initialValue is stable by contract

	return [storedValue, setValue] as const;
}
