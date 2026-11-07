. (Join-Path $PSScriptRoot 'toolchain.ps1')
Assert-MotiToolchain
if (-not [Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([Runtime.InteropServices.OSPlatform]::Windows) -or [Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64') {
    throw 'Keyboard packaging requires Windows x64.'
}

Push-Location (Join-Path $MotiRoot 'keyboard-detect')
try {
    Invoke-MotiCommand $MotiUv @('run', '--locked', '--managed-python', '--extra', 'web', '--group', 'build',
        'python', '-m', 'PyInstaller', '--noconfirm', '--distpath', 'dist', '--workpath', 'build', 'packaging/moti-keyboard.spec')
    # A missing model or dynamic import must fail the package command, not the user's installation.
    Invoke-MotiCommand $MotiUv @('run', '--locked', '--managed-python', '--extra', 'web', '--group', 'build',
        'python', 'scripts/check_package.py', 'dist/moti-keyboard/moti-keyboard.exe')
}
finally { Pop-Location }
