import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileUp, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Badge, Card, CardBody, CardHeader, Stat } from '@/components/ui/misc';

type Entity = 'company' | 'contact' | 'ci';
interface Result {
  dryRun: boolean;
  total: number;
  valid: number;
  creates: number;
  updates: number;
  unmappedColumns: string[];
  results: { row: number; ok: boolean; action?: string; label: string; errors?: string[] }[];
}

const ENTITIES: Record<Entity, { label: string; columns: string; sample: string }> = {
  company: {
    label: 'Companies',
    columns: 'Company Name*, Account Number, Type, Industry, Website, Phone, Email, Address 1, Address 2, City, State, Postal Code, Country, Active, Notes',
    sample: 'Company Name,Account Number,Phone,City,Country\nNorthwind Traders,NW-01,+32 2 555 0100,Brussels,Belgium',
  },
  contact: {
    label: 'Contacts',
    columns: 'Company* (name or account number), First Name*, Last Name*, Job Title, Department, Email Address, Phone, Mobile, Active, Primary, Notes',
    sample: 'Company,First Name,Last Name,Email Address,Job Title\nNorthwind Traders,Ana,Trujillo,ana@northwind.example,Owner',
  },
  ci: {
    label: 'Configuration items',
    columns: 'Device Name*, Company*, Type (CI type name), Manufacturer, Model, Serial Number, Asset Tag, Hostname, Operating System, IP Address, MAC Address, Assigned To (contact e-mail), Purchase Date, Install Date, Warranty Expiration, Status, Notes',
    sample: 'Device Name,Company,Type,Serial Number,Operating System,Assigned To,Warranty Expiration\nNW-LT-01,Northwind Traders,Laptop,SN-123,Windows 11 Pro,ana@northwind.example,2027-12-31',
  },
};

export default function ImportPage() {
  const qc = useQueryClient();
  const [entity, setEntity] = useState<Entity>('company');
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const run = useMutation({
    mutationFn: (dryRun: boolean) => api.post<Result>('/imports', { entity, csv, dryRun }),
    onSuccess: (r) => {
      setResult(r);
      if (!r.dryRun) {
        toast.success(`Imported: ${r.creates} created, ${r.updates} updated`);
        qc.invalidateQueries();
      }
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 400) {
        toast.error(e.message);
      } else toast.error('Import failed');
    },
  });
  const def = ENTITIES[entity];
  const invalid = result?.results.filter((r) => !r.ok) ?? [];
  return (
    <div>
      <PageHeader title="Data Import" icon={<FileUp />} subtitle="Bulk-load companies, contacts and configuration items from CSV (Excel or Autotask exports). Existing records are matched and updated." />
      <div className="grid gap-4 p-5 xl:grid-cols-[1fr_420px]">
        <Card>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap gap-1">
              {(Object.keys(ENTITIES) as Entity[]).map((e) => (
                <button
                  key={e}
                  onClick={() => {
                    setEntity(e);
                    setResult(null);
                  }}
                  className={cn('cursor-pointer rounded-md px-3 py-1.5 text-[13px]', entity === e ? 'bg-primary-soft font-medium text-primary' : 'text-muted hover:bg-surface-2')}
                >
                  {ENTITIES[e].label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">
              <b>Recognised columns:</b> {def.columns}. Matching: companies by account number or name, contacts by e-mail within the company, CIs by serial number within the company. Import companies before contacts and CIs.
            </p>
            <div className="flex gap-2">
              <input
                ref={file}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setCsv(await f.text());
                    setResult(null);
                  }
                  e.target.value = '';
                }}
              />
              <Button onClick={() => file.current?.click()}>
                <Upload /> Choose CSV file
              </Button>
              <Button variant="ghost" onClick={() => setCsv(def.sample)}>
                Insert example
              </Button>
            </div>
            <Textarea rows={12} value={csv} onChange={(e) => (setCsv(e.target.value), setResult(null))} placeholder="…or paste CSV here (first row = column headers)" className="font-mono text-[12px]" />
            <div className="flex gap-2">
              <Button disabled={!csv.trim()} loading={run.isPending && run.variables === true} onClick={() => run.mutate(true)}>
                Preview
              </Button>
              <Button variant="primary" disabled={!result || !result.dryRun || invalid.length > 0} loading={run.isPending && run.variables === false} onClick={() => run.mutate(false)}>
                Import {result?.valid ?? ''} rows
              </Button>
            </div>
          </CardBody>
        </Card>
        <div className="space-y-4">
          {result && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Rows" value={result.total} />
                <Stat label="Create" value={result.creates} tone="success" />
                <Stat label="Update" value={result.updates} />
              </div>
              {result.unmappedColumns.length > 0 && <p className="rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">Ignored columns: {result.unmappedColumns.join(', ')}</p>}
              <Card>
                <CardHeader title={invalid.length ? `${invalid.length} row(s) need attention` : result.dryRun ? 'All rows are valid' : 'Import completed'} />
                <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
                  {result.results.map((r) => (
                    <li key={r.row} className="px-4 py-1.5 text-[12px]">
                      <span className="mr-2 text-muted">#{r.row}</span>
                      <span className="font-medium">{r.label}</span>{' '}
                      {r.ok ? <Badge tone={r.action === 'create' ? 'success' : 'info'}>{r.action}</Badge> : <Badge tone="danger">invalid</Badge>}
                      {r.errors && <div className="mt-0.5 text-danger">{r.errors.join(' · ')}</div>}
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
