#!/usr/bin/env bash
set -euo pipefail
deploy_dir="$(cd "$(dirname "$0")" && pwd)"
source "$deploy_dir/lib.sh"

artifact=${COLAB_SERVER_ARTIFACT:-}
remote_source=${COLAB_SERVER_REMOTE_ARTIFACT:-}
if [[ -z "$remote_source" && ( -z "$artifact" || ! -f "$artifact" ) ]]; then
  echo "Set COLAB_SERVER_ARTIFACT to a Linux x86_64 colab-server binary." >&2
  exit 2
fi
if [[ -z "$remote_source" && ! -x "$artifact" ]]; then
  echo "Artifact is not executable: $artifact" >&2
  exit 2
fi

version=${COLAB_SERVER_VERSION:-$(date -u +%Y%m%dT%H%M%SZ)}
release_dir="$DEPLOY_APP_ROOT/releases/$version"
remote_artifact="$release_dir/colab-server"
if [[ -n "$remote_source" ]]; then
  [[ "$remote_source" =~ ^/tmp/agent-colab-build-[a-zA-Z0-9._-]+/colab-server$ ]] || { echo "Invalid build-host artifact path" >&2; exit 2; }
  artifact_digest=$(deploy_ssh "sha256sum '$remote_source'" | awk '{print $1}')
else
  artifact_digest=$(shasum -a 256 "$artifact" | awk '{print $1}')
fi

# Published versions are immutable even when independent tasks deploy concurrently.
existing_digest=$(deploy_ssh "if test -f '$remote_artifact'; then sha256sum '$remote_artifact'; fi" | awk '{print $1}')
if [[ -n "$existing_digest" && "$existing_digest" != "$artifact_digest" ]]; then
  echo "Release $version already contains different bytes; allocate a new version." >&2
  exit 2
fi
upload_path="$remote_artifact.uploading-$$"

deploy_ssh "install -d -m 0755 '$release_dir' '$DEPLOY_APP_ROOT/releases'"
if [[ -n "$remote_source" ]]; then
  deploy_ssh "install -m 0755 '$remote_source' '$upload_path'"
else
  scp "${scp_options[@]}" "$artifact" "$deploy_target:$upload_path"
fi
deploy_ssh "set -e; printf '%s\n' '$artifact_digest  $upload_path' | sha256sum --check --status; chmod 0755 '$upload_path'; if test -f '$remote_artifact'; then printf '%s\n' '$artifact_digest  $remote_artifact' | sha256sum --check --status; else ln '$upload_path' '$remote_artifact'; fi; rm '$upload_path'; ln -sfn '$release_dir' '$DEPLOY_APP_ROOT/current'; systemctl restart '$DEPLOY_SERVICE_NAME'; curl -fsS --retry 12 --retry-connrefused --retry-delay 1 '$DEPLOY_HEALTH_URL' >/dev/null"
printf 'deployed_version=%s\n' "$version"
printf 'remote_release=%s\n' "$release_dir"
