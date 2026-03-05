import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { MessageItem } from '@/components/MessageItem';
import { NewSessionDialog } from '@/components/NewSessionDialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { Environment, Session, Message, WebSocketMessage } from '@/types';
import { api, createSession } from '@/api';
import { Computer, Send, CircleStop } from 'lucide-react';
import { buildCrossMessageToolResultMap } from '@/components/message/useToolResultMap';

function App() {
  // State
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [cliConnected, setCliConnected] = useState(false);
  const [inputText, setInputText] = useState('');
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [selectedEnv, setSelectedEnv] = useState<Environment | null>(null);
  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const seenUuidsRef = useRef<Set<string>>(new Set());

  // Load data
  const loadData = useCallback(async () => {
    try {
      const [envs, sess] = await Promise.all([
        api<Environment[]>('GET', '/environments'),
        api<Session[]>('GET', '/sessions'),
      ]);
      setEnvironments(envs);
      setSessions(sess);
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  }, []);

  // Initial load and polling
  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  // WebSocket connection
  const connectWebSocket = useCallback((sessionId: string) => {
    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
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
        const data: WebSocketMessage = JSON.parse(event.data);
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

  // Handle WebSocket messages
  const handleWsMessage = useCallback((data: WebSocketMessage) => {
    // Connection status
    if (data.type === 'connection_status') {
      setCliConnected(data.cli_connected || false);
      return;
    }

    // History replay
    if (data.type === 'history') {
      setMessages(data.events || []);
      seenUuidsRef.current = new Set((data.events || []).map((e) => e.uuid).filter((uuid): uuid is string => !!uuid));
      return;
    }

    // Batch events
    if (data.events) {
      setMessages((prev) => {
        const newMessages = [...prev];
        for (const event of data.events || []) {
          const eventUuid = event.uuid;
          if (eventUuid && seenUuidsRef.current.has(eventUuid)) continue;
          if (eventUuid) {
            seenUuidsRef.current.add(eventUuid);
          }
          // Remove previous stream_event when new content arrives
          if (event.type === 'assistant' || event.type === 'user') {
            const lastIndex = newMessages.length - 1;
            if (lastIndex >= 0 && newMessages[lastIndex].type === 'stream_event') {
              newMessages.pop();
            }
          }
          newMessages.push(event);
        }
        return newMessages;
      });
      return;
    }

    // Single event
    if (data.type) {
      const dataUuid = data.uuid;
      setMessages((prev) => {
        if (dataUuid && seenUuidsRef.current.has(dataUuid)) return prev;
        if (dataUuid) {
          seenUuidsRef.current.add(dataUuid);
        }
        // Remove previous stream_event when new content arrives
        if (data.type === 'assistant' || data.type === 'user') {
          const newMessages = [...prev];
          const lastIndex = newMessages.length - 1;
          if (lastIndex >= 0 && newMessages[lastIndex].type === 'stream_event') {
            newMessages.pop();
          }
          newMessages.push(data as Message);
          return newMessages;
        }
        return [...prev, data as Message];
      });
    }
  }, []);

  // Select session
  const handleSelectSession = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
    setMessages([]);
    seenUuidsRef.current.clear();
    connectWebSocket(sessionId);
  }, [connectWebSocket]);

  // Create session
  const handleCreateSession = useCallback(async (envId: string, title: string, prompt: string) => {
    const result = await createSession(envId, title, prompt);
    await loadData();
    handleSelectSession(result.id);
  }, [handleSelectSession, loadData]);

  // Show new session modal
  const handleShowNewSession = useCallback((envId: string) => {
    const env = environments.find((e) => e.id === envId);
    if (env) {
      setSelectedEnv(env);
      setNewSessionOpen(true);
    }
  }, [environments]);

  // Helper: push a local system message into the chat
  const pushLocalMessage = useCallback((text: string) => {
    const msg: Message = {
      type: 'system',
      uuid: `local-${Date.now()}`,
      timestamp: Date.now(),
      message: { content: text },
    };
    setMessages((prev) => [...prev, msg]);
  }, []);

  // Send message (with slash command interception)
  const handleSendMessage = useCallback(async () => {
    if (!inputText.trim() || !currentSessionId || !wsRef.current) return;

    const text = inputText.trim();
    const clearInput = () => {
      setInputText('');
      if (inputRef.current) inputRef.current.style.height = 'auto';
    };

    // --- Front-end slash command interception ---
    if (text.startsWith('/')) {
      const parts = text.split(/\s+/);
      const cmd = parts[0].toLowerCase();

      // /help — render locally
      if (cmd === '/help') {
        clearInput();
        pushLocalMessage(
          `**Available commands**\n\n` +
          `| Command | Description |\n` +
          `|---------|-------------|\n` +
          `| \`/compact\` | Compact conversation history (reduces context) |\n` +
          `| \`/clear\` | Clear conversation history |\n` +
          `| \`/model <name>\` | Switch Claude model (e.g. \`/model sonnet\`) |\n` +
          `| \`/commit\` | Generate a git commit for staged changes |\n` +
          `| \`/review\` | Review code changes |\n` +
          `| \`/help\` | Show this help message |\n\n` +
          `Most slash commands are forwarded to the CLI for execution. ` +
          `\`/help\` is rendered locally in the Web UI.`
        );
        return;
      }

      // /model <name> — use control API
      if (cmd === '/model' && parts.length >= 2) {
        const modelName = parts.slice(1).join(' ');
        clearInput();
        try {
          await api('POST', `/sessions/${currentSessionId}/control`, {
            subtype: 'set_model',
            model: modelName,
          });
          pushLocalMessage(`Model switched to **${modelName}**.`);
        } catch (err) {
          pushLocalMessage(`Failed to switch model: ${err instanceof Error ? err.message : String(err)}`);
        }
        return;
      }

      // All other slash commands — forward to CLI as-is
    }

    if (wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'user_message',
          message: text,
        })
      );
      clearInput();
    }
  }, [inputText, currentSessionId, pushLocalMessage]);

  // Handle permission response
  const handlePermissionResponse = useCallback(async (requestId: string, approved: boolean, updatedInput?: unknown) => {
    if (!currentSessionId) return;
    await api('POST', `/sessions/${currentSessionId}/permission`, {
      request_id: requestId,
      behavior: approved ? 'allow' : 'deny',
      updatedInput,
    });
  }, [currentSessionId]);

  // Handle elicitation response
  const handleElicitationResponse = useCallback((requestId: string, action: 'accept' | 'decline', content?: Record<string, unknown>) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(JSON.stringify({
      type: 'elicitation_response',
      request_id: requestId,
      action,
      content,
    }));
  }, []);

  // Interrupt session
  const handleInterrupt = useCallback(async () => {
    if (!currentSessionId) return;
    await api('POST', `/sessions/${currentSessionId}/interrupt`);
  }, [currentSessionId]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
  };

  // Enter to send (with IME support)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Don't send if IME is composing (e.g., Chinese/Japanese input)
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Pre-process cross-message tool_result associations
  const { toolResultsByIndex, hiddenIndices } = useMemo(
    () => buildCrossMessageToolResultMap(messages),
    [messages]
  );

  // Collect request_ids that have been answered (via control_response), with response data
  const answeredRequestIds = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const msg of messages) {
      if (msg.type === 'control_response') {
        const rid = msg.response?.request_id || msg.request_id;
        if (rid) map.set(rid, (msg.response?.response || {}) as Record<string, unknown>);
      }
    }
    return map;
  }, [messages]);

  // Get current session
  const currentSession = sessions.find((s) => s.id === currentSessionId);

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-background overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          environments={environments}
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSelectSession={handleSelectSession}
          onShowNewSession={handleShowNewSession}
          onRefresh={loadData}
        />

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0 h-screen">
          {currentSession ? (
            <>
              {/* Header */}
              <header className="h-14 border-b border-border flex items-center justify-between px-4 lg:pl-4 pl-14">
                <h2 className="font-semibold truncate flex-1 mr-4">{currentSession.title}</h2>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={cliConnected ? 'default' : 'secondary'}
                    className={cliConnected ? 'bg-success/20 text-success hover:bg-success/30' : ''}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${cliConnected ? 'bg-success' : 'bg-muted-foreground'}`} />
                    {cliConnected ? 'CLI Connected' : 'CLI Disconnected'}
                  </Badge>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="destructive" size="sm" onClick={handleInterrupt}>
                        <CircleStop className="w-4 h-4 mr-1.5" />
                        Interrupt
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Stop the current operation</TooltipContent>
                  </Tooltip>
                </div>
              </header>

              {/* Messages */}
              <div className="flex-1 min-h-0 min-w-0 overflow-y-auto">
                <div className="max-w-6xl mx-auto py-4">
                  {messages.map((msg, idx) => {
                    if (hiddenIndices.has(idx)) return null;
                    return (
                      <MessageItem
                        key={`${msg.uuid || idx}-${idx}`}
                        event={msg}
                        externalToolResults={toolResultsByIndex.get(idx)}
                        answeredRequestIds={answeredRequestIds}
                        onPermissionResponse={handlePermissionResponse}
                        onElicitationResponse={handleElicitationResponse}
                      />
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Input Area */}
              <div className="border-t border-border p-4">
                <div className="max-w-6xl mx-auto flex gap-2 items-end">
                  <Textarea
                    ref={inputRef}
                    value={inputText}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    className="min-h-11 max-h-50 resize-none flex-1"
                    rows={1}
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!inputText.trim()}
                    className="h-11 w-11 p-0 shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            /* Empty State */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mb-4">
                <Computer className="w-8 h-8 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Remote Control Server</h2>
              <p className="text-muted-foreground max-w-md">
                Select an environment from the sidebar and create a session to start interacting with your CLI.
              </p>
              <p className="text-sm text-muted-foreground mt-4">
                Run <code className="bg-muted px-1.5 py-0.5 rounded">claude remote-control</code> to connect a CLI.
              </p>
            </div>
          )}
        </main>

        {/* New Session Dialog */}
        <NewSessionDialog
          open={newSessionOpen}
          onOpenChange={setNewSessionOpen}
          environment={selectedEnv}
          onCreate={handleCreateSession}
        />
      </div>
    </TooltipProvider>
  );
}

export default App;
