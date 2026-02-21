/**
 * NoteView -- Standalone sticky note window.
 *
 * localStorage persistence removed - database-only architecture
 * Auto-switches between edit and preview via focus state.
 *
 * Can load/save reference notes when triggered via Tauri event.
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { KeyboardShortcutsProvider } from "@/components/KeyboardShortcutsProvider";
import DetachedWindowShell from "@/components/DetachedWindowShell";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTheme } from "@/hooks/useTheme";
import { listen, emit } from "@tauri-apps/api/event";
import { useProjects } from "@/hooks/useProjects";

interface NoteData {
	content: string;
}

interface NoteReferenceData {
	projectId: string;
	referenceId: string;
}

interface NoteTempData {
	projectId: string;
	initialContent: string;
}

export default function NoteView({ windowLabel: _windowLabel }: { windowLabel: string }) {
	// localStorage persistence removed - use default empty state
	const [note, setNote] = useState<NoteData>({ content: "" });
	const [isFocused, setIsFocused] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const { theme } = useTheme();
	const { projects, updateProject } = useProjects();

	// Reference mode: when editing a project reference note
	const [referenceData, setReferenceData] = useState<NoteReferenceData | null>(null);

	// Temp mode: when editing a new note (creation panel)
	const [tempData, setTempData] = useState<NoteTempData | null>(null);

	const updateContent = useCallback(
		(content: string) => {
			setNote((prev) => ({ ...prev, content }));
		},
		[setNote],
	);

	// Load reference data when event is received
	useEffect(() => {
		const unlisten = listen<NoteReferenceData>("note:load-reference", (event) => {
			const { projectId, referenceId } = event.payload;
			console.log("[NoteView] Loading reference:", projectId, referenceId);

			const project = projects.find((p) => p.id === projectId);
			if (!project) {
				console.error("[NoteView] Project not found:", projectId);
				return;
			}

			const reference = (project.references || []).find((r) => r.id === referenceId);
			if (!reference) {
				console.error("[NoteView] Reference not found:", referenceId);
				return;
			}

			setReferenceData({ projectId, referenceId });
			setNote({ content: reference.value || "" });
		});

		return () => {
			unlisten.then((fn) => fn());
		};
	}, [projects]);

	// Load temp note data when event is received (from creation panel)
	useEffect(() => {
		const unlisten = listen<NoteTempData>("note:load-temp", (event) => {
			const { projectId, initialContent } = event.payload;
			console.log("[NoteView] Loading temp note:", projectId);

			// Clear reference mode when entering temp mode
			setReferenceData(null);
			setTempData({ projectId, initialContent });
			setNote({ content: initialContent });

			// Update window title
			const project = projects.find((p) => p.id === projectId);
			if (project) {
				void getCurrentWindow().setTitle(`${project.name} - New Note`);
			}
		});

		return () => {
			unlisten.then((fn) => fn());
		};
	}, [projects]);

	// Emit temp note changes back to creation panel
	useEffect(() => {
		if (!tempData) return;

		// Emit content changes
		void emit("note:temp-changed", {
			projectId: tempData.projectId,
			content: note.content,
		});
	}, [note.content, tempData]);

	// Save note content to reference when editing in reference mode
	useEffect(() => {
		if (!referenceData) return;

		const saveTimeout = setTimeout(async () => {
			const project = projects.find((p) => p.id === referenceData.projectId);
			if (!project) return;

			const updatedRefs = (project.references || []).map((r) =>
				r.id === referenceData.referenceId
					? { ...r, value: note.content }
					: r
			);

			try {
				await updateProject(referenceData.projectId, {
					name: project.name,
					deadline: project.deadline || null,
					references: updatedRefs,
				});
				console.log("[NoteView] Saved note to reference:", referenceData.referenceId);
			} catch (error) {
				console.error("[NoteView] Failed to save note:", error);
			}
		}, 500); // Debounce save

		return () => clearTimeout(saveTimeout);
	}, [note.content, referenceData, projects, updateProject]);

	// Update window title when reference data changes
	useEffect(() => {
		if (referenceData) {
			const project = projects.find((p) => p.id === referenceData.projectId);
			if (project) {
				const reference = (project.references || []).find((r) => r.id === referenceData.referenceId);
				const label = reference?.label || "Note";
				const title = `${project.name} - ${label}`;
				void getCurrentWindow().setTitle(title);
			}
		} else if (tempData) {
			// Title is already set in the load-temp handler
		} else {
			void getCurrentWindow().setTitle("Note");
		}
	}, [referenceData, tempData, projects]);

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
		<KeyboardShortcutsProvider theme={theme}>
			<DetachedWindowShell
				title={referenceData || tempData ? "" : "Note"}
				showMinMax={false}
			>
				<div
					className="absolute inset-0 overflow-auto p-3"
					onContextMenu={(e) => e.preventDefault()}
				>
					{isFocused ? (
						<textarea
							ref={textareaRef}
							value={note.content}
							onChange={(e) => updateContent(e.target.value)}
							onBlur={() => setIsFocused(false)}
							placeholder="Write in markdown..."
							className="w-full h-full min-h-[160px] resize-none bg-transparent text-[var(--md-ref-color-on-surface)] text-sm leading-relaxed outline-none placeholder:text-[var(--md-ref-color-on-surface-variant)]"
							autoFocus
						/>
					) : (
						<div
							className="text-[var(--md-ref-color-on-surface)] text-sm cursor-pointer min-h-[160px]"
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
								<span className="text-[var(--md-ref-color-on-surface-variant)] italic">Empty note</span>
							)}
						</div>
					)}
				</div>
			</DetachedWindowShell>
		</KeyboardShortcutsProvider>
	);
}
