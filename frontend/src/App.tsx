import { Button, Notice, Spinner } from './components/ui.tsx';
import { SignIn } from './features/auth/SignIn.tsx';
import { useSession } from './features/auth/useSession.ts';
import { Dashboard } from './features/overview/Dashboard.tsx';

export function App() {
  const { status, user, problem, signIn, signOut, recheck } = useSession();

  if (status === 'checking') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-blush">
        <Spinner label="Checking your session…" />
      </main>
    );
  }

  if (status === 'unreachable') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-blush px-4">
        <div className="w-full max-w-md space-y-4">
          <Notice tone="error">{problem ?? 'Could not reach the server.'}</Notice>
          <p className="text-sm text-ink-soft">Could not reach the API. Check that it is running, then try again.</p>
          <Button variant="quiet" onClick={() => void recheck()}>
            Try again
          </Button>
        </div>
      </main>
    );
  }

  if (status === 'signed-out') return <SignIn onSignIn={signIn} />;

  return (
    <div className="min-h-screen bg-surface-muted">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-semibold text-ink">Mini CDP</h1>
            <span className="hidden text-sm text-ink-soft sm:inline">
              Newsletter, website and app activity in one place
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-ink-soft sm:inline">Signed in as {user}</span>
            <Button variant="quiet" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Dashboard />
      </main>
    </div>
  );
}
