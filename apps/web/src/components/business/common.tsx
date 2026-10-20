import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CONTRACT_STATUS, CONTRACT_TYPE, INVOICE_STATUS, TIME_ENTRY_STATUS, formatMoney } from '@taskora/shared';
import { useAuth } from '@/lib/auth';
import { Badge, type Tone } from '../ui/misc';

/** Options for a <Select>/<FilterSelect> from a shared `labels()` enum. */
export function enumOpts<T extends string>(e: { values: readonly T[]; labels: Record<T, string> }) {
  return e.values.map((v) => ({ value: v, label: e.labels[v] }));
}

export function labelOf<T extends string>(e: { labels: Record<T, string> }, v: string | null | undefined) {
  if (!v) return '—';
  return (e.labels as Record<string, string>)[v] ?? v;
}

/** Money formatter bound to the organisation currency (or an explicit one, e.g. an invoice's). */
export function useMoney() {
  const { me } = useAuth();
  const org = me?.organization.currency ?? 'EUR';
  return useCallback((n: number | string | null | undefined, currency?: string | null) => formatMoney(n, currency ?? org), [org]);
}

/** Hours with two decimals from minutes, e.g. 90 → "1.50 h". */
export function hrs(minutes: number | null | undefined) {
  return `${((minutes ?? 0) / 60).toFixed(2)} h`;
}

export const toNum = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v));

const CONTRACT_STATUS_TONE: Record<string, Tone> = { draft: 'neutral', active: 'success', expired: 'warning', cancelled: 'danger' };
export function ContractStatusBadge({ status }: { status: string }) {
  return <Badge tone={CONTRACT_STATUS_TONE[status] ?? 'neutral'}>{labelOf(CONTRACT_STATUS, status)}</Badge>;
}

const CONTRACT_TYPE_TONE: Record<string, Tone> = {
  time_materials: 'info',
  fixed_price: 'primary',
  block_hours: 'warning',
  retainer: 'primary',
  recurring: 'success',
  per_ticket: 'neutral',
};
export function ContractTypeBadge({ type }: { type: string }) {
  return <Badge tone={CONTRACT_TYPE_TONE[type] ?? 'neutral'}>{labelOf(CONTRACT_TYPE, type)}</Badge>;
}

const TIME_TONE: Record<string, Tone> = { draft: 'neutral', submitted: 'info', approved: 'success', rejected: 'danger', billed: 'primary' };
export function TimeStatusBadge({ status }: { status: string }) {
  return <Badge tone={TIME_TONE[status] ?? 'neutral'}>{labelOf(TIME_ENTRY_STATUS, status)}</Badge>;
}

const INVOICE_TONE: Record<string, Tone> = { draft: 'neutral', issued: 'info', paid: 'success', void: 'danger' };
export function InvoiceStatusBadge({ status }: { status: string }) {
  return <Badge tone={INVOICE_TONE[status] ?? 'neutral'}>{labelOf(INVOICE_STATUS, status)}</Badge>;
}

/** Simple two-column definition list used in overview cards. */
export function FieldGrid({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  const c = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[cols];
  return <dl className={`grid grid-cols-1 gap-x-6 gap-y-3 ${c}`}>{children}</dl>;
}

/** Active tab kept in the `?tab=` search param (first tab omitted from the URL). */
export function useTabParam(defaultTab: string) {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? defaultTab;
  const setTab = useCallback(
    (v: string) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (v === defaultTab) next.delete('tab');
          else next.set('tab', v);
          return next;
        },
        { replace: true },
      ),
    [setParams, defaultTab],
  );
  return [tab, setTab] as const;
}
