import { and, eq, sql } from 'drizzle-orm';
import { formatNumber } from '@taskora/shared';
import type { Tx } from '../../db/client.js';
import * as s from '../../db/schema/index.js';
import { zonedToUtc } from '../../lib/business-time.js';
import { AppError, badRequest } from '../../lib/errors.js';
import { nextSequence } from '../../lib/query.js';
import { getSystemSettings } from '../../lib/settings.js';
import { computeDueDates, resolveSlaId } from '../tickets/sla.js';
import { updateTicket } from '../tickets/service.js';

/**
 * Ticket CSV import. Accepts Taskora's own export headers and common Autotask
 * export headers. Existing tickets are matched by ticket number and updated;
 * a row with a note adds that note (identical notes are not added twice, so
 * re-importing a file is safe). Several rows may share one ticket number to
 * add several notes.
 */
export const TICKET_ALIASES: Record<string, string> = {
  ticket: 'ticketNumber', ticketnumber: 'ticketNumber', ticketno: 'ticketNumber', number: 'ticketNumber', ticketid: 'ticketNumber',
  title: 'title', tickettitle: 'title', subject: 'title', summary: 'title',
  description: 'description', details: 'description', ticketdescription: 'description',
  company: 'company', companyname: 'company', account: 'company', accountname: 'company', customer: 'company', client: 'company',
  accountnumber: 'companyAccount', companynumber: 'companyAccount', companyid: 'companyAccount',
  contact: 'contact', contactname: 'contact', requester: 'contact', requestedby: 'contact',
  contactemail: 'contactEmail', contactemailaddress: 'contactEmail', requesteremail: 'contactEmail', email: 'contactEmail',
  status: 'status', ticketstatus: 'status',
  priority: 'priority', ticketpriority: 'priority',
  queue: 'queue', ticketqueue: 'queue',
  assignedto: 'assignee', assignee: 'assignee', assignedresource: 'assignee', primaryresource: 'assignee', resource: 'assignee', technician: 'assignee',
  type: 'ticketType', tickettype: 'ticketType',
  issuetype: 'issueType', issue: 'issueType',
  subissuetype: 'subIssueType', subissue: 'subIssueType',
  source: 'source', ticketsource: 'source',
  configurationitem: 'ci', configurationitemname: 'ci', ci: 'ci', device: 'ci', asset: 'ci',
  duedate: 'dueAt', due: 'dueAt', duedatetime: 'dueAt',
  hoursworked: 'hoursWorked', totalhoursworked: 'hoursWorked', worked: 'hoursWorked', hours: 'hoursWorked',
  created: 'createdAt', createdat: 'createdAt', createdate: 'createdAt', createddate: 'createdAt', createdon: 'createdAt', createddatetime: 'createdAt',
  resolved: 'resolvedAt', resolvedat: 'resolvedAt', resolveddate: 'resolvedAt', completed: 'resolvedAt', completeddate: 'resolvedAt', completedate: 'resolvedAt',
  resolution: 'resolution',
  note: 'note', notes: 'note', internalnote: 'note', internalnotes: 'note', ticketnote: 'note', notedescription: 'note',
  notedate: 'noteDate', notecreated: 'noteDate', notecreatedate: 'noteDate',
  publicnote: 'publicNote', customernote: 'publicNote', customervisiblenote: 'publicNote',
  tags: 'tags',
};

/** Export-only columns that are recognised but not imported. */
export const TICKET_IGNORED = new Set(['sla', 'slastate', 'closed', 'closeddate', 'firstresponse', 'lastactivity', 'lastactivitydate']);

export interface ImportRowResult {
  row: number;
  ok: boolean;
  action?: 'create' | 'update';
  label: string;
  errors?: string[];
  warnings?: string[];
}

const lc = (v: string) => v.trim().toLowerCase();

/**
 * Parses a date/time cell. ISO values with an offset are exact; wall-clock
 * values (dd/mm/yyyy hh:mm, mm/dd/yyyy h:mm AM, yyyy-mm-dd hh:mm) are read in
 * the organisation's time zone. Ambiguous dd/mm vs mm/dd is read day-first
 * unless the value uses AM/PM.
 */
