import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BILLING_PERIOD, CONTRACT_STATUS, CONTRACT_TYPE } from '@taskora/shared';
import { api } from '@/lib/api';
import { useLookups, opts } from '@/lib/lookups';
import { todayIso } from '@/lib/utils';
import { Button } from '../ui/button';
import { Checkbox, Input, Select, Textarea } from '../ui/input';
import { Dialog } from '../ui/overlays';
import { FormField, FormGrid, FormSection, handleFormError } from '../form';
import { EntityPicker } from '../entity-picker';
import { CustomFieldsEditor } from '../custom-fields';
import { enumOpts } from './common';

export interface ContractRecord {
  id: number;
  contractNumber: string;
  name: string;
  companyId: number;
  companyName?: string | null;
  type: string;
  status: string;
  startDate: string;
  endDate: string | null;
  slaId: number | null;
  slaName?: string | null;
  contactId: number | null;
  contactName?: string | null;
  isDefault: boolean;
  hourlyRate: number | null;
  fixedAmount: number | null;
  recurringAmount: number | null;
  billingPeriod: string;
  overageRate: number | null;
  description: string | null;
  customFields: Record<string, unknown>;
}

interface FormValues {
  name: string;
  companyId: number | null;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  slaId: string;
  contactId: number | null;
  isDefault: boolean;
  hourlyRate: string;
  fixedAmount: string;
  recurringAmount: string;
  billingPeriod: string;
  overageRate: string;
  description: string;
  customFields: Record<string, unknown>;
}

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));

function toForm(c?: ContractRecord | null, companyId?: number | null): FormValues {
  return {
    name: c?.name ?? '',
    companyId: c?.companyId ?? companyId ?? null,
    type: c?.type ?? 'time_materials',
    status: c?.status ?? 'active',
    startDate: c?.startDate ?? todayIso(),
    endDate: c?.endDate ?? '',
    slaId: s(c?.slaId),
    contactId: c?.contactId ?? null,
    isDefault: c?.isDefault ?? false,
    hourlyRate: s(c?.hourlyRate),
    fixedAmount: s(c?.fixedAmount),
    recurringAmount: s(c?.recurringAmount),
    billingPeriod: c?.billingPeriod ?? 'monthly',
    overageRate: s(c?.overageRate),
    description: c?.description ?? '',
    customFields: c?.customFields ?? {},
  };
}

/** Which commercial fields apply to each contract type. */
export const CONTRACT_FIELDS: Record<string, { hourly?: boolean; fixed?: boolean; recurring?: boolean; overage?: boolean }> = {
  time_materials: { hourly: true },
  fixed_price: { fixed: true },
  block_hours: { overage: true, hourly: true },
  retainer: { recurring: true, overage: true },
  recurring: { recurring: true },
  per_ticket: { hourly: true },
};

