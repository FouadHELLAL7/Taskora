import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Controller, useForm, type RegisterOptions } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MoreHorizontal, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { DataTable, type Column } from '../data-table';
import { FormField, FormGrid, handleFormError } from '../form';
import { Button } from '../ui/button';
import { Checkbox, Input, Select, Textarea } from '../ui/input';
import { Card, CardHeader } from '../ui/misc';
import { ConfirmDialog, Dialog, DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger } from '../ui/overlays';

export interface FieldOption {
  value: string | number;
  label: string;
}

type Values = Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface SettingsField<T = any> {
  name: string;
  label: string;
  type: 'text' | 'email' | 'textarea' | 'number' | 'color' | 'checkbox' | 'select' | 'lines';
  required?: boolean;
  /** Select options; may depend on the other values in the form (e.g. sub-issue types of the chosen issue type). */
  options?: FieldOption[] | ((values: Values, row: T | null) => FieldOption[]);
  /** Select stores numeric ids (empty → null). */
  numeric?: boolean;
  placeholder?: string;
  hint?: ReactNode;
  /** Columns spanned in the two-column grid. Textareas and lists always span the full width. */
  span?: 1 | 2;
  readOnlyOnEdit?: boolean;
  visible?: (values: Values) => boolean;
  min?: number;
  max?: number;
  step?: number | 'any';
  rows?: number;
  rules?: RegisterOptions;
  /** Fields cleared when this field changes (dependent pickers). */
  resets?: string[];
  mono?: boolean;
}

export interface SettingsTableProps<T extends { id: number }> {
  title: string;
  description?: ReactNode;
  /** Singular noun used in buttons and messages ("status", "queue"…). */
  entityLabel: string;
  endpoint: string;
  /** List filters (query string) that are also injected into created records. */
  params?: Record<string, string | number>;
  columns: Column<T>[];
  fields: SettingsField<T>[];
  defaults: Values;
  canWrite: boolean;
  /** Extra query keys to invalidate after a change. Defaults to the lookups cache. */
  invalidate?: unknown[][];
  canDelete?: (row: T) => boolean;
  rowLabel?: (row: T) => string;
  /** When set, clicking a row selects it (two-pane layouts); editing moves to the row action. */
  onSelect?: (row: T) => void;
  selectedId?: number | null;
  headerActions?: ReactNode;
  emptyText?: string;
  dialogSize?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  /** Client-side sort; rows come back in API order otherwise. */
  sortRows?: (a: T, b: T) => number;
  /** Optional transform applied to the payload before it is sent. */
  beforeSave?: (payload: Values, row: T | null) => Values;
}

/** Converts an API row into form values (null → '' for inputs, lists → lines). */
function toFormValues<T>(fields: SettingsField<T>[], source: Values): Values {
  const out: Values = {};
  for (const f of fields) {
    const v = source[f.name];
    if (f.type === 'checkbox') out[f.name] = !!v;
    else if (f.type === 'lines') out[f.name] = Array.isArray(v) ? v.join('\n') : (v ?? '');
    else out[f.name] = v ?? '';
  }
  return out;
}

function fromFormValues<T>(fields: SettingsField<T>[], values: Values, editing: boolean): Values {
  const out: Values = {};
  for (const f of fields) {
    if (editing && f.readOnlyOnEdit) continue;
    const v = values[f.name];
    switch (f.type) {
      case 'checkbox':
        out[f.name] = !!v;
        break;
      case 'number':
        out[f.name] = v === '' || v === null || v === undefined || Number.isNaN(v) ? null : Number(v);
        break;
      case 'select':
        out[f.name] = f.numeric ? (v === '' || v === null || v === undefined ? null : Number(v)) : v === '' ? null : v;
        break;
      case 'lines':
        out[f.name] = String(v ?? '')
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      default:
        out[f.name] = typeof v === 'string' ? v : (v ?? null);
    }
  }
  return out;
}

/** Shows an API delete failure; offers deactivation when the record is still referenced. */
export function reportDeleteError(err: unknown, deactivate?: () => void) {
  if (err instanceof ApiError && err.code === 'in_use') {
    toast.error(err.message, deactivate ? { action: { label: 'Deactivate', onClick: deactivate }, duration: 10_000 } : { duration: 8_000 });
    return;
  }
  handleFormError(err);
}

/**
 * Generic CRUD table for small configuration tables backed by lib/crud.ts
 * (statuses, queues, work types…), driven by a column + field config.
 */
