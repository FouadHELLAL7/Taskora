import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { z, type ZodType } from 'zod';
import { ciSchema, companySchema, contactSchema, formatNumber } from '@taskora/shared';
import type { Tx } from '../../db/client.js';
import * as s from '../../db/schema/index.js';
import { audit } from '../../lib/audit.js';
import { badRequest } from '../../lib/errors.js';
import { currentUser } from '../../lib/context.js';
import { nextSequence } from '../../lib/query.js';
import { getSystemSettings } from '../../lib/settings.js';
import { importTicketRows, TICKET_ALIASES, TICKET_IGNORED } from './tickets.js';

/** RFC 4180-style CSV parser (quotes, escaped quotes, CRLF, ; or , delimiter). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  return rows;
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Column aliases (normalised header → field). Includes common Autotask export headers. */
const ALIASES: Record<string, Record<string, string>> = {
  company: {
    name: 'name', companyname: 'name', accountname: 'name', company: 'name',
    accountnumber: 'accountNumber', companynumber: 'accountNumber', id: 'accountNumber', companyid: 'accountNumber',
    type: 'type', companytype: 'type', industry: 'industry', website: 'website', webaddress: 'website',
    phone: 'phone', mainphone: 'phone', email: 'email', address: 'address1', address1: 'address1', address2: 'address2',
    city: 'city', state: 'state', province: 'state', postalcode: 'postalCode', zipcode: 'postalCode', zip: 'postalCode', country: 'country',
    active: 'isActive', isactive: 'isActive', notes: 'notes',
  },
  contact: {
    company: 'company', companyname: 'company', account: 'company', firstname: 'firstName', lastname: 'lastName',
    title: 'title', jobtitle: 'title', department: 'department', email: 'email', emailaddress: 'email',
    phone: 'phone', officephone: 'phone', mobile: 'mobile', mobilephone: 'mobile', active: 'isActive', isactive: 'isActive',
    primary: 'isPrimary', primarycontact: 'isPrimary', notes: 'notes',
  },
  ci: {
    name: 'name', referencetitle: 'name', devicename: 'name', company: 'company', companyname: 'company', account: 'company',
    type: 'type', citype: 'type', configurationitemtype: 'type', producttype: 'type', manufacturer: 'manufacturer',
    model: 'model', product: 'model', serialnumber: 'serialNumber', serial: 'serialNumber', assettag: 'assetTag',
    hostname: 'hostname', os: 'osName', operatingsystem: 'osName', ipaddress: 'ipAddress', ip: 'ipAddress', macaddress: 'macAddress',
    contact: 'contactEmail', contactemail: 'contactEmail', assignedto: 'contactEmail', purchasedate: 'purchaseDate',
    installdate: 'installDate', warrantyexpiration: 'warrantyExpiresAt', warrantyexpirationdate: 'warrantyExpiresAt', warranty: 'warrantyExpiresAt',
    status: 'lifecycleStatus', lifecycle: 'lifecycleStatus', notes: 'notes',
  },
  ticket: TICKET_ALIASES,
};

