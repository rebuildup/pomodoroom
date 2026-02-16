//! Version compatibility checker for policy import/export.
//!
//! This module provides semantic versioning compatibility checks to ensure
//! safe import of policy bundles across different versions.

use std::fmt;

/// Result of comparing two versions for compatibility.
#[derive(Debug, Clone, PartialEq)]
pub enum Compatibility {
    /// Versions are fully compatible.
    Compatible,
    /// Import version is newer but still compatible (minor difference).
    /// Shows a warning to the user.
    MinorNewer {
        /// Current application version.
        current: String,
        /// Import file version.
        import: String,
    },
    /// Versions are incompatible (major difference).
    /// Import should be rejected or require migration.
    Incompatible {
        /// Current application version.
        current: String,
        /// Import file version.
        import: String,
        /// Hints for migrating or resolving the incompatibility.
        hints: Vec<String>,
    },
}

impl fmt::Display for Compatibility {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Compatibility::Compatible => write!(f, "Versions are compatible"),
            Compatibility::MinorNewer { current, import } => {
                write!(
                    f,
                    "Import version ({}) is newer than current ({}). \
                     Some features may not be available, but import should work.",
                    import, current
                )
            }
            Compatibility::Incompatible {
                current,
                import,
                hints,
            } => {
                writeln!(
                    f,
                    "Incompatible versions: current={}, import={}",
                    current, import
                )?;
                if !hints.is_empty() {
                    writeln!(f, "Migration hints:")?;
                    for hint in hints {
                        writeln!(f, "  - {}", hint)?;
                    }
                }
                Ok(())
            }
        }
    }
}

/// Parse a semver version string into (major, minor, patch).
///
/// # Examples
/// ```
/// assert_eq!(parse_version("1.2.3"), Some((1, 2, 3)));
/// assert_eq!(parse_version("invalid"), None);
/// ```
pub fn parse_version(version: &str) -> Option<(u32, u32, u32)> {
    let parts: Vec<&str> = version.split('.').collect();
    if parts.len() != 3 {
        return None;
    }

    let major = parts[0].parse::<u32>().ok()?;
    let minor = parts[1].parse::<u32>().ok()?;
    let patch = parts[2].parse::<u32>().ok()?;

    Some((major, minor, patch))
}

/// Check compatibility between current app version and import version.
///
/// # Compatibility Rules
/// - **Major mismatch** → Incompatible with migration hints
/// - **Minor newer import** → MinorNewer (warning, but import works)
/// - **Same major, older/same minor** → Compatible
/// - **Patch differences** → Compatible (ignored)
///
/// # Examples
/// ```
/// // Same version
/// assert!(matches!(check_compatibility("1.0.0", "1.0.0"), Compatibility::Compatible));
///
/// // Patch difference - compatible
/// assert!(matches!(check_compatibility("1.0.1", "1.0.0"), Compatibility::Compatible));
///
/// // Minor newer - warning
/// assert!(matches!(check_compatibility("1.0.0", "1.1.0"), Compatibility::MinorNewer { .. }));
///
/// // Major mismatch - incompatible
/// assert!(matches!(check_compatibility("1.0.0", "2.0.0"), Compatibility::Incompatible { .. }));
/// ```
pub fn check_compatibility(current: &str, import: &str) -> Compatibility {
    let current_ver = match parse_version(current) {
        Some(v) => v,
        None => {
            return Compatibility::Incompatible {
                current: current.to_string(),
                import: import.to_string(),
                hints: vec!["Invalid current version format".to_string()],
            }
        }
    };

    let import_ver = match parse_version(import) {
        Some(v) => v,
        None => {
            return Compatibility::Incompatible {
                current: current.to_string(),
                import: import.to_string(),
                hints: vec!["Invalid import version format".to_string()],
            }
        }
    };

    // Major version mismatch - incompatible
    if current_ver.0 != import_ver.0 {
        return Compatibility::Incompatible {
            current: current.to_string(),
            import: import.to_string(),
            hints: generate_migration_hints(current_ver.0, import_ver.0),
        };
    }

    // Import has newer minor version - warning
    if import_ver.1 > current_ver.1 {
        return Compatibility::MinorNewer {
            current: current.to_string(),
            import: import.to_string(),
        };
    }

    // Same major, same or older minor, any patch - compatible
    Compatibility::Compatible
}

