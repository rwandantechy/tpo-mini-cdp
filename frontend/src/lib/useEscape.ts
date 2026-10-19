import { useEffect } from 'react';

export function useEscape(enabled: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!enabled) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onEscape();
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, onEscape]);
}
