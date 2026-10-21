import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, FileUp, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { TICKET_IMPORT_TEMPLATE } from '@taskora/shared';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Checkbox, Textarea } from '@/components/ui/input';
import { Badge, Card, CardBody, CardHeader, Stat } from '@/components/ui/misc';

export type ImportEntity = 'company' | 'contact' | 'ci' | 'ticket';
interface Result {
  dryRun: boolean;
  total: number;
  valid: number;
  creates: number;
  updates: number;
  warnings: number;
  unmappedColumns: string[];
  results: { row: number; ok: boolean; action?: string; label: string; errors?: string[]; warnings?: string[] }[];
}

/** Example ticket CSV built from named cells so columns cannot drift from the template. */
function ticketSample() {
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const row = (o: Partial<Record<(typeof TICKET_IMPORT_TEMPLATE)[number], string>>) => TICKET_IMPORT_TEMPLATE.map((h) => cell(o[h] ?? '')).join(',');
  return [
    TICKET_IMPORT_TEMPLATE.join(','),
    row({
      Ticket: 'T20260115.0042',
      Title: 'Outlook keeps crashing',
      Description: 'Outlook closes a few seconds after opening.',
      Company: 'Northwind Traders',
      Contact: 'Ana Trujillo',
      'Contact email': 'ana@northwind.example',
      Status: 'Complete',
      Priority: 'High',
      Queue: 'Service Desk',
      Type: 'Incident',
      'Hours worked': '0.75',
      Created: '15/01/2026 09:12',
      Resolved: '15/01/2026 11:40',
      Resolution: 'Repaired the Office installation',
      Note: 'Repaired Office and rebuilt the Outlook profile.',
      'Note date': '15/01/2026 11:35',
      Tags: 'email',
    }),
    row({ Ticket: 'T20260115.0042', Note: 'Customer confirmed Outlook is stable.', 'Note date': '16/01/2026 08:05' }),
  ].join('\n');
}

const ENTITIES: Record<ImportEntity, { label: string; columns: string; matching: string; sample: string }> = {
  company: {
    label: 'Companies',
    columns: 'Company Name*, Account Number, Type, Industry, Website, Phone, Email, Address 1, Address 2, City, State, Postal Code, Country, Active, Notes',
    matching: 'Companies are matched by account number or name.',
    sample: 'Company Name,Account Number,Phone,City,Country\nNorthwind Traders,NW-01,+32 2 555 0100,Brussels,Belgium',
  },
  contact: {
    label: 'Contacts',
    columns: 'Company* (name or account number), First Name*, Last Name*, Job Title, Department, Email Address, Phone, Mobile, Active, Primary, Notes',
    matching: 'Contacts are matched by e-mail within the company. Import companies first.',
    sample: 'Company,First Name,Last Name,Email Address,Job Title\nNorthwind Traders,Ana,Trujillo,ana@northwind.example,Owner',
  },
  ci: {
    label: 'Configuration items',
    columns: 'Device Name*, Company*, Type (CI type name), Manufacturer, Model, Serial Number, Asset Tag, Hostname, Operating System, IP Address, MAC Address, Assigned To (contact e-mail), Purchase Date, Install Date, Warranty Expiration, Status, Notes',
    matching: 'CIs are matched by serial number within the company. Import companies first.',
    sample: 'Device Name,Company,Type,Serial Number,Operating System,Assigned To,Warranty Expiration\nNW-LT-01,Northwind Traders,Laptop,SN-123,Windows 11 Pro,ana@northwind.example,2027-12-31',
  },
  ticket: {
    label: 'Tickets',
    columns: `${TICKET_IMPORT_TEMPLATE.map((c) => (c === 'Title' || c === 'Company' ? `${c}*` : c)).join(', ')} (the columns of the ticket export are accepted too; SLA is ignored)`,
    matching:
      'Tickets are matched by ticket number: a known number updates the ticket, an unknown number creates it with that number, an empty number gets a new Taskora number. Repeat a ticket number on several rows to add several notes. Notes already on the ticket are not added twice. Hours worked are logged as non-billable time. Dates: dd/mm/yyyy hh:mm, yyyy-mm-dd hh:mm or mm/dd/yyyy h:mm AM/PM.',
    sample: ticketSample(),
  },
};

