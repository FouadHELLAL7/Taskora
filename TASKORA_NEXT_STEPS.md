# Next steps

Resume with:

```bash
git checkout develop/taskora-platform && npm install && npm run dev
grep -rl "STUB: replaced" apps/web/src/pages      # pages still to implement
```

## Priority 1 — finish remaining UI pages (APIs already exist)
1. `pages/integrations/action1-endpoints.tsx` + `pages/admin/integrations.tsx` — Action1 settings (region, credentials, test, sync now, org mapping, sync runs) and endpoint review (link/create/ignore). API: `apps/api/src/modules/integrations/routes.ts`.
2. `pages/admin/system.tsx` — system settings, SLA policies with per-priority targets, business hours & holidays, work types, billing codes, notification templates.
3. `pages/admin/workflows.tsx` — rule list + builder (conditions/actions) + execution history.
4. `pages/projects/*` — list, detail (tasks board, milestones, time, tickets), tasks, milestones (`GET /project-milestones`).
5. `pages/kb/*` — list, article (sanitised Markdown), editor with preview, documentation.
6. `pages/business/invoice-detail.tsx`, `services.tsx`; `pages/crm/opportunities.tsx`; `pages/assets/products.tsx`, `asset-types.tsx`, `software.tsx`.
7. `pages/insights/reports.tsx`, `analytics.tsx`; `pages/admin/audit.tsx`.

## Priority 2 — quality
- Run the CI workflow on GitHub and fix any Docker build issue; then test `docker compose up -d --build` on an Ubuntu VM.
- Playwright E2E: setup → login → create company/contact/CI → ticket → note → time → resolve.
- Pass `ctx.now` through ticket events/notifications.
- Lint/format config (ESLint + Prettier) and pre-commit hook.

## Priority 3 — features
- SMTP notifications (templates already exist) and inbound e-mail → ticket.
- Customer portal; OIDC/Keycloak; inventory/quotes; more integrations.

## Decisions needed from the project owner
- Choose a licence (e.g. AGPL-3.0, MIT) — no LICENSE file has been added.
- Confirm the default currency/time zone and numbering prefixes for production.
