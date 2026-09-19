set -euo pipefail
MotiRoot="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

moti_toolchain_field() {
    sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$MotiRoot/toolchain.json"
}
MotiNodeVersion="$(moti_toolchain_field node)"
MotiNpmVersion="$(moti_toolchain_field npm)"
MotiPythonVersion="$(moti_toolchain_field python)"
MotiUvVersion="$(moti_toolchain_field uv)"

MotiTools="$MotiRoot/.tools"
MotiNodeDirectory="$MotiTools/node-v$MotiNodeVersion-darwin-arm64"
MotiNode="$MotiNodeDirectory/bin/node"
MotiNpm="$MotiNodeDirectory/lib/node_modules/npm/bin/npm-cli.js"
MotiUv="$MotiTools/uv-$MotiUvVersion/uv"

# These settings affect this process and its children only, never the Mac's PATH.
export PATH="$MotiNodeDirectory/bin:$PATH"
export UV_PYTHON_INSTALL_DIR="$MotiTools/python"
export UV_CACHE_DIR="$MotiTools/uv-cache"
export UV_LINK_MODE=copy
export npm_config_cache="$MotiTools/npm-cache"
export YOLO_CONFIG_DIR="$MotiTools/ultralytics"
export MPLCONFIGDIR="$MotiTools/matplotlib"
mkdir -p "$YOLO_CONFIG_DIR/Ultralytics" "$MPLCONFIGDIR"

Invoke-MotiCommand() {
    if ! "$@"; then
        echo "Command failed: $*" >&2
        exit 1
    fi
}

Assert-MotiPlatform() {
    if [ "$(uname -s)" != Darwin ] || [ "$(uname -m)" != arm64 ]; then
        echo "These scripts support macOS arm64. Use setup.cmd on Windows x64." >&2
        exit 1
    fi
}

Assert-MotiToolchain() {
    if [ ! -x "$MotiNode" ] || [ ! -x "$MotiUv" ]; then
        echo "Run setup.command first to install the project toolchain." >&2
        exit 1
    fi
    if [ "$("$MotiNode" --version)" != "v$MotiNodeVersion" ]; then
        echo "Node version differs from toolchain.json. Run setup.command." >&2
        exit 1
    fi
    if [ "$("$MotiNode" "$MotiNpm" --version)" != "$MotiNpmVersion" ]; then
        echo "npm version differs from toolchain.json. Run setup.command." >&2
        exit 1
    fi
}
