import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FileText, Plus } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { INVOICE_STATUS } from '@taskora/shared';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate } from '@/lib/utils';
import { useTableState } from '@/hooks/use-table-state';
import { DataTable, type Column } from '@/components/data-table';
import { FilterSelect, ListLayout, PageHeader, SearchInput } from '@/components/page';
import { EntityPicker } from '@/components/entity-picker';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { InvoiceStatusBadge, enumOpts, useMoney } from '@/components/business/common';
import { InvoiceDraftDialog } from '@/components/business/billing-dialogs';

interface InvoiceRow {
  id: number;
  invoiceNumber: string;
  companyId: number;
  companyName: string;
  status: string;
  issueDate: string | null;
  dueDate: string | null;
  periodStart: string;
  periodEnd: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  currency: string;
  createdAt: string;
}

export default function InvoicesPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const money = useMoney();
  const t = useTableState();
  const [creating, setCreating] = useState(false);
  const list = useQuery({
    queryKey: ['invoices', t.query],
    queryFn: () => api.get<Paginated<InvoiceRow>>('/invoices', t.query),
    placeholderData: keepPreviousData,
  });
  const today = format(new Date(), 'yyyy-MM-dd');
  const rows = list.data?.data ?? [];
  const pageTotal = rows.filter((r) => r.status !== 'void').reduce((a, r) => a + r.total, 0);
  const outstanding = rows.filter((r) => r.status === 'issued').reduce((a, r) => a + r.total, 0);
  const currency = rows[0]?.currency;

  const columns: Column<InvoiceRow>[] = [
    {
      header: 'Invoice',
      cell: ({ row }) => (
        <Link to={`/invoices/${row.original.id}`} className="font-medium hover:text-primary" onClick={(e) => e.stopPropagation()}>
          {row.original.invoiceNumber}
        </Link>
      ),
    },
    {
      header: 'Company',
      cell: ({ row }) => (
        <Link to={`/companies/${row.original.companyId}`} className="hover:text-primary" onClick={(e) => e.stopPropagation()}>
          {row.original.companyName}
        </Link>
      ),
    },
    { header: 'Status', cell: ({ row }) => <InvoiceStatusBadge status={row.original.status} /> },
    {
      header: 'Period',
      meta: { className: 'whitespace-nowrap' },
      cell: ({ row }) => (
        <span className="text-muted">
          {fmtDate(row.original.periodStart)} – {fmtDate(row.original.periodEnd)}
        </span>
      ),
    },
    { header: 'Issued', meta: { className: 'whitespace-nowrap' }, cell: ({ row }) => fmtDate(row.original.issueDate) },
    {
      header: 'Due',
      meta: { className: 'whitespace-nowrap' },
      cell: ({ row }) => {
        const overdue = row.original.status === 'issued' && row.original.dueDate && row.original.dueDate < today;
        return <span className={overdue ? 'font-medium text-danger' : undefined}>{fmtDate(row.original.dueDate)}{overdue && ' · overdue'}</span>;
      },
    },
    { header: 'Subtotal', meta: { align: 'right' }, cell: ({ row }) => <span className="text-muted">{money(row.original.subtotal, row.original.currency)}</span> },
    { header: 'Tax', meta: { align: 'right' }, cell: ({ row }) => <span className="text-muted">{money(row.original.taxAmount, row.original.currency)}</span> },
    {
      header: 'Total',
      meta: { align: 'right' },
      cell: ({ row }) => <span className={row.original.status === 'void' ? 'text-subtle line-through' : 'font-semibold'}>{money(row.original.total, row.original.currency)}</span>,
    },
  ];

  return (
    <ListLayout
      header={
        <PageHeader
          title="Invoices"
          subtitle="Draft, issued and paid customer invoices"
          icon={<FileText />}
          actions={
            can('billing.write') && (
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus /> New invoice draft
              </Button>
            )
          }
        />
      }
      toolbar={
        <>
          <SearchInput value={t.q} onChange={t.setQ} placeholder="Search invoice # or company…" />
          <FilterSelect value={t.filters.status} onChange={(v) => t.setFilter('status', v)} placeholder="Any status" options={enumOpts(INVOICE_STATUS)} />
          <div className="w-56">
            <EntityPicker kind="company" value={t.filters.companyId ? Number(t.filters.companyId) : null} onChange={(id) => t.setFilter('companyId', id)} placeholder="All companies" />
          </div>
          {rows.length > 0 && (
            <div className="ml-auto flex gap-4 text-xs text-muted">
              <span>
                Page total <b className="text-foreground tabular-nums">{money(pageTotal, currency)}</b>
              </span>
              <span>
                Outstanding <b className="text-foreground tabular-nums">{money(outstanding, currency)}</b>
              </span>
            </div>
          )}
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
        onPageChange={t.setPage}
        onRowClick={(r) => navigate(`/invoices/${r.id}`)}
        empty={<EmptyState icon={<FileText />} title="No invoices" description="Create invoice drafts from the billing review." action={<Button onClick={() => navigate('/billing')}>Open billing review</Button>} />}
      />
      <InvoiceDraftDialog
        open={creating}
        onOpenChange={setCreating}
        periodStart={format(startOfMonth(new Date()), 'yyyy-MM-dd')}
        periodEnd={format(endOfMonth(new Date()), 'yyyy-MM-dd')}
        onCreated={(inv) => navigate(`/invoices/${inv.id}`)}
      />
    </ListLayout>
  );
}
