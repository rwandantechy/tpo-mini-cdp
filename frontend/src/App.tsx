import { useState } from 'react';

import { Button, Notice, Spinner } from './components/ui.tsx';
import { SignIn } from './features/auth/SignIn.tsx';
import { useSession } from './features/auth/useSession.ts';
import { Dashboard } from './features/overview/Dashboard.tsx';
import { People } from './features/subscribers/People.tsx';

type Screen = 'overview' | 'people';

export function App() {
  const { status, user, problem, signIn, signOut, recheck } = useSession();

  if (status === 'checking') {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-surface-muted">
        <Spinner label="Checking your session…" />
      </main>
    );
  }

  if (status === 'unreachable') {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-surface-muted px-4">
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

  return <SignedIn user={user} onSignOut={signOut} />;
}

function SignedIn({ user, onSignOut }: { user: string | null; onSignOut: () => Promise<void> }) {
  const [screen, setScreen] = useState<Screen>('overview');

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-surface-muted md:flex-row">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="border-b border-line px-4 py-4">
          <p className="text-sm font-semibold text-ink">Mini CDP</p>
          <p className="mt-0.5 text-xs text-ink-soft">Growth</p>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          <SideLink active={screen === 'overview'} onClick={() => setScreen('overview')}>
            Overview
          </SideLink>
          <SideLink active={screen === 'people'} onClick={() => setScreen('people')}>
            People
          </SideLink>
        </nav>

        <div className="border-t border-line p-3">
          <p className="truncate px-2 text-xs text-ink-soft">{user}</p>
          <button
            type="button"
            className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-sm text-ink-soft hover:bg-surface-muted hover:text-ink"
            onClick={() => void onSignOut()}
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 md:hidden">
          <p className="text-sm font-semibold text-ink">Mini CDP</p>
          <button type="button" className="text-sm text-ink-soft" onClick={() => void onSignOut()}>
            Sign out
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden">
          {screen === 'overview' ? (
            <div className="h-full overflow-auto">
              <Dashboard />
            </div>
          ) : (
            <People />
          )}
        </main>

        <nav className="grid grid-cols-2 border-t border-line bg-surface md:hidden">
          <Tab active={screen === 'overview'} onClick={() => setScreen('overview')}>
            Overview
          </Tab>
          <Tab active={screen === 'people'} onClick={() => setScreen('people')}>
            People
          </Tab>
        </nav>
      </div>
    </div>
  );
}

function SideLink({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      className={`rounded-md px-3 py-2 text-left text-sm ${
        active ? 'bg-blush font-medium text-ink' : 'text-ink-soft hover:bg-surface-muted hover:text-ink'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      className={`py-3 text-sm ${active ? 'font-medium text-ink' : 'text-ink-soft'}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
