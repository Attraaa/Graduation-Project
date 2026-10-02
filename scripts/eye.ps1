# Frontend-only eye demo. Does not install Python, run the API, or touch the DB.
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1') -ErrorAction Stop
. (Join-Path $PSScriptRoot 'toolchain.ps1')
if (-not (Test-Path -LiteralPath $MotiNode) -or -not (Test-Path -LiteralPath $MotiUv)) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'setup.ps1') -ToolsOnly
    if ($LASTEXITCODE -ne 0) { throw 'Toolchain setup failed.' }
}
Assert-MotiToolchain
Push-Location (Join-Path $MotiRoot 'front')
try {
    $lockHash = (Get-FileHash -LiteralPath 'package-lock.json' -Algorithm SHA256).Hash
    $stamp = '.moti-cache/eye-install-lock.txt'
    if (-not (Test-Path -LiteralPath 'node_modules/.bin/vite.cmd') -or
        -not (Test-Path -LiteralPath $stamp) -or (Get-Content -Raw -LiteralPath $stamp).Trim() -ne $lockHash) {
        # Keep Electron's install step: this checkout may also run the desktop app.
        Invoke-MotiCommand $MotiNode @($MotiNpm, 'ci', '--no-fund', '--no-audit')
        New-Item -ItemType Directory -Force -Path '.moti-cache' | Out-Null
        Set-Content -LiteralPath $stamp -Value $lockHash
    }
    Write-Host 'Opening the eye demo in your browser. Stop with Ctrl+C. Camera requires localhost or HTTPS.'
    Invoke-MotiCommand $MotiNode @($MotiNpm, 'run', 'dev:browser', '--', '--host', '127.0.0.1', '--open', '/#/learn/eye')
} finally { Pop-Location }
