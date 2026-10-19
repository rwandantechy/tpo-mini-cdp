/** `npm run import` or `npm run import -- ./other` */

import { resolve } from 'node:path';

import { loadDotenv } from '../backend/src/config/dotenv.js';
import { closePool } from '../backend/src/lib/db.js';
import { runImport } from '../backend/src/services/import/index.js';
import type { ImportReport } from '../backend/src/services/import/types.js';

loadDotenv();

function describeTally(label: string, tally: Record<string, number>): void {
  const entries = Object.entries(tally);
  if (entries.length === 0) return;

  console.log(`    ${label}:`);
  for (const [key, count] of entries.sort(([, a], [, b]) => b - a)) {
    console.log(`      ${count.toLocaleString().padStart(6)}  ${key}`);
  }
}

function describe(report: ImportReport): void {
  console.log(`\n  ${report.source}`);
  console.log(`    read ${report.rowsRead.toLocaleString()}`);
  console.log(`    new ${report.rowsInserted.toLocaleString()}, merged ${report.rowsMerged.toLocaleString()}, skipped ${report.rowsSkipped.toLocaleString()}`);
  describeTally('skipped because', report.skipReasons);
  describeTally('kept with a warning', report.warnings);
}

async function main(): Promise<void> {
  const dataDir = resolve(process.argv[2] ?? 'data');
  console.log(`Importing from ${dataDir}`);

  const summary = await runImport({ dataDir });

  describe(summary.subscribers);
  describe(summary.appUsers);
  describe(summary.webEvents);

  const { linking } = summary;
  console.log('\n  identity');
  console.log(`    ${linking.appUsersLinked.toLocaleString()} app accounts matched to a subscriber`);
  console.log(`    ${linking.appUsersWithoutSubscriber.toLocaleString()} app accounts with no matching subscriber (they keep their own profile)`);
  console.log(`    ${linking.visitorsIdentified.toLocaleString()} website visitors identified`);
  console.log(`    ${linking.visitorsAnonymous.toLocaleString()} website visitors still anonymous`);
  console.log('');
}

main()
  .catch((error: unknown) => {
    console.error(`\nImport failed. ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(closePool);
