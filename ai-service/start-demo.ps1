# Start the AI worker against the deployed backend and expose its face-enrollment
# API through a Cloudflare quick tunnel.
#
#   powershell -ExecutionPolicy Bypass -File ai-service\start-demo.ps1
#
# A quick-tunnel URL changes on every start. If RENDER_API_KEY is set, the
# script points the Render service's AI_ENROLLMENT_URL at the new URL and
# redeploys it; otherwise it prints the URL to set by hand. Ctrl+C stops both.

param(
  [string]$ApiUrl = "https://warehouse-traceability-api.onrender.com",
  [string]$RenderServiceId = "srv-dbcj0dl9fdbs73a17mh0"
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDir = Join-Path $here ".cache"
New-Item -ItemType Directory -Force $logDir | Out-Null
$workerLog = Join-Path $logDir "worker.log"
$tunnelLog = Join-Path $logDir "tunnel.log"

# Wake the backend (Render free tier sleeps when idle).
Write-Host "Waking backend $ApiUrl ..."
try { Invoke-RestMethod "$ApiUrl/health" -TimeoutSec 120 | Out-Null } catch { Write-Warning "Backend did not answer: $_" }

$env:WARETRACE_API_URL = $ApiUrl
$env:PYTHONUNBUFFERED = "1"
$worker = Start-Process python -ArgumentList "main.py" -WorkingDirectory $here -NoNewWindow -PassThru `
  -RedirectStandardOutput $workerLog -RedirectStandardError "$workerLog.err"

# http2: QUIC registration times out on machines running Cloudflare WARP.
$tunnel = Start-Process cloudflared -ArgumentList "tunnel --no-autoupdate --protocol http2 --url http://localhost:8600" `
  -NoNewWindow -PassThru -RedirectStandardOutput "$tunnelLog.out" -RedirectStandardError $tunnelLog

try {
  $url = $null
  for ($i = 0; $i -lt 60 -and -not $url; $i++) {
    Start-Sleep -Seconds 1
    $m = Select-String -Path $tunnelLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($m) { $url = $m.Matches[0].Value }
  }
  if (-not $url) { throw "Tunnel did not start; see $tunnelLog" }
  Write-Host "Enrollment tunnel: $url"

  if ($env:RENDER_API_KEY) {
    $headers = @{ Authorization = "Bearer $env:RENDER_API_KEY" }
    Invoke-RestMethod -Method Put -Uri "https://api.render.com/v1/services/$RenderServiceId/env-vars/AI_ENROLLMENT_URL" `
      -Headers $headers -ContentType "application/json" -Body (@{ value = $url } | ConvertTo-Json) | Out-Null
    Invoke-RestMethod -Method Post -Uri "https://api.render.com/v1/services/$RenderServiceId/deploys" `
      -Headers $headers -ContentType "application/json" -Body "{}" | Out-Null
    Write-Host "Updated AI_ENROLLMENT_URL on Render and started a redeploy (~2-3 min)."
  } else {
    Write-Host "Set AI_ENROLLMENT_URL=$url on the Render service (Environment tab), then save and deploy."
  }

  Write-Host "AI worker running (log: $workerLog). Press Ctrl+C to stop."
  Wait-Process -Id $worker.Id
} finally {
  foreach ($p in @($worker, $tunnel)) { if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force } }
}
