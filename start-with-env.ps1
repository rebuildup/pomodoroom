#!/usr/bin/env pwsh
# Start Pomodoroom with Google OAuth credentials from .env

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Pomodoroom Desktop - Start with .env" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Load .env file
if (Test-Path ".env") {
    Write-Host "Loading environment variables from .env..." -ForegroundColor Green
    Get-Content ".env" | ForEach-Object {
        if ($_ -match '^([^=]+)=(.*)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            Set-Item -Path "env:$name" -Value $value
            Write-Host "  $name = $value" -ForegroundColor Gray
        }
    }
    Write-Host ""
} else {
    Write-Host "Warning: .env file not found!" -ForegroundColor Yellow
    Write-Host ""
}

# Display current OAuth config
Write-Host "Google OAuth Configuration:" -ForegroundColor Yellow
Write-Host "  CLIENT_ID: $env:GOOGLE_CLIENT_ID" -ForegroundColor Gray
Write-Host "  CLIENT_SECRET: $(if ($env:GOOGLE_CLIENT_SECRET) { '***' + $env:GOOGLE_CLIENT_SECRET.Substring([Math]::Max(0, $env:GOOGLE_CLIENT_SECRET.Length - 4)) } else { 'NOT SET' })" -ForegroundColor Gray
Write-Host ""

# Start Tauri dev
Write-Host "Starting Tauri development server..." -ForegroundColor Cyan
pnpm run tauri:dev
