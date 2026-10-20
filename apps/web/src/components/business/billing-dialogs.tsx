import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useLookups, opts } from '@/lib/lookups';
import { todayIso } from '@/lib/utils';
import { Button } from '../ui/button';
import { Checkbox, Input, Select, Textarea } from '../ui/input';
import { Dialog } from '../ui/overlays';
import { FormField, FormGrid, handleFormError } from '../form';
import { EntityPicker } from '../entity-picker';

/* ------------------------------------------------------------ invoice draft */

interface DraftForm {
  companyId: number | null;
  periodStart: string;
  periodEnd: string;
  taxRate: string;
  includeTime: boolean;
  includeExpenses: boolean;
  includeRecurring: boolean;
  notes: string;
}

const TAX_KEY = 'taskora.invoice.taxRate';
function lastTaxRate() {
  try {
    return localStorage.getItem(TAX_KEY) ?? '0';
  } catch {
    return '0';
  }
}

export function InvoiceDraftDialog({
  open,
  onOpenChange,
  company,
  periodStart,
  periodEnd,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  company?: { id: number; name: string } | null;
  periodStart: string;
  periodEnd: string;
  onCreated: (invoice: { id: number; invoiceNumber: string }) => void;
}) {
  const qc = useQueryClient();
  const { register, handleSubmit, reset, setError, control, formState } = useForm<DraftForm>();
  useEffect(() => {
    if (open)
      reset({ companyId: company?.id ?? null, periodStart, periodEnd, taxRate: lastTaxRate(), includeTime: true, includeExpenses: true, includeRecurring: true, notes: '' });
  }, [open, company, periodStart, periodEnd, reset]);

  const create = useMutation({
    mutationFn: (v: DraftForm) => api.post<{ id: number; invoiceNumber: string; lines: unknown[] }>('/invoices/draft', { ...v, notes: v.notes || null }),
    onSuccess: (inv, v) => {
      try {
        localStorage.setItem(TAX_KEY, v.taxRate);
      } catch {
        /* ignore */
      }
      toast.success(`Draft ${inv.invoiceNumber} created with ${inv.lines.length} line${inv.lines.length === 1 ? '' : 's'}`);
      qc.invalidateQueries({ queryKey: ['billing-review'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['expenses'] });
      onOpenChange(false);
      onCreated(inv);
    },
    onError: (e) => handleFormError(e, setError),
  });
  const err = (k: keyof DraftForm) => formState.errors[k]?.message as string | undefined;
  const submit = handleSubmit((v) => create.mutate(v));
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={company ? `Invoice draft · ${company.name}` : 'New invoice draft'}
      description="Collects unbilled approved time, billable expenses and recurring contract fees for the period."
      size="sm"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={create.isPending} onClick={submit}>
            Create draft
          </Button>
        </>
      }
    >
      <form className="space-y-3" onSubmit={submit}>
        {!company && (
          <FormField label="Company" required error={err('companyId')}>
            <Controller control={control} name="companyId" render={({ field }) => <EntityPicker kind="company" value={field.value} onChange={field.onChange} invalid={!!err('companyId')} />} />
          </FormField>
        )}
        <FormGrid>
          <FormField label="Period start" required error={err('periodStart')}>
            <Input type="date" {...register('periodStart')} />
          </FormField>
          <FormField label="Period end" required error={err('periodEnd')}>
            <Input type="date" {...register('periodEnd')} />
          </FormField>
          <FormField label="Tax rate (%)" error={err('taxRate')}>
            <Input type="number" min="0" max="100" step="0.01" {...register('taxRate')} />
          </FormField>
        </FormGrid>
        <div className="flex flex-col gap-1.5">
          <Checkbox label="Approved billable time" {...register('includeTime')} />
          <Checkbox label="Billable expenses" {...register('includeExpenses')} />
          <Checkbox label="Recurring contract fees and services" {...register('includeRecurring')} />
        </div>
        <FormField label="Notes (printed on the invoice)">
          <Textarea rows={2} {...register('notes')} />
        </FormField>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ expense */

interface ExpenseForm {
  companyId: number | null;
  ticketId: number | null;
  projectId: number | null;
  billingCodeId: string;
  expenseDate: string;
  description: string;
  amount: string;
  billable: boolean;
}

export function ExpenseDialog({ open, onOpenChange, companyId }: { open: boolean; onOpenChange: (o: boolean) => void; companyId?: number | null }) {
  const qc = useQueryClient();
  const lookups = useLookups();
  const { register, handleSubmit, reset, setError, control, formState, watch, setValue } = useForm<ExpenseForm>();
  useEffect(() => {
    if (open) reset({ companyId: companyId ?? null, ticketId: null, projectId: null, billingCodeId: '', expenseDate: todayIso(), description: '', amount: '', billable: true });
  }, [open, companyId, reset]);
  const company = watch('companyId');
  const save = useMutation({
    mutationFn: (v: ExpenseForm) => api.post('/expenses', { ...v, billingCodeId: v.billingCodeId ? Number(v.billingCodeId) : null }),
    onSuccess: () => {
      toast.success('Expense added');
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['billing-review'] });
      onOpenChange(false);
    },
    onError: (e) => handleFormError(e, setError),
  });
  const err = (k: keyof ExpenseForm) => formState.errors[k]?.message as string | undefined;
  const submit = handleSubmit((v) => save.mutate(v));
  const codes = (lookups.data?.billingCodes ?? []).filter((c) => c.kind !== 'labor' && c.kind !== 'labour');
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add expense"
      size="md"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            Add expense
          </Button>
        </>
      }
    >
      <form className="space-y-3" onSubmit={submit}>
        <FormGrid>
          <FormField label="Company" required error={err('companyId')}>
            <Controller
              control={control}
              name="companyId"
              render={({ field }) => (
                <EntityPicker
                  kind="company"
                  value={field.value}
                  onChange={(id) => {
                    field.onChange(id);
                    setValue('ticketId', null);
                    setValue('projectId', null);
                  }}
                  invalid={!!err('companyId')}
                />
              )}
            />
          </FormField>
          <FormField label="Date" required error={err('expenseDate')}>
            <Input type="date" {...register('expenseDate')} />
          </FormField>
          <FormField label="Ticket" error={err('ticketId')}>
            <Controller control={control} name="ticketId" render={({ field }) => <EntityPicker kind="ticket" value={field.value} onChange={field.onChange} filter={{ companyId: company }} disabled={!company} placeholder="None" />} />
          </FormField>
          <FormField label="Project" error={err('projectId')}>
            <Controller control={control} name="projectId" render={({ field }) => <EntityPicker kind="project" value={field.value} onChange={field.onChange} filter={{ companyId: company }} disabled={!company} placeholder="None" />} />
          </FormField>
          <FormField label="Amount" required error={err('amount')}>
            <Input type="number" min="0" step="0.01" {...register('amount')} aria-invalid={!!err('amount')} />
          </FormField>
          <FormField label="Billing code">
            <Select {...register('billingCodeId')} placeholder="—" options={opts(codes, null, (c) => `${c.code} · ${c.name}`)} />
          </FormField>
        </FormGrid>
        <FormField label="Description" required error={err('description')}>
          <Input {...register('description')} aria-invalid={!!err('description')} placeholder="e.g. Travel to site, replacement SSD" />
        </FormField>
        <Checkbox label="Billable to customer" {...register('billable')} />
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
