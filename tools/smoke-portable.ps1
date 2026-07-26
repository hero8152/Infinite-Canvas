param(
    [string]$Stage = "",
    [int]$Port = 3099
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $Stage) {
    $version = (Get-Content -LiteralPath (Join-Path $projectRoot "VERSION") -Raw).Trim()
    $Stage = Join-Path $projectRoot "dist\Canvas-$version-windows-x64"
}
$stageRoot = (Resolve-Path $Stage).Path
$appRoot = Join-Path $stageRoot "app"
$buildRoot = (Resolve-Path (Join-Path $projectRoot ".build")).Path
$dataRoot = Join-Path $buildRoot "sidecar-smoke-data"
if (Test-Path -LiteralPath $dataRoot) {
    if (-not $dataRoot.StartsWith(($buildRoot.TrimEnd('\') + '\'), [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to clean path outside build root: $dataRoot"
    }
    Remove-Item -LiteralPath $dataRoot -Recurse -Force
}

function Get-Sha256([string]$Path) {
    $stream = [System.IO.File]::OpenRead($Path)
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        return ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace("-", "").ToLowerInvariant()
    } finally {
        $sha256.Dispose()
        $stream.Dispose()
    }
}

function Get-AppHashes([string]$Root) {
    Get-ChildItem -LiteralPath $Root -Recurse -File | ForEach-Object {
        [pscustomobject]@{
            Path = $_.FullName.Substring($Root.Length)
            Hash = Get-Sha256 $_.FullName
        }
    }
}

$before = Get-AppHashes $appRoot
$executable = Join-Path $appRoot "backend\canvas-backend\canvas-backend.exe"
$processInfo = [System.Diagnostics.ProcessStartInfo]::new($executable)
$processInfo.UseShellExecute = $false
$processInfo.CreateNoWindow = $true
$processInfo.RedirectStandardOutput = $true
$processInfo.RedirectStandardError = $true
$arguments = @(
    "--data-dir", $dataRoot,
    "--app-root", $appRoot,
    "--portable-root", $stageRoot,
    "--host", "127.0.0.1",
    "--port", "$Port",
    "--desktop-token", "smoke-secret",
    "--runtime-mode", "desktop"
)
$processInfo.Arguments = ($arguments | ForEach-Object { '"' + ($_ -replace '"', '\"') + '"' }) -join ' '
$process = [System.Diagnostics.Process]::Start($processInfo)

try {
    $health = $null
    for ($attempt = 0; $attempt -lt 300; $attempt++) {
        if ($process.HasExited) {
            $errorOutput = $process.StandardError.ReadToEnd()
            throw "Sidecar exited before health check (code $($process.ExitCode)): $errorOutput"
        }
        try {
            $health = Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 1
            break
        } catch {
            Start-Sleep -Milliseconds 100
        }
    }
    if (-not $health) {
        throw "Sidecar health check timed out"
    }

    $unauthorizedStatus = 0
    try {
        $unexpected = Invoke-WebRequest "http://127.0.0.1:$Port/api/runtime/info" -UseBasicParsing
        $unauthorizedStatus = [int]$unexpected.StatusCode
    } catch {
        $unauthorizedStatus = [int]$_.Exception.Response.StatusCode
    }
    if ($unauthorizedStatus -ne 401) { throw "Expected unauthenticated HTTP 401, got $unauthorizedStatus" }

    Invoke-WebRequest "http://127.0.0.1:$Port/api/auth/bootstrap?token=smoke-secret" -UseBasicParsing -SessionVariable session | Out-Null
    $runtime = Invoke-RestMethod "http://127.0.0.1:$Port/api/runtime/info" -WebSession $session
    $providers = Invoke-RestMethod "http://127.0.0.1:$Port/api/providers" -WebSession $session
    $localVision = @($providers.providers | Where-Object { $_.id -eq "local-vision" }) | Select-Object -First 1
    $localVisionReady = [bool]($localVision -and $localVision.has_key -and $localVision.base_url -eq "http://115.231.35.105:12345/v1" -and @($localVision.chat_models) -contains "qwen3.5-9b-vlm")
    $shutdown = Invoke-RestMethod "http://127.0.0.1:$Port/api/runtime/shutdown" -Method Post -Headers @{ "X-Desktop-Token" = "smoke-secret" }
    if (-not $process.WaitForExit(10000)) { throw "Sidecar graceful shutdown timed out" }

    $after = Get-AppHashes $appRoot
    $changes = @(Compare-Object $before $after -Property Path, Hash)
    $result = [ordered]@{
        health = $health.status
        version = $health.version
        runtime_mode = $runtime.runtime_mode
        unauthorized_status = $unauthorizedStatus
        shutdown = $shutdown.ok
        exit_code = $process.ExitCode
        app_resource_changes = $changes.Count
        manifest_created = Test-Path -LiteralPath (Join-Path $dataRoot "manifest.json")
        database_created = Test-Path -LiteralPath (Join-Path $dataRoot "database\canvas.db")
        local_vision_ready = $localVisionReady
    }
    $result | ConvertTo-Json
    if ($changes.Count -ne 0 -or $process.ExitCode -ne 0 -or -not $result.database_created -or -not $result.local_vision_ready) {
        throw "Portable Sidecar smoke test failed"
    }
} finally {
    if (-not $process.HasExited) {
        $process.Kill()
        [void]$process.WaitForExit(5000)
    }
}
