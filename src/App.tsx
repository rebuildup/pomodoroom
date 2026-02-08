/**
 * App -- Root component that routes to the correct view based on
 * the Tauri window label. Each sub-window loads the same React bundle
 * and this component inspects getCurrentWindow().label to decide
 * which view to render.
 */
import { useEffect, useState } from "react";
import PomodoroTimer from "@/components/PomodoroTimer";
import SettingsView from "@/views/SettingsView";
import NoteView from "@/views/NoteView";
import MiniTimerView from "@/views/MiniTimerView";
import YouTubeView from "@/views/YouTubeView";
import StatsView from "@/views/StatsView";

function getWindowLabel(): string {
	try {
		// Tauri v2: window.__TAURI_INTERNALS__ has the label
		const internals = (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ as
			| { metadata?: { currentWindow?: { label?: string } } }
			| undefined;
		return internals?.metadata?.currentWindow?.label ?? "main";
	} catch {
		return "main";
	}
}

function App() {
	const [label] = useState(getWindowLabel);

	// Set window-specific body class for transparent windows
	useEffect(() => {
		if (label === "mini-timer") {
			document.body.classList.add("transparent-window");
		}
	}, [label]);

	// Route based on window label
	if (label === "settings") return <SettingsView />;
	if (label === "mini-timer") return <MiniTimerView />;
	if (label === "youtube") return <YouTubeView />;
	if (label === "stats") return <StatsView />;
	if (label.startsWith("note")) return <NoteView windowLabel={label} />;

	// Default: main timer
	return (
		<div className="relative w-full h-screen overflow-hidden">
			<PomodoroTimer />
		</div>
	);
}

export default App;
