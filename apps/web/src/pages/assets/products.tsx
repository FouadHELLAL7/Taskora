import { Package } from 'lucide-react';
import { formatMoney } from '@taskora/shared';
import { useAuth } from '@/lib/auth';
import { opts, useLookups } from '@/lib/lookups';
import { PageHeader } from '@/components/page';
import { SettingsTable } from '@/components/admin/settings-table';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = { id: number } & Record<string, any>;

export default function ProductsPage() {
  const { can } = useAuth();
  const lookups = useLookups();
  return (
    <div>
      <PageHeader title="Products" icon={<Package />} subtitle="Hardware and software models you sell and track as configuration items" />
      <div className="p-5">
        <SettingsTable<Row>
          title="Product catalogue"
          entityLabel="product"
          endpoint="/products"
          canWrite={can('cis.write')}
          defaults={{ name: '', sku: '', manufacturer: '', ciTypeId: '', description: '', unitCost: '', unitPrice: '', isActive: true }}
          columns={[
            { header: 'Product', cell: ({ row }) => <div><div className="font-medium">{row.original.name}</div><div className="text-[11px] text-muted">{row.original.sku}</div></div> },
            { header: 'Manufacturer', cell: ({ row }) => row.original.manufacturer ?? '—' },
            { header: 'CI type', cell: ({ row }) => lookups.data?.ciTypes.find((t) => t.id === row.original.ciTypeId)?.name ?? '—' },
            { header: 'Cost', meta: { align: 'right' }, cell: ({ row }) => (row.original.unitCost != null ? formatMoney(row.original.unitCost) : '—') },
            { header: 'Price', meta: { align: 'right' }, cell: ({ row }) => (row.original.unitPrice != null ? formatMoney(row.original.unitPrice) : '—') },
            { header: 'Active', cell: ({ row }) => (row.original.isActive ? 'Yes' : 'No') },
          ]}
          fields={[
            { name: 'name', label: 'Name', type: 'text', required: true, span: 2 },
            { name: 'sku', label: 'SKU', type: 'text', mono: true },
            { name: 'manufacturer', label: 'Manufacturer', type: 'text' },
            { name: 'ciTypeId', label: 'CI type', type: 'select', numeric: true, options: opts(lookups.data?.ciTypes) },
            { name: 'unitCost', label: 'Unit cost', type: 'number', step: 0.01 },
            { name: 'unitPrice', label: 'Unit price', type: 'number', step: 0.01 },
            { name: 'description', label: 'Description', type: 'textarea', span: 2, rows: 2 },
            { name: 'isActive', label: 'Active', type: 'checkbox' },
          ]}
        />
      </div>
    </div>
  );
}
