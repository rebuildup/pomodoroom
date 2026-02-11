import { useEffect, useSyncExternalStore } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from '@/lib/tauriEnv';

export type Theme = 'light' | 'dark';

const DEFAULT_THEME: Theme = 'light';

/**
 * Get system theme preference
 */
function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Get saved theme from Tauri Config (async)
 */
async function getSavedTheme(): Promise<Theme | null> {
  if (!isTauriEnvironment()) {
    return null;
  }

  try {
    const rawValue = await invoke<string>('cmd_config_get', { key: 'ui.dark_mode' });
    if (rawValue === 'true') return 'dark';
    if (rawValue === 'false') return 'light';
  } catch (error) {
    console.error('[useTheme] Failed to load theme from config:', error);
  }
  return null;
}

/**
 * Save theme to Tauri Config (async)
 */
async function saveTheme(theme: Theme): Promise<void> {
  if (!isTauriEnvironment()) {
    return;
  }

  try {
    await invoke('cmd_config_set', { 
      key: 'ui.dark_mode', 
      value: theme === 'dark' ? 'true' : 'false'
    });
  } catch (error) {
    console.error('[useTheme] Failed to save theme to config:', error);
  }
}

async function clearSavedTheme(): Promise<void> {
  if (!isTauriEnvironment()) {
    return;
  }

  try {
    // Reset to default (light mode = false)
    await invoke('cmd_config_set', { 
      key: 'ui.dark_mode', 
      value: 'false'
    });
  } catch (error) {
    console.error('[useTheme] Failed to clear theme:', error);
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
  isLoading: boolean;
};

const listeners = new Set<() => void>();

async function readInitialTheme(): Promise<ThemeState> {
  if (typeof window === 'undefined') {
    return { theme: DEFAULT_THEME, systemTheme: DEFAULT_THEME, isSystem: true, isLoading: false };
  }
  const systemTheme = getSystemTheme();
  const saved = await getSavedTheme();
  const theme = saved ?? systemTheme ?? DEFAULT_THEME;
  return { theme, systemTheme, isSystem: !saved, isLoading: false };
}

let state: ThemeState = {
  theme: DEFAULT_THEME,
  systemTheme: DEFAULT_THEME,
  isSystem: true,
  isLoading: true,
};

// Load initial theme asynchronously
if (typeof document !== 'undefined') {
  readInitialTheme().then(initialState => {
    state = initialState;
    applyTheme(state.theme);
    emitChange();
  }).catch(error => {
    console.error('[useTheme] Failed to load initial theme:', error);
    state = { ...state, isLoading: false };
    emitChange();
  });
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
    saveTheme(next); // Fire-and-forget async
  }
  emitChange();
}

async function setSystemThemeInternal(nextSystem: Theme) {
  const saved = await getSavedTheme();
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

  const { theme, systemTheme, isSystem, isLoading } = snapshot;

  /**
   * Set theme and save to Tauri Config
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
    clearSavedTheme(); // Fire-and-forget async
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
    isLoading,
  };
}
