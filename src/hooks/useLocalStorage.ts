import { useCallback, useEffect, useRef, useState } from "react";

export function useLocalStorage<T>(key: string, initialValue: T) {
	const [storedValue, setStoredValue] = useState<T>(() => {
		try {
			const item = window.localStorage.getItem(key);
			if (item === null) return initialValue;
			const parsed = JSON.parse(item);
			// Type guard: if initialValue is an array, ensure parsed is also an array
			if (Array.isArray(initialValue) && !Array.isArray(parsed)) return initialValue;
			// Type guard: if initialValue is an object (not array), ensure parsed is also an object
			if (typeof initialValue === "object" && initialValue !== null && !Array.isArray(initialValue) && (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))) return initialValue;
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
					value instanceof Function ? value(prev) : value;
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

	// Sync with key changes
	useEffect(() => {
		try {
			const item = window.localStorage.getItem(key);
			if (item !== null) {
				setStoredValue(JSON.parse(item));
			}
		} catch {
			// ignore
		}
	}, [key]);

	return [storedValue, setValue] as const;
}
