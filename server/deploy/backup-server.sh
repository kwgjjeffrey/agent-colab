#!/usr/bin/env bash
# Accepted blobs are immutable. A hard-link snapshot preserves them even after live GC.
set -euo pipefail
deploy_dir="$(cd "$(dirname "$0")" && pwd)"
source "$deploy_dir/lib.sh"
label=${COLAB_BACKUP_LABEL:-$(date -u +%Y%m%dT%H%M%SZ)}
[[ "$label" =~ ^[a-zA-Z0-9._-]+$ ]] || { echo 'Invalid backup label' >&2; exit 2; }
backup_root=${DEPLOY_BACKUP_ROOT:-/var/backups/agent-colab}
blob_root=${DEPLOY_BLOB_ROOT:-/var/lib/agent-colab/blobs}
database=${DEPLOY_DATABASE_NAME:-agent_colab}
deploy_ssh "BACKUP_ROOT=$(printf %q "$backup_root") BLOB_ROOT=$(printf %q "$blob_root") DATABASE=$(printf %q "$database") LABEL=$(printf %q "$label") SERVICE=$(printf %q "$DEPLOY_SERVICE_NAME") HEALTH_URL=$(printf %q "$DEPLOY_HEALTH_URL") APP_ROOT=$(printf %q "$DEPLOY_APP_ROOT") bash -s" <<'REMOTE'
set -euo pipefail
umask 077
backup="$BACKUP_ROOT/$LABEL"
[[ -d "$BLOB_ROOT" && ! -e "$backup" ]] || { echo 'Missing blobs or backup already exists' >&2; exit 2; }
command -v pg_dump >/dev/null
systemctl is-active --quiet "$SERVICE"
install -d -m 0700 "$BACKUP_ROOT" "$backup"
systemctl stop "$SERVICE"
# Always recover the previously active service, including a failed backup.
trap 'systemctl start "$SERVICE"' EXIT
runuser -u postgres -- pg_dump --format=custom --dbname="$DATABASE" >"$backup/database.dump.uploading"
runuser -u postgres -- pg_restore --list <"$backup/database.dump.uploading" >/dev/null
mv "$backup/database.dump.uploading" "$backup/database.dump"
cp -al "$BLOB_ROOT" "$backup/blobs"
readlink -f "$APP_ROOT/current" >"$backup/server-release.txt"
runuser -u postgres -- psql --dbname="$DATABASE" -Atqc 'select max(version) from _sqlx_migrations where success' >"$backup/schema-version.txt"
systemctl start "$SERVICE"
trap - EXIT
curl -fsS --retry 12 --retry-connrefused --retry-delay 1 "$HEALTH_URL" >/dev/null
printf 'backup=%s\nservice=ready\n' "$backup"
REMOTE
