param(
    [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$logDir = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logPath = Join-Path $logDir ("openai-codex-cli-install-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
Start-Transcript -Path $logPath -Force | Out-Null

function Pause-End {
    Write-Host ""
    Write-Host "Log: $logPath"
    Read-Host "Press Enter to close"
    Stop-Transcript | Out-Null
}

function Get-NpmCommand {
    $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($npmCmd) { return $npmCmd.Source }

    $npm = Get-Command npm -ErrorAction SilentlyContinue
    if ($npm) { return $npm.Source }

    return $null
}

function Add-NpmPrefixToPath {
    param([string]$NpmCommand)

    try {
        $prefix = (& $NpmCommand config get prefix 2>$null | Select-Object -First 1).Trim()
        if ($prefix -and (Test-Path -LiteralPath $prefix)) {
            $env:PATH = "$prefix;$env:PATH"
        }
    } catch {
        Write-Host "Could not read npm global prefix. Continuing with the current PATH."
    }
}

function Get-LocalGptImage2SkillPackages {
    $vendorDir = Join-Path $PSScriptRoot "vendor"
    if (-not (Test-Path -LiteralPath $vendorDir)) {
        return @()
    }

    $mainPackage = Get-ChildItem -LiteralPath $vendorDir -Filter "gpt-image-2-skill-*.tgz" -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notmatch "windows|linux|darwin" } |
        Sort-Object Name -Descending |
        Select-Object -First 1
    if (-not $mainPackage) {
        return @()
    }

    $packages = @($mainPackage.FullName)
    $binaryPackage = Get-LocalGptImage2SkillBinaryPackage
    if ($binaryPackage) {
        $packages += $binaryPackage.FullName
    }
    return $packages
}

function Get-WindowsArchTag {
    $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
    if ($arch -eq "arm64") {
        return "arm64"
    }
    if ($arch -eq "x64") {
        return "x64"
    }
    return ""
}

function Get-LocalGptImage2SkillBinaryPackage {
    $vendorDir = Join-Path $PSScriptRoot "vendor"
    if (-not (Test-Path -LiteralPath $vendorDir)) {
        return $null
    }
    $archTag = Get-WindowsArchTag
    if (-not $archTag) {
        return $null
    }
    return Get-ChildItem -LiteralPath $vendorDir -Filter "gpt-image-2-skill-windows-$archTag-msvc-*.tgz" -File -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        Select-Object -First 1
}

function Set-ApiEnvValue {
    param(
        [string]$Key,
        [string]$Value
    )

    $envDir = Join-Path $root "API"
    $envFile = Join-Path $envDir ".env"
    New-Item -ItemType Directory -Force -Path $envDir | Out-Null

    $line = '{0}="{1}"' -f $Key, ($Value -replace '"', '\"')
    $pattern = '^\s*{0}\s*=' -f [regex]::Escape($Key)
    $lines = @()
    $updated = $false
    if (Test-Path -LiteralPath $envFile) {
        $lines = @(Get-Content -LiteralPath $envFile -Encoding UTF8)
        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -match $pattern) {
                $lines[$i] = $line
                $updated = $true
            }
        }
    }
    if (-not $updated) {
        $lines += $line
    }
    Set-Content -LiteralPath $envFile -Value $lines -Encoding UTF8
}

function Install-GptImage2SkillBundledBinary {
    $binaryPackage = Get-LocalGptImage2SkillBinaryPackage
    if (-not $binaryPackage) {
        return $false
    }

    $tar = Get-Command tar.exe -ErrorAction SilentlyContinue
    if (-not $tar) {
        $tar = Get-Command tar -ErrorAction SilentlyContinue
    }
    if (-not $tar) {
        Write-Host "Bundled GPT Image 2 binary package was found, but tar was not available to extract it."
        return $false
    }

    $binDir = Join-Path $PSScriptRoot "bin"
    $extractDir = Join-Path $binDir "_extract_gpt_image_2_skill"
    $exePath = Join-Path $binDir "gpt-image-2-skill.exe"
    New-Item -ItemType Directory -Force -Path $binDir | Out-Null
    if (Test-Path -LiteralPath $extractDir) {
        Remove-Item -LiteralPath $extractDir -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $extractDir | Out-Null

    Write-Host "Installing GPT Image 2 helper from bundled Windows binary..."
    & $tar.Source -xzf $binaryPackage.FullName -C $extractDir "package/bin/gpt-image-2-skill.exe"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to extract bundled GPT Image 2 helper binary."
        return $false
    }

    $extractedExe = Join-Path $extractDir "package\bin\gpt-image-2-skill.exe"
    if (-not (Test-Path -LiteralPath $extractedExe)) {
        Write-Host "Bundled GPT Image 2 helper binary was not found after extraction."
        return $false
    }
    Copy-Item -LiteralPath $extractedExe -Destination $exePath -Force
    Remove-Item -LiteralPath $extractDir -Recurse -Force

    $env:GPT_IMAGE_2_SKILL_BIN = $exePath
    $env:PATH = "$binDir;$env:PATH"
    Set-ApiEnvValue -Key "GPT_IMAGE_2_SKILL_BIN" -Value $exePath
    Write-Host "GPT Image 2 helper installed: $exePath"
    Write-Host "Project API/.env updated: GPT_IMAGE_2_SKILL_BIN"
    return $true
}

