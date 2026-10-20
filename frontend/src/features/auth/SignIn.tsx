import { type FormEvent, useState } from 'react';

import { Button, Card, Field, Notice } from '../../components/ui.tsx';
import { ApiError } from '../../lib/api.ts';

export function SignIn({ onSignIn }: { onSignIn: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await onSignIn(password);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not sign in.');
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-muted px-4">
      <div className="w-full max-w-sm">
        <p className="text-center text-xs font-medium tracking-wide text-ink-soft">Growth</p>
        <h1 className="mt-1 text-center text-xl font-semibold text-ink">Mini CDP</h1>
        <p className="mt-2 text-center text-sm text-ink-soft">
          Newsletter, website, and app.
        </p>

        <Card className="mt-6 p-5">
          <form onSubmit={submit} className="space-y-4">
            <Field
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoFocus
            />

            {error ? <Notice tone="error">{error}</Notice> : null}

            <Button type="submit" className="w-full" disabled={busy || password.length === 0}>
              {busy ? 'Checking…' : 'Sign in'}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
