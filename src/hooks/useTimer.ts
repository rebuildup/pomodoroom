import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { TimerMode, TimerStatus, TimerSettings } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { playAlarmSound } from "@/lib/audio";

const STORAGE_KEY_SETTINGS = "pomodoroom-settings";
const STORAGE_KEY_SESSIONS = "pomodoroom-sessions";

function loadSettings(): TimerSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (saved) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    }
  } catch {
    // ignore parse errors
  }
  return DEFAULT_SETTINGS;
}

function loadSessions(): number {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_SESSIONS);
    if (saved) return Number.parseInt(saved, 10);
  } catch {
    // ignore
  }
  return 0;
}

function getDuration(mode: TimerMode, settings: TimerSettings): number {
  switch (mode) {
    case "pomodoro":
      return settings.pomodoro * 60;
    case "shortBreak":
      return settings.shortBreak * 60;
    case "longBreak":
      return settings.longBreak * 60;
  }
}

export function useTimer() {
  const [settings, setSettings] = useState<TimerSettings>(loadSettings);
  const [mode, setModeRaw] = useState<TimerMode>("pomodoro");
  const [status, setStatus] = useState<TimerStatus>("idle");
  const [timeLeft, setTimeLeft] = useState(() =>
    getDuration("pomodoro", loadSettings()),
  );
  const [completedSessions, setCompletedSessions] =
    useState<number>(loadSessions);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  const totalTime = useMemo(
    () => getDuration(mode, settings),
    [mode, settings],
  );

  const progress = useMemo(() => {
    if (totalTime === 0) return 0;
    return 1 - timeLeft / totalTime;
  }, [timeLeft, totalTime]);

  // Persist settings
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  }, [settings]);

  // Persist sessions
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SESSIONS, String(completedSessions));
  }, [completedSessions]);

  // Update document title
  useEffect(() => {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const timeStr = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    const modeStr =
      mode === "pomodoro"
        ? "Focus"
        : mode === "shortBreak"
          ? "Break"
          : "Long Break";
    document.title =
      status === "idle" ? "Pomodoroom" : `${timeStr} - ${modeStr}`;

    return () => {
      document.title = "Pomodoroom";
    };
  }, [timeLeft, mode, status]);

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const advanceMode = useCallback(() => {
    if (mode === "pomodoro") {
      const newSessions = completedSessions + 1;
      setCompletedSessions(newSessions);

      if (newSessions % settings.longBreakInterval === 0) {
        setModeRaw("longBreak");
        setTimeLeft(getDuration("longBreak", settings));
      } else {
        setModeRaw("shortBreak");
        setTimeLeft(getDuration("shortBreak", settings));
      }

      if (settings.autoStartBreaks) {
        setStatus("running");
      } else {
        setStatus("idle");
      }
    } else {
      setModeRaw("pomodoro");
      setTimeLeft(getDuration("pomodoro", settings));

      if (settings.autoStartPomodoros) {
        setStatus("running");
      } else {
        setStatus("idle");
      }
    }
  }, [mode, completedSessions, settings]);

  // Timer interval
  useEffect(() => {
    clearTimer();

    if (status !== "running") return;

    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearTimer();
          playAlarmSound();
          // Use setTimeout to avoid state updates during render
          setTimeout(() => advanceMode(), 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return clearTimer;
  }, [status, clearTimer, advanceMode]);

  const start = useCallback(() => {
    setStatus("running");
  }, []);

  const pause = useCallback(() => {
    setStatus("paused");
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    setStatus("idle");
    setTimeLeft(getDuration(mode, settings));
  }, [mode, settings, clearTimer]);

  const skip = useCallback(() => {
    clearTimer();
    advanceMode();
  }, [clearTimer, advanceMode]);

  const setMode = useCallback(
    (newMode: TimerMode) => {
      clearTimer();
      setModeRaw(newMode);
      setStatus("idle");
      setTimeLeft(getDuration(newMode, settings));
    },
    [settings, clearTimer],
  );

  const updateSettings = useCallback(
    (newSettings: TimerSettings) => {
      setSettings(newSettings);
      // Reset current timer if idle
      if (statusRef.current === "idle") {
        setTimeLeft(getDuration(mode, newSettings));
      }
    },
    [mode],
  );

  const resetSessions = useCallback(() => {
    setCompletedSessions(0);
  }, []);

  return {
    mode,
    status,
    timeLeft,
    totalTime,
    progress,
    completedSessions,
    settings,
    start,
    pause,
    reset,
    skip,
    setMode,
    updateSettings,
    resetSessions,
  };
}
