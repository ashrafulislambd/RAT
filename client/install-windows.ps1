<#
.SYNOPSIS
    Install UltraRAT Client as a Windows Service — no Node.js required.

.DESCRIPTION
    Uses sc.exe (built into every Windows) and auto-elevates to Administrator.
    Place this script in the same folder as ultrarat-client-win.exe and config.json.

.PARAMETER BinaryPath
    Path to ultrarat-client-win.exe. Default: same folder as this script.

.PARAMETER ServerUrl
    Override the WebSocket server URL (e.g. ws://192.168.1.5:3000).
    If omitted, the value in config.json is used.

.PARAMETER ServiceName
    Windows service name. Default: UltraRAT-Client

.EXAMPLE
    .\install-windows.ps1
    .\install-windows.ps1 -ServerUrl "ws://10.0.0.1:3000"
    .\install-windows.ps1 -BinaryPath "C:\tools\ultrarat-client-win.exe"
#>
param(
    [string]$BinaryPath   = "",
    [string]$ServiceName  = "UltraRAT-Client",
    [string]$DisplayName  = "UltraRAT Client Agent",
    [string]$ServerUrl    = ""
)

# ── Auto-elevate to Administrator ─────────────────────────────────────────────
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Not running as Administrator. Re-launching elevated..." -ForegroundColor Yellow
    $argList = "-ExecutionPolicy Bypass -File `"$PSCommandPath`""
    if ($BinaryPath)  { $argList += " -BinaryPath `"$BinaryPath`"" }
    if ($ServiceName) { $argList += " -ServiceName `"$ServiceName`"" }
    if ($DisplayName) { $argList += " -DisplayName `"$DisplayName`"" }
    if ($ServerUrl)   { $argList += " -ServerUrl `"$ServerUrl`"" }
    Start-Process -FilePath "powershell.exe" -ArgumentList $argList -Verb RunAs
    exit 0
}

# ── Resolve binary path ───────────────────────────────────────────────────────
if (-not $BinaryPath) {
    $BinaryPath = Join-Path $PSScriptRoot "ultrarat-client-win.exe"
}

# ── Validate binary ───────────────────────────────────────────────────────────
if (-not (Test-Path $BinaryPath)) {
    Write-Host ""
    Write-Host "[ERROR] Binary not found at: $BinaryPath" -ForegroundColor Red
    Write-Host ""
    Write-Host "  This script expects ultrarat-client-win.exe in the same folder." -ForegroundColor Yellow
    Write-Host "  Build it on your dev machine:"
    Write-Host "    npm install"
    Write-Host "    npm run build:win"
    Write-Host "  Then copy  dist\ultrarat-client-win.exe  and  config.json  here."
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

$BinaryPath = (Resolve-Path $BinaryPath).Path

# ── Banner ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  UltraRAT Client - Windows Service Installer" -ForegroundColor Cyan
Write-Host "  --------------------------------------------"
Write-Host "  Binary  : $BinaryPath"
Write-Host "  Service : $ServiceName"
if ($ServerUrl) { Write-Host "  Server  : $ServerUrl (override)" }
Write-Host ""

# ── Check already installed ───────────────────────────────────────────────────
$qResult = & sc.exe query $ServiceName 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "[!] Service '$ServiceName' is already installed." -ForegroundColor Yellow
    Write-Host "    Run .\uninstall-windows.ps1 first, then re-install."
    Read-Host "Press Enter to exit"
    exit 1
}

# ── Create service ────────────────────────────────────────────────────────────
Write-Host "  [1/3] Creating service ..." -NoNewline

# sc.exe requires binPath= with a space after = and quotes around paths with spaces.
# We call cmd /c to guarantee the quoting is handled correctly on all Windows versions.
$createOut = & cmd.exe /c "sc create `"$ServiceName`" binPath= \`"$BinaryPath\`" start= auto DisplayName= `"$DisplayName`"" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host " FAILED" -ForegroundColor Red
    Write-Host "[ERROR] sc create returned exit code $LASTEXITCODE" -ForegroundColor Red
    Write-Host $createOut
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host " OK" -ForegroundColor Green

# ── Add description ───────────────────────────────────────────────────────────
& cmd.exe /c "sc description `"$ServiceName`" `"UltraRAT remote admin client. Auto-restarts on failure.`"" 2>&1 | Out-Null

# ── Set server URL via registry (only when overriding config.json) ────────────
if ($ServerUrl) {
    try {
        $regPath  = "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName"
        New-ItemProperty -Path $regPath -Name "Environment" `
            -Value @("RAT_SERVER_URL=$ServerUrl") `
            -PropertyType MultiString -Force | Out-Null
        Write-Host "  [+] RAT_SERVER_URL set to: $ServerUrl" -ForegroundColor DarkGray
    } catch {
        Write-Host "  [!] Could not set registry env var: $_" -ForegroundColor Yellow
    }
}

# ── Configure crash recovery ──────────────────────────────────────────────────
# Restart after 5s, 15s, 60s; reset failure counter after 24h
Write-Host "  [2/3] Configuring auto-restart ..." -NoNewline
& cmd.exe /c "sc failure `"$ServiceName`" reset= 86400 actions= restart/5000/restart/15000/restart/60000" 2>&1 | Out-Null
Write-Host " OK" -ForegroundColor Green

# ── Start service (non-blocking) ──────────────────────────────────────────────
# We fire sc start in the background and check status after a few seconds.
# Reason: our binary is a plain exe (not a proper SCM service), so it never
# sends SERVICE_RUNNING back — a blocking sc start would hang ~30s.
Write-Host "  [3/3] Starting service ..." -NoNewline

$startJob = Start-Job { & cmd.exe /c "sc start `"$using:ServiceName`"" 2>&1 }
Start-Sleep -Seconds 5   # give the process time to actually launch

$statusOut = & cmd.exe /c "sc query `"$ServiceName`"" 2>&1
$isRunning  = ($statusOut -join "") -match "RUNNING"

# Clean up background job (we don't need its result)
Stop-Job  $startJob -ErrorAction SilentlyContinue
Remove-Job $startJob -ErrorAction SilentlyContinue

if ($isRunning) {
    Write-Host " OK" -ForegroundColor Green
} else {
    Write-Host " registered (check status below)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  $statusOut"
}

Write-Host ""
Write-Host "[OK] Service '$ServiceName' installed." -ForegroundColor Green
Write-Host ""
Write-Host "  Manage it:" -ForegroundColor Cyan
Write-Host "    sc query $ServiceName       - check status"
Write-Host "    sc stop  $ServiceName       - stop"
Write-Host "    sc start $ServiceName       - start"
Write-Host "    .\uninstall-windows.ps1     - remove"
Write-Host "    Logs: <folder where exe is>\logs\service.log"
Write-Host ""
Read-Host "Press Enter to close"

