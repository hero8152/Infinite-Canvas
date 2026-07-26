param([Parameter(Mandatory = $true)][string]$BackupRoot)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backupBase = (Resolve-Path (Join-Path $projectRoot "backup")).Path
$resolvedBackup = (Resolve-Path $BackupRoot).Path
if (-not $resolvedBackup.StartsWith(($backupBase.TrimEnd('\') + '\'), [StringComparison]::OrdinalIgnoreCase)) {
    throw "Backup root must be inside the project backup directory"
}
$target = Join-Path $resolvedBackup "src-tauri\target"
if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
    Write-Host "Removed Cargo build output from backup: $target"
}
