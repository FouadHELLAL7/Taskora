import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { Button } from '../ui/button';
import { Checkbox, Input, Select } from '../ui/input';
import { Dialog } from '../ui/overlays';
import { FormField, FormGrid, FormSection, handleFormError } from '../form';
import { timezoneOptions } from './timezones';

export interface UserRow {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  title: string | null;
  phone: string | null;
  roleId: number;
  roleName: string;
  isActive: boolean;
  isTechnician: boolean;
  timezone: string;
  hourlyCost: number | null;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  createdAt: string;
}

export interface RoleRow {
  id: number;
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  userCount: number;
}

interface FormValues {
  firstName: string;
  lastName: string;
  email: string;
  title: string;
  phone: string;
  roleId: string;
  isActive: boolean;
  isTechnician: boolean;
  timezone: string;
  hourlyCost: string;
  password: string;
  confirmPassword: string;
}

export function useRoles() {
  return useQuery({ queryKey: ['roles'], queryFn: () => api.get<{ data: RoleRow[] }>('/roles') });
}

const passwordRules = (required: boolean) => ({
  validate: (v: string) => {
    if (!v) return required ? 'Required' : true;
    if (v.length < 12) return 'Use at least 12 characters';
    if (!/[a-zA-Z]/.test(v) || !/[0-9]/.test(v)) return 'Use letters and numbers';
    return true;
  },
});

export function UserFormDialog({ open, onOpenChange, user }: { open: boolean; onOpenChange: (o: boolean) => void; user: UserRow | null }) {
  const qc = useQueryClient();
  const me = useMe();
  const roles = useRoles();
  const isSelf = !!user && user.id === me.user.id;
  const { register, handleSubmit, reset, setError, formState, watch } = useForm<FormValues>();

  useEffect(() => {
    if (!open) return;
    const defaultRole = roles.data?.data.find((r) => r.key === 'technician')?.id;
    reset({
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      email: user?.email ?? '',
      title: user?.title ?? '',
      phone: user?.phone ?? '',
      roleId: String(user?.roleId ?? defaultRole ?? ''),
      isActive: user?.isActive ?? true,
      isTechnician: user?.isTechnician ?? true,
      timezone: user?.timezone ?? me.organization.timezone ?? 'UTC',
      hourlyCost: user?.hourlyCost != null ? String(user.hourlyCost) : '',
      password: '',
      confirmPassword: '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user, roles.data]);

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const payload: Record<string, unknown> = {
        firstName: v.firstName,
        lastName: v.lastName,
        email: v.email,
        title: v.title,
        phone: v.phone,
        isTechnician: v.isTechnician,
        timezone: v.timezone,
        hourlyCost: v.hourlyCost === '' ? null : Number(v.hourlyCost),
      };
      // The API refuses role/active changes on your own account; don't send them for yourself.
      if (!isSelf) {
        payload.roleId = Number(v.roleId);
        payload.isActive = v.isActive;
      }
      if (v.password) payload.password = v.password;
      return user ? api.patch(`/users/${user.id}`, payload) : api.post('/users', payload);
    },
    onSuccess: () => {
      toast.success(user ? `${user.firstName} ${user.lastName} updated` : 'User created');
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['roles'] });
      qc.invalidateQueries({ queryKey: ['lookups'] });
      if (isSelf) qc.invalidateQueries({ queryKey: ['me'] });
      onOpenChange(false);
    },
    onError: (e) => handleFormError(e, setError),
  });

  const err = (k: keyof FormValues) => formState.errors[k]?.message;
  const submit = handleSubmit((v) => save.mutate(v));
  const password = watch('password');

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={user ? `Edit ${user.firstName} ${user.lastName}` : 'New user'}
      description={user ? user.email : 'The user signs in with this e-mail address and password.'}
      size="lg"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            {user ? 'Save changes' : 'Create user'}
          </Button>
        </>
      }
    >
      <form className="space-y-5" onSubmit={submit}>
        <FormSection title="Profile">
          <FormGrid cols={2}>
            <FormField label="First name" required error={err('firstName')}>
              <Input {...register('firstName', { required: 'Required' })} aria-invalid={!!err('firstName')} />
            </FormField>
            <FormField label="Last name" required error={err('lastName')}>
              <Input {...register('lastName', { required: 'Required' })} aria-invalid={!!err('lastName')} />
            </FormField>
            <FormField label="E-mail" required error={err('email')}>
              <Input type="email" autoComplete="off" {...register('email', { required: 'Required' })} aria-invalid={!!err('email')} />
            </FormField>
            <FormField label="Job title" error={err('title')}>
              <Input {...register('title')} />
            </FormField>
            <FormField label="Phone" error={err('phone')}>
              <Input {...register('phone')} />
            </FormField>
            <FormField label="Time zone" error={err('timezone')}>
              <Select {...register('timezone')} options={timezoneOptions(user?.timezone)} />
            </FormField>
          </FormGrid>
        </FormSection>
        <FormSection title="Access">
          <FormGrid cols={2}>
            <FormField label="Role" required error={err('roleId')} hint={isSelf ? 'You cannot change your own role' : undefined}>
              <Select
                disabled={isSelf}
                placeholder={roles.data ? 'Select a role…' : 'Loading…'}
                options={(roles.data?.data ?? []).map((r) => ({ value: r.id, label: r.name }))}
                {...register('roleId', { required: 'Required' })}
                aria-invalid={!!err('roleId')}
              />
            </FormField>
            <FormField label="Hourly cost" error={err('hourlyCost')} hint="Internal cost rate used for profitability reports">
              <Input type="number" min={0} step="0.01" {...register('hourlyCost')} />
            </FormField>
          </FormGrid>
          <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-md border border-border bg-surface-2/50 px-3 py-2.5">
            <div>
              <Checkbox label="Technician (resource)" {...register('isTechnician')} />
              <p className="ml-5.5 text-[11px] text-muted">Can be assigned tickets, tasks and service calls</p>
            </div>
            <div>
              <Checkbox label="Active" disabled={isSelf} {...register('isActive')} />
              <p className="ml-5.5 text-[11px] text-muted">{isSelf ? 'You cannot deactivate yourself' : 'Inactive users cannot sign in; their sessions are ended'}</p>
            </div>
          </div>
        </FormSection>
        <FormSection title={user ? 'Set a new password' : 'Password'}>
          <FormGrid cols={2}>
            <FormField label={user ? 'New password' : 'Password'} required={!user} error={err('password')} hint={user ? 'Leave empty to keep the current password. Changing it signs the user out.' : 'At least 12 characters, letters and numbers'}>
              <Input type="password" autoComplete="new-password" {...register('password', passwordRules(!user))} aria-invalid={!!err('password')} />
            </FormField>
            <FormField label="Confirm password" required={!user || !!password} error={err('confirmPassword')}>
              <Input
                type="password"
                autoComplete="new-password"
                {...register('confirmPassword', { validate: (v, all) => (all.password && v !== all.password ? 'Passwords do not match' : true) })}
                aria-invalid={!!err('confirmPassword')}
              />
            </FormField>
          </FormGrid>
        </FormSection>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
