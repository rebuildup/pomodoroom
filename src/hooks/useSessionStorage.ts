import { useCallback, useEffect, useRef, useState } from "react";

export function useSessionStorage<T>(key: string, initialValue: T) {
	const [storedValue, setStoredValue] = useState<T>(() => {
		try {
			const item = window.sessionStorage.getItem(key);
			return item !== null ? JSON.parse(item) : initialValue;
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
					window.sessionStorage.setItem(
						keyRef.current,
						JSON.stringify(valueToStore),
					);
				} catch (error) {
					const err = error instanceof Error ? error : new Error(String(error));
					console.error(
						`[useSessionStorage] Error saving to sessionStorage key "${keyRef.current}":`,
						err.message,
					);
				}
				return valueToStore;
			});
		},
		[],
	);

	useEffect(() => {
		try {
			const item = window.sessionStorage.getItem(key);
			if (item !== null) {
				setStoredValue(JSON.parse(item));
			}
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error(`[useSessionStorage] Error reading sessionStorage key "${key}":`, err.message);
		}
	}, [key]);

	return [storedValue, setValue] as const;
}
