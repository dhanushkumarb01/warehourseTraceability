# Start the AI worker against the deployed backend and expose its face-enrollment
# API on a static ngrok domain.
#
#   powershell -ExecutionPolicy Bypass -File ai-service\start-demo.ps1
#
# The domain never changes, so the Render service's AI_ENROLLMENT_URL is set once
# (https://<domain>) and needs no update or redeploy here. Requires ngrok on PATH
# with an authtoken configured (`ngrok config add-authtoken <token>`) and
# ai-service\.env holding the backend's AI_SERVICE_TOKEN. Ctrl+C stops both.

param(
  [string]$ApiUrl = "https://warehouse-traceability-api.onrender.com",
  [string]$Domain = "alexia-intertribal-nonsubtractively.ngrok-free.dev",
  [int]$Port = 8600
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDir = Join-Path $here ".cache"
New-Item -ItemType Directory -Force $logDir | Out-Null
$workerLog = Join-Path $logDir "worker.log"
$tunnelLog = Join-Path $logDir "ngrok.log"
$publicUrl = "https://$Domain"

if (-not (Get-Command ngrok -ErrorAction SilentlyContinue)) {
  throw "ngrok is not on PATH. Install it from https://ngrok.com/download and run 'ngrok config add-authtoken <token>'."
}

# Wake the backend (Render free tier sleeps when idle).
Write-Host "Waking backend $ApiUrl ..."
try { Invoke-RestMethod "$ApiUrl/health" -TimeoutSec 120 | Out-Null } catch { Write-Warning "Backend did not answer: $_" }

$env:WARETRACE_API_URL = $ApiUrl
$env:PYTHONUNBUFFERED = "1"
$worker = Start-Process python -ArgumentList "main.py" -WorkingDirectory $here -NoNewWindow -PassThru `
  -RedirectStandardOutput $workerLog -RedirectStandardError "$workerLog.err"

$tunnel = Start-Process ngrok -ArgumentList "http --url=$publicUrl --log=stdout $Port" `
  -NoNewWindow -PassThru -RedirectStandardOutput $tunnelLog -RedirectStandardError "$tunnelLog.err"

try {
  # Ready when the worker's /health answers through the tunnel (the face model
  # loads on the first call, so allow a few minutes). PowerShell's user agent
  # looks like a browser, so skip ngrok's free-plan interstitial page.
  $ready = $false
  for ($i = 0; $i -lt 90 -and -not $ready; $i++) {
    Start-Sleep -Seconds 2
    if ($worker.HasExited) { throw "AI worker exited; see $workerLog and $workerLog.err" }
    if ($tunnel.HasExited) { throw "ngrok exited; see $tunnelLog" }
    try {
      $ready = (Invoke-RestMethod "$publicUrl/health" -TimeoutSec 10 -Headers @{ "ngrok-skip-browser-warning" = "1" }).ok
    } catch { }
  }
  if (-not $ready) { throw "Tunnel did not answer at $publicUrl/health; see $tunnelLog and $workerLog" }

  Write-Host "Enrollment URL: $publicUrl  (Render AI_ENROLLMENT_URL must equal this)"
  Write-Host "AI worker running (logs: $workerLog, requests: $workerLog.err). Press Ctrl+C to stop."
  Wait-Process -Id $worker.Id
} finally {
  foreach ($p in @($worker, $tunnel)) { if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force } }
}
