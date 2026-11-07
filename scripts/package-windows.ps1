. (Join-Path $PSScriptRoot 'toolchain.ps1')
Assert-MotiToolchain

$packageOutput = Join-Path $MotiRoot 'front/release'
$packageCacheRoot = [IO.Path]::GetFullPath((Join-Path $MotiRoot 'front/.moti-cache'))
$packageStage = Join-Path $packageCacheRoot ('package-' + [Guid]::NewGuid().ToString('N'))
$packageSucceeded = $false

Write-Host '[1/4] Building and checking the bundled keyboard analyzer...'
& (Join-Path $PSScriptRoot 'package-keyboard.ps1')

Push-Location (Join-Path $MotiRoot 'front')
try {
    Write-Host '[2/4] Building the app...'
    Invoke-MotiCommand $MotiNode @($MotiNpm, 'run', 'build')
    Write-Host '[3/4] Creating Windows Setup (compressing the bundled runtime takes several minutes)...'
    # A fresh stage avoids overwriting app.asar files held by an app or Windows scanner.
    # Reuse the locked, installed Electron distribution instead of zip extraction/rename.
    Invoke-MotiCommand $MotiNode @('node_modules/electron-builder/cli.js', '--win', '--x64',
        "--config.directories.output=$packageStage", '--config.electronDist=node_modules/electron/dist')
    $installerName = 'Moti Setup ' + (Get-Content package.json -Raw | ConvertFrom-Json).version + '.exe'
    $installer = Join-Path $packageStage $installerName
    $blockmap = $installer + '.blockmap'
    if (-not (Test-Path -LiteralPath $installer) -or -not (Test-Path -LiteralPath $blockmap)) {
        throw 'Packaging finished without the expected Setup and blockmap files.'
    }
    New-Item -ItemType Directory -Force -Path $packageOutput | Out-Null
    Write-Host '[4/4] Saving the completed Setup...'
    Copy-Item -LiteralPath $installer -Destination (Join-Path $packageOutput $installerName) -Force
    Copy-Item -LiteralPath $blockmap -Destination (Join-Path $packageOutput ($installerName + '.blockmap')) -Force
    $packageSucceeded = $true
    Write-Host "Setup complete: $(Join-Path $packageOutput $installerName)"
}
finally {
    Pop-Location
    if ($packageSucceeded) {
        $resolvedPackageStage = [IO.Path]::GetFullPath($packageStage)
        if (-not $resolvedPackageStage.StartsWith($packageCacheRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Refusing to clean a package stage outside the project cache.'
        }
        try { Remove-Item -LiteralPath $resolvedPackageStage -Recurse -Force -ErrorAction Stop }
        catch { Write-Warning "Setup is complete; Windows still holds a temporary build file in $resolvedPackageStage" }
    }
}
