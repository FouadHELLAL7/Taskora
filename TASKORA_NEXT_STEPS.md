# Next steps

Resume with:

```bash
git checkout develop/taskora-platform && npm install && npm run dev
```

## Priority 1 — validate the deployment
1. Check the GitHub Actions run for `develop/taskora-platform` (typecheck, tests, image builds) and fix any failure.
2. On an Ubuntu VM: `bash scripts/install.sh`, complete setup, run `scripts/backup.sh` / `restore.sh` / `update.sh` once.
3. Configure Action1 with real (read-only) API credentials, map organizations, run a sync and review endpoints.

## Priority 2 — quality
- Run the CI workflow on GitHub and fix any Docker build issue; then test `docker compose up -d --build` on an Ubuntu VM.
- Playwright E2E: setup → login → create company/contact/CI → ticket → note → time → resolve.
- Pass `ctx.now` through ticket events/notifications.
- Lint/format config (ESLint + Prettier) and pre-commit hook.

## Priority 3 — features
- E-mail: per-queue mailboxes, OAuth2 (Microsoft 365/Google) IMAP authentication, e-mail replies sent from ticket notes.
- Customer portal; OIDC/Keycloak; inventory/quotes; more integrations.

## Decisions needed from the project owner
- Choose a licence (e.g. AGPL-3.0, MIT) — no LICENSE file has been added.
- Confirm the default currency/time zone and numbering prefixes for production.
