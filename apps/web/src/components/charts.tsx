import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Lightweight SVG/HTML charts. They read colours from the design tokens so
 * they work in light and dark mode, and stay readable at small sizes.
 */

export interface BarDatum {
  label: string;
  value: number;
  color?: string | null;
  href?: string;
  hint?: string;
}

/** Horizontal labelled bars — best for ranked categories. */
export function BarList({ data, format = (n) => String(n), onClick, max: maxProp, emptyLabel = 'No data' }: { data: BarDatum[]; format?: (n: number) => string; onClick?: (d: BarDatum) => void; max?: number; emptyLabel?: string }) {
  const max = maxProp ?? Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <p className="py-4 text-center text-xs text-muted">{emptyLabel}</p>;
  return (
    <ul className="space-y-1.5">
      {data.map((d) => (
        <li key={d.label}>
          <button
            type="button"
            disabled={!onClick}
            onClick={() => onClick?.(d)}
            className={cn('group w-full text-left', onClick && 'cursor-pointer')}
            title={d.hint}
          >
            <div className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate group-hover:text-primary">{d.label}</span>
              <span className="shrink-0 font-medium tabular-nums">{format(d.value)}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full transition-[width]" style={{ width: `${(d.value / max) * 100}%`, backgroundColor: d.color ?? 'var(--primary)' }} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

export interface SeriesPoint {
  x: string;
  values: Record<string, number>;
}

/** Grouped/stacked column chart over a time axis (e.g. created vs resolved per day). */
export function ColumnChart({
  data,
  series,
  height = 160,
  stacked = false,
}: {
  data: SeriesPoint[];
  series: { key: string; label: string; color: string }[];
  height?: number;
  stacked?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return <p className="py-4 text-center text-xs text-muted">No data</p>;
  const totals = data.map((d) => (stacked ? series.reduce((a, s) => a + (d.values[s.key] ?? 0), 0) : Math.max(...series.map((s) => d.values[s.key] ?? 0))));
  const max = Math.max(1, ...totals);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1]!;
  const w = 100 / data.length;
  const labelEvery = Math.max(1, Math.ceil(data.length / 7));
  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="flex flex-col justify-between text-right text-[10px] tabular-nums text-subtle" style={{ height }}>
          {[...ticks].reverse().map((t) => (
            <span key={t} className="leading-none">
              {t}
            </span>
          ))}
        </div>
        <div className="relative flex-1" style={{ height }}>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-dashed border-border" style={{ bottom: `${(t / top) * 100}%` }} />
          ))}
          <svg className="absolute inset-0 h-full w-full overflow-visible" preserveAspectRatio="none" viewBox={`0 0 100 ${height}`}>
            {data.map((d, i) => {
              const x = i * w;
              if (stacked) {
                let acc = 0;
                return (
                  <g key={d.x} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                    <rect x={x} y={0} width={w} height={height} fill="transparent" />
                    {series.map((s) => {
                      const v = d.values[s.key] ?? 0;
                      const h = (v / top) * height;
                      acc += h;
                      return <rect key={s.key} x={x + w * 0.18} width={w * 0.64} y={height - acc} height={h} fill={s.color} opacity={hover === null || hover === i ? 1 : 0.5} />;
                    })}
                  </g>
                );
              }
              const bw = (w * 0.7) / series.length;
              return (
                <g key={d.x} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  <rect x={x} y={0} width={w} height={height} fill="transparent" />
                  {series.map((s, j) => {
                    const v = d.values[s.key] ?? 0;
                    const h = (v / top) * height;
                    return <rect key={s.key} x={x + w * 0.15 + j * bw} width={bw * 0.9} y={height - h} height={h} rx={0.4} fill={s.color} opacity={hover === null || hover === i ? 1 : 0.45} />;
                  })}
                </g>
              );
            })}
          </svg>
          {hover !== null && data[hover] && (
            <div
              className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded border border-border bg-surface px-2 py-1 text-[11px] shadow-lg"
              style={{ left: `${(hover + 0.5) * w}%` }}
            >
              <div className="font-medium">{data[hover]!.x}</div>
              {series.map((s) => (
                <div key={s.key} className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="size-2 rounded-sm" style={{ backgroundColor: s.color }} />
                  {s.label}: <span className="tabular-nums">{data[hover]!.values[s.key] ?? 0}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="relative ml-6 mt-1 h-3 text-[10px] text-subtle">
        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <span key={d.x} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(i + 0.5) * w}%` }}>
              {d.x.length === 10 ? d.x.slice(5).replace('-', '/') : d.x}
            </span>
          ) : null,
        )}
      </div>
      <Legend series={series} />
    </div>
  );
}

export function Legend({ series }: { series: { label: string; color: string }[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted">
      {series.map((s) => (
        <span key={s.label} className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm" style={{ backgroundColor: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/** Donut with centre label — for parts of a whole (few categories). */
export function Donut({ data, size = 120, thickness = 16, center }: { data: BarDatum[]; size?: number; thickness?: number; center?: React.ReactNode }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} />
          {total > 0 &&
            data.map((d) => {
              const len = (d.value / total) * c;
              const el = (
                <circle
                  key={d.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={d.color ?? 'var(--primary)'}
                  strokeWidth={thickness}
                  strokeDasharray={`${Math.max(0, len - 1.5)} ${c}`}
                  strokeDashoffset={-offset}
                >
                  <title>{`${d.label}: ${d.value}`}</title>
                </circle>
              );
              offset += len;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center ?? <span className="text-lg font-semibold tabular-nums">{total}</span>}</div>
      </div>
      <ul className="min-w-0 space-y-1 text-[12px]">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: d.color ?? 'var(--primary)' }} />
            <span className="truncate">{d.label}</span>
            <span className="ml-auto pl-2 font-medium tabular-nums">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Thin progress bar (0–100). */
export function Progress({ value, tone = 'primary', className }: { value: number; tone?: 'primary' | 'success' | 'warning' | 'danger'; className?: string }) {
  const color = { primary: 'var(--primary)', success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--danger)' }[tone];
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-2', className)}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color }} />
    </div>
  );
}

function niceTicks(max: number): number[] {
  const step = Math.max(1, Math.pow(10, Math.floor(Math.log10(max))) * (max / Math.pow(10, Math.floor(Math.log10(max))) > 5 ? 2 : max / Math.pow(10, Math.floor(Math.log10(max))) > 2 ? 1 : 0.5));
  const s = Math.max(1, Math.round(step));
  const ticks: number[] = [];
  for (let t = 0; t <= max + s - 1; t += s) ticks.push(t);
  if (ticks[ticks.length - 1]! < max) ticks.push(ticks[ticks.length - 1]! + s);
  return ticks.length > 6 ? ticks.filter((_, i) => i % 2 === 0) : ticks;
}

export const CHART_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#ec4899', '#84cc16', '#64748b'];
