/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Muted color palette for light/dark themes (not too strong)
      colors: {
        // Light theme palette
        light: {
          bg: '#FAFAFA',       // Subtle off-white background
          surface: '#FFFFFF',   // Pure white for cards/panels
          border: '#E5E5E5',    // Subtle border
          text: {
            primary: '#1A1A1A',   // Near black for primary text
            secondary: '#6B7280', // Gray for secondary
            muted: '#9CA3AF',     // Lighter gray for hints
          },
          accent: {
            primary: '#3B82F6',   // Muted blue
            secondary: '#10B981', // Muted green
            warning: '#F59E0B',   // Muted amber
            danger: '#EF4444',    // Muted red
          },
        },
        // Dark theme palette
        dark: {
          bg: '#1A1A1A',       // Near black background
          surface: '#242424',   // Slightly lighter for cards/panels
          border: '#333333',    // Subtle border
          text: {
            primary: '#F5F5F5',   // Near white for primary
            secondary: '#A3A3A3', // Gray for secondary
            muted: '#737373',     // Darker gray for hints
          },
          accent: {
            primary: '#60A5FA',   // Muted blue (lighter for dark bg)
            secondary: '#34D399', // Muted green
            warning: '#FBBF24',   // Muted amber
            danger: '#F87171',    // Muted red
          },
        },
        // Status colors (common across themes)
        status: {
          active: '#22C55E',     // Green
          paused: '#F59E0B',     // Amber
          idle: '#6B7280',       // Gray
        },
      },
      // Limited rounded corners (only where necessary)
      borderRadius: {
        'none': '0px',
        'sm': '2px',   // Minimal for small elements
        'DEFAULT': '4px', // Default for cards/panels
        'md': '6px',   // For larger containers
        'lg': '8px',   // For major sections
      },
      // Responsive breakpoints for layout structure
      screens: {
        'xs': '320px',   // Float timer window
        'sm': '640px',   // Small panel
        'md': '768px',   // Tablet
        'lg': '1024px',  // Desktop (main window)
        'xl': '1280px',  // Wide desktop
        'float': '280px', // Float timer specific
      },
      // Typography scale following SHIG readability principles
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
      },
      // Spacing scale for consistent layouts
      spacing: {
        '18': '4.5rem',  // For timeline gaps
        '72': '18rem',   // For main sections
      },
      // Shadows (minimal, flat design)
      boxShadow: {
        'sm': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        'DEFAULT': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        'md': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      },
      // Z-index scale for layering
      zIndex: {
        'dropdown': 1000,
        'sticky': 1020,
        'modal': 1040,
        'toast': 1060,
        'float': 2000, // Float timer above all
      },
    },
  },
  darkMode: 'class', // Enable manual dark mode toggle
  plugins: [],
}
