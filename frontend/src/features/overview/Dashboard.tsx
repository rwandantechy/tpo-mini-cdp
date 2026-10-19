import { useEffect, useState } from "react";
import {
  CameraIcon,
  CheckIcon,
  LinkIcon,
  MailIcon,
  MinusIcon,
  MoonIcon,
  PageIcon,
  UsersIcon,
} from "../../components/icons.tsx";
import {
  Card,
  CardHeader,
  Notice,
  PageHeader,
  Spinner,
  Stat,
} from "../../components/ui.tsx";
import { api, ApiError } from "../../lib/api.ts";
import { formatDate } from "../../lib/format.ts";

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

interface SourceMixRow {
  source: string;
  total: number;
  active: number;
  unsubscribed: number;
  unsubRate: number;
  share: number;
}

interface Overview {
  referenceDate: string;
  coldWindowDays: number;
  subscribers: {
    total: number;
    active: number;
    unsubscribed: number;
    neverOpened: number;
    coldSinceCutoff: number;
  };
  app: {
    accounts: number;
    linkedToSubscriber: number;
    withoutSubscriber: number;
    events: number;
  };
  web: {
    visitors: number;
    identified: number;
    anonymous: number;
    pageviews: number;
  };
  sources: SourceMixRow[];
  pages: Array<{ page: string; views: number }>;
  lists: {
    instagramCold: number;
    instagramColdActive: number;
    engaged: number;
  };
  lastImports: ImportRun[];
}

function tally(counts: Record<string, number>): string {
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(
      ([reason, count]) =>
        `${count.toLocaleString()} ${reason.replace(/_/g, " ")}`,
    )
    .join(", ");
}

export function Dashboard() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Overview>("/api/overview")
      .then(setOverview)
      .catch((caught: unknown) =>
        setError(
          caught instanceof ApiError
            ? caught.message
            : "Could not load the overview.",
        ),
      );
  }, []);

  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <Notice tone="error">{error}</Notice>
      </div>
    );
  }
  if (!overview) {
    return (
      <div className="p-4 sm:p-6">
        <Spinner label="Loading…" />
      </div>
    );
  }

  const { subscribers, app, web, sources, pages, lists } = overview;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Overview"
        description={`As of ${formatDate(overview.referenceDate)}. Quiet means no open in ${overview.coldWindowDays} days.`}
      />

      <Card>
        <dl className="grid grid-cols-2 divide-y divide-line sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          <Stat
            label="Subscribers"
            value={subscribers.total}
            icon={<UsersIcon />}
          />
          <Stat
            label="Active"
            value={subscribers.active}
            icon={<CheckIcon />}
          />
          <Stat
            label="Unsubscribed"
            value={subscribers.unsubscribed}
            icon={<MinusIcon />}
          />
          <Stat
            label="Quiet"
            value={subscribers.coldSinceCutoff}
            note={`${subscribers.neverOpened.toLocaleString()} have never opened`}
            icon={<MoonIcon />}
          />
        </dl>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader
            title="Signup source"
            hint="Share of the list, and how many from each source have unsubscribed."
            icon={<CameraIcon />}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-ink-soft">
                <tr>
                  <th className="px-5 py-2">Source</th>
                  <th className="px-5 py-2 text-right">People</th>
                  <th className="hidden px-5 py-2 sm:table-cell">Share</th>
                  <th className="px-5 py-2 text-right">Unsubscribed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sources.map((row) => (
                  <tr key={row.source}>
                    <td className="px-5 py-3 font-medium text-ink">
                      {row.source}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {row.total.toLocaleString()}
                    </td>
                    <td className="hidden px-5 py-3 sm:table-cell">
                      <ShareBar value={row.share} />
                    </td>
                    <td
                      className={`px-5 py-3 text-right tabular-nums ${row.unsubRate >= 50 ? "text-caution" : "text-ink-soft"}`}
                    >
                      {row.unsubscribed.toLocaleString()}
                      <span className="ml-1 text-xs">({row.unsubRate}%)</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="Top pages"
            hint={`${web.pageviews.toLocaleString()} pageviews across the site.`}
            icon={<PageIcon />}
          />
          {pages.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-soft">
              No website events yet.
            </p>
          ) : (
            <ol className="divide-y divide-line">
              {pages.map((row, index) => (
                <li
                  key={row.page}
                  className="flex items-baseline justify-between gap-4 px-5 py-3 text-sm"
                >
                  <span className="min-w-0 truncate text-ink">
                    <span className="mr-2 tabular-nums text-ink-soft">
                      {index + 1}
                    </span>
                    {row.page}
                  </span>
                  <span className="shrink-0 tabular-nums text-ink-soft">
                    {row.views.toLocaleString()}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Matched identities"
          hint="Same person across newsletter, site, and app — unmatched rows stay visible."
          icon={<LinkIcon />}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-ink-soft">
              <tr>
                <th className="px-5 py-2">Channel</th>
                <th className="px-5 py-2 text-right">Total</th>
                <th className="px-5 py-2 text-right">Matched</th>
                <th className="px-5 py-2 text-right">Unmatched</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <tr>
                <td className="px-5 py-3 font-medium text-ink">
                  Website visitors
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  {web.visitors.toLocaleString()}
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  {web.identified.toLocaleString()}
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-ink-soft">
                  {web.anonymous.toLocaleString()}
                </td>
              </tr>
              <tr>
                <td className="px-5 py-3 font-medium text-ink">App accounts</td>
                <td className="px-5 py-3 text-right tabular-nums">
                  {app.accounts.toLocaleString()}
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  {app.linkedToSubscriber.toLocaleString()}
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-ink-soft">
                  {app.withoutSubscriber.toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-sm text-ink-soft">
          {app.events === 0
            ? "No app events received yet."
            : `${app.events.toLocaleString()} app events on file.`}
        </p>
      </Card>

      <Card>
        <dl className="grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Stat
            label="Instagram, quiet"
            value={lists.instagramCold}
            note={`${lists.instagramColdActive.toLocaleString()} of them are still subscribed`}
            icon={<CameraIcon />}
          />
          <Stat
            label="Never opened"
            value={subscribers.neverOpened}
            note="No last-open date on the list"
            icon={<MoonIcon />}
          />
          <Stat
            label="Email, site, and app"
            value={lists.engaged}
            note="Active, and present in both other channels"
            icon={<MailIcon />}
          />
        </dl>
      </Card>

      <details className="group">
        <summary className="cursor-pointer text-sm text-ink-soft hover:text-ink">
          Last import
        </summary>
        <Card className="mt-2 overflow-hidden">
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
                    <td className="px-5 py-3 font-medium text-ink">
                      {run.source}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {run.rowsRead.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {run.rowsInserted.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {run.rowsMerged.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {run.rowsSkipped.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-ink-soft">
                      {tally(run.skipReasons) ||
                        tally(run.warnings) ||
                        "nothing unusual"}
                    </td>
                  </tr>
                ))}
                {overview.lastImports.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-6 text-center text-ink-soft"
                    >
                      Nothing imported yet. Run{" "}
                      <code className="text-ink">npm run import</code>.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      </details>
    </div>
  );
}

function ShareBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full bg-coral"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <span className="w-8 text-right tabular-nums text-ink-soft">
        {value}%
      </span>
    </div>
  );
}
