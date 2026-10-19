export interface ValuesList {
  clause: string;
  params: unknown[];
}

/** Casts are required: a bare parameter inside VALUES has no inferable type. */
export function buildValues(rows: readonly (readonly unknown[])[], casts: readonly string[]): ValuesList {
  if (rows.length === 0) throw new Error('buildValues requires at least one row');

  const params: unknown[] = [];
  const tuples = rows.map((row) => {
    if (row.length !== casts.length) {
      throw new Error(`row has ${row.length} values but ${casts.length} casts were given`);
    }

    const placeholders = row.map((value, column) => {
      params.push(value);
      return `$${params.length}::${casts[column]}`;
    });

    return `(${placeholders.join(', ')})`;
  });

  return { clause: tuples.join(', '), params };
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new RangeError('chunk size must be at least 1');

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export const UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === UNIQUE_VIOLATION;
}
