import { useEffect, useMemo, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'pomodoroom-theme';
const DEFAULT_THEME: Theme = 'light';

/**
 * Get system theme preference
 */
function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Get saved theme from localStorage
 */
function getSavedTheme(): Theme | null {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
  } catch {
    // localStorage not available
  }
  return null;
}

/**
 * Save theme to localStorage
 */
function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // localStorage not available
  }
}

function clearSavedTheme(): void {
  try {
    localStorage.removeItem(THEME_KEY);
  } catch {
    // ignore
  }
}

/**
 * Apply theme to document
 */
function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

// ---------------------------------------------------------------------------
// Global theme store
// ---------------------------------------------------------------------------

type ThemeState = {
  theme: Theme;
  systemTheme: Theme;
  // Whether the current theme is coming from the system (no saved preference).
  isSystem: boolean;
};

const listeners = new Set<() => void>();

function readInitialTheme(): ThemeState {
  if (typeof window === 'undefined') {
    return { theme: DEFAULT_THEME, systemTheme: DEFAULT_THEME, isSystem: true };
  }
  const systemTheme = getSystemTheme();
  const saved = getSavedTheme();
  const theme = saved ?? systemTheme ?? DEFAULT_THEME;
  return { theme, systemTheme, isSystem: !saved };
}

let state: ThemeState = readInitialTheme();

// Apply once on module load (browser/Tauri).
if (typeof document !== 'undefined') {
  try {
    applyTheme(state.theme);
  } catch {
    // ignore
  }
}

function emitChange() {
  for (const l of listeners) l();
}

function setThemeInternal(next: Theme, opts?: { persist?: boolean; isSystem?: boolean }) {
  const persist = opts?.persist ?? true;
  const isSystem = opts?.isSystem ?? (persist ? false : state.isSystem);
  state = { ...state, theme: next, isSystem };
  if (typeof document !== 'undefined') {
    applyTheme(next);
  }
  if (persist) {
    saveTheme(next);
  }
  emitChange();
}

function setSystemThemeInternal(nextSystem: Theme) {
  const saved = getSavedTheme();
  state = { ...state, systemTheme: nextSystem, isSystem: !saved };
  // If user has no preference saved, follow the system.
  if (!saved) {
    state = { ...state, theme: nextSystem };
    if (typeof document !== 'undefined') {
      applyTheme(nextSystem);
    }
  }
  emitChange();
}

/**
 * Theme hook for managing light/dark mode
 * @returns Current theme and toggle function
 */
export function useTheme() {
  const snapshot = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );

  const { theme, systemTheme, isSystem } = snapshot;

  /**
   * Set theme and save to localStorage
   */
  const setTheme = (newTheme: Theme) => {
    setThemeInternal(newTheme, { persist: true });
  };

  /**
   * Toggle between light and dark themes
   */
  const toggleTheme = () => {
    setThemeInternal(theme === 'light' ? 'dark' : 'light', { persist: true });
  };

  /**
   * Reset to system theme preference
   */
  const resetToSystem = () => {
    clearSavedTheme();
    setThemeInternal(systemTheme, { persist: false, isSystem: true });
  };

  // Listen for system theme changes (singleton).
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemThemeInternal(e.matches ? 'dark' : 'light');
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return {
    theme,
    systemTheme,
    setTheme,
    toggleTheme,
    resetToSystem,
    isSystem,
  };
}