export function ContractFormDialog({
  open,
  onOpenChange,
  contract,
  companyId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  contract?: ContractRecord | null;
  companyId?: number | null;
  onSaved?: (c: ContractRecord) => void;
}) {
  const qc = useQueryClient();
  const lookups = useLookups();
  const { register, handleSubmit, reset, setError, control, formState, watch, setValue } = useForm<FormValues>({ defaultValues: toForm() });

  useEffect(() => {
    if (open) reset(toForm(contract, companyId));
  }, [open, contract, companyId, reset]);

  const type = watch('type');
  const selectedCompany = watch('companyId');
  const f = CONTRACT_FIELDS[type] ?? {};

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const body = {
        name: v.name,
        type: v.type,
        status: v.status,
        startDate: v.startDate,
        endDate: v.endDate || null,
        slaId: v.slaId ? Number(v.slaId) : null,
        contactId: v.contactId,
        isDefault: v.isDefault,
        hourlyRate: f.hourly ? v.hourlyRate || null : null,
        fixedAmount: f.fixed ? v.fixedAmount || null : null,
        recurringAmount: f.recurring ? v.recurringAmount || null : null,
        billingPeriod: v.billingPeriod,
        overageRate: f.overage ? v.overageRate || null : null,
        description: v.description || null,
        customFields: v.customFields,
      };
      return contract ? api.patch<ContractRecord>(`/contracts/${contract.id}`, body) : api.post<ContractRecord>('/contracts', { ...body, companyId: v.companyId });
    },
    onSuccess: (row) => {
      toast.success(contract ? 'Contract updated' : 'Contract created');
      qc.invalidateQueries({ queryKey: ['contracts'] });
      qc.invalidateQueries({ queryKey: ['contract', row.id] });
      onOpenChange(false);
      onSaved?.(row);
    },
    onError: (e) => handleFormError(e, setError),
  });

  const err = (k: keyof FormValues) => formState.errors[k]?.message as string | undefined;
  const submit = handleSubmit((v) => save.mutate(v));

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={contract ? `Edit ${contract.contractNumber}` : 'New contract'}
      size="lg"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            {contract ? 'Save changes' : 'Create contract'}
          </Button>
        </>
      }
    >
      <form className="space-y-5" onSubmit={submit}>
        <FormSection title="General">
          <FormGrid cols={3}>
            <FormField label="Contract name" required error={err('name')} className="sm:col-span-2">
              <Input {...register('name')} aria-invalid={!!err('name')} placeholder="e.g. Managed services 2026" />
            </FormField>
            <FormField label="Company" required error={err('companyId')} hint={contract ? 'The company cannot be changed' : undefined}>
              <Controller
                control={control}
                name="companyId"
                render={({ field }) => (
                  <EntityPicker
                    kind="company"
                    value={field.value}
                    onChange={(id) => {
                      field.onChange(id);
                      setValue('contactId', null);
                    }}
                    label={contract?.companyName}
                    disabled={!!contract}
                    invalid={!!err('companyId')}
                    placeholder="Select company…"
                  />
                )}
              />
            </FormField>
            <FormField label="Type" required>
              <Select {...register('type')} options={enumOpts(CONTRACT_TYPE)} />
            </FormField>
            <FormField label="Status">
              <Select {...register('status')} options={enumOpts(CONTRACT_STATUS)} />
            </FormField>
            <FormField label="SLA policy" hint="Applied to tickets on this contract">
              <Select {...register('slaId')} placeholder="Company / system default" options={opts(lookups.data?.slaPolicies, contract?.slaId)} />
            </FormField>
            <FormField label="Start date" required error={err('startDate')}>
              <Input type="date" {...register('startDate')} aria-invalid={!!err('startDate')} />
            </FormField>
            <FormField label="End date" error={err('endDate')}>
              <Input type="date" {...register('endDate')} aria-invalid={!!err('endDate')} />
            </FormField>
            <FormField label="Customer contact">
              <Controller
                control={control}
                name="contactId"
                render={({ field }) => (
                  <EntityPicker
                    kind="contact"
                    value={field.value}
                    onChange={field.onChange}
                    label={contract?.contactName}
                    filter={{ companyId: selectedCompany }}
                    disabled={!selectedCompany}
                    placeholder="None"
                  />
                )}
              />
            </FormField>
          </FormGrid>
          <Checkbox label="Default contract for this company (applied to new tickets)" {...register('isDefault')} />
        </FormSection>

        <FormSection title="Commercial terms">
          <FormGrid cols={3}>
            {f.hourly && (
              <FormField label={type === 'block_hours' ? 'Hourly rate (reporting)' : 'Hourly rate'} error={err('hourlyRate')} hint="Overrides work type rates">
                <Input type="number" step="0.01" min="0" {...register('hourlyRate')} />
              </FormField>
            )}
            {f.fixed && (
              <FormField label="Fixed amount" error={err('fixedAmount')}>
                <Input type="number" step="0.01" min="0" {...register('fixedAmount')} />
              </FormField>
            )}
            {f.recurring && (
              <FormField label="Recurring amount" error={err('recurringAmount')} hint="Invoiced every billing period">
                <Input type="number" step="0.01" min="0" {...register('recurringAmount')} />
              </FormField>
            )}
            {(f.recurring || f.fixed) && (
              <FormField label="Billing period">
                <Select {...register('billingPeriod')} options={enumOpts(BILLING_PERIOD)} />
              </FormField>
            )}
            {f.overage && (
              <FormField label="Overage rate" error={err('overageRate')} hint="Per hour beyond purchased hours">
                <Input type="number" step="0.01" min="0" {...register('overageRate')} />
              </FormField>
            )}
          </FormGrid>
          {type === 'block_hours' && <p className="text-xs text-muted">Purchased hour blocks are added on the contract after it is created.</p>}
        </FormSection>

        <Controller control={control} name="customFields" render={({ field }) => <CustomFieldsEditor entity="contract" value={field.value} onChange={field.onChange} errors={formState.errors} />} />
        <FormField label="Description / scope">
          <Textarea rows={3} {...register('description')} />
        </FormField>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
