#!/usr/bin/env bash
set -euo pipefail
deploy_dir="$(cd "$(dirname "$0")" && pwd)"
source "$deploy_dir/lib.sh"

artifact=${COLAB_SERVER_ARTIFACT:-}
if [[ -z "$artifact" || ! -f "$artifact" ]]; then
  echo "Set COLAB_SERVER_ARTIFACT to a Linux x86_64 colab-server binary." >&2
  exit 2
fi
if [[ ! -x "$artifact" ]]; then
  echo "Artifact is not executable: $artifact" >&2
  exit 2
fi

version=${COLAB_SERVER_VERSION:-$(date -u +%Y%m%dT%H%M%SZ)}
release_dir="$DEPLOY_APP_ROOT/releases/$version"
remote_artifact="$release_dir/colab-server"

deploy_ssh "install -d -m 0755 '$release_dir' '$DEPLOY_APP_ROOT/releases'"
scp "${scp_options[@]}" "$artifact" "$deploy_target:$remote_artifact.uploading"
deploy_ssh "set -e; chmod 0755 '$remote_artifact.uploading'; mv '$remote_artifact.uploading' '$remote_artifact'; ln -sfn '$release_dir' '$DEPLOY_APP_ROOT/current'; systemctl restart '$DEPLOY_SERVICE_NAME'; curl -fsS --retry 12 --retry-connrefused --retry-delay 1 '$DEPLOY_HEALTH_URL' >/dev/null"
printf 'deployed_version=%s\n' "$version"
printf 'remote_release=%s\n' "$release_dir"
