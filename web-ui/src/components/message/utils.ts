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

// CLI 内部 XML 标签列表（来自 cli.js 的 CNK 数组）
const CLI_INTERNAL_TAGS = [
  'ide_opened_file', 'ide_selection',
  'command-name', 'command-message', 'command-args',
  'session-start-hook', 'tick', 'goal',
  'bash-input', 'bash-stdout', 'bash-stderr',
  'local-command-stdout', 'local-command-stderr', 'local-command-caveat',
];

const CLI_INTERNAL_TAG_RE = new RegExp(
  CLI_INTERNAL_TAGS.map(t => `<${t}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${t}>\\n?`).join('|'),
  'g'
);

/** 检测文本内容是否全部由 CLI 内部 XML 标签组成 */
export function isCliInternalContent(text: string): boolean {
  return text.trim().length > 0 && text.replace(CLI_INTERNAL_TAG_RE, '').trim() === '';
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
