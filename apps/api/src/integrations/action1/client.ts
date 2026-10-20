/**
 * Action1 REST API client (API v3.0).
 *
 * READ-ONLY BY DESIGN: this integration never changes anything in Action1. The only non-GET request
 * it makes is `POST /oauth2/token` to obtain an access token; every resource call is a GET.
 * Do not add write methods here.
 *
 * Reference: docs/research/action1-api.md (base URLs, token flow, ResultPage pagination, 429 handling).
 * Secrets (client secret, access token) are never included in error messages or logs.
 */
import { ACTION1_REGIONS } from '@taskora/shared';

export type Action1Region = (typeof ACTION1_REGIONS.values)[number];

export const ACTION1_REGION_HOSTS: Record<Action1Region, string> = {
  na: 'app.action1.com',
  'na-2': 'app.na-2.action1.com',
  eu: 'app.eu.action1.com',
  uk: 'app.uk.action1.com',
  au: 'app.au.action1.com',
};

/** API base URL for a region (or the configured override, used by tests/proxies). */
export function action1BaseUrl(region: Action1Region, override?: string | null): string {
  if (override) return override.replace(/\/+$/, '');
  const host = ACTION1_REGION_HOSTS[region];
  if (!host) throw new Action1Error(0, 'invalid_region', `Unknown Action1 region "${region}"`);
  return `https://${host}/api/3.0`;
}

/**
 * Console link to an organization's dashboard. This is the only console URL documented
 * (PSAction1 README); per-endpoint deep links are undocumented, so we do not build them.
 */
export function action1OrgDashboardUrl(region: Action1Region, orgExternalId: string): string | null {
  const host = ACTION1_REGION_HOSTS[region];
  if (!host) return null;
  return `https://${host}/console/dashboard?org=${encodeURIComponent(orgExternalId)}`;
}

export class Action1Error extends Error {
  constructor(
    /** HTTP status, or 0 for network/client-side errors. */
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'Action1Error';
  }
}

export interface Action1ClientOptions {
  region: Action1Region;
  clientId: string;
  clientSecret: string;
  baseUrlOverride?: string | null;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Clock (ms since epoch); injectable for tests. */
  now?: () => number;
  /** Total attempts per request for retryable failures (429, 5xx, network). */
  maxAttempts?: number;
  /** Base delay for exponential backoff. */
  backoffBaseMs?: number;
  /** Longest Retry-After we are willing to wait; longer waits fail the request instead. */
  maxRetryAfterMs?: number;
  /** Hard cap on pages followed by `paginate` (prevents infinite loops). */
  maxPages?: number;
  pageSize?: number;
}

export interface Action1Organization {
  id: string;
  name: string;
  description?: string | null;
  [k: string]: unknown;
}

export type Action1Endpoint = Record<string, unknown> & { id?: string };

type Query = Record<string, string | number | boolean | null | undefined>;

