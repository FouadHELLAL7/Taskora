import { endOfMonth, format, startOfMonth, subDays, subMonths } from 'date-fns';
import { cn } from '@/lib/utils';

export type DateRange = {
  from: string;
  to: string;
};

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

export const RANGE_PRESETS: { key: string; label: string; range: () => DateRange }[] = [
  { key: '7d', label: 'Last 7 days', range: () => ({ from: iso(subDays(new Date(), 6)), to: iso(new Date()) }) },
  { key: '30d', label: 'Last 30 days', range: () => ({ from: iso(subDays(new Date(), 29)), to: iso(new Date()) }) },
  { key: '90d', label: 'Last 90 days', range: () => ({ from: iso(subDays(new Date(), 89)), to: iso(new Date()) }) },
  { key: 'month', label: 'This month', range: () => ({ from: iso(startOfMonth(new Date())), to: iso(new Date()) }) },
  {
    key: 'lastMonth',
    label: 'Last month',
    range: () => {
      const m = subMonths(new Date(), 1);
      return { from: iso(startOfMonth(m)), to: iso(endOfMonth(m)) };
    },
  },
];

export function defaultRange(): DateRange {
  return RANGE_PRESETS[1]!.range();
}

/** Compact from/to date inputs with quick presets (used by reports and analytics). */
export function DateRangeFilter({ value, onChange, className }: { value: DateRange; onChange: (r: DateRange) => void; className?: string }) {
  const active = RANGE_PRESETS.find((p) => {
    const r = p.range();
    return r.from === value.from && r.to === value.to;
  });
  const input =
    'h-8 rounded-md border border-border-strong bg-surface px-2 text-[13px] text-foreground focus:border-primary focus:outline-none [color-scheme:light] dark:[color-scheme:dark]';
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <select
        value={active?.key ?? ''}
        onChange={(e) => {
          const p = RANGE_PRESETS.find((x) => x.key === e.target.value);
          if (p) onChange(p.range());
        }}
        className="h-8 cursor-pointer rounded-md border border-border-strong bg-surface px-2 text-[13px] focus:border-primary focus:outline-none"
        aria-label="Date range preset"
      >
        <option value="">Custom range</option>
        {RANGE_PRESETS.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
      </select>
      <input type="date" aria-label="From" className={input} value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} />
      <span className="text-xs text-muted">to</span>
      <input type="date" aria-label="To" className={input} value={value.to} min={value.from} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} />
    </div>
  );
}

/** Number formatting helpers for report tables. */
export const fmtNum = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
