#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
config_file="${COLAB_R2_CONFIG:-$repo_root/packaging/.env.local}"

[[ -f "$config_file" ]] || {
  echo "Missing ignored R2 configuration: $config_file" >&2
  echo "Copy packaging/.env.local.example and fill in the deployment values." >&2
  exit 2
}

set -a
# shellcheck disable=SC1090
source "$config_file"
set +a

: "${R2_BUCKET:?R2_BUCKET is required}"
: "${R2_ENDPOINT:?R2_ENDPOINT is required}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is required}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is required}"
: "${R2_PUBLIC_BASE_URL:?R2_PUBLIC_BASE_URL is required}"

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION=auto
export COLAB_RELEASE_SIGNING_KEY="${COLAB_RELEASE_SIGNING_KEY:-$HOME/.config/agent-colab/release-signing-key}"

# boto3 is the maintained S3 implementation. uv keeps this release-only
# dependency out of all runtime artifacts.
exec uv run --quiet --with boto3 "$repo_root/packaging/publish_r2.py" --repo "$repo_root"
