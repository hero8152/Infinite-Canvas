param()

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$targets = @(
    (Join-Path $projectRoot ".npm-cache"),
    (Join-Path $projectRoot ".build\sidecar-smoke-data"),
    (Join-Path $projectRoot ".build\desktop-smoke"),
    (Join-Path $projectRoot ".build\ecommerce-params-browser"),
    (Join-Path $projectRoot ".build\vision-live-smoke-data"),
    (Join-Path $projectRoot ".build\portable\backend-work"),
    (Join-Path $projectRoot "__pycache__"),
    (Join-Path $projectRoot "canvas_core\__pycache__"),
    (Join-Path $projectRoot "tests\__pycache__"),
    (Join-Path $projectRoot "tools\__pycache__")
)
$browserSmokeState = Join-Path $projectRoot ".build\browser-smoke-state.json"
$targets += $browserSmokeState
$browserSmokeResultFiles = @(Get-ChildItem -LiteralPath (Join-Path $projectRoot ".build") -File -Filter "browser-smoke-*.json" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
$targets += $browserSmokeResultFiles
$browserSmokeDirs = @(Get-ChildItem -LiteralPath (Join-Path $projectRoot ".build") -Directory -Filter "browser-smoke-*" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
$targets += $browserSmokeDirs
$ecommerceSmokeDirs = @(Get-ChildItem -LiteralPath (Join-Path $projectRoot ".build") -Directory -Filter "ecommerce-browser-*" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
$targets += $ecommerceSmokeDirs
$prefix = $projectRoot.TrimEnd('\') + '\'
foreach ($target in $targets) {
    $fullPath = [System.IO.Path]::GetFullPath($target)
    if (-not $fullPath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to clean path outside project root: $fullPath"
    }
    if (Test-Path -LiteralPath $fullPath) {
        Remove-Item -LiteralPath $fullPath -Recurse -Force
        Write-Host "Removed $fullPath"
    }
}

$cacheRoots = @(
    (Join-Path $projectRoot ".build"),
    (Join-Path $projectRoot "node_modules"),
    (Join-Path $projectRoot "src-tauri\target")
)
$remaining = 0L
foreach ($cacheRoot in $cacheRoots) {
    if (Test-Path -LiteralPath $cacheRoot) {
        $size = (Get-ChildItem -LiteralPath $cacheRoot -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        if ($size) { $remaining += [long]$size }
    }
}
if ($remaining -gt 20GB) { throw "Reusable development caches exceed 20 GiB" }
Write-Host ("Reusable development cache: {0:N2} MiB" -f ($remaining / 1MB))
