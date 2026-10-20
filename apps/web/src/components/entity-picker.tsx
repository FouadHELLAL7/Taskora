import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { api, type Paginated } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Popover, PopoverAnchor, PopoverContent } from './ui/overlays';
import { Spinner } from './ui/misc';

export type EntityKind = 'company' | 'contact' | 'ci' | 'ticket' | 'contract' | 'project' | 'location' | 'task' | 'service' | 'product';

interface Option {
  id: number;
  label: string;
  sub?: string | null;
}

const SOURCES: Record<EntityKind, { path: string; map: (r: any) => Option }> = {
  company: { path: '/companies', map: (r) => ({ id: r.id, label: r.name, sub: r.city ?? r.accountNumber }) },
  contact: { path: '/contacts', map: (r) => ({ id: r.id, label: `${r.firstName} ${r.lastName}`, sub: [r.companyName, r.email].filter(Boolean).join(' · ') }) },
  ci: { path: '/configuration-items', map: (r) => ({ id: r.id, label: r.name, sub: [r.ciTypeName, r.contactName, r.serialNumber].filter(Boolean).join(' · ') }) },
  ticket: { path: '/tickets', map: (r) => ({ id: r.id, label: `${r.ticketNumber} ${r.title}`, sub: [r.companyName, r.statusName].filter(Boolean).join(' · ') }) },
  contract: { path: '/contracts', map: (r) => ({ id: r.id, label: r.name, sub: [r.contractNumber, r.companyName].filter(Boolean).join(' · ') }) },
  project: { path: '/projects', map: (r) => ({ id: r.id, label: r.name, sub: [r.projectNumber, r.companyName].filter(Boolean).join(' · ') }) },
  location: { path: '/locations', map: (r) => ({ id: r.id, label: r.name, sub: r.city }) },
  task: { path: '/project-tasks', map: (r) => ({ id: r.id, label: r.title, sub: [r.projectName, r.companyName].filter(Boolean).join(' · ') }) },
  service: { path: '/services', map: (r) => ({ id: r.id, label: r.name, sub: r.period }) },
  product: { path: '/products', map: (r) => ({ id: r.id, label: r.name, sub: r.manufacturer }) },
};

export interface EntityPickerProps {
  kind: EntityKind;
  value: number | null | undefined;
  onChange: (id: number | null, option?: Option) => void;
  /** Label of the current value when known (avoids an extra fetch). */
  label?: string | null;
  placeholder?: string;
  /** Extra query filters (e.g. { companyId }). */
  filter?: Record<string, string | number | undefined | null>;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  clearable?: boolean;
}

/** Searchable async picker for related records (server-side search). */
export function EntityPicker({ kind, value, onChange, label, placeholder = 'Select…', filter, disabled, invalid, className, clearable = true }: EntityPickerProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(label ?? null);
  const inputRef = useRef<HTMLInputElement>(null);
  const src = SOURCES[kind];

  useEffect(() => setSelectedLabel(label ?? null), [label, value]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 200);
    return () => clearTimeout(t);
  }, [q]);

  const cleanFilter = Object.fromEntries(Object.entries(filter ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const list = useQuery({
    queryKey: ['picker', kind, debounced, cleanFilter],
    queryFn: async () => {
      const res = await api.get<Paginated<unknown> | { data: unknown[] }>(src.path, { q: debounced, pageSize: 20, ...cleanFilter } as never);
      return (res.data as unknown[]).map(src.map);
    },
    enabled: open,
    staleTime: 10_000,
  });

  // Resolve the label of a preset value that wasn't provided.
  const needsLabel = value != null && !selectedLabel && kind !== 'task' && kind !== 'service' && kind !== 'product';
  const resolved = useQuery({
    queryKey: ['picker-label', kind, value],
    queryFn: async () => src.map(await api.get<unknown>(`${src.path}/${value}`)),
    enabled: needsLabel,
    staleTime: 60_000,
  });
  const display = selectedLabel ?? resolved.data?.label ?? (value != null ? `#${value}` : '');

  const options = list.data ?? [];
  const choose = (o: Option | null) => {
    onChange(o?.id ?? null, o ?? undefined);
    setSelectedLabel(o?.label ?? null);
    setOpen(false);
    setQ('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            'relative flex h-8 w-full items-center rounded-md border border-border-strong bg-surface text-[13px] transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20',
            invalid && 'border-danger',
            disabled && 'opacity-60',
            className,
          )}
        >
          {open ? (
            <>
              <Search className="ml-2 size-3.5 shrink-0 text-muted" />
              <input
                ref={inputRef}
                autoFocus
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setActive((a) => Math.min(a + 1, options.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setActive((a) => Math.max(a - 1, 0));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (options[active]) choose(options[active]!);
                  } else if (e.key === 'Escape') {
                    setOpen(false);
                  }
                }}
                placeholder={display || placeholder}
                className="h-full min-w-0 flex-1 bg-transparent px-2 outline-none placeholder:text-subtle"
              />
              {list.isFetching && <Spinner className="mr-2 size-3.5" />}
            </>
          ) : (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setOpen(true)}
              className="flex h-full min-w-0 flex-1 cursor-pointer items-center px-2.5 text-left"
            >
              <span className={cn('truncate', !display && 'text-subtle')}>{display || placeholder}</span>
            </button>
          )}
          {!open && value != null && clearable && !disabled ? (
            <button type="button" onClick={() => choose(null)} className="mr-1.5 cursor-pointer rounded p-0.5 text-muted hover:text-foreground" aria-label="Clear">
              <X className="size-3.5" />
            </button>
          ) : (
            !open && <ChevronDown className="mr-2 size-3.5 shrink-0 text-muted" />
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent className="max-h-72 w-[var(--radix-popover-trigger-width)] min-w-64 overflow-y-auto">
        {options.length === 0 && !list.isFetching && <div className="px-2 py-3 text-center text-xs text-muted">No matches</div>}
        {options.map((o, i) => (
          <button
            type="button"
            key={o.id}
            onMouseEnter={() => setActive(i)}
            onClick={() => choose(o)}
            className={cn('flex w-full cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-left', i === active && 'bg-surface-2')}
          >
            <Check className={cn('mt-0.5 size-3.5 shrink-0', o.id === value ? 'text-primary' : 'invisible')} />
            <span className="min-w-0">
              <span className="block truncate text-[13px]">{o.label}</span>
              {o.sub && <span className="block truncate text-[11px] text-muted">{o.sub}</span>}
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
