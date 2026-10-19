import { readFileSync } from 'node:fs';

import { parse } from 'csv-parse/sync';

import type { CsvRow } from './rows.js';

/** `bom: true` keeps a byte-order mark out of the first column name. */
export function readCsv(filePath: string): CsvRow[] {
  const contents = readFileSync(filePath, 'utf8');

  return parse(contents, {
    bom: true,
    columns: (header: string[]) => header.map((name) => name.trim()),
    skip_empty_lines: true,
    trim: false,
    relax_column_count: true,
  }) as CsvRow[];
}
