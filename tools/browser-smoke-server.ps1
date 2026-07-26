param(
    [int]$Port = 3117,
    [switch]$Stop
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$buildRoot = Join-Path $projectRoot ".build"
$statePath = Join-Path $buildRoot "browser-smoke-state.json"

if ($Stop) {
    if (-not (Test-Path -LiteralPath $statePath)) {
        Write-Output '{"stopped":true,"reason":"not_running"}'
        exit 0
    }
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    try {
        Invoke-RestMethod "http://127.0.0.1:$($state.port)/api/runtime/shutdown" `
            -Method Post -Headers @{ "X-Desktop-Token" = $state.token } -TimeoutSec 3 | Out-Null
    } catch {
        $process = Get-Process -Id ([int]$state.pid) -ErrorAction SilentlyContinue
        if ($process) {
            $process.Kill()
            [void]$process.WaitForExit(5000)
        }
    }
    Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
    Write-Output '{"stopped":true}'
    exit 0
}

New-Item -ItemType Directory -Force $buildRoot | Out-Null
if (Test-Path -LiteralPath $statePath) {
    $existing = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    if (Get-Process -Id ([int]$existing.pid) -ErrorAction SilentlyContinue) {
        throw "Browser smoke server is already running (PID $($existing.pid))"
    }
    Remove-Item -LiteralPath $statePath -Force
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmssfff"
$stageRoot = Join-Path $buildRoot "browser-smoke-$stamp"
$appRoot = Join-Path $stageRoot "app"
$dataRoot = Join-Path $stageRoot "data"
$logRoot = Join-Path $stageRoot "logs"
New-Item -ItemType Directory -Force $appRoot, $dataRoot, $logRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot "static") -Destination (Join-Path $appRoot "web") -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot "VERSION") -Destination (Join-Path $stageRoot "VERSION")

$token = "browser-smoke-token"
$python = Join-Path $projectRoot "python\python.exe"
$entry = Join-Path $projectRoot "backend_entry.py"
$previousGrsaiKey = $env:GRSAI_API_KEY
if (-not $previousGrsaiKey) { $env:GRSAI_API_KEY = "browser-smoke-configured-key" }
try {
    $process = Start-Process -FilePath $python -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $logRoot "stdout.log") `
        -RedirectStandardError (Join-Path $logRoot "stderr.log") `
        -ArgumentList @(
            $entry,
            "--data-dir", $dataRoot,
            "--app-root", $appRoot,
            "--portable-root", $stageRoot,
            "--host", "127.0.0.1",
            "--port", "$Port",
            "--desktop-token", $token,
            "--runtime-mode", "desktop"
        )
} finally {
    if ($previousGrsaiKey) { $env:GRSAI_API_KEY = $previousGrsaiKey }
    else { Remove-Item Env:GRSAI_API_KEY -ErrorAction SilentlyContinue }
}

try {
    $health = $null
    for ($attempt = 0; $attempt -lt 200; $attempt++) {
        if ($process.HasExited) {
            $errorOutput = Get-Content -LiteralPath (Join-Path $logRoot "stderr.log") -Raw -ErrorAction SilentlyContinue
            throw "Browser smoke server exited before health check (code $($process.ExitCode)): $errorOutput"
        }
        try {
            $health = Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 1
            break
        } catch {
            Start-Sleep -Milliseconds 100
        }
    }
    if (-not $health) { throw "Browser smoke server health check timed out" }
    $state = [ordered]@{
        pid = $process.Id
        port = $Port
        token = $token
        stage_root = $stageRoot
        url = "http://127.0.0.1:$Port/api/auth/bootstrap?token=$token"
    }
    $state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
    $state | ConvertTo-Json
} catch {
    if (-not $process.HasExited) {
        $process.Kill()
        [void]$process.WaitForExit(5000)
    }
    throw
}
