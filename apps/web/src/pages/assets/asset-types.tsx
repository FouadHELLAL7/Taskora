import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Boxes } from 'lucide-react';
import { CI_CATEGORY } from '@taskora/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/page';
import { SettingsTable } from '@/components/admin/settings-table';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = { id: number } & Record<string, any>;

export default function AssetTypesPage() {
  const { can } = useAuth();
  const counts = useQuery({ queryKey: ['report-assets-type'], queryFn: () => api.get<{ data: { group: string; total: number; active: number; action1Managed: number }[] }>('/reports/assets', { group: 'type' }) });
  const count = (name: string) => counts.data?.data.find((c) => c.group === name);
  return (
    <div>
      <PageHeader title="Asset Types" icon={<Boxes />} subtitle="Configuration item types and how many of each you manage" />
      <div className="p-5">
        <SettingsTable<Row>
          title="Configuration item types"
          entityLabel="asset type"
          endpoint="/settings/ci-types"
          canWrite={can('settings.manage')}
          invalidate={[['lookups'], ['report-assets-type']]}
          defaults={{ name: '', category: 'other', description: '', isActive: true, sortOrder: 0 }}
          columns={[
            { header: 'Type', cell: ({ row }) => <Link to={`/assets?ciTypeId=${row.original.id}`} className="font-medium hover:text-primary" onClick={(e) => e.stopPropagation()}>{row.original.name}</Link> },
            { header: 'Category', cell: ({ row }) => CI_CATEGORY.labels[row.original.category as keyof typeof CI_CATEGORY.labels] },
            { header: 'Total', meta: { align: 'right' }, cell: ({ row }) => count(row.original.name)?.total ?? 0 },
            { header: 'Active', meta: { align: 'right' }, cell: ({ row }) => count(row.original.name)?.active ?? 0 },
            { header: 'Action1 managed', meta: { align: 'right' }, cell: ({ row }) => count(row.original.name)?.action1Managed ?? 0 },
            { header: 'Enabled', cell: ({ row }) => (row.original.isActive ? 'Yes' : 'No') },
          ]}
          fields={[
            { name: 'name', label: 'Name', type: 'text', required: true },
            { name: 'category', label: 'Category', type: 'select', options: CI_CATEGORY.values.map((v) => ({ value: v, label: CI_CATEGORY.labels[v] })) },
            { name: 'description', label: 'Description', type: 'textarea', span: 2, rows: 2 },
            { name: 'isActive', label: 'Active', type: 'checkbox' },
            { name: 'sortOrder', label: 'Sort order', type: 'number' },
          ]}
        />
      </div>
    </div>
  );
}
