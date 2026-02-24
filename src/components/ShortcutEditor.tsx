import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/m3/Icon";
import type { ShortcutBinding, ShortcutCommand } from "@/types";
import { formatShortcut } from "@/constants/shortcuts";

interface ShortcutEditorProps {
	command: ShortcutCommand;
	label: string;
	binding: ShortcutBinding;
	onUpdate: (binding: ShortcutBinding) => void;
	theme?: "light" | "dark";
}

export function ShortcutEditor({
	command: _command,
	label,
	binding,
	onUpdate,
	theme = "dark",
}: ShortcutEditorProps) {
	const [isRecording, setIsRecording] = useState(false);
	const [recordedKeys, setRecordedKeys] = useState<ShortcutBinding | null>(null);

	const startRecording = useCallback(() => {
		setIsRecording(true);
		setRecordedKeys(null);
	}, []);

	const cancelRecording = useCallback(() => {
		setIsRecording(false);
		setRecordedKeys(null);
	}, []);

	const confirmRecording = useCallback(() => {
		if (recordedKeys) {
			onUpdate(recordedKeys);
		}
		setIsRecording(false);
		setRecordedKeys(null);
	}, [recordedKeys, onUpdate]);

	// Handle key recording
	useEffect(() => {
		if (!isRecording) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			e.preventDefault();
			e.stopPropagation();

			// Escape cancels
			if (e.key === "Escape") {
				cancelRecording();
				return;
			}

			// Build binding from event
			const newBinding: ShortcutBinding = {
				key: e.key,
				ctrl: e.ctrlKey,
				alt: e.altKey,
				shift: e.shiftKey,
				meta: e.metaKey,
			};

			setRecordedKeys(newBinding);
		};

		const handleKeyUp = () => {
			// Auto-confirm on key up if we have a binding
			if (recordedKeys) {
				// Delay slightly to allow the keydown to register
				setTimeout(() => {
					// confirmRecording will be called by the button click or Enter
				}, 100);
			}
		};

		window.addEventListener("keydown", handleKeyDown, { capture: true });
		window.addEventListener("keyup", handleKeyUp, { capture: true });

		return () => {
			window.removeEventListener("keydown", handleKeyDown, { capture: true });
			window.removeEventListener("keyup", handleKeyUp, { capture: true });
		};
	}, [isRecording, recordedKeys, cancelRecording]);

	return (
		<div className="flex items-center justify-between text-sm">
			<span className="text-[var(--md-ref-color-on-surface-variant)]">{label}</span>

			{isRecording ? (
				<div className="flex items-center gap-2">
					<span
						className={`px-3 py-1.5 rounded-lg text-xs font-mono ${
							theme === "dark"
								? "bg-blue-500/20 text-blue-400 animate-pulse"
								: "bg-blue-50 text-blue-600 animate-pulse"
						}`}
					>
						Press keys...
					</span>
					{recordedKeys && (
						<>
							<button
								type="button"
								onClick={confirmRecording}
								className="p-1 rounded bg-[var(--md-ref-color-tertiary-container)] hover:bg-[var(--md-ref-color-tertiary)] text-[var(--md-ref-color-on-tertiary-container)]"
								title="Confirm"
							>
								<Icon name="check" size={16} />
							</button>
							<button
								type="button"
								onClick={cancelRecording}
								className="p-1 rounded bg-[var(--md-ref-color-error-container)] hover:bg-[var(--md-ref-color-error)] text-[var(--md-ref-color-on-error-container)]"
								title="Cancel"
							>
								<Icon name="close" size={16} />
							</button>
						</>
					)}
				</div>
			) : (
				<button
					type="button"
					onClick={startRecording}
					className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
						theme === "dark"
							? "bg-[var(--md-ref-color-secondary-container)] hover:bg-[var(--md-ref-color-secondary)] text-[var(--md-ref-color-on-secondary-container)]"
							: "bg-[var(--md-ref-color-surface-container)] hover:bg-[var(--md-ref-color-surface-container-high)] text-[var(--md-ref-color-on-surface-variant)]"
					}`}
				>
					{formatShortcut(binding)}
				</button>
			)}
		</div>
	);
}
