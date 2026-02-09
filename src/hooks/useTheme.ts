import { useEffect, useState } from 'react';

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

/**
 * Theme hook for managing light/dark mode
 * @returns Current theme and toggle function
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = getSavedTheme();
    return saved ?? DEFAULT_THEME;
  });

  const [systemTheme, setSystemTheme] = useState<Theme>(getSystemTheme());

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      const newSystemTheme = e.matches ? 'dark' : 'light';
      setSystemTheme(newSystemTheme);

      // Only apply system theme if user hasn't set a preference
      if (!getSavedTheme()) {
        setThemeState(newSystemTheme);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Apply theme to document whenever it changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  /**
   * Set theme and save to localStorage
   */
  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    saveTheme(newTheme);
  };

  /**
   * Toggle between light and dark themes
   */
  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  /**
   * Reset to system theme preference
   */
  const resetToSystem = () => {
    localStorage.removeItem(THEME_KEY);
    setThemeState(systemTheme);
  };

  return {
    theme,
    systemTheme,
    setTheme,
    toggleTheme,
    resetToSystem,
    isSystem: !getSavedTheme(),
  };
}
