/**
 * NoteView -- Standalone sticky note window.
 *
 * Content is persisted in localStorage keyed by the window label.
 * Supports markdown preview and color selection.
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { Edit3 } from "lucide-react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useRightClickDrag } from "@/hooks/useRightClickDrag";
import { KeyboardShortcutsProvider } from "@/components/KeyboardShortcutsProvider";
import TitleBar from "@/components/TitleBar";
import { getCurrentWindow } from "@tauri-apps/api/window";

const STICKY_COLORS = [
	"#fef9c3", // pale yellow
	"#fce7f3", // pale pink
	"#dbeafe", // pale blue
	"#dcfce7", // pale green
	"#f3e8ff", // pale purple
	"#fff7ed", // pale orange
] as const;

interface NoteData {
	content: string;
	color: string;
}

export default function NoteView({ windowLabel }: { windowLabel: string }) {
	const [note, setNote] = useLocalStorage<NoteData>(
		`pomodoroom-note-${windowLabel}`,
		{ content: "", color: STICKY_COLORS[0] },
	);
	const [editing, setEditing] = useState(true);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Use shared right-click drag hook
	const { handleRightDown } = useRightClickDrag();

	const updateContent = useCallback(
		(content: string) => {
			setNote((prev) => ({ ...prev, content }));
		},
		[setNote],
	);

	const updateColor = useCallback(
		(color: string) => {
			setNote((prev) => ({ ...prev, color }));
		},
		[setNote],
	);

	useEffect(() => {
		if (editing && textareaRef.current) {
			textareaRef.current.focus();
		}
	}, [editing]);

	// ─── Keyboard Shortcuts ─────────────────────────────────────────────────────
	// Note: Esc is handled in a special way to avoid conflicts with text editing
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Only handle Esc when not editing (in view mode)
			if (e.key === "Escape" && !editing) {
				getCurrentWindow().close();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [editing]);

	return (
		<KeyboardShortcutsProvider theme="light">
			<div
				className="w-screen h-screen overflow-hidden select-none"
				style={{ backgroundColor: note.color }}
				onMouseDown={handleRightDown}
				onContextMenu={(e) => e.preventDefault()}
			>
			<TitleBar theme="light" title="Note" showMinMax={false} />

			<div className="pt-8 h-full flex flex-col">
				{/* Color picker bar */}
				<div className="flex items-center gap-1 px-3 py-1.5 border-b border-black/10">
					{STICKY_COLORS.map((c) => (
						<button
							key={c}
							type="button"
							aria-label={`Select note color: ${c}`}
							className={`w-5 h-5 rounded-full border-2 transition-transform ${
								note.color === c
									? "border-gray-600 scale-110"
									: "border-transparent hover:scale-105"
							}`}
							style={{ backgroundColor: c }}
							onClick={() => updateColor(c)}
						/>
					))}
					<div className="flex-1" />
					<button
						type="button"
						onClick={() => setEditing(!editing)}
						aria-label={editing ? "View note" : "Edit note"}
						className="p-1 rounded hover:bg-black/10 text-gray-600 transition-colors"
					>
						<Edit3 size={14} />
					</button>
				</div>

				{/* Content */}
				<div className="flex-1 overflow-auto p-3">
					{editing ? (
						<textarea
							ref={textareaRef}
							value={note.content}
							onChange={(e) => updateContent(e.target.value)}
							placeholder="Type your note..."
							className="w-full h-full resize-none bg-transparent text-gray-800 text-sm leading-relaxed outline-none placeholder:text-gray-400"
						/>
					) : (
						<div className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap">
							{note.content || (
								<span className="text-gray-400 italic">
									Empty note
								</span>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
		</KeyboardShortcutsProvider>
	);
}
