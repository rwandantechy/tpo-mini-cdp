import { useCallback, useEffect, useRef, useState } from 'react';

import { Notice, Pager } from '../../components/ui.tsx';
import { api, ApiError } from '../../lib/api.ts';
import { PAGE_SIZE } from '../../lib/constants.ts';
import { useDebounced } from '../../lib/useDebounced.ts';
import { useEscape } from '../../lib/useEscape.ts';
import { PersonList } from './PersonList.tsx';
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
  const close = useCallback(() => setSelectedId(null), []);

  useEscape(Boolean(selectedId), close);

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

        <PersonList
          people={error && !people ? [] : people}
          selectedId={selectedId}
          onSelect={setSelectedId}
          empty={query.trim() ? `No one matched “${query.trim()}”.` : 'No subscribers yet.'}
          busy={busy}
          listRef={listRef}
        />

        <Pager offset={offset} limit={limit} total={total} busy={busy} onOffset={setOffset} />
      </section>

      <section className={`min-h-0 min-w-0 flex-1 flex-col bg-surface-muted ${selectedId ? 'flex' : 'hidden lg:flex'}`}>
        {selectedId ? (
          <SubscriberRecord id={selectedId} onClose={close} />
        ) : (
          <div className="hidden h-full items-center justify-center p-8 text-sm text-ink-soft lg:flex">
            Select someone to see newsletter, site, and app activity.
          </div>
        )}
      </section>
    </div>
  );
}
