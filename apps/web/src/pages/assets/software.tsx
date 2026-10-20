import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Layers } from 'lucide-react';
import { api, type Paginated } from '@/lib/api';
import { useTableState } from '@/hooks/use-table-state';
import { DataTable, type Column } from '@/components/data-table';
import { ListLayout, PageHeader, SearchInput } from '@/components/page';
import { Badge, EmptyState } from '@/components/ui/misc';

interface Row {
  name: string;
  publisher: string | null;
  versions: string[];
  installs: number;
  companies: number;
}

const cols: Column<Row>[] = [
  { header: 'Software', cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
  { header: 'Publisher', cell: ({ row }) => row.original.publisher ?? '—' },
  {
    header: 'Versions',
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.versions.slice(0, 6).map((v) => (
          <Badge key={v}>{v}</Badge>
        ))}
        {row.original.versions.length > 6 && <span className="text-xs text-muted">+{row.original.versions.length - 6}</span>}
      </div>
    ),
  },
  { header: 'Installs', meta: { align: 'right' }, cell: ({ row }) => row.original.installs },
  { header: 'Companies', meta: { align: 'right' }, cell: ({ row }) => row.original.companies },
];

export default function SoftwarePage() {
  const t = useTableState();
  const list = useQuery({ queryKey: ['software', t.query], queryFn: () => api.get<Paginated<Row>>('/software', t.query), placeholderData: keepPreviousData });
  return (
    <ListLayout header={<PageHeader title="Software" icon={<Layers />} subtitle="Installed software across configuration items" />} toolbar={<SearchInput value={t.q} onChange={t.setQ} placeholder="Search software or publisher…" />}>
      <DataTable
        className="h-full"
        columns={cols}
        data={list.data?.data}
        total={list.data?.total}
        page={t.page}
        pageSize={t.pageSize}
        loading={list.isLoading}
        onPageChange={t.setPage}
        getRowId={(r) => r.name}
        empty={<EmptyState icon={<Layers />} title="No software recorded" description="Add software on configuration items." />}
      />
    </ListLayout>
  );
}
