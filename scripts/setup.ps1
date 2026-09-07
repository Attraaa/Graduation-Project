param([switch]$ToolsOnly)
. (Join-Path $PSScriptRoot 'toolchain.ps1')

if ($env:OS -ne 'Windows_NT' -or [Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64') {
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

$nodeArchive = Get-VerifiedArchive "https://nodejs.org/dist/v$($MotiToolchain.node)/node-v$($MotiToolchain.node)-win-x64.zip" "node-$($MotiToolchain.node).zip" $MotiToolchain.nodeWindowsX64Sha256
if (-not (Test-Path -LiteralPath $MotiNode)) {
    Expand-Archive -LiteralPath $nodeArchive -DestinationPath $MotiTools -Force
}
$uvArchive = Get-VerifiedArchive "https://github.com/astral-sh/uv/releases/download/$($MotiToolchain.uv)/uv-x86_64-pc-windows-msvc.zip" "uv-$($MotiToolchain.uv).zip" $MotiToolchain.uvWindowsX64Sha256
if (-not (Test-Path -LiteralPath $MotiUv)) {
    Expand-Archive -LiteralPath $uvArchive -DestinationPath (Split-Path $MotiUv) -Force
}
Assert-MotiToolchain
Write-Host "Toolchain ready: Node $($MotiToolchain.node), npm $($MotiToolchain.npm), uv $($MotiToolchain.uv)"
if ($ToolsOnly) { exit 0 }

foreach ($project in @('front', 'server')) {
    Push-Location (Join-Path $MotiRoot $project)
    try { Invoke-MotiCommand $MotiNode @($MotiNpm, 'ci', '--no-fund') }
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
