#!/usr/bin/env bash
set -euo pipefail

deploy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
deploy_config="${COLAB_DEPLOY_CONFIG:-$deploy_dir/.env.local}"

if [[ ! -f "$deploy_config" ]]; then
  echo "Missing deployment config: $deploy_config" >&2
  echo "Copy $deploy_dir/.env.example to .env.local and fill it in." >&2
  exit 2
fi

set -a
# The config is local-only and intentionally uses shell-compatible KEY=VALUE lines.
source "$deploy_config"
set +a

: "${DEPLOY_SSH_HOST:?DEPLOY_SSH_HOST is required}"
: "${DEPLOY_SSH_USER:?DEPLOY_SSH_USER is required}"
: "${DEPLOY_SSH_PORT:=22}"
: "${DEPLOY_APP_ROOT:=/opt/agent-colab}"
: "${DEPLOY_SERVICE_NAME:=agent-colab-server}"
: "${DEPLOY_HEALTH_URL:=http://127.0.0.1:8787/health/ready}"

deploy_target="${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST}"
ssh_options=(-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new -p "$DEPLOY_SSH_PORT")
scp_options=(-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new -P "$DEPLOY_SSH_PORT")

deploy_ssh() {
  ssh "${ssh_options[@]}" "$deploy_target" "$@"
}