const truthy = (v: string) => !/^(0|false|no|n|inactive|non?)$/i.test(v.trim());
function toDate(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // dd/mm/yyyy
  if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

interface RowResult {
  row: number;
  ok: boolean;
  action?: 'create' | 'update';
  label: string;
  errors?: string[];
  warnings?: string[];
}

/** Undoes the ' prefix that CSV exports add to cells starting with = + - @. */
const unescapeCell = (v: string) => (/^'[=+\-@]/.test(v) ? v.slice(1) : v);

const importSchema = z.object({
  entity: z.enum(['company', 'contact', 'ci', 'ticket']),
  csv: z.string().min(1).max(25_000_000),
  dryRun: z.boolean().default(true),
  /** Tickets only: create unknown companies, contacts and picklist values. */
  createMissing: z.boolean().default(false),
});
const NEEDED = { company: 'companies.write', contact: 'companies.write', ci: 'cis.write', ticket: 'tickets.write' } as const;

export async function importRoutes(app: FastifyInstance) {
  app.post('/imports', { config: { perm: ['companies.write', 'cis.write', 'tickets.write'] }, bodyLimit: 26 * 1024 * 1024 }, async (req) => {
    const input = importSchema.parse(req.body);
    const me = currentUser(req);
    const needed = NEEDED[input.entity];
    if (!me.permissions.includes('*') && !me.permissions.includes(needed)) throw badRequest(`Importing ${input.entity} records requires ${needed}`);
    if (input.createMissing && input.entity === 'ticket' && !me.permissions.includes('*') && !me.permissions.includes('companies.write')) {
      throw badRequest('Creating missing companies and contacts requires companies.write');
    }
    const table = parseCsv(input.csv);
    if (table.length < 2) throw badRequest('The file needs a header row and at least one data row');
    const maxRows = input.entity === 'ticket' ? 20000 : 5000;
    if (table.length > maxRows + 1) throw badRequest(`Import at most ${maxRows} rows at a time`);
    const aliases = ALIASES[input.entity]!;
    const headers = table[0]!.map((h) => aliases[norm(h)] ?? null);
    const unmapped = table[0]!.filter((h, i) => !headers[i] && !(input.entity === 'ticket' && TICKET_IGNORED.has(norm(h))) && h.trim() !== '');
    const records = table.slice(1).map((cells) => {
      const rec: Record<string, string> = {};
      headers.forEach((field, i) => {
        if (field && cells[i] !== undefined && cells[i]!.trim() !== '') rec[field] = unescapeCell(cells[i]!.trim());
      });
      return rec;
    });

    const results: RowResult[] = [];
    const run = async (tx: Tx) => {
      if (input.entity === 'ticket') {
        results.push(...(await importTicketRows(tx, records, { dryRun: input.dryRun, createMissing: input.createMissing, userId: me.id })));
        return;
      }
      const companies = await tx.select({ id: s.companies.id, name: s.companies.name, accountNumber: s.companies.accountNumber }).from(s.companies);
      const byName = new Map(companies.map((c) => [c.name.toLowerCase(), c.id]));
      const byAccount = new Map(companies.filter((c) => c.accountNumber).map((c) => [c.accountNumber!.toLowerCase(), c.id]));
      const ciTypes = await tx.select({ id: s.ciTypes.id, name: s.ciTypes.name }).from(s.ciTypes);
      const typeByName = new Map(ciTypes.map((t) => [t.name.toLowerCase(), t.id]));
      const otherType = typeByName.get('other') ?? ciTypes[0]?.id;
      const settings = await getSystemSettings(tx);

      for (const [i, r] of records.entries()) {
        const rowNo = i + 2;
        const fail = (label: string, errors: string[]) => results.push({ row: rowNo, ok: false, label, errors });
        const validate = <T>(schema: ZodType<T>, data: unknown): { ok: true; value: T } | { ok: false; errors: string[] } => {
          const p = schema.safeParse(data);
          return p.success ? { ok: true, value: p.data } : { ok: false, errors: p.error.issues.map((x) => `${x.path.join('.') || 'row'}: ${x.message}`) };
        };

        if (input.entity === 'company') {
          const label = r.name ?? `row ${rowNo}`;
          const v = validate(companySchema, { ...r, type: r.type?.toLowerCase(), isActive: r.isActive === undefined ? true : truthy(r.isActive) });
          if (!v.ok) {
            fail(label, v.errors);
            continue;
          }
          const existing = (v.value.accountNumber && byAccount.get(v.value.accountNumber.toLowerCase())) || byName.get(v.value.name.toLowerCase());
          if (existing) {
            if (!input.dryRun) {
              const patch = Object.fromEntries(Object.entries(v.value).filter(([k, val]) => k in r || (k === 'isActive' && r.isActive !== undefined) ? val !== undefined : false));
              await tx.update(s.companies).set(patch).where(eq(s.companies.id, existing));
            }
            results.push({ row: rowNo, ok: true, action: 'update', label });
          } else {
            if (!input.dryRun) {
              const [c] = await tx.insert(s.companies).values({ ...v.value, primaryContactId: null, customFields: {}, createdById: me.id }).returning({ id: s.companies.id });
              byName.set(v.value.name.toLowerCase(), c!.id);
            } else byName.set(v.value.name.toLowerCase(), -1);
            results.push({ row: rowNo, ok: true, action: 'create', label });
          }
        } else if (input.entity === 'contact') {
          const label = [r.firstName, r.lastName].filter(Boolean).join(' ') || r.email || `row ${rowNo}`;
          const companyId = r.company ? byName.get(r.company.toLowerCase()) ?? byAccount.get(r.company.toLowerCase()) : undefined;
          if (!companyId) {
            fail(label, [r.company ? `Unknown company "${r.company}" — import companies first` : 'company: Required']);
            continue;
          }
          const v = validate(contactSchema, { ...r, companyId: companyId > 0 ? companyId : 1, isActive: r.isActive === undefined ? true : truthy(r.isActive), isPrimary: r.isPrimary ? truthy(r.isPrimary) : false });
          if (!v.ok) {
            fail(label, v.errors);
            continue;
          }
          const [dup] = v.value.email
            ? await tx.select({ id: s.contacts.id }).from(s.contacts).where(sql`lower(${s.contacts.email}) = ${v.value.email} and ${s.contacts.companyId} = ${companyId}`)
            : [];
          if (!input.dryRun) {
            if (dup) await tx.update(s.contacts).set({ ...v.value, companyId }).where(eq(s.contacts.id, dup.id));
            else await tx.insert(s.contacts).values({ ...v.value, companyId, customFields: {} });
          }
          results.push({ row: rowNo, ok: true, action: dup ? 'update' : 'create', label });
        } else {
          const label = r.name ?? r.serialNumber ?? `row ${rowNo}`;
          const companyId = r.company ? byName.get(r.company.toLowerCase()) ?? byAccount.get(r.company.toLowerCase()) : undefined;
          if (!companyId) {
            fail(label, [r.company ? `Unknown company "${r.company}"` : 'company: Required']);
            continue;
          }
          const ciTypeId = (r.type && typeByName.get(r.type.toLowerCase())) || otherType;
          let contactId: number | null = null;
          if (r.contactEmail && companyId > 0) {
            const [c] = await tx.select({ id: s.contacts.id }).from(s.contacts).where(sql`lower(${s.contacts.email}) = ${r.contactEmail.toLowerCase()} and ${s.contacts.companyId} = ${companyId}`);
            contactId = c?.id ?? null;
          }
          const v = validate(ciSchema, {
            ...r,
            companyId: companyId > 0 ? companyId : 1,
            ciTypeId,
            contactId,
            lifecycleStatus: r.lifecycleStatus?.toLowerCase().replace(/\s+/g, '_') || 'active',
            purchaseDate: r.purchaseDate ? toDate(r.purchaseDate) : null,
            installDate: r.installDate ? toDate(r.installDate) : null,
            warrantyExpiresAt: r.warrantyExpiresAt ? toDate(r.warrantyExpiresAt) : null,
          });
          if (!v.ok) {
            fail(label, v.errors);
            continue;
          }
          const [dup] = v.value.serialNumber && companyId > 0
            ? await tx.select({ id: s.configurationItems.id }).from(s.configurationItems).where(sql`lower(${s.configurationItems.serialNumber}) = ${v.value.serialNumber.toLowerCase()} and ${s.configurationItems.companyId} = ${companyId}`)
            : [];
          if (!input.dryRun) {
            if (dup) await tx.update(s.configurationItems).set({ ...v.value, companyId }).where(eq(s.configurationItems.id, dup.id));
            else
              await tx.insert(s.configurationItems).values({
                ...v.value,
                companyId,
                customFields: {},
                ciNumber: formatNumber(settings.ciPrefix, await nextSequence(tx, 'ci')),
                source: 'import',
                createdById: me.id,
              });
          }
          results.push({ row: rowNo, ok: true, action: dup ? 'update' : 'create', label });
        }
      }
    };

    if (input.dryRun) await run(app.db);
    else {
      await app.db.transaction(async (tx) => {
        await run(tx);
        if (results.some((r) => !r.ok)) throw badRequest('Some rows are invalid; nothing was imported. Fix them and try again.', { results });
      });
      await audit(app.db, req, { action: 'create', entityType: 'import', summary: `Imported ${results.length} ${input.entity} rows` });
    }
    return {
      dryRun: input.dryRun,
      total: results.length,
      valid: results.filter((r) => r.ok).length,
      creates: results.filter((r) => r.action === 'create').length,
      warnings: results.filter((r) => r.warnings?.length).length,
      updates: results.filter((r) => r.action === 'update').length,
      unmappedColumns: unmapped,
      results,
    };
  });
}
