import { useEffect, useState } from 'react';

import { Card, CardHeader, Notice, PageHeader, Spinner, Stat } from '../../components/ui.tsx';
import { api, ApiError } from '../../lib/api.ts';
import { formatDate } from '../../lib/format.ts';

interface ImportRun {
  source: string;
  status: string;
  rowsRead: number;
  rowsInserted: number;
  rowsMerged: number;
  rowsSkipped: number;
  skipReasons: Record<string, number>;
  warnings: Record<string, number>;
  finishedAt: string | null;
}

interface Overview {
  referenceDate: string;
  coldWindowDays: number;
  subscribers: { total: number; active: number; unsubscribed: number; neverOpened: number; coldSinceCutoff: number };
  app: { accounts: number; linkedToSubscriber: number; withoutSubscriber: number; events: number };
  web: { visitors: number; identified: number; anonymous: number; pageviews: number };
  lastImports: ImportRun[];
}

function tally(counts: Record<string, number>): string {
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([reason, count]) => `${count.toLocaleString()} ${reason.replace(/_/g, ' ')}`)
    .join(', ');
}

export function Dashboard() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Overview>('/api/overview')
      .then(setOverview)
      .catch((caught: unknown) =>
        setError(caught instanceof ApiError ? caught.message : 'Could not load the overview.'),
      );
  }, []);

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!overview) return <Spinner label="Loading…" />;

  const { subscribers, app, web } = overview;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader title="Overview" description={`Figures as of ${formatDate(overview.referenceDate)}.`} />

      <section>
        <h2 className="text-sm font-medium text-ink-soft">Subscribers</h2>
        <Card className="mt-2">
          <dl className="grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <Stat label="Total" value={subscribers.total} note="after deduplicating by email" />
            <Stat label="Active" value={subscribers.active} note={`${subscribers.unsubscribed.toLocaleString()} unsubscribed`} />
            <Stat
              label={`No open in ${overview.coldWindowDays} days`}
              value={subscribers.coldSinceCutoff}
              note={`${subscribers.neverOpened.toLocaleString()} have never opened`}
            />
          </dl>
        </Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="text-sm font-medium text-ink-soft">Website</h2>
          <Card className="mt-2">
            <dl className="grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <Stat label="Pageviews" value={web.pageviews} />
              <Stat label="Identified" value={web.identified} note="matched to a subscriber" />
              <Stat label="Anonymous" value={web.anonymous} note="no email yet" />
            </dl>
          </Card>
        </section>

        <section>
          <h2 className="text-sm font-medium text-ink-soft">App</h2>
          <Card className="mt-2">
            <dl className="grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <Stat label="Accounts" value={app.accounts} note={`${app.events.toLocaleString()} events`} />
              <Stat label="Matched" value={app.linkedToSubscriber} note="linked to a subscriber" />
              <Stat label="Unmatched" value={app.withoutSubscriber} note="kept their own profile" />
            </dl>
          </Card>
        </section>
      </div>

      <section>
        <h2 className="text-sm font-medium text-ink-soft">Last import</h2>
        <Card className="mt-2 overflow-hidden">
          <CardHeader
            title="What came in"
            hint="Rows we could not use are listed with the reason, rather than dropped quietly."
          />
          <div className="overflow-x-auto">
          <table className="w-full min-w-160 text-sm">
            <thead className="bg-surface-muted text-ink-soft">
              <tr>
                <th className="px-5 py-2">File</th>
                <th className="px-5 py-2 text-right">Read</th>
                <th className="px-5 py-2 text-right">New</th>
                <th className="px-5 py-2 text-right">Merged</th>
                <th className="px-5 py-2 text-right">Skipped</th>
                <th className="px-5 py-2">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {overview.lastImports.map((run) => (
                <tr key={run.source}>
                  <td className="px-5 py-3 font-medium text-ink">{run.source}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{run.rowsRead.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{run.rowsInserted.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{run.rowsMerged.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{run.rowsSkipped.toLocaleString()}</td>
                  <td className="px-5 py-3 text-ink-soft">
                    {tally(run.skipReasons) || tally(run.warnings) || 'nothing unusual'}
                  </td>
                </tr>
              ))}
              {overview.lastImports.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-center text-ink-soft">
                    Nothing imported yet. Run <code className="text-ink">npm run import</code>.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          </div>
        </Card>
      </section>
    </div>
  );
}
