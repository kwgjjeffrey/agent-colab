#!/usr/bin/env bash
set -euo pipefail
deploy_dir="$(cd "$(dirname "$0")" && pwd)"
source "$deploy_dir/lib.sh"

source_env=${COLAB_SERVER_SOURCE_ENV:-$deploy_dir/../standalone/.env.local}
if [[ ! -f "$source_env" ]]; then
  echo "Missing source environment: $source_env" >&2
  exit 2
fi

credentials=$(awk -F= '$1=="COLAB_GOOGLE_OAUTH_CREDENTIALS_FILE"{sub(/^[^=]*=/,"");print;exit}' "$source_env")
if [[ -z "$credentials" || ! -f "$credentials" ]]; then
  echo "Google OAuth credentials file is missing." >&2
  exit 2
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp "$credentials" "$tmp/google-oauth.json"
chmod 0600 "$tmp/google-oauth.json"

# Preserve only supported non-secret provider settings from the local ignored env.
cloudflare_account=$(awk -F= '$1=="COLAB_CLOUDFLARE_EMAIL_ACCOUNT_ID"{sub(/^[^=]*=/,"");print;exit}' "$source_env")
cloudflare_token=$(awk -F= '$1=="COLAB_CLOUDFLARE_EMAIL_API_TOKEN"{sub(/^[^=]*=/,"");print;exit}' "$source_env")
email_from=$(awk -F= '$1=="COLAB_EMAIL_FROM"{sub(/^[^=]*=/,"");print;exit}' "$source_env")
public_url=${COLAB_DEPLOY_PUBLIC_URL:-http://$DEPLOY_SSH_HOST:8787}

deploy_ssh "install -o root -g agent-colab -m 0640 /dev/stdin /etc/agent-colab/google-oauth.json" < "$tmp/google-oauth.json"
deploy_ssh "PUBLIC_URL=$(printf %q "$public_url") CF_ACCOUNT=$(printf %q "$cloudflare_account") CF_TOKEN=$(printf %q "$cloudflare_token") EMAIL_FROM=$(printf %q "$email_from") bash -s" <<'REMOTE'
set -euo pipefail
db_password=$(cat /etc/agent-colab/database-password)
umask 027
cat >/etc/agent-colab/server.env <<ENV
COLAB_SERVER_ADDRESS=0.0.0.0:8787
COLAB_DATABASE_URL=postgresql://agent_colab:${db_password}@127.0.0.1:5432/agent_colab
COLAB_DATABASE_MAX_CONNECTIONS=10
COLAB_GOOGLE_OAUTH_CREDENTIALS_FILE=/etc/agent-colab/google-oauth.json
COLAB_PUBLIC_URL=${PUBLIC_URL}
COLAB_BLOB_ROOT=/var/lib/agent-colab/blobs
COLAB_CLOUDFLARE_EMAIL_ACCOUNT_ID=${CF_ACCOUNT}
COLAB_CLOUDFLARE_EMAIL_API_TOKEN=${CF_TOKEN}
COLAB_EMAIL_FROM=${EMAIL_FROM}
ENV
chown root:agent-colab /etc/agent-colab/server.env
chmod 0640 /etc/agent-colab/server.env
printf 'configuration=ready\n'
REMOTE