export function toDateTime(value: string, tz: string): Date | null {
  const t = value.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/i.test(t)) {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  let y: number, mo: number, d: number, h = 0, mi = 0;
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?$/);
  const loc = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp]\.?[Mm]\.?)?)?$/);
  if (iso) {
    [y, mo, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    if (iso[4]) [h, mi] = [Number(iso[4]), Number(iso[5])];
  } else if (loc) {
    const a = Number(loc[1]);
    const b = Number(loc[2]);
    y = Number(loc[3]);
    if (y < 100) y += 2000;
    const ampm = loc[6]?.toLowerCase().replace(/\./g, '');
    const usFirst = (b > 12 && a <= 12) || (!!ampm && a <= 12 && b <= 12);
    [mo, d] = usFirst ? [a, b] : [b, a];
    if (loc[4]) {
      h = Number(loc[4]);
      mi = Number(loc[5]);
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
    }
  } else {
    const parsed = new Date(t);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const out = zonedToUtc(y, mo, d, h, mi, tz);
  return Number.isNaN(out.getTime()) ? null : out;
}

const NOTE_HEADER = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}) UTC([^\]\n]*)\]$/gm;

/**
 * Splits a "Notes" cell produced by the ticket export ("[2026-10-21 14:30 UTC ·
 * Author · customer-visible]" + body, repeated) back into separate notes.
 * Any other text is a single note.
 */
export function splitNotes(cell: string, visibility: 'internal' | 'public'): { body: string; visibility: 'internal' | 'public'; at?: Date }[] {
  const heads = [...cell.matchAll(NOTE_HEADER)];
  if (!heads.length || heads[0]!.index !== 0) return [{ body: cell.trim(), visibility }];
  return heads
    .map((h, i) => ({
      body: cell.slice(h.index! + h[0].length, heads[i + 1]?.index ?? cell.length).trim(),
      visibility: (h[2]!.includes('customer-visible') ? 'public' : 'internal') as 'internal' | 'public',
      at: new Date(`${h[1]!.replace(' ', 'T')}:00Z`),
    }))
    .filter((n) => n.body);
}

/** Maps common status names (e.g. Autotask "Complete") onto a status category. */
function statusCategoryFor(name: string): string | null {
  const n = lc(name);
  if (/^(new|open new|unassigned)$/.test(n)) return 'new';
  if (/wait|pending|on hold|hold/.test(n)) return 'waiting';
  if (/^resolved/.test(n)) return 'resolved';
  if (/complete|closed|done|cancel/.test(n)) return 'closed';
  if (/progress|open|assigned|working|scheduled|escalat|reopen/.test(n)) return 'open';
  return null;
}

function priorityLevelFor(name: string): number | null {
  const n = lc(name);
  if (/critical|urgent|^p1$|^1$/.test(n)) return 1;
  if (/high|^p2$|^2$/.test(n)) return 2;
  if (/medium|normal|^p3$|^3$/.test(n)) return 3;
  if (/low|^p4$|^4$/.test(n)) return 4;
  return null;
}

