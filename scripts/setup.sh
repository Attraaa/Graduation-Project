#!/bin/bash
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/toolchain.sh"
Assert-MotiPlatform

ToolsOnly=0
if [ "${1:-}" = "--tools-only" ]; then ToolsOnly=1; fi

downloads="$MotiTools/downloads"
mkdir -p "$downloads"

Get-VerifiedArchive() {
    local url="$1" name="$2" sha256="$3"
    local archive="$downloads/$name"
    if [ ! -f "$archive" ] || [ "$(shasum -a 256 "$archive" | cut -d' ' -f1)" != "$sha256" ]; then
        echo "Downloading $name" >&2
        curl -fsSL -o "$archive" "$url"
    fi
    if [ "$(shasum -a 256 "$archive" | cut -d' ' -f1)" != "$sha256" ]; then
        echo "Checksum failed for $name. No downloaded program was executed." >&2
        exit 1
    fi
    printf '%s' "$archive"
}

nodeArchive="$(Get-VerifiedArchive \
    "https://nodejs.org/dist/v$MotiNodeVersion/node-v$MotiNodeVersion-darwin-arm64.tar.gz" \
    "node-$MotiNodeVersion.tar.gz" "$(moti_toolchain_field nodeDarwinArm64Sha256)")"
if [ ! -x "$MotiNode" ]; then
    mkdir -p "$MotiNodeDirectory"
    tar -xzf "$nodeArchive" -C "$MotiNodeDirectory" --strip-components=1
fi

uvArchive="$(Get-VerifiedArchive \
    "https://github.com/astral-sh/uv/releases/download/$MotiUvVersion/uv-aarch64-apple-darwin.tar.gz" \
    "uv-$MotiUvVersion.tar.gz" "$(moti_toolchain_field uvDarwinArm64Sha256)")"
if [ ! -x "$MotiUv" ]; then
    mkdir -p "$(dirname "$MotiUv")"
    tar -xzf "$uvArchive" -C "$(dirname "$MotiUv")" --strip-components=1
fi

Assert-MotiToolchain
echo "Toolchain ready: Node $MotiNodeVersion, npm $MotiNpmVersion, uv $MotiUvVersion"
if [ "$ToolsOnly" = 1 ]; then exit 0; fi

for project in front server; do
    ( cd "$MotiRoot/$project" && Invoke-MotiCommand "$MotiNode" "$MotiNpm" ci --no-fund )
done

# uv downloads this exact CPython into .tools/python; a global Python is not used.
if ! ( cd "$MotiRoot/keyboard-detect" && "$MotiUv" sync --locked --managed-python --python "$MotiPythonVersion" --extra web ); then
    echo >&2
    echo "Python setup failed. keyboard-detect/uv.lock currently resolves only for" >&2
    echo "sys_platform == 'win32' and platform_machine == 'AMD64' (tool.uv.environments" >&2
    echo "in keyboard-detect/pyproject.toml). Adding macOS needs a team decision and a" >&2
    echo "regenerated uv.lock. front and server are installed and usable." >&2
    exit 1
fi

serverEnv="$MotiRoot/server/.env"
if [ ! -f "$serverEnv" ]; then
    secret="$(openssl rand -base64 48)"
    sed "s|^JWT_SECRET=.*$|JWT_SECRET=$secret|" "$MotiRoot/server/.env.example" > "$serverEnv"
fi
echo 'Setup complete. Use moti.command app, server, keyboard, or check.'
echo 'Database access is configured separately in server/.env. Setup does not create or reset a database.'
