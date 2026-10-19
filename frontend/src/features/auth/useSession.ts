import { useCallback, useEffect, useState } from 'react';

import { api, ApiError } from '../../lib/api.ts';

interface SessionResponse {
  authenticated: boolean;
  user?: string;
}

type Status = 'checking' | 'signed-out' | 'signed-in' | 'unreachable';

export function useSession() {
  const [status, setStatus] = useState<Status>('checking');
  const [user, setUser] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const check = useCallback(async () => {
    try {
      const session = await api.get<SessionResponse>('/api/auth/session');
      setUser(session.user ?? null);
      setStatus(session.authenticated ? 'signed-in' : 'signed-out');
      setProblem(null);
    } catch (error) {
      setStatus('unreachable');
      setProblem(error instanceof ApiError ? error.message : 'Could not reach the server.');
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const signIn = useCallback(async (password: string) => {
    const session = await api.post<SessionResponse>('/api/auth/login', { password });
    setUser(session.user ?? null);
    setStatus('signed-in');
  }, []);

  const signOut = useCallback(async () => {
    await api.post('/api/auth/logout');
    setUser(null);
    setStatus('signed-out');
  }, []);

  return { status, user, problem, signIn, signOut, recheck: check };
}