/// Generate migration hints for major version incompatibility.
///
/// Provides helpful guidance based on the version difference direction.
fn generate_migration_hints(current_major: u32, import_major: u32) -> Vec<String> {
    let mut hints = Vec::new();

    if import_major > current_major {
        hints.push(format!(
            "The policy was created with a newer version (v{}.x.x). \
             Please update Pomodoroom to import this policy.",
            import_major
        ));
        hints.push(
            "Alternatively, manually review the policy JSON and adjust values as needed."
                .to_string(),
        );
    } else {
        hints.push(format!(
            "The policy was created with an older version (v{}.x.x). \
             Some fields may be missing or have different defaults.",
            import_major
        ));
        hints.push(
            "Try importing manually by creating a new policy with similar values.".to_string(),
        );
    }

    hints.push("Check the changelog for breaking changes between versions.".to_string());

    hints
}

#[cfg(test)]
mod tests {
    use super::*;

    // =========================================================================
    // parse_version tests
    // =========================================================================

    #[test]
    fn parse_version_valid_semver() {
        assert_eq!(parse_version("1.2.3"), Some((1, 2, 3)));
        assert_eq!(parse_version("0.0.0"), Some((0, 0, 0)));
        assert_eq!(parse_version("10.20.30"), Some((10, 20, 30)));
    }

    #[test]
    fn parse_version_invalid_format() {
        assert_eq!(parse_version("1.2"), None); // Missing patch
        assert_eq!(parse_version("1.2.3.4"), None); // Too many parts
        assert_eq!(parse_version("1"), None); // Only major
        assert_eq!(parse_version(""), None); // Empty string
        assert_eq!(parse_version("v1.2.3"), None); // With prefix
    }

    #[test]
    fn parse_version_non_numeric() {
        assert_eq!(parse_version("a.b.c"), None);
        assert_eq!(parse_version("1.2.x"), None);
        assert_eq!(parse_version("1.-2.3"), None);
    }

    // =========================================================================
    // check_compatibility tests
    // =========================================================================

    #[test]
    fn compatibility_same_version() {
        let result = check_compatibility("1.0.0", "1.0.0");
        assert_eq!(result, Compatibility::Compatible);
    }

    #[test]
    fn compatibility_patch_difference_compatible() {
        // Current newer patch
        let result = check_compatibility("1.0.1", "1.0.0");
        assert_eq!(result, Compatibility::Compatible);

        // Import newer patch
        let result = check_compatibility("1.0.0", "1.0.5");
        assert_eq!(result, Compatibility::Compatible);
    }

    #[test]
    fn compatibility_minor_difference_older_import_compatible() {
        // Import has older minor - compatible
        let result = check_compatibility("1.2.0", "1.1.0");
        assert_eq!(result, Compatibility::Compatible);

        let result = check_compatibility("1.5.0", "1.0.0");
        assert_eq!(result, Compatibility::Compatible);
    }

    #[test]
    fn compatibility_minor_newer_import_warning() {
        let result = check_compatibility("1.0.0", "1.1.0");
        assert!(matches!(
            result,
            Compatibility::MinorNewer {
                current: _,
                import: _
            }
        ));

        if let Compatibility::MinorNewer { current, import } = result {
            assert_eq!(current, "1.0.0");
            assert_eq!(import, "1.1.0");
        }
    }

    #[test]
    fn compatibility_minor_newer_with_patch_warning() {
        let result = check_compatibility("1.0.5", "1.2.0");
        assert!(matches!(
            result,
            Compatibility::MinorNewer {
                current: _,
                import: _
            }
        ));
    }

