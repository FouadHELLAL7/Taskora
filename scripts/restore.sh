#!/usr/bin/env bash
# Restores a backup made by scripts/backup.sh.
#
#   bash scripts/restore.sh <backup-dir> [--yes] [--skip-uploads] [--no-safety-backup]
#
# DESTRUCTIVE: the current database and uploaded files are REPLACED.
#
#  1. verifies the backup (SHA256SUMS)
#  2. takes a safety backup of the current state into backups/pre-restore/
#     (skip with --no-safety-backup)
#  3. stops web, worker and api
#  4. drops and recreates the database, then pg_restore's db.dump into it
#  5. replaces the contents of the uploads volume with uploads.tar.gz
#  6. starts all services again; the API applies any newer migrations
#
# The backup's database must come from the same or an older Taskora version.
# Integration secrets are encrypted with TASKORA_ENCRYPTION_KEY: restoring on a
# new host needs the original key in .env (see the backup's `env` file if it
# was made with --include-env).
set -euo pipefail

# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() { sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

BACKUP=""
ASSUME_YES=0
SKIP_UPLOADS=0
SAFETY=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes | -y) ASSUME_YES=1 ;;
    --skip-uploads) SKIP_UPLOADS=1 ;;
    --no-safety-backup) SAFETY=0 ;;
    -h | --help) usage; exit 0 ;;
    -*) die "unknown option: $1 (see --help)" ;;
    *) [[ -z "$BACKUP" ]] || die "only one backup directory may be given"; BACKUP="$1" ;;
  esac
  shift
done
[[ -n "$BACKUP" ]] || { usage; exit 2; }
[[ -d "$BACKUP" ]] || die "backup directory not found: $BACKUP"
BACKUP="$(cd "$BACKUP" && pwd)"

[[ -s "$BACKUP/db.dump" ]] || die "$BACKUP/db.dump is missing or empty"
if [[ "$SKIP_UPLOADS" -eq 0 && ! -f "$BACKUP/uploads.tar.gz" ]]; then
  die "$BACKUP/uploads.tar.gz is missing (use --skip-uploads to restore only the database)"
fi

require_docker

info "Verifying backup checksums"
if [[ -f "$BACKUP/SHA256SUMS" ]]; then
  (cd "$BACKUP" && sha256sum --quiet -c SHA256SUMS) || die "checksum verification failed - the backup is damaged"
  ok "checksums match"
else
  warn "no SHA256SUMS file - cannot verify the backup"
fi

echo
echo "${C_BOLD}This will REPLACE the current Taskora database${C_RESET}$([[ "$SKIP_UPLOADS" -eq 0 ]] && echo " ${C_BOLD}and all uploaded files${C_RESET}")"
echo "with the backup in: $BACKUP"
[[ -f "$BACKUP/INFO" ]] && sed 's/^/    /' "$BACKUP/INFO"
echo
if [[ "$ASSUME_YES" -ne 1 ]]; then
  [[ -t 0 ]] || die "refusing to restore without confirmation; re-run with --yes"
  read -r -p "Type 'restore' to continue: " answer
  [[ "$answer" == "restore" ]] || die "aborted"
fi

info "Starting the database"
compose up -d postgres
wait_healthy 120 postgres || die "postgres did not become healthy"

if [[ "$SAFETY" -eq 1 ]]; then
  info "Taking a safety backup of the current state"
  bash "$TASKORA_ROOT/scripts/backup.sh" --dest "$TASKORA_ROOT/backups/pre-restore" --keep 0 \
    || die "safety backup failed; nothing was changed (use --no-safety-backup to skip it)"
fi

info "Stopping web, worker and api"
compose stop web worker api

info "Recreating the database"
compose exec -T postgres sh -c '
  set -e
  dropdb -U "$POSTGRES_USER" --if-exists --force "$POSTGRES_DB"
  createdb -U "$POSTGRES_USER" -O "$POSTGRES_USER" "$POSTGRES_DB"
'

info "Restoring db.dump"
compose exec -T postgres sh -c \
  'exec pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl --exit-on-error --single-transaction' \
  <"$BACKUP/db.dump" \
  || die "pg_restore failed. The database is now empty; fix the problem and run the restore again (a safety backup is in backups/pre-restore/)."
ok "database restored"

if [[ "$SKIP_UPLOADS" -eq 0 ]]; then
  info "Restoring uploaded files"
  compose run --rm --no-deps -T --entrypoint sh api -c \
    'set -e; find /app/data/uploads -mindepth 1 -delete; tar -xzf - -C /app/data/uploads' \
    <"$BACKUP/uploads.tar.gz"
  ok "uploads restored"
fi

info "Starting Taskora"
compose up -d || true
if wait_healthy 300 postgres api worker web; then
  ok "restore complete - Taskora is running at $(web_url)"
else
  compose ps || true
  die "services did not become healthy after the restore. Check: docker compose logs api"
fi
