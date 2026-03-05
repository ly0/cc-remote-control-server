import { formatTime, extractText, extractToolResultText } from './utils';
import type { Message } from '@/types';
import { Avatar } from './Avatar';

interface UserMessageProps {
  event: Message;
}

export function UserMessage({ event }: UserMessageProps) {
  const text = extractText(event);
  const toolResultText = extractToolResultText(event);

  if (!text && !toolResultText) return null;

  return (
    <div className="flex gap-3 mb-4 px-4 py-2 hover:bg-muted/30">
      <Avatar type="user" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-semibold text-blue-400">You</span>
          {event.timestamp && (
            <span className="text-xs text-muted-foreground">
              {formatTime(event.timestamp)}
            </span>
          )}
        </div>
        <div className="text-sm whitespace-pre-wrap wrap-break-word">
          {text || <span className="italic text-muted-foreground">{toolResultText}</span>}
        </div>
      </div>
    </div>
  );
}
