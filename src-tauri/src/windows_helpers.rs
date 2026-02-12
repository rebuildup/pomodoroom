//! Windows-specific helper functions for DWM (Desktop Window Manager) integration.
//!
//! On Windows 11, this module enables rounded corners for custom title bars
//! by using the DWMWA_WINDOW_CORNER_PREFERENCE attribute.

#[cfg(windows)]
use windows::Win32::Foundation::HWND;

/// DWM window corner preference attribute
#[cfg(windows)]
const DWMWA_WINDOW_CORNER_PREFERENCE: u32 = 33;

/// DWM window corner preference values
#[cfg(windows)]
#[repr(i32)]
pub enum DwmWindowCornerPreference {
    Default = 0,
    DoNotRound = 1,
    Round = 2,
    RoundSmall = 3,
}
