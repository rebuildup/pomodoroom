/**
 * App -- Root component that routes to the correct view based on
 * the Tauri window label or URL query parameter. Each sub-window loads the
 * same React bundle and we determine which view to render.
 */
import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ThemeProvider } from "@/components/ThemeProvider";
import MainView from "@/views/MainView";
import SettingsView from "@/views/SettingsView";
import NoteView from "@/views/NoteView";
import MiniTimerView from "@/views/MiniTimerView";
import YouTubeView from "@/views/YouTubeView";
import StatsView from "@/views/StatsView";

// Loading fallback while window label is being determined
function LoadingFallback() {
	return (
		<div className="w-screen h-screen flex items-center justify-center bg-gray-950 text-white">
			<div className="text-sm opacity-50">Loading...</div>
		</div>
	);
}

function getWindowLabelFromUrl(): string | null {
	const params = new URLSearchParams(window.location.search);
	return params.get("window");
}

function App() {
	// Try to get window label from multiple sources
	const [label, setLabel] = useState<string>(() => {
		// First, check URL parameter (most reliable for sub-windows)
		const urlLabel = getWindowLabelFromUrl();
		if (urlLabel) {
			console.log("[App] Window label from URL:", urlLabel);
			return urlLabel;
		}
		// Fallback to main
		return "main";
	});

	const [isInitialized, setIsInitialized] = useState(false);

	// Get window label from Tauri API (for main window or as backup)
	useEffect(() => {
		const urlLabel = getWindowLabelFromUrl();
		if (urlLabel) {
			// URL parameter takes precedence
			console.log("[App] Using URL parameter for window:", urlLabel);
			setLabel(urlLabel);
			setIsInitialized(true);
			return;
		}

		// No URL parameter, try Tauri API
		console.log("[App] Component mounted, checking Tauri API...");

		const hasTauri = "__TAURI__" in window;
		console.log("[App] __TAURI__ check:", hasTauri);

		const fetchLabel = async () => {
			try {
				if (hasTauri) {
					console.log("[App] Tauri detected, fetching window label...");
					const win = await getCurrentWindow();
					console.log("[App] Window label fetched:", win.label);
					setLabel(win.label);
				} else {
					console.log("[App] Not in Tauri context (browser), using 'main'");
					setLabel("main");
				}
			} catch (e) {
				console.error("[App] Error fetching window label:", e);
				setLabel("main");
			} finally {
				setIsInitialized(true);
			}
		};

		fetchLabel();
	}, []);

	// Set window-specific body class for transparent windows - always run this hook
	useEffect(() => {
		if (!isInitialized) return; // Don't run until initialized
		if (label === "mini-timer") {
			document.body.classList.add("transparent-window");
		} else {
			document.body.classList.remove("transparent-window");
		}
	}, [label, isInitialized]);

	// Show loading while initializing
	if (!isInitialized) {
		return <LoadingFallback />;
	}

	// Route based on window label
	if (label === "settings") return <SettingsView />;
	if (label === "mini-timer") return <MiniTimerView />;
	if (label === "youtube") return <YouTubeView />;
	if (label === "stats") return <StatsView />;
	if (label.startsWith("note")) return <NoteView windowLabel={label} />;

	// Default: main timer
	return (
		<ThemeProvider>
			<div className="relative w-full h-screen overflow-hidden">
				<MainView />
			</div>
		</ThemeProvider>
	);
}

export default App;
