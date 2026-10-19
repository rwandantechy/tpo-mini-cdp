import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(backendRoot, 'src/lib/bundled-ca.ts');
const original = readFileSync(sourcePath, 'utf8');
const pem = readFileSync(resolve(backendRoot, '../certs/supabase-ca.crt'), 'utf8');

writeFileSync(sourcePath, `export const BUNDLED_CA = ${JSON.stringify(pem)};\n`);

const build = spawnSync(
  'esbuild',
  [
    'src/app.ts',
    '--bundle',
    '--platform=node',
    '--format=esm',
    '--target=node20',
    '--outfile=app.mjs',
    '--packages=external',
  ],
  { cwd: backendRoot, stdio: 'inherit' },
);

writeFileSync(sourcePath, original);

if (build.status !== 0) process.exit(build.status ?? 1);
