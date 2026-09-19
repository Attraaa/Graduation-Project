#!/bin/bash
MotiScripts="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$MotiScripts/toolchain.sh"
Assert-MotiPlatform

Task="${1:-app}"
case "$Task" in
    help)
        echo 'moti.command setup | app | server | keyboard | keyboard-web | check | package'
        exit 0 ;;
    setup)
        exec "$MotiScripts/setup.sh" ;;
    app|server|keyboard|keyboard-web|check|package) ;;
    *)
        echo "Unknown task: $Task" >&2
        echo 'moti.command setup | app | server | keyboard | keyboard-web | check | package' >&2
        exit 1 ;;
esac
Assert-MotiToolchain

Invoke-ProjectNpm() {
    ( cd "$MotiRoot/$1" && Invoke-MotiCommand "$MotiNode" "$MotiNpm" run "$2" )
}

Invoke-KeyboardPython() {
    ( cd "$MotiRoot/keyboard-detect" && Invoke-MotiCommand "$MotiUv" run --locked --managed-python --extra web "$@" )
}

case "$Task" in
    app) Invoke-ProjectNpm front dev ;;
    server) Invoke-ProjectNpm server dev ;;
    package)
        # front's package script targets electron-builder --win; on macOS this needs a
        # Windows-capable builder and is not part of the verified mac path.
        Invoke-ProjectNpm front package ;;
    check)
        Invoke-ProjectNpm front check
        Invoke-ProjectNpm front test
        Invoke-ProjectNpm server build
        Invoke-ProjectNpm server test
        Invoke-KeyboardPython python -m unittest discover -s tests
        Invoke-KeyboardPython python scripts/check_environment.py ;;
    keyboard-web)
        Invoke-KeyboardPython python -m keylog.service ;;
    keyboard)
        Invoke-KeyboardPython python keylog/examples/live_console_test.py --no-global-keylogger ;;
esac
