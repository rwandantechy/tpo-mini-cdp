/** Structured logs. Known PII and secret field names are redacted. */

type Level = 'debug' | 'info' | 'warn' | 'error';

type Fields = Record<string, unknown>;

const REDACTED_KEYS = new Set([
  'email',
  'email_normalized',
  'email_original',
  'emails',
  'password',
  'token',
  'authorization',
  'cookie',
  'signature',
  'secret',
  'api_key',
  'apikey',
  'session',
  'question',
]);

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function minimumLevel(): Level {
  const configured = process.env.LOG_LEVEL;
  if (configured === 'debug' || configured === 'info' || configured === 'warn' || configured === 'error') {
    return configured;
  }
  return process.env.NODE_ENV === 'test' ? 'warn' : 'info';
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  const output: Fields = {};
  for (const [key, nested] of Object.entries(value as Fields)) {
    output[key] = REDACTED_KEYS.has(key.toLowerCase()) ? '[redacted]' : redact(nested, depth + 1);
  }
  return output;
}

function emit(level: Level, message: string, fields?: Fields): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minimumLevel()]) return;

  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    message,
    ...(fields ? (redact(fields) as Fields) : {}),
  });

  if (level === 'error' || level === 'warn') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const log = {
  debug: (message: string, fields?: Fields) => emit('debug', message, fields),
  info: (message: string, fields?: Fields) => emit('info', message, fields),
  warn: (message: string, fields?: Fields) => emit('warn', message, fields),
  error: (message: string, fields?: Fields) => emit('error', message, fields),
};
