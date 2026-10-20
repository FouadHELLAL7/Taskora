import { Briefcase } from 'lucide-react';
import { BILLING_PERIOD, formatMoney } from '@taskora/shared';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/misc';
import { SettingsTable } from '@/components/admin/settings-table';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = { id: number } & Record<string, any>;

export default function ServicesPage() {
  const { can } = useAuth();
  return (
    <div>
      <PageHeader title="Services" icon={<Briefcase />} subtitle="Catalogue of recurring services sold on contracts (managed workstations, backup, M365 management…)" />
      <div className="p-5">
        <SettingsTable<Row>
          title="Service catalogue"
          entityLabel="service"
          endpoint="/services"
          canWrite={can('contracts.write')}
          defaults={{ name: '', description: '', unitPrice: 0, unitCost: '', period: 'monthly', isActive: true }}
          columns={[
            { header: 'Service', cell: ({ row }) => <div><div className="font-medium">{row.original.name}</div>{row.original.description && <div className="text-[11px] text-muted">{row.original.description}</div>}</div> },
            { header: 'Period', cell: ({ row }) => <Badge>{BILLING_PERIOD.labels[row.original.period as keyof typeof BILLING_PERIOD.labels]}</Badge> },
            { header: 'Unit price', meta: { align: 'right' }, cell: ({ row }) => formatMoney(row.original.unitPrice) },
            { header: 'Unit cost', meta: { align: 'right' }, cell: ({ row }) => (row.original.unitCost != null ? formatMoney(row.original.unitCost) : '—') },
            { header: 'Active', cell: ({ row }) => (row.original.isActive ? 'Yes' : 'No') },
          ]}
          fields={[
            { name: 'name', label: 'Name', type: 'text', required: true, span: 2 },
            { name: 'description', label: 'Description', type: 'textarea', span: 2, rows: 2 },
            { name: 'unitPrice', label: 'Unit price', type: 'number', step: 0.01, required: true },
            { name: 'unitCost', label: 'Unit cost', type: 'number', step: 0.01 },
            { name: 'period', label: 'Billing period', type: 'select', options: BILLING_PERIOD.values.map((v) => ({ value: v, label: BILLING_PERIOD.labels[v] })) },
            { name: 'isActive', label: 'Active', type: 'checkbox' },
          ]}
        />
      </div>
    </div>
  );
}