function Install-WithNpmFallback {
    $npm = Get-NpmCommand
    if (-not $npm) {
        throw "OpenAI standalone installer failed, and npm was not found for fallback install."
    }

    Write-Host "Falling back to npm package install: npm install -g @openai/codex"
    & $npm install -g "@openai/codex"
    if ($LASTEXITCODE -ne 0) {
        throw "npm fallback install failed with exit code $LASTEXITCODE."
    }
    Add-NpmPrefixToPath -NpmCommand $npm
}

function Install-GptImage2Skill {
    if (Install-GptImage2SkillBundledBinary) {
        return
    }

    $npm = Get-NpmCommand
    if (-not $npm) {
        Write-Host "npm was not found and no bundled GPT Image 2 helper binary was available. Please install Node.js 18+ and run this installer again."
        return
    }

    $localPackages = @(Get-LocalGptImage2SkillPackages)
    if ($localPackages.Count -gt 0) {
        Write-Host "Installing/updating GPT Image 2 helper from bundled packages..."
        foreach ($pkg in $localPackages) {
            Write-Host "  $pkg"
        }
        & $npm install -g @localPackages
    } else {
        Write-Host "Bundled GPT Image 2 helper package was not found. Falling back to npm registry: npm install -g gpt-image-2-skill"
        & $npm install -g "gpt-image-2-skill"
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "gpt-image-2-skill install failed with exit code $LASTEXITCODE. Codex CLI can still run, but Image 2 helper will be unavailable."
        return
    }
    Add-NpmPrefixToPath -NpmCommand $npm
}

try {
    Write-Host "=== OpenAI Codex CLI install/update ==="
    Write-Host "Workspace: $root"
    Write-Host ""

    if ($NonInteractive) {
        $env:CODEX_NON_INTERACTIVE = "1"
        Write-Host "CODEX_NON_INTERACTIVE=1"
    }

    Write-Host "Installing/updating Codex CLI with the official OpenAI standalone installer..."
    try {
        irm https://chatgpt.com/codex/install.ps1 | iex
    } catch {
        Write-Host "Standalone installer failed: $($_.Exception.Message)"
        Install-WithNpmFallback
    }
    Install-GptImage2Skill
    Write-Host ""

    $codex = Get-Command codex -ErrorAction SilentlyContinue
    if (-not $codex) {
        Write-Host "Codex CLI was installed, but 'codex' is not available in this PowerShell PATH yet."
        Write-Host "Close this window, open a new PowerShell, then run: codex"
        Pause-End
        exit 2
    }

    Write-Host "Codex CLI found: $($codex.Source)"
    try {
        & codex --version
    } catch {
        Write-Host "Could not read Codex version in this session. Open a new PowerShell and run: codex --version"
    }
    $gptImage2Skill = Get-Command gpt-image-2-skill -ErrorAction SilentlyContinue
    if ($gptImage2Skill) {
        Write-Host "GPT Image 2 helper found: $($gptImage2Skill.Source)"
    } else {
        Write-Host "GPT Image 2 helper is not available in this PowerShell PATH yet."
    }

    Write-Host ""
    Write-Host "Done. Run 'codex' in PowerShell to sign in and start using OpenAI Codex CLI."
    Write-Host "You can also double-click CLI\windows\openai\start_openai_codex_cli.bat."
    Pause-End
} catch {
    Write-Host "Error: $($_.Exception.Message)"
    Pause-End
    exit 1
}
