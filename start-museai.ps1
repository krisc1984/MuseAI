$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

function Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Info {
  param([string]$Message)
  Write-Host "    $Message" -ForegroundColor DarkGray
}

function RequireCommand {
  param(
    [string]$Name,
    [string]$Hint
  )

  $Command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($null -eq $Command) {
    Write-Host ""
    Write-Host "Startup failed:" -ForegroundColor Red
    Write-Host $Hint -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
  }
}

Write-Host "MuseAI launcher" -ForegroundColor Green

Step "Checking runtime"
RequireCommand "node" "Node.js was not found. Install Node.js LTS first."
RequireCommand "npm" "npm was not found. It is normally installed with Node.js."
RequireCommand "cargo" "Rust cargo was not found. Install Rust first."
Info "Node: $(node --version)"
Info "npm:  $(npm --version)"
Info "Cargo: $(cargo --version)"

Step "Checking frontend dependencies"
$NeedInstall = $false
$NodeModules = Join-Path $ProjectRoot "node_modules"
$PackageLock = Join-Path $ProjectRoot "package-lock.json"

if (-not (Test-Path $NodeModules)) {
  $NeedInstall = $true
}

if ((-not $NeedInstall) -and (Test-Path $PackageLock)) {
  $LockTime = (Get-Item $PackageLock).LastWriteTime
  $NodeModulesTime = (Get-Item $NodeModules).LastWriteTime
  if ($LockTime -gt $NodeModulesTime) {
    $NeedInstall = $true
  }
}

if ($NeedInstall) {
  Info "Running npm install..."
  npm install
} else {
  Info "Dependencies are ready."
}

Step "Starting MuseAI desktop app"
Info "Tauri will start the Vite dev server automatically."
npm run tauri dev
