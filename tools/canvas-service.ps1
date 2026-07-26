param(
    [Parameter(Position = 0)]
    [ValidateSet("start", "stop", "status")]
    [string]$Action = "start",
    [int]$Port = 3000,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent $ScriptDir
$DataDir = Join-Path $Root "data"
$PidFile = Join-Path $DataDir "canvas-service.pid"
$StdoutLog = Join-Path $DataDir "canvas-service.stdout.log"
$StderrLog = Join-Path $DataDir "canvas-service.stderr.log"
$MainPy = Join-Path $Root "main.py"
$BundledPython = Join-Path $Root "python\python.exe"
$PythonExe = if (Test-Path -LiteralPath $BundledPython) { $BundledPython } else { "python" }
$AppUrl = "http://127.0.0.1:$Port/"

function Ensure-DataDir {
    if (-not (Test-Path -LiteralPath $DataDir)) {
        New-Item -Path $DataDir -ItemType Directory | Out-Null
    }
}

function Get-ProcessInfo {
    param([int]$ProcessId)
    Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
}

function Test-CanvasProcess {
    param($ProcessInfo)
    if ($null -eq $ProcessInfo) {
        return $false
    }

    $cmd = [string]$ProcessInfo.CommandLine
    $exe = [string]$ProcessInfo.ExecutablePath
    $rootPrefix = $Root.TrimEnd("\")
    $usesMain = ($cmd -match '(^|[\\/"\s])main\.py([\\/"\s]|$)') -or ($cmd.IndexOf($MainPy, [StringComparison]::OrdinalIgnoreCase) -ge 0)
    $usesProjectCmd = $cmd.IndexOf($rootPrefix, [StringComparison]::OrdinalIgnoreCase) -ge 0
    $usesProjectExe = $exe.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)

    return ($usesMain -and ($usesProjectCmd -or $usesProjectExe))
}

function Get-CanvasProcesses {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { Test-CanvasProcess $_ }
}

function Get-PortOwnerIds {
    try {
        @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique |
            Where-Object { $_ -and $_ -ne 0 })
    } catch {
        @()
    }
}

function Get-CanvasPids {
    $processIds = @()
    $processIds += @(Get-CanvasProcesses | Select-Object -ExpandProperty ProcessId)

    foreach ($ownerId in Get-PortOwnerIds) {
        $info = Get-ProcessInfo -ProcessId ([int]$ownerId)
        if (Test-CanvasProcess $info) {
            $processIds += [int]$ownerId
        }
    }

    @($processIds | Sort-Object -Unique)
}

function Get-PortConflictPids {
    $conflicts = @()
    foreach ($ownerId in Get-PortOwnerIds) {
        $info = Get-ProcessInfo -ProcessId ([int]$ownerId)
        if (-not (Test-CanvasProcess $info)) {
            $conflicts += [int]$ownerId
        }
    }

    @($conflicts | Sort-Object -Unique)
}

function Save-Pid {
    param([int]$ProcessId)
    Ensure-DataDir
    Set-Content -LiteralPath $PidFile -Value $ProcessId -Encoding ASCII
}

function Remove-PidFile {
    if (Test-Path -LiteralPath $PidFile) {
        Remove-Item -LiteralPath $PidFile -Force
    }
}

function Open-Canvas {
    if (-not $NoBrowser) {
        Start-Process $AppUrl | Out-Null
    }
}

function Test-HttpReady {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $AppUrl -TimeoutSec 2
        return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
    } catch {
        return $false
    }
}

function Show-ConflictAndExit {
    param([int[]]$Conflicts)

    Write-Host "Port $Port is already used by another process. Canvas was not started."
    foreach ($processId in $Conflicts) {
        $info = Get-ProcessInfo -ProcessId $processId
        if ($info) {
            Write-Host "PID $processId : $($info.CommandLine)"
        } else {
            Write-Host "PID $processId"
        }
    }
    exit 1
}

function Start-Canvas {
    Ensure-DataDir

    if (-not (Test-Path -LiteralPath $MainPy)) {
        Write-Host "main.py was not found: $MainPy"
        exit 1
    }

    $runningPids = Get-CanvasPids
    if ($runningPids.Count -gt 0) {
        Save-Pid -ProcessId ([int]$runningPids[0])
        Write-Host "Canvas is already running. PID: $($runningPids -join ', ')"
        Write-Host "URL: $AppUrl"
        Open-Canvas
        return
    }

    $conflicts = Get-PortConflictPids
    if ($conflicts.Count -gt 0) {
        Show-ConflictAndExit -Conflicts $conflicts
    }

    Write-Host "Starting Canvas..."
    Write-Host "Python: $PythonExe"
    Write-Host "URL: $AppUrl"
    Write-Host "Logs: $StdoutLog"
    Write-Host "Logs: $StderrLog"

    $process = Start-Process `
        -FilePath $PythonExe `
        -ArgumentList @($MainPy) `
        -WorkingDirectory $Root `
        -RedirectStandardOutput $StdoutLog `
        -RedirectStandardError $StderrLog `
        -WindowStyle Hidden `
        -PassThru

    Save-Pid -ProcessId $process.Id

    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        $current = Get-Process -Id $process.Id -ErrorAction SilentlyContinue
        if ($null -eq $current) {
            Write-Host "Canvas exited while starting. Check log: $StderrLog"
            exit 1
        }

        if (Test-HttpReady) {
            Write-Host "Canvas started. PID: $($process.Id)"
            Open-Canvas
            return
        }
    }

    Write-Host "Canvas process started, but HTTP check is not ready yet. PID: $($process.Id)"
    Write-Host "Open manually later: $AppUrl"
}

function Stop-Canvas {
    Ensure-DataDir

    $targetPids = @()
    if (Test-Path -LiteralPath $PidFile) {
        foreach ($line in Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue) {
            $parsed = 0
            if ([int]::TryParse($line, [ref]$parsed)) {
                $info = Get-ProcessInfo -ProcessId $parsed
                if (Test-CanvasProcess $info) {
                    $targetPids += $parsed
                }
            }
        }
    }

    $targetPids += @(Get-CanvasPids)
    $targetPids = @($targetPids | Sort-Object -Unique)

    if ($targetPids.Count -eq 0) {
        Remove-PidFile
        $conflicts = Get-PortConflictPids
        if ($conflicts.Count -gt 0) {
            Write-Host "Canvas is not running, but port $Port is used by another process: $($conflicts -join ', ')"
        } else {
            Write-Host "Canvas is not running."
        }
        return
    }

    foreach ($processId in $targetPids) {
        Write-Host "Stopping Canvas PID $processId..."
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }

    for ($i = 0; $i -lt 10; $i++) {
        Start-Sleep -Milliseconds 500
        if ((Get-CanvasPids).Count -eq 0) {
            break
        }
    }

    Remove-PidFile
    Write-Host "Canvas stopped."
}

function Show-Status {
    $runningPids = Get-CanvasPids
    if ($runningPids.Count -gt 0) {
        Write-Host "Canvas is running. PID: $($runningPids -join ', ')"
        Write-Host "URL: $AppUrl"
        if (Test-HttpReady) {
            Write-Host "HTTP check: OK"
        } else {
            Write-Host "HTTP check: not ready"
        }
        return
    }

    $conflicts = Get-PortConflictPids
    if ($conflicts.Count -gt 0) {
        Write-Host "Canvas is not running. Port $Port is used by another process: $($conflicts -join ', ')"
    } else {
        Write-Host "Canvas is not running."
    }
}

switch ($Action) {
    "start" { Start-Canvas }
    "stop" { Stop-Canvas }
    "status" { Show-Status }
}
