#!/usr/bin/env bash
set -euo pipefail
deploy_dir="$(cd "$(dirname "$0")" && pwd)"
source "$deploy_dir/lib.sh"

deploy_ssh "DEPLOY_MAIL_HOST=$(printf %q "${DEPLOY_MAIL_HOST:-}") bash -s" <<'REMOTE'
set -euo pipefail
. /etc/os-release
printf 'host=%s\n' "$(hostname)"
printf 'os=%s %s\n' "$ID" "$VERSION_ID"
printf 'arch=%s\n' "$(uname -m)"
awk '/MemTotal/{printf "memory_mib=%.0f\n", $2/1024}' /proc/meminfo
df -Pk / | awk 'NR==2 {printf "disk_available_kib=%s\n", $4}'
printf 'public_ip=%s\n' "$(curl -fsS --max-time 8 https://api.ipify.org)"
if [[ -n "$DEPLOY_MAIL_HOST" ]]; then
  printf 'mail_host=%s\n' "$DEPLOY_MAIL_HOST"
  printf 'mail_host_ipv4=%s\n' "$(getent ahostsv4 "$DEPLOY_MAIL_HOST" | awk 'NR==1 {print $1}')"
fi
for endpoint in gmail-smtp-in.l.google.com:25 smtp.gmail.com:587; do
  host=${endpoint%:*}; port=${endpoint#*:}
  if timeout 8 bash -c "exec 3<>/dev/tcp/$host/$port"; then
    printf 'outbound_%s=reachable\n' "$port"
  else
    printf 'outbound_%s=blocked\n' "$port"
  fi
done
REMOTE
