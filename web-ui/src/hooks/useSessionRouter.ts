import { useState, useEffect, useCallback } from 'react';

const SESSION_PATH_RE = /^\/code\/([a-f0-9-]+)$/;

function parseSessionId(): string | null {
  const match = window.location.pathname.match(SESSION_PATH_RE);
  return match ? match[1] : null;
}

export function useSessionRouter() {
  const [sessionId, setSessionId] = useState<string | null>(parseSessionId);

  useEffect(() => {
    const onPopState = () => {
      setSessionId(parseSessionId());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateToSession = useCallback((id: string) => {
    setSessionId(id);
    window.history.pushState(null, '', `/code/${id}`);
  }, []);

  const navigateHome = useCallback(() => {
    setSessionId(null);
    window.history.pushState(null, '', '/');
  }, []);

  return { sessionId, navigateToSession, navigateHome };
}
