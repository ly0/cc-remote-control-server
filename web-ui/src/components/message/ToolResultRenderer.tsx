import { useState } from 'react';
import { ChevronDown, ChevronRight, AlertCircle, CheckCircle } from 'lucide-react';
import type { MessageContent } from '@/types';

interface ToolResultRendererProps {
  block: MessageContent;
}

const COLLAPSE_THRESHOLD = 10;
const PREVIEW_LINES = 3;

function getResultText(block: MessageContent): string {
  const content = block.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item: unknown) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'text' in item) return (item as { text: string }).text;
        return JSON.stringify(item);
      })
      .join('\n');
  }
  if (content === undefined || content === null) return '';
  return JSON.stringify(content, null, 2);
}

export function ToolResultRenderer({ block }: ToolResultRendererProps) {
  const text = getResultText(block);
  const lines = text.split('\n');
  const isLong = lines.length > COLLAPSE_THRESHOLD;
  const [expanded, setExpanded] = useState(!isLong);
  const isError = block.is_error === true;

  if (!text) return null;

  const displayText = expanded ? text : lines.slice(0, PREVIEW_LINES).join('\n');

  return (
    <div
      className={`mt-2 rounded border text-xs ${
        isError
          ? 'border-destructive/50 bg-destructive/10'
          : 'border-border bg-muted/20'
      }`}
    >
      <div
        className="flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        {isError ? (
          <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
        ) : (
          <CheckCircle className="w-3.5 h-3.5 text-success shrink-0" />
        )}
        <span className={`font-medium ${isError ? 'text-destructive' : 'text-muted-foreground'}`}>
          {isError ? 'Error' : 'Result'}
        </span>
        {isLong && (
          <span className="ml-auto text-muted-foreground flex items-center gap-1">
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </span>
        )}
      </div>
      <div className="tool-result-content" style={{ maxHeight: expanded ? 'none' : undefined }}>
        <pre className="px-2.5 pb-2 font-mono text-muted-foreground whitespace-pre-wrap break-all overflow-hidden">
          {displayText}
        </pre>
        {!expanded && isLong && (
          <button
            className="px-2.5 pb-2 text-primary hover:underline cursor-pointer text-xs"
            onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
          >
            ...expand all ({lines.length} lines)
          </button>
        )}
      </div>
    </div>
  );
}
