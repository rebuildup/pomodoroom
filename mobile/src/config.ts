// mobile/src/config.ts
export const GOOGLE_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? "";

export const GCAL_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
];

export const CALENDAR_NAMES = {
  tasks: "pomodoroom-tasks",
  projects: "pomodoroom-projects",
} as const;
