import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import type { Environment, Session, Message } from './types';

interface AppState {
  environments: Environment[];
  sessions: Session[];
  currentSessionId: string | null;
  cliConnected: boolean;
  messages: Message[];
  isLoading: boolean;
}

interface AppContextType extends AppState {
  setEnvironments: (envs: Environment[]) => void;
  setSessions: (sessions: Session[]) => void;
  setCurrentSessionId: (id: string | null) => void;
  setCliConnected: (connected: boolean) => void;
  addMessage: (msg: Message) => void;
  clearMessages: () => void;
  setMessages: (msgs: Message[]) => void;
  seenUuids: Set<string>;
  addSeenUuid: (uuid: string) => boolean;
  ws: WebSocket | null;
  connectWebSocket: (sessionId: string) => void;
  disconnectWebSocket: () => void;
  sendMessage: (text: string) => void;
  refreshData: () => Promise<void>;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [cliConnected, setCliConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const seenUuidsRef = useRef<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);

  const addSeenUuid = useCallback((uuid: string): boolean => {
    if (seenUuidsRef.current.has(uuid)) return false;
    seenUuidsRef.current.add(uuid);
    return true;
  }, []);

  const addMessage = useCallback((msg: Message) => {
    setMessages(prev => [...prev, msg]);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    seenUuidsRef.current.clear();
  }, []);

  const connectWebSocket = useCallback((sessionId: string) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${location.host}/api/ws/${sessionId}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[ws] Connected to session', sessionId);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWsMessage(data);
      } catch (err) {
        console.error('[ws] Parse error:', err);
      }
    };

    ws.onclose = () => {
      console.log('[ws] Disconnected');
      if (currentSessionId === sessionId) {
        setCliConnected(false);
      }
    };

    ws.onerror = (err) => {
      console.error('[ws] Error:', err);
    };
  }, [currentSessionId]);

  const disconnectWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const handleWsMessage = useCallback((data: {
    type?: string;
    cli_connected?: boolean;
    events?: Message[];
  }) => {
    // Connection status
    if (data.type === 'connection_status') {
      setCliConnected(data.cli_connected ?? false);
      return;
    }

    // History replay
    if (data.type === 'history') {
      clearMessages();
      if (data.events) {
        data.events.forEach(event => addMessage(event));
      }
      return;
    }

    // Batch events
    if (data.events) {
      data.events.forEach(event => addMessage(event));
      return;
    }

    // Single event
    if (data.type) {
      addMessage(data as Message);
    }
  }, [addMessage, clearMessages]);

  const sendMessage = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'user_message',
        message: text,
      }));
    }
  }, []);

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [envsRes, sessionsRes] = await Promise.all([
        fetch('/api/environments'),
        fetch('/api/sessions'),
      ]);

      if (envsRes.ok) {
        const envs = await envsRes.json();
        setEnvironments(envs);
      }

      if (sessionsRes.ok) {
        const sess = await sessionsRes.json();
        setSessions(sess);
      }
    } catch (err) {
      console.error('Failed to refresh data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <AppContext.Provider
      value={{
        environments,
        sessions,
        currentSessionId,
        cliConnected,
        messages,
        isLoading,
        setEnvironments,
        setSessions,
        setCurrentSessionId,
        setCliConnected,
        addMessage,
        clearMessages,
        setMessages,
        seenUuids: seenUuidsRef.current,
        addSeenUuid,
        ws: wsRef.current,
        connectWebSocket,
        disconnectWebSocket,
        sendMessage,
        refreshData,
        isSidebarOpen,
        setIsSidebarOpen,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
