import { formatTime, escapeHtml } from './utils';
import type { Message, MessageContent } from '@/types';
import { Avatar } from './Avatar';
import { MarkdownRenderer } from './MarkdownRenderer';

interface AssistantMessageProps {
  event: Message;
}

interface ToolUseBlockProps {
  block: MessageContent;
}

function ToolUseBlock({ block }: ToolUseBlockProps) {
  // Skip AskUserQuestion as it's handled separately
  if (block.name === 'AskUserQuestion') {
    return null;
  }

  // Special handling for Bash tool
  if (block.name === 'Bash') {
    const input = block.input as { command?: string; description?: string } | undefined;
    const command = input?.command || '';
    const description = input?.description || '';
    return (
      <div className="mt-2 p-3 bg-muted/50 rounded border border-border">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold text-primary">Bash</span>
          {description && <span className="text-xs text-muted-foreground">{description}</span>}
        </div>
        <pre className="text-xs bg-background p-2 rounded border border-border font-mono text-foreground whitespace-pre-wrap break-all">
          $ {command}
        </pre>
      </div>
    );
  }

  // Generic tool use
  return (
    <div className="mt-2 p-2 bg-muted/50 rounded border border-border font-mono text-xs">
      <div className="text-primary font-semibold">{block.name || 'tool'}</div>
      <pre className="mt-1 text-muted-foreground whitespace-pre-wrap break-all">
        {escapeHtml(JSON.stringify(block.input, null, 2))}
      </pre>
    </div>
  );
}

interface ToolResultBlockProps {
  block: MessageContent;
}

function ToolResultBlock({ block }: ToolResultBlockProps) {
  return (
    <div className="mt-2 p-2 bg-muted/50 rounded border border-border font-mono text-xs">
      <div className="text-primary font-semibold">Tool Result</div>
      <pre className="mt-1 text-muted-foreground whitespace-pre-wrap break-all">
        {escapeHtml(typeof block.content === 'string' ? block.content : JSON.stringify(block.content, null, 2))}
      </pre>
    </div>
  );
}

export function AssistantMessage({ event }: AssistantMessageProps) {
  if (!event.message) {
    return (
      <div className="flex gap-3 mb-4 px-4 py-2 hover:bg-muted/30">
        <Avatar type="assistant" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-semibold text-purple-400">Claude</span>
            {event.timestamp && (
              <span className="text-xs text-muted-foreground">
                {formatTime(event.timestamp)}
              </span>
            )}
          </div>
          <pre className="text-xs text-muted-foreground">{JSON.stringify(event, null, 2)}</pre>
        </div>
      </div>
    );
  }

  const content = event.message.content;

  // Handle string content
  if (typeof content === 'string') {
    return (
      <div className="flex gap-3 mb-4 px-4 py-2 hover:bg-muted/30">
        <Avatar type="assistant" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-semibold text-purple-400">Claude</span>
            {event.timestamp && (
              <span className="text-xs text-muted-foreground">
                {formatTime(event.timestamp)}
              </span>
            )}
          </div>
          <div className="text-sm">
            <MarkdownRenderer content={content} />
          </div>
        </div>
      </div>
    );
  }

  // Handle array content (text blocks + tool uses + tool results)
  if (Array.isArray(content)) {
    return (
      <div className="flex gap-3 mb-4 px-4 py-2 hover:bg-muted/30">
        <Avatar type="assistant" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-semibold text-purple-400">Claude</span>
            {event.timestamp && (
              <span className="text-xs text-muted-foreground">
                {formatTime(event.timestamp)}
              </span>
            )}
          </div>
          <div className="text-sm">
            {content.map((block, idx) => {
              if (block.type === 'text') {
                return <MarkdownRenderer key={idx} content={block.text || ''} />;
              }
              if (block.type === 'tool_use') {
                return <ToolUseBlock key={idx} block={block} />;
              }
              if (block.type === 'tool_result') {
                return <ToolResultBlock key={idx} block={block} />;
              }
              return null;
            })}
          </div>
        </div>
      </div>
    );
  }

  // Fallback for unknown content type
  return (
    <div className="flex gap-3 mb-4 px-4 py-2 hover:bg-muted/30">
      <Avatar type="assistant" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-semibold text-purple-400">Claude</span>
          {event.timestamp && (
            <span className="text-xs text-muted-foreground">
              {formatTime(event.timestamp)}
            </span>
          )}
        </div>
        <pre className="text-xs text-muted-foreground">{JSON.stringify(content, null, 2)}</pre>
      </div>
    </div>
  );
}
