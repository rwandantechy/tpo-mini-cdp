import { useCallback, useEffect, useRef, useState } from 'react';

import { Button, Field, Notice, Pager, Select } from '../../components/ui.tsx';
import { api, ApiError } from '../../lib/api.ts';
import { ACQUISITION_SOURCES, COLD_WINDOW_DAYS, INSTAGRAM_COLD_PRESET, PAGE_SIZE } from '../../lib/constants.ts';
import { formatDate } from '../../lib/format.ts';
import { useEscape } from '../../lib/useEscape.ts';
import { PersonList } from '../subscribers/PersonList.tsx';
import { SubscriberRecord } from '../subscribers/SubscriberProfile.tsx';
import type { SavedSegment, SegmentDefinition, SegmentPreview } from './types.ts';

const EMPTY_FILTERS = {
  acquisitionSource: '',
  status: '',
  lastOpen: 'any',
  hasWebsite: '',
  hasApp: '',
  signupFrom: '',
  signupTo: '',
} as const;

type Filters = {
  acquisitionSource: string;
  status: string;
  lastOpen: 'any' | 'never' | 'cold';
  hasWebsite: string;
  hasApp: string;
  signupFrom: string;
  signupTo: string;
};

function toDefinition(filters: Filters): SegmentDefinition {
  const definition: SegmentDefinition = {};

  if (filters.acquisitionSource) definition.acquisitionSource = filters.acquisitionSource;
  if (filters.status) definition.status = filters.status;
  if (filters.signupFrom) definition.signupFrom = filters.signupFrom;
  if (filters.signupTo) definition.signupTo = filters.signupTo;
  if (filters.lastOpen !== 'any') definition.lastOpen = filters.lastOpen;
  if (filters.hasWebsite === 'yes') definition.hasWebsite = true;
  if (filters.hasWebsite === 'no') definition.hasWebsite = false;
  if (filters.hasApp === 'yes') definition.hasApp = true;
  if (filters.hasApp === 'no') definition.hasApp = false;

  return definition;
}

function fromDefinition(definition: SegmentDefinition): Filters {
  return {
    acquisitionSource: definition.acquisitionSource ?? '',
    status: definition.status ?? '',
    lastOpen: definition.lastOpen ?? 'any',
    hasWebsite: definition.hasWebsite === true ? 'yes' : definition.hasWebsite === false ? 'no' : '',
    hasApp: definition.hasApp === true ? 'yes' : definition.hasApp === false ? 'no' : '',
    signupFrom: definition.signupFrom ?? '',
    signupTo: definition.signupTo ?? '',
  };
}

export function Segments() {
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS });
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<SegmentPreview | null>(null);
  const [saved, setSaved] = useState<SavedSegment[]>([]);
  const [name, setName] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setSelectedId(null), []);
  const definition = toDefinition(filters);
  const definitionKey = JSON.stringify(definition);

  useEscape(Boolean(selectedId), close);

  const loadSaved = useCallback(async () => {
    const body = await api.get<{ segments: SavedSegment[] }>('/api/segments');
    setSaved(body.segments);
  }, []);

  useEffect(() => {
    void loadSaved().catch(() => undefined);
  }, [loadSaved]);

  useEffect(() => {
    void (async () => {
      setBusy(true);
      try {
        const body = await api.post<SegmentPreview>('/api/segments/preview', {
          definition: JSON.parse(definitionKey) as SegmentDefinition,
          limit: PAGE_SIZE,
          offset,
        });
        setPage(body);
        setError(null);
        listRef.current?.scrollTo({ top: 0 });
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'Could not load this segment.');
      } finally {
        setBusy(false);
      }
    })();
  }, [definitionKey, offset]);

  async function save() {
    try {
      await api.post('/api/segments', { name, definition });
      setName('');
      await loadSaved();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save that segment.');
    }
  }

  const total = page?.total ?? 0;
  const limit = page?.limit ?? PAGE_SIZE;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);

  function patch(next: Partial<Filters>) {
    setFilters((current) => ({ ...current, ...next }));
    setOffset(0);
  }

  return (
    <div className="flex h-full min-h-0">
      <section
        className={`min-h-0 min-w-0 flex-col border-line bg-surface ${
          selectedId ? 'hidden lg:flex lg:w-md lg:shrink-0 lg:border-r' : 'flex flex-1'
        }`}
      >
        <div className="border-b border-line px-4 py-3">
          <h1 className="text-lg font-semibold text-ink">Segments</h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            {page
              ? `${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()} · cold means no open since ${formatDate(page.cutoffDate)}`
              : `Dates are as of the assessment “today”, not the server clock. Cold is ${COLD_WINDOW_DAYS} days.`}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="quiet"
              className="px-3 py-1.5"
              onClick={() => {
                setFilters(fromDefinition(INSTAGRAM_COLD_PRESET));
                setOffset(0);
              }}
            >
              Instagram, no open in {COLD_WINDOW_DAYS} days
            </Button>
            <Button variant="quiet" className="px-3 py-1.5" onClick={() => { setFilters({ ...EMPTY_FILTERS }); setOffset(0); }}>
              Clear
            </Button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Select label="Source" value={filters.acquisitionSource} onChange={(event) => patch({ acquisitionSource: event.target.value })}>
              <option value="">Any source</option>
              {ACQUISITION_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </Select>
            <Select label="Status" value={filters.status} onChange={(event) => patch({ status: event.target.value })}>
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="unsubscribed">Unsubscribed</option>
            </Select>
            <Select label="Last open" value={filters.lastOpen} onChange={(event) => patch({ lastOpen: event.target.value as Filters['lastOpen'] })}>
              <option value="any">Any</option>
              <option value="never">Never opened</option>
              <option value="cold">Cold ({COLD_WINDOW_DAYS} days)</option>
            </Select>
            <Select label="Website" value={filters.hasWebsite} onChange={(event) => patch({ hasWebsite: event.target.value })}>
              <option value="">Any</option>
              <option value="yes">Has visits</option>
              <option value="no">No visits</option>
            </Select>
            <Select label="App" value={filters.hasApp} onChange={(event) => patch({ hasApp: event.target.value })}>
              <option value="">Any</option>
              <option value="yes">Has account</option>
              <option value="no">No account</option>
            </Select>
            <Field
              label="Signed up from"
              type="date"
              value={filters.signupFrom}
              onChange={(event) => patch({ signupFrom: event.target.value })}
            />
            <Field
              label="Signed up to"
              type="date"
              value={filters.signupTo}
              onChange={(event) => patch({ signupTo: event.target.value })}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Save as…"
              aria-label="Segment name"
              className="min-w-0 flex-1 rounded-md border border-line px-3 py-2 text-sm"
            />
            <Button disabled={name.trim().length === 0} onClick={() => void save()}>
              Save
            </Button>
          </div>

          {saved.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {saved.map((segment) => (
                <li key={segment.id}>
                  <button
                    type="button"
                    className="rounded-full border border-line px-3 py-1 text-xs text-ink hover:bg-surface-muted"
                    onClick={() => {
                      setFilters(fromDefinition(segment.definition));
                      setOffset(0);
                    }}
                  >
                    {segment.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {error ? (
          <div className="p-4">
            <Notice tone="error">{error}</Notice>
          </div>
        ) : null}

        <PersonList
          people={page?.results ?? null}
          selectedId={selectedId}
          onSelect={setSelectedId}
          empty="No one in this segment."
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
            Apply filters, then select someone.
          </div>
        )}
      </section>
    </div>
  );
}
