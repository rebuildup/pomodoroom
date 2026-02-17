/**
 * Material 3 Icon Component
 *
 * Wraps Material Symbols Outlined with M3 styling.
 * Supports size, weight, grade, and optical size control.
 *
 * Reference: https://fonts.google.com/icons
 * Reference: https://m3.material.io/styles/icons/overview
 */

import React from 'react';

// Material Symbols icon names (subset - add more as needed)
export type MSIconName =
  // Navigation
  | 'arrow_back'
  | 'arrow_forward'
  | 'arrow_upward'
  | 'arrow_downward'
  | 'chevron_left'
  | 'chevron_right'
  | 'home'
  | 'menu'
  | 'menu_open'
  | 'more_vert'
  | 'more_horiz'
  | 'expand_more'
  | 'expand_less'
  // Action
  | 'add'
  | 'check'
  | 'check_circle'
  | 'check_circle_outline'
  | 'radio_button_checked'
  | 'circle'
  | 'close'
  | 'delete'
  | 'edit'
  | 'download'
  | 'upload'
  | 'search'
  | 'settings'
  | 'refresh'
  | 'play_arrow'
  | 'pause'
  | 'skip_next'
  | 'skip_previous'
  | 'repeat'
  | 'replay'
  | 'link'
  | 'link_off'
  | 'open_in_new'
  // Communication
  | 'wifi'
  | 'wifi_off'
  | 'notifications'
  | 'notifications_none'
  | 'notifications_off'
  | 'volume_up'
  | 'volume_off'
  // Content
  | 'add_circle'
  | 'flag'
  | 'lock'
  | 'free_breakfast'
  | 'folder'
  | 'folder_open'
  | 'description'
  | 'label'
  | 'tag'
  | 'inbox'
  | 'archive'
  // Editor
  | 'hashtag'
  | 'schedule'
  | 'event'
  | 'today'
  | 'timer'
  | 'watch_later'
  | 'calendar_month'
  | 'drag_indicator'
  // Image
  | 'fullscreen'
  | 'fullscreen_exit'
  // Action (continued)
  | 'save'
  // Social
  | 'info'
  | 'warning'
  | 'error'
  | 'auto_awesome'
  | 'bolt'
  | 'award'
  | 'self_improvement'
  | 'spa'
  // Device
  | 'keyboard'
  | 'monitor'
  // Hardware
  | 'watch'
  | 'battery_1_bar'
  | 'battery_2_bar'
  | 'battery_3_bar'
  | 'battery_full'
  // Navigation
  | 'swap_vert'
  // Editor (continued)
  | 'bar_chart'
  | 'analytics'
  | 'trending_up'
  | 'timeline'
  | 'anchor'
  | 'note'
  | 'music_note'
  | 'smart_display'
  | 'terminal'
  | 'view_column'
  | 'filter_list'
  | 'category'
  // Communication (continued)
  | 'history'
  // Social (continued)
  | 'local_fire_department'
  // Image (continued)
  | 'dark_mode'
  | 'light_mode'
  | 'radio_button_unchecked'
  | 'update'
  | 'add_circle_outline'
  | 'remove_circle_outline'
  | 'done_all'
  | 'update_disabled'
  | 'not_started'
  | 'pending'
  | 'autorenew'
  | 'science'
  | 'tune'
  | 'layers'
  | 'check_box'
  | 'check_box_outline'
  | 'checklist'
  | 'lightbulb';

export interface IconProps {
  /**
   * Material Symbol icon name
   */
  name: MSIconName;

  /**
   * Icon size in CSS units (default: 24px)
   * M3 recommends: 20, 24, 32, 40, 48px
   */
  size?: string | number;

  /**
   * CSS class for additional styling
   */
  className?: string;

  /**
   * Icon color (overrides inherited color)
   */
  color?: string;

  /**
   * CSS style properties for custom styling
   */
  style?: React.CSSProperties;

  /**
   * Icon weight (default: 400)
   * Range: 100-700
   */
  weight?: 100 | 200 | 300 | 400 | 500 | 600 | 700;

  /**
   * Fill grade (default: 0)
   * 0 = outlined, 1 = filled
   */
  fill?: 0 | 1;

