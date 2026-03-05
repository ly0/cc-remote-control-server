import { CodeBlock, DiffView, CollapsibleSection } from './ToolCallRenderer';

interface ToolInputDisplayProps {
  toolName: string;
  input: Record<string, unknown>;
}

export function ToolInputDisplay({ toolName, input }: ToolInputDisplayProps) {
  switch (toolName) {
    case 'Bash': {
      const command = (input.command as string) || '';
      const description = (input.description as string) || '';
      return (
        <>
          {description && <p className="text-sm mb-2">{description}</p>}
          <CodeBlock content={`$ ${command}`} language="bash" />
        </>
      );
    }
    case 'Read': {
      const filePath = (input.file_path as string) || '';
      const offset = input.offset as number | undefined;
      const limit = input.limit as number | undefined;
      const parts: string[] = [filePath];
      if (offset) parts.push(`from line ${offset}`);
      if (limit) parts.push(`${limit} lines`);
      return <p className="text-sm font-mono">{parts.join(', ')}</p>;
    }
    case 'Write': {
      const filePath = (input.file_path as string) || '';
      const content = (input.content as string) || '';
      return (
        <>
          <p className="text-sm font-mono mb-2">{filePath}</p>
          {content && (
            <CollapsibleSection label="File content">
              <CodeBlock content={content} />
            </CollapsibleSection>
          )}
        </>
      );
    }
    case 'Edit': {
      const filePath = (input.file_path as string) || '';
      const oldString = (input.old_string as string) || '';
      const newString = (input.new_string as string) || '';
      return (
        <>
          <p className="text-sm font-mono mb-2">{filePath}</p>
          <DiffView oldStr={oldString} newStr={newString} />
        </>
      );
    }
    case 'Glob': {
      const pattern = (input.pattern as string) || '';
      const path = (input.path as string) || '';
      return <p className="text-sm font-mono">{pattern}{path ? ` in ${path}` : ''}</p>;
    }
    case 'Grep': {
      const pattern = (input.pattern as string) || '';
      const path = (input.path as string) || '';
      return <p className="text-sm font-mono">/{pattern}/{path ? ` in ${path}` : ''}</p>;
    }
    case 'WebFetch': {
      const url = (input.url as string) || '';
      return <p className="text-sm font-mono break-all">{url}</p>;
    }
    case 'WebSearch': {
      const query = (input.query as string) || '';
      return <p className="text-sm">{query}</p>;
    }
    case 'Task': {
      const description = (input.description as string) || '';
      const subagentType = (input.subagent_type as string) || '';
      return <p className="text-sm">[{subagentType}] {description}</p>;
    }
    default: {
      const entries = Object.entries(input).filter(([, v]) => v !== undefined && v !== null);
      if (entries.length === 0) return null;
      return (
        <dl className="text-sm space-y-1">
          {entries.map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <dt className="text-muted-foreground font-mono shrink-0">{key}:</dt>
              <dd className="font-mono break-all">
                {typeof value === 'string' ? value : JSON.stringify(value)}
              </dd>
            </div>
          ))}
        </dl>
      );
    }
  }
}
