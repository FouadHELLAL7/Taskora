import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListChecks, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, fmtRelative } from '@/lib/utils';
import { Card, CardBody, CardHeader } from '../ui/misc';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Progress } from '../charts';
import { handleFormError } from '../form';

interface Item {
  id: number;
  text: string;
  isDone: boolean;
  doneAt: string | null;
  doneByName: string | null;
}

/** Ticket checklist card: quick add (one item per line when pasting), tick, remove. */
export function TicketChecklist({ ticketId, canWrite }: { ticketId: number; canWrite: boolean }) {
  const qc = useQueryClient();
  const key = ['checklist', ticketId];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<{ data: Item[] }>(`/tickets/${ticketId}/checklist`) });
  const [text, setText] = useState('');
  const set = (data: { data: Item[] }) => qc.setQueryData(key, data);
  const add = useMutation({
    mutationFn: (items: string[]) => api.post<{ data: Item[] }>(`/tickets/${ticketId}/checklist`, { items }),
    onSuccess: (d) => {
      set(d);
      setText('');
    },
    onError: (e) => handleFormError(e),
  });
  const toggle = useMutation({ mutationFn: (i: Item) => api.patch<{ data: Item[] }>(`/tickets/${ticketId}/checklist/${i.id}`, { isDone: !i.isDone }), onSuccess: set });
  const remove = useMutation({ mutationFn: (i: Item) => api.delete<{ data: Item[] }>(`/tickets/${ticketId}/checklist/${i.id}`), onSuccess: set });
  const items = q.data?.data ?? [];
  const done = items.filter((i) => i.isDone).length;
  if (!items.length && !canWrite) return null;
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-1.5"><ListChecks className="size-4 text-muted" /> Checklist</span>} actions={items.length > 0 && <span className="text-xs text-muted">{done}/{items.length}</span>} />
      <CardBody className="space-y-2">
        {items.length > 0 && <Progress value={(done / items.length) * 100} tone="success" />}
        <ul className="space-y-1">
          {items.map((i) => (
            <li key={i.id} className="group flex items-start gap-2 text-[13px]">
              <input type="checkbox" disabled={!canWrite} checked={i.isDone} onChange={() => toggle.mutate(i)} className="mt-0.5 size-3.5 cursor-pointer accent-[var(--primary)]" />
              <span className={cn('flex-1', i.isDone && 'text-muted line-through')} title={i.isDone && i.doneByName ? `Done by ${i.doneByName} ${fmtRelative(i.doneAt)}` : undefined}>
                {i.text}
              </span>
              {canWrite && (
                <button onClick={() => remove.mutate(i)} className="cursor-pointer text-subtle opacity-0 hover:text-danger group-hover:opacity-100" aria-label="Remove item">
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {canWrite && (
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
              if (lines.length) add.mutate(lines);
            }}
          >
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text');
                if (pasted.includes('\n')) {
                  e.preventDefault();
                  add.mutate(pasted.split('\n').map((l) => l.replace(/^[-*\d.)\s]+/, '').trim()).filter(Boolean));
                }
              }}
              placeholder="Add a step (paste a list to add several)"
              className="h-7"
            />
            <Button size="sm" type="submit" disabled={!text.trim()} loading={add.isPending}>
              Add
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