const TOKEN_REFRESH_MARGIN_MS = 60_000;
const DEFAULT_TOKEN_TTL_S = 3600;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class Action1Client {
  readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly maxAttempts: number;
  private readonly backoffBaseMs: number;
  private readonly maxRetryAfterMs: number;
  private readonly maxPages: number;
  private readonly pageSize: number;
  private token: { value: string; expiresAt: number } | null = null;
  private tokenPromise: Promise<string> | null = null;

  constructor(private readonly opts: Action1ClientOptions) {
    this.baseUrl = action1BaseUrl(opts.region, opts.baseUrlOverride);
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.sleep = opts.sleep ?? defaultSleep;
    this.now = opts.now ?? Date.now;
    this.maxAttempts = opts.maxAttempts ?? 4;
    this.backoffBaseMs = opts.backoffBaseMs ?? 500;
    this.maxRetryAfterMs = opts.maxRetryAfterMs ?? 120_000;
    this.maxPages = opts.maxPages ?? 500;
    this.pageSize = opts.pageSize ?? 100;
  }

  /* ------------------------------------------------------------ public API */

  /** Verifies credentials and access; returns the number of organizations visible. */
  async testConnection(): Promise<{ organizations: number }> {
    const orgs = await this.listOrganizations();
    return { organizations: orgs.length };
  }

  async listOrganizations(): Promise<Action1Organization[]> {
    const out: Action1Organization[] = [];
    for await (const item of this.paginate('/organizations')) {
      const o = item as Record<string, unknown>;
      if (o && typeof o.id === 'string' && o.id) {
        out.push({ ...o, id: o.id, name: typeof o.name === 'string' && o.name.trim() ? o.name : o.id });
      }
    }
    return out;
  }

  /**
   * Managed endpoints of one organization. `fields=missing_updates` is required for the
   * `missing_updates {critical, other}` counts (spec §6).
   */
  async listEndpoints(orgId: string): Promise<Action1Endpoint[]> {
    const out: Action1Endpoint[] = [];
    for await (const item of this.paginate(`/endpoints/managed/${encodeURIComponent(orgId)}`, { fields: 'missing_updates' })) {
      if (item && typeof item === 'object') out.push(item as Action1Endpoint);
    }
    return out;
  }

  async getEndpointMissingUpdates(orgId: string, endpointId: string): Promise<Record<string, unknown>[]> {
    const out: Record<string, unknown>[] = [];
    const path = `/endpoints/managed/${encodeURIComponent(orgId)}/${encodeURIComponent(endpointId)}/missing-updates`;
    for await (const item of this.paginate(path)) {
      if (item && typeof item === 'object') out.push(item as Record<string, unknown>);
    }
    return out;
  }

  /** Authenticated GET of a path relative to the API base. */
  async get<T = unknown>(path: string, query: Query = {}): Promise<T> {
    return this.getUrl<T>(this.buildUrl(path, query));
  }

  /**
   * Iterates the items of a ResultPage collection. Follows `next_page` (absolute or relative URL)
   * when present, otherwise advances `from` while `from < total_items`.
   */
  async *paginate(path: string, query: Query = {}): AsyncGenerator<unknown> {
    const limit = Number(query.limit) > 0 ? Number(query.limit) : this.pageSize;
    let from = 0;
    let url = this.buildUrl(path, { ...query, limit, from });
    const seen = new Set<string>();
    for (let page = 0; ; page++) {
      if (page >= this.maxPages) {
        throw new Action1Error(0, 'pagination_limit', `Stopped after ${this.maxPages} pages of ${path}; the result set is incomplete`);
      }
      const key = url.toString();
      if (seen.has(key)) break;
      seen.add(key);

      const body = await this.getUrl<unknown>(url);
      if (Array.isArray(body)) {
        // Not a documented shape, but tolerate a bare array (single page).
        yield* body;
        break;
      }
      const envelope = (body ?? {}) as Record<string, unknown>;
      const items = Array.isArray(envelope.items) ? envelope.items : [];
      yield* items;
      from += items.length;

      const next = typeof envelope.next_page === 'string' ? envelope.next_page.trim() : '';
      const totalRaw = envelope.total_items;
      const total = totalRaw === undefined || totalRaw === null || totalRaw === '' ? NaN : Number(totalRaw);

      if (next) {
        url = this.resolveNext(next);
      } else if (Number.isFinite(total) && from < total && items.length > 0) {
        url = this.buildUrl(path, { ...query, limit, from });
      } else {
        break;
      }
    }
  }

  /* -------------------------------------------------------------- internals */

  private buildUrl(path: string, query: Query): URL {
    const url = new URL(this.baseUrl + (path.startsWith('/') ? path : `/${path}`));
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    return url;
  }

  /** Resolves a next_page link; only links on the API's own origin are followed (never leak the token). */
  private resolveNext(next: string): URL {
    let url: URL;
    try {
      url = new URL(next, `${this.baseUrl}/`);
    } catch {
      throw new Action1Error(0, 'invalid_response', 'Action1 returned an invalid next_page link');
    }
    if (url.origin !== new URL(this.baseUrl).origin) {
      throw new Action1Error(0, 'invalid_response', 'Action1 returned a next_page link on an unexpected host');
    }
    return url;
  }

  private redact(text: string): string {
    let out = text;
    for (const secret of [this.opts.clientSecret, this.token?.value]) {
      if (secret && secret.length >= 4) out = out.split(secret).join('***');
    }
    return out;
  }

  private async getToken(): Promise<string> {
    if (this.token && this.now() < this.token.expiresAt - TOKEN_REFRESH_MARGIN_MS) return this.token.value;
    if (!this.tokenPromise) {
      this.tokenPromise = this.requestToken().finally(() => {
        this.tokenPromise = null;
      });
    }
    return this.tokenPromise;
  }

  private async requestToken(): Promise<string> {
    if (!this.opts.clientId || !this.opts.clientSecret) {
      throw new Action1Error(0, 'missing_credentials', 'Action1 API credentials are not configured');
    }
    const url = new URL(`${this.baseUrl}/oauth2/token`);
    const res = await this.send(url, () =>
      this.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json' },
        body: JSON.stringify({ client_id: this.opts.clientId, client_secret: this.opts.clientSecret }),
      }),
    );
    if (!res.ok) {
      const detail = await this.errorMessage(res);
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        throw new Action1Error(
          res.status,
          'auth_failed',
          `Action1 rejected the API credentials (HTTP ${res.status})${detail ? `: ${detail}` : ''}. Check the Client ID, secret and region.`,
        );
      }
      throw new Action1Error(res.status, 'auth_failed', `Action1 token request failed (HTTP ${res.status})${detail ? `: ${detail}` : ''}`);
    }
    const body = (await res.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null;
    const token = body && typeof body.access_token === 'string' ? body.access_token : '';
    if (!token) throw new Action1Error(res.status, 'invalid_response', 'Action1 token response did not contain an access token');
    const ttl = Number(body?.expires_in);
    this.token = { value: token, expiresAt: this.now() + (Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_TOKEN_TTL_S) * 1000 };
    return token;
  }

  private async getUrl<T>(url: URL): Promise<T> {
    let reauthed = false;
    for (;;) {
      const token = await this.getToken();
      const res = await this.send(url, () =>
        this.fetchImpl(url, { method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }),
      );
      if (res.status === 401 && !reauthed) {
        // Token expired or revoked: get a new one once and retry.
        reauthed = true;
        this.token = null;
        await res.body?.cancel().catch(() => undefined);
        continue;
      }
      if (!res.ok) {
        const detail = await this.errorMessage(res);
        const code = res.status === 401 ? 'unauthorized' : res.status === 403 ? 'forbidden' : res.status === 404 ? 'not_found' : res.status === 429 ? 'rate_limited' : 'http_error';
        const hint = res.status === 403 ? ' (no access, or the API path is wrong)' : '';
        throw new Action1Error(res.status, code, `Action1 request ${url.pathname} failed with HTTP ${res.status}${hint}${detail ? `: ${detail}` : ''}`);
      }
      try {
        return (await res.json()) as T;
      } catch {
        throw new Action1Error(res.status, 'invalid_response', `Action1 returned an invalid JSON response for ${url.pathname}`);
      }
    }
  }

  /**
   * Executes a request with retries: network errors and 5xx use exponential backoff with jitter;
   * 429 waits for Retry-After (header, then body details.retry_after, then backoff).
   * Returns the final response (which may still be an error status).
   */
  private async send(url: URL, doFetch: () => Promise<Response>): Promise<Response> {
    for (let attempt = 1; ; attempt++) {
      let res: Response;
      try {
        res = await doFetch();
      } catch (err) {
        if (attempt >= this.maxAttempts) {
          const reason = err instanceof Error ? err.message : 'unknown error';
          throw new Action1Error(0, 'network_error', `Could not reach Action1 at ${url.host}: ${this.redact(reason)}`);
        }
        await this.sleep(this.backoff(attempt));
        continue;
      }
      if (res.status === 429) {
        if (attempt >= this.maxAttempts) return res;
        const wait = (await this.retryAfterMs(res)) ?? this.backoff(attempt);
        if (wait > this.maxRetryAfterMs) {
          throw new Action1Error(429, 'rate_limited', `Action1 rate limit exceeded; retry requested after ${Math.round(wait / 1000)} s`);
        }
        await this.sleep(wait);
        continue;
      }
      if (res.status >= 500 && attempt < this.maxAttempts) {
        await res.body?.cancel().catch(() => undefined);
        await this.sleep(this.backoff(attempt));
        continue;
      }
      return res;
    }
  }

  private backoff(attempt: number): number {
    const base = this.backoffBaseMs * 2 ** (attempt - 1);
    return Math.min(30_000, base) + Math.floor(Math.random() * this.backoffBaseMs);
  }

  private async retryAfterMs(res: Response): Promise<number | null> {
    const header = res.headers.get('retry-after');
    if (header) {
      const secs = Number(header);
      if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
      const date = Date.parse(header);
      if (Number.isFinite(date)) return Math.max(0, date - this.now());
    }
    const body = (await res.json().catch(() => null)) as { details?: { retry_after?: unknown } } | null;
    const secs = Number(body?.details?.retry_after);
    return Number.isFinite(secs) && secs >= 0 ? secs * 1000 : null;
  }

  private async errorMessage(res: Response): Promise<string> {
    const text = await res.text().catch(() => '');
    if (!text) return '';
    let msg = '';
    try {
      const body = JSON.parse(text) as { user_message?: unknown; developer_message?: unknown; message?: unknown };
      const m = body.user_message ?? body.developer_message ?? body.message;
      msg = typeof m === 'string' ? m : '';
    } catch {
      msg = '';
    }
    return this.redact(msg.slice(0, 300));
  }
}
