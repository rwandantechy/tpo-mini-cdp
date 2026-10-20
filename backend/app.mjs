// src/app.ts
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import morganLogger from "morgan";

// src/config/constants.ts
var REFERENCE_DATE = "2026-09-28";
var COLD_WINDOW_DAYS = 30;
var APP_EVENT_NAMES = [
  "app_open",
  "read_story",
  "link_click",
  "login"
];
var APP_USER_ORIGIN = {
  csv: "csv",
  webhook: "webhook"
};
var WEBHOOK_MOUNT = "/webhooks";
var WEBHOOK_APP_PATH = `${WEBHOOK_MOUNT}/app`;
var ACQUISITION_SOURCES = [
  "Direct",
  "Facebook",
  "Google",
  "Instagram",
  "Podcast",
  "Referral",
  "X"
];
var SUBSCRIBER_STATUSES = [
  "active",
  "unsubscribed"
];
var DEFAULT_PORT = 4e3;
var DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
var DEFAULT_GEMINI_FALLBACK_MODEL = "gemini-3.1-flash-lite";
var SECRET_MIN_LENGTH = 32;
var SESSION_TTL_SECONDS = 12 * 60 * 60;
var PASSWORD_MIN_LENGTH = 12;
var PASSWORD_MAX_LENGTH = 200;
var WEBHOOK_REPLAY_WINDOW_SECONDS = 300;
var WEBHOOK_ID_MAX_LENGTH = 128;
var SEARCH_LIMIT = 25;
var ACTIVITY_LIMIT = 50;
var OVERVIEW_PAGE_LIMIT = 8;
var ASSISTANT_QUESTION_MAX_LENGTH = 500;
var ASSISTANT_ANSWER_MAX_LENGTH = 4e3;
var ASSISTANT_HISTORY_TURNS = 6;
var ASSISTANT_DEADLINE_MS = 25e3;
var ASSISTANT_TABLE_LIMIT = 15;
var SEGMENT_NAME_MAX_LENGTH = 120;
var INSTAGRAM_COLD_PRESET = {
  acquisitionSource: "Instagram",
  lastOpen: "cold"
};
var INSTAGRAM_COLD_SEGMENT_NAME = "Instagram subscribers who haven't opened in 30 days";
var ENGAGED_PRESET = {
  status: "active",
  hasWebsite: true,
  hasApp: true
};
var ENGAGED_SEGMENT_NAME = "Most engaged readers";
var JSON_BODY_LIMIT = "16kb";
var DB_POOL_MAX = 2;
var DB_IDLE_TIMEOUT_MS = 3e4;
var DB_CONNECT_TIMEOUT_MS = 1e4;
var SLOW_QUERY_MS = 500;
var RATE_LIMITS = {
  // Allow 10 login attempts every 15 minutes.
  login: {
    windowMs: 15 * 6e4,
    limit: 10
  },
  // Allow 300 general API requests per minute.
  api: {
    windowMs: 6e4,
    limit: 300
  },
  // Allow up to 600 incoming webhook requests per minute.
  webhook: {
    windowMs: 6e4,
    limit: 600
  },
  // Limit assistant requests to reduce excessive LLM usage.
  assistant: {
    windowMs: 6e4,
    limit: 15
  }
};

// src/config/env.ts
import { z } from "zod";
var databaseSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_SSL: z.enum(["require", "no-verify", "disable"]).default("require"),
  // Optional CA certificate path for database TLS verification.
  DATABASE_CA_CERT: z.string().min(1).optional()
});
var serverSchema = databaseSchema.extend({
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z.coerce.number().int().positive().default(DEFAULT_PORT),
  // Secrets used for sessions, authentication, and webhooks.
  SESSION_SECRET: z.string().min(
    SECRET_MIN_LENGTH,
    `SESSION_SECRET must be at least ${SECRET_MIN_LENGTH} characters`
  ),
  WEBHOOK_SECRET: z.string().min(
    SECRET_MIN_LENGTH,
    `WEBHOOK_SECRET must be at least ${SECRET_MIN_LENGTH} characters`
  ),
  WEBHOOK_URL: z.string().url().optional(),
  // Only allow valid HTTP or HTTPS frontend origins.
  CORS_ORIGINS: z.string().min(1, "CORS_ORIGINS is required").refine((value) => {
    const origins = value.split(",").map((origin) => origin.trim());
    return origins.every((origin) => {
      try {
        const url = new URL(origin);
        return ["http:", "https:"].includes(url.protocol) && url.origin === origin;
      } catch {
        return false;
      }
    });
  }, "CORS_ORIGINS must contain valid HTTP or HTTPS origins"),
  // Cookie security and reverse proxy settings.
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]),
  COOKIE_SECURE: z.enum(["true", "false"]).transform((value) => value === "true"),
  TRUST_PROXY: z.enum(["true", "false"]).transform((value) => value === "true"),
  // Gemini is the current LLM provider.
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).default(DEFAULT_GEMINI_MODEL),
  GEMINI_FALLBACK_MODEL: z.string().min(1).default(DEFAULT_GEMINI_FALLBACK_MODEL)
}).superRefine((data, ctx) => {
  if (data.COOKIE_SAMESITE === "none" && !data.COOKIE_SECURE) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["COOKIE_SECURE"],
      message: "COOKIE_SECURE must be true when COOKIE_SAMESITE is none"
    });
  }
  if (data.NODE_ENV === "production" && data.DATABASE_SSL !== "require") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DATABASE_SSL"],
      message: "DATABASE_SSL must be require in production"
    });
  }
});
var cachedServerEnv = null;
function formatIssues(error) {
  return error.issues.map(
    (issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`
  ).join("\n");
}
function getServerEnv() {
  if (cachedServerEnv) return cachedServerEnv;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration:
${formatIssues(parsed.error)}

See .env.example.`
    );
  }
  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}
function getDatabaseEnv() {
  const parsed = databaseSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid database configuration:
${formatIssues(parsed.error)}

See .env.example.`
    );
  }
  if (process.env.NODE_ENV === "production" && parsed.data.DATABASE_SSL !== "require") {
    throw new Error("DATABASE_SSL must be require in production");
  }
  return parsed.data;
}
function corsOrigins(env) {
  return env.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter((origin) => origin.length > 0);
}

// src/lib/errors.ts
var AppError = class extends Error {
  status;
  code;
  details;
  constructor(status, code, message, details) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
};
var badRequest = (message, details) => new AppError(400, "bad_request", message, details);
var unauthorized = (message = "Sign in to continue.") => new AppError(401, "unauthorized", message);
var forbidden = (message = "You do not have access to this.") => new AppError(403, "forbidden", message);
var notFound = (message = "Not found.") => new AppError(404, "not_found", message);
var tooManyRequests = (message) => new AppError(429, "too_many_requests", message);
var serviceUnavailable = (message, details) => new AppError(503, "service_unavailable", message, details);

// src/lib/logger.ts
var REDACTED_KEYS = /* @__PURE__ */ new Set([
  "email",
  "email_normalized",
  "email_original",
  "emails",
  "password",
  "token",
  "authorization",
  "cookie",
  "signature",
  "secret",
  "api_key",
  "apikey",
  "session",
  "question"
]);
var LEVEL_ORDER = { debug: 10, info: 20, warn: 30, error: 40 };
function minimumLevel() {
  const configured = process.env.LOG_LEVEL;
  if (configured === "debug" || configured === "info" || configured === "warn" || configured === "error") {
    return configured;
  }
  return process.env.NODE_ENV === "test" ? "warn" : "info";
}
function redact(value, depth = 0) {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  const output = {};
  for (const [key, nested] of Object.entries(value)) {
    output[key] = REDACTED_KEYS.has(key.toLowerCase()) ? "[redacted]" : redact(nested, depth + 1);
  }
  return output;
}
function emit(level, message, fields) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minimumLevel()]) return;
  const line = JSON.stringify({
    level,
    time: (/* @__PURE__ */ new Date()).toISOString(),
    message,
    ...fields ? redact(fields) : {}
  });
  if (level === "error" || level === "warn") process.stderr.write(`${line}
`);
  else process.stdout.write(`${line}
`);
}
var log = {
  debug: (message, fields) => emit("debug", message, fields),
  info: (message, fields) => emit("info", message, fields),
  warn: (message, fields) => emit("warn", message, fields),
  error: (message, fields) => emit("error", message, fields)
};

// src/middleware/errorHandler.ts
import { ZodError } from "zod";
var notFoundHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: "not_found",
      message: `No route for ${req.method} ${req.path}.`
    }
  });
};
var errorHandler = (error, req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...error.details ? { details: error.details } : {}
      }
    });
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "invalid_request",
        message: "Some fields need fixing.",
        details: error.issues.map((issue) => ({
          field: issue.path.join(".") || "(body)",
          message: issue.message
        }))
      }
    });
    return;
  }
  if (typeof error === "object" && error !== null && error.type === "entity.too.large") {
    res.status(413).json({
      error: {
        code: "payload_too_large",
        message: "That request body is too large."
      }
    });
    return;
  }
  log.error("unhandled error", {
    method: req.method,
    path: req.path,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : void 0
  });
  res.status(500).json({
    error: {
      code: "internal_error",
      message: "Something broke on our side. Please try again."
    }
  });
};

// src/middleware/rateLimit.ts
import rateLimit from "express-rate-limit";
function limiter(windowMs, limit, label, message) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (req, _res, next) => {
      log.warn("rate limit hit", {
        limiter: label,
        method: req.method,
        path: req.path
      });
      next(tooManyRequests(message));
    }
  });
}
function createLimiters() {
  return {
    login: limiter(
      RATE_LIMITS.login.windowMs,
      RATE_LIMITS.login.limit,
      "login",
      "Too many sign-in attempts. Try again in a few minutes."
    ),
    api: limiter(
      RATE_LIMITS.api.windowMs,
      RATE_LIMITS.api.limit,
      "api",
      "Slow down a moment, then try again."
    ),
    webhook: limiter(
      RATE_LIMITS.webhook.windowMs,
      RATE_LIMITS.webhook.limit,
      "webhook",
      "Event rate limit exceeded."
    ),
    assistant: limiter(
      RATE_LIMITS.assistant.windowMs,
      RATE_LIMITS.assistant.limit,
      "assistant",
      "The assistant is busy. Give it a minute."
    )
  };
}

// src/lib/session.ts
import { createHmac, timingSafeEqual } from "node:crypto";
var SESSION_COOKIE = "tpo_session";
function isAccountSession(session) {
  return Boolean(
    session?.email && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(session.sub)
  );
}
function sign(secret, encodedPayload) {
  return createHmac("sha256", secret).update(encodedPayload).digest("hex");
}
function createSessionToken(secret, subject, nowSeconds = Math.floor(Date.now() / 1e3), ttlSeconds = SESSION_TTL_SECONDS, email) {
  const payload = {
    sub: subject,
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
    ...email ? { email } : {}
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(secret, encoded)}`;
}
function verifySessionToken(secret, token, nowSeconds = Math.floor(Date.now() / 1e3)) {
  if (!token) return null;
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;
  const encoded = token.slice(0, separator);
  const provided = Buffer.from(token.slice(separator + 1), "hex");
  const expected = Buffer.from(sign(secret, encoded), "hex");
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload?.sub !== "string" || typeof payload?.exp !== "number") return null;
  if (payload.email !== void 0 && typeof payload.email !== "string") return null;
  if (payload.exp <= nowSeconds) return null;
  return payload;
}

