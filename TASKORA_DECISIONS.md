# Architecture decision log

| # | Date | Decision | Rationale |
| --- | --- | --- | --- |
| 1 | 2026-10-20 | npm workspaces monorepo (api, web, shared) | One repo, shared Zod schemas/enums/permissions between API and UI, simple tooling. |
| 2 | 2026-10-20 | Fastify 5 instead of NestJS | Lower overhead, explicit plugins, first-class `inject` for tests; structure kept modular by convention (`modules/*`). |
| 3 | 2026-10-20 | Drizzle ORM + SQL migrations (drizzle-kit) | Type-safe SQL-first queries for reporting-heavy PSA screens; works with node-postgres in production and PGlite in tests. |
| 4 | 2026-10-20 | PostgreSQL job queue instead of Redis/BullMQ | Fewer moving parts for self-hosting; `FOR UPDATE SKIP LOCKED`, dedupe keys and backoff are sufficient at MSP scale. |
| 5 | 2026-10-20 | Session cookies + CSRF token (no JWT) | Revocable sessions, httpOnly cookies, simple and safe for a same-origin SPA. |
| 6 | 2026-10-20 | Centralised permission check via route `config.perm` | Authorization cannot be forgotten in a handler; secure by default (routes private unless `public`). |
| 7 | 2026-10-20 | First-run setup token instead of default admin credentials | No shipped credentials; token logged once or provided via env. |
| 8 | 2026-10-20 | Integer identity keys + human-readable numbers from a `sequences` table | Readable URLs/IDs like Autotask, prefixes configurable. |
| 9 | 2026-10-20 | Custom fields as validated JSONB | Flexible per-entity fields without schema migrations; validated server-side. |
| 10 | 2026-10-20 | SLA computed server-side in business minutes with pause accounting | Matches Autotask SLA event model (first response / resolution, waiting pauses) and stays correct across time zones/DST. |
| 11 | 2026-10-20 | Action1 integration strictly read-only, explicit org→company mapping | Safety requirement; never auto-link across companies; no deletion when devices disappear. |
| 12 | 2026-10-20 | Only the documented Action1 org dashboard deep link is used | No per-endpoint console link is documented (see docs/research/action1-api.md). |
| 13 | 2026-10-20 | REA toolkit not used | It reverse-engineers live web apps; inappropriate for a vendor product with customer data (see docs/research/rea-evaluation.md). |
| 14 | 2026-10-20 | Autotask research from public documentation only | Data-protection requirement: no access to the authorized tenant's records or UI data was needed. |
| 15 | 2026-10-20 | Native `<select>` + Radix primitives, custom SVG charts | Accessible, fast, no heavy chart dependency; consistent design tokens in light/dark. |
| 16 | 2026-10-20 | Embedded PostgreSQL (`embedded-postgres`) for local dev, PGlite for tests | Development works without Docker; tests run anywhere (incl. CI) without a database service. |
| 17 | 2026-10-20 | nginx web container with build-time CSP hashes, per-request upstream DNS | Strict CSP without breaking the inline theme script; resilient to API container restarts. |
| 18 | 2026-10-20 | Licence not chosen yet | Left to the project owner (see TASKORA_NEXT_STEPS.md). |
