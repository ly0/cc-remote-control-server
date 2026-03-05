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
