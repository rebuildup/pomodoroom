export type TimerMode = "pomodoro" | "shortBreak" | "longBreak";

export type TimerStatus = "idle" | "running" | "paused";

export interface TimerSettings {
  pomodoro: number;
  shortBreak: number;
  longBreak: number;
  longBreakInterval: number;
  autoStartBreaks: boolean;
  autoStartPomodoros: boolean;
}

export const DEFAULT_SETTINGS: TimerSettings = {
  pomodoro: 25,
  shortBreak: 5,
  longBreak: 15,
  longBreakInterval: 4,
  autoStartBreaks: false,
  autoStartPomodoros: false,
};

export const MODE_LABELS: Record<TimerMode, string> = {
  pomodoro: "Pomodoro",
  shortBreak: "Short Break",
  longBreak: "Long Break",
};

export const MODE_COLORS: Record<TimerMode, string> = {
  pomodoro: "var(--color-pomodoro)",
  shortBreak: "var(--color-short-break)",
  longBreak: "var(--color-long-break)",
};
