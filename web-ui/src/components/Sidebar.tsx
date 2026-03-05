import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Environment, Session } from '@/types';
import { Computer, MessageSquare, RefreshCw, Menu, Circle } from 'lucide-react';

interface SidebarProps {
  environments: Environment[];
  sessions: Session[];
  currentSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onShowNewSession: (envId: string) => void;
  onRefresh: () => void;
}

export function Sidebar({
  environments,
  sessions,
  currentSessionId,
  onSelectSession,
  onShowNewSession,
  onRefresh,
}: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeSessions = sessions.filter((s) => s.status === 'active');

  const formatTime = (ts: number) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString();
  };

  const isOnline = (env: Environment) => {
    return env.last_poll_at && Date.now() - env.last_poll_at < 30000;
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <Computer className="w-5 h-5 text-primary" />
          <h1 className="font-semibold text-lg">Remote Control</h1>
        </div>
        <p className="text-xs text-muted-foreground">Claude Code Session Manager</p>
      </div>

      <ScrollArea className="flex-1">
        {/* Environments Section */}
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Environments ({environments.length})
            </h2>
          </div>

          {environments.length === 0 ? (
            <div className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-md">
              No CLI connected. Run <code className="bg-secondary px-1 py-0.5 rounded text-xs">claude remote-control</code> to connect.
            </div>
          ) : (
            <div className="space-y-1">
              {environments.map((env) => (
                <button
                  key={env.id}
                  onClick={() => onShowNewSession(env.id)}
                  className="w-full text-left p-2 rounded-md hover:bg-muted transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <Circle
                      className={`w-2 h-2 fill-current ${
                        isOnline(env) ? 'text-success' : 'text-muted-foreground'
                      }`}
                    />
                    <span className="font-medium text-sm truncate">{env.machine_name}</span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate ml-4 mt-0.5">
                    {env.directory}
                  </div>
                  {env.branch && (
                    <div className="text-xs text-muted-foreground truncate ml-4">
                      Branch: {env.branch}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <Separator />

        {/* Sessions Section */}
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Sessions ({activeSessions.length})
            </h2>
          </div>

          <div className="space-y-1">
            {activeSessions.map((session) => (
              <a
                key={session.id}
                href={`/code/${session.id}`}
                onClick={(e) => {
                  // Allow cmd/ctrl+click to open in new tab
                  if (e.metaKey || e.ctrlKey) return;
                  e.preventDefault();
                  onSelectSession(session.id);
                  setMobileOpen(false);
                }}
                className={`block w-full text-left p-2 rounded-md transition-colors no-underline text-foreground ${
                  session.id === currentSessionId
                    ? 'bg-muted border-l-2 border-primary pl-[6px]'
                    : 'hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-success" />
                  <span className="font-medium text-sm truncate">{session.title}</span>
                </div>
                <div className="text-xs text-muted-foreground ml-5 mt-0.5">
                  {formatTime(session.created_at)} · {session.message_count} messages
                </div>
              </a>
            ))}
          </div>
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-border">
        <Button variant="outline" className="w-full" size="sm" onClick={onRefresh}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>
    </div>
  );

  return (
    <TooltipProvider>
      {/* Mobile Sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild className="lg:hidden">
          <Button variant="ghost" size="icon" className="fixed top-3 left-3 z-50">
            <Menu className="w-5 h-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[280px] p-0 flex flex-col">
          <SheetHeader className="p-4 border-b border-border">
            <SheetTitle className="flex items-center gap-2">
              <Computer className="w-5 h-5 text-primary" />
              Remote Control
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 flex flex-col overflow-hidden">
            <SidebarContent />
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-[280px] flex-col border-r border-border bg-card h-screen">
        <SidebarContent />
      </aside>
    </TooltipProvider>
  );
}
