#!/usr/bin/env bash
# Taskora first-install helper. Safe to run again (idempotent).
#
#   bash scripts/install.sh [--no-start]
#
#  1. checks that Docker Engine and the compose plugin are usable
#  2. creates .env from .env.example if it does not exist (mode 600)
#  3. generates POSTGRES_PASSWORD and TASKORA_ENCRYPTION_KEY when they are
#     empty or still a "change-me" placeholder - existing values are NEVER
#     overwritten
#  4. builds and starts the stack (docker compose up -d --build)
#  5. waits until everything is healthy and prints the URL and, on a fresh
#     installation, the one-time setup token for creating the administrator
set -euo pipefail

# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

START=1
for arg in "$@"; do
  case "$arg" in
    --no-start) START=0 ;;
    -h | --help) sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown option: $arg (see --help)" ;;
  esac
done

cd "$TASKORA_ROOT"
umask 077

info "Checking prerequisites"
require_docker
ok "$(docker --version)"
ok "$(docker compose version)"

random_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    od -An -tx1 -N32 /dev/urandom | tr -d ' \n'
  fi
}

# Sets KEY=value in .env: the first active KEY= line is replaced (later
# duplicates are dropped); if there is none, the assignment is appended.
env_set() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp "${ENV_FILE}.XXXXXX")"
  awk -v k="$key" -v v="$value" '
    BEGIN { done = 0 }
    $0 ~ "^[[:space:]]*" k "=" { if (!done) { print k "=" v; done = 1 } next }
    { print }
    END { if (!done) print k "=" v }
  ' "$ENV_FILE" >"$tmp"
  cat "$tmp" >"$ENV_FILE"   # keep the original file's owner and mode
  rm -f "$tmp"
}

is_placeholder() {
  [[ -z "$1" || "$1" == change-me* || "$1" == changeme* ]]
}

info "Preparing .env"
if [[ ! -f "$ENV_FILE" ]]; then
  [[ -f .env.example ]] || die ".env.example not found in $TASKORA_ROOT"
  cp .env.example "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  ok "created .env from .env.example"
else
  ok ".env already exists - keeping existing values"
fi

generated=()
if is_placeholder "$(env_get POSTGRES_PASSWORD)"; then
  # A new password only works for a database volume that does not exist yet.
  if [[ -n "$(service_container postgres)" ]]; then
    die "POSTGRES_PASSWORD is empty in .env but a postgres container already exists. Restore the original password in .env instead of generating a new one (see docs/deployment.md, Troubleshooting)."
  fi
  env_set POSTGRES_PASSWORD "$(random_hex)"
  generated+=(POSTGRES_PASSWORD)
fi
key="$(env_get TASKORA_ENCRYPTION_KEY)"
if is_placeholder "$key"; then
  env_set TASKORA_ENCRYPTION_KEY "$(random_hex)"
  generated+=(TASKORA_ENCRYPTION_KEY)
elif [[ ! "$key" =~ ^[0-9a-fA-F]{64}$ ]]; then
  warn "TASKORA_ENCRYPTION_KEY is not 64 hex characters; it must be base64 for exactly 32 bytes or the API will refuse to start."
fi
if [[ ${#generated[@]} -gt 0 ]]; then
  ok "generated: ${generated[*]}"
  warn "Back up .env (or at least TASKORA_ENCRYPTION_KEY) somewhere safe, e.g. your password manager."
fi
chmod 600 "$ENV_FILE" 2>/dev/null || true

info "Validating docker-compose.yml"
compose config -q
ok "configuration is valid"

if [[ "$START" -eq 0 ]]; then
  info "Done. Start Taskora with: docker compose up -d --build"
  exit 0
fi

info "Building images and starting Taskora (the first build takes a few minutes)"
if ! compose up -d --build --remove-orphans; then
  compose ps || true
  compose logs --tail 80 api || true
  die "docker compose up failed. See the output above and: docker compose logs"
fi

info "Waiting for the services to become healthy"
if ! wait_healthy 300 postgres api worker web; then
  compose ps || true
  warn "Recent API logs:"
  compose logs --tail 50 api || true
  die "Taskora did not become healthy. Check: docker compose logs"
fi
ok "all services are up"

if http_ok "$(web_local_url)/api/health"; then
  ok "health check through the web proxy passed"
else
  warn "could not verify $(web_local_url)/api/health from this host (is curl/wget installed? firewall?)"
fi

echo
info "Taskora is running at: ${C_BOLD}$(web_url)${C_RESET}"

needs_setup="$(compose exec -T api node -e "fetch('http://127.0.0.1:3000/api/v1/setup/status').then(r=>r.json()).then(j=>process.stdout.write(String(j.needsSetup)),()=>process.stdout.write('unknown'))" 2>/dev/null || echo unknown)"
case "$needs_setup" in
  false)
    ok "an administrator already exists - sign in as usual."
    ;;
  true)
    if [[ -n "$(env_get TASKORA_SETUP_TOKEN)" ]]; then
      info "First-run setup: open the URL and create the administrator with the TASKORA_SETUP_TOKEN from .env."
    else
      token="$(compose logs --no-color api 2>/dev/null | grep -o 'Initial setup token: [A-Za-z0-9_-]*' | tail -n 1 | sed 's/^Initial setup token: //' || true)"
      if [[ -n "$token" ]]; then
        info "First-run setup: open the URL and create the administrator with this one-time token:"
        printf '\n    %s\n\n' "$token"
        echo "    The token changes if the api container restarts before setup is completed;"
        echo "    show the current one with: docker compose logs api | grep -i \"setup token\""
      else
        warn "setup token not found in the logs yet; run: docker compose logs api | grep -i \"setup token\""
      fi
    fi
    ;;
  *)
    warn "could not determine the setup status; if this is a new installation run: docker compose logs api | grep -i \"setup token\""
    ;;
esac
