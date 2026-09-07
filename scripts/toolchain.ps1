$ErrorActionPreference = 'Stop'
$MotiRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$MotiToolchain = Get-Content -Raw -LiteralPath (Join-Path $MotiRoot 'toolchain.json') | ConvertFrom-Json
$MotiTools = Join-Path $MotiRoot '.tools'
$MotiNodeDirectory = Join-Path $MotiTools "node-v$($MotiToolchain.node)-win-x64"
$MotiNode = Join-Path $MotiNodeDirectory 'node.exe'
$MotiNpm = Join-Path $MotiNodeDirectory 'node_modules/npm/bin/npm-cli.js'
$MotiUv = Join-Path $MotiTools "uv-$($MotiToolchain.uv)/uv.exe"

# These settings affect this process and its children only, never the PC's PATH.
$env:Path = "$MotiNodeDirectory;$env:Path"
$env:UV_PYTHON_INSTALL_DIR = Join-Path $MotiTools 'python'
$env:UV_CACHE_DIR = Join-Path $MotiTools 'uv-cache'
$env:UV_LINK_MODE = 'copy'
$env:npm_config_cache = Join-Path $MotiTools 'npm-cache'
$env:YOLO_CONFIG_DIR = Join-Path $MotiTools 'ultralytics'
$env:MPLCONFIGDIR = Join-Path $MotiTools 'matplotlib'
New-Item -ItemType Directory -Force -Path (Join-Path $env:YOLO_CONFIG_DIR 'Ultralytics'),$env:MPLCONFIGDIR | Out-Null

function Invoke-MotiCommand {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed (exit $LASTEXITCODE): $Executable $($Arguments -join ' ')"
    }
}

function Assert-MotiToolchain {
    if (-not (Test-Path -LiteralPath $MotiNode) -or -not (Test-Path -LiteralPath $MotiUv)) {
        throw 'Run setup.cmd first to install the project toolchain.'
    }
    if ((& $MotiNode --version) -ne "v$($MotiToolchain.node)") { throw 'Node version differs from toolchain.json. Run setup.cmd.' }
    if ((& $MotiNode $MotiNpm --version) -ne $MotiToolchain.npm) { throw 'npm version differs from toolchain.json. Run setup.cmd.' }
}
