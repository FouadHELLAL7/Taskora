#!/bin/sh
# Entrypoint for the Taskora api/worker image (runs under tini).
#
# docker compose passes optional settings as empty strings when they are not
# set in .env (e.g. TASKORA_SETUP_TOKEN=""). The API's configuration schema
# treats an empty string as a real value and would reject it, so empty values
# are removed here and the application defaults apply instead.
set -eu

for var in HOST PORT DATABASE_POOL_MAX TASKORA_ENCRYPTION_KEY TASKORA_SETUP_TOKEN \
  SESSION_TTL_HOURS COOKIE_SECURE TRUST_PROXY UPLOAD_DIR MAX_UPLOAD_MB LOG_LEVEL \
  ACTION1_BASE_URL_OVERRIDE WORKER_POLL_MS TASKORA_NEW_PASSWORD TASKORA_ALLOW_DEMO_SEED; do
  eval "value=\${$var-}"
  # shellcheck disable=SC2154 # assigned via eval
  if [ -z "$value" ]; then
    unset "$var"
  fi
done
unset value var

exec "$@"
