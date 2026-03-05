import { useMemo } from 'react';
import { formatTime } from './utils';
import type { Message, MessageContent } from '@/types';
import { Avatar } from './Avatar';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ToolCallRenderer } from './ToolCallRenderer';
import { ToolResultRenderer } from './ToolResultRenderer';

interface AssistantMessageProps {
  event: Message;
  events?: Message[];
  externalToolResults?: Map<string, MessageContent>;
}

/**
 * Build a map from tool_use.id → tool_result block (for inline association).
 * Returns the map and a Set of indices that have been associated.
 */
function buildToolResultMap(content: MessageContent[]) {
  const resultMap = new Map<string, MessageContent>();
  const associatedIndices = new Set<number>();

  // First pass: collect all tool_result blocks by their tool_use_id
  content.forEach((block, idx) => {
    if (block.type === 'tool_result' && block.tool_use_id) {
      resultMap.set(block.tool_use_id, block);
      associatedIndices.add(idx);
    }
  });

  return { resultMap, associatedIndices };
}

export function AssistantMessage({ event, events, externalToolResults }: AssistantMessageProps) {
  // Merge content from multiple messages when grouped
  const content = useMemo(() => {
    if (!events || events.length <= 1) return event.message?.content;
    const merged: MessageContent[] = [];
    for (const e of events) {
      const c = e.message?.content;
      if (Array.isArray(c)) {
        merged.push(...c);
      } else if (typeof c === 'string' && c) {
        merged.push({ type: 'text', text: c });
      }
    }
    return merged.length > 0 ? merged : event.message?.content;
  }, [event, events]);

  // Memoize tool_result association map (internal + external cross-message results)
  const { resultMap, associatedIndices } = useMemo(() => {
    if (!content || !Array.isArray(content)) {
      return { resultMap: new Map<string, MessageContent>(), associatedIndices: new Set<number>() };
    }
    const internal = buildToolResultMap(content);
    // Merge external results (from subsequent user messages), internal takes priority
    if (externalToolResults) {
      for (const [id, result] of externalToolResults) {
        if (!internal.resultMap.has(id)) {
          internal.resultMap.set(id, result);
        }
      }
    }
    return internal;
  }, [content, externalToolResults]);

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
                // Skip AskUserQuestion - handled separately in the message flow
                if (block.name === 'AskUserQuestion') return null;
                // Look up associated result by tool_use id
                const associatedResult = block.id ? resultMap.get(block.id) : undefined;
                return <ToolCallRenderer key={idx} block={block} result={associatedResult} />;
              }
              if (block.type === 'tool_result') {
                // Skip if already associated with a tool_use (rendered inline)
                if (associatedIndices.has(idx)) return null;
                // Orphan tool_result - render standalone
                return (
                  <div key={idx} className="mt-2">
                    <ToolResultRenderer block={block} />
                  </div>
                );
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
