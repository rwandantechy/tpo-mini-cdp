import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';

import { Markdown } from '../../components/Markdown.tsx';
import { Button, Notice, Pager, Spinner } from '../../components/ui.tsx';
import { api, ApiError } from '../../lib/api.ts';
import {
  ASSISTANT_ANSWER_MAX_LENGTH,
  ASSISTANT_HISTORY_TURNS,
  ASSISTANT_REQUEST_TIMEOUT_MS,
  PAGE_SIZE,
} from '../../lib/constants.ts';
import { useEscape } from '../../lib/useEscape.ts';
import { PersonList } from '../subscribers/PersonList.tsx';
import { SubscriberRecord } from '../subscribers/SubscriberProfile.tsx';
import type { PeoplePage } from '../subscribers/types.ts';

interface AssistantTable {
  title: string;
  rows: Array<Record<string, string | number>>;
}

interface AssistantSegment {
  id?: string;
  name?: string;
  total: number;
  definition: Record<string, unknown>;
}

interface AssistantAnswer {
  answer: string;
  blocked: boolean;
  tables: AssistantTable[];
  segment?: AssistantSegment;
}

interface Turn {
  id: string;
  question: string;
  result: AssistantAnswer | { error: string; busy?: boolean } | null;
}

const SUGGESTIONS = [
  'How many Instagram signups went cold in the last 30 days?',
  'Build a list of our most engaged readers',
  'Which pages do new subscribers hit first?',
];

