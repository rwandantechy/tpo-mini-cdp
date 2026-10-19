import { createApp } from './app.js';
import { SHUTDOWN_TIMEOUT_MS } from './config/constants.js';
import { loadDotenv } from './config/dotenv.js';
import { getServerEnv } from './config/env.js';
import { closePool } from './lib/db.js';
import { log } from './lib/logger.js';

loadDotenv();

let env;
try {
  env = getServerEnv();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const server = createApp().listen(env.PORT, () => {
  log.info('api listening', { port: env.PORT, env: env.NODE_ENV, model: env.GEMINI_MODEL });
});

async function shutdown(signal: string): Promise<void> {
  log.info('shutting down', { signal });

  server.close(async (error) => {
    if (error) log.error('server did not close cleanly', { error: error.message });
    await closePool();
    process.exit(error ? 1 : 0);
  });

  setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  log.error('unhandled promise rejection', { reason: reason instanceof Error ? reason.message : String(reason) });
});
