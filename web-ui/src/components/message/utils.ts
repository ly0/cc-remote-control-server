import type { MessageContent, Message } from '@/types';

export function escapeHtml(str: string | undefined | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatTime(ts: number | undefined): string {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString();
}

export function extractText(event: Message): string {
  if (!event.message) return JSON.stringify(event);
  const content = event.message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: MessageContent) => b.type === 'text')
      .map((b: MessageContent) => b.text)
      .join('\n');
  }
  return JSON.stringify(content);
}

export function extractToolResultText(event: Message): string {
  if (!event.message) return '';
  const content = event.message.content;
  if (!Array.isArray(content)) return '';
  const results = content.filter((b: MessageContent) => b.type === 'tool_result');
  if (results.length === 0) return '';
  return results
    .map((b: MessageContent) => (typeof b.content === 'string' ? b.content : ''))
    .filter(Boolean)
    .join('\n');
}

export function renderAssistantContent(event: Message): string {
  if (!event.message) return escapeHtml(JSON.stringify(event));
  const content = event.message.content;
  if (!content) return '';
  if (typeof content === 'string') return escapeHtml(content);
  if (!Array.isArray(content)) return escapeHtml(JSON.stringify(content));

  let html = '';
  for (const block of content) {
    if (block.type === 'text') {
      html += escapeHtml(block.text);
    } else if (block.type === 'tool_use' && block.name === 'AskUserQuestion') {
      continue;
    } else if (block.type === 'tool_use' && block.name === 'Bash') {
      // Special handling for Bash tool - show command and description nicely
      const input = block.input as { command?: string; description?: string } | undefined;
      const command = input?.command || '';
      const description = input?.description || '';
      html += `<div class="mt-2 p-3 bg-muted/50 rounded border border-border">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs font-semibold text-primary">Bash</span>
            ${description ? `<span class="text-xs text-muted-foreground">${escapeHtml(description)}</span>` : ''}
          </div>
          <pre class="text-xs bg-background p-2 rounded border border-border font-mono text-foreground whitespace-pre-wrap break-all">$ ${escapeHtml(command)}</pre>
        </div>`;
    } else if (block.type === 'tool_use') {
      html += `<div class="mt-2 p-2 bg-muted/50 rounded border border-border font-mono text-xs">
          <div class="text-primary font-semibold">${escapeHtml(block.name || 'tool')}</div>
          <pre class="mt-1 text-muted-foreground whitespace-pre-wrap break-all">${escapeHtml(JSON.stringify(block.input, null, 2))}</pre>
        </div>`;
    } else if (block.type === 'tool_result') {
      html += `<div class="mt-2 p-2 bg-muted/50 rounded border border-border font-mono text-xs">
          <div class="text-primary font-semibold">Tool Result</div>
          <pre class="mt-1 text-muted-foreground whitespace-pre-wrap break-all">${escapeHtml(typeof block.content === 'string' ? block.content : JSON.stringify(block.content, null, 2))}</pre>
        </div>`;
    }
  }
  return html;
}
