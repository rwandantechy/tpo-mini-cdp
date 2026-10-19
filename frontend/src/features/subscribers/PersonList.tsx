import type { Ref } from 'react';

import { Badge, Spinner } from '../../components/ui.tsx';
import { formatDate } from '../../lib/format.ts';
import type { Person } from './types.ts';

export function PersonList({
  people,
  selectedId,
  onSelect,
  empty,
  busy,
  listRef,
}: {
  people: Person[] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  empty: string;
  busy: boolean;
  listRef?: Ref<HTMLDivElement>;
}) {
  if (!people) {
    return (
      <div className="p-4">
        <Spinner label="Loading people…" />
      </div>
    );
  }

  return (
    <div ref={listRef} className="min-h-0 flex-1 overflow-auto">
      {people.length === 0 ? (
        <p className="px-4 py-8 text-sm text-ink-soft">{empty}</p>
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
                  onClick={() => onSelect(person.id)}
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
  );
}
