import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addDays, format, isSameDay, startOfWeek } from 'date-fns';
import { CalendarRange, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, fmtTime } from '@/lib/utils';
import { PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Avatar, Card } from '@/components/ui/misc';
import { ServiceCallDialog, SERVICE_CALL_TONE, type ServiceCall, type ServiceCallDefaults } from '@/components/workspace/service-call-dialog';

interface Resource {
  id: number;
  firstName: string;
  lastName: string;
  title: string | null;
  openTickets: number;
  minutesThisWeek: number;
}

const toneClass: Record<string, string> = {
  info: 'border-info/40 bg-info-soft text-info',
  primary: 'border-primary/40 bg-primary-soft text-primary',
  success: 'border-success/40 bg-success-soft text-success',
  neutral: 'border-border bg-surface-2 text-muted',
  warning: 'border-warning/40 bg-warning-soft text-warning',
  danger: 'border-danger/40 bg-danger-soft text-danger',
};

/** Dispatch board: technicians × days with scheduled service calls. */
export default function DispatchPage() {
  const { can } = useAuth();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const [dialog, setDialog] = useState<{ call?: ServiceCall; defaults?: ServiceCallDefaults } | null>(null);
  const resources = useQuery({ queryKey: ['resources'], queryFn: () => api.get<{ data: Resource[] }>('/resources') });
  const calls = useQuery({
    queryKey: ['service-calls', 'dispatch', weekStart.toISOString()],
    queryFn: () => api.get<{ data: ServiceCall[] }>('/service-calls', { from: weekStart.toISOString(), to: addDays(weekStart, 7).toISOString() }),
  });
  const callsFor = (userId: number, day: Date) => (calls.data?.data ?? []).filter((c) => c.users.some((u) => u.id === userId) && isSameDay(new Date(c.startAt), day));
  const unassigned = (day: Date) => (calls.data?.data ?? []).filter((c) => c.users.length === 0 && isSameDay(new Date(c.startAt), day));
  const newAt = (day: Date, userId?: number) => {
    const start = new Date(day);
    start.setHours(9, 0, 0, 0);
    setDialog({ defaults: { startAt: start, endAt: new Date(start.getTime() + 2 * 3600_000), userIds: userId ? [userId] : [] } });
  };
  const rows: { id: number | null; name: string; sub: string }[] = [
    ...(resources.data?.data ?? []).map((r) => ({ id: r.id, name: `${r.firstName} ${r.lastName}`, sub: `${r.openTickets} open tickets · ${(r.minutesThisWeek / 60).toFixed(1)} h this week` })),
    { id: null, name: 'Unassigned', sub: 'Service calls without a technician' },
  ];

  return (
    <div>
      <PageHeader
        title="Dispatch"
        icon={<CalendarRange />}
        subtitle="Plan on-site and remote appointments across the team"
        actions={
          <>
            <Button size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">
              <ChevronLeft />
            </Button>
            <Button onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>This week</Button>
            <Button size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">
              <ChevronRight />
            </Button>
            <span className="text-[13px] font-medium">
              {format(weekStart, 'dd MMM')} – {format(addDays(weekStart, 6), 'dd MMM yyyy')}
            </span>
            {can('tickets.write') && (
              <Button variant="primary" onClick={() => newAt(new Date())}>
                <Plus /> Service call
              </Button>
            )}
          </>
        }
      />
      <div className="p-5">
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[1000px] table-fixed border-separate border-spacing-0 text-[12px]">
            <thead>
              <tr>
                <th className="w-56 border-b border-r border-border bg-surface-2 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">Technician</th>
                {days.map((d) => (
                  <th key={d.toISOString()} className={cn('border-b border-border bg-surface-2 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted', isSameDay(d, new Date()) && 'text-primary')}>
                    {format(d, 'EEE dd')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id ?? 'none'}>
                  <td className="border-b border-r border-border px-3 py-2 align-top">
                    <div className="flex items-center gap-2">
                      {r.id ? <Avatar name={r.name} /> : <span className="size-6" />}
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium">{r.name}</div>
                        <div className="truncate text-[11px] text-muted">{r.sub}</div>
                      </div>
                    </div>
                  </td>
                  {days.map((d) => {
                    const items = r.id ? callsFor(r.id, d) : unassigned(d);
                    const weekend = d.getDay() === 0 || d.getDay() === 6;
                    return (
                      <td
                        key={d.toISOString()}
                        className={cn('group h-20 border-b border-border p-1 align-top', weekend && 'bg-surface-2/50', can('tickets.write') && 'cursor-pointer hover:bg-primary-soft/30')}
                        onClick={() => can('tickets.write') && newAt(d, r.id ?? undefined)}
                      >
                        <div className="space-y-1">
                          {items.map((c) => (
                            <button
                              key={c.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDialog({ call: c });
                              }}
                              className={cn('block w-full cursor-pointer truncate rounded border px-1.5 py-1 text-left', toneClass[SERVICE_CALL_TONE[c.status] ?? 'info'])}
                              title={`${c.title} — ${c.companyName}`}
                            >
                              <span className="font-semibold">{fmtTime(c.startAt)}</span> {c.title}
                              <span className="block truncate text-[10px] opacity-80">{c.companyName}</span>
                            </button>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      {dialog && <ServiceCallDialog open onOpenChange={(o) => !o && setDialog(null)} call={dialog.call ?? null} defaults={dialog.defaults} onSaved={() => setDialog(null)} />}
    </div>
  );
}