export function Assistant() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [people, setPeople] = useState<PeoplePage | null>(null);
  const [segment, setSegment] = useState<AssistantSegment | null>(null);
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listBusy, setListBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const requestTick = useRef(0);
  const closeRecord = useCallback(() => setSelectedId(null), []);

  useEscape(Boolean(selectedId), closeRecord);

  useEffect(() => {
    api
      .get<{ available: boolean }>('/api/assistant')
      .then((body) => setAvailable(body.available))
      .catch(() => setAvailable(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [turns, busy]);

  const loadPeople = useCallback(async (definition: Record<string, unknown>, nextOffset: number) => {
    setListBusy(true);
    try {
      const page = await api.post<PeoplePage>('/api/segments/preview', {
        definition,
        limit: PAGE_SIZE,
        offset: nextOffset,
      });
      setPeople(page);
      setOffset(nextOffset);
      listRef.current?.scrollTo({ top: 0 });
    } catch {
      setPeople(null);
    } finally {
      setListBusy(false);
    }
  }, []);

  async function submit(text: string) {
    const trimmed = text.trim();
    if (trimmed.length === 0 || busy) return;

    const id = crypto.randomUUID();
    const tick = requestTick.current + 1;
    requestTick.current = tick;

    const history = turns
      .flatMap((turn) => {
        if (!turn.result || 'error' in turn.result || turn.result.blocked) return [];
        const answer = turn.result.answer.trim().slice(0, ASSISTANT_ANSWER_MAX_LENGTH);
        if (!answer) return [];
        return [{ question: turn.question, answer }];
      })
      .slice(-ASSISTANT_HISTORY_TURNS);

    setBusy(true);
    setQuestion('');
    setSelectedId(null);
    setTurns((current) => [...current, { id, question: trimmed, result: null }]);

    try {
      const result = await api.post<AssistantAnswer>(
        '/api/assistant',
        { question: trimmed, history },
        { timeoutMs: ASSISTANT_REQUEST_TIMEOUT_MS },
      );
      if (tick !== requestTick.current) return;

      setTurns((current) => current.map((turn) => (turn.id === id ? { ...turn, result } : turn)));

      if (result.segment?.name && result.segment.definition) {
        setSegment(result.segment);
        await loadPeople(result.segment.definition, 0);
      } else {
        setSegment(null);
        setPeople(null);
      }
    } catch (caught) {
      if (tick !== requestTick.current) return;
      const busyError =
        caught instanceof ApiError && (caught.status === 0 || caught.status === 502 || caught.status === 503 || caught.status === 429);
      const error = caught instanceof ApiError ? caught.message : 'Could not reach the assistant.';
      setTurns((current) =>
        current.map((turn) => (turn.id === id ? { ...turn, result: { error, busy: busyError } } : turn)),
      );
    } finally {
      if (tick === requestTick.current) setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(question);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit(question);
    }
  }

  const showPeople = Boolean(segment && people);
  const total = people?.total ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <div
        className={`flex min-h-0 min-w-0 flex-col overflow-hidden ${
          showPeople && selectedId ? 'hidden lg:flex lg:flex-1' : 'flex flex-1'
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line bg-surface px-4 py-3 sm:px-6">
          <div>
            <h1 className="text-lg font-semibold text-ink">Assistant</h1>
            <p className="mt-0.5 text-sm text-ink-soft">Totals, pages, and segments. Named people stay in this app.</p>
          </div>
          {turns.length > 0 ? (
            <Button
              variant="quiet"
              className="mt-1 shrink-0 px-3 py-1.5"
              onClick={() => {
                requestTick.current += 1;
                setBusy(false);
                setTurns([]);
                setPeople(null);
                setSegment(null);
                setSelectedId(null);
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
          {turns.length === 0 ? (
            <EmptyState available={available} busy={busy} onAsk={(value) => void submit(value)} />
          ) : (
            <ol className="space-y-4">
              {turns.map((turn) => (
                <li key={turn.id} className="space-y-2">
                  <p className="rounded-lg bg-blush px-3 py-2 text-sm text-ink">{turn.question}</p>
                  {turn.result === null ? (
                    <div className="rounded-lg border border-line bg-surface px-3 py-3">
                      <Spinner label="Thinking…" />
                    </div>
                  ) : 'error' in turn.result ? (
                    <Notice tone={turn.result.busy ? 'info' : 'error'}>{turn.result.error}</Notice>
                  ) : (
                    <Answer result={turn.result} />
                  )}
                </li>
              ))}
              <div ref={bottomRef} />
            </ol>
          )}
        </div>

        <form onSubmit={onSubmit} className="border-t border-line bg-surface p-3 sm:p-4">
          <div className="flex items-end gap-2">
            <textarea
              id="assistant-question"
              className="min-h-11 flex-1 resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/70"
              rows={2}
              maxLength={500}
              value={question}
              placeholder="Ask about totals, sources, or pages…"
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={onKeyDown}
            />
            <Button type="submit" disabled={busy || question.trim().length === 0}>
              Ask
            </Button>
          </div>
        </form>
      </div>

      {showPeople && people && segment ? (
        <div
          className={`min-h-0 flex-col border-line bg-surface ${
            selectedId ? 'flex flex-1 lg:flex-1' : 'flex w-full shrink-0 border-t lg:w-md lg:border-l lg:border-t-0'
          }`}
        >
          {selectedId ? (
            <SubscriberRecord id={selectedId} onClose={closeRecord} />
          ) : (
            <>
              <div className="border-b border-line px-4 py-3">
                <p className="text-sm font-medium text-ink">{segment.name}</p>
                <p className="mt-0.5 text-sm text-ink-soft">
                  {total.toLocaleString()} people. Shown here, not sent to the model.
                </p>
              </div>
              <PersonList
                people={people.results}
                selectedId={null}
                onSelect={setSelectedId}
                empty="No one in that segment."
                busy={listBusy}
                listRef={listRef}
              />
              <Pager
                offset={offset}
                limit={PAGE_SIZE}
                total={total}
                busy={listBusy}
                onOffset={(next) => void loadPeople(segment.definition, next)}
              />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function EmptyState({
  available,
  busy,
  onAsk,
}: {
  available: boolean | null;
  busy: boolean;
  onAsk: (question: string) => void;
}) {
  return (
    <div className="mx-auto max-w-xl space-y-4">
      {available === false ? (
        <Notice>The assistant is not configured on this server. Asking about a named person is still blocked.</Notice>
      ) : (
        <p className="text-sm text-ink-soft">Try one of these, or type your own.</p>
      )}
      <div className="flex flex-col gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <Button key={suggestion} variant="quiet" className="justify-start text-left" disabled={busy} onClick={() => onAsk(suggestion)}>
            {suggestion}
          </Button>
        ))}
      </div>
    </div>
  );
}

function Answer({ result }: { result: AssistantAnswer }) {
  return (
    <div className="space-y-3">
      <Markdown>{result.answer}</Markdown>
      {result.tables.map((table, index) => (
        <Table key={`${table.title}-${index}`} table={table} />
      ))}
      {result.segment?.name ? (
        <p className="text-sm text-ink-soft">
          Saved “{result.segment.name}” ({result.segment.total.toLocaleString()} people).
        </p>
      ) : null}
    </div>
  );
}

const COLUMN_LABELS: Record<string, string> = {
  source: 'Source',
  status: 'Status',
  total: 'Total',
  active: 'Active',
  unsubscribed: 'Unsubscribed',
  unsubRate: 'Unsub rate',
  share: 'Share',
  lastOpen: 'Last open',
  signupFrom: 'Signed up',
  cutoff: 'Cutoff',
  page: 'Page',
  views: 'Views',
  readers: 'Readers',
  count: 'Count',
};

function columnLabel(key: string): string {
  return COLUMN_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
}

function isNumericCell(value: string | number): boolean {
  return typeof value === 'number' || (typeof value === 'string' && /^\d[\d,]*%?$/.test(value));
}

function formatCell(value: string | number): string {
  return typeof value === 'number' ? value.toLocaleString() : String(value ?? '');
}

function Table({ table }: { table: AssistantTable }) {
  if (table.rows.length === 0) return null;
  const columns = Object.keys(table.rows[0] ?? {});

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <p className="border-b border-line bg-surface-muted px-3 py-2 text-xs font-medium text-ink-soft">{table.title}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-ink-soft">
            {columns.map((column) => {
              const numeric = table.rows.every((row) => isNumericCell(row[column] ?? ''));
              return (
                <th
                  key={column}
                  className={`px-3 py-2 text-xs font-medium ${numeric ? 'text-right' : 'text-left'}`}
                >
                  {columnLabel(column)}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {table.rows.map((row, index) => (
            <tr key={index} className="hover:bg-surface-muted/70">
              {columns.map((column, columnIndex) => {
                const value = row[column] ?? '';
                const numeric = isNumericCell(value);
                return (
                  <td
                    key={column}
                    className={`px-3 py-2 ${numeric ? 'text-right tabular-nums text-ink' : 'text-ink'} ${
                      columnIndex === 0 ? 'font-medium' : ''
                    }`}
                  >
                    {formatCell(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
