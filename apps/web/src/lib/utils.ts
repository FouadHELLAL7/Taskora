import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = typeof v === 'string' ? (v.length === 10 ? parseISO(v) : new Date(v)) : v;
  return isValid(d) ? d : null;
}

export function fmtDate(v: string | Date | null | undefined, fallback = '—') {
  const d = toDate(v);
  return d ? format(d, 'dd MMM yyyy') : fallback;
}

export function fmtDateTime(v: string | Date | null | undefined, fallback = '—') {
  const d = toDate(v);
  return d ? format(d, 'dd MMM yyyy HH:mm') : fallback;
}

export function fmtTime(v: string | Date | null | undefined) {
  const d = toDate(v);
  return d ? format(d, 'HH:mm') : '';
}

export function fmtRelative(v: string | Date | null | undefined, fallback = '—') {
  const d = toDate(v);
  if (!d) return fallback;
  const s = formatDistanceToNowStrict(d, { addSuffix: true });
  return s;
}

/** Value for <input type="datetime-local"> in local time. */
export function toLocalInput(v: string | Date | null | undefined) {
  const d = toDate(v);
  return d ? format(d, "yyyy-MM-dd'T'HH:mm") : '';
}

export function todayIso() {
  return format(new Date(), 'yyyy-MM-dd');
}

export function initials(name: string | null | undefined) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function fullName(p: { firstName?: string | null; lastName?: string | null } | null | undefined) {
  return p ? [p.firstName, p.lastName].filter(Boolean).join(' ') : '';
}

export function hours(minutes: number | null | undefined) {
  return ((minutes ?? 0) / 60).toFixed(2);
}

export function pluralize(n: number, word: string, plural = `${word}s`) {
  return `${n} ${n === 1 ? word : plural}`;
}
