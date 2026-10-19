import { useEffect, useRef, useState } from 'react';

import { Badge, Notice, Pager, Spinner } from '../../components/ui.tsx';
import { api, ApiError } from '../../lib/api.ts';
import { PAGE_SIZE } from '../../lib/constants.ts';
import { formatDate } from '../../lib/format.ts';
import { useDebounced } from '../../lib/useDebounced.ts';
import { SubscriberRecord } from './SubscriberProfile.tsx';
import type { PeoplePage } from './types.ts';

export function People() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query, 200);
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<PeoplePage | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    void (async () => {
      setBusy(true);
      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(offset),
        });
        if (debouncedQuery.trim()) params.set('q', debouncedQuery.trim());

        const body = await api.get<PeoplePage>(`/api/subscribers?${params}`);
        setPage(body);
        setError(null);
        listRef.current?.scrollTo({ top: 0 });
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'Could not load people.');
      } finally {
        setBusy(false);
      }
    })();
  }, [debouncedQuery, offset]);

  useEffect(() => {
    if (!selectedId) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setSelectedId(null);
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  const people = page?.results ?? null;
  const total = page?.total ?? 0;
  const limit = page?.limit ?? PAGE_SIZE;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);

  return (
    <div className="flex h-full min-h-0">
      <section
        className={`min-h-0 min-w-0 flex-col border-line bg-surface ${
          selectedId ? 'hidden lg:flex lg:w-96 lg:shrink-0 lg:border-r' : 'flex flex-1'
        }`}
      >
        <div className="border-b border-line px-4 py-3">
          <h1 className="text-lg font-semibold text-ink">People</h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            {page
              ? total === 0
                ? 'No matches'
                : `${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}`
              : 'Subscribers across newsletter, site, and app.'}
          </p>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOffset(0);
            }}
            placeholder="Search by email"
            aria-label="Search people"
            className="mt-3 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/70"
          />
        </div>

        {error ? (
          <div className="p-4">
            <Notice tone="error">{error}</Notice>
          </div>
        ) : null}

        {!people && !error ? (
          <div className="p-4">
            <Spinner label="Loading people…" />
          </div>
        ) : null}

        {people ? (
          <div ref={listRef} className="min-h-0 flex-1 overflow-auto">
            {people.length === 0 ? (
              <p className="px-4 py-8 text-sm text-ink-soft">
                {query.trim() ? `No one matched “${query.trim()}”.` : 'No subscribers yet.'}
              </p>
            ) : (
              <ul>
                {people.map((person) => {
                  const selected = person.id === selectedId;
                  return (
                    <li key={person.id} className="border-b border-line">
                      <button
                        type="button"
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left ${
                          selected ? 'bg-blush' : 'hover:bg-surface-muted'
                        }`}
                        onClick={() => setSelectedId(person.id)}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-ink">{person.email}</span>
                          <span className="mt-0.5 block text-sm text-ink-soft">
                            {person.acquisitionSource ?? 'Unknown source'}
                            {' · '}
                            {person.lastOpenDate ? `Last open ${formatDate(person.lastOpenDate)}` : 'Never opened'}
                          </span>
                        </span>
                        <Badge tone={person.status === 'active' ? 'ok' : 'muted'}>{person.status}</Badge>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {busy ? <p className="px-4 py-2 text-xs text-ink-soft">Updating…</p> : null}
          </div>
        ) : null}

        <Pager offset={offset} limit={limit} total={total} busy={busy} onOffset={setOffset} />
      </section>

      <section className={`min-h-0 min-w-0 flex-1 flex-col bg-surface-muted ${selectedId ? 'flex' : 'hidden lg:flex'}`}>
        {selectedId ? (
          <SubscriberRecord id={selectedId} onClose={() => setSelectedId(null)} />
        ) : (
          <div className="hidden h-full items-center justify-center p-8 text-sm text-ink-soft lg:flex">
            Select someone to see newsletter, site, and app activity.
          </div>
        )}
      </section>
    </div>
  );
}
