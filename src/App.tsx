/**
 * App -- Root component that routes to the correct view based on
 * the Tauri window label or URL query parameter. Each sub-window loads the
 * same React bundle and we determine which view to render.
 */
import { Component, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ThemeProvider } from "@/components/ThemeProvider";
import { KeyboardShortcutsProvider } from "@/components/KeyboardShortcutsProvider";
import { GlobalDragProvider } from "@/components/GlobalDragProvider";
import { useTheme } from "@/hooks/useTheme";
import { isTauriEnvironment } from "@/lib/tauriEnv";
import MainView from "@/views/MainView";
import SettingsView from "@/views/SettingsView";
import TasksView from "@/views/TasksView";
import NoteView from "@/views/NoteView";
import MiniTimerView from "@/views/MiniTimerView";
import YouTubeView from "@/views/YouTubeView";
import StatsView from "@/views/StatsView";
import TimelineWindowView from "@/views/TimelineWindowView";
import ActionNotificationView from "@/views/ActionNotificationView";
import DailyTimeView from "@/views/DailyTimeView";
import MacroTimeView from "@/views/MacroTimeView";
import { DesignTokenShowcase } from "@/components/m3/DesignTokenShowcase";

// ─── Error Boundary for App ───────────────────────────────────────────────────────

interface ErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
}

interface ErrorBoundaryProps {
	children: React.ReactNode;
}

