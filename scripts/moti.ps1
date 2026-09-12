param([ValidateSet('help', 'setup', 'app', 'server', 'keyboard', 'keyboard-web', 'check', 'package')][string]$Task = 'app')
. (Join-Path $PSScriptRoot 'toolchain.ps1')
if ($Task -eq 'help') {
    Write-Host 'moti.cmd setup | app | server | keyboard | keyboard-web | check | package'
    exit 0
}
if ($Task -eq 'setup') { & (Join-Path $PSScriptRoot 'setup.ps1'); exit $LASTEXITCODE }
Assert-MotiToolchain

function Invoke-ProjectNpm {
    param([string]$Project, [string]$Script)
    Push-Location (Join-Path $MotiRoot $Project)
    try { Invoke-MotiCommand $MotiNode @($MotiNpm, 'run', $Script) }
    finally { Pop-Location }
}

switch ($Task) {
    'app' { Invoke-ProjectNpm 'front' 'dev' }
    'server' { Invoke-ProjectNpm 'server' 'dev' }
    'package' { Invoke-ProjectNpm 'front' 'package' }
    'check' {
        Invoke-ProjectNpm 'front' 'check'
        Invoke-ProjectNpm 'front' 'test'
        Invoke-ProjectNpm 'server' 'build'
        Invoke-ProjectNpm 'server' 'test'
        Push-Location (Join-Path $MotiRoot 'keyboard-detect')
        try { Invoke-MotiCommand $MotiUv @('run', '--locked', '--managed-python', '--extra', 'web', 'python', 'scripts/check_environment.py') }
        finally { Pop-Location }
    }
    { $_ -in @('keyboard', 'keyboard-web') } {
        Push-Location (Join-Path $MotiRoot 'keyboard-detect')
        try {
            if ($Task -eq 'keyboard-web') {
                Invoke-MotiCommand $MotiUv @('run', '--locked', '--managed-python', '--extra', 'web', 'python', '-m', 'keylog.service')
            } else {
                Invoke-MotiCommand $MotiUv @('run', '--locked', '--managed-python', '--extra', 'web', 'python', 'keylog/examples/live_console_test.py', '--no-global-keylogger')
            }
        } finally { Pop-Location }
    }
}
