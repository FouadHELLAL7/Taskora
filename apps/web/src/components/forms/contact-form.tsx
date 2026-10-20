import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, type Paginated } from '@/lib/api';
import { Button } from '../ui/button';
import { Checkbox, Input, Select, Textarea } from '../ui/input';
import { Dialog } from '../ui/overlays';
import { FormField, FormGrid, handleFormError } from '../form';
import { EntityPicker } from '../entity-picker';
import { CustomFieldsEditor } from '../custom-fields';

export interface ContactRecord {
  id: number;
  companyId: number;
  companyName?: string;
  locationId: number | null;
  firstName: string;
  lastName: string;
  title: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  isActive: boolean;
  isPrimary: boolean;
  notes: string | null;
  customFields: Record<string, unknown>;
}

type Values = Omit<ContactRecord, 'id' | 'companyName'>;

export function ContactFormDialog({
  open,
  onOpenChange,
  contact,
  companyId,
  companyName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  contact?: ContactRecord | null;
  companyId?: number;
  companyName?: string;
  onSaved?: (c: ContactRecord) => void;
}) {
  const qc = useQueryClient();
  const empty: Values = {
    companyId: companyId ?? 0,
    locationId: null,
    firstName: '',
    lastName: '',
    title: '',
    department: '',
    email: '',
    phone: '',
    mobile: '',
    isActive: true,
    isPrimary: false,
    notes: '',
    customFields: {},
  };
  const form = useForm<Values>({ defaultValues: empty });
  const { register, handleSubmit, reset, control, setError, watch, formState } = form;
  useEffect(() => {
    if (open) reset(contact ? { ...empty, ...Object.fromEntries(Object.entries(contact).map(([k, v]) => [k, v ?? (typeof (empty as never)[k] === 'string' ? '' : v)])) } : empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contact, reset]);
  const cid = watch('companyId');
  const locations = useQuery({
    queryKey: ['locations', 'company', cid],
    queryFn: () => api.get<Paginated<{ id: number; name: string }>>('/locations', { companyId: cid, pageSize: 100 }),
    enabled: !!cid && open,
  });
  const save = useMutation({
    mutationFn: (v: Values) => (contact ? api.patch<ContactRecord>(`/contacts/${contact.id}`, v) : api.post<ContactRecord>('/contacts', v)),
    onSuccess: (row) => {
      toast.success(contact ? 'Contact updated' : 'Contact created');
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['contact', row.id] });
      qc.invalidateQueries({ queryKey: ['company'] });
      onOpenChange(false);
      onSaved?.(row);
    },
    onError: (e) => handleFormError(e, setError),
  });
  const err = (k: keyof Values) => formState.errors[k]?.message as string | undefined;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={contact ? `Edit ${contact.firstName} ${contact.lastName}` : 'New contact'}
      size="lg"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={handleSubmit((v) => save.mutate(v))}>
            {contact ? 'Save changes' : 'Create contact'}
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit((v) => save.mutate(v))}>
        <FormGrid cols={2}>
          <FormField label="Company" required error={err('companyId')}>
            <Controller
              control={control}
              name="companyId"
              render={({ field }) => <EntityPicker kind="company" value={field.value || null} label={contact?.companyName ?? companyName} onChange={(id) => field.onChange(id ?? 0)} clearable={false} />}
            />
          </FormField>
          <FormField label="Location">
            <Select {...register('locationId', { setValueAs: (v) => (v ? Number(v) : null) })} placeholder="—" options={(locations.data?.data ?? []).map((l) => ({ value: l.id, label: l.name }))} />
          </FormField>
          <FormField label="First name" required error={err('firstName')}>
            <Input {...register('firstName')} />
          </FormField>
          <FormField label="Last name" required error={err('lastName')}>
            <Input {...register('lastName')} />
          </FormField>
          <FormField label="Job title">
            <Input {...register('title')} />
          </FormField>
          <FormField label="Department">
            <Input {...register('department')} />
          </FormField>
          <FormField label="E-mail" error={err('email')}>
            <Input type="email" {...register('email')} />
          </FormField>
          <FormField label="Phone">
            <Input {...register('phone')} />
          </FormField>
          <FormField label="Mobile">
            <Input {...register('mobile')} />
          </FormField>
          <div className="flex items-end gap-4 pb-2">
            <Checkbox label="Active" {...register('isActive')} />
            <Checkbox label="Primary contact" {...register('isPrimary')} />
          </div>
        </FormGrid>
        <Controller control={control} name="customFields" render={({ field }) => <CustomFieldsEditor entity="contact" value={field.value} onChange={field.onChange} errors={formState.errors} />} />
        <FormField label="Notes">
          <Textarea rows={3} {...register('notes')} />
        </FormField>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
