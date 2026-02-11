/**
 * useUpdater - Hook for managing app updates via Tauri plugin.
 */
import { useState, useCallback, useEffect } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { isTauriEnvironment } from "@/lib/tauriEnv";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "error"
  | "up-to-date";

interface UpdateInfo {
  version: string;
  body: string;
  date: string;
}

interface UpdaterState {
  status: UpdateStatus;
  updateInfo: UpdateInfo | null;
  downloadProgress: number;
  error: string | null;
}

interface UseUpdaterOptions {
  autoCheckOnMount?: boolean;
  initialCheckDelayMs?: number;
}

export function useUpdater(options: UseUpdaterOptions = {}) {
  const autoCheckOnMount = options.autoCheckOnMount ?? true;
  const initialCheckDelayMs = options.initialCheckDelayMs ?? 5000;

  const [state, setState] = useState<UpdaterState>({
    status: "idle",
    updateInfo: null,
    downloadProgress: 0,
    error: null,
  });
  const [update, setUpdate] = useState<Update | null>(null);

  const checkForUpdates = useCallback(async () => {
    if (!isTauriEnvironment()) {
      return;
    }

    console.info("[updater] checking for updates...");
    setState((prev) => ({ ...prev, status: "checking", error: null }));

    try {
      const updateResult = await check();

      if (updateResult) {
        console.info(
          `[updater] update available: current=${updateResult.currentVersion}, latest=${updateResult.version}`,
        );
        setUpdate(updateResult);
        setState((prev) => ({
          ...prev,
          status: "available",
          updateInfo: {
            version: updateResult.version,
            body: updateResult.body ?? "",
            date: updateResult.date ?? "",
          },
        }));
      } else {
        console.info("[updater] no updates available");
        setState((prev) => ({
          ...prev,
          status: "up-to-date",
          updateInfo: null,
        }));
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("[updater] check failed:", errorMessage);
      setState((prev) => ({
        ...prev,
        status: "error",
        error: errorMessage,
      }));
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    if (!update) return;

    setState((prev) => ({ ...prev, status: "downloading", downloadProgress: 0 }));

    let downloaded = 0;
    let contentLength = 0;

    try {
      // Download with progress tracking
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = (event.data as { contentLength?: number }).contentLength ?? 0;
            downloaded = 0;
            setState((prev) => ({ ...prev, downloadProgress: 0 }));
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            const progress = contentLength > 0
              ? Math.round((downloaded / contentLength) * 100)
              : 0;
            setState((prev) => ({
              ...prev,
              downloadProgress: Math.min(progress, 100),
            }));
            break;
          case "Finished":
            setState((prev) => ({ ...prev, downloadProgress: 100, status: "ready" }));
            break;
        }
      });

      setState((prev) => ({ ...prev, status: "ready" }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setState((prev) => ({
        ...prev,
        status: "error",
        error: errorMessage,
      }));
    }
  }, [update]);

  const restartApp = useCallback(async () => {
    try {
      await relaunch();
    } catch (err) {
      console.error("Failed to relaunch:", err);
    }
  }, []);

  const applyUpdateAndRestart = useCallback(async () => {
    if (!isTauriEnvironment()) {
      return;
    }

    // If already installed and waiting for restart, just relaunch.
    if (state.status === "ready") {
      await restartApp();
      return;
    }

    if (!update) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: "No update payload is available",
      }));
      return;
    }

    setState((prev) => ({ ...prev, status: "downloading", downloadProgress: 0, error: null }));

    let downloaded = 0;
    let contentLength = 0;

    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = (event.data as { contentLength?: number }).contentLength ?? 0;
            downloaded = 0;
            setState((prev) => ({ ...prev, downloadProgress: 0 }));
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            const progress = contentLength > 0
              ? Math.round((downloaded / contentLength) * 100)
              : 0;
            setState((prev) => ({
              ...prev,
              downloadProgress: Math.min(progress, 100),
            }));
            break;
          case "Finished":
            setState((prev) => ({ ...prev, downloadProgress: 100, status: "ready" }));
            break;
        }
      });

      setState((prev) => ({ ...prev, status: "ready" }));
      await restartApp();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setState((prev) => ({
        ...prev,
        status: "error",
        error: errorMessage,
      }));
    }
  }, [restartApp, state.status, update]);

  // Check for updates on mount (optional: can be disabled)
  useEffect(() => {
    if (!isTauriEnvironment()) {
      return;
    }
    if (!autoCheckOnMount) {
      return;
    }

    // Delay initial check to avoid blocking app startup
    const timer = setTimeout(() => {
      checkForUpdates();
    }, initialCheckDelayMs);
    return () => clearTimeout(timer);
  }, [autoCheckOnMount, checkForUpdates, initialCheckDelayMs]);

  return {
    ...state,
    checkForUpdates,
    downloadAndInstall,
    restartApp,
    applyUpdateAndRestart,
  };
}
