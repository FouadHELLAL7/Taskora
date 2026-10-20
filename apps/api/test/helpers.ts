import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { FastifyInstance, InjectOptions } from 'fastify';
import type { Transporter } from 'nodemailer';
import { eq } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { migrationsFolder, schema, type Db } from '../src/db/client.js';
import { seedBase } from '../src/db/seed/base.js';
import { hashPassword } from '../src/lib/crypto.js';

export interface TestContext {
  app: FastifyInstance;
  db: Db;
  close: () => Promise<void>;
}

/** Spins up an isolated in-memory PostgreSQL (PGlite), migrated and seeded with base data. */
export async function createTestApp(env: Record<string, string> = {}, opts: { mailTransport?: Transporter } = {}): Promise<TestContext> {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Db;
  await migrate(db as never, { migrationsFolder: migrationsFolder() });
  await seedBase(db);
  const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', TASKORA_SETUP_TOKEN: 'test-setup-token-123456', UPLOAD_DIR: './.data/test-uploads', AUTH_RATE_LIMIT_PER_MINUTE: '1000', ...env });
  const app = await buildApp({ db, config, logger: false, mailTransport: opts.mailTransport });
  await app.ready();
  return {
    app,
    db,
    close: async () => {
      await app.close();
      await client.close();
    },
  };
}

/** A logged-in API client bound to one session (cookie + CSRF token). */
export class Client {
  cookie = '';
  csrf = '';
  constructor(private app: FastifyInstance) {}

  async request<T = any>(method: InjectOptions['method'], url: string, body?: unknown): Promise<{ status: number; body: T; headers: Record<string, unknown> }> {
    const res = await this.app.inject({
      method,
      url,
      payload: body as InjectOptions['payload'],
      headers: { ...(this.cookie ? { cookie: this.cookie } : {}), ...(this.csrf ? { 'x-csrf-token': this.csrf } : {}) },
    });
    const setCookie = res.headers['set-cookie'];
    if (setCookie) {
      const first = Array.isArray(setCookie) ? setCookie[0]! : setCookie;
      this.cookie = first.split(';')[0]!;
    }
    let parsed: unknown = res.body;
    try {
      parsed = res.json();
    } catch {
      /* non-JSON */
    }
    return { status: res.statusCode, body: parsed as T, headers: res.headers };
  }

  get<T = any>(url: string) {
    return this.request<T>('GET', url);
  }
  post<T = any>(url: string, body?: unknown) {
    return this.request<T>('POST', url, body ?? {});
  }
  patch<T = any>(url: string, body?: unknown) {
    return this.request<T>('PATCH', url, body ?? {});
  }
  put<T = any>(url: string, body?: unknown) {
    return this.request<T>('PUT', url, body ?? {});
  }
  delete<T = any>(url: string) {
    return this.request<T>('DELETE', url);
  }

  async login(email: string, password: string) {
    const res = await this.post('/api/v1/auth/login', { email, password });
    if (res.status !== 200) throw new Error(`login failed: ${JSON.stringify(res.body)}`);
    this.csrf = res.body.csrfToken;
    return this;
  }
}

let userSeq = 0;
/** Creates a user with the given built-in role and returns a logged-in client. */
export async function userClient(ctx: TestContext, roleKey = 'administrator'): Promise<Client & { userId: number }> {
  const [role] = await ctx.db.select().from(schema.roles).where(eq(schema.roles.key, roleKey));
  const email = `${roleKey}${++userSeq}@example.test`;
  const password = 'Correct-Horse-42';
  const [user] = await ctx.db
    .insert(schema.users)
    .values({ email, firstName: roleKey, lastName: `User${userSeq}`, passwordHash: await hashPassword(password), roleId: role!.id })
    .returning();
  const client = new Client(ctx.app) as Client & { userId: number };
  client.userId = user!.id;
  return client.login(email, password);
}

/** Creates a company (and optionally a contact) through the API. */
export async function makeCompany(c: Client, name = 'Northstar Consulting') {
  const res = await c.post('/api/v1/companies', { name, type: 'customer' });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return res.body as { id: number; name: string };
}

export async function makeContact(c: Client, companyId: number, firstName = 'Emma', lastName = 'Smith') {
  const res = await c.post('/api/v1/contacts', { companyId, firstName, lastName, email: `${firstName}.${lastName}@example.test`.toLowerCase() });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return res.body as { id: number };
}
