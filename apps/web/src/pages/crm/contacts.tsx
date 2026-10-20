import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Contact, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useTableState } from '@/hooks/use-table-state';
import { DataTable, type Column } from '@/components/data-table';
import { FilterSelect, ListLayout, PageHeader, SearchInput } from '@/components/page';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { EntityPicker } from '@/components/entity-picker';
import { ContactFormDialog } from '@/components/forms/contact-form';
import { contactColumns } from './company-detail';

import type { ContactRow } from './company-detail';

type Row = ContactRow & { companyId: number; companyName: string };

const columns: Column<Row>[] = [
  contactColumns[0] as Column<Row>,
  {
    header: 'Company',
    meta: { sortKey: 'company' },
    cell: ({ row }) => (
      <Link to={`/companies/${row.original.companyId}`} onClick={(e) => e.stopPropagation()} className="hover:text-primary">
        {row.original.companyName}
      </Link>
    ),
  },
  ...(contactColumns.slice(1) as Column<Row>[]),
];

export default function ContactsPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const t = useTableState({ filters: { active: 'true' } });
  const [creating, setCreating] = useState(false);
  const list = useQuery({ queryKey: ['contacts', t.query], queryFn: () => api.get<Paginated<Row>>('/contacts', t.query), placeholderData: keepPreviousData });
  return (
    <ListLayout
      header={
        <PageHeader
          title="Contacts"
          icon={<Contact />}
          subtitle="People at your customer companies"
          actions={
            can('companies.write') && (
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus /> New contact
              </Button>
            )
          }
        />
      }
      toolbar={
        <>
          <SearchInput value={t.q} onChange={t.setQ} placeholder="Search name, e-mail, phone, company…" className="w-72" />
          <div className="w-56">
            <EntityPicker kind="company" value={t.filters.companyId ? Number(t.filters.companyId) : null} onChange={(id) => t.setFilter('companyId', id)} placeholder="Any company" />
          </div>
          <FilterSelect
            value={t.filters.active}
            onChange={(v) => t.setFilter('active', v || 'all')}
            placeholder="Any status"
            options={[
              { value: 'true', label: 'Active' },
              { value: 'false', label: 'Inactive' },
            ]}
          />
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
        onRowClick={(r) => navigate(`/contacts/${r.id}`)}
        empty={<EmptyState icon={<Contact />} title="No contacts found" />}
      />
      <ContactFormDialog open={creating} onOpenChange={setCreating} companyId={t.filters.companyId ? Number(t.filters.companyId) : undefined} onSaved={(c) => navigate(`/contacts/${c.id}`)} />
    </ListLayout>
  );
}
