import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { formatMoney, OPPORTUNITY_STAGE } from '@taskora/shared';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLookups, userOpts } from '@/lib/lookups';
import { fmtDate } from '@/lib/utils';
import { PageHeader, SearchInput } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Card } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/overlays';
import { FormField, FormGrid, handleFormError } from '@/components/form';
import { EntityPicker } from '@/components/entity-picker';

interface Opp {
  id: number;
  companyId: number;
  companyName: string;
  contactId: number | null;
  ownerId: number | null;
  ownerName: string | null;
  title: string;
  stage: string;
  amount: number | null;
  probability: number;
  expectedCloseDate: string | null;
  description: string | null;
}

export default function OpportunitiesPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const write = can('opportunities.write');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Opp | 'new' | null>(null);
  const list = useQuery({ queryKey: ['opportunities', q], queryFn: () => api.get<Paginated<Opp>>('/opportunities', { q, pageSize: 500 }) });
  const move = useMutation({
    mutationFn: ({ id, stage }: { id: number; stage: string }) => api.patch(`/opportunities/${id}`, { stage }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['opportunities'] }),
  });
  const rows = list.data?.data ?? [];
  return (
    <div>
      <PageHeader
        title="Opportunities"
        icon={<TrendingUp />}
        subtitle="Sales pipeline for new projects and services"
        actions={
          write && (
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus /> New opportunity
            </Button>
          )
        }
      >
        <div className="pb-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search opportunities…" />
        </div>
      </PageHeader>
      <div className="grid gap-3 overflow-x-auto p-5 md:grid-cols-5">
        {OPPORTUNITY_STAGE.values.map((stage) => {
          const items = rows.filter((r) => r.stage === stage);
          const total = items.reduce((a, r) => a + (r.amount ?? 0), 0);
          const weighted = items.reduce((a, r) => a + ((r.amount ?? 0) * r.probability) / 100, 0);
          return (
            <div
              key={stage}
              className="min-w-52 rounded-lg border border-border bg-surface-2/60 p-2"
              onDragOver={(e) => write && e.preventDefault()}
              onDrop={(e) => {
                const id = Number(e.dataTransfer.getData('text/opp'));
                if (id) move.mutate({ id, stage });
              }}
            >
              <div className="mb-2 px-1">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {OPPORTUNITY_STAGE.labels[stage]} <span>{items.length}</span>
                </div>
                <div className="text-xs tabular-nums">
                  {formatMoney(total)} <span className="text-muted">· weighted {formatMoney(weighted)}</span>
                </div>
              </div>
              <div className="space-y-2">
                {items.map((o) => (
                  <Card key={o.id} draggable={write} onDragStart={(e) => e.dataTransfer.setData('text/opp', String(o.id))} className="cursor-pointer p-2.5" onClick={() => write && setEditing(o)}>
                    <div className="text-[13px] font-medium">{o.title}</div>
                    <Link to={`/companies/${o.companyId}`} onClick={(e) => e.stopPropagation()} className="text-xs text-muted hover:text-primary">
                      {o.companyName}
                    </Link>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
                      <span className="font-medium text-foreground">{o.amount != null ? formatMoney(o.amount) : '—'}</span>
                      <span>{o.probability}%</span>
                    </div>
                    <div className="text-[11px] text-subtle">
                      {o.ownerName ?? 'No owner'} · close {fmtDate(o.expectedCloseDate)}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {editing && <OppDialog opp={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function OppDialog({ opp, onClose }: { opp: Opp | null; onClose: () => void }) {
  const qc = useQueryClient();
  const lookups = useLookups();
  const [f, setF] = useState({ companyId: opp?.companyId ?? 0, contactId: opp?.contactId ?? null, ownerId: opp?.ownerId ?? null, title: opp?.title ?? '', stage: opp?.stage ?? 'qualification', amount: opp?.amount?.toString() ?? '', probability: opp?.probability ?? 10, expectedCloseDate: opp?.expectedCloseDate ?? '', description: opp?.description ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => setErrors({}), [opp]);
  const save = useMutation({
    mutationFn: () => {
      const body = { ...f, amount: f.amount || null };
      return opp ? api.patch(`/opportunities/${opp.id}`, body) : api.post('/opportunities', body);
    },
    onSuccess: () => {
      toast.success('Opportunity saved');
      qc.invalidateQueries({ queryKey: ['opportunities'] });
      onClose();
    },
    onError: (e) => handleFormError(e, (n: string, err: { message: string }) => setErrors((x) => ({ ...x, [n]: err.message }))),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/opportunities/${opp!.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opportunities'] });
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={opp ? 'Edit opportunity' : 'New opportunity'}
      size="lg"
      footer={
        <>
          {opp && (
            <Button variant="ghost" className="mr-auto text-danger" onClick={() => remove.mutate()}>
              Delete
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <FormGrid cols={2}>
        <FormField label="Title" required error={errors.title} className="sm:col-span-2">
          <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </FormField>
        <FormField label="Company" required error={errors.companyId}>
          <EntityPicker kind="company" value={f.companyId || null} label={opp?.companyName} onChange={(id) => setF({ ...f, companyId: id ?? 0, contactId: null })} />
        </FormField>
        <FormField label="Contact">
          <EntityPicker kind="contact" value={f.contactId} filter={{ companyId: f.companyId || undefined }} disabled={!f.companyId} onChange={(id) => setF({ ...f, contactId: id })} />
        </FormField>
        <FormField label="Stage">
          <Select value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })} options={OPPORTUNITY_STAGE.values.map((v) => ({ value: v, label: OPPORTUNITY_STAGE.labels[v] }))} />
        </FormField>
        <FormField label="Owner">
          <Select value={f.ownerId ?? ''} onChange={(e) => setF({ ...f, ownerId: e.target.value ? Number(e.target.value) : null })} placeholder="—" options={userOpts(lookups.data?.users, f.ownerId, false)} />
        </FormField>
        <FormField label="Amount">
          <Input type="number" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        </FormField>
        <FormField label="Probability (%)">
          <Input type="number" min={0} max={100} value={f.probability} onChange={(e) => setF({ ...f, probability: Number(e.target.value) })} />
        </FormField>
        <FormField label="Expected close">
          <Input type="date" value={f.expectedCloseDate} onChange={(e) => setF({ ...f, expectedCloseDate: e.target.value })} />
        </FormField>
        <FormField label="Description" className="sm:col-span-2">
          <Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </FormField>
      </FormGrid>
    </Dialog>
  );
}
