#!/usr/bin/env bash
set -euo pipefail
deploy_dir="$(cd "$(dirname "$0")" && pwd)"
source "$deploy_dir/lib.sh"

# Idempotent host preparation. Runtime secrets stay on the host under /etc;
# checked-in deployment scripts never contain the SSH target or database password.
deploy_ssh "DEPLOY_APP_ROOT=$(printf %q "$DEPLOY_APP_ROOT") DEPLOY_SERVICE_NAME=$(printf %q "$DEPLOY_SERVICE_NAME") bash -s" <<'REMOTE'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl build-essential pkg-config postgresql

id -u agent-colab >/dev/null 2>&1 || useradd --system --home-dir /var/lib/agent-colab --create-home --shell /usr/sbin/nologin agent-colab
install -d -o agent-colab -g agent-colab -m 0750 /var/lib/agent-colab /var/lib/agent-colab/blobs
install -d -o root -g agent-colab -m 0750 /etc/agent-colab
install -d -o root -g root -m 0755 "$DEPLOY_APP_ROOT/releases"

systemctl enable --now postgresql
db_password_file=/etc/agent-colab/database-password
if [[ ! -s "$db_password_file" ]]; then
  umask 027
  openssl rand -hex 24 > "$db_password_file"
  chown root:agent-colab "$db_password_file"
  chmod 0640 "$db_password_file"
fi
db_password=$(cat "$db_password_file")
sudo -u postgres psql -v ON_ERROR_STOP=1 --set=password="$db_password" <<'SQL'
SELECT format('CREATE ROLE agent_colab LOGIN PASSWORD %L', :'password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_colab') \gexec
SELECT 'CREATE DATABASE agent_colab OWNER agent_colab'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'agent_colab') \gexec
ALTER ROLE agent_colab PASSWORD :'password';
SQL

cat >"/etc/systemd/system/${DEPLOY_SERVICE_NAME}.service" <<UNIT
[Unit]
Description=Agent Colab Server
After=network-online.target postgresql.service
Wants=network-online.target
Requires=postgresql.service

[Service]
Type=simple
User=agent-colab
Group=agent-colab
EnvironmentFile=/etc/agent-colab/server.env
ExecStart=${DEPLOY_APP_ROOT}/current/colab-server
WorkingDirectory=/var/lib/agent-colab
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/agent-colab

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable "$DEPLOY_SERVICE_NAME"
printf 'bootstrap=ready\n'
REMOTE
