import { useCallback, useEffect, useState } from "react";

export function useSessionStorage<T>(key: string, initialValue: T) {
	const [storedValue, setStoredValue] = useState<T>(() => {
		let item: string | null = null;
		try {
			item = window.sessionStorage.getItem(key);
		} catch {
			return initialValue;
		}

		if (item === null) {
			return initialValue;
		}

		try {
			return JSON.parse(item);
		} catch {
			return initialValue;
		}
	});
	const setValue = useCallback(
		(value: T | ((val: T) => T)) => {
			setStoredValue((prev) => {
				const valueToStore = value instanceof Function ? value(prev) : value;
				try {
					window.sessionStorage.setItem(key, JSON.stringify(valueToStore));
				} catch (error) {
					const err = error instanceof Error ? error : new Error(String(error));
					console.error(
						`[useSessionStorage] Error saving to sessionStorage key "${key}":`,
						err.message,
					);
				}
				return valueToStore;
			});
		},
		[key],
	);

	useEffect(() => {
		let item: string | null = null;
		try {
			item = window.sessionStorage.getItem(key);
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error(`[useSessionStorage] Error reading sessionStorage key "${key}":`, err.message);
			return;
		}

		if (item !== null) {
			try {
				setStoredValue(JSON.parse(item));
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error));
				console.error(
					`[useSessionStorage] Error parsing sessionStorage key "${key}":`,
					err.message,
				);
			}
		}
	}, [key]);

	return [storedValue, setValue] as const;
}
