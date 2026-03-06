import { formatTime } from './utils';
import type { Message } from '@/types';
import { Avatar } from './Avatar';
import { MarkdownRenderer } from './MarkdownRenderer';
import { CollapsibleSection } from './ToolCallRenderer';

interface CompactSummaryProps {
  event: Message;
}

export function CompactSummary({ event }: CompactSummaryProps) {
  const content = typeof event.message?.content === 'string'
    ? event.message.content
    : '';

  return (
    <div className="flex gap-3 mb-4 px-4 py-2 hover:bg-muted/30">
      <Avatar type="system" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-semibold text-gray-400">Context Compacted</span>
          {event.timestamp && (
            <span className="text-xs text-muted-foreground">
              {formatTime(event.timestamp)}
            </span>
          )}
        </div>
        {content && (
          <CollapsibleSection label="Show summary">
            <div className="text-sm prose prose-invert prose-sm max-w-none">
              <MarkdownRenderer content={content} />
            </div>
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
}
