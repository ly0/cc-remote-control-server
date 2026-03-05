import { formatTime } from './utils';
import type { Message } from '@/types';
import { Avatar } from './Avatar';

interface SystemMessageProps {
  event: Message;
}

export function SystemMessage({ event }: SystemMessageProps) {
  // Special handling for cli_disconnected to show cleaner message
  if (event.subtype === 'cli_disconnected') {
    return (
      <div className="flex gap-3 mb-4 px-4 py-2 hover:bg-muted/30">
        <Avatar type="system" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-semibold text-gray-400">System</span>
            {event.timestamp && (
              <span className="text-xs text-muted-foreground">
                {formatTime(event.timestamp)}
              </span>
            )}
          </div>
          <div className="text-sm text-yellow-500">
            CLI disconnected. Waiting for reconnection...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 mb-4 px-4 py-2 hover:bg-muted/30">
      <Avatar type="system" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-semibold text-gray-400">
            System{event.subtype ? ` / ${event.subtype}` : ''}
          </span>
          {event.timestamp && (
            <span className="text-xs text-muted-foreground">
              {formatTime(event.timestamp)}
            </span>
          )}
        </div>
        <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all font-mono bg-muted/50 p-2 rounded">
          {JSON.stringify(event, null, 2)}
        </pre>
      </div>
    </div>
  );
}
