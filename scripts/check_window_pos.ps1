# Check and fix window position for Pomodoroom Desktop
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
}
public class Win32 {
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
}
"@

$process = Get-Process -Name "pomodoroom-desktop" -ErrorAction SilentlyContinue
if ($process -and $process.MainWindowHandle -ne 0) {
    $hWnd = $process.MainWindowHandle
    $rect = New-Object RECT
    [Win32]::GetWindowRect($hWnd, [ref]$rect) | Out-Null

    Write-Host "Window Rect:"
    Write-Host "  Left: $($rect.Left)"
    Write-Host "  Top: $($rect.Top)"
    Write-Host "  Right: $($rect.Right)"
    Write-Host "  Bottom: $($rect.Bottom)"
    Write-Host "  Width: $($rect.Right - $rect.Left)"
    Write-Host "  Height: $($rect.Bottom - $rect.Top)"

    # Get screen bounds
    $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    Write-Host "`nPrimary Screen:"
    Write-Host "  Width: $($screen.Width)"
    Write-Host "  Height: $($screen.Height)"

    # Move window to center
    $x = ($screen.Width - 800) / 2
    $y = ($screen.Height - 600) / 2
    Write-Host "`nMoving window to center: $x, $y"
    [Win32]::MoveWindow($hWnd, $x, $y, 800, 600, $true) | Out-Null

    Start-Sleep -Milliseconds 500
    [Win32]::GetWindowRect($hWnd, [ref]$rect) | Out-Null
    Write-Host "`nWindow Rect after move:"
    Write-Host "  Left: $($rect.Left)"
    Write-Host "  Top: $($rect.Top)"
    Write-Host "  Width: $($rect.Right - $rect.Left)"
    Write-Host "  Height: $($rect.Bottom - $rect.Top)"
    Write-Host "`nWindow should now be visible!"
} else {
    Write-Host "No pomodoroom-desktop process found. Please start the app first."
}
