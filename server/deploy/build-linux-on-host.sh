#!/usr/bin/env bash
set -euo pipefail
deploy_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$deploy_dir/../.." && pwd)"
source "$deploy_dir/lib.sh"

version=${COLAB_SERVER_VERSION:-$(tr -d '[:space:]' < "$repo_root/VERSION")}
remote_build="/tmp/agent-colab-build-$version-$$"
staging=$(mktemp -d "${TMPDIR:-/tmp}/agent-colab-server.XXXXXX")
archive="$staging/source.tar.gz"
trap 'rm -rf "$staging"' EXIT

# Build from an explicit source archive so the deployed binary is reproducible and
# does not depend on an untracked checkout existing on the server.
tar -C "$repo_root/server/standalone" \
  --exclude target --exclude .env.local --exclude '.DS_Store' \
  -czf "$archive" .
deploy_ssh "install -d -m 0755 '$remote_build'"
scp "${scp_options[@]}" "$archive" "$deploy_target:$remote_build/source.tar.gz"
deploy_ssh "set -euo pipefail; if ! command -v cargo >/dev/null; then curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal; fi; tar -xzf '$remote_build/source.tar.gz' -C '$remote_build'; . /root/.cargo/env; cd '$remote_build'; CARGO_TARGET_DIR=/var/cache/agent-colab/cargo-target cargo build --locked --release -p colab-server; install -m 0755 /var/cache/agent-colab/cargo-target/release/colab-server '$remote_build/colab-server'"
mkdir -p "$repo_root/dist/server/$version/linux-x86_64"
scp "${scp_options[@]}" "$deploy_target:$remote_build/colab-server" "$repo_root/dist/server/$version/linux-x86_64/colab-server"
deploy_ssh "rm -rf '$remote_build'"
printf '%s\n' "$repo_root/dist/server/$version/linux-x86_64/colab-server"
