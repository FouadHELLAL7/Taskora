import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumbs,
  icon,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: { label: string; to?: string }[];
  icon?: ReactNode;
  children?: ReactNode;
}) {
  useEffect(() => {
    if (typeof title === 'string') document.title = `${title} · Taskora`;
  }, [title]);
  return (
    <div className="border-b border-border bg-surface px-5 pt-3">
      {breadcrumbs && (
        <nav className="mb-1 flex items-center gap-1 text-xs text-muted" aria-label="Breadcrumb">
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3" />}
              {b.to ? (
                <Link to={b.to} className="hover:text-foreground">
                  {b.label}
                </Link>
              ) : (
                <span>{b.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3">
        <div className="flex min-w-0 items-center gap-3">
          {icon && <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary [&_svg]:size-5">{icon}</div>}
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
            {subtitle && <div className="mt-0.5 text-[13px] text-muted">{subtitle}</div>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}

/** Full-height list page layout: header + toolbar + table filling the rest. */
export function ListLayout({ header, toolbar, children }: { header: ReactNode; toolbar?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      {header}
      {toolbar && <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-5 py-2">{toolbar}</div>}
      <div className="min-h-0 flex-1 bg-surface">{children}</div>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => {
    if (local === value) return;
    const t = setTimeout(() => onChange(local), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);
  return (
    <div className={cn('relative w-64', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-full rounded-md border border-border-strong bg-surface pl-8 pr-2 text-[13px] placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}

/** Compact select used in list toolbars. */
export function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  options: { value: string | number; label: string }[];
  placeholder: string;
  className?: string;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'h-8 max-w-48 cursor-pointer rounded-md border border-border-strong bg-surface px-2 text-[13px] focus:border-primary focus:outline-none',
        value ? 'text-foreground' : 'text-muted',
        className,
      )}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
