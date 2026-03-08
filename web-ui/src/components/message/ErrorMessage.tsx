import { formatTime } from './utils';
import type { Message } from '@/types';
import { Avatar } from './Avatar';
import { DebugMessage } from './DebugMessage';

interface ErrorMessageProps {
  event: Message;
  debugMode?: boolean;
}

export function ErrorMessage({ event, debugMode }: ErrorMessageProps) {
  if (!event.is_error) {
    if (debugMode) return <DebugMessage label="result" event={event} />;
    return null;
  }

  return (
    <div className="flex gap-3 mb-4 px-4 py-2 hover:bg-muted/30">
      <Avatar type="error" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-semibold text-red-400">Error</span>
          {event.timestamp && (
            <span className="text-xs text-muted-foreground">
              {formatTime(event.timestamp)}
            </span>
          )}
        </div>
        <div className="text-sm text-red-400">
          {event.result || event.subtype || 'Error'}
        </div>
      </div>
    </div>
  );
}