// src/middleware/requireAuth.ts
var requireAuth = (req, _res, next) => {
  const env = getServerEnv();
  const session = verifySessionToken(
    env.SESSION_SECRET,
    req.cookies?.[SESSION_COOKIE]
  );
  if (!isAccountSession(session)) {
    next(unauthorized());
    return;
  }
  req.session = session;
  next();
};

// src/lib/hmac.ts
import { createHmac as createHmac2, timingSafeEqual as timingSafeEqual2 } from "node:crypto";
var SIGNATURE_HEADER = "x-tpo-signature";
var TIMESTAMP_HEADER = "x-tpo-timestamp";
var SIGNATURE_PREFIX = "sha256=";
function signPayload(secret, rawBody, timestamp) {
  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  const digest = createHmac2("sha256", secret).update(`${timestamp}.`).update(body).digest("hex");
  return `${SIGNATURE_PREFIX}${digest}`;
}
function verifySignature(input) {
  const {
    secret,
    rawBody,
    timestamp,
    signature,
    nowSeconds = Math.floor(Date.now() / 1e3),
    windowSeconds = WEBHOOK_REPLAY_WINDOW_SECONDS
  } = input;
  if (!timestamp) return { ok: false, reason: "timestamp_missing" };
  if (!signature) return { ok: false, reason: "signature_missing" };
  if (!/^\d{1,20}$/.test(timestamp)) return { ok: false, reason: "timestamp_malformed" };
  if (Math.abs(nowSeconds - Number(timestamp)) > windowSeconds) {
    return { ok: false, reason: "timestamp_outside_window" };
  }
  if (!signature.startsWith(SIGNATURE_PREFIX)) return { ok: false, reason: "signature_malformed" };
  const provided = Buffer.from(signature.slice(SIGNATURE_PREFIX.length), "hex");
  const expected = Buffer.from(signPayload(secret, rawBody, timestamp).slice(SIGNATURE_PREFIX.length), "hex");
  if (provided.length !== expected.length) return { ok: false, reason: "signature_malformed" };
  if (!timingSafeEqual2(provided, expected)) return { ok: false, reason: "signature_mismatch" };
  return { ok: true };
}

// src/middleware/webhookAuth.ts
var verifyWebhookRequest = (req, _res, next) => {
  const env = getServerEnv();
  const rawBody = Buffer.isBuffer(req.body) ? req.body : null;
  if (!rawBody) {
    next(badRequest("Expected a raw request body."));
    return;
  }
  const result = verifySignature({
    secret: env.WEBHOOK_SECRET,
    rawBody,
    timestamp: req.header(TIMESTAMP_HEADER),
    signature: req.header(SIGNATURE_HEADER)
  });
  if (!result.ok) {
    log.warn("webhook signature rejected", {
      reason: result.reason,
      bytes: rawBody.length
    });
    next(unauthorized("Invalid webhook signature."));
    return;
  }
  req.rawBody = rawBody;
  try {
    req.body = JSON.parse(rawBody.toString("utf8"));
  } catch {
    next(badRequest("Body is not valid JSON."));
    return;
  }
  next();
};

// src/routes/assistant.ts
import { Router } from "express";
import { z as z4 } from "zod";

// src/lib/email.ts
var EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
var EMAIL_MAX_LENGTH = 254;
function normalizeEmail(raw) {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase();
}
function parseEmail(raw) {
  const original = typeof raw === "string" ? raw : "";
  const normalized = normalizeEmail(raw);
  if (normalized.length === 0) return { ok: false, reason: "missing", original };
  if (normalized.length > EMAIL_MAX_LENGTH) return { ok: false, reason: "too_long", original };
  if (!EMAIL_SHAPE.test(normalized)) return { ok: false, reason: "malformed", original };
  return { ok: true, normalized, original };
}

// src/lib/pii.ts
var PiiBlockedError = class extends Error {
  kinds;
  constructor(kinds) {
    super(`Refusing to send ${kinds.join(", ")} to the model.`);
    this.name = "PiiBlockedError";
    this.kinds = kinds;
  }
};
var EMAIL_IN_TEXT = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
var APP_USER_ID = /\bu_[0-9a-f]{6,}\b/i;
var DEVICE_ID = /\bd_[0-9a-f]{4,}\b/i;
var EVENT_ID = /\bevt_[0-9a-f-]{6,}\b/i;
var CAPITALIZED_NAME_PAIR = /\b([A-Z][a-z]{1,20})\s+([A-Z][a-z]{1,20})\b/g;
var NAME_LOOKUP_PAIR = /\b(?:who\s+(?:is|was)|what\s+(?:did|has)|tell\s+me\s+about|look\s+up|find|show\s+me|about|named|called|profile\s+(?:for|of)|activity\s+(?:for|of)|details?\s+(?:for|about)|email\s+(?:for|of)|contact\s+(?:for|of)|subscriber\s+named|user\s+named)\s+([a-z]{2,21}\s+[a-z]{2,21})\b/gi;
var NAME_DETAILS_PAIR = /\b([a-z]{2,21}\s+[a-z]{2,21})(?:'s)?\s+(?:email|profile|activity|opens?|clicks?|subscriber\s+record)\b/gi;
var NAME_STOPWORDS = /* @__PURE__ */ new Set([
  "how",
  "what",
  "which",
  "when",
  "where",
  "why",
  "who",
  "the",
  "this",
  "that",
  "these",
  "those",
  "our",
  "your",
  "instagram",
  "facebook",
  "google",
  "podcast",
  "referral",
  "direct",
  "matching",
  "active",
  "cold",
  "total",
  "share",
  "volume",
  "unsubscribe",
  "unsubscribed",
  "unsub",
  "acquisition",
  "subscribers",
  "subscriber",
  "readers",
  "reader",
  "pages",
  "page",
  "source",
  "sources",
  "status",
  "signup",
  "signups",
  "september",
  "october",
  "august",
  "july",
  "growth",
  "assistant",
  "comparison",
  "takeaways",
  "takeaway",
  "website",
  "newsletter",
  "mobile",
  "most",
  "engaged",
  "first",
  "last",
  "open",
  "opened",
  "new",
  "top",
  "rate",
  "rates",
  "performance",
  "drivers",
  "channel",
  "channels",
  "pour",
  "over",
  "mini",
  "count",
  "counts",
  "traffic",
  "retention",
  "organic",
  "visits",
  "many",
  "went",
  "days",
  "list",
  "build",
  "hit",
  "them",
  "they",
  "their",
  "still",
  "subscribed",
  "are",
  "was",
  "were",
  "been",
  "have",
  "has",
  "had",
  "not",
  "opened",
  "open",
  "for",
  "and",
  "with",
  "from",
  "into",
  "about",
  "than",
  "more",
  "less",
  "each",
  "per",
  "ago",
  "since",
  "just",
  "only",
  "also",
  "all",
  "out",
  "get",
  "got",
  "did",
  "does",
  "can",
  "show",
  "give",
  "make",
  "save",
  "create",
  "break",
  "down",
  "explain",
  "json",
  "numbers",
  "number",
  "invent",
  "use",
  "markdown",
  "allowed",
  "never",
  "write",
  "email",
  "mention",
  "person",
  "people",
  "filters",
  "filter",
  "results",
  "result",
  "already",
  "counted",
  "counts",
  "tool",
  "object",
  "those",
  "these",
  "there",
  "then",
  "that",
  "this",
  "in",
  "on",
  "at",
  "to",
  "by",
  "or",
  "an",
  "be",
  "is",
  "it",
  "as",
  "if",
  "no",
  "so",
  "up",
  "we",
  "us",
  "done",
  "lately",
  "tell",
  "me",
  "please",
  "look",
  "ask",
  "try",
  "one",
  "of",
  "do"
]);
function hasEmail(text) {
  const matches = text.match(EMAIL_IN_TEXT) ?? [];
  return matches.some((raw) => parseEmail(raw.replace(/[.,;:)>\]]+$/, "")).ok);
}
function hasPersonName(text) {
  if (hasCapitalizedPersonName(text)) return true;
  const isNamePair = (pair) => {
    if (!pair) return false;
    const [first, last] = pair.toLowerCase().split(/\s+/);
    return Boolean(first && last && !NAME_STOPWORDS.has(first) && !NAME_STOPWORDS.has(last));
  };
  const standaloneName = text.trim().match(/^([a-z]{2,21}\s+[a-z]{2,21})[.!?]?$/i);
  if (isNamePair(standaloneName?.[1])) return true;
  return [NAME_LOOKUP_PAIR, NAME_DETAILS_PAIR].some(
    (pattern) => [...text.matchAll(pattern)].some((match) => isNamePair(match[1]))
  );
}
function hasCapitalizedPersonName(text) {
  for (const match of text.matchAll(CAPITALIZED_NAME_PAIR)) {
    const first = match[1]?.toLowerCase();
    const last = match[2]?.toLowerCase();
    if (first && last && !NAME_STOPWORDS.has(first) && !NAME_STOPWORDS.has(last)) return true;
  }
  return false;
}
function findPii(text, options = {}) {
  const names = options.names ?? true;
  const kinds = /* @__PURE__ */ new Set();
  if (hasEmail(text)) kinds.add("email");
  if (names && hasPersonName(text)) kinds.add("name");
  if (APP_USER_ID.test(text)) kinds.add("app_user");
  if (DEVICE_ID.test(text)) kinds.add("device");
  if (EVENT_ID.test(text)) kinds.add("event");
  return [...kinds];
}
function containsPii(text, options = {}) {
  return findPii(text, options).length > 0;
}
function assertNoPii(payload) {
  const text = JSON.stringify(payload);
  const kinds = findPii(text);
  if (kinds.length > 0) {
    throw new PiiBlockedError(kinds);
  }
}

