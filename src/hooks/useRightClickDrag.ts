/**
 * useRightClickDrag -- Custom hook for right-click drag functionality.
 *
 * Enables PureRef-style window dragging via right mouse button.
 * Used across TitleBar, PomodoroTimer, NoteView, and MiniTimer.
 */
import { useCallback, useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";

interface DragState {
	startX: number;
	startY: number;
	winX: number;
	winY: number;
	scale: number;
}

export function useRightClickDrag() {
	const dragRef = useRef<DragState | null>(null);

	useEffect(() => {
		const onMove = (e: MouseEvent) => {
			const d = dragRef.current;
			if (!d) return;
			const dx = (e.screenX - d.startX) * d.scale;
			const dy = (e.screenY - d.startY) * d.scale;
			getCurrentWindow()
				.setPosition(new PhysicalPosition(d.winX + dx, d.winY + dy))
				.catch(console.error);
		};
		const onUp = () => {
			dragRef.current = null;
		};
		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
		return () => {
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);
		};
	}, []);

	const handleRightDown = useCallback(async (e: React.MouseEvent) => {
		if (e.button !== 2) return;
		e.preventDefault();
		try {
			const win = getCurrentWindow();
			const [pos, scale] = await Promise.all([win.outerPosition(), win.scaleFactor()]);
			dragRef.current = {
				startX: e.screenX,
				startY: e.screenY,
				winX: pos.x,
				winY: pos.y,
				scale,
			};
		} catch {
			// Not in Tauri context
		}
	}, []);

	return { handleRightDown };
}