    #[test]
    fn compatibility_major_mismatch_incompatible() {
        let result = check_compatibility("1.0.0", "2.0.0");
        assert!(matches!(result, Compatibility::Incompatible { .. }));

        if let Compatibility::Incompatible {
            current,
            import,
            hints,
        } = result
        {
            assert_eq!(current, "1.0.0");
            assert_eq!(import, "2.0.0");
            assert!(!hints.is_empty());
        }
    }

    #[test]
    fn compatibility_major_downgrade_incompatible() {
        let result = check_compatibility("2.0.0", "1.0.0");
        assert!(matches!(result, Compatibility::Incompatible { .. }));

        if let Compatibility::Incompatible { hints, .. } = result {
            assert!(hints.iter().any(|h| h.contains("older version")));
        }
    }

    #[test]
    fn compatibility_invalid_current_version() {
        let result = check_compatibility("invalid", "1.0.0");
        assert!(matches!(result, Compatibility::Incompatible { .. }));

        if let Compatibility::Incompatible { hints, .. } = result {
            assert!(hints.iter().any(|h| h.contains("Invalid current version")));
        }
    }

    #[test]
    fn compatibility_invalid_import_version() {
        let result = check_compatibility("1.0.0", "bad-version");
        assert!(matches!(result, Compatibility::Incompatible { .. }));

        if let Compatibility::Incompatible { hints, .. } = result {
            assert!(hints.iter().any(|h| h.contains("Invalid import version")));
        }
    }

    // =========================================================================
    // Display trait tests
    // =========================================================================

    #[test]
    fn display_compatible() {
        let compat = Compatibility::Compatible;
        let output = format!("{}", compat);
        assert_eq!(output, "Versions are compatible");
    }

    #[test]
    fn display_minor_newer() {
        let compat = Compatibility::MinorNewer {
            current: "1.0.0".to_string(),
            import: "1.1.0".to_string(),
        };
        let output = format!("{}", compat);
        assert!(output.contains("1.1.0"));
        assert!(output.contains("1.0.0"));
        assert!(output.contains("newer"));
    }

    #[test]
    fn display_incompatible_with_hints() {
        let compat = Compatibility::Incompatible {
            current: "1.0.0".to_string(),
            import: "2.0.0".to_string(),
            hints: vec![
                "Update your application".to_string(),
                "Check changelog".to_string(),
            ],
        };
        let output = format!("{}", compat);
        assert!(output.contains("Incompatible"));
        assert!(output.contains("current=1.0.0"));
        assert!(output.contains("import=2.0.0"));
        assert!(output.contains("Update your application"));
        assert!(output.contains("Check changelog"));
    }

    // =========================================================================
    // generate_migration_hints tests
    // =========================================================================

    #[test]
    fn migration_hints_newer_import() {
        let hints = generate_migration_hints(1, 2);
        assert!(!hints.is_empty());
        assert!(hints.iter().any(|h| h.contains("newer version")));
        assert!(hints.iter().any(|h| h.contains("update") || h.contains("Update")));
    }

    #[test]
    fn migration_hints_older_import() {
        let hints = generate_migration_hints(2, 1);
        assert!(!hints.is_empty());
        assert!(hints.iter().any(|h| h.contains("older version")));
    }

    #[test]
    fn migration_hints_always_include_changelog_hint() {
        let hints = generate_migration_hints(1, 2);
        assert!(hints.iter().any(|h| h.contains("changelog")));

        let hints = generate_migration_hints(2, 1);
        assert!(hints.iter().any(|h| h.contains("changelog")));
    }

    // =========================================================================
    // Integration tests with POLICY_VERSION
    // =========================================================================

    #[test]
    fn compatibility_with_current_policy_version() {
        use crate::policy::POLICY_VERSION;

        // Same version should be compatible
        let result = check_compatibility(POLICY_VERSION, POLICY_VERSION);
        assert_eq!(result, Compatibility::Compatible);
    }

    #[test]
    fn compatibility_with_older_policy_version() {
        use crate::policy::POLICY_VERSION;

        // Import from same major, older minor should work
        let result = check_compatibility(POLICY_VERSION, "1.0.0");
        assert!(matches!(result, Compatibility::Compatible));
    }
}
