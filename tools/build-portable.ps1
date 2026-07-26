param(
    [switch]$IncrementVersion,
    [switch]$SkipBackend,
    [switch]$SkipDesktop
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $projectRoot

if ($IncrementVersion) {
    & (Join-Path $PSScriptRoot "increment-version.ps1")
}
$version = (Get-Content -LiteralPath (Join-Path $projectRoot "VERSION") -Raw).Trim()
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw "Invalid VERSION: $version" }

$buildRoot = Join-Path $projectRoot ".build\portable"
$backendDist = Join-Path $buildRoot "backend-dist"
$backendWork = Join-Path $buildRoot "backend-work"
$stageRoot = Join-Path $projectRoot "dist\Canvas-$version-windows-x64"
$zipPath = Join-Path $projectRoot "dist\Canvas-$version-windows-x64.zip"

function Remove-BuildPath([string]$Path, [string]$AllowedRoot) {
    $fullPath = [System.IO.Path]::GetFullPath($Path)
    $fullRoot = [System.IO.Path]::GetFullPath($AllowedRoot).TrimEnd('\') + '\'
    if (-not $fullPath.StartsWith($fullRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to clean path outside build root: $fullPath"
    }
    if (Test-Path -LiteralPath $fullPath) { Remove-Item -LiteralPath $fullPath -Recurse -Force }
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

New-Item -ItemType Directory -Force (Join-Path $projectRoot "dist") | Out-Null
New-Item -ItemType Directory -Force $buildRoot | Out-Null

if (-not $SkipBackend) {
    Remove-BuildPath $backendDist $buildRoot
    Remove-BuildPath $backendWork $buildRoot
    & (Join-Path $projectRoot "python\python.exe") -m PyInstaller --noconfirm --clean --distpath $backendDist --workpath $backendWork (Join-Path $projectRoot "canvas-backend.spec")
    if ($LASTEXITCODE -ne 0) { throw "PyInstaller build failed" }
}

if (-not $SkipDesktop) {
    & npm run desktop:build
    if ($LASTEXITCODE -ne 0) { throw "Tauri build failed" }
}

$desktopExe = Join-Path $projectRoot "src-tauri\target\release\Canvas.exe"
$backendSource = Join-Path $backendDist "canvas-backend"
if (-not (Test-Path -LiteralPath $desktopExe)) { throw "Desktop executable not found: $desktopExe" }
if (-not (Test-Path -LiteralPath (Join-Path $backendSource "canvas-backend.exe"))) { throw "Sidecar not found: $backendSource" }

Remove-BuildPath $stageRoot (Join-Path $projectRoot "dist")
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }

$appRoot = Join-Path $stageRoot "app"
New-Item -ItemType Directory -Force (Join-Path $appRoot "backend") | Out-Null
Copy-Item -LiteralPath $desktopExe -Destination (Join-Path $stageRoot "Canvas.exe")
Copy-Item -LiteralPath $backendSource -Destination (Join-Path $appRoot "backend\canvas-backend") -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot "static") -Destination (Join-Path $appRoot "web") -Recurse
$connectors = Join-Path $appRoot "connectors"
New-Item -ItemType Directory -Force $connectors | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot "tools\chrome-local-asset-importer") -Destination (Join-Path $connectors "chrome") -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot "tools\photoshop-asset-connector") -Destination (Join-Path $connectors "photoshop") -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot "VERSION") -Destination (Join-Path $appRoot "VERSION")
Copy-Item -LiteralPath (Join-Path $projectRoot "LICENSE") -Destination (Join-Path $stageRoot "LICENSE")
Copy-Item -LiteralPath (Join-Path $projectRoot "README.md") -Destination (Join-Path $stageRoot "README.md")

$utf8 = [System.Text.UTF8Encoding]::new($false)
Get-ChildItem -LiteralPath (Join-Path $appRoot "web") -Recurse -File -Include *.html,*.js | ForEach-Object {
    $content = [System.IO.File]::ReadAllText($_.FullName)
    $updated = [regex]::Replace($content, '\?v=[0-9A-Za-z._-]+', "?v=$version")
    if ($updated -ne $content) { [System.IO.File]::WriteAllText($_.FullName, $updated, $utf8) }
}

if (Test-Path -LiteralPath (Join-Path $stageRoot "data")) { throw "Portable package must not contain user data" }
Compress-Archive -LiteralPath $stageRoot -DestinationPath $zipPath -CompressionLevel Optimal

$hash = Get-Sha256 $zipPath
[System.IO.File]::WriteAllText("$zipPath.sha256", "$hash  $([System.IO.Path]::GetFileName($zipPath))`n", $utf8)
Write-Host "Portable package built: $zipPath"
Write-Host "SHA256: $hash"
