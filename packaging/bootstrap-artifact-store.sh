#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
source "$repo_root/server/deploy/lib.sh"
remote_root=${COLAB_ARTIFACT_ROOT:-/var/www/agent-colab/artifacts}

# The VPS adapter is only one distribution provider. Open-source deployments can
# replace it with S3/R2/another CDN without changing package or update contracts.
deploy_ssh "REMOTE_ROOT=$(printf %q "$remote_root") bash -s" <<'REMOTE'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends nginx
install -d -m 0755 "$REMOTE_ROOT/releases" "$REMOTE_ROOT/channels"
cat >/etc/nginx/sites-available/agent-colab <<'NGINX'
server {
    listen 80 default_server;
    server_name _;
    location /artifacts/ {
        alias /var/www/agent-colab/artifacts/;
        autoindex off;
        add_header Cache-Control "public, max-age=300" always;
    }
    location /health/ { proxy_pass http://127.0.0.1:8787; }
    location /v1/ { proxy_pass http://127.0.0.1:8787; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; }
}
NGINX
rm -f /etc/nginx/sites-enabled/default
ln -sfn /etc/nginx/sites-available/agent-colab /etc/nginx/sites-enabled/agent-colab
nginx -t
systemctl enable --now nginx
systemctl reload nginx
REMOTE
