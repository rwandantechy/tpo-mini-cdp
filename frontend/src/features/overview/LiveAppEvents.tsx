import { useEffect, useState } from 'react';

import { ActivityIcon } from '../../components/icons.tsx';
import { Card, Notice } from '../../components/ui.tsx';
import { api, ApiError } from '../../lib/api.ts';

interface LiveAppEvent {
  eventId: string;
  event: string;
  deviceId: string;
  receivedAt: string;
  subscriber: string;
}

export function LiveAppEvents() {
  const [events, setEvents] = useState<LiveAppEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let pending = false;

    const refresh = async () => {
      if (pending) return;
      pending = true;

      try {
        const rows = await api.get<LiveAppEvent[]>('/api/app-events?limit=50');
        if (active) {
          setEvents(rows);
          setError(null);
        }
      } catch (caught) {
        if (active) {
          setError(caught instanceof ApiError ? caught.message : 'Could not load app events.');
        }
      } finally {
        pending = false;
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

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
            {events.map((event) => (
              <tr key={event.eventId}>
                <td className="px-5 py-3">{event.event}</td>
                <td className="px-5 py-3">{event.deviceId}</td>
                <td className="px-5 py-3">{event.subscriber}</td>
              </tr>
            ))}
            {events.length === 0 ? (
              <tr><td colSpan={3} className="px-5 py-4 text-ink-soft">No app events received yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
