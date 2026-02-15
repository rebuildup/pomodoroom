/**
 * NoteView -- Standalone sticky note window.
 *
 * Content is persisted in localStorage keyed by the window label.
 * Auto-switches between edit and preview via focus state.
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useRightClickDrag } from "@/hooks/useRightClickDrag";
import { KeyboardShortcutsProvider } from "@/components/KeyboardShortcutsProvider";
import TitleBar from "@/components/TitleBar";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface NoteData {
	content: string;
}

export default function NoteView({ windowLabel }: { windowLabel: string }) {
	const [note, setNote] = useLocalStorage<NoteData>(
		`pomodoroom-note-${windowLabel}`,
		{ content: "" },
	);
	const [isFocused, setIsFocused] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Use shared right-click drag hook
	const { handleRightDown } = useRightClickDrag();

	const updateContent = useCallback(
		(content: string) => {
			setNote((prev) => ({ ...prev, content }));
		},
		[setNote],
	);

	useEffect(() => {
		if (isFocused && textareaRef.current) {
			textareaRef.current.focus();
		}
	}, [isFocused]);

	// ─── Keyboard Shortcuts ─────────────────────────────────────────────────────
	// Note: Esc is handled in a special way to avoid conflicts with text editing
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Only handle Esc when not focused (preview mode)
			if (e.key === "Escape" && !isFocused) {
				void getCurrentWindow().close().catch((error) => {
					console.error("[NoteView] Failed to close window via Escape:", error);
				});
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isFocused]);

	const renderInline = (text: string) => {
		const segments: React.ReactNode[] = [];
		const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
		let lastIndex = 0;
		let match: RegExpExecArray | null = null;
		let key = 0;
		while (true) {
			match = pattern.exec(text);
			if (!match) break;
			if (match.index > lastIndex) {
				segments.push(text.slice(lastIndex, match.index));
			}
			const token = match[0];
			if (token.startsWith("**") && token.endsWith("**")) {
				segments.push(<strong key={`b-${key++}`}>{token.slice(2, -2)}</strong>);
			} else if (token.startsWith("`") && token.endsWith("`")) {
				segments.push(
					<code
						key={`c-${key++}`}
						className="px-1 py-0.5 rounded bg-black/10 text-[0.92em]"
					>
						{token.slice(1, -1)}
					</code>,
				);
			} else if (token.startsWith("[")) {
				const parsed = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
				if (parsed) {
					const href = parsed[2].trim();
					const lowerHref = href.toLowerCase();
					const isSafeHref =
						lowerHref.startsWith("http://") ||
						lowerHref.startsWith("https://") ||
						lowerHref.startsWith("mailto:") ||
						lowerHref.startsWith("/") ||
						lowerHref.startsWith("./") ||
						lowerHref.startsWith("../");
					if (!isSafeHref || lowerHref.startsWith("javascript:") || lowerHref.startsWith("data:")) {
						segments.push(parsed[1]);
						lastIndex = pattern.lastIndex;
						continue;
					}
					segments.push(
						<a
							key={`l-${key++}`}
							href={href}
							target="_blank"
							rel="noopener noreferrer"
							className="underline"
							onMouseDown={(e) => e.stopPropagation()}
							onClick={(e) => e.stopPropagation()}
						>
							{parsed[1]}
						</a>,
					);
				} else {
					segments.push(token);
				}
			} else {
				segments.push(token);
			}
			lastIndex = pattern.lastIndex;
		}
		if (lastIndex < text.length) segments.push(text.slice(lastIndex));
		return segments;
	};

	const renderMarkdown = (content: string) => {
		const lines = content.split("\n");
		return lines.map((line, index) => {
			if (line.startsWith("### ")) {
				return (
					<h3 key={`md-${index}`} className="text-base font-semibold mt-2 first:mt-0">
						{renderInline(line.slice(4))}
					</h3>
				);
			}
			if (line.startsWith("## ")) {
				return (
					<h2 key={`md-${index}`} className="text-lg font-semibold mt-2 first:mt-0">
						{renderInline(line.slice(3))}
					</h2>
				);
			}
			if (line.startsWith("# ")) {
				return (
					<h1 key={`md-${index}`} className="text-xl font-semibold mt-2 first:mt-0">
						{renderInline(line.slice(2))}
					</h1>
				);
			}
			if (line.startsWith("- ")) {
				return (
					<div key={`md-${index}`} className="pl-4 relative">
						<span className="absolute left-0">•</span>
						<span>{renderInline(line.slice(2))}</span>
					</div>
				);
			}
			if (line.startsWith("> ")) {
				return (
					<blockquote key={`md-${index}`} className="border-l-2 border-black/20 pl-2 italic">
						{renderInline(line.slice(2))}
					</blockquote>
				);
			}
			if (!line.trim()) return <div key={`md-${index}`} className="h-3" />;
			return (
				<p key={`md-${index}`} className="leading-relaxed">
					{renderInline(line)}
				</p>
			);
		});
	};

	return (
		<KeyboardShortcutsProvider theme="light">
			<div
				className="relative w-screen h-screen overflow-hidden select-none bg-(--color-surface)"
				onMouseDown={handleRightDown}
				onContextMenu={(e) => e.preventDefault()}
			>
			<TitleBar
				theme="light"
				title="Note"
				showMinMax={false}
				position="absolute"
				disableRounding={true}
			/>

			<div className="h-full flex flex-col">
				<div className="flex-1 overflow-auto p-3">
					{isFocused ? (
						<textarea
							ref={textareaRef}
							value={note.content}
							onChange={(e) => updateContent(e.target.value)}
							onBlur={() => setIsFocused(false)}
							placeholder="Write in markdown..."
							className="w-full h-full resize-none bg-transparent text-(--color-text-primary) text-sm leading-relaxed outline-none placeholder:text-(--color-text-muted)"
						/>
					) : (
						<div
							className="text-(--color-text-primary) text-sm cursor-pointer"
							onClick={() => setIsFocused(true)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									setIsFocused(true);
								}
							}}
							role="button"
							tabIndex={0}
							aria-label="Edit note"
						>
							{note.content.trim().length > 0 ? (
								<div className="space-y-1">{renderMarkdown(note.content)}</div>
							) : (
								<span className="text-(--color-text-muted) italic">Empty note</span>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
		</KeyboardShortcutsProvider>
	);
}
