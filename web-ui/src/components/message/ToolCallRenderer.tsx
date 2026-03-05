import { useState } from 'react';
import {
  Terminal,
  FileText,
  FilePlus,
  FileEdit,
  Search,
  FileSearch,
  Users,
  Globe,
  Zap,
  PackageSearch,
  ClipboardList,
  ClipboardCheck,
  BookOpen,
  ListChecks,
  MessageSquare,
  Wrench,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { MessageContent } from '@/types';
import { ToolResultRenderer } from './ToolResultRenderer';

interface ToolCallRendererProps {
  block: MessageContent;
  result?: MessageContent;
}

// --- Collapsible section helper ---
export function CollapsibleSection({
  defaultOpen = false,
  label,
  children,
}: {
  defaultOpen?: boolean;
  label?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer select-none py-0.5"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {label && <span>{label}</span>}
      </button>
      {open && <div className="mt-1">{children}</div>}
    </div>
  );
}

// --- Tool card wrapper ---
function ToolCard({
  icon: Icon,
  name,
  summary,
  children,
  result,
}: {
  icon: LucideIcon;
  name: string;
  summary?: React.ReactNode;
  children?: React.ReactNode;
  result?: MessageContent;
}) {
  return (
    <div className="mt-2 rounded-md border border-border bg-muted/30 overflow-hidden">
      <div className="px-3 py-2 flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary shrink-0" />
        <span className="text-xs font-semibold text-primary">{name}</span>
        {summary && (
          <span className="text-xs text-muted-foreground truncate ml-1">{summary}</span>
        )}
      </div>
      {children && <div className="px-3 pb-2">{children}</div>}
      {result && (
        <div className="px-3 pb-2">
          <ToolResultRenderer block={result} />
        </div>
      )}
    </div>
  );
}

// --- Code block helper ---
export function CodeBlock({ content, language }: { content: string; language?: string }) {
  return (
    <pre
      className="text-xs bg-background p-2 rounded border border-border font-mono text-foreground whitespace-pre-wrap break-all"
      data-language={language}
    >
      {content}
    </pre>
  );
}

// --- Diff view for Edit tool ---
export function DiffView({ oldStr, newStr }: { oldStr: string; newStr: string }) {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');
  return (
    <pre className="text-xs bg-background p-2 rounded border border-border font-mono whitespace-pre-wrap break-all">
      {oldLines.map((line, i) => (
        <div key={`old-${i}`} className="diff-remove">
          <span className="select-none text-muted-foreground mr-2">-</span>
          {line}
        </div>
      ))}
      {newLines.map((line, i) => (
        <div key={`new-${i}`} className="diff-add">
          <span className="select-none text-muted-foreground mr-2">+</span>
          {line}
        </div>
      ))}
    </pre>
  );
}

// --- Individual tool renderers ---

function BashRenderer({ input, result }: { input: Record<string, unknown>; result?: MessageContent }) {
  const command = (input.command as string) || '';
  const description = (input.description as string) || '';
  return (
    <ToolCard icon={Terminal} name="Bash" summary={description} result={result}>
      <CodeBlock content={`$ ${command}`} language="bash" />
    </ToolCard>
  );
}

function ReadRenderer({ input, result }: { input: Record<string, unknown>; result?: MessageContent }) {
  const filePath = (input.file_path as string) || '';
  const offset = input.offset as number | undefined;
  const limit = input.limit as number | undefined;
  const rangeInfo = offset || limit
    ? ` (${offset ? `from line ${offset}` : ''}${offset && limit ? ', ' : ''}${limit ? `${limit} lines` : ''})`
    : '';
  return (
    <ToolCard icon={FileText} name="Read" summary={filePath + rangeInfo} result={result} />
  );
}

function WriteRenderer({ input, result }: { input: Record<string, unknown>; result?: MessageContent }) {
  const filePath = (input.file_path as string) || '';
  const content = (input.content as string) || '';
  return (
    <ToolCard icon={FilePlus} name="Write" summary={filePath} result={result}>
      <CollapsibleSection label="File content">
        <CodeBlock content={content} />
      </CollapsibleSection>
    </ToolCard>
  );
}

function EditRenderer({ input, result }: { input: Record<string, unknown>; result?: MessageContent }) {
  const filePath = (input.file_path as string) || '';
  const oldString = (input.old_string as string) || '';
  const newString = (input.new_string as string) || '';
  return (
    <ToolCard icon={FileEdit} name="Edit" summary={filePath} result={result}>
      <DiffView oldStr={oldString} newStr={newString} />
    </ToolCard>
  );
}

function GlobRenderer({ input, result }: { input: Record<string, unknown>; result?: MessageContent }) {
  const pattern = (input.pattern as string) || '';
  const path = (input.path as string) || '';
  return (
    <ToolCard icon={Search} name="Glob" summary={`${pattern}${path ? ` in ${path}` : ''}`} result={result} />
  );
}

function GrepRenderer({ input, result }: { input: Record<string, unknown>; result?: MessageContent }) {
  const pattern = (input.pattern as string) || '';
  const path = (input.path as string) || '';
  const fileType = (input.type as string) || '';
  const glob = (input.glob as string) || '';
  const parts: string[] = [];
  if (path) parts.push(`in ${path}`);
  if (fileType) parts.push(`type:${fileType}`);
  if (glob) parts.push(`glob:${glob}`);
  return (
    <ToolCard
      icon={FileSearch}
      name="Grep"
      summary={`/${pattern}/ ${parts.join(' ')}`}
      result={result}
    />
  );
}

function TaskRenderer({ input, result }: { input: Record<string, unknown>; result?: MessageContent }) {
  const subagentType = (input.subagent_type as string) || '';
  const description = (input.description as string) || '';
  const prompt = (input.prompt as string) || '';
  return (
    <ToolCard icon={Users} name="Task" summary={`[${subagentType}] ${description}`} result={result}>
      {prompt && (
        <CollapsibleSection label="Prompt">
          <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all bg-background p-2 rounded border border-border">
            {prompt}
          </pre>
        </CollapsibleSection>
      )}
    </ToolCard>
  );
}

function WebFetchRenderer({ input, result }: { input: Record<string, unknown>; result?: MessageContent }) {
  const url = (input.url as string) || '';
  const prompt = (input.prompt as string) || '';
  return (
    <ToolCard icon={Globe} name="WebFetch" summary={url} result={result}>
      {prompt && (
        <CollapsibleSection label="Prompt">
          <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">{prompt}</pre>
        </CollapsibleSection>
      )}
    </ToolCard>
  );
}

function WebSearchRenderer({ input, result }: { input: Record<string, unknown>; result?: MessageContent }) {
  const query = (input.query as string) || '';
  return <ToolCard icon={Search} name="WebSearch" summary={query} result={result} />;
}

function SkillRenderer({ input, result }: { input: Record<string, unknown>; result?: MessageContent }) {
  const skill = (input.skill as string) || '';
  const args = (input.args as string) || '';
  return <ToolCard icon={Zap} name="Skill" summary={`/${skill}${args ? ` ${args}` : ''}`} result={result} />;
}

function ToolSearchRenderer({ input, result }: { input: Record<string, unknown>; result?: MessageContent }) {
  const query = (input.query as string) || '';
  return <ToolCard icon={PackageSearch} name="ToolSearch" summary={query} result={result} />;
}

function EnterPlanModeRenderer({ result }: { result?: MessageContent }) {
  return <ToolCard icon={ClipboardList} name="EnterPlanMode" summary="Enter plan mode" result={result} />;
}

function ExitPlanModeRenderer({ result }: { result?: MessageContent }) {
  return <ToolCard icon={ClipboardCheck} name="ExitPlanMode" summary="Exit plan mode" result={result} />;
}

function NotebookEditRenderer({ input, result }: { input: Record<string, unknown>; result?: MessageContent }) {
  const path = (input.notebook_path as string) || '';
  const cellNumber = input.cell_number as number | undefined;
  const editMode = (input.edit_mode as string) || 'replace';
  const newSource = (input.new_source as string) || '';
  return (
    <ToolCard
      icon={BookOpen}
      name="NotebookEdit"
      summary={`${path}${cellNumber !== undefined ? ` cell#${cellNumber}` : ''} [${editMode}]`}
      result={result}
    >
      {newSource && (
        <CollapsibleSection label="Cell content">
          <CodeBlock content={newSource} />
        </CollapsibleSection>
      )}
    </ToolCard>
  );
}

function TaskManagementRenderer({ input, name }: { input: Record<string, unknown>; name: string; result?: MessageContent }) {
  let summary = '';
  switch (name) {
    case 'TaskCreate':
      summary = `Created task: ${(input.subject as string) || ''}`;
      break;
    case 'TaskUpdate':
      summary = `Updated task #${(input.taskId as string) || ''}${input.status ? `: ${input.status}` : ''}`;
      break;
    case 'TaskList':
      summary = 'Listed tasks';
      break;
    case 'TaskGet':
      summary = `Retrieved task #${(input.taskId as string) || ''}`;
      break;
    default:
      summary = name;
  }
  return (
    <div className="mt-1 px-3 py-1 flex items-center gap-2 text-xs text-muted-foreground">
      <ListChecks className="w-3.5 h-3.5 shrink-0" />
      <span>{summary}</span>
    </div>
  );
}

function TodoWriteRenderer({ input }: { input: Record<string, unknown>; result?: MessageContent }) {
  const todos = input.todos;
  const count = Array.isArray(todos) ? todos.length : 0;
  return (
    <div className="mt-1 px-3 py-1 flex items-center gap-2 text-xs text-muted-foreground">
      <ListChecks className="w-3.5 h-3.5 shrink-0" />
      <span>Updated todo list ({count} items)</span>
    </div>
  );
}

function SendMessageRenderer({ input, result }: { input: Record<string, unknown>; result?: MessageContent }) {
  const recipient = (input.recipient as string) || '';
  const msgType = (input.type as string) || 'message';
  const content = (input.content as string) || '';
  const summary = (input.summary as string) || '';
  return (
    <ToolCard
      icon={MessageSquare}
      name="SendMessage"
      summary={`[${msgType}] to ${recipient}`}
      result={result}
    >
      {summary && <div className="text-xs text-muted-foreground mb-1">{summary}</div>}
      {content && (
        <CollapsibleSection label="Full message">
          <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">{content}</pre>
        </CollapsibleSection>
      )}
    </ToolCard>
  );
}

function AskUserQuestionRenderer({ input, result }: { input: Record<string, unknown>; result?: MessageContent }) {
  // AskUserQuestion is handled separately in AssistantMessage but we still render a minimal card
  const questions = input.questions as unknown[];
  const count = Array.isArray(questions) ? questions.length : 0;
  return (
    <ToolCard icon={MessageSquare} name="AskUserQuestion" summary={`${count} question(s)`} result={result} />
  );
}

function GenericToolRenderer({ block, result }: { block: MessageContent; result?: MessageContent }) {
  const input = block.input as Record<string, unknown> | undefined;
  return (
    <ToolCard icon={Wrench} name={block.name || 'Unknown Tool'} result={result}>
      {input && Object.keys(input).length > 0 && (
        <CollapsibleSection label="Parameters">
          <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
            {JSON.stringify(input, null, 2)}
          </pre>
        </CollapsibleSection>
      )}
    </ToolCard>
  );
}

// --- Main dispatcher ---
export function ToolCallRenderer({ block, result }: ToolCallRendererProps) {
  const input = (block.input as Record<string, unknown>) || {};
  const name = block.name || '';

  switch (name) {
    case 'Bash':
      return <BashRenderer input={input} result={result} />;
    case 'Read':
      return <ReadRenderer input={input} result={result} />;
    case 'Write':
      return <WriteRenderer input={input} result={result} />;
    case 'Edit':
      return <EditRenderer input={input} result={result} />;
    case 'Glob':
      return <GlobRenderer input={input} result={result} />;
    case 'Grep':
      return <GrepRenderer input={input} result={result} />;
    case 'Task':
      return <TaskRenderer input={input} result={result} />;
    case 'WebFetch':
      return <WebFetchRenderer input={input} result={result} />;
    case 'WebSearch':
      return <WebSearchRenderer input={input} result={result} />;
    case 'Skill':
      return <SkillRenderer input={input} result={result} />;
    case 'ToolSearch':
      return <ToolSearchRenderer input={input} result={result} />;
    case 'EnterPlanMode':
      return <EnterPlanModeRenderer result={result} />;
    case 'ExitPlanMode':
      return <ExitPlanModeRenderer result={result} />;
    case 'NotebookEdit':
      return <NotebookEditRenderer input={input} result={result} />;
    case 'TaskCreate':
    case 'TaskUpdate':
    case 'TaskList':
    case 'TaskGet':
      return <TaskManagementRenderer input={input} name={name} result={result} />;
    case 'TodoWrite':
      return <TodoWriteRenderer input={input} result={result} />;
    case 'SendMessage':
      return <SendMessageRenderer input={input} result={result} />;
    case 'AskUserQuestion':
      return <AskUserQuestionRenderer input={input} result={result} />;
    default:
      return <GenericToolRenderer block={block} result={result} />;
  }
}
