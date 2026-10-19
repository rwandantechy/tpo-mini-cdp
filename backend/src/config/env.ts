
import { z } from 'zod';

import {
  DEFAULT_GEMINI_FALLBACK_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_PORT,
  SECRET_MIN_LENGTH,
} from './constants.js';

// Validate server and database settings from environment variables.
// CLI scripts only need the database configuration.
const databaseSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  DATABASE_SSL: z
    .enum(['require', 'no-verify', 'disable'])
    .default('require'),

  // Optional CA certificate path for database TLS verification.
  DATABASE_CA_CERT: z.string().min(1).optional(),
});

// Settings required to run the API server.
const serverSchema = databaseSchema
  .extend({
    NODE_ENV: z.enum(['development', 'test', 'production']),

    PORT: z.coerce
      .number()
      .int()
      .positive()
      .default(DEFAULT_PORT),

    // Secrets used for sessions, authentication, and webhooks.
    SESSION_SECRET: z
      .string()
      .min(
        SECRET_MIN_LENGTH,
        `SESSION_SECRET must be at least ${SECRET_MIN_LENGTH} characters`,
      ),

    APP_PASSWORD_HASH: z
      .string()
      .regex(
        /^scrypt:[0-9a-f]+:[0-9a-f]+$/,
        'APP_PASSWORD_HASH must look like scrypt:<salt>:<key>',
      ),

    WEBHOOK_SECRET: z
      .string()
      .min(
        SECRET_MIN_LENGTH,
        `WEBHOOK_SECRET must be at least ${SECRET_MIN_LENGTH} characters`,
      ),

    WEBHOOK_URL: z.string().url().optional(),

    // Only allow valid HTTP or HTTPS frontend origins.
    CORS_ORIGINS: z
      .string()
      .min(1, 'CORS_ORIGINS is required')
      .refine((value) => {
        const origins = value
          .split(',')
          .map((origin) => origin.trim());

        return origins.every((origin) => {
          try {
            const url = new URL(origin);

            return (
              ['http:', 'https:'].includes(url.protocol) &&
              url.origin === origin
            );
          } catch {
            return false;
          }
        });
      }, 'CORS_ORIGINS must contain valid HTTP or HTTPS origins'),

    // Cookie security and reverse proxy settings.
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']),

    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true'),

    TRUST_PROXY: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true'),

    // Gemini is the current LLM provider.
    GEMINI_API_KEY: z.string().min(1).optional(),

    GEMINI_MODEL: z
      .string()
      .min(1)
      .default(DEFAULT_GEMINI_MODEL),

    GEMINI_FALLBACK_MODEL: z
      .string()
      .min(1)
      .default(DEFAULT_GEMINI_FALLBACK_MODEL),
  })
  .superRefine((data, ctx) => {
    // SameSite=None cookies require HTTPS.
    if (data.COOKIE_SAMESITE === 'none' && !data.COOKIE_SECURE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['COOKIE_SECURE'],
        message: 'COOKIE_SECURE must be true when COOKIE_SAMESITE is none',
      });
    }

    // Never disable database certificate verification in production.
    if (
      data.NODE_ENV === 'production' &&
      data.DATABASE_SSL !== 'require'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_SSL'],
        message: 'DATABASE_SSL must be require in production',
      });
    }
  });

export type ServerEnv = z.infer<typeof serverSchema>;
export type DatabaseEnv = z.infer<typeof databaseSchema>;

let cachedServerEnv: ServerEnv | null = null;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map(
      (issue) =>
        `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
    )
    .join('\n');
}

// Validate server settings once and reuse them.
export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv;

  const parsed = serverSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration:\n${formatIssues(parsed.error)}\n\nSee .env.example.`,
    );
  }

  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

// CLI scripts only need database settings, but must still use
// verified TLS connections when running in production.
export function getDatabaseEnv(): DatabaseEnv {
  const parsed = databaseSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new Error(
      `Invalid database configuration:\n${formatIssues(parsed.error)}\n\nSee .env.example.`,
    );
  }

  if (
    process.env.NODE_ENV === 'production' &&
    parsed.data.DATABASE_SSL !== 'require'
  ) {
    throw new Error('DATABASE_SSL must be require in production');
  }

  return parsed.data;
}

// Allow tests to reload environment settings.
export function resetEnvCache(): void {
  cachedServerEnv = null;
}

// Turn comma-separated frontend origins into a clean list.
export function corsOrigins(env: ServerEnv): string[] {
  return env.CORS_ORIGINS
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
