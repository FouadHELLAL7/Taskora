import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CI_LIFECYCLE } from '@taskora/shared';
import { api } from '@/lib/api';
import { opts, useLookups } from '@/lib/lookups';
import { Button } from '../ui/button';
import { Input, Select, Textarea } from '../ui/input';
import { Dialog } from '../ui/overlays';
import { FormField, FormGrid, FormSection, handleFormError } from '../form';
import { EntityPicker } from '../entity-picker';
import { CustomFieldsEditor } from '../custom-fields';

export interface CiRecord {
  id: number;
  name: string;
  ciTypeId: number;
  companyId: number;
  companyName?: string;
  contactId: number | null;
  contactName?: string | null;
  locationId: number | null;
  productId: number | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  assetTag: string | null;
  hostname: string | null;
  osName: string | null;
  osVersion: string | null;
  ipAddress: string | null;
  macAddress: string | null;
  cpu: string | null;
  ramGb: number | null;
  storageGb: number | null;
  purchaseDate: string | null;
  purchaseCost: number | null;
  warrantyExpiresAt: string | null;
  supportExpiresAt: string | null;
  installDate: string | null;
  lifecycleStatus: string;
  notes: string | null;
  customFields: Record<string, unknown>;
}

type Values = Omit<CiRecord, 'id' | 'companyName' | 'contactName'>;

const blank: Values = {
  name: '',
  ciTypeId: 0,
  companyId: 0,
  contactId: null,
  locationId: null,
  productId: null,
  manufacturer: '',
  model: '',
  serialNumber: '',
  assetTag: '',
  hostname: '',
  osName: '',
  osVersion: '',
  ipAddress: '',
  macAddress: '',
  cpu: '',
  ramGb: null,
  storageGb: null,
  purchaseDate: '',
  purchaseCost: null,
  warrantyExpiresAt: '',
  supportExpiresAt: '',
  installDate: '',
  lifecycleStatus: 'active',
  notes: '',
  customFields: {},
};

