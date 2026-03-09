import { useMemo, useState, useCallback } from 'react';
import type { Message } from '@/types';
import { api } from '@/api';

export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';

export function usePermissionMode(messages: Message[], sessionId: string | null) {
  const [isChanging, setIsChanging] = useState(false);

  const permissionMode = useMemo<PermissionMode>(() => {
    // Scan messages from the end to find the most recent mode
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];

      // Check system events with permissionMode (from CLI status updates via shift+tab etc.)
      if (msg.type === 'system' && (msg as any).permissionMode) {
        return (msg as any).permissionMode as PermissionMode;
      }

      // Check control_response with mode
      if (msg.type === 'control_response') {
        const mode = (msg.response?.response as Record<string, unknown> | undefined)?.mode;
        if (typeof mode === 'string') return mode as PermissionMode;
      }

      // Check control_request with set_permission_mode
      if (msg.type === 'control_request' && msg.request?.subtype === 'set_permission_mode') {
        const mode = msg.request?.mode;
        if (typeof mode === 'string') return mode as PermissionMode;
      }
    }

    return 'default';
  }, [messages]);

  const setPermissionMode = useCallback(async (mode: PermissionMode) => {
    if (!sessionId) return;
    setIsChanging(true);
    try {
      await api('POST', `/sessions/${sessionId}/control`, {
        subtype: 'set_permission_mode',
        mode,
      });
    } finally {
      setIsChanging(false);
    }
  }, [sessionId]);

  return { permissionMode, setPermissionMode, isChanging };
}
