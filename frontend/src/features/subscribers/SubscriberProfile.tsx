import { useCallback, useEffect, useState } from 'react';

import { Badge, Button, Notice, Spinner } from '../../components/ui.tsx';
import { api, ApiError } from '../../lib/api.ts';
import { formatDate, formatWhen } from '../../lib/format.ts';
import type { PersonRecord } from './types.ts';

export function SubscriberRecord({ id, onClose }: { id: string; onClose: () => void }) {
  const [profile, setProfile] = useState<PersonRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setProfile(await api.get<PersonRecord>(`/api/subscribers/${id}`));
    } catch (caught) {
      setProfile(null);
      setError(caught instanceof ApiError ? caught.message : 'Could not load that person.');
    }
  }, [id]);

  useEffect(() => {
    setProfile(null);
    void load();
  }, [id, load]);

  if (error) {
    return (
      <div className="space-y-3 p-4 sm:p-6">
        <button type="button" className="text-sm text-ink-soft lg:hidden" onClick={onClose}>
          Back
        </button>
        <Notice tone="error">{error}</Notice>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-4 sm:p-6">
        <Spinner label="Loading record…" />
      </div>
    );
  }

  const { subscriber, website, app } = profile;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <header className="shrink-0 border-b border-line px-4 py-3 sm:px-6">
        <button type="button" className="mb-2 text-sm text-ink-soft lg:hidden" onClick={onClose}>
          Back
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-ink">{subscriber.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={subscriber.status === 'active' ? 'ok' : 'muted'}>{subscriber.status}</Badge>
              <span className="text-sm text-ink-soft">{subscriber.acquisitionSource ?? 'Unknown source'}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="quiet" onClick={() => void load()}>
              Refresh
            </Button>
            <Button variant="quiet" className="hidden lg:inline-flex" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <dl className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-4">
          <Fact label="Signed up" value={formatDate(subscriber.signupDate)} />
          <Fact label="Last open" value={formatDate(subscriber.lastOpenDate)} />
          <Fact label="Site visitors" value={website.visitors.toLocaleString()} />
          <Fact label="App" value={app.accounts.length ? app.accounts.map((account) => account.userId).join(', ') : '—'} />
        </dl>

        <Activity
          title="Website"
          empty="No identified visits."
          rows={website.pageviews.map((visit) => ({
            when: formatWhen(visit.occurredAt),
            primary: visit.page,
            secondary: visit.channel ?? visit.utmSource ?? 'Direct',
          }))}
        />

        <Activity
          title="App"
          empty="No mobile events yet."
          rows={app.events.map((event) => ({
            when: formatWhen(event.occurredAt),
            primary: event.event.replaceAll('_', ' '),
            secondary: event.deviceId,
          }))}
        />
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-4 py-3 sm:px-6">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="mt-1 break-all text-sm text-ink">{value}</dd>
    </div>
  );
}

function Activity({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: Array<{ when: string; primary: string; secondary: string }>;
}) {
  return (
    <section className="border-b border-line">
      <h2 className="border-b border-line px-4 py-3 text-sm font-medium text-ink sm:px-6">{title}</h2>
      {rows.length === 0 ? (
        <p className="px-4 py-5 text-sm text-ink-soft sm:px-6">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li key={`${row.when}-${row.primary}-${row.secondary}`} className="px-4 py-3 sm:px-6">
              <p className="text-sm text-ink">{row.primary}</p>
              <p className="mt-0.5 text-sm text-ink-soft">
                {row.when}
                {' · '}
                {row.secondary}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
