import { useEffect, useState } from 'react';

import { ActivityIcon } from '../../components/icons.tsx';
import { Button, Card, Notice } from '../../components/ui.tsx';
import { api, ApiError } from '../../lib/api.ts';

interface LiveAppEvent {
  eventId: string;
  event: string;
  deviceId: string;
  receivedAt: string;
  subscriber: string;
}

interface LiveAppEventPage {
  events: LiveAppEvent[];
  total: number;
}

const PAGE_SIZE = 5;

export function LiveAppEvents({ compact = false, onViewAll }: { compact?: boolean; onViewAll?: () => void }) {
  const [events, setEvents] = useState<LiveAppEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let pending = false;

    const refresh = async () => {
      if (pending) return;
      pending = true;

      try {
        const page = await api.get<LiveAppEventPage>(`/api/app-events?limit=${PAGE_SIZE}&offset=${compact ? 0 : offset}`);
        if (active) {
          setEvents(page.events);
          setTotal(page.total);
          setError(null);
        }
      } catch (caught) {
        if (active) {
          setError(caught instanceof ApiError ? caught.message : 'Could not load app events.');
        }
      } finally {
        pending = false;
        if (active) setLoading(false);
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [compact, offset]);

  const firstVisible = total === 0 ? 0 : offset + 1;
  const lastVisible = Math.min(offset + events.length, total);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <span className="text-coral-deep"><ActivityIcon /></span>
          Live App Events
        </h2>
        <span className="flex items-center gap-2 text-sm text-emerald-600">
          <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
          Auto-refresh · 5s
        </span>
      </div>

      {error ? <div className="p-4"><Notice tone="error">{error}</Notice></div> : null}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-left text-ink-soft">
            <tr>
              <th className="px-5 py-2">Event</th>
              <th className="px-5 py-2">Device</th>
              <th className="px-5 py-2">Subscriber</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {events.map((event) => <EventRow key={event.eventId} event={event} />)}
            {events.length === 0 ? (
              <tr><td colSpan={3} className="px-5 py-4 text-ink-soft">{loading ? 'Loading app events…' : 'No app events received yet.'}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {compact && onViewAll ? (
        <div className="border-t border-line px-5 py-3">
          <Button variant="quiet" onClick={onViewAll}>View all events</Button>
        </div>
      ) : null}

      {!compact && total > 0 ? (
        <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2">
          <span className="text-sm text-ink-soft">Showing {firstVisible}–{lastVisible} of {total}</span>
          <div className="flex gap-2">
            <Button variant="quiet" className="px-3 py-1.5" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
              Previous
            </Button>
            <Button variant="quiet" className="px-3 py-1.5" disabled={offset + PAGE_SIZE >= total || loading} onClick={() => setOffset(offset + PAGE_SIZE)}>
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function EventRow({ event }: { event: LiveAppEvent }) {
  return (
    <tr>
      <td className="px-5 py-3">{event.event}</td>
      <td className="px-5 py-3">{event.deviceId}</td>
      <td className="px-5 py-3">{event.subscriber}</td>
    </tr>
  );
}
