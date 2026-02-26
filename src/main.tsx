import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import "@fontsource/material-symbols-outlined";
import App from "./App";
import StartupUpdateChecker from "./components/StartupUpdateChecker";
import SyncStatus from "./components/SyncStatus";
import "./index.css";

// Log environment variables for debugging
console.log("[main.tsx] Environment check:", {
	GOOGLE_CLIENT_ID: import.meta.env.GOOGLE_CLIENT_ID || "not found",
	NODE_ENV: import.meta.env.NODE_ENV || "not found",
	MODE: import.meta.env.MODE || "not found",
});

// Initialize Google Calendar sync on startup
async function initSync() {
	try {
		const result = await invoke<import("./types/sync").SyncResult>("cmd_sync_startup");
		console.log("[Sync] Startup sync completed:", result);
	} catch (err) {
		// Sync may fail if not authenticated, that's okay
		console.warn("[Sync] Startup sync failed (may require auth):", err);
	}
}

// Initialize app
initSync();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<App />
		<StartupUpdateChecker />
		<SyncStatus />
	</React.StrictMode>,
);
