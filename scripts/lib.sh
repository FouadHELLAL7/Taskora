# shellcheck shell=bash
# Shared helpers for the Taskora operations scripts. Sourced, not executed:
#   source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# Repository root (the directory containing docker-compose.yml).
TASKORA_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export TASKORA_ROOT
ENV_FILE="${TASKORA_ROOT}/.env"

if [[ -t 1 ]]; then
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_BOLD=$'\033[1m'; C_RESET=$'\033[0m'
else
  C_RED=''; C_GREEN=''; C_YELLOW=''; C_BOLD=''; C_RESET=''
fi

info() { printf '%s==>%s %s\n' "$C_BOLD" "$C_RESET" "$*"; }
ok()   { printf '%s ok%s  %s\n' "$C_GREEN" "$C_RESET" "$*"; }
warn() { printf '%swarn%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
die()  { printf '%serror%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; exit 1; }

# Runs docker compose from the repository root.
compose() {
  (cd "$TASKORA_ROOT" && docker compose "$@")
}

# Verifies that docker and the compose plugin are installed and usable.
require_docker() {
  command -v docker >/dev/null 2>&1 \
    || die "docker is not installed. See docs/deployment.md (Install Docker Engine)."
  docker compose version >/dev/null 2>&1 \
    || die "the docker compose plugin is missing. Install the 'docker-compose-plugin' package."
  docker info >/dev/null 2>&1 \
    || die "cannot talk to the Docker daemon. Is it running? Run this script with sudo, or add your user to the 'docker' group (sudo usermod -aG docker \$USER, then log in again)."
}

# Prints the value of KEY from .env (last occurrence, surrounding quotes
# removed). Prints nothing if the key is absent or commented out.
env_get() {
  local key="$1" line value
  [[ -f "$ENV_FILE" ]] || return 0
  line="$(grep -E "^[[:space:]]*${key}=" "$ENV_FILE" | tail -n 1 || true)"
  [[ -n "$line" ]] || return 0
  value="${line#*=}"
  value="${value%$'\r'}"
  if [[ "$value" =~ ^\"(.*)\"$ ]] || [[ "$value" =~ ^\'(.*)\'$ ]]; then
    value="${BASH_REMATCH[1]}"
  fi
  printf '%s' "$value"
}

# Container ID of a compose service ("" when it has no container).
service_container() {
  compose ps -a -q "$1" 2>/dev/null | head -n 1
}

# Prints "<state>/<health>" for a service, e.g. "running/healthy",
# "running/none" (no healthcheck) or "missing/none".
service_status() {
  local id
  id="$(service_container "$1")"
  if [[ -z "$id" ]]; then
    echo "missing/none"
    return 0
  fi
  docker inspect -f '{{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id" 2>/dev/null \
    || echo "missing/none"
}

# Waits until every given service is running and, if it has a healthcheck,
# healthy. Usage: wait_healthy <timeout-seconds> service...
wait_healthy() {
  local timeout="$1"; shift
  local deadline=$((SECONDS + timeout)) svc status pending
  while :; do
    pending=()
    for svc in "$@"; do
      status="$(service_status "$svc")"
      case "$status" in
        running/healthy | running/none) ;;
        running/unhealthy) warn "$svc is unhealthy (it may still recover)"; pending+=("$svc") ;;
        exited/* | dead/*) warn "$svc has stopped ($status)"; return 1 ;;
        *) pending+=("$svc") ;;
      esac
    done
    [[ ${#pending[@]} -eq 0 ]] && return 0
    if (( SECONDS >= deadline )); then
      warn "timed out waiting for: ${pending[*]}"
      return 1
    fi
    sleep 3
  done
}

# URL host for the published web port.
web_url() {
  local bind port host
  bind="$(env_get TASKORA_BIND_ADDRESS)"; bind="${bind:-0.0.0.0}"
  port="$(env_get TASKORA_HTTP_PORT)"; port="${port:-8080}"
  case "$bind" in
    0.0.0.0 | "" | "::" | "[::]")
      host="$(hostname -I 2>/dev/null | awk '{print $1}')"
      host="${host:-localhost}"
      ;;
    *) host="$bind" ;;
  esac
  printf 'http://%s:%s' "$host" "$port"
}

# Address the host itself can use to reach the published web port.
web_local_url() {
  local bind port
  bind="$(env_get TASKORA_BIND_ADDRESS)"; bind="${bind:-0.0.0.0}"
  port="$(env_get TASKORA_HTTP_PORT)"; port="${port:-8080}"
  case "$bind" in
    0.0.0.0 | "" | "::" | "[::]") bind="127.0.0.1" ;;
  esac
  printf 'http://%s:%s' "$bind" "$port"
}

# HTTP GET that succeeds on 2xx; uses curl or wget, whichever exists.
http_ok() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS -o /dev/null --max-time 10 "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O /dev/null --timeout=10 "$1"
  else
    return 2
  fi
}