export function CiFormDialog({
  open,
  onOpenChange,
  ci,
  defaults,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ci?: CiRecord | null;
  defaults?: Partial<Values> & { companyName?: string };
  onSaved?: (row: CiRecord) => void;
}) {
  const qc = useQueryClient();
  const lookups = useLookups();
  const form = useForm<Values>({ defaultValues: blank });
  const { register, handleSubmit, reset, control, setError, watch, formState } = form;
  useEffect(() => {
    if (!open) return;
    const base = ci ?? { ...blank, ...defaults };
    reset(Object.fromEntries(Object.entries({ ...blank, ...base }).map(([k, v]) => [k, v ?? (typeof (blank as never)[k] === 'string' ? '' : v)])) as Values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ci, reset]);
  const companyId = watch('companyId');
  const save = useMutation({
    mutationFn: (v: Values) => {
      const body = { ...v, ramGb: v.ramGb || null, storageGb: v.storageGb || null, purchaseCost: v.purchaseCost || null };
      return ci ? api.patch<CiRecord>(`/configuration-items/${ci.id}`, body) : api.post<CiRecord>('/configuration-items', body);
    },
    onSuccess: (row) => {
      toast.success(ci ? 'Configuration item updated' : 'Configuration item created');
      qc.invalidateQueries({ queryKey: ['cis'] });
      qc.invalidateQueries({ queryKey: ['ci', row.id] });
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
      title={ci ? `Edit ${ci.name}` : 'New configuration item'}
      size="xl"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={handleSubmit((v) => save.mutate(v))}>
            {ci ? 'Save changes' : 'Create CI'}
          </Button>
        </>
      }
    >
      <form className="space-y-5" onSubmit={handleSubmit((v) => save.mutate(v))}>
        <FormSection title="Identification">
          <FormGrid cols={3}>
            <FormField label="Name" required error={err('name')}>
              <Input {...register('name')} placeholder="e.g. NS-LAPTOP-014" />
            </FormField>
            <FormField label="Type" required error={err('ciTypeId')}>
              <Select {...register('ciTypeId', { valueAsNumber: true })} placeholder="Select…" options={opts(lookups.data?.ciTypes, ci?.ciTypeId)} />
            </FormField>
            <FormField label="Lifecycle status">
              <Select {...register('lifecycleStatus')} options={CI_LIFECYCLE.values.map((v) => ({ value: v, label: CI_LIFECYCLE.labels[v] }))} />
            </FormField>
            <FormField label="Company" required error={err('companyId')}>
              <Controller
                control={control}
                name="companyId"
                render={({ field }) => (
                  <EntityPicker
                    kind="company"
                    value={field.value || null}
                    label={ci?.companyName ?? defaults?.companyName}
                    onChange={(id) => {
                      field.onChange(id ?? 0);
                      form.setValue('contactId', null);
                      form.setValue('locationId', null);
                    }}
                    clearable={false}
                  />
                )}
              />
            </FormField>
            <FormField label="Assigned contact" error={err('contactId')}>
              <Controller
                control={control}
                name="contactId"
                render={({ field }) => (
                  <EntityPicker kind="contact" value={field.value} label={ci?.contactName} filter={{ companyId: companyId || undefined }} disabled={!companyId} onChange={field.onChange} />
                )}
              />
            </FormField>
            <FormField label="Location" error={err('locationId')}>
              <Controller control={control} name="locationId" render={({ field }) => <EntityPicker kind="location" value={field.value} filter={{ companyId: companyId || undefined }} disabled={!companyId} onChange={field.onChange} />} />
            </FormField>
            <FormField label="Manufacturer">
              <Input {...register('manufacturer')} />
            </FormField>
            <FormField label="Model">
              <Input {...register('model')} />
            </FormField>
            <FormField label="Serial number">
              <Input {...register('serialNumber')} />
            </FormField>
            <FormField label="Asset tag">
              <Input {...register('assetTag')} />
            </FormField>
            <FormField label="Product">
              <Controller control={control} name="productId" render={({ field }) => <EntityPicker kind="product" value={field.value} onChange={field.onChange} placeholder="None" />} />
            </FormField>
          </FormGrid>
        </FormSection>
        <FormSection title="System & network">
          <FormGrid cols={4}>
            <FormField label="Hostname">
              <Input {...register('hostname')} />
            </FormField>
            <FormField label="Operating system">
              <Input {...register('osName')} />
            </FormField>
            <FormField label="OS version">
              <Input {...register('osVersion')} />
            </FormField>
            <FormField label="CPU">
              <Input {...register('cpu')} />
            </FormField>
            <FormField label="IP address">
              <Input {...register('ipAddress')} />
            </FormField>
            <FormField label="MAC address">
              <Input {...register('macAddress')} />
            </FormField>
            <FormField label="RAM (GB)">
              <Input type="number" step="any" {...register('ramGb')} />
            </FormField>
            <FormField label="Storage (GB)">
              <Input type="number" step="any" {...register('storageGb')} />
            </FormField>
          </FormGrid>
        </FormSection>
        <FormSection title="Lifecycle & warranty">
          <FormGrid cols={4}>
            <FormField label="Purchase date" error={err('purchaseDate')}>
              <Input type="date" {...register('purchaseDate')} />
            </FormField>
            <FormField label="Purchase cost">
              <Input type="number" step="0.01" {...register('purchaseCost')} />
            </FormField>
            <FormField label="Warranty expires" error={err('warrantyExpiresAt')}>
              <Input type="date" {...register('warrantyExpiresAt')} />
            </FormField>
            <FormField label="Support expires">
              <Input type="date" {...register('supportExpiresAt')} />
            </FormField>
            <FormField label="Install date">
              <Input type="date" {...register('installDate')} />
            </FormField>
          </FormGrid>
        </FormSection>
        <Controller control={control} name="customFields" render={({ field }) => <CustomFieldsEditor entity="configuration_item" value={field.value} onChange={field.onChange} errors={formState.errors} />} />
        <FormField label="Notes">
          <Textarea rows={3} {...register('notes')} />
        </FormField>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
