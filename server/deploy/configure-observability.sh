#!/usr/bin/env bash
# Install a private OTLP environment without overwriting business credentials.
set -euo pipefail
deploy_dir="$(cd "$(dirname "$0")" && pwd)"
source "$deploy_dir/lib.sh"
: "${COLAB_OBSERVABILITY_ENV:?Set COLAB_OBSERVABILITY_ENV to the private generated exporter env}"
[[ -f "$COLAB_OBSERVABILITY_ENV" ]]
deploy_ssh 'install -o root -g agent-colab -m 0640 /dev/stdin /etc/agent-colab/observability.env' < "$COLAB_OBSERVABILITY_ENV"
deploy_ssh "SERVICE_NAME=$(printf %q "$DEPLOY_SERVICE_NAME") bash -s" <<'REMOTE'
set -euo pipefail
install -d -m 0755 "/etc/systemd/system/$SERVICE_NAME.service.d"
printf '[Service]\nEnvironmentFile=/etc/agent-colab/observability.env\n' > "/etc/systemd/system/$SERVICE_NAME.service.d/observability.conf"
systemctl daemon-reload
printf 'observability_configuration=ready; activation_requires_restart\n'
REMOTE