// src/lib/dates.ts
var ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function referenceDate() {
  return REFERENCE_DATE;
}
function isIsoDate(value) {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const parsed = /* @__PURE__ */ new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function daysBeforeReference(days) {
  if (!Number.isInteger(days) || days < 0) {
    throw new RangeError(`days must be a non-negative integer, got ${days}`);
  }
  const base = /* @__PURE__ */ new Date(`${REFERENCE_DATE}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() - days);
  return base.toISOString().slice(0, 10);
}
function parseTimestamp(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const csvForm = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(trimmed);
  const candidate = csvForm ? `${csvForm[1]}T${csvForm[2]}Z` : trimmed;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// src/services/assistant/plan.ts
var UNSUPPORTED_ANSWER = "I can answer totals, sources, pages, and saved segments. Try one of the suggested questions.";
function planQuestion(question, history = []) {
  const text = question.trim();
  if (text.length === 0) return { ok: false, reason: "empty" };
  if (findPii(text).length > 0) return { ok: false, reason: "pii" };
  const planned = classify(text, priorDefinition(history));
  if (!planned) return { ok: false, reason: "unsupported" };
  return planned;
}
function priorDefinition(history) {
  let filters;
  for (const turn of history) {
    if (findPii(turn.question).length > 0) continue;
    const planned = classify(turn.question, filters);
    if (planned?.ok && planned.definition) filters = planned.definition;
  }
  return filters;
}
function classify(question, prior) {
  const text = question.toLowerCase();
  if (isFirstPages(text)) {
    return { ok: true, tool: "first_pages_for_new_subscribers", args: {} };
  }
  if (isBreakdown(text)) {
    return { ok: true, tool: "subscriber_breakdown", args: {} };
  }
  if (isTopPages(text)) {
    return { ok: true, tool: "top_pages", args: {} };
  }
  const definition = definitionFrom(text, prior);
  if (isSnapshot(text, definition)) {
    return { ok: true, tool: "get_snapshot", args: {} };
  }
  if (!hasFilter(definition)) return null;
  if (isSave(text)) {
    return {
      ok: true,
      tool: "save_segment",
      args: { name: segmentName(definition), definition },
      definition
    };
  }
  return {
    ok: true,
    tool: "count_segment",
    args: { ...definition },
    definition
  };
}
function isFirstPages(text) {
  return /\bpages?\b/.test(text) && /\b(first|hit)\b/.test(text);
}
function isTopPages(text) {
  return /\btop pages\b/.test(text) || /\bmost viewed\b/.test(text);
}
function isBreakdown(text) {
  return /\bbreak ?down\b/.test(text) || /\bby source\b/.test(text) || /\bunsubscribe rate\b/.test(text) || /\bsource mix\b/.test(text);
}
function isSnapshot(text, definition) {
  if (hasFilter(definition)) return false;
  return /\b(overview|snapshot|headline)\b/.test(text) || /\bhow many\b/.test(text) && /\bsubscribers\b/.test(text);
}
function isSave(text) {
  return /\b(save|build|create)\b/.test(text) && /\b(list|segment)\b/.test(text);
}
function definitionFrom(text, prior) {
  const definition = {};
  if (/\bengaged\b/.test(text)) {
    Object.assign(definition, ENGAGED_PRESET);
  }
  const source = sourceIn(text);
  if (source) definition.acquisitionSource = source;
  if (/\bunsubscrib/.test(text)) {
    definition.status = "unsubscribed";
  } else if (/\bactive\b/.test(text) || /\bstill subscribed\b/.test(text) || /\bsubscribed\b/.test(text)) {
    definition.status = "active";
  }
  if (/\bcold\b|have not opened|haven't opened|havent opened|no open|not opened|inactive/.test(text)) {
    definition.lastOpen = "cold";
  } else if (/\bnever opened\b|\bnever open\b/.test(text)) {
    definition.lastOpen = "never";
  }
  if (/\bwebsite\b/.test(text) && /\bapp\b/.test(text)) {
    definition.hasWebsite = true;
    definition.hasApp = true;
  }
  if (wantsSignupWindow(text)) {
    definition.signupFrom = daysBeforeReference(COLD_WINDOW_DAYS);
    definition.signupTo = REFERENCE_DATE;
  }
  if (/\b(them|those|they|their)\b/.test(text) && prior) {
    definition.acquisitionSource ??= prior.acquisitionSource;
    definition.status ??= prior.status;
    definition.lastOpen ??= prior.lastOpen;
    definition.signupFrom ??= prior.signupFrom;
    definition.signupTo ??= prior.signupTo;
    if (definition.hasWebsite === void 0) {
      definition.hasWebsite = prior.hasWebsite;
    }
    if (definition.hasApp === void 0) {
      definition.hasApp = prior.hasApp;
    }
  }
  return definition;
}
function wantsSignupWindow(text) {
  if (/\bpages?\b/.test(text)) return false;
  return /\b(signed up|sign-?up date|signups since|joined)\b/.test(text);
}
function sourceIn(text) {
  if (/\btwitter\b/.test(text)) return "X";
  return ACQUISITION_SOURCES.find(
    (source) => new RegExp(`\\b${source}\\b`, "i").test(text)
  );
}
function hasFilter(definition) {
  return Object.values(definition).some((value) => value !== void 0);
}
function segmentName(definition) {
  if (definition.status === ENGAGED_PRESET.status && definition.hasWebsite === true && definition.hasApp === true && !definition.acquisitionSource && !definition.lastOpen) {
    return ENGAGED_SEGMENT_NAME;
  }
  if (definition.acquisitionSource === "Instagram" && definition.lastOpen === "cold" && !definition.signupFrom && !definition.status) {
    return INSTAGRAM_COLD_SEGMENT_NAME;
  }
  return [
    definition.acquisitionSource,
    definition.status,
    definition.lastOpen === "cold" ? "cold" : void 0
  ].filter(Boolean).join(", ");
}

// src/services/assistant/tools.ts
import { z as z3 } from "zod";

// src/services/segments.ts
import { z as z2 } from "zod";

// src/lib/db.ts
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

// src/lib/bundled-ca.ts
var BUNDLED_CA = "-----BEGIN CERTIFICATE-----\nMIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL\nBQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l\ndyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh\nc2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow\nazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD\nYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug\nUm9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW\nQyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q\nDmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2\nGtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi\ncvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4\nO4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt\nNaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX\nuXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt\naUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU\ntVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b\nVW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6\njB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx\nCea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2\nCMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P\no/bKiIz+Fq8=\n-----END CERTIFICATE-----\n";

// src/lib/db.ts
var pool = null;
function readCaCertificate(relativePath) {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "../../..", relativePath),
    resolve(here, relativePath),
    resolve(process.cwd(), relativePath),
    resolve(process.cwd(), "..", relativePath)
  ];
  const found = candidates.find((path) => existsSync(path));
  if (found) return readFileSync(found, "utf8");
  if (BUNDLED_CA) return BUNDLED_CA;
  throw new Error(`Database CA certificate was not found (${relativePath}).`);
}
function sslConfig(env) {
  switch (env.DATABASE_SSL) {
    case "disable":
      return false;
    case "no-verify":
      log.warn("database TLS certificate verification is disabled");
      return { rejectUnauthorized: false };
    case "require": {
      if (!env.DATABASE_CA_CERT) return { rejectUnauthorized: true };
      return {
        rejectUnauthorized: true,
        ca: readCaCertificate(env.DATABASE_CA_CERT)
      };
    }
  }
}
function getPool() {
  if (pool) return pool;
  const env = getDatabaseEnv();
  pool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl: sslConfig(env),
    max: DB_POOL_MAX,
    idleTimeoutMillis: DB_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: DB_CONNECT_TIMEOUT_MS
  });
  pool.on("error", (error) => {
    log.error("idle database client error", { error: error.message });
  });
  return pool;
}
async function query(text, params = []) {
  const started = Date.now();
  const result = await getPool().query(text, params);
  const elapsed = Date.now() - started;
  if (elapsed > SLOW_QUERY_MS) log.warn("slow query", { elapsed_ms: elapsed, rows: result.rowCount });
  return result.rows;
}
async function queryOne(text, params = []) {
  const rows = await query(text, params);
  return rows[0] ?? null;
}
async function withTransaction(work) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch (rollbackError) {
      log.error("rollback failed", { error: rollbackError.message });
    }
    throw error;
  } finally {
    client.release();
  }
}

// src/services/subscribers.ts
function isoDate(value) {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}
function isoTime(value) {
  return value.toISOString();
}
function subscriberHitFromRow(row) {
  return {
    id: row.id,
    email: row.email_original,
    status: row.status,
    acquisitionSource: row.acquisition_source,
    signupDate: isoDate(row.signup_date),
    lastOpenDate: isoDate(row.last_open_date)
  };
}
async function searchSubscribers(rawQuery, options = {}) {
  const needle = normalizeEmail(rawQuery);
  const limit = options.limit ?? SEARCH_LIMIT;
  const offset = options.offset ?? 0;
  const rows = await query(
    `
    select id, email_original, email_normalized, status, acquisition_source, signup_date, last_open_date,
           count(*) over() as total
    from subscribers
    where position($1 in email_normalized) > 0
       or position($1 in lower(email_original)) > 0
    order by
      case
        when email_normalized = $1 then 0
        when starts_with(email_normalized, $1) then 1
        else 2
      end,
      email_normalized
    limit $2
    offset $3
    `,
    [needle, limit, offset]
  );
  return {
    results: rows.map(subscriberHitFromRow),
    total: Number(rows[0]?.total ?? 0),
    limit,
    offset
  };
}
async function getSubscriberProfile(id2) {
  const row = await queryOne(
    `
    select id, email_original, email_normalized, status, acquisition_source, signup_date, last_open_date
    from subscribers
    where id = $1
    `,
    [id2]
  );
  if (!row) return null;
  const [visits, accounts, events] = await Promise.all([
    query(
      `
      select e.visitor_id, e.page, e.occurred_at, e.utm_source, e.channel, e.email_captured
      from web_events e
      join web_visitors v on v.visitor_id = e.visitor_id
      where v.subscriber_id = $1
      order by e.occurred_at desc
      limit $2
      `,
      [id2, ACTIVITY_LIMIT]
    ),
    query(
      `
      select user_id, email_original, created_date, origin
      from app_users
      where subscriber_id = $1
      order by user_id
      `,
      [id2]
    ),
    query(
      `
      select event_id, event, device_id, occurred_at, received_at, properties, resolved_user_id
      from app_events
      where resolved_user_id in (select user_id from app_users where subscriber_id = $1)
      order by occurred_at desc
      limit $2
      `,
      [id2, ACTIVITY_LIMIT]
    )
  ]);
  const visitorIds = new Set(visits.map((visit) => visit.visitor_id));
  return {
    subscriber: { ...subscriberHitFromRow(row), emailNormalized: row.email_normalized },
    website: {
      visitors: visitorIds.size,
      pageviews: visits.map((visit) => ({
        visitorId: visit.visitor_id,
        page: visit.page,
        occurredAt: isoTime(visit.occurred_at),
        utmSource: visit.utm_source,
        channel: visit.channel,
        emailCaptured: visit.email_captured
      }))
    },
    app: {
      accounts: accounts.map((account) => ({
        userId: account.user_id,
        email: account.email_original,
        createdDate: isoDate(account.created_date),
        origin: account.origin
      })),
      events: events.map((event) => ({
        eventId: event.event_id,
        event: event.event,
        deviceId: event.device_id,
        occurredAt: isoTime(event.occurred_at),
        receivedAt: isoTime(event.received_at),
        properties: event.properties,
        userId: event.resolved_user_id
      }))
    }
  };
}

// src/services/segments.ts
var LAST_OPEN_FILTERS = ["any", "never", "cold"];
var isoDate2 = z2.string().refine(isIsoDate, "Use an ISO date (YYYY-MM-DD).");
var segmentDefinitionSchema = z2.object({
  acquisitionSource: z2.enum(ACQUISITION_SOURCES).optional(),
  status: z2.enum(SUBSCRIBER_STATUSES).optional(),
  signupFrom: isoDate2.optional(),
  signupTo: isoDate2.optional(),
  lastOpen: z2.enum(LAST_OPEN_FILTERS).optional(),
  hasWebsite: z2.boolean().optional(),
  hasApp: z2.boolean().optional()
});
function buildWhere(definition) {
  const conditions = ["true"];
  const params = [];
  if (definition.acquisitionSource) {
    params.push(definition.acquisitionSource);
    conditions.push(`s.acquisition_source = $${params.length}`);
  }
  if (definition.status) {
    params.push(definition.status);
    conditions.push(`s.status = $${params.length}`);
  }
  if (definition.signupFrom) {
    params.push(definition.signupFrom);
    conditions.push(`s.signup_date >= $${params.length}::date`);
  }
  if (definition.signupTo) {
    params.push(definition.signupTo);
    conditions.push(`s.signup_date <= $${params.length}::date`);
  }
  if (definition.lastOpen === "never") {
    conditions.push("s.last_open_date is null");
  } else if (definition.lastOpen === "cold") {
    params.push(daysBeforeReference(COLD_WINDOW_DAYS));
    conditions.push(`(s.last_open_date is null or s.last_open_date < $${params.length}::date)`);
  }
  if (definition.hasWebsite === true) {
    conditions.push("exists (select 1 from web_visitors v where v.subscriber_id = s.id)");
  } else if (definition.hasWebsite === false) {
    conditions.push("not exists (select 1 from web_visitors v where v.subscriber_id = s.id)");
  }
  if (definition.hasApp === true) {
    conditions.push("exists (select 1 from app_users a where a.subscriber_id = s.id)");
  } else if (definition.hasApp === false) {
    conditions.push("not exists (select 1 from app_users a where a.subscriber_id = s.id)");
  }
  return { sql: conditions.join(" and "), params };
}
async function previewSegment(definition, options = {}) {
  const limit = options.limit ?? SEARCH_LIMIT;
  const offset = options.offset ?? 0;
  const { sql, params } = buildWhere(definition);
  const rows = await query(
    `
    select s.id, s.email_original, s.email_normalized, s.status, s.acquisition_source, s.signup_date, s.last_open_date,
           count(*) over() as total
    from subscribers s
    where ${sql}
    order by s.email_normalized
    limit $${params.length + 1}
    offset $${params.length + 2}
    `,
    [...params, limit, offset]
  );
  return {
    results: rows.map(subscriberHitFromRow),
    total: Number(rows[0]?.total ?? 0),
    limit,
    offset,
    cutoffDate: daysBeforeReference(COLD_WINDOW_DAYS)
  };
}
async function countSegment(definition) {
  const { sql, params } = buildWhere(definition);
  const row = await queryOne(`select count(*) as total from subscribers s where ${sql}`, params);
  return {
    total: Number(row?.total ?? 0),
    cutoffDate: daysBeforeReference(COLD_WINDOW_DAYS)
  };
}
async function listSegments() {
  const rows = await query(
    `
    select id, name, definition, created_at
    from segments
    order by created_at desc
    `
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    definition: row.definition,
    createdAt: row.created_at.toISOString()
  }));
}
async function saveSegment(name, definition, createdBy) {
  const payload = JSON.stringify(definition);
  const row = await withTransaction(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext(lower($1)))", [name]);
    const existing = await client.query(
      `update segments set name = $1, definition = $2::jsonb
       where lower(name) = lower($1)
       returning id, name, definition, created_at`,
      [name, payload]
    );
    if (existing.rows[0]) return existing.rows[0];
    const inserted = await client.query(
      `insert into segments (name, definition, created_by)
       values ($1, $2::jsonb, $3)
       returning id, name, definition, created_at`,
      [name, payload, createdBy]
    );
    return inserted.rows[0];
  });
  if (!row) throw new Error("Segment save returned no row.");
  return {
    id: row.id,
    name: row.name,
    definition: row.definition,
    createdAt: row.created_at.toISOString()
  };
}
async function deleteSegment(id2) {
  const row = await queryOne("delete from segments where id = $1 returning id", [id2]);
  return Boolean(row);
}

// src/services/overview.ts
async function getOverview() {
  const cutoff = daysBeforeReference(COLD_WINDOW_DAYS);
  const [rows, sources, pages, lastImports, instagramCold, instagramColdActive, engaged] = await Promise.all([
    query(
      `
      select
        (select count(*) from subscribers)                                        as subscribers,
        (select count(*) from subscribers where status = 'active')                as active,
        (select count(*) from subscribers where status = 'unsubscribed')          as unsubscribed,
        (select count(*) from subscribers where last_open_date is null)           as never_opened,
        (select count(*) from subscribers
          where last_open_date is null or last_open_date < $1::date)              as cold,
        (select count(*) from app_users)                                          as app_accounts,
        (select count(*) from app_users where subscriber_id is not null)           as app_linked,
        (select count(*) from app_events)                                          as app_events,
        (select count(*) from web_visitors)                                        as visitors,
        (select count(*) from web_visitors where subscriber_id is not null)        as visitors_identified,
        (select count(*) from web_events)                                          as pageviews
      `,
      [cutoff]
    ),
    loadSourceMix(),
    loadTopPages(OVERVIEW_PAGE_LIMIT),
    getLastImports(),
    countSegment({ ...INSTAGRAM_COLD_PRESET }),
    countSegment({ ...INSTAGRAM_COLD_PRESET, status: "active" }),
    countSegment({ ...ENGAGED_PRESET })
  ]);
  const row = rows[0];
  const number = (value) => Number(value ?? 0);
  const accounts = number(row?.app_accounts);
  const linked = number(row?.app_linked);
  const visitors = number(row?.visitors);
  const identified = number(row?.visitors_identified);
  return {
    referenceDate: referenceDate(),
    coldWindowDays: COLD_WINDOW_DAYS,
    subscribers: {
      total: number(row?.subscribers),
      active: number(row?.active),
      unsubscribed: number(row?.unsubscribed),
      neverOpened: number(row?.never_opened),
      coldSinceCutoff: number(row?.cold)
    },
    app: {
      accounts,
      linkedToSubscriber: linked,
      withoutSubscriber: accounts - linked,
      events: number(row?.app_events)
    },
    web: {
      visitors,
      identified,
      anonymous: visitors - identified,
      pageviews: number(row?.pageviews)
    },
    sources,
    pages,
    lists: {
      instagramCold: instagramCold.total,
      instagramColdActive: instagramColdActive.total,
      engaged: engaged.total
    },
    lastImports
  };
}
async function loadSourceMix() {
  const rows = await query(
    `
    select acquisition_source as source, status, count(*) as count
    from subscribers
    group by acquisition_source, status
    order by count(*) desc, acquisition_source
    `
  );
  const bySource = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const source = row.source ?? "(none)";
    const current = bySource.get(source) ?? { active: 0, unsubscribed: 0 };
    if (row.status === "unsubscribed") current.unsubscribed += Number(row.count);
    else current.active += Number(row.count);
    bySource.set(source, current);
  }
  const grouped = [...bySource.entries()].map(([source, counts]) => ({
    source,
    total: counts.active + counts.unsubscribed,
    active: counts.active,
    unsubscribed: counts.unsubscribed
  }));
  grouped.sort((left, right) => right.total - left.total || left.source.localeCompare(right.source));
  const all = grouped.reduce((sum, row) => sum + row.total, 0);
  return grouped.map((row) => ({
    ...row,
    unsubRate: percent(row.unsubscribed, row.total),
    share: percent(row.total, all)
  }));
}
async function loadTopPages(limit) {
  const rows = await query(
    `
    select page, count(*) as views
    from web_events
    group by page
    order by count(*) desc, page
    limit $1
    `,
    [limit]
  );
  return rows.map((row) => ({ page: row.page, views: Number(row.views) }));
}
function percent(part, whole) {
  if (whole <= 0) return 0;
  return Math.round(part / whole * 100);
}
async function getLastImports() {
  const rows = await query(`
    select distinct on (source)
      source, status, rows_read, rows_inserted, rows_merged, rows_skipped,
      skip_reasons, warnings, finished_at
    from import_runs
    order by source, started_at desc
  `);
  return rows.map((row) => ({
    source: row.source,
    status: row.status,
    rowsRead: row.rows_read,
    rowsInserted: row.rows_inserted,
    rowsMerged: row.rows_merged,
    rowsSkipped: row.rows_skipped,
    skipReasons: row.skip_reasons,
    warnings: row.warnings,
    finishedAt: row.finished_at?.toISOString() ?? null
  }));
}

// src/services/assistant/analytics.ts
async function snapshotCounts() {
  const overview = await getOverview();
  return {
    referenceDate: overview.referenceDate,
    coldWindowDays: overview.coldWindowDays,
    subscribers: overview.subscribers.total,
    active: overview.subscribers.active,
    unsubscribed: overview.subscribers.unsubscribed,
    neverOpened: overview.subscribers.neverOpened,
    coldSinceCutoff: overview.subscribers.coldSinceCutoff,
    instagramCold: overview.lists.instagramCold,
    instagramColdActive: overview.lists.instagramColdActive,
    appAccounts: overview.app.accounts,
    appLinked: overview.app.linkedToSubscriber,
    appEvents: overview.app.events,
    webVisitors: overview.web.visitors,
    webIdentified: overview.web.identified,
    pageviews: overview.web.pageviews
  };
}
async function subscriberBreakdown() {
  const rows = await loadSourceMix();
  return {
    title: "Subscribers by source",
    rows: rows.map((row) => ({
      source: row.source,
      total: row.total,
      active: row.active,
      unsubscribed: row.unsubscribed,
      unsubRate: `${row.unsubRate}%`,
      share: `${row.share}%`
    }))
  };
}
async function topPages(limit = ASSISTANT_TABLE_LIMIT) {
  const rows = await loadTopPages(limit);
  return {
    title: "Top pages",
    rows: rows.map((row) => ({ page: row.page, views: row.views }))
  };
}
async function firstPagesForNewSubscribers(days = COLD_WINDOW_DAYS, limit = ASSISTANT_TABLE_LIMIT) {
  const from = daysBeforeReference(days);
  const rows = await query(
    `
    with first_hit as (
      select distinct on (v.subscriber_id) e.page
      from web_events e
      join web_visitors v on v.visitor_id = e.visitor_id
      join subscribers s on s.id = v.subscriber_id
      where s.signup_date is not null
        and s.signup_date >= $1::date
        and e.occurred_at >= s.signup_date::timestamptz
      order by v.subscriber_id, e.occurred_at
    )
    select page, count(*) as readers
    from first_hit
    group by page
    order by count(*) desc, page
    limit $2
    `,
    [from, limit]
  );
  return {
    title: `First pages for people who signed up since ${from}`,
    rows: rows.map((row) => ({ page: row.page, readers: Number(row.readers) }))
  };
}

// src/services/assistant/tools.ts
var limitSchema = z3.number().int().min(1).max(ASSISTANT_TABLE_LIMIT).optional();
var saveSchema = z3.object({
  name: z3.string().trim().min(1).max(SEGMENT_NAME_MAX_LENGTH),
  definition: segmentDefinitionSchema
});
var firstPagesSchema = z3.object({
  days: z3.number().int().min(1).max(365).optional(),
  limit: limitSchema
});
var SEGMENT_FILTER_PROPERTIES = {
  acquisitionSource: {
    type: "string",
    description: "Use one of these sources: Direct, Facebook, Google, Instagram, Podcast, Referral, or X."
  },
  status: {
    type: "string",
    description: "Subscriber status: active or unsubscribed."
  },
  signupFrom: {
    type: "string",
    description: "Only use this when asking about signup dates. Format: YYYY-MM-DD."
  },
  signupTo: {
    type: "string",
    description: "Only use this when asking about signup dates. Format: YYYY-MM-DD."
  },
  lastOpen: {
    type: "string",
    enum: ["any", "never", "cold"],
    description: "Cold means no newsletter open in the past 30 days. It is not based on signup date."
  },
  hasWebsite: { type: "boolean" },
  hasApp: { type: "boolean" }
};
var TOOL_DECLARATIONS = [
  {
    name: "get_snapshot",
    description: "Overall subscriber, website, and app counts. Also includes Instagram subscribers who have not opened recently.",
    parametersJsonSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "subscriber_breakdown",
    description: "Show subscribers by acquisition source, including active and unsubscribed counts, unsubscribe rates, and share of the total. Largest sources come first.",
    parametersJsonSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "top_pages",
    description: "Show the most visited website pages and their view counts.",
    parametersJsonSchema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: ASSISTANT_TABLE_LIMIT } },
      additionalProperties: false
    }
  },
  {
    name: "first_pages_for_new_subscribers",
    description: "Count which pages subscribers visited first after signing up. The number of days is measured back from the assessment date.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        days: { type: "integer", minimum: 1, maximum: 365 },
        limit: { type: "integer", minimum: 1, maximum: ASSISTANT_TABLE_LIMIT }
      },
      additionalProperties: false
    }
  },
  {
    name: "count_segment",
    description: "Count subscribers who match the chosen filters. Cold refers to the last newsletter open, not signup date. Return the count, not individual subscribers.",
    parametersJsonSchema: {
      type: "object",
      properties: SEGMENT_FILTER_PROPERTIES,
      additionalProperties: false
    }
  },
  {
    name: "save_segment",
    description: "Save a named group of subscribers so it can be viewed in the app. Return the group size without sharing email addresses.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        definition: {
          type: "object",
          properties: SEGMENT_FILTER_PROPERTIES,
          additionalProperties: false
        }
      },
      required: ["name", "definition"],
      additionalProperties: false
    }
  }
];
async function runTool(name, args, createdBy) {
  try {
    const result = await execute(name, args ?? {}, createdBy);
    assertNoPii(result.data);
    if (result.table) assertNoPii(result.table);
    if (result.segment) assertNoPii({ ...result.segment, id: void 0 });
    return result;
  } catch (error) {
    if (error instanceof PiiBlockedError) throw error;
    return { ok: false, error: error instanceof Error ? error.message : "That tool failed." };
  }
}
async function execute(name, args, createdBy) {
  switch (name) {
    case "get_snapshot": {
      const data = await snapshotCounts();
      return { ok: true, data };
    }
    case "subscriber_breakdown": {
      const table = await subscriberBreakdown();
      return {
        ok: true,
        data: { largest: table.rows[0]?.source, rows: table.rows },
        table
      };
    }
    case "top_pages": {
      const { limit } = z3.object({ limit: limitSchema }).parse(args);
      const table = await topPages(limit ?? ASSISTANT_TABLE_LIMIT);
      return { ok: true, data: { rows: table.rows }, table };
    }
    case "first_pages_for_new_subscribers": {
      const { days, limit } = firstPagesSchema.parse(args);
      const table = await firstPagesForNewSubscribers(days ?? COLD_WINDOW_DAYS, limit ?? ASSISTANT_TABLE_LIMIT);
      return { ok: true, data: { rows: table.rows }, table };
    }
    case "count_segment": {
      const definition = segmentDefinitionSchema.parse(normalizeFilters(args));
      const counted = await countSegment(definition);
      return {
        ok: true,
        data: { ...counted, ...definition },
        table: matchingTable(definition, counted)
      };
    }
    case "save_segment": {
      const { name: segmentName2, definition } = parseSave(args);
      return saveNamedSegment(segmentName2, definition, createdBy);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
async function saveNamedSegment(name, definition, createdBy) {
  if (containsPii(name)) throw new PiiBlockedError(findPii(name));
  const counted = await countSegment(definition);
  const saved = await saveSegment(name, definition, createdBy);
  return {
    ok: true,
    data: { name: saved.name, total: counted.total, cutoffDate: counted.cutoffDate, ...definition },
    segment: {
      id: saved.id,
      name: saved.name,
      total: counted.total,
      cutoffDate: counted.cutoffDate,
      definition
    }
  };
}
function parseSave(args) {
  const nested = args.definition;
  const raw = nested && typeof nested === "object" && !Array.isArray(nested) ? nested : args;
  return saveSchema.parse({ name: args.name, definition: normalizeFilters(raw) });
}
function normalizeFilters(args) {
  const next = { ...args };
  if (typeof next.acquisitionSource === "string") {
    const requested = next.acquisitionSource;
    const match = ACQUISITION_SOURCES.find((source) => source.toLowerCase() === requested.toLowerCase());
    if (match) next.acquisitionSource = match;
  }
  if (typeof next.status === "string") {
    const requested = next.status;
    const match = SUBSCRIBER_STATUSES.find((status) => status.toLowerCase() === requested.toLowerCase());
    if (match) next.status = match;
  }
  return next;
}
function matchingTable(definition, counted) {
  const row = { total: counted.total };
  if (definition.acquisitionSource) row.source = definition.acquisitionSource;
  if (definition.status) row.status = definition.status;
  if (definition.lastOpen && definition.lastOpen !== "any") row.lastOpen = definition.lastOpen;
  if (definition.signupFrom) row.signupFrom = definition.signupFrom;
  row.cutoff = counted.cutoffDate;
  const title = [definition.acquisitionSource, definition.status, definition.lastOpen === "cold" ? "cold" : void 0].filter(Boolean).join(", ");
  return { title: title || "Matching subscribers", rows: [row] };
}

// src/services/assistant/ask.ts
var PII_REFUSAL = "I can't look up a specific person. Ask about totals, sources, pages, or a segment.";
var FILTER_KEYS = [
  "acquisitionSource",
  "status",
  "signupFrom",
  "signupTo",
  "lastOpen",
  "hasWebsite",
  "hasApp"
];
var ROW_KEYS = [
  "source",
  "total",
  "active",
  "unsubscribed",
  "unsubRate",
  "share",
  "page",
  "views",
  "readers",
  "status",
  "lastOpen",
  "signupFrom",
  "signupTo",
  "cutoff"
];
var SNAPSHOT_KEYS = [
  "referenceDate",
  "coldWindowDays",
  "subscribers",
  "active",
  "unsubscribed",
  "neverOpened",
  "coldSinceCutoff",
  "instagramCold",
  "instagramColdActive",
  "appAccounts",
  "appLinked",
  "appEvents",
  "webVisitors",
  "webIdentified",
  "pageviews"
];
function systemInstruction() {
  return [
    "Explain the JSON counts.",
    "Use only those numbers. Do not invent counts.",
    "Cold is last open, not signup date.",
    "Never write an email or a person.",
    "Markdown is allowed."
  ].join(" ");
}
function plainAnswer(text) {
  return text.replace(/\n{3,}/g, "\n\n").trim().slice(0, ASSISTANT_ANSWER_MAX_LENGTH);
}
function narrationSummary(tool, result) {
  const summary = { tool };
  if (tool === "get_snapshot") {
    for (const key of SNAPSHOT_KEYS) {
      const value = result.data[key];
      if (typeof value === "number" || typeof value === "string") summary[key] = value;
    }
  } else {
    const filters = {};
    for (const key of FILTER_KEYS) {
      const value = result.data[key];
      if (typeof value === "string" || typeof value === "boolean") filters[key] = value;
    }
    if (Object.keys(filters).length > 0) summary.filters = filters;
    if (typeof result.data.total === "number") summary.total = result.data.total;
    if (typeof result.data.cutoffDate === "string") summary.cutoffDate = result.data.cutoffDate;
  }
  if (result.table) {
    summary.rows = result.table.rows.map((row) => {
      const clean = {};
      for (const key of ROW_KEYS) {
        const value = row[key];
        if (typeof value === "string" || typeof value === "number") clean[key] = value;
      }
      return clean;
    });
  }
  return summary;
}
function narrationContents(summary) {
  return [{ role: "user", parts: [{ text: JSON.stringify(summary) }] }];
}
function countedSentence(summary) {
  if (typeof summary.total === "number") return `${summary.total.toLocaleString("en-US")}.`;
  return "Here is what I found.";
}
async function ask(question, options) {
  const plan = planQuestion(question, options.history ?? []);
  if (!plan.ok) {
    log.info("assistant question blocked", { reason: plan.reason });
    return {
      answer: plan.reason === "pii" ? PII_REFUSAL : plan.reason === "empty" ? "Ask a question about totals, pages, or segments." : UNSUPPORTED_ANSWER,
      blocked: plan.reason === "pii",
      tables: []
    };
  }
  try {
    const result = await runTool(plan.tool, plan.args, options.createdBy);
    if (!result.ok) return { answer: "I could not answer that from the data.", blocked: false, tables: [] };
    const summary = narrationSummary(plan.tool, result);
    const contents = narrationContents(summary);
    assertNoPii(summary);
    assertNoPii(contents);
    assertNoPii(systemInstruction());
    let turn;
    try {
      turn = await options.gemini.generate({
        model: options.model,
        systemInstruction: systemInstruction(),
        contents,
        includeTools: false,
        timeoutMs: ASSISTANT_DEADLINE_MS
      });
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      log.warn("assistant narration failed", { error: error.message });
      return {
        answer: countedSentence(summary),
        blocked: false,
        tables: result.table ? [result.table] : [],
        segment: result.segment
      };
    }
    const answer = plainAnswer(turn.text || "");
    if (!answer) {
      log.info("assistant answer blocked", { reason: "empty" });
      return { answer: PII_REFUSAL, blocked: true, tables: [] };
    }
    if (containsPii(answer)) {
      const kinds = findPii(answer);
      if (kinds.some((kind) => kind !== "name") || hasCapitalizedPersonName(answer)) {
        log.info("assistant answer blocked", { reason: "pii" });
        return { answer: PII_REFUSAL, blocked: true, tables: [] };
      }
      log.info("assistant answer replaced", { reason: "ambiguous_name_match" });
      return {
        answer: countedSentence(summary),
        blocked: false,
        tables: result.table ? [result.table] : [],
        segment: result.segment
      };
    }
    return {
      answer,
      blocked: false,
      tables: result.table ? [result.table] : [],
      segment: result.segment
    };
  } catch (error) {
    if (error instanceof PiiBlockedError) {
      log.info("assistant payload blocked", { kinds: error.kinds });
      return { answer: PII_REFUSAL, blocked: true, tables: [] };
    }
    throw error;
  }
}

// src/services/assistant/llm.ts
import {
  createPartFromFunctionResponse,
  GoogleGenAI
} from "@google/genai";
var MODEL_ATTEMPT_MS = 12e3;
function createGemini(apiKey, fallbackModel) {
  const ai = new GoogleGenAI({ apiKey });
  return {
    async generate(request) {
      const budget = Math.max(1e3, request.timeoutMs ?? ASSISTANT_DEADLINE_MS);
      const canFallback = Boolean(fallbackModel && fallbackModel !== request.model);
      const primaryMs = canFallback ? Math.min(MODEL_ATTEMPT_MS, budget) : budget;
      try {
        return await callModel(ai, { ...request, timeoutMs: primaryMs }, request.model);
      } catch (error) {
        const remaining = budget - primaryMs;
        if (canFallback && shouldTryFallback(error) && remaining >= 1e3) {
          log.warn("gemini primary failed, trying fallback", { model: fallbackModel });
          try {
            return await callModel(
              ai,
              { ...request, timeoutMs: Math.min(MODEL_ATTEMPT_MS, remaining) },
              fallbackModel
            );
          } catch (fallbackError) {
            throw unavailable(fallbackError);
          }
        }
        throw unavailable(error);
      }
    }
  };
}
function isGeminiCapacityError(error) {
  const status = error.status;
  const text = error instanceof Error ? error.message : String(error);
  if (status === 429 || status === 503) return true;
  return /429|503|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|rate.?limit|overloaded|try again later/i.test(
    text
  );
}
function isGeminiTimeoutError(error) {
  const name = error instanceof Error ? error.name : "";
  const text = error instanceof Error ? error.message : String(error);
  if (name === "TimeoutError" || name === "AbortError") return true;
  return /operation was aborted|aborted due to timeout/i.test(text);
}
function shouldTryFallback(error) {
  return isGeminiCapacityError(error) || isGeminiTimeoutError(error);
}
async function callModel(ai, request, model) {
  const timeoutMs = Math.max(1e3, request.timeoutMs ?? ASSISTANT_DEADLINE_MS);
  const response = await ai.models.generateContent({
    model,
    contents: request.contents,
    config: {
      systemInstruction: request.systemInstruction,
      ...request.includeTools === false ? {} : { tools: [{ functionDeclarations: [...TOOL_DECLARATIONS] }] },
      automaticFunctionCalling: { disable: true },
      abortSignal: AbortSignal.timeout(timeoutMs)
    }
  });
  const modelContent = response.candidates?.[0]?.content;
  const parts = modelContent?.parts ?? [];
  const functionCalls = parts.map((part) => part.functionCall).filter((call) => Boolean(call?.name));
  if (functionCalls.length > 0) {
    return { functionCalls, modelContent };
  }
  const text = parts.filter((part) => !part.thought).map((part) => part.text).filter((value) => Boolean(value)).join("").trim();
  return { text, modelContent };
}
function unavailable(error) {
  const text = error instanceof Error ? error.message : String(error);
  log.warn("gemini request failed", { error: text });
  if (isGeminiTimeoutError(error)) {
    return serviceUnavailable("The assistant took too long. Try again.");
  }
  if (isGeminiCapacityError(error)) {
    return serviceUnavailable("The assistant is busy. Try again in a minute.");
  }
  return serviceUnavailable("The assistant could not answer just now.");
}

// src/routes/assistant.ts
var bodySchema = z4.object({
  question: z4.string().trim().min(1, "Ask a question.").max(ASSISTANT_QUESTION_MAX_LENGTH),
  history: z4.array(
    z4.object({
      question: z4.string().trim().min(1).max(ASSISTANT_QUESTION_MAX_LENGTH),
      answer: z4.string().trim().min(1).max(ASSISTANT_ANSWER_MAX_LENGTH)
    })
  ).max(ASSISTANT_HISTORY_TURNS).optional()
});
function assistantRouter(limiters) {
  const router = Router();
  router.get("/", (_req, res) => {
    res.json({ available: Boolean(getServerEnv().GEMINI_API_KEY) });
  });
  router.post("/", limiters.assistant, async (req, res) => {
    const { question, history } = bodySchema.parse(req.body);
    const planned = planQuestion(question, history);
    if (!planned.ok) {
      res.json({
        answer: planned.reason === "pii" ? PII_REFUSAL : planned.reason === "empty" ? "Ask a question about totals, pages, or segments." : UNSUPPORTED_ANSWER,
        blocked: planned.reason === "pii",
        tables: []
      });
      return;
    }
    const env = getServerEnv();
    if (!env.GEMINI_API_KEY) {
      throw serviceUnavailable("The assistant is not configured on this server.");
    }
    const createdBy = req.session?.sub ?? "unknown";
    const result = await ask(question, {
      gemini: createGemini(env.GEMINI_API_KEY, env.GEMINI_FALLBACK_MODEL),
      model: env.GEMINI_MODEL,
      createdBy,
      history
    });
    res.json(result);
  });
  return router;
}

// src/routes/auth.ts
import { Router as Router2 } from "express";
import { z as z5 } from "zod";

// src/lib/password.ts
import { randomBytes, scrypt as scryptCallback, timingSafeEqual as timingSafeEqual3 } from "node:crypto";
import { promisify } from "node:util";
var scrypt = promisify(scryptCallback);
var SALT_BYTES = 16;
var KEY_BYTES = 64;
async function hashPassword(password) {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, KEY_BYTES);
  return `scrypt:${salt.toString("hex")}:${key.toString("hex")}`;
}
async function verifyPassword(password, stored) {
  const [scheme, saltHex, keyHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  if (expected.length !== KEY_BYTES) return false;
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), KEY_BYTES);
  return timingSafeEqual3(actual, expected);
}

// src/services/authAccounts.ts
async function findAuthAccountByEmail(email) {
  const rows = await query(
    `select id, email_original, email_normalized, password_hash
     from auth_accounts where email_normalized = $1`,
    [normalizeEmail(email)]
  );
  const row = rows[0];
  return row ? {
    id: row.id,
    email: row.email_original,
    emailNormalized: row.email_normalized,
    passwordHash: row.password_hash
  } : null;
}

// src/routes/auth.ts
var loginSchema = z5.object({
  email: z5.string().trim().email().max(254),
  password: z5.string().min(1, "Enter the password.").max(PASSWORD_MAX_LENGTH)
});
var dummyPasswordHash = hashPassword("nonexistent-account password");
function cookieOptions() {
  const env = getServerEnv();
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    path: "/",
    maxAge: SESSION_TTL_SECONDS * 1e3
  };
}
function authRouter(limiters, accounts = { findByEmail: findAuthAccountByEmail }) {
  const router = Router2();
  router.post("/login", limiters.login, async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const env = getServerEnv();
    const account = await accounts.findByEmail(email);
    const passwordMatches = await verifyPassword(password, account?.passwordHash ?? await dummyPasswordHash);
    if (!account || !passwordMatches) {
      log.warn("failed sign-in");
      throw unauthorized("Email or password is not right.");
    }
    res.cookie(
      SESSION_COOKIE,
      createSessionToken(env.SESSION_SECRET, account.id, void 0, void 0, account.email),
      cookieOptions()
    );
    res.json({ authenticated: true, user: account.email });
  });
  router.post("/logout", (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: void 0 });
    res.json({ authenticated: false });
  });
  router.get("/session", (req, res) => {
    const env = getServerEnv();
    const session = verifySessionToken(env.SESSION_SECRET, req.cookies?.[SESSION_COOKIE]);
    res.json(isAccountSession(session) ? { authenticated: true, user: session.email } : { authenticated: false });
  });
  return router;
}

// src/routes/health.ts
import { Router as Router3 } from "express";
function healthRouter() {
  const router = Router3();
  router.get("/", async (_req, res) => {
    const started = Date.now();
    try {
      await query("select 1 as ok");
    } catch {
      throw serviceUnavailable("The database is not reachable right now.");
    }
    res.json({
      status: "ok",
      database_latency_ms: Date.now() - started,
      reference_date: REFERENCE_DATE
    });
  });
  return router;
}

// src/routes/overview.ts
import { Router as Router4 } from "express";
function overviewRouter() {
  const router = Router4();
  router.get("/", async (_req, res) => {
    res.json(await getOverview());
  });
  return router;
}

// src/routes/segments.ts
import { Router as Router5 } from "express";
import { z as z6 } from "zod";
var previewSchema = z6.object({
  definition: segmentDefinitionSchema,
  limit: z6.number().int().min(1).max(100).optional().default(SEARCH_LIMIT),
  offset: z6.number().int().min(0).optional().default(0)
});
var saveSchema2 = z6.object({
  name: z6.string().trim().min(1, "Give the segment a name.").max(SEGMENT_NAME_MAX_LENGTH),
  definition: segmentDefinitionSchema
});
var idSchema = z6.object({
  id: z6.string().uuid("That is not a segment id.")
});
function segmentsRouter() {
  const router = Router5();
  router.post("/preview", async (req, res) => {
    const { definition, limit, offset } = previewSchema.parse(req.body);
    res.json(await previewSegment(definition, { limit, offset }));
  });
  router.get("/", async (_req, res) => {
    res.json({ segments: await listSegments() });
  });
  router.post("/", async (req, res) => {
    const { name, definition } = saveSchema2.parse(req.body);
    const createdBy = req.session?.sub ?? "unknown";
    res.status(201).json(await saveSegment(name, definition, createdBy));
  });
  router.delete("/:id", async (req, res) => {
    const { id: id2 } = idSchema.parse(req.params);
    const removed = await deleteSegment(id2);
    if (!removed) throw notFound("No segment with that id.");
    res.status(204).send();
  });
  return router;
}

// src/routes/subscribers.ts
import { Router as Router6 } from "express";
import { z as z7 } from "zod";
var querySchema = z7.object({
  q: z7.string().trim().max(254).optional().default(""),
  limit: z7.coerce.number().int().min(1).max(100).default(SEARCH_LIMIT),
  offset: z7.coerce.number().int().min(0).default(0)
});
var idSchema2 = z7.object({
  id: z7.string().uuid("That is not a subscriber id.")
});
function subscribersRouter() {
  const router = Router6();
  router.get("/", async (req, res) => {
    const { q, limit, offset } = querySchema.parse(req.query);
    res.json(await searchSubscribers(q, { limit, offset }));
  });
  router.get("/:id", async (req, res) => {
    const { id: id2 } = idSchema2.parse(req.params);
    const profile = await getSubscriberProfile(id2);
    if (!profile) throw notFound("No subscriber with that id.");
    res.json(profile);
  });
  return router;
}

// src/routes/webhooks.ts
import { Router as Router7 } from "express";
import { z as z8 } from "zod";

// src/lib/sql.ts
var UNIQUE_VIOLATION = "23505";
function isUniqueViolation(error) {
  return typeof error === "object" && error !== null && error.code === UNIQUE_VIOLATION;
}

// src/services/webhooks.ts
async function ingestAppEvent(exec, incoming) {
  const existing = await exec.query(
    "select event_id, resolved_user_id from app_events where event_id = $1",
    [incoming.eventId]
  );
  if (existing.rows[0]) {
    return {
      duplicate: true,
      eventId: existing.rows[0].event_id,
      resolvedUserId: existing.rows[0].resolved_user_id
    };
  }
  await ensureDevice(exec, incoming.deviceId, incoming.occurredAt);
  if (incoming.userId) {
    await ensureAppUser(exec, incoming.userId, incoming.occurredAt);
  }
  if (incoming.event === "login" && incoming.userId) {
    await recordLogin(exec, incoming.deviceId, incoming.userId, incoming.occurredAt);
  }
  const resolvedUserId = incoming.userId ?? await ownerAt(exec, incoming.deviceId, incoming.occurredAt);
  try {
    await exec.query(
      `
      insert into app_events
        (event_id, event, raw_user_id, resolved_user_id, device_id, occurred_at, properties)
      values ($1, $2, $3, $4, $5, $6, $7::jsonb)
      `,
      [
        incoming.eventId,
        incoming.event,
        incoming.userId,
        resolvedUserId,
        incoming.deviceId,
        incoming.occurredAt,
        JSON.stringify(incoming.properties)
      ]
    );
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await exec.query(
      "select event_id, resolved_user_id from app_events where event_id = $1",
      [incoming.eventId]
    );
    return {
      duplicate: true,
      eventId: incoming.eventId,
      resolvedUserId: raced.rows[0]?.resolved_user_id ?? null
    };
  }
  return { duplicate: false, eventId: incoming.eventId, resolvedUserId };
}
async function ensureDevice(exec, deviceId, at) {
  await exec.query(
    `
    insert into app_devices (device_id, first_seen_at, last_seen_at)
    values ($1, $2, $2)
    on conflict (device_id) do update set
      first_seen_at = least(app_devices.first_seen_at, excluded.first_seen_at),
      last_seen_at  = greatest(app_devices.last_seen_at, excluded.last_seen_at)
    `,
    [deviceId, at]
  );
}
async function ensureAppUser(exec, userId, at) {
  await exec.query(
    `
    insert into app_users (user_id, origin, first_seen_at)
    values ($1, $2, $3)
    on conflict (user_id) do nothing
    `,
    [userId, APP_USER_ORIGIN.webhook, at]
  );
}
async function recordLogin(exec, deviceId, userId, at) {
  await exec.query(
    `
    insert into device_user_sessions (device_id, user_id, login_at, claimed_from, claimed_to)
    values ($1, $2, $3, $3, null)
    on conflict (device_id, user_id, login_at) do nothing
    `,
    [deviceId, userId, at]
  );
  await exec.query(
    `
    with ordered as (
      select
        id,
        login_at,
        lead(login_at) over (order by login_at, id) as next_login,
        row_number() over (order by login_at, id) as position
      from device_user_sessions
      where device_id = $1
    )
    update device_user_sessions as session
    set
      claimed_from = case when ordered.position = 1 then null else session.login_at end,
      claimed_to   = ordered.next_login
    from ordered
    where session.id = ordered.id
    `,
    [deviceId]
  );
  await exec.query(
    `
    update app_events as event
    set resolved_user_id = session.user_id
    from device_user_sessions as session
    where event.device_id = session.device_id
      and event.device_id = $1
      and event.raw_user_id is null
      and (session.claimed_from is null or event.occurred_at >= session.claimed_from)
      and (session.claimed_to is null or event.occurred_at < session.claimed_to)
    `,
    [deviceId]
  );
  await exec.query(
    `
    update app_devices
    set current_user_id = (
      select user_id
      from device_user_sessions
      where device_id = $1
      order by login_at desc, id desc
      limit 1
    )
    where device_id = $1
    `,
    [deviceId]
  );
}
async function ownerAt(exec, deviceId, at) {
  const { rows } = await exec.query(
    `
    select user_id
    from device_user_sessions
    where device_id = $1
      and (claimed_from is null or $2 >= claimed_from)
      and (claimed_to is null or $2 < claimed_to)
    order by login_at desc, id desc
    limit 1
    `,
    [deviceId, at]
  );
  return rows[0]?.user_id ?? null;
}

// src/routes/webhooks.ts
var id = z8.string().trim().min(1).max(WEBHOOK_ID_MAX_LENGTH);
var payloadSchema = z8.object({
  event_id: id,
  event: z8.enum(APP_EVENT_NAMES),
  user_id: z8.string().trim().max(WEBHOOK_ID_MAX_LENGTH).nullish(),
  device_id: id,
  timestamp: z8.string().min(1),
  properties: z8.record(z8.union([z8.string(), z8.number(), z8.boolean(), z8.null()])).optional().default({})
}).superRefine((value, ctx) => {
  if (!parseTimestamp(value.timestamp)) {
    ctx.addIssue({ code: "custom", path: ["timestamp"], message: "Use an ISO timestamp." });
  }
  if (value.event === "login" && !value.user_id) {
    ctx.addIssue({ code: "custom", path: ["user_id"], message: "A login needs a user_id." });
  }
});
function webhooksRouter() {
  const router = Router7();
  router.post("/app", async (req, res) => {
    const body = payloadSchema.parse(req.body);
    const occurredAt = parseTimestamp(body.timestamp);
    if (!occurredAt) throw badRequest("Use an ISO timestamp.");
    const result = await withTransaction(
      (client) => ingestAppEvent(client, {
        eventId: body.event_id,
        event: body.event,
        userId: body.user_id || null,
        deviceId: body.device_id,
        occurredAt,
        properties: body.properties
      })
    );
    log.info("app event ingested", {
      event: body.event,
      event_id: result.eventId,
      duplicate: result.duplicate
    });
    res.status(result.duplicate ? 200 : 201).json(result);
  });
  return router;
}

// src/routes/appEvents.ts
import { Router as Router8 } from "express";
import { z as z9 } from "zod";

// src/services/appEvents.ts
async function listRecentAppEvents(limit = 5, offset = 0) {
  const [rows, countRows] = await Promise.all([
    query(
      `
    select
      e.event_id,
      e.event,
      e.device_id,
      e.received_at,
      s.email_original as subscriber
    from app_events e
    left join app_users a on a.user_id = e.resolved_user_id
    left join subscribers s on s.id = a.subscriber_id
    order by e.received_at desc, e.event_id desc
    limit $1 offset $2
    `,
      [limit, offset]
    ),
    query("select count(*)::text as total from app_events")
  ]);
  return {
    events: rows.map((row) => ({
      eventId: row.event_id,
      event: row.event,
      deviceId: row.device_id,
      receivedAt: row.received_at.toISOString(),
      subscriber: row.subscriber ?? "Anonymous"
    })),
    total: Number(countRows[0]?.total ?? 0)
  };
}

// src/routes/appEvents.ts
var querySchema2 = z9.object({
  limit: z9.coerce.number().int().min(1).max(100).default(5),
  offset: z9.coerce.number().int().min(0).default(0)
});
function appEventsRouter() {
  const router = Router8();
  router.get("/", async (req, res) => {
    const { limit, offset } = querySchema2.parse(req.query);
    res.json(await listRecentAppEvents(limit, offset));
  });
  return router;
}

// src/app.ts
function createApp(options = {}) {
  const env = getServerEnv();
  const app = express();
  morganLogger.token("safe-url", (req) => (req.url ?? "").split("?")[0]);
  app.use(morganLogger(env.NODE_ENV === "production" ? ":remote-addr :method :safe-url :status :res[content-length] - :response-time ms" : ":method :safe-url :status :response-time ms"));
  app.disable("x-powered-by");
  if (env.TRUST_PROXY || process.env.VERCEL === "1") {
    app.set("trust proxy", 1);
  }
  const allowed = corsOrigins(env);
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowed.includes(origin) || deploymentOrigins().includes(origin)) callback(null, true);
        else callback(forbidden(`Origin ${origin} is not allowed.`));
      },
      credentials: true,
      methods: ["GET", "POST", "DELETE"]
    })
  );
  app.use(cookieParser());
  const limiters = createLimiters();
  app.use("/api/health", limiters.api, healthRouter());
  app.use("/api/auth", limiters.api, express.json({ limit: JSON_BODY_LIMIT }), authRouter(limiters, options.authAccounts));
  app.use("/api/app-events", limiters.api, requireAuth, appEventsRouter());
  app.use("/api/overview", limiters.api, requireAuth, overviewRouter());
  app.use("/api/subscribers", limiters.api, requireAuth, subscribersRouter());
  app.use("/api/segments", limiters.api, requireAuth, express.json({ limit: JSON_BODY_LIMIT }), segmentsRouter());
  app.use(
    "/api/assistant",
    limiters.api,
    requireAuth,
    express.json({ limit: JSON_BODY_LIMIT }),
    assistantRouter(limiters)
  );
  app.use(
    WEBHOOK_MOUNT,
    limiters.webhook,
    express.raw({ type: () => true, limit: JSON_BODY_LIMIT }),
    verifyWebhookRequest,
    webhooksRouter()
  );
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
var vercelApp;
var vercelEntry = express();
vercelEntry.use((req, res, next) => {
  try {
    vercelApp ??= createApp();
  } catch (error) {
    log.error("api failed to start", { message: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: { code: "internal_error", message: "The API is not configured." } });
    return;
  }
  vercelApp(req, res, next);
});
var app_default = vercelEntry;
function deploymentOrigins() {
  return [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL].filter((host) => typeof host === "string" && host.length > 0 && !host.includes("://")).map((host) => `https://${host}`);
}
export {
  createApp,
  app_default as default
};
