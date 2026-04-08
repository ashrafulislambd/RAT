<#
.SYNOPSIS
    Remove the UltraRAT-Client Windows Service.

.PARAMETER ServiceName
    Service name to remove. Default: UltraRAT-Client

.EXAMPLE
    .\uninstall-windows.ps1
#>
param(
    [string]$ServiceName = "UltraRAT-Client"
)

# ── Auto-elevate ──────────────────────────────────────────────────────────────
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Not running as Administrator. Re-launching elevated..." -ForegroundColor Yellow
    $argList = "-ExecutionPolicy Bypass -File `"$PSCommandPath`" -ServiceName `"$ServiceName`""
    Start-Process -FilePath "powershell.exe" -ArgumentList $argList -Verb RunAs
    exit 0
}

Write-Host ""
Write-Host "  UltraRAT Client - Windows Service Uninstaller" -ForegroundColor Cyan
Write-Host "  ----------------------------------------------"
Write-Host "  Service: $ServiceName"
Write-Host ""

# ── Check installed ───────────────────────────────────────────────────────────
$qResult = & sc.exe query $ServiceName 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] Service '$ServiceName' is not installed (or already removed)." -ForegroundColor Yellow
    Read-Host "Press Enter to close"
    exit 0
}

# ── Stop ──────────────────────────────────────────────────────────────────────
Write-Host "  [1/2] Stopping service ..." -NoNewline
& cmd.exe /c "sc stop `"$ServiceName`"" 2>&1 | Out-Null
Start-Sleep -Seconds 2
Write-Host " OK" -ForegroundColor Green

# ── Delete ────────────────────────────────────────────────────────────────────
Write-Host "  [2/2] Deleting service ..." -NoNewline
& cmd.exe /c "sc delete `"$ServiceName`"" 2>&1 | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host " OK" -ForegroundColor Green
    Write-Host ""
    Write-Host "[OK] Service '$ServiceName' removed." -ForegroundColor Green
} else {
    Write-Host " FAILED" -ForegroundColor Red
    Write-Host "[ERROR] sc delete returned exit code $LASTEXITCODE"
    Write-Host "  Try stopping the service manually in services.msc and re-running."
}

Write-Host ""
Read-Host "Press Enter to close"
