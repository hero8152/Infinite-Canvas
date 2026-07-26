param()

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$versionFile = Join-Path $projectRoot "VERSION"
$current = (Get-Content -LiteralPath $versionFile -Raw).Trim()
if ($current -notmatch '^(\d+)\.(\d+)\.(\d+)$') {
    throw "VERSION must use x.y.z format: $current"
}

$next = "{0}.{1}.{2}" -f [int]$Matches[1], [int]$Matches[2], ([int]$Matches[3] + 1)
[System.IO.File]::WriteAllText($versionFile, "$next`n", [System.Text.UTF8Encoding]::new($false))

function Replace-Required([string]$Path, [string]$Pattern, [string]$Replacement) {
    $content = [System.IO.File]::ReadAllText($Path)
    $updated = [regex]::Replace($content, $Pattern, $Replacement, [System.Text.RegularExpressions.RegexOptions]::Multiline)
    if ($content -eq $updated) { throw "Version field not found in $Path" }
    [System.IO.File]::WriteAllText($Path, $updated, [System.Text.UTF8Encoding]::new($false))
}

Replace-Required (Join-Path $projectRoot "package.json") '(?m)(^\s*"version"\s*:\s*")[^"]+("\s*,)' "`${1}$next`${2}"
$packageLock = Join-Path $projectRoot "package-lock.json"
if (Test-Path -LiteralPath $packageLock) {
    Replace-Required $packageLock '(?ms)(\A\s*\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"version"\s*:\s*")[^"]+' "`${1}$next"
    Replace-Required $packageLock '(?ms)("packages"\s*:\s*\{\s*""\s*:\s*\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"version"\s*:\s*")[^"]+' "`${1}$next"
}
Replace-Required (Join-Path $projectRoot "src-tauri\tauri.conf.json") '(?m)(^\s*"version"\s*:\s*")[^"]+("\s*,)' "`${1}$next`${2}"
Replace-Required (Join-Path $projectRoot "src-tauri\Cargo.toml") '(?ms)(^\[package\].*?^version\s*=\s*")[^"]+("\s*$)' "`${1}$next`${2}"
$cargoLock = Join-Path $projectRoot "src-tauri\Cargo.lock"
if (Test-Path -LiteralPath $cargoLock) {
    Replace-Required $cargoLock '(?ms)(\[\[package\]\]\s+name\s*=\s*"canvas-desktop"\s+version\s*=\s*")[^"]+' "`${1}$next"
}
Replace-Required (Join-Path $projectRoot "main.py") '(?m)(^APP_VERSION\s*=\s*")[^"]+("\s*$)' "`${1}$next`${2}"
$updateNotes = Join-Path $projectRoot "static\update-notes.json"
if (Test-Path -LiteralPath $updateNotes) {
    Replace-Required $updateNotes '(?m)(^\s*"version"\s*:\s*")[^"]+("\s*,)' "`${1}$next`${2}"
}

Write-Host "Version incremented: $current -> $next"