class AppErrorBoundary extends Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		console.error("[AppErrorBoundary] Caught error:", error);
		return { hasError: true, error };
	}

	componentDidCatch(_error: Error, errorInfo: React.ErrorInfo): void {
		console.error("[AppErrorBoundary] Error info:", errorInfo);
	}

	render(): React.ReactNode {
		if (this.state.hasError) {
			return (
				<div className="w-screen h-screen flex items-center justify-center bg-red-950 text-white p-8">
					<div className="max-w-md">
						<h1 className="text-2xl font-bold mb-4">Application Error</h1>
						<p className="mb-4 text-sm opacity-80">
							Something went wrong. Please try restarting the application.
						</p>
						<details className="text-xs bg-black/30 p-4 rounded overflow-auto max-h-96">
							<summary className="cursor-pointer mb-2 font-semibold">
								Error details
							</summary>
							<pre className="whitespace-pre-wrap">
								{this.state.error?.stack || String(this.state.error)}
							</pre>
						</details>
					</div>
				</div>
			);
		}
		return this.props.children;
	}
}

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
	// Theme is now managed by useTheme hook (no localStorage needed)
	const { theme: currentTheme } = useTheme();
	const theme = currentTheme;

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

		const hasTauri = isTauriEnvironment();
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
			}
			setIsInitialized(true);
		};

		fetchLabel();
	}, []);

	// Set window-specific body class for transparent windows - always run this hook
	useEffect(() => {
		if (!isInitialized) return; // Don't run until initialized
		if (label === "mini-timer" || label === "action_notification") {
			document.body.classList.add("transparent-window");
		} else {
			document.body.classList.remove("transparent-window");
		}
	}, [label, isInitialized]);

	// Apply rounded corners on Windows (custom title bar support)
	useEffect(() => {
		if (!isInitialized) return;
		const hasTauri = isTauriEnvironment();
		if (!hasTauri) return;

		const applyRoundedCorners = async () => {
			try {
				const { invoke } = await import("@tauri-apps/api/core");
				// Enable rounded corners for custom title bar on Windows
				await invoke("plugin:window|cmd_apply_rounded_corners", {
					enable: true
				});
				console.log("[App] Applied rounded corners for Windows");
			} catch (e) {
				// Command may not exist on this platform, ignore
				console.debug("[App] Rounded corners not available:", e);
			}
		};

		applyRoundedCorners();
	}, [label, isInitialized]);

	// Apply subtle window rounding unless maximized/fullscreen (desktop only).
	useEffect(() => {
		if (!isInitialized) return;
		const hasTauri = isTauriEnvironment();
		if (!hasTauri) return;

		const win = getCurrentWindow();
		let unlistenResized: null | (() => void) = null;
		let unlistenFocus: null | (() => void) = null;
		let windowResizeHandler: null | (() => void) = null;

		const update = async () => {
			// Avoid rounding in special transparent windows (e.g. mini timer).
			if (document.body.classList.contains("transparent-window")) {
				document.body.classList.remove("window-rounded");
				document.body.classList.remove("window-no-round");
				return;
			}

			document.body.classList.add("window-rounded");
			let isMax = false;
			let isFull = false;
			try {
				[isMax, isFull] = await Promise.all([
					win.isMaximized(),
					win.isFullscreen(),
				]);
			} catch {
				// If window APIs aren't available for some reason, keep rounding enabled.
			}
			const shouldRemoveRounding = isMax || isFull;
			document.body.classList.toggle("window-no-round", shouldRemoveRounding);
		};

		void update();

		// Prefer native window events; fall back to window resize.
		(async () => {
			try {
				unlistenResized = await win.onResized(() => {
					void update();
				});
			} catch {
				// ignore
			}
			try {
				unlistenFocus = await win.onFocusChanged(() => {
					void update();
				});
			} catch {
				// ignore
			}

			if (!unlistenResized) {
				const handler = () => void update();
				window.addEventListener("resize", handler);
				windowResizeHandler = () => window.removeEventListener("resize", handler);
			}
		})();

		return () => {
			unlistenResized?.();
			unlistenFocus?.();
			windowResizeHandler?.();
		};
	}, [label, isInitialized]);

	// Show loading while initializing
	if (!isInitialized) {
		return <LoadingFallback />;
	}

	// Route based on window label
	if (label === "settings") return (
		<GlobalDragProvider><SettingsView windowLabel={label} /></GlobalDragProvider>
	);
	if (label === "mini-timer") return (
		<GlobalDragProvider><MiniTimerView /></GlobalDragProvider>
	);
	if (label === "youtube") return (
		<GlobalDragProvider><YouTubeView /></GlobalDragProvider>
	);
	if (label === "stats") return (
		<GlobalDragProvider><StatsView /></GlobalDragProvider>
	);
	if (label === "timeline") return (
		<GlobalDragProvider><TimelineWindowView /></GlobalDragProvider>
	);
	if (label.startsWith("note")) return (
		<GlobalDragProvider><NoteView windowLabel={label} /></GlobalDragProvider>
	);
	if (label === "action_notification") return (
		<GlobalDragProvider><ActionNotificationView /></GlobalDragProvider>
	);
	if (label === "tasks") return (
		<GlobalDragProvider><TasksView /></GlobalDragProvider>
	);
	if (label === "daily_time") return (
		<GlobalDragProvider><DailyTimeView /></GlobalDragProvider>
	);
	if (label === "macro_time") return (
		<GlobalDragProvider><MacroTimeView /></GlobalDragProvider>
	);
	// Dev: Design token showcase (for testing M3 tokens)
	if (label === "tokens") {
		return (
			<AppErrorBoundary>
				<KeyboardShortcutsProvider theme={theme}>
					<ThemeProvider>
						<GlobalDragProvider>
							<DesignTokenShowcase />
						</GlobalDragProvider>
					</ThemeProvider>
				</KeyboardShortcutsProvider>
			</AppErrorBoundary>
		);
	}

	// Default: main timer
	return (
		<AppErrorBoundary>
			<KeyboardShortcutsProvider theme={theme}>
				<ThemeProvider>
					<GlobalDragProvider>
						<div className="relative w-full h-screen overflow-hidden">
							<MainView />
						</div>
					</GlobalDragProvider>
				</ThemeProvider>
			</KeyboardShortcutsProvider>
		</AppErrorBoundary>
	);
}

export default App;
