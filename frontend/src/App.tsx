import { useState, type ComponentType } from 'react';

import { LayersIcon, LayoutIcon, MessageIcon, UsersIcon } from './components/icons.tsx';
import { Button, Notice, Spinner } from './components/ui.tsx';
import { SignIn } from './features/auth/SignIn.tsx';
import { useSession } from './features/auth/useSession.ts';
import { Assistant } from './features/assistant/Assistant.tsx';
import { Dashboard } from './features/overview/Dashboard.tsx';
import { Segments } from './features/segments/Segments.tsx';
import { People } from './features/subscribers/People.tsx';

const NAV = [
  { id: 'overview', label: 'Overview', icon: LayoutIcon },
  { id: 'people', label: 'People', icon: UsersIcon },
  { id: 'segments', label: 'Segments', icon: LayersIcon },
  { id: 'assistant', label: 'Ask', icon: MessageIcon },
] as const;

type Screen = (typeof NAV)[number]['id'];

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
          <p className="mt-0.5 text-xs text-ink-soft">Growth · Sep 28, 2026</p>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAV.map((item) => (
            <SideLink key={item.id} active={screen === item.id} icon={item.icon} onClick={() => setScreen(item.id)}>
              {item.label}
            </SideLink>
          ))}
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
          ) : null}
          {screen === 'people' ? <People /> : null}
          {screen === 'segments' ? <Segments /> : null}
          {screen === 'assistant' ? <Assistant /> : null}
        </main>

        <nav className="grid grid-cols-4 border-t border-line bg-surface md:hidden">
          {NAV.map((item) => (
            <Tab key={item.id} active={screen === item.id} icon={item.icon} onClick={() => setScreen(item.id)}>
              {item.label}
            </Tab>
          ))}
        </nav>
      </div>
    </div>
  );
}

function SideLink({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ComponentType;
  children: string;
}) {
  return (
    <button
      type="button"
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
        active ? 'bg-blush font-medium text-ink' : 'text-ink-soft hover:bg-surface-muted hover:text-ink'
      }`}
      onClick={onClick}
    >
      <span className={active ? 'text-coral-deep' : undefined}>
        <Icon />
      </span>
      {children}
    </button>
  );
}

function Tab({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ComponentType;
  children: string;
}) {
  return (
    <button
      type="button"
      className={`flex flex-col items-center gap-1 py-2 text-sm ${active ? 'font-medium text-ink' : 'text-ink-soft'}`}
      onClick={onClick}
    >
      <span className={active ? 'text-coral-deep' : undefined}>
        <Icon />
      </span>
      {children}
    </button>
  );
}
