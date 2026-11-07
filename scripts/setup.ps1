param([switch]$ToolsOnly, [switch]$ForceInstall)
# Use this PowerShell's modules even when a parent shell passes another version's PSModulePath.
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1') -ErrorAction Stop
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Archive/Microsoft.PowerShell.Archive.psd1') -ErrorAction Stop
. (Join-Path $PSScriptRoot 'toolchain.ps1')

if (-not [Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([Runtime.InteropServices.OSPlatform]::Windows) -or [Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64') {
    throw 'This toolchain currently supports Windows x64. ARM64 requires separate AI wheel validation.'
}
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'
$downloads = Join-Path $MotiTools 'downloads'
New-Item -ItemType Directory -Force -Path $downloads | Out-Null

function Get-VerifiedArchive {
    param([string]$Url, [string]$Name, [string]$Sha256)
    $archive = Join-Path $downloads $Name
    if (-not (Test-Path -LiteralPath $archive) -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $Sha256) {
        Write-Host "Downloading $Name"
        Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $archive
    }
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $Sha256) {
        throw "Checksum failed for $Name. No downloaded program was executed."
    }
    return $archive
}

if (-not (Test-Path -LiteralPath $MotiNode)) {
    $nodeArchive = Get-VerifiedArchive "https://nodejs.org/dist/v$($MotiToolchain.node)/node-v$($MotiToolchain.node)-win-x64.zip" "node-$($MotiToolchain.node).zip" $MotiToolchain.nodeWindowsX64Sha256
    Expand-Archive -LiteralPath $nodeArchive -DestinationPath $MotiTools -Force
}
if (-not (Test-Path -LiteralPath $MotiUv)) {
    $uvArchive = Get-VerifiedArchive "https://github.com/astral-sh/uv/releases/download/$($MotiToolchain.uv)/uv-x86_64-pc-windows-msvc.zip" "uv-$($MotiToolchain.uv).zip" $MotiToolchain.uvWindowsX64Sha256
    Expand-Archive -LiteralPath $uvArchive -DestinationPath (Split-Path $MotiUv) -Force
}
Assert-MotiToolchain
Write-Host "Toolchain ready: Node $($MotiToolchain.node), npm $($MotiToolchain.npm), uv $($MotiToolchain.uv)"
if ($ToolsOnly) { exit 0 }

foreach ($project in @('front', 'server')) {
    Push-Location (Join-Path $MotiRoot $project)
    try {
        $stamp = Join-Path (Get-Location).Path 'node_modules/.moti-install-fingerprint'
        $fingerprint = (@('package.json', 'package-lock.json', (Join-Path $MotiRoot 'toolchain.json')) | ForEach-Object {
            (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash
        }) -join ':'
        $reuse = -not $ForceInstall -and (Test-Path -LiteralPath $stamp) -and (Get-Content -Raw -LiteralPath $stamp).Trim() -eq $fingerprint
        if ($reuse) {
            Write-Host "Checking existing $project dependencies..."
            & $MotiNode $MotiNpm ls --all --offline *> $null
            $reuse = $LASTEXITCODE -eq 0
        }
        if ($reuse) { Write-Host "$project dependencies unchanged; reusing installation." }
        else {
            # Write only after successful installation. A failed or removed tree is never cached.
            if (Test-Path -LiteralPath $stamp) { Remove-Item -LiteralPath $stamp }
            Write-Host "Installing locked $project dependencies (first install or changed inputs)..."
            Invoke-MotiCommand $MotiNode @($MotiNpm, 'ci', '--no-fund')
            [IO.File]::WriteAllText($stamp, $fingerprint)
        }
        if ($project -eq 'front') { Invoke-MotiCommand $MotiNode @('scripts/copy-mediapipe.mjs') }
    }
    finally { Pop-Location }
}

# uv downloads this exact CPython into .tools/python; a global Python is not used.
Push-Location (Join-Path $MotiRoot 'keyboard-detect')
try { Invoke-MotiCommand $MotiUv @('sync', '--locked', '--managed-python', '--python', $MotiToolchain.python, '--extra', 'web') }
finally { Pop-Location }

$serverEnv = Join-Path $MotiRoot 'server/.env'
if (-not (Test-Path -LiteralPath $serverEnv)) {
    $bytes = New-Object byte[] 48
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $secret = [Convert]::ToBase64String($bytes)
    $example = Get-Content -Raw -LiteralPath (Join-Path $MotiRoot 'server/.env.example')
    $example = $example -replace '(?m)^JWT_SECRET=.*$', "JWT_SECRET=$secret"
    [IO.File]::WriteAllText($serverEnv, $example, (New-Object Text.UTF8Encoding $false))
}
Write-Host 'Setup complete. Use moti.cmd app, server, keyboard, or check.'
Write-Host 'Database access is configured separately in server/.env. Setup does not create or reset a database.'