export async function importTicketRows(
  tx: Tx,
  records: Record<string, string>[],
  opts: { dryRun: boolean; createMissing: boolean; userId: number },
): Promise<ImportRowResult[]> {
  const settings = await getSystemSettings(tx);
  const tz = settings.timezone;
  const now = new Date();
  let fakeId = -1;

  const statuses = await tx.select().from(s.ticketStatuses).where(eq(s.ticketStatuses.isActive, true)).orderBy(s.ticketStatuses.sortOrder);
  const priorities = await tx.select().from(s.ticketPriorities).where(eq(s.ticketPriorities.isActive, true)).orderBy(s.ticketPriorities.level);
  const defaultStatus = statuses.find((x) => x.isDefault) ?? statuses.find((x) => x.category === 'new') ?? statuses[0];
  const defaultPriority = priorities.find((x) => x.isDefault) ?? priorities[0];
  if (!defaultStatus || !defaultPriority) throw badRequest('Ticket statuses/priorities are not configured');

  const nameMap = (rows: { id: number; name: string }[]) => new Map(rows.map((r) => [lc(r.name), r.id]));
  const queues = nameMap(await tx.select({ id: s.queues.id, name: s.queues.name }).from(s.queues));
  const types = nameMap(await tx.select({ id: s.ticketTypes.id, name: s.ticketTypes.name }).from(s.ticketTypes));
  const sources = nameMap(await tx.select({ id: s.ticketSources.id, name: s.ticketSources.name }).from(s.ticketSources));
  const issues = nameMap(await tx.select({ id: s.issueTypes.id, name: s.issueTypes.name }).from(s.issueTypes));
  const subIssues = new Map<string, number>();
  for (const x of await tx.select({ id: s.subIssueTypes.id, name: s.subIssueTypes.name, issueTypeId: s.subIssueTypes.issueTypeId }).from(s.subIssueTypes)) {
    subIssues.set(`${x.issueTypeId}:${lc(x.name)}`, x.id);
  }
  const users = new Map<string, number>();
  for (const u of await tx.select({ id: s.users.id, email: s.users.email, firstName: s.users.firstName, lastName: s.users.lastName }).from(s.users)) {
    users.set(lc(u.email), u.id);
    users.set(lc(`${u.firstName} ${u.lastName}`), u.id);
    users.set(lc(`${u.lastName}, ${u.firstName}`), u.id);
  }
  const companies = new Map<string, number>();
  for (const c of await tx.select({ id: s.companies.id, name: s.companies.name, accountNumber: s.companies.accountNumber }).from(s.companies)) {
    companies.set(lc(c.name), c.id);
    if (c.accountNumber) companies.set(`#${lc(c.accountNumber)}`, c.id);
  }
  const contacts = new Map<string, number>();
  for (const c of await tx.select({ id: s.contacts.id, companyId: s.contacts.companyId, firstName: s.contacts.firstName, lastName: s.contacts.lastName, email: s.contacts.email }).from(s.contacts)) {
    contacts.set(`${c.companyId}:${lc(`${c.firstName} ${c.lastName}`)}`, c.id);
    if (c.email) contacts.set(`${c.companyId}:${lc(c.email)}`, c.id);
  }
  const cis = new Map<string, number>();
  for (const c of await tx.select({ id: s.configurationItems.id, companyId: s.configurationItems.companyId, name: s.configurationItems.name, serial: s.configurationItems.serialNumber, num: s.configurationItems.ciNumber }).from(s.configurationItems)) {
    for (const k of [c.name, c.serial, c.num]) if (k) cis.set(`${c.companyId}:${lc(k)}`, c.id);
  }
  const tickets = new Map<string, { id: number; companyId: number }>();
  for (const t of await tx.select({ id: s.tickets.id, number: s.tickets.ticketNumber, companyId: s.tickets.companyId }).from(s.tickets)) {
    tickets.set(lc(t.number), { id: t.id, companyId: t.companyId });
  }
  const prefixRe = new RegExp(`^${settings.ticketPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}0*(\\d+)$`, 'i');

  /** Finds a picklist value or (optionally) creates it. */
  const pick = async (
    map: Map<string, number>,
    value: string | undefined,
    what: string,
    warnings: string[],
    create?: () => Promise<number>,
  ): Promise<number | null | undefined> => {
    if (value === undefined) return undefined;
    const hit = map.get(lc(value));
    if (hit) return hit;
    if (opts.createMissing && create) {
      const id = opts.dryRun ? fakeId-- : await create();
      map.set(lc(value), id);
      warnings.push(`${what} "${value}" will be created`);
      return id;
    }
    warnings.push(`${what} "${value}" not found — left empty`);
    return null;
  };

  const addNote = async (ticketId: number, body: string, visibility: 'internal' | 'public', at: Date) => {
    const [dup] = await tx
      .select({ id: s.ticketNotes.id })
      .from(s.ticketNotes)
      .where(and(eq(s.ticketNotes.ticketId, ticketId), eq(s.ticketNotes.body, body)))
      .limit(1);
    if (dup) return false;
    const [n] = await tx.insert(s.ticketNotes).values({ ticketId, userId: opts.userId, body, visibility, createdAt: at, updatedAt: at }).returning({ id: s.ticketNotes.id });
    await tx.insert(s.ticketEvents).values({ ticketId, userId: opts.userId, type: 'note_added', data: { noteId: n!.id, visibility, source: 'import' }, createdAt: at });
    await tx.execute(sql`update tickets set last_activity_at = greatest(last_activity_at, ${at}) where id = ${ticketId}`);
    return true;
  };

  const results: ImportRowResult[] = [];
  for (const [i, r] of records.entries()) {
    const rowNo = i + 2;
    const warnings: string[] = [];
    const label = [r.ticketNumber, r.title].filter(Boolean).join(' · ') || `row ${rowNo}`;
    const fail = (...errors: string[]) => results.push({ row: rowNo, ok: false, label, errors });
    const date = (key: string) => {
      const v = r[key];
      if (!v) return undefined;
      const d = toDateTime(v, tz);
      if (!d) warnings.push(`Unreadable date "${v}" in ${key} — ignored`);
      return d ?? undefined;
    };
    const existing = r.ticketNumber ? tickets.get(lc(r.ticketNumber)) : undefined;

    if (!existing && !r.title) {
      fail('Title: Required for new tickets');
      continue;
    }
    if (r.title && r.title.length > 500) {
      fail('Title: at most 500 characters');
      continue;
    }

    // Company: required for new tickets; existing tickets keep theirs.
    let companyId = existing?.companyId;
    if (!companyId) {
      const key = r.companyAccount ? `#${lc(r.companyAccount)}` : r.company ? lc(r.company) : '';
      companyId = (r.companyAccount && companies.get(key)) || (r.company ? companies.get(lc(r.company)) : undefined);
      if (!companyId) {
        if (!r.company) {
          fail(r.companyAccount ? `Unknown account number "${r.companyAccount}"` : 'Company: Required');
          continue;
        }
        if (!opts.createMissing) {
          fail(`Unknown company "${r.company}" — import companies first or tick "Create missing companies and values"`);
          continue;
        }
        companyId = opts.dryRun
          ? fakeId--
          : (await tx.insert(s.companies).values({ name: r.company, accountNumber: r.companyAccount ?? null, type: 'customer', customFields: {}, createdById: opts.userId }).returning({ id: s.companies.id }))[0]!.id;
        companies.set(lc(r.company), companyId);
        if (r.companyAccount) companies.set(`#${lc(r.companyAccount)}`, companyId);
        warnings.push(`Company "${r.company}" will be created`);
      }
    }

    // A row without a ticket number is the same ticket again on re-import when
    // company, title and creation time all match, so importing a file twice
    // does not duplicate it. (Without a "Created" date it is always new.)
    const createdAt = date('createdAt');
    let target = existing;
    if (!target && !r.ticketNumber && createdAt && companyId > 0) {
      const [same] = await tx
        .select({ id: s.tickets.id })
        .from(s.tickets)
        .where(and(eq(s.tickets.companyId, companyId), sql`lower(${s.tickets.title}) = ${lc(r.title!)}`, eq(s.tickets.createdAt, createdAt)))
        .limit(1);
      if (same) target = { id: same.id, companyId };
    }

    // Status and priority map by name, then by meaning (e.g. "Complete" → closed).
    let status: (typeof statuses)[number] | undefined;
    if (r.status) {
      status = statuses.find((x) => lc(x.name) === lc(r.status!));
      if (!status) {
        const cat = statusCategoryFor(r.status);
        status = cat ? statuses.find((x) => x.category === cat) : undefined;
        warnings.push(status ? `Status "${r.status}" mapped to "${status.name}"` : `Status "${r.status}" not found — ${target ? 'unchanged' : `using "${defaultStatus.name}"`}`);
      }
    }
    let priority: (typeof priorities)[number] | undefined;
    if (r.priority) {
      priority = priorities.find((x) => lc(x.name) === lc(r.priority!));
      if (!priority) {
        const level = priorityLevelFor(r.priority);
        priority = level ? priorities.find((x) => x.level === level) : undefined;
        warnings.push(priority ? `Priority "${r.priority}" mapped to "${priority.name}"` : `Priority "${r.priority}" not found — ${target ? 'unchanged' : `using "${defaultPriority.name}"`}`);
      }
    }

    const queueId = await pick(queues, r.queue, 'Queue', warnings, async () => (await tx.insert(s.queues).values({ name: r.queue! }).returning({ id: s.queues.id }))[0]!.id);
    const ticketTypeId = await pick(types, r.ticketType, 'Type', warnings, async () => (await tx.insert(s.ticketTypes).values({ name: r.ticketType! }).returning({ id: s.ticketTypes.id }))[0]!.id);
    const sourceId = await pick(sources, r.source, 'Source', warnings, async () => (await tx.insert(s.ticketSources).values({ name: r.source! }).returning({ id: s.ticketSources.id }))[0]!.id);
    const issueTypeId = await pick(issues, r.issueType, 'Issue type', warnings, async () => (await tx.insert(s.issueTypes).values({ name: r.issueType! }).returning({ id: s.issueTypes.id }))[0]!.id);
    let subIssueTypeId: number | null | undefined;
    if (r.subIssueType) {
      if (!issueTypeId) warnings.push(`Sub-issue type "${r.subIssueType}" needs an issue type — left empty`);
      else {
        const key = `${issueTypeId}:${lc(r.subIssueType)}`;
        subIssueTypeId = subIssues.get(key) ?? null;
        if (!subIssueTypeId && opts.createMissing) {
          subIssueTypeId = issueTypeId < 0 || opts.dryRun ? fakeId-- : (await tx.insert(s.subIssueTypes).values({ issueTypeId, name: r.subIssueType }).returning({ id: s.subIssueTypes.id }))[0]!.id;
          subIssues.set(key, subIssueTypeId);
          warnings.push(`Sub-issue type "${r.subIssueType}" will be created`);
        } else if (!subIssueTypeId) warnings.push(`Sub-issue type "${r.subIssueType}" not found — left empty`);
      }
    }

    let assignedUserId: number | null | undefined;
    if (r.assignee) {
      assignedUserId = users.get(lc(r.assignee)) ?? null;
      if (!assignedUserId) warnings.push(`User "${r.assignee}" not found — left unassigned`);
    }

    let contactId: number | null | undefined;
    if (r.contact || r.contactEmail) {
      contactId = (r.contactEmail && contacts.get(`${companyId}:${lc(r.contactEmail)}`)) || (r.contact && contacts.get(`${companyId}:${lc(r.contact)}`)) || null;
      if (!contactId && opts.createMissing) {
        const full = (r.contact ?? r.contactEmail!.split('@')[0]!).trim();
        const cut = full.lastIndexOf(' ');
        const firstName = cut > 0 ? full.slice(0, cut) : full;
        const lastName = cut > 0 ? full.slice(cut + 1) : '';
        contactId =
          opts.dryRun || companyId < 0
            ? fakeId--
            : (await tx.insert(s.contacts).values({ companyId, firstName, lastName, email: r.contactEmail?.toLowerCase() ?? null, customFields: {} }).returning({ id: s.contacts.id }))[0]!.id;
        if (r.contact) contacts.set(`${companyId}:${lc(r.contact)}`, contactId);
        if (r.contactEmail) contacts.set(`${companyId}:${lc(r.contactEmail)}`, contactId);
        warnings.push(`Contact "${full}" will be created`);
      } else if (!contactId) warnings.push(`Contact "${r.contact ?? r.contactEmail}" not found at this company — left empty`);
    }

    let configurationItemId: number | null | undefined;
    if (r.ci) {
      configurationItemId = cis.get(`${companyId}:${lc(r.ci)}`) ?? null;
      if (!configurationItemId) warnings.push(`Configuration item "${r.ci}" not found at this company — left empty`);
    }

    let minutes: number | undefined;
    if (r.hoursWorked) {
      const h = Number(r.hoursWorked.replace(',', '.'));
      if (Number.isFinite(h) && h >= 0 && h < 10000) minutes = Math.round(h * 60);
      else warnings.push(`Hours worked "${r.hoursWorked}" is not a number — ignored`);
    }
    const resolvedAt = date('resolvedAt');
    const dueAt = date('dueAt');
    const noteDate = date('noteDate');
    const tags = r.tags ? r.tags.split(/[;,]/).map((x) => x.trim()).filter(Boolean) : undefined;
    const notes = [...(r.note ? splitNotes(r.note, 'internal') : []), ...(r.publicNote ? splitNotes(r.publicNote, 'public') : [])];

    // In a dry run, rows that refer to records created earlier in the file have negative ids.
    const pending = (companyId < 0 || [queueId, ticketTypeId, sourceId, issueTypeId, subIssueTypeId, contactId].some((v) => typeof v === 'number' && v < 0)) as boolean;

    try {
      if (target) {
        if (!opts.dryRun && target.id > 0 && !pending) {
          const patch: Record<string, unknown> = {};
          const set = (k: string, v: unknown) => v !== undefined && v !== null && (patch[k] = v);
          set('title', r.title);
          set('description', r.description);
          set('resolution', r.resolution);
          set('statusId', status?.id);
          set('priorityId', priority?.id);
          set('queueId', queueId);
          set('assignedUserId', assignedUserId);
          set('ticketTypeId', ticketTypeId);
          set('issueTypeId', issueTypeId);
          set('subIssueTypeId', subIssueTypeId);
          set('sourceId', sourceId);
          set('contactId', contactId);
          set('configurationItemId', configurationItemId);
          set('dueAt', dueAt?.toISOString());
          set('tags', tags);
          await updateTicket({ db: tx, userId: opts.userId }, target.id, patch);
          if (resolvedAt && status && (status.category === 'resolved' || status.category === 'closed')) {
            await tx.update(s.tickets).set({ resolvedAt, ...(status.category === 'closed' ? { closedAt: resolvedAt } : {}) }).where(eq(s.tickets.id, target.id));
          }
          // Hours worked tops up logged time to the CSV value (never removes time).
          if (minutes) {
            const [{ logged }] = (await tx.execute<{ logged: number }>(sql`select coalesce(sum(duration_minutes),0)::int as logged from time_entries where ticket_id = ${target.id}`)).rows as [{ logged: number }];
            if (minutes > logged) {
              const [t] = await tx.select({ assignedUserId: s.tickets.assignedUserId, contractId: s.tickets.contractId, createdAt: s.tickets.createdAt }).from(s.tickets).where(eq(s.tickets.id, target.id));
              await insertTime(tx, { ticketId: target.id, companyId: target.companyId, contractId: t!.contractId, userId: t!.assignedUserId ?? opts.userId, approverId: opts.userId, startedAt: t!.createdAt, minutes: minutes - logged });
            }
          }
          for (const n of notes) await addNote(target.id, n.body, n.visibility, n.at ?? noteDate ?? now);
        }
        results.push({ row: rowNo, ok: true, action: 'update', label, ...(warnings.length ? { warnings } : {}) });
        continue;
      }

      const st = status ?? defaultStatus;
      const pr = priority ?? defaultPriority;
      const terminal = st.category === 'resolved' || st.category === 'closed';
      const created = createdAt ?? now;
      let ticketNumber = r.ticketNumber?.trim();
      if (opts.dryRun || pending) {
        tickets.set(lc(ticketNumber ?? `new-${rowNo}`), { id: fakeId--, companyId });
        results.push({ row: rowNo, ok: true, action: 'create', label, ...(warnings.length ? { warnings } : {}) });
        continue;
      }
      if (ticketNumber) {
        // Keep the original number; if it uses Taskora's own prefix, move the counter past it.
        const m = ticketNumber.match(prefixRe);
        if (m) await tx.execute(sql`insert into sequences (name, value) values ('ticket', ${Number(m[1])}) on conflict (name) do update set value = greatest(sequences.value, excluded.value)`);
      } else ticketNumber = formatNumber(settings.ticketPrefix, await nextSequence(tx, 'ticket'));

      const [contract] = await tx
        .select({ id: s.contracts.id })
        .from(s.contracts)
        .where(and(eq(s.contracts.companyId, companyId), eq(s.contracts.isDefault, true), eq(s.contracts.status, 'active')))
        .limit(1);
      const contractId = contract?.id ?? null;
      const slaId = await resolveSlaId(tx, { slaId: null, contractId, companyId });
      const dues = await computeDueDates(tx, { slaId, priorityId: pr.id, createdAt: created, slaPausedMinutes: 0 });
      const resolved = terminal ? (resolvedAt ?? created) : null;
      // Tickets past "New" count as responded at creation. Deadlines already in
      // the past are flagged now, so history does not trigger breach notifications.
      const firstResponseAt = st.category !== 'new' ? created : null;
      const [ticket] = await tx
        .insert(s.tickets)
        .values({
          ticketNumber,
          title: r.title!,
          description: r.description ?? null,
          companyId,
          contactId: contactId ?? null,
          configurationItemId: configurationItemId ?? null,
          assignedUserId: assignedUserId ?? null,
          queueId: queueId ?? null,
          ticketTypeId: ticketTypeId ?? null,
          issueTypeId: issueTypeId ?? null,
          subIssueTypeId: subIssueTypeId ?? null,
          sourceId: sourceId ?? null,
          statusId: st.id,
          priorityId: pr.id,
          contractId,
          slaId,
          dueAt: dueAt ?? null,
          resolution: r.resolution ?? null,
          tags: tags ?? [],
          customFields: {},
          firstResponseAt,
          firstResponseDueAt: dues.firstResponseDueAt,
          resolutionDueAt: dues.resolutionDueAt,
          firstResponseBreached: !firstResponseAt && !!dues.firstResponseDueAt && dues.firstResponseDueAt < now,
          resolutionBreached: !!dues.resolutionDueAt && (resolved ? resolved > dues.resolutionDueAt : dues.resolutionDueAt < now),
          slaPausedAt: st.pausesSla ? now : null,
          resolvedAt: resolved,
          closedAt: st.category === 'closed' ? resolved : null,
          statusChangedAt: resolved ?? created,
          lastActivityAt: resolved ?? created,
          createdById: opts.userId,
          createdAt: created,
        })
        .returning({ id: s.tickets.id });
      tickets.set(lc(ticketNumber), { id: ticket!.id, companyId });
      await tx.insert(s.ticketEvents).values({ ticketId: ticket!.id, userId: opts.userId, type: 'created', data: { source: 'import' }, createdAt: created });
      if (minutes) await insertTime(tx, { ticketId: ticket!.id, companyId, contractId, userId: assignedUserId ?? opts.userId, approverId: opts.userId, startedAt: created, minutes });
      for (const n of notes) await addNote(ticket!.id, n.body, n.visibility, n.at ?? noteDate ?? resolved ?? created);
      results.push({ row: rowNo, ok: true, action: 'create', label, ...(warnings.length ? { warnings } : {}) });
    } catch (err) {
      if (err instanceof AppError) fail(err.message);
      else throw err;
    }
  }
  return results;
}

async function insertTime(
  tx: Tx,
  t: { ticketId: number; companyId: number; contractId: number | null; userId: number; approverId: number; startedAt: Date; minutes: number },
) {
  await tx.insert(s.timeEntries).values({
    ticketId: t.ticketId,
    companyId: t.companyId,
    contractId: t.contractId,
    userId: t.userId,
    startedAt: t.startedAt,
    endedAt: new Date(t.startedAt.getTime() + t.minutes * 60_000),
    durationMinutes: t.minutes,
    // Historical time is recorded for reporting only and never billed again.
    billable: false,
    description: 'Hours worked (imported from CSV)',
    status: 'approved',
    approvedById: t.approverId,
    approvedAt: new Date(),
  });
}