/** Reads a file as UTF-8, falling back to Windows-1252 (Excel's default "CSV" encoding). */
async function readText(file: File) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([`﻿${text}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** CSV upload → preview → import, for one entity. Used on the admin page and the ticket list. */
export function ImportPanel({ entity, onImported }: { entity: ImportEntity; onImported?: () => void }) {
  const qc = useQueryClient();
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [createMissing, setCreateMissing] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const run = useMutation({
    mutationFn: (dryRun: boolean) => api.post<Result>('/imports', { entity, csv, dryRun, createMissing }),
    onSuccess: (r) => {
      setResult(r);
      if (!r.dryRun) {
        toast.success(`Imported: ${r.creates} created, ${r.updates} updated`);
        qc.invalidateQueries();
        onImported?.();
      }
    },
    onError: (e) => toast.error(e instanceof ApiError && e.status === 400 ? e.message : 'Import failed'),
  });
  const def = ENTITIES[entity];
  const invalid = result?.results.filter((r) => !r.ok) ?? [];
  const reset = () => setResult(null);
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
      <div className="space-y-4">
        <p className="text-xs text-muted">
          <b>Recognised columns:</b> {def.columns}. {def.matching}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={file}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) {
                setCsv(await readText(f));
                setFileName(f.name);
                reset();
              }
              e.target.value = '';
            }}
          />
          <Button onClick={() => file.current?.click()}>
            <Upload /> Choose CSV file
          </Button>
          <Button variant="ghost" onClick={() => (setCsv(def.sample), setFileName(''), reset())}>
            Insert example
          </Button>
          <Button variant="ghost" onClick={() => download(`taskora-${entity}-import.csv`, def.sample)}>
            <Download /> Download example
          </Button>
          {fileName && <span className="text-xs text-muted">{fileName}</span>}
        </div>
        <Textarea rows={10} value={csv} onChange={(e) => (setCsv(e.target.value), reset())} placeholder="…or paste CSV here (first row = column headers; comma or semicolon separated)" className="font-mono text-[12px]" />
        {entity === 'ticket' && (
          <Checkbox
            label="Create missing companies, contacts, queues, types, issue types and sources"
            checked={createMissing}
            onChange={(e) => (setCreateMissing(e.target.checked), reset())}
          />
        )}
        <div className="flex gap-2">
          <Button disabled={!csv.trim()} loading={run.isPending && run.variables === true} onClick={() => run.mutate(true)}>
            Preview
          </Button>
          <Button variant="primary" disabled={!result || !result.dryRun || invalid.length > 0} loading={run.isPending && run.variables === false} onClick={() => run.mutate(false)}>
            Import {result?.valid ?? ''} rows
          </Button>
        </div>
      </div>
      <div className="space-y-4">
        {result ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Rows" value={result.total} />
              <Stat label="Create" value={result.creates} tone="success" />
              <Stat label="Update" value={result.updates} />
            </div>
            {result.unmappedColumns.length > 0 && <p className="rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">Ignored columns: {result.unmappedColumns.join(', ')}</p>}
            <Card>
              <CardHeader
                title={invalid.length ? `${invalid.length} row(s) need attention` : result.dryRun ? 'All rows are valid' : 'Import completed'}
                description={result.warnings ? `${result.warnings} row(s) with warnings` : undefined}
              />
              <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto">
                {result.results.map((r) => (
                  <li key={r.row} className="px-4 py-1.5 text-[12px]">
                    <span className="mr-2 text-muted">#{r.row}</span>
                    <span className="font-medium">{r.label}</span>{' '}
                    {r.ok ? <Badge tone={r.action === 'create' ? 'success' : 'info'}>{r.action}</Badge> : <Badge tone="danger">invalid</Badge>}
                    {r.errors && <div className="mt-0.5 text-danger">{r.errors.join(' · ')}</div>}
                    {r.warnings && <div className="mt-0.5 text-warning">{r.warnings.join(' · ')}</div>}
                  </li>
                ))}
              </ul>
            </Card>
          </>
        ) : (
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted">Preview the file to check every row before anything is saved. Nothing is imported if a row is invalid.</p>
        )}
      </div>
    </div>
  );
}

export default function ImportPage() {
  const [entity, setEntity] = useState<ImportEntity>('company');
  return (
    <div>
      <PageHeader title="Data Import" icon={<FileUp />} subtitle="Bulk-load companies, contacts, configuration items and tickets from CSV (Excel or Autotask exports). Existing records are matched and updated." />
      <div className="p-5">
        <Card>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap gap-1">
              {(Object.keys(ENTITIES) as ImportEntity[]).map((e) => (
                <button
                  key={e}
                  onClick={() => setEntity(e)}
                  className={cn('cursor-pointer rounded-md px-3 py-1.5 text-[13px]', entity === e ? 'bg-primary-soft font-medium text-primary' : 'text-muted hover:bg-surface-2')}
                >
                  {ENTITIES[e].label}
                </button>
              ))}
            </div>
            <ImportPanel key={entity} entity={entity} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
