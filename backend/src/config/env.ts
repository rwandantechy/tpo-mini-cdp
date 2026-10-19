/** The only module that reads `process.env`. CLI scripts use the database schema only. */

import { z } from 'zod';

import { DEFAULT_GEMINI_MODEL, DEFAULT_PORT, SECRET_MIN_LENGTH } from './constants.js';

const databaseSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: z.enum(['require', 'no-verify', 'disable']).default('require'),
  /** Path to the CA, relative to the repo root. Needed for Supabase TLS. */
  DATABASE_CA_CERT: z.string().min(1).optional(),
});

const serverSchema = databaseSchema
  .extend({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    PORT: z.coerce.number().int().positive().default(DEFAULT_PORT),

    SESSION_SECRET: z.string().min(SECRET_MIN_LENGTH, `SESSION_SECRET must be at least ${SECRET_MIN_LENGTH} characters`),
    APP_PASSWORD_HASH: z.string().regex(/^scrypt:[0-9a-f]+:[0-9a-f]+$/, 'APP_PASSWORD_HASH must look like scrypt:<salt>:<key>'),
    WEBHOOK_SECRET: z.string().min(SECRET_MIN_LENGTH, `WEBHOOK_SECRET must be at least ${SECRET_MIN_LENGTH} characters`),
    WEBHOOK_URL: z.string().url().optional(),

    CORS_ORIGINS: z
      .string()
      .min(1, 'CORS_ORIGINS is required')
      .refine((value) => value.split(',').some((origin) => origin.trim().length > 0), 'CORS_ORIGINS must list at least one origin'),
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']),
    COOKIE_SECURE: z.enum(['true', 'false']).transform((value) => value === 'true'),
    TRUST_PROXY: z.enum(['true', 'false']).transform((value) => value === 'true'),

    GEMINI_API_KEY: z.string().min(1).optional(),
    GEMINI_MODEL: z.string().min(1).default(DEFAULT_GEMINI_MODEL),
  })
  .superRefine((data, ctx) => {
    if (data.COOKIE_SAMESITE === 'none' && !data.COOKIE_SECURE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['COOKIE_SECURE'],
        message: 'COOKIE_SECURE must be true when COOKIE_SAMESITE is none',
      });
    }
  });

export type ServerEnv = z.infer<typeof serverSchema>;
export type DatabaseEnv = z.infer<typeof databaseSchema>;

let cachedServerEnv: ServerEnv | null = null;

function formatIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n');
}

export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv;

  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${formatIssues(parsed.error)}\n\nSee .env.example.`);
  }

  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

export function getDatabaseEnv(): DatabaseEnv {
  const parsed = databaseSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid database configuration:\n${formatIssues(parsed.error)}\n\nSee .env.example.`);
  }

  return parsed.data;
}

export function resetEnvCache(): void {
  cachedServerEnv = null;
}

export function corsOrigins(env: ServerEnv): string[] {
  return env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
