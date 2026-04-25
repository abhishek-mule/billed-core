# Billed-Core: Docker & WSL2 Optimizer
# Run this script as Administrator to apply performance tweaks.

$wslConfigPath = [System.IO.Path]::Combine($env:USERPROFILE, ".wslconfig")

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "   Billzo Docker Performance Optimizer" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

# 1. Create .wslconfig if it doesn't exist or update it
$wslConfigContent = @"
[wsl2]
memory=4GB
processors=4
autoMemoryReclaim=gradual
networkingMode=mirrored
dnsTunneling=true
"@

if (Test-Path $wslConfigPath) {
    Write-Host "[!] Found existing .wslconfig at $wslConfigPath" -ForegroundColor Yellow
    Write-Host "[*] Backing up to .wslconfig.bak"
    Copy-Item $wslConfigPath "$wslConfigPath.bak" -Force
}

Write-Host "[+] Applying optimized WSL2 settings..." -ForegroundColor Green
Set-Content -Path $wslConfigPath -Value $wslConfigContent

# 2. Provide Instructions for Windows Defender
Write-Host ""
Write-Host "--- IMPORTANT: MANUAL ACTION REQUIRED ---" -ForegroundColor Red
Write-Host "Windows Defender scans can slow down Docker by 80%."
Write-Host "Please manually add an EXCLUSION for this folder:"
Write-Host "   $PSScriptRoot" -ForegroundColor White
Write-Host "-----------------------------------------"

# 3. Clean up Docker (if running)
Write-Host ""
Write-Host "[?] Attempting to prune Docker system..." -ForegroundColor Yellow
docker system prune -f --volumes

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "   Optimization Complete!" -ForegroundColor Green
Write-Host "   Please RESTART Docker Desktop for changes"
Write-Host "   to take effect."
Write-Host "==============================================" -ForegroundColor Cyan
