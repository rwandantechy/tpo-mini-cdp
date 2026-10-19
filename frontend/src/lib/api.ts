/** Empty `API_BASE` in development — Vite proxies /api to the backend. */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: 'include',
      headers: { Accept: 'application/json', ...init?.headers },
    });
  } catch (caught) {
    const name = caught instanceof Error ? caught.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new ApiError(0, 'timeout', 'The assistant took too long. Try again.');
    }
    throw new ApiError(0, 'network_error', 'Could not reach the server. Is the API running?');
  }

  if (response.status === 204) return undefined as T;

  const body = (await response.json().catch(() => ({}))) as unknown;

  if (!response.ok) {
    const error = (body as ErrorBody).error;
    throw new ApiError(
      response.status,
      error?.code ?? 'unknown_error',
      error?.message ?? 'The assistant could not answer just now. Try again.',
      error?.details,
    );
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, options?: { timeoutMs?: number }) =>
    request<T>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      ...(options?.timeoutMs ? { signal: AbortSignal.timeout(options.timeoutMs) } : {}),
    }),
  delete: (path: string) => request<void>(path, { method: 'DELETE' }),
};
