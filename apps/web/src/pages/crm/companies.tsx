import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Building2, Plus } from 'lucide-react';
import { COMPANY_TYPE } from '@taskora/shared';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLookups, userOpts } from '@/lib/lookups';
import { useTableState } from '@/hooks/use-table-state';
import { DataTable, type Column } from '@/components/data-table';
import { FilterSelect, ListLayout, PageHeader, SearchInput } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState } from '@/components/ui/misc';
import { CompanyFormDialog } from '@/components/forms/company-form';
import { CompanyLogo } from '@/components/logo';

interface CompanyRow {
  id: number;
  name: string;
  accountNumber: string | null;
  type: string;
  isActive: boolean;
  phone: string | null;
  city: string | null;
  country: string | null;
  industry: string | null;
  accountManagerName: string | null;
  openTickets: number;
  ciCount: number;
  contactCount: number;
  logoUpdatedAt: string | null;
}

const columns: Column<CompanyRow>[] = [
  {
    header: 'Company',
    meta: { sortKey: 'name' },
    cell: ({ row }) => (
      <div className="flex min-w-0 items-center gap-2">
        <CompanyLogo companyId={row.original.id} name={row.original.name} logoUpdatedAt={row.original.logoUpdatedAt} />
        <Link to={`/companies/${row.original.id}`} className="font-medium hover:text-primary" onClick={(e) => e.stopPropagation()}>
          {row.original.name}
        </Link>
        {row.original.accountNumber && <span className="text-xs text-muted">{row.original.accountNumber}</span>}
      </div>
    ),
  },
  { header: 'Type', meta: { sortKey: 'type' }, cell: ({ row }) => <Badge>{COMPANY_TYPE.labels[row.original.type as keyof typeof COMPANY_TYPE.labels] ?? row.original.type}</Badge> },
  { header: 'Industry', cell: ({ row }) => <span className="text-muted">{row.original.industry ?? '—'}</span> },
  { header: 'City', meta: { sortKey: 'city' }, cell: ({ row }) => [row.original.city, row.original.country].filter(Boolean).join(', ') || '—' },
  { header: 'Phone', cell: ({ row }) => row.original.phone ?? '—' },
  { header: 'Account manager', cell: ({ row }) => row.original.accountManagerName ?? '—' },
  { header: 'Contacts', meta: { align: 'right' }, cell: ({ row }) => row.original.contactCount },
  { header: 'Active CIs', meta: { align: 'right', sortKey: 'ciCount' }, cell: ({ row }) => row.original.ciCount },
  {
    header: 'Open tickets',
    meta: { align: 'right', sortKey: 'openTickets' },
    cell: ({ row }) => <span className={row.original.openTickets ? 'font-semibold' : 'text-muted'}>{row.original.openTickets}</span>,
  },
  { header: 'Status', cell: ({ row }) => (row.original.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>) },
];

export default function CompaniesPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const lookups = useLookups();
  const t = useTableState({ sort: 'name', order: 'asc', filters: { active: 'true' } });
  const [creating, setCreating] = useState(false);
  const list = useQuery({
    queryKey: ['companies', t.query],
    queryFn: () => api.get<Paginated<CompanyRow>>('/companies', t.query),
    placeholderData: keepPreviousData,
  });

  return (
    <ListLayout
      header={
        <PageHeader
          title="Companies"
          subtitle="Customers, prospects, vendors and partners"
          icon={<Building2 />}
          actions={
            can('companies.write') && (
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus /> New company
              </Button>
            )
          }
        />
      }
      toolbar={
        <>
          <SearchInput value={t.q} onChange={t.setQ} placeholder="Search name, account #, phone, city…" />
          <FilterSelect value={t.filters.type} onChange={(v) => t.setFilter('type', v)} placeholder="All types" options={COMPANY_TYPE.values.map((v) => ({ value: v, label: COMPANY_TYPE.labels[v] }))} />
          <FilterSelect
            value={t.filters.active}
            onChange={(v) => t.setFilter('active', v || 'all')}
            placeholder="Any status"
            options={[
              { value: 'true', label: 'Active' },
              { value: 'false', label: 'Inactive' },
            ]}
          />
          <FilterSelect value={t.filters.accountManagerId} onChange={(v) => t.setFilter('accountManagerId', v)} placeholder="Any account manager" options={userOpts(lookups.data?.users, null, false)} />
        </>
      }
    >
      <DataTable
        className="h-full"
        columns={columns}
        data={list.data?.data}
        total={list.data?.total}
        page={t.page}
        pageSize={t.pageSize}
        loading={list.isLoading}
        sort={t.sortState}
        onSortChange={t.setSort}
        onPageChange={t.setPage}
        onRowClick={(r) => navigate(`/companies/${r.id}`)}
        empty={<EmptyState icon={<Building2 />} title="No companies found" description="Create your first customer company to start logging tickets." />}
      />
      <CompanyFormDialog open={creating} onOpenChange={setCreating} onSaved={(c) => navigate(`/companies/${c.id}`)} />
    </ListLayout>
  );
}
