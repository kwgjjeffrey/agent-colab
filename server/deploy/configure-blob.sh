#!/usr/bin/env bash
set -euo pipefail
deploy_dir="$(cd "$(dirname "$0")" && pwd)"
source "$deploy_dir/lib.sh"
: "${COLAB_BLOB_ENV_FILE:?Set COLAB_BLOB_ENV_FILE to a private storage environment file}"
[[ -f "$COLAB_BLOB_ENV_FILE" ]] || exit 2
# Storage configuration is independently installed; keep provider credentials out of artifacts.
deploy_ssh "install -o root -g agent-colab -m 0640 /dev/stdin /etc/agent-colab/blob.env" < "$COLAB_BLOB_ENV_FILE"
deploy_ssh "install -d /etc/systemd/system/$DEPLOY_SERVICE_NAME.service.d; printf '[Service]\nEnvironmentFile=/etc/agent-colab/blob.env\n' > /etc/systemd/system/$DEPLOY_SERVICE_NAME.service.d/blob.conf; systemctl daemon-reload"
printf 'blob_configuration=installed\n'
