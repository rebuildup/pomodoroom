import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauriEnvironment } from "@/lib/tauriEnv";
import { useTheme } from "@/hooks/useTheme";

interface WindowControlsSnapshot {
	always_on_top: boolean;
	is_locked: boolean;
}

// localStorage persistence removed - database-only architecture

export function useWindowControls() {
	const { theme, toggleTheme } = useTheme();
	const [alwaysOnTop, setAlwaysOnTop] = useState(false);
	const [isLocked, setIsLocked] = useState(false);
	const [transparentFrame, setTransparentFrame] = useState(false);

	useEffect(() => {
		document.body.classList.toggle("window-transparent-frame", transparentFrame);
		if (isTauriEnvironment()) {
			invoke("cmd_set_window_shadow", { enabled: !transparentFrame }).catch((error) => {
				console.error("[useWindowControls] Failed to set window shadow:", error);
			});
		}
		return () => {
			document.body.classList.remove("window-transparent-frame");
		};
	}, [transparentFrame]);

	useEffect(() => {
		let mounted = true;
		if (!isTauriEnvironment()) return;
		const load = async () => {
			try {
				const snapshot = await invoke<WindowControlsSnapshot>("cmd_get_window_controls_state");
				if (!mounted) return;
				setAlwaysOnTop(snapshot.always_on_top);
				setIsLocked(snapshot.is_locked);
			} catch (error) {
				console.error("[useWindowControls] Failed to load window controls:", error);
			}
		};
		void load();
		return () => {
			mounted = false;
		};
	}, []);

	const togglePin = useCallback(async () => {
		const next = !alwaysOnTop;
		setAlwaysOnTop(next);
		if (!isTauriEnvironment()) return;
		try {
			await invoke("cmd_set_always_on_top", { enabled: next });
		} catch (error) {
			setAlwaysOnTop(!next);
			console.error("[useWindowControls] Failed to toggle pin:", error);
		}
	}, [alwaysOnTop]);

	const toggleWindowLock = useCallback(async () => {
		const next = !isLocked;
		setIsLocked(next);
		if (!isTauriEnvironment()) return;
		try {
			await invoke("cmd_set_window_locked", { enabled: next });
		} catch (error) {
			setIsLocked(!next);
			console.error("[useWindowControls] Failed to toggle window lock:", error);
		}
	}, [isLocked]);

	const toggleTransparency = useCallback(() => {
		setTransparentFrame((prev) => !prev);
	}, []);

	return {
		theme,
		toggleTheme,
		alwaysOnTop,
		togglePin,
		isLocked,
		toggleWindowLock,
		transparentFrame,
		toggleTransparency,
	};
}
