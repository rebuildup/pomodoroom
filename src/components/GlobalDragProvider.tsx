/**
 * GlobalDragProvider -- Provides right-click window drag functionality globally.
 *
 * Enables PureRef-style window dragging via right mouse button across the entire
 * application.
 */
import { useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";

interface DragState {
	startX: number;
	startY: number;
	winX: number;
	winY: number;
	scale: number;
}

function isTauriRuntime(): boolean {
	if (typeof window === "undefined") return false;
	// Tauri v1 exposes __TAURI__. Tauri v2 uses internal globals but may still
	// expose __TAURI__ in some builds. UA fallback covers edge cases.
	return (
		"__TAURI__" in window ||
		"__TAURI_INTERNALS__" in window ||
		(typeof navigator !== "undefined" && navigator.userAgent.includes("Tauri"))
	);
}

export function GlobalDragProvider({ children }: { children: React.ReactNode }) {
	const dragRef = useRef<DragState | null>(null);
	const isDraggingRef = useRef(false);
	const rightMouseDownRef = useRef(false);

	useEffect(() => {
		// Only run inside the desktop app. In browser/dev preview we don't want to
		// globally suppress context menus or attempt window moves.
		if (!isTauriRuntime()) {
			return;
		}

		const handleMouseDown = async (e: MouseEvent) => {
			if (e.button === 2) {
				rightMouseDownRef.current = true;
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
				isDraggingRef.current = true;

				try {
					const win = getCurrentWindow();
					const [pos, scale] = await Promise.all([
						win.outerPosition(),
						win.scaleFactor(),
					]);
					dragRef.current = {
						startX: e.screenX,
						startY: e.screenY,
						winX: pos.x,
						winY: pos.y,
						scale,
					};
				} catch (err) {
					console.error("[GlobalDragProvider] Failed to start drag:", err);
					isDraggingRef.current = false;
				}
			}
		};

		const handleMouseMove = (e: MouseEvent) => {
			const d = dragRef.current;
			if (!d) return;
			// Keep preventing defaults during a drag so a right-click doesn't end up
			// triggering a context menu on mouseup.
			e.preventDefault();
			const dx = (e.screenX - d.startX) * d.scale;
			const dy = (e.screenY - d.startY) * d.scale;
			getCurrentWindow().setPosition(
				new PhysicalPosition(d.winX + dx, d.winY + dy),
			).catch(console.error);
		};

		const handleMouseUp = (e: MouseEvent) => {
			if (e.button === 2) {
				rightMouseDownRef.current = false;
			}
			dragRef.current = null;
			isDraggingRef.current = false;
		};

		// Always prevent context menu inside the app window. Right click is reserved
		// for window dragging.
		const handleContextMenu = (e: Event) => {
			e.preventDefault();
			// Stop other handlers (including React onContextMenu) from running.
			e.stopPropagation();
			// stopImmediatePropagation exists on Event in modern browsers/webviews.
			(e as any).stopImmediatePropagation?.();
		};

		// Listen on document for global coverage
		document.addEventListener("mousedown", handleMouseDown, { capture: true });
		document.addEventListener("mousemove", handleMouseMove, { capture: true });
		document.addEventListener("mouseup", handleMouseUp, { capture: true });
		document.addEventListener("contextmenu", handleContextMenu, { capture: true });
		// Some webviews dispatch contextmenu on window; add as a belt-and-suspenders.
		window.addEventListener("contextmenu", handleContextMenu, { capture: true });

		return () => {
			document.removeEventListener("mousedown", handleMouseDown, { capture: true });
			document.removeEventListener("mousemove", handleMouseMove, { capture: true });
			document.removeEventListener("mouseup", handleMouseUp, { capture: true });
			document.removeEventListener("contextmenu", handleContextMenu, { capture: true });
			window.removeEventListener("contextmenu", handleContextMenu, { capture: true });
		};
	}, []);

	return <>{children}</>;
}
