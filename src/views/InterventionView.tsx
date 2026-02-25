/**
 * InterventionView — Window view for the unavoidable intervention dialog.
 *
 * This view renders when window label starts with "intervention_".
 * It loads intervention data from the backend and displays the modal dialog.
 */
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit } from "@tauri-apps/api/event";
import { InterventionDialog, type InterventionAction } from "@/components/m3/InterventionDialog";
import type { PressureMode } from "@/types/pressure";

// ─── Intervention Data Types ────────────────────────────────────────────────────────

interface InterventionData {
	trigger: "timer_complete" | "active_empty" | "pressure_transition" | "wait_resolved" | "break_complete";
	pressure_mode: PressureMode;
	title: string;
	message: string;
	context?: {
		type: "task" | "pressure" | "break" | "resume";
		title: string;
		items: Array<{ label: string; value: string; highlight?: boolean }>;
	};
	actions: Array<{ id: string; label: string; variant?: "filled" | "tonal" | "outlined" | "text"; primary?: boolean }>;
}

// ─── Component ───────────────────────────────────────────────────────────────────────

export function InterventionView() {
	const [data, setData] = useState<InterventionData | null>(null);
	const [isProcessing, setIsProcessing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Close this window
	const closeSelf = async () => {
		try {
			const currentWindow = getCurrentWindow();
			const label = currentWindow.label;

			// Notify backend that intervention is closing
			try {
				await invoke("cmd_close_intervention_dialog", { label });
			} catch (err) {
				console.warn("Failed to notify backend about intervention close:", err);
			}

			// Close the window
			await currentWindow.close();
		} catch {
			if (typeof window !== "undefined") {
				window.close();
			}
		}
	};

	// Load intervention data on mount
	useEffect(() => {
		const loadIntervention = async () => {
			try {
				const result = await invoke<InterventionData>("cmd_get_intervention_data");
				setData(result);
			} catch (err) {
				console.error("Failed to load intervention data:", err);
				setError("介入データの読み込みに失敗しました");
				// Auto-close after 3 seconds on error
				setTimeout(() => {
					void closeSelf();
				}, 3000);
			}
		};

		void loadIntervention();
	}, []);

	// Handle action click
	const handleAction = async (action: InterventionAction) => {
		if (isProcessing) return;

		setIsProcessing(true);
		setError(null);

		try {
			// Emit action event for backend to handle
			const triggerValue = data ? data.trigger : undefined;
			await emit("intervention:action", {
				actionId: action.id,
				trigger: triggerValue,
			});

			// Small delay to ensure event is processed
			await new Promise((resolve) => setTimeout(resolve, 200));

			// Dispatch refresh events for other windows
			if (typeof window !== "undefined") {
				window.dispatchEvent(new CustomEvent("tasks:refresh"));
				window.dispatchEvent(new CustomEvent("guidance-refresh"));
			}

			// Close the dialog
			await closeSelf();
		} catch (err) {
			console.error("Failed to execute intervention action:", err);
			setError("アクションの実行に失敗しました");
			setIsProcessing(false);
		}
	};

	// Render loading state
	if (!data) {
		return (
			<div className="w-full h-full flex items-center justify-center bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)]">
				<div className="flex flex-col items-center gap-3">
					<div className="animate-spin">
						<div className="w-8 h-8 rounded-full border-2 border-[var(--md-sys-color-primary)] border-t-transparent animate-spin" />
					</div>
					<span className="text-sm">Loading...</span>
				</div>
			</div>
		);
	}

	// Render error state
	if (error) {
		return (
			<div className="w-full h-full flex items-center justify-center bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)] p-4">
				<div className="text-center">
					<p className="text-sm">{error}</p>
					<p className="text-xs mt-2 opacity-70">自動的に閉じられます...</p>
				</div>
			</div>
		);
	}

	// Render intervention dialog
	return (
		<InterventionDialog
			trigger={data.trigger}
			pressureMode={data.pressure_mode}
			title={data.title}
			message={data.message}
			context={data.context}
			actions={data.actions}
			isProcessing={isProcessing}
			onAction={handleAction}
		/>
	);
}

export default InterventionView;
