import { useState } from 'react';
import { Bug, ChevronRight, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Message } from '@/types';
import { formatTime } from './utils';

interface DebugMessageProps {
  label: string;
  event: Message;
}

export function DebugMessage({ label, event }: DebugMessageProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex gap-3 mb-4 px-4 py-2 border border-dashed border-muted-foreground/30 rounded-lg bg-muted/20 opacity-70">
      <div className="shrink-0 w-10 h-10 rounded-full bg-muted flex items-center justify-center">
        <Bug className="w-5 h-5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="outline" className="text-xs font-mono">
            {label}
          </Badge>
          <span className="text-xs text-muted-foreground">
            type: {event.type}
          </span>
          {event.timestamp && (
            <span className="text-xs text-muted-foreground">
              {formatTime(event.timestamp)}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown className="w-3 h-3 mr-1" /> : <ChevronRight className="w-3 h-3 mr-1" />}
          Raw JSON
        </Button>
        {expanded && (
          <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto max-h-80 whitespace-pre-wrap break-all">
            {JSON.stringify(event, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