  /**
   * Optical size (default: 24)
   * Adjusts detail level for different sizes
   */
  opticalSize?: 20 | 24 | 40 | 48;

  /**
   * Whether to use filled variant
   * Shorthand for fill={1}
   */
  filled?: boolean;

  /**
   * Opacity of the icon (0-1)
   */
  opacity?: number;
}

/**
 * Material 3 Icon Component
 *
 * Displays Material Symbols Outlined icons with M3 styling.
 *
 * @example
 * ```tsx
 * <Icon name="play_arrow" size={32} />
 * <Icon name="check" filled color="var(--md-ref-color-primary)" />
 * <Icon name="settings" size="20px" weight={500} />
 * ```
 */
export const Icon: React.FC<IconProps> = React.memo(({
  name,
  size = 24,
  className = '',
  color,
  weight = 400,
  fill = 0,
  opticalSize = 24,
  filled = false,
  opacity,
}) => {
  const style: React.CSSProperties = {
    fontSize: typeof size === 'number' ? `${size}px` : size,
    fontFamily: '"Material Symbols Outlined", serif',
    fontVariationSettings: `
      'FILL' ${filled ? 1 : fill},
      'wght' ${weight},
      'GRAD' 0,
      'opsz' ${opticalSize}
    `.trim().replace(/\s+/g, ' '),
    color: color || undefined,
    opacity: opacity,
    userSelect: 'none',
    fontFeatureSettings: "'liga' 1",
  };

  return (
    <span
      className={`material-symbols-outlined ${className}`.trim()}
      style={style}
    >
      {name}
    </span>
  );
}, (prevProps, nextProps) => {
  // Only re-render if props actually change
  return (
    prevProps.name === nextProps.name &&
    prevProps.size === nextProps.size &&
    prevProps.className === nextProps.className &&
    prevProps.color === nextProps.color &&
    prevProps.weight === nextProps.weight &&
    prevProps.fill === nextProps.fill &&
    prevProps.opticalSize === nextProps.opticalSize &&
    prevProps.filled === nextProps.filled
  );
});

Icon.displayName = "Icon";

// ─────────────────────────────────────────────────────────────────────────────
// Lucide to Material Symbols Mapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lucide icon names to Material Symbols mapping
 */
export const LUCIDE_TO_MS: Record<string, MSIconName> = {
  // Navigation
  'ChevronLeft': 'chevron_left',
  'ChevronRight': 'chevron_right',
  'ChevronDown': 'expand_more',
  'ChevronUp': 'expand_less',
  'ArrowLeft': 'arrow_back',
  'ArrowRight': 'arrow_forward',
  'ArrowUp': 'arrow_upward',
  'ArrowDown': 'arrow_downward',

  // Action
  'Check': 'check',
  'X': 'close',
  'Trash2': 'delete',
  'Edit2': 'edit',
  'Edit3': 'edit',
  'Search': 'search',
  'Settings': 'settings',
  'RefreshCw': 'refresh',
  'Play': 'play_arrow',
  'Pause': 'pause',
  'SkipForward': 'skip_next',
  'RotateCcw': 'repeat',
  'Link2': 'link',
  'Unlink': 'link_off',
  'Plus': 'add',
  'MoreVertical': 'more_vert',

  // Communication
  'Wifi': 'wifi',
  'WifiOff': 'wifi_off',

  // Content
  'Hash': 'tag',
  'Flag': 'flag',
  'FolderOpen': 'folder_open',
  'FileText': 'description',
  'Target': 'flag',
  'Calendar': 'schedule',

  // Editor
  'Clock': 'schedule',
  'Timer': 'timer',
  'Watch': 'watch_later',

  // Social
  'Info': 'info',
  'AlertCircle': 'warning',
  'Sparkles': 'auto_awesome',
  'Zap': 'bolt',

  // Device
  'Keyboard': 'keyboard',
  'Monitor': 'monitor',
};

/**
 * Convert Lucide icon name to Material Symbol name
 * Returns the original name if no mapping found
 */
export function lucideToMs(lucideName: string): MSIconName {
  return LUCIDE_TO_MS[lucideName] || lucideName as MSIconName;
}

export default Icon;
