/**
 * Business-calendar arithmetic used for SLA deadlines. All computation is in
 * UTC instants; wall-clock opening hours are interpreted in the calendar's
 * IANA time zone (DST-aware via Intl).
 */

export interface BusinessCalendar {
  timezone: string;
  /** mon..sun → list of [HH:MM, HH:MM] opening ranges. Empty everywhere = 24x7. */
  schedule: Record<string, [string, string][]>;
  /** Holiday dates (YYYY-MM-DD) in the calendar's time zone. */
  holidays: string[];
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MAX_DAYS = 3 * 366;

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function zonedParts(date: Date, tz: string): Parts {
  const out: Record<string, number> = {};
  for (const p of dtf(tz).formatToParts(date)) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return { year: out.year!, month: out.month!, day: out.day!, hour: out.hour! % 24, minute: out.minute!, second: out.second! };
}

function offsetMs(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
}

/** Converts a wall-clock time in `tz` to a UTC instant. */
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetMs(new Date(guess), tz);
  const second = guess - offsetMs(new Date(first), tz);
  return new Date(second);
}

function ymd(p: { year: number; month: number; day: number }) {
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function parseHm(s: string): [number, number] {
  const [h, m] = s.split(':').map(Number);
  return [h ?? 0, m ?? 0];
}

function is24x7(cal: BusinessCalendar | null | undefined): boolean {
  return !cal || Object.values(cal.schedule).every((r) => !r || r.length === 0);
}

/** Opening intervals (UTC) for the local calendar day containing `cursor`. */
function dayIntervals(cal: BusinessCalendar, local: { year: number; month: number; day: number }): [Date, Date][] {
  if (cal.holidays.includes(ymd(local))) return [];
  const weekday = new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay();
  const ranges = cal.schedule[DAY_KEYS[weekday]!] ?? [];
  return ranges
    .map(([a, b]) => {
      const [ah, am] = parseHm(a);
      const [bh, bm] = parseHm(b);
      return [zonedToUtc(local.year, local.month, local.day, ah, am, cal.timezone), zonedToUtc(local.year, local.month, local.day, bh, bm, cal.timezone)] as [
        Date,
        Date,
      ];
    })
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0].getTime() - y[0].getTime());
}

function nextLocalDay(local: { year: number; month: number; day: number }) {
  const d = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Adds business minutes to `start`. */
export function addBusinessMinutes(start: Date, minutes: number, cal: BusinessCalendar | null | undefined): Date {
  if (minutes <= 0) return new Date(start);
  if (is24x7(cal)) return new Date(start.getTime() + minutes * 60_000);
  const c = cal!;
  let remaining = minutes * 60_000;
  let cursor = start.getTime();
  let local = zonedParts(start, c.timezone) as { year: number; month: number; day: number };
  for (let i = 0; i < MAX_DAYS; i++) {
    for (const [open, close] of dayIntervals(c, local)) {
      if (cursor >= close.getTime()) continue;
      const from = Math.max(cursor, open.getTime());
      const available = close.getTime() - from;
      if (remaining <= available) return new Date(from + remaining);
      remaining -= available;
      cursor = close.getTime();
    }
    local = nextLocalDay(local);
  }
  // Calendar with no reachable opening hours: fall back to wall-clock time.
  return new Date(start.getTime() + minutes * 60_000);
}

/** Business minutes elapsed between two instants (0 if b <= a). */
export function businessMinutesBetween(a: Date, b: Date, cal: BusinessCalendar | null | undefined): number {
  if (b <= a) return 0;
  if (is24x7(cal)) return Math.round((b.getTime() - a.getTime()) / 60_000);
  const c = cal!;
  let total = 0;
  let local = zonedParts(a, c.timezone) as { year: number; month: number; day: number };
  for (let i = 0; i < MAX_DAYS; i++) {
    const intervals = dayIntervals(c, local);
    for (const [open, close] of intervals) {
      const from = Math.max(a.getTime(), open.getTime());
      const to = Math.min(b.getTime(), close.getTime());
      if (to > from) total += to - from;
    }
    const dayStart = zonedToUtc(local.year, local.month, local.day, 0, 0, c.timezone);
    if (dayStart.getTime() > b.getTime()) break;
    local = nextLocalDay(local);
  }
  return Math.round(total / 60_000);
}

export type SlaEventState = 'none' | 'pending' | 'at_risk' | 'breached' | 'met' | 'met_late' | 'paused';

export function slaEventState(opts: {
  dueAt: Date | null;
  doneAt: Date | null;
  breached: boolean;
  paused: boolean;
  now: Date;
  warningMinutes: number;
}): SlaEventState {
  const { dueAt, doneAt, breached, paused, now, warningMinutes } = opts;
  if (!dueAt) return 'none';
  if (doneAt) return doneAt > dueAt || breached ? 'met_late' : 'met';
  if (breached || now > dueAt) return 'breached';
  if (paused) return 'paused';
  if (dueAt.getTime() - now.getTime() <= warningMinutes * 60_000) return 'at_risk';
  return 'pending';
}
