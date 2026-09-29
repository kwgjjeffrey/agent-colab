#!/usr/bin/env bash
set -euo pipefail
deploy_dir="$(cd "$(dirname "$0")" && pwd)"
source "$deploy_dir/lib.sh"

if (($#)); then
  deploy_ssh "$@"
else
  ssh "${ssh_options[@]}" "$deploy_target"
fi
