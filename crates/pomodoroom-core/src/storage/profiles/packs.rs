//! Built-in profile packs with curated presets.
//!
//! These profiles are designed based on productivity research
//! and common work patterns.

use super::types::{ProfileConfig, ProfilePack};
use crate::storage::{NotificationsConfig, ScheduleConfig, UiConfig, YouTubeConfig};

/// Returns all built-in profile packs.
pub fn get_builtin_packs() -> Vec<ProfilePack> {
    vec![
        deep_work_pack(),
        admin_pack(),
        creative_pack(),
        balanced_pack(),
        sprint_pack(),
        code_review_pack(),
    ]
}

/// Find a built-in pack by ID.
pub fn find_pack(id: &str) -> Option<ProfilePack> {
    get_builtin_packs().into_iter().find(|p| p.id == id)
}

/// Get pack IDs for listing.
pub fn pack_ids() -> Vec<&'static str> {
    vec!["deep-work", "admin", "creative", "balanced", "sprint", "code-review"]
}

// ============================================================================
// BUILT-IN PACKS
// ============================================================================

/// Deep Work Profile
///
/// Optimized for extended focus sessions with minimal interruptions.
/// Based on Cal Newport's Deep Work methodology.
fn deep_work_pack() -> ProfilePack {
    ProfilePack {
        id: "deep-work".to_string(),
        name: "Deep Work".to_string(),
        description: "Extended focus for cognitively demanding tasks".to_string(),
        rationale: indoc::indoc! {"
            Based on Cal Newport's Deep Work research, this profile uses
            longer focus periods (50 min) to achieve the cognitive depth
            needed for complex problem-solving and creative work.

            The 10-minute short breaks provide enough time for mental
            recovery without breaking the flow state. The 3-pomodoro
            cycle before long breaks allows for sustained deep work
            sessions of about 3 hours total.

            Best for: Programming, writing, research, strategic thinking
        "}
        .to_string(),
        category: "focus".to_string(),
        icon: "brain".to_string(),
        config: ProfileConfig {
            schedule: Some(ScheduleConfig {
                focus_duration: 50,
                short_break: 10,
                long_break: 30,
                pomodoros_before_long_break: 3,
            }),
            notifications: Some(NotificationsConfig {
                enabled: true,
                volume: 30,
                vibration: false,
                custom_sound: None,
            }),
            ui: Some(UiConfig {
                dark_mode: true,
                highlight_color: "#6366f1".to_string(), // Indigo
                sticky_widget_size: 200,
                youtube_widget_width: 350,
            }),
            youtube: Some(YouTubeConfig {
                autoplay_on_focus: true,
                pause_on_break: true,
                default_volume: 30,
                loop_enabled: true,
            }),
            window_pinned: Some(true),
            window_float: Some(false),
            tray_enabled: Some(true),
            auto_advance: Some(false),
            shortcuts: None,
        },
    }
}

/// Admin Profile
///
/// For handling emails, meetings, and routine tasks.
/// Shorter cycles for quick task switching.
fn admin_pack() -> ProfilePack {
    ProfilePack {
        id: "admin".to_string(),
        name: "Admin".to_string(),
        description: "Quick cycles for emails, meetings, and routine tasks".to_string(),
        rationale: indoc::indoc! {"
            Administrative work benefits from shorter cycles that
            accommodate frequent interruptions and task switching.

            The 15-minute focus periods are ideal for processing emails,
            attending meetings, or completing small tasks. Quick 3-minute
            breaks maintain momentum between tasks.

            Auto-advance is enabled to keep things moving during busy
            administrative periods.

            Best for: Email management, meetings, documentation, quick tasks
        "}
        .to_string(),
        category: "flexible".to_string(),
        icon: "clipboard".to_string(),
        config: ProfileConfig {
            schedule: Some(ScheduleConfig {
                focus_duration: 15,
                short_break: 3,
                long_break: 15,
                pomodoros_before_long_break: 6,
            }),
            notifications: Some(NotificationsConfig {
                enabled: true,
                volume: 70,
                vibration: true,
                custom_sound: None,
            }),
            ui: Some(UiConfig {
                dark_mode: true,
                highlight_color: "#10b981".to_string(), // Emerald
                sticky_widget_size: 180,
                youtube_widget_width: 300,
            }),
            youtube: Some(YouTubeConfig {
                autoplay_on_focus: false,
                pause_on_break: true,
                default_volume: 20,
                loop_enabled: false,
            }),
            window_pinned: Some(false),
            window_float: Some(false),
            tray_enabled: Some(true),
            auto_advance: Some(true),
            shortcuts: None,
        },
    }
}

/// Creative Profile
///
/// Balanced sessions with flexibility for creative flow.
fn creative_pack() -> ProfilePack {
    ProfilePack {
        id: "creative".to_string(),
        name: "Creative".to_string(),
        description: "Balanced sessions for design and creative work".to_string(),
        rationale: indoc::indoc! {"
            Creative work requires a balance between structure and
            flexibility. The 40-minute focus blocks provide enough
            time to get into a creative flow while allowing for
            natural creative breaks.

            Softer notification sounds and a calming purple accent
            create a conducive environment for creative thinking.
            YouTube integration is set to support background music
            for creative sessions.

            Best for: Design, art, music production, brainstorming
        "}
        .to_string(),
        category: "balanced".to_string(),
        icon: "palette".to_string(),
        config: ProfileConfig {
            schedule: Some(ScheduleConfig {
                focus_duration: 40,
                short_break: 8,
                long_break: 20,
                pomodoros_before_long_break: 4,
            }),
            notifications: Some(NotificationsConfig {
                enabled: true,
                volume: 40,
                vibration: true,
                custom_sound: None,
            }),
            ui: Some(UiConfig {
                dark_mode: true,
                highlight_color: "#8b5cf6".to_string(), // Purple
                sticky_widget_size: 220,
                youtube_widget_width: 400,
            }),
            youtube: Some(YouTubeConfig {
                autoplay_on_focus: true,
                pause_on_break: true,
                default_volume: 25,
                loop_enabled: true,
            }),
            window_pinned: Some(false),
            window_float: Some(false),
            tray_enabled: Some(true),
            auto_advance: Some(false),
            shortcuts: None,
        },
    }
}

/// Balanced Profile
///
/// Standard Pomodoro technique with moderate settings.
fn balanced_pack() -> ProfilePack {
    ProfilePack {
        id: "balanced".to_string(),
        name: "Balanced".to_string(),
        description: "Classic Pomodoro with balanced timing".to_string(),
        rationale: indoc::indoc! {"
            The traditional Pomodoro Technique with 25-minute focus
            periods and 5-minute breaks. This time-tested approach
            works well for general productivity and is recommended
            for beginners.

            The 4-pomodoro cycle before long breaks provides about
            2 hours of total focus time with appropriate rest.

            Best for: General productivity, studying, any mixed work
        "}
        .to_string(),
        category: "balanced".to_string(),
        icon: "scale".to_string(),
        config: ProfileConfig {
            schedule: Some(ScheduleConfig {
                focus_duration: 25,
                short_break: 5,
                long_break: 15,
                pomodoros_before_long_break: 4,
            }),
            notifications: Some(NotificationsConfig {
                enabled: true,
                volume: 50,
                vibration: true,
                custom_sound: None,
            }),
            ui: Some(UiConfig {
                dark_mode: true,
                highlight_color: "#3b82f6".to_string(), // Blue
                sticky_widget_size: 220,
                youtube_widget_width: 400,
            }),
            youtube: Some(YouTubeConfig {
                autoplay_on_focus: true,
                pause_on_break: true,
                default_volume: 50,
                loop_enabled: true,
            }),
            window_pinned: Some(false),
            window_float: Some(false),
            tray_enabled: Some(true),
            auto_advance: Some(true),
            shortcuts: None,
        },
    }
}

/// Sprint Profile
///
/// Intense short bursts for deadline-driven work.
fn sprint_pack() -> ProfilePack {
    ProfilePack {
        id: "sprint".to_string(),
        name: "Sprint".to_string(),
        description: "Intense focus sprints for deadline-driven work".to_string(),
        rationale: indoc::indoc! {"
            When deadlines loom, this profile maximizes output with
            longer focus periods and minimal breaks. The 60-minute
            sprints are intense but effective for getting things done.

            Use with caution - this profile is not sustainable for
            extended periods and should be followed by longer recovery.

            Best for: Deadline crunches, urgent deliverables, final pushes
        "}
        .to_string(),
        category: "focus".to_string(),
        icon: "zap".to_string(),
        config: ProfileConfig {
            schedule: Some(ScheduleConfig {
                focus_duration: 60,
                short_break: 5,
                long_break: 45,
                pomodoros_before_long_break: 2,
            }),
            notifications: Some(NotificationsConfig {
                enabled: true,
                volume: 80,
                vibration: true,
                custom_sound: None,
            }),
            ui: Some(UiConfig {
                dark_mode: true,
                highlight_color: "#ef4444".to_string(), // Red
                sticky_widget_size: 200,
                youtube_widget_width: 300,
            }),
            youtube: Some(YouTubeConfig {
                autoplay_on_focus: false,
                pause_on_break: false,
                default_volume: 10,
                loop_enabled: true,
            }),
            window_pinned: Some(true),
            window_float: Some(false),
            tray_enabled: Some(true),
            auto_advance: Some(true),
            shortcuts: None,
        },
    }
}

/// Code Review Profile
///
/// Optimized for PR reviews and GitHub/Linear workflows.
/// Short cycles for quick review iterations.
fn code_review_pack() -> ProfilePack {
    ProfilePack {
        id: "code-review".to_string(),
        name: "Code Review".to_string(),
        description: "Short cycles for PR reviews and GitHub/Linear workflows".to_string(),
        rationale: indoc::indoc! {"
            Code review work benefits from shorter, focused sessions
            that allow for quick context switching between reviews,
            responses to comments, and small fixes.

            The 20-minute focus periods are ideal for reviewing
            pull requests, responding to review comments, and
            making small iterative changes. Quick 5-minute breaks
            maintain alertness for catching details.

            Auto-advance is enabled to keep the review process moving.

            Best for: Pull request reviews, GitHub/Linear workflows, pair programming
        "}
        .to_string(),
        category: "flexible".to_string(),
        icon: "git-pull-request".to_string(),
        config: ProfileConfig {
            schedule: Some(ScheduleConfig {
                focus_duration: 20,
                short_break: 5,
                long_break: 15,
                pomodoros_before_long_break: 6,
            }),
            notifications: Some(NotificationsConfig {
                enabled: true,
                volume: 60,
                vibration: true,
                custom_sound: None,
            }),
            ui: Some(UiConfig {
                dark_mode: true,
                highlight_color: "#f97316".to_string(), // Orange
                sticky_widget_size: 180,
                youtube_widget_width: 300,
            }),
            youtube: Some(YouTubeConfig {
                autoplay_on_focus: false,
                pause_on_break: true,
                default_volume: 15,
                loop_enabled: false,
            }),
            window_pinned: Some(false),
            window_float: Some(false),
            tray_enabled: Some(true),
            auto_advance: Some(true),
            shortcuts: None,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_packs_have_valid_ids() {
        let packs = get_builtin_packs();
        assert!(!packs.is_empty());

        for pack in &packs {
            assert!(!pack.id.is_empty());
            assert!(!pack.name.is_empty());
            assert!(!pack.description.is_empty());
            assert!(!pack.rationale.is_empty());
        }
    }

    #[test]
    fn find_pack_returns_correct_pack() {
        let pack = find_pack("deep-work");
        assert!(pack.is_some());
        assert_eq!(pack.unwrap().name, "Deep Work");

        let missing = find_pack("nonexistent");
        assert!(missing.is_none());
    }

    #[test]
    fn pack_ids_match_actual_packs() {
        let ids = pack_ids();
        let packs = get_builtin_packs();

        assert_eq!(ids.len(), packs.len());
        for id in ids {
            assert!(find_pack(id).is_some(), "Pack {} not found", id);
        }
    }

    #[test]
    fn deep_work_has_longer_focus() {
        let pack = find_pack("deep-work").unwrap();
        let schedule = pack.config.schedule.unwrap();
        assert!(schedule.focus_duration >= 45);
    }

    #[test]
    fn admin_has_shorter_focus() {
        let pack = find_pack("admin").unwrap();
        let schedule = pack.config.schedule.unwrap();
        assert!(schedule.focus_duration <= 20);
    }

    #[test]
    fn all_schedules_have_reasonable_values() {
        for pack in get_builtin_packs() {
            if let Some(schedule) = pack.config.schedule {
                assert!(schedule.focus_duration >= 10 && schedule.focus_duration <= 90);
                assert!(schedule.short_break >= 1 && schedule.short_break <= 20);
                assert!(schedule.long_break >= 10 && schedule.long_break <= 60);
                assert!(schedule.pomodoros_before_long_break >= 2
                    && schedule.pomodoros_before_long_break <= 8);
            }
        }
    }
}