export function SettingsTable<T extends { id: number }>(props: SettingsTableProps<T>) {
  const { title, description, entityLabel, endpoint, params, columns, fields, defaults, canWrite, onSelect, selectedId, headerActions, emptyText, className, sortRows } = props;
  const qc = useQueryClient();
  const [editing, setEditing] = useState<T | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<T | null>(null);
  const hasActive = 'isActive' in defaults;
  const label = props.rowLabel ?? ((r: T) => String((r as unknown as Values).name ?? (r as unknown as Values).label ?? `#${r.id}`));

  const list = useQuery({
    queryKey: ['settings', endpoint, params ?? {}],
    queryFn: () => api.get<{ data: T[] }>(endpoint, params),
  });
  const rows = useMemo(() => (sortRows ? [...(list.data?.data ?? [])].sort(sortRows) : list.data?.data), [list.data, sortRows]);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['settings', endpoint] });
    for (const key of props.invalidate ?? [['lookups']]) qc.invalidateQueries({ queryKey: key });
  };

  const toggle = useMutation({
    mutationFn: (row: T) => api.patch(`${endpoint}/${row.id}`, { isActive: !(row as unknown as Values).isActive }),
    onSuccess: (_d, row) => {
      toast.success(`${label(row)} ${(row as unknown as Values).isActive ? 'deactivated' : 'activated'}`);
      invalidateAll();
    },
    onError: (e) => handleFormError(e),
  });

  const remove = useMutation({
    mutationFn: (row: T) => api.delete(`${endpoint}/${row.id}`),
    onSuccess: (_d, row) => {
      toast.success(`${label(row)} deleted`);
      setDeleting(null);
      invalidateAll();
    },
    onError: (e, row) => {
      setDeleting(null);
      const active = hasActive && (row as unknown as Values).isActive;
      reportDeleteError(e, active ? () => toggle.mutate(row) : undefined);
    },
  });

  const allColumns = useMemo<Column<T>[]>(() => {
    if (!canWrite) return columns;
    return [
      ...columns,
      {
        id: '__actions',
        header: '',
        meta: { className: 'w-16 text-right' },
        cell: ({ row }) => {
          const r = row.original;
          const deletable = props.canDelete ? props.canDelete(r) : true;
          return (
            <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
              <Button size="icon-sm" variant="ghost" aria-label={`Edit ${label(r)}`} onClick={() => setEditing(r)}>
                <Pencil />
              </Button>
              {(hasActive || deletable) && (
                <DropdownMenu>
                  <DropdownTrigger asChild>
                    <Button size="icon-sm" variant="ghost" aria-label="More actions">
                      <MoreHorizontal />
                    </Button>
                  </DropdownTrigger>
                  <DropdownContent>
                    {hasActive && (
                      <DropdownItem onSelect={() => toggle.mutate(r)}>
                        <Power /> {(r as unknown as Values).isActive ? 'Deactivate' : 'Activate'}
                      </DropdownItem>
                    )}
                    {hasActive && deletable && <DropdownSeparator />}
                    {deletable && (
                      <DropdownItem danger onSelect={() => setDeleting(r)}>
                        <Trash2 /> Delete
                      </DropdownItem>
                    )}
                  </DropdownContent>
                </DropdownMenu>
              )}
            </div>
          );
        },
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, canWrite, hasActive]);

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader
        title={title}
        description={description}
        actions={
          <>
            {headerActions}
            {canWrite && (
              <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
                <Plus /> New {entityLabel}
              </Button>
            )}
          </>
        }
      />
      <DataTable
        columns={allColumns}
        data={rows}
        loading={list.isLoading}
        onRowClick={onSelect ? (r) => onSelect(r) : canWrite ? (r) => setEditing(r) : undefined}
        rowClassName={(r) =>
          cn(
            hasActive && !(r as unknown as Values).isActive && 'opacity-60',
            selectedId != null && r.id === selectedId && '!bg-primary-soft',
          )
        }
        empty={<div className="px-4 py-8 text-center text-xs text-muted">{emptyText ?? `No ${entityLabel}s defined yet.`}</div>}
      />
      <SettingsFormDialog
        open={creating || !!editing}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false);
            setEditing(null);
          }
        }}
        row={editing}
        entityLabel={entityLabel}
        endpoint={endpoint}
        params={params}
        fields={fields}
        defaults={defaults}
        size={props.dialogSize}
        beforeSave={props.beforeSave}
        onSaved={invalidateAll}
        rowLabel={label}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${entityLabel}?`}
        description={
          <>
            <strong className="text-foreground">{deleting ? label(deleting) : ''}</strong> will be permanently deleted.
            {hasActive && ' If it is still used by other records, deactivate it instead.'}
          </>
        }
        confirmLabel="Delete"
        danger
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </Card>
  );
}

/** Create/edit dialog generated from a field config. */
export function SettingsFormDialog<T extends { id: number }>({
  open,
  onOpenChange,
  row,
  entityLabel,
  endpoint,
  params,
  fields,
  defaults,
  size = 'md',
  beforeSave,
  onSaved,
  rowLabel,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  row: T | null;
  entityLabel: string;
  endpoint: string;
  params?: Record<string, string | number>;
  fields: SettingsField<T>[];
  defaults: Values;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  beforeSave?: (payload: Values, row: T | null) => Values;
  onSaved?: (row: T) => void;
  rowLabel: (row: T) => string;
}) {
  const form = useForm<Values>({ defaultValues: toFormValues(fields, defaults) });
  const { register, handleSubmit, reset, setError, control, formState, watch, setValue } = form;
  const values = watch();

  useEffect(() => {
    if (open) reset(toFormValues(fields, row ? (row as unknown as Values) : defaults));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row]);

  const save = useMutation({
    mutationFn: (v: Values) => {
      let payload = fromFormValues(fields, v, !!row);
      if (!row && params) payload = { ...params, ...payload };
      if (beforeSave) payload = beforeSave(payload, row);
      return row ? api.patch<T>(`${endpoint}/${row.id}`, payload) : api.post<T>(endpoint, payload);
    },
    onSuccess: (saved) => {
      toast.success(row ? `${rowLabel(row)} updated` : `${entityLabel[0]!.toUpperCase()}${entityLabel.slice(1)} created`);
      onSaved?.(saved);
      onOpenChange(false);
    },
    onError: (e) => handleFormError(e, setError),
  });

  const err = (k: string) => formState.errors[k]?.message as string | undefined;
  const visible = fields.filter((f) => !f.visible || f.visible(values));
  const inputs = visible.filter((f) => f.type !== 'checkbox');
  const flags = visible.filter((f) => f.type === 'checkbox');
  const submit = handleSubmit((v) => save.mutate(v));

  const renderInput = (f: SettingsField<T>) => {
    const ro = !!row && f.readOnlyOnEdit;
    const onChangeReset = f.resets?.length
      ? {
          onChange: () => {
            for (const r of f.resets!) setValue(r, '');
          },
        }
      : {};
    switch (f.type) {
      case 'textarea':
      case 'lines':
        return <Textarea rows={f.rows ?? (f.type === 'lines' ? 5 : 4)} placeholder={f.placeholder} disabled={ro} className={cn(f.mono && 'font-mono text-xs')} {...register(f.name, { required: f.required ? 'Required' : false, ...f.rules })} aria-invalid={!!err(f.name)} />;
      case 'number':
        return (
          <Input
            type="number"
            min={f.min}
            max={f.max}
            step={f.step ?? 1}
            placeholder={f.placeholder}
            disabled={ro}
            {...register(f.name, { required: f.required ? 'Required' : false, ...f.rules })}
            aria-invalid={!!err(f.name)}
          />
        );
      case 'color':
        return (
          <Controller
            control={control}
            name={f.name}
            rules={{ pattern: { value: /^#[0-9a-fA-F]{6}$/, message: 'Use a hex colour like #3b82f6' } }}
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(String(field.value)) ? String(field.value) : '#64748b'}
                  onChange={(e) => field.onChange(e.target.value)}
                  className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-border-strong bg-surface p-0.5"
                  aria-label={f.label}
                />
                <Input value={String(field.value ?? '')} onChange={(e) => field.onChange(e.target.value)} className="font-mono" maxLength={7} />
              </div>
            )}
          />
        );
      case 'select': {
        const options = typeof f.options === 'function' ? f.options(values, row) : (f.options ?? []);
        return (
          <Select
            disabled={ro}
            placeholder={f.required ? undefined : (f.placeholder ?? '—')}
            options={options}
            {...register(f.name, { required: f.required ? 'Required' : false, ...f.rules, ...onChangeReset })}
            aria-invalid={!!err(f.name)}
          />
        );
      }
      default:
        return (
          <Input
            type={f.type === 'email' ? 'email' : 'text'}
            placeholder={f.placeholder}
            disabled={ro}
            className={cn(f.mono && 'font-mono')}
            {...register(f.name, { required: f.required ? 'Required' : false, ...f.rules })}
            aria-invalid={!!err(f.name)}
          />
        );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={row ? `Edit ${rowLabel(row)}` : `New ${entityLabel}`}
      size={size}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            {row ? 'Save changes' : `Create ${entityLabel}`}
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        <FormGrid cols={2}>
          {inputs.map((f) => (
            <FormField
              key={f.name}
              label={f.label}
              required={f.required}
              error={err(f.name)}
              hint={row && f.readOnlyOnEdit ? 'Cannot be changed after creation' : f.hint}
              className={cn((f.span === 2 || f.type === 'textarea' || f.type === 'lines') && 'sm:col-span-2')}
            >
              {renderInput(f)}
            </FormField>
          ))}
        </FormGrid>
        {flags.length > 0 && (
          <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-md border border-border bg-surface-2/50 px-3 py-2.5">
            {flags.map((f) => (
              <div key={f.name}>
                <Checkbox label={f.label} {...register(f.name)} />
                {f.hint && <p className="ml-5.5 text-[11px] text-muted">{f.hint}</p>}
              </div>
            ))}
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

/* --------------------------------------------------------- cell helpers */

export function ColorSwatch({ color, name }: { color?: string | null; name?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="size-3 shrink-0 rounded-sm border border-black/10" style={{ backgroundColor: color ?? 'var(--subtle)' }} />
      {name}
    </span>
  );
}

export function YesNo({ value }: { value: unknown }) {
  return value ? <span className="text-foreground">Yes</span> : <span className="text-subtle">—</span>;
}
