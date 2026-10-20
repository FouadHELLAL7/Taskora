import { useMemo, type ReactNode } from 'react';
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type RowSelectionState } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { EmptyState, Skeleton } from './ui/misc';

export type Column<T> = ColumnDef<T, unknown> & { meta?: { className?: string; sortKey?: string; align?: 'right' | 'center' } };

export interface Sort {
  sort?: string;
  order: 'asc' | 'desc';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[] | undefined;
  total?: number;
  page?: number;
  pageSize?: number;
  loading?: boolean;
  sort?: Sort;
  onSortChange?: (s: Sort) => void;
  onPageChange?: (page: number) => void;
  onRowClick?: (row: T, e: React.MouseEvent) => void;
  rowHref?: (row: T) => string;
  selectable?: boolean;
  selection?: RowSelectionState;
  onSelectionChange?: (s: RowSelectionState) => void;
  getRowId?: (row: T) => string;
  empty?: ReactNode;
  className?: string;
  dense?: boolean;
  rowClassName?: (row: T) => string | undefined;
}

/**
 * Compact server-driven table: sorting and pagination are delegated to the
 * caller (which passes them to the API); rows can link to record pages.
 */
export function DataTable<T>({
  columns,
  data,
  total = 0,
  page = 1,
  pageSize = 50,
  loading,
  sort,
  onSortChange,
  onPageChange,
  onRowClick,
  selectable,
  selection,
  onSelectionChange,
  getRowId,
  empty,
  className,
  dense = true,
  rowClassName,
}: DataTableProps<T>) {
  const cols = useMemo<Column<T>[]>(() => {
    if (!selectable) return columns;
    return [
      {
        id: '__select',
        header: ({ table }) => (
          <input
            type="checkbox"
            aria-label="Select all"
            className="size-3.5 cursor-pointer accent-[var(--primary)]"
            checked={table.getIsAllRowsSelected()}
            ref={(el) => {
              if (el) el.indeterminate = table.getIsSomeRowsSelected();
            }}
            onChange={table.getToggleAllRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            aria-label="Select row"
            className="size-3.5 cursor-pointer accent-[var(--primary)]"
            checked={row.getIsSelected()}
            onClick={(e) => e.stopPropagation()}
            onChange={row.getToggleSelectedHandler()}
          />
        ),
        meta: { className: 'w-8' },
      },
      ...columns,
    ];
  }, [columns, selectable]);

  const table = useReactTable({
    data: data ?? [],
    columns: cols,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    enableRowSelection: selectable,
    state: { rowSelection: selection ?? {} },
    onRowSelectionChange: (updater) => {
      const next = typeof updater === 'function' ? updater(selection ?? {}) : updater;
      onSelectionChange?.(next);
    },
    getRowId: getRowId ? (r) => getRowId(r) : undefined,
  });

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="min-h-0 flex-1 overflow-auto scrollbar-thin">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const meta = (h.column.columnDef as Column<T>).meta;
                  const sortKey = meta?.sortKey;
                  const active = sortKey && sort?.sort === sortKey;
                  return (
                    <th
                      key={h.id}
                      className={cn(
                        'whitespace-nowrap border-b border-border bg-surface-2 px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted',
                        meta?.align === 'right' && 'text-right',
                        meta?.className,
                      )}
                    >
                      {sortKey && onSortChange ? (
                        <button
                          className="inline-flex cursor-pointer items-center gap-1 uppercase hover:text-foreground"
                          onClick={() => onSortChange({ sort: sortKey, order: active && sort?.order === 'asc' ? 'desc' : 'asc' })}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {active ? sort?.order === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ChevronsUpDown className="size-3 opacity-40" />}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading && !data?.length
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {cols.map((_c, j) => (
                      <td key={j} className="border-b border-border px-3 py-2">
                        <Skeleton className="h-3.5 w-full max-w-40" />
                      </td>
                    ))}
                  </tr>
                ))
              : table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={onRowClick ? (e) => onRowClick(row.original, e) : undefined}
                    className={cn(
                      'group bg-surface transition-colors',
                      onRowClick && 'cursor-pointer hover:bg-surface-2',
                      row.getIsSelected() && 'bg-primary-soft/60',
                      rowClassName?.(row.original),
                    )}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = (cell.column.columnDef as Column<T>).meta;
                      return (
                        <td
                          key={cell.id}
                          className={cn('border-b border-border px-3 align-middle', dense ? 'py-1.5' : 'py-2.5', meta?.align === 'right' && 'text-right tabular-nums', meta?.className)}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                ))}
          </tbody>
        </table>
        {!loading && data && data.length === 0 && (empty ?? <EmptyState title="No records found" description="Try adjusting the filters." />)}
      </div>
      {onPageChange && total > 0 && (
        <div className="flex shrink-0 items-center justify-between border-t border-border bg-surface px-3 py-1.5 text-xs text-muted">
          <span className="tabular-nums">
            {from}–{to} of {total}
          </span>
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="ghost" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
              <ChevronLeft />
            </Button>
            <span className="tabular-nums">
              {page} / {pages}
            </span>
            <Button size="icon-sm" variant="ghost" disabled={page >= pages} onClick={() => onPageChange(page + 1)} aria-label="Next page">
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
