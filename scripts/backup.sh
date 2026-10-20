#!/usr/bin/env bash
# Backs up the Taskora database and uploaded files.
#
#   bash scripts/backup.sh [--dest DIR] [--keep N] [--include-env]
#
# Creates <DIR>/<YYYYmmdd-HHMMSS>/ (default DIR: ./backups) containing
#   db.dump          pg_dump custom format (restore with scripts/restore.sh)
#   uploads.tar.gz   contents of the taskora-uploads volume
#   SHA256SUMS       checksums of the files above
#   INFO             date, git revision, image tags
#   env              copy of .env - only with --include-env (contains secrets!)
#
# Retention: only the newest N backups in DIR are kept (default KEEP=14 from
# the environment or .env; 0 keeps everything). The database stays online;
# pg_dump takes a consistent snapshot.
#
# Cron example (daily 02:30, as a user allowed to run docker):
#   30 2 * * * cd /opt/taskora && bash scripts/backup.sh >>backups/backup.log 2>&1
set -euo pipefail

# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

DEST="${BACKUP_DIR:-$TASKORA_ROOT/backups}"
KEEP="${KEEP:-$(env_get KEEP)}"
KEEP="${KEEP:-14}"
INCLUDE_ENV=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dest) DEST="${2:?--dest needs a directory}"; shift 2 ;;
    --keep) KEEP="${2:?--keep needs a number}"; shift 2 ;;
    --include-env) INCLUDE_ENV=1; shift ;;
    -h | --help) sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown option: $1 (see --help)" ;;
  esac
done
[[ "$KEEP" =~ ^[0-9]+$ ]] || die "KEEP must be a number (got '$KEEP')"

require_docker
umask 077

status="$(service_status postgres)"
[[ "$status" == running/* ]] || die "the postgres service is not running ($status). Start it with: docker compose up -d postgres"

stamp="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEST"
DEST="$(cd "$DEST" && pwd)"
target="$DEST/$stamp"
[[ ! -e "$target" ]] || die "$target already exists"
work="$DEST/.incomplete-$stamp"
mkdir "$work"
cleanup() { rm -rf "$work"; }
trap cleanup EXIT

info "Dumping the database"
compose exec -T postgres sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --compress=6' \
  >"$work/db.dump"
[[ -s "$work/db.dump" ]] || die "pg_dump produced an empty file"
ok "db.dump ($(du -h "$work/db.dump" | cut -f1))"

info "Archiving uploaded files"
# Throwaway container from the api image with the uploads volume mounted;
# it does not start (or need) the other services.
compose run --rm --no-deps -T --entrypoint tar api -C /app/data/uploads -czf - . \
  >"$work/uploads.tar.gz"
gzip -t "$work/uploads.tar.gz" || die "uploads archive is corrupt"
ok "uploads.tar.gz ($(du -h "$work/uploads.tar.gz" | cut -f1))"

if [[ "$INCLUDE_ENV" -eq 1 ]]; then
  cp "$ENV_FILE" "$work/env"
  warn "the backup contains .env with secrets - store it securely"
fi

{
  echo "created=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "host=$(hostname)"
  echo "git_revision=$(git -C "$TASKORA_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  echo "api_image=$(docker inspect -f '{{.Config.Image}}' "$(service_container api)" 2>/dev/null || echo unknown)"
  echo "postgres=$(compose exec -T postgres postgres --version 2>/dev/null || echo unknown)"
} >"$work/INFO"

files=(db.dump uploads.tar.gz)
[[ -f "$work/env" ]] && files+=(env)
(cd "$work" && sha256sum "${files[@]}" >SHA256SUMS)

mv "$work" "$target"
trap - EXIT
ok "backup written to $target"

if [[ "$KEEP" -gt 0 ]]; then
  mapfile -t backups < <(find "$DEST" -mindepth 1 -maxdepth 1 -type d -regextype posix-extended \
    -regex '.*/[0-9]{8}-[0-9]{6}' -printf '%f\n' | sort)
  excess=$(( ${#backups[@]} - KEEP ))
  if [[ "$excess" -gt 0 ]]; then
    for old in "${backups[@]:0:excess}"; do
      rm -rf -- "${DEST:?}/$old"
      ok "removed old backup $old"
    done
  fi
fi
