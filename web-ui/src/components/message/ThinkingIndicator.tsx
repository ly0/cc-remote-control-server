import { Avatar } from './Avatar';
import { formatTime } from './utils';

interface ThinkingIndicatorProps {
  timestamp?: number;
}

export function ThinkingIndicator({ timestamp }: ThinkingIndicatorProps) {
  return (
    <div className="flex gap-3 mb-4 px-4 py-2 hover:bg-muted/30">
      <Avatar type="assistant" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-semibold text-purple-400">Claude</span>
          {timestamp && (
            <span className="text-xs text-muted-foreground">
              {formatTime(timestamp)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 bg-current rounded-full animate-pulse-dot" />
            <span className="w-1.5 h-1.5 bg-current rounded-full animate-pulse-dot [animation-delay:0.2s]" />
            <span className="w-1.5 h-1.5 bg-current rounded-full animate-pulse-dot [animation-delay:0.4s]" />
          </div>
          <span>Thinking...</span>
        </div>
      </div>
    </div>
  );
}
