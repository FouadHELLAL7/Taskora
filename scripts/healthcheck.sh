#!/usr/bin/env bash
# Checks that the Taskora stack is healthy. Exit code 0 = healthy, 1 = not.
#
#   bash scripts/healthcheck.sh [--quiet]
#
# Checks every container's state / Docker health status, then the HTTP
# endpoints through the published web port:
#   /nginx-health  (web container)   and   /api/health  (API + database)
# Suitable for cron or a monitoring agent (--quiet prints only problems).
set -euo pipefail

# shellcheck source=scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

QUIET=0
for arg in "$@"; do
  case "$arg" in
    -q | --quiet) QUIET=1 ;;
    -h | --help) sed -n '2,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown option: $arg (see --help)" ;;
  esac
done

say() { [[ "$QUIET" -eq 1 ]] || ok "$@"; }
failures=0
fail() { printf '%sFAIL%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; failures=$((failures + 1)); }

require_docker

for svc in postgres api worker web; do
  status="$(service_status "$svc")"
  case "$status" in
    running/healthy | running/none) say "$svc: $status" ;;
    *) fail "$svc: $status" ;;
  esac
done

base="$(web_local_url)"
for path in /nginx-health /api/health; do
  if http_ok "$base$path"; then
    say "GET $base$path"
  else
    rc=$?
    if [[ "$rc" -eq 2 ]]; then
      # Neither curl nor wget on the host: check from inside the web container.
      if compose exec -T web wget -q -O /dev/null "http://127.0.0.1:8080$path" >/dev/null 2>&1; then
        say "GET $path (from inside the web container; install curl to test the published port)"
      else
        fail "GET $path (from inside the web container)"
      fi
    else
      fail "GET $base$path"
    fi
  fi
done

if [[ "$failures" -gt 0 ]]; then
  printf '%s%d check(s) failed.%s Inspect with: docker compose ps; docker compose logs --tail 100\n' "$C_RED" "$failures" "$C_RESET" >&2
  exit 1
fi
say "Taskora is healthy"
