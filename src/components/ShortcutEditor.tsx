import { useCallback, useEffect, useState } from "react";
import { Check, X } from "lucide-react";
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
	command,
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
			<span className={theme === "dark" ? "text-gray-300" : "text-gray-700"}>
				{label}
			</span>

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
								className="p-1 rounded hover:bg-green-500/20 text-green-400"
								title="Confirm"
							>
								<Check size={16} />
							</button>
							<button
								type="button"
								onClick={cancelRecording}
								className="p-1 rounded hover:bg-red-500/20 text-red-400"
								title="Cancel"
							>
								<X size={16} />
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
							? "bg-gray-700 hover:bg-gray-600 text-gray-300"
							: "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200"
					}`}
				>
					{formatShortcut(binding)}
				</button>
			)}
		</div>
	);
}
