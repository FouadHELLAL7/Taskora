#!/usr/bin/env bash
# Updates Taskora to the latest version of the checked-out branch.
#
#   bash scripts/update.sh [--no-backup] [--no-pull]
#
#  1. backs up the database and uploads (scripts/backup.sh; skip: --no-backup)
#  2. git pull --ff-only                              (skip: --no-pull)
#  3. rebuilds the images with fresh base images and pulls postgres updates
#  4. recreates the containers (the API applies new migrations on start)
#  5. waits until everything is healthy, then removes dangling images
set -euo pipefail

# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

BACKUP=1
PULL=1
for arg in "$@"; do
  case "$arg" in
    --no-backup) BACKUP=0 ;;
    --no-pull) PULL=0 ;;
    -h | --help) sed -n '2,11p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown option: $arg (see --help)" ;;
  esac
done

cd "$TASKORA_ROOT"
require_docker
[[ -f "$ENV_FILE" ]] || die ".env not found - run scripts/install.sh first"

if [[ "$BACKUP" -eq 1 ]]; then
  if [[ "$(service_status postgres)" == running/* ]]; then
    info "Pre-update backup"
    bash "$TASKORA_ROOT/scripts/backup.sh"
  else
    warn "postgres is not running - skipping the pre-update backup"
  fi
fi

if [[ "$PULL" -eq 1 ]]; then
  command -v git >/dev/null 2>&1 || die "git is not installed (use --no-pull to skip updating the sources)"
  before="$(git rev-parse --short HEAD)"
  info "Pulling the latest sources"
  git pull --ff-only || die "git pull --ff-only failed (local changes or diverged branch?). Resolve it and run this script again."
  after="$(git rev-parse --short HEAD)"
  if [[ "$before" == "$after" ]]; then
    ok "already up to date ($after)"
  else
    ok "updated $before -> $after"
  fi
fi

info "Building images (with fresh base images)"
compose build --pull
info "Pulling the postgres image"
compose pull postgres

info "Recreating containers"
if ! compose up -d --remove-orphans; then
  compose ps || true
  compose logs --tail 80 api || true
  die "docker compose up failed after the update. Restore with scripts/restore.sh if needed."
fi

info "Waiting for the services to become healthy"
if ! wait_healthy 300 postgres api worker web; then
  compose ps || true
  compose logs --tail 50 api || true
  die "Taskora is not healthy after the update. Inspect the logs above; restore with scripts/restore.sh if needed."
fi
ok "Taskora is up at $(web_url)"

info "Removing dangling images"
docker image prune -f >/dev/null
ok "done"
