import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Lock, ShieldCheck } from 'lucide-react';
import { ALL_PERMISSIONS, PERMISSION_GROUPS, PERMISSIONS, type Permission } from '@taskora/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog } from '../ui/overlays';
import { FormField, FormGrid, handleFormError } from '../form';
import type { RoleRow } from './user-form';

const GROUPS = PERMISSION_GROUPS.map((g) => ({
  label: g.label,
  perms: ALL_PERMISSIONS.filter((p) => g.prefix.some((pre) => p.startsWith(pre))),
}));

/** Expands the '*' wildcard into the full permission list. */
export function expandPermissions(perms: string[]): string[] {
  return perms.includes('*') ? [...ALL_PERMISSIONS] : perms;
}

export function PermissionMatrix({ value, onChange, readOnly }: { value: string[]; onChange?: (v: string[]) => void; readOnly?: boolean }) {
  const set = new Set(value);
  const toggle = (perms: Permission[], on: boolean) => {
    const next = new Set(set);
    for (const p of perms) {
      if (on) next.add(p);
      else next.delete(p);
    }
    onChange?.(ALL_PERMISSIONS.filter((p) => next.has(p)));
  };
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {GROUPS.map((g) => {
        const count = g.perms.filter((p) => set.has(p)).length;
        const all = count === g.perms.length;
        return (
          <div key={g.label} className="rounded-md border border-border">
            <label className={cn('flex items-center gap-2 border-b border-border bg-surface-2/60 px-3 py-1.5', !readOnly && 'cursor-pointer')}>
              <input
                type="checkbox"
                className="size-3.5 cursor-pointer accent-[var(--primary)] disabled:cursor-default"
                checked={all}
                disabled={readOnly}
                ref={(el) => {
                  if (el) el.indeterminate = count > 0 && !all;
                }}
                onChange={(e) => toggle(g.perms, e.target.checked)}
              />
              <span className="text-[12px] font-semibold">{g.label}</span>
              <span className="ml-auto text-[11px] tabular-nums text-muted">
                {count}/{g.perms.length}
              </span>
            </label>
            <div className="space-y-0.5 p-1.5">
              {g.perms.map((p) => (
                <label key={p} className={cn('flex items-start gap-2 rounded px-1.5 py-1', !readOnly && 'cursor-pointer hover:bg-surface-2')}>
                  <input
                    type="checkbox"
                    className="mt-0.5 size-3.5 cursor-pointer accent-[var(--primary)] disabled:cursor-default"
                    checked={set.has(p)}
                    disabled={readOnly}
                    onChange={(e) => toggle([p], e.target.checked)}
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] leading-tight">{PERMISSIONS[p]}</span>
                    <code className="text-[10px] text-subtle">{p}</code>
                  </span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface FormValues {
  name: string;
  description: string;
  permissions: string[];
}

/**
 * Create/edit a custom role, or view a built-in role read-only. `template`
 * pre-fills a new role (used by "Duplicate").
 */
export function RoleFormDialog({
  open,
  onOpenChange,
  role,
  template,
  onDuplicate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  role: RoleRow | null;
  template?: { name: string; description: string | null; permissions: string[] } | null;
  onDuplicate?: (role: RoleRow) => void;
}) {
  const qc = useQueryClient();
  const readOnly = !!role?.isSystem;
  const { register, handleSubmit, reset, setError, control, formState, watch, setValue } = useForm<FormValues>({ defaultValues: { name: '', description: '', permissions: [] } });

  useEffect(() => {
    if (!open) return;
    const src = role ?? template;
    reset({ name: src?.name ?? '', description: src?.description ?? '', permissions: expandPermissions(src?.permissions ?? []) });
  }, [open, role, template, reset]);

  const save = useMutation({
    mutationFn: (v: FormValues) => (role ? api.patch<RoleRow>(`/roles/${role.id}`, v) : api.post<RoleRow>('/roles', v)),
    onSuccess: () => {
      toast.success(role ? 'Role updated' : 'Role created');
      qc.invalidateQueries({ queryKey: ['roles'] });
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['me'] });
      onOpenChange(false);
    },
    onError: (e) => handleFormError(e, setError),
  });

  const perms = watch('permissions') ?? [];
  const err = (k: keyof FormValues) => formState.errors[k]?.message;
  const submit = handleSubmit((v) => save.mutate(v));
  const fullAccess = role?.permissions.includes('*');

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={role ? (readOnly ? role.name : `Edit ${role.name}`) : 'New role'}
      description={readOnly ? 'Built-in role — permissions are fixed. Duplicate it to create a custom variant.' : `${perms.length} of ${ALL_PERMISSIONS.length} permissions granted`}
      size="xl"
      footer={
        readOnly ? (
          <>
            {onDuplicate && role && (
              <Button onClick={() => onDuplicate(role)}>
                <Copy /> Duplicate as custom role
              </Button>
            )}
            <Button variant="primary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant="primary" loading={save.isPending} onClick={submit}>
              {role ? 'Save changes' : 'Create role'}
            </Button>
          </>
        )
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        {readOnly ? (
          <div className="flex items-start gap-2 rounded-md border border-border bg-surface-2/60 px-3 py-2 text-[13px]">
            <Lock className="mt-0.5 size-4 shrink-0 text-muted" />
            <div>
              <div className="font-medium">{role?.name}</div>
              <div className="text-muted">{role?.description}</div>
            </div>
          </div>
        ) : (
          <FormGrid cols={2}>
            <FormField label="Name" required error={err('name')}>
              <Input {...register('name', { required: 'Required' })} aria-invalid={!!err('name')} />
            </FormField>
            <FormField label="Description" error={err('description')}>
              <Input {...register('description')} />
            </FormField>
          </FormGrid>
        )}
        {fullAccess && (
          <div className="flex items-center gap-2 rounded-md bg-primary-soft px-3 py-2 text-[13px] text-primary">
            <ShieldCheck className="size-4" /> Full access: this role is granted every permission, including ones added in future versions.
          </div>
        )}
        <div className="flex items-center justify-between">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Permissions</h4>
          {!readOnly && (
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setValue('permissions', [...ALL_PERMISSIONS], { shouldDirty: true })}>
                Select all
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setValue('permissions', [], { shouldDirty: true })}>
                Clear
              </Button>
            </div>
          )}
        </div>
        <Controller control={control} name="permissions" render={({ field }) => <PermissionMatrix value={field.value} onChange={field.onChange} readOnly={readOnly} />} />
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
