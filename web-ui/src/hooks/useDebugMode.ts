import { useState, useCallback } from 'react';

const STORAGE_KEY = 'debug-mode';

export function useDebugMode() {
  const [debugMode, setDebugModeState] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  });

  const setDebugMode = useCallback((value: boolean) => {
    localStorage.setItem(STORAGE_KEY, String(value));
    setDebugModeState(value);
  }, []);

  return { debugMode, setDebugMode };
}
