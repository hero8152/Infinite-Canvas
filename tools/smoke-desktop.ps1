param(
    [string]$Stage = "",
    [int]$Port = 3118,
    [int]$IdleSeconds = 15,
    [switch]$EnforceMemoryTarget
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $Stage) {
    $version = (Get-Content -LiteralPath (Join-Path $projectRoot "VERSION") -Raw).Trim()
    $Stage = Join-Path $projectRoot "dist\Canvas-$version-windows-x64"
}
$stageRoot = (Resolve-Path $Stage).Path
$runningCanvas = @(Get-Process -Name "Canvas" -ErrorAction SilentlyContinue)
if ($runningCanvas.Count -gt 0) {
    $runningPids = ($runningCanvas | ForEach-Object { $_.Id }) -join ", "
    throw "Desktop smoke test requires all existing Canvas instances to be closed first (PID: $runningPids)"
}
$buildRoot = (Resolve-Path (Join-Path $projectRoot ".build")).Path
$smokeRoot = Join-Path $buildRoot "desktop-smoke\Canvas"
if (Test-Path -LiteralPath $smokeRoot) {
    if (-not $smokeRoot.StartsWith(($buildRoot.TrimEnd('\') + '\'), [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to clean path outside build root: $smokeRoot"
    }
    Remove-Item -LiteralPath $smokeRoot -Recurse -Force
}
New-Item -ItemType Directory -Force (Split-Path $smokeRoot -Parent) | Out-Null
Copy-Item -LiteralPath $stageRoot -Destination $smokeRoot -Recurse
$configRoot = Join-Path $smokeRoot "data\config"
New-Item -ItemType Directory -Force $configRoot | Out-Null
$appConfig = [ordered]@{
    host = "127.0.0.1"
    port = $Port
    lan_enabled = $false
    cache_max_bytes = 10737418240
} | ConvertTo-Json
[System.IO.File]::WriteAllText((Join-Path $configRoot "app.json"), "$appConfig`n", [System.Text.UTF8Encoding]::new($false))

$process = Start-Process -FilePath (Join-Path $smokeRoot "Canvas.exe") -WorkingDirectory $smokeRoot -WindowStyle Hidden -PassThru
$watch = [System.Diagnostics.Stopwatch]::StartNew()
$health = $null
try {
    for ($attempt = 0; $attempt -lt 100; $attempt++) {
        if ($process.HasExited) { throw "Canvas.exe exited before the backend became healthy (code $($process.ExitCode))" }
        try {
            $health = Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 1
            break
        } catch {
            Start-Sleep -Milliseconds 100
        }
    }
    if (-not $health) { throw "Desktop backend health check timed out" }
    $watch.Stop()
    $stateFile = Join-Path $smokeRoot "data\run\backend.json"
    if (-not (Test-Path -LiteralPath $stateFile)) { throw "Desktop runtime state file was not created" }
    $backendState = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    Start-Sleep -Seconds $IdleSeconds
    $processTable = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId
    $ownedIds = @([int]$process.Id)
    do {
        $beforeCount = $ownedIds.Count
        $children = $processTable | Where-Object { $ownedIds -contains [int]$_.ParentProcessId } | ForEach-Object { [int]$_.ProcessId }
        $ownedIds = @($ownedIds + $children | Sort-Object -Unique)
    } while ($ownedIds.Count -gt $beforeCount)
    if ($ownedIds -notcontains [int]$backendState.pid) { $ownedIds += [int]$backendState.pid }
    $ownedProcesses = @(Get-Process -Id $ownedIds -ErrorAction SilentlyContinue)
    $privateBytes = ($ownedProcesses | Measure-Object -Property PrivateMemorySize64 -Sum).Sum
    $privateMemoryMb = [math]::Round($privateBytes / 1MB, 2)
    $processMemory = @($ownedProcesses | Sort-Object PrivateMemorySize64 -Descending | ForEach-Object {
        [ordered]@{ name = $_.ProcessName; pid = $_.Id; private_mb = [math]::Round($_.PrivateMemorySize64 / 1MB, 2) }
    })

    $second = Start-Process -FilePath (Join-Path $smokeRoot "Canvas.exe") -WorkingDirectory $smokeRoot -WindowStyle Hidden -PassThru
    if (-not $second.WaitForExit(5000)) {
        $second.Kill()
        throw "Second Canvas instance did not exit"
    }
    if ($process.HasExited) { throw "Second launch terminated the primary instance" }
    $primarySurvivedSecondLaunch = $true

    $process.Kill()
    [void]$process.WaitForExit(5000)
    $backendStopped = $false
    for ($attempt = 0; $attempt -lt 50; $attempt++) {
        if (-not (Get-Process -Id $backendState.pid -ErrorAction SilentlyContinue)) {
            $backendStopped = $true
            break
        }
        Start-Sleep -Milliseconds 100
    }
    [ordered]@{
        health = $health.status
        startup_ms = $watch.ElapsedMilliseconds
        desktop_exit_code = $process.ExitCode
        backend_pid = $backendState.pid
        process_tree_private_memory_mb = $privateMemoryMb
        memory_target_mb = 250
        memory_target_met = $privateBytes -le 250MB
        process_memory = $processMemory
        second_instance_exit_code = $second.ExitCode
        primary_survived_second_launch = $primarySurvivedSecondLaunch
        backend_stopped_after_parent_exit = $backendStopped
        data_created = Test-Path -LiteralPath (Join-Path $smokeRoot "data\database\canvas.db")
    } | ConvertTo-Json
    if (-not $backendStopped) { throw "Sidecar did not stop after the desktop parent exited" }
    if ($EnforceMemoryTarget -and $privateBytes -gt 250MB) { throw "Desktop process tree exceeded 250 MiB private memory target" }
} finally {
    if (-not $process.HasExited) {
        $process.Kill()
        [void]$process.WaitForExit(5000)
    }
}
