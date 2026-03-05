import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import type { Message } from '@/types';
import { AskUserQuestion } from './AskUserQuestion';
import { ToolInputDisplay } from './ToolInputDisplay';

interface PermissionRequestProps {
  event: Message;
  onPermissionResponse?: (requestId: string, approved: boolean, updatedInput?: unknown) => void;
}

export function PermissionRequest({ event, onPermissionResponse }: PermissionRequestProps) {
  const [answered, setAnswered] = useState(false);

  const req = event.request;
  const requestId = event.request_id || req?.request_id;
  const toolName = req?.tool_name || 'unknown tool';

  // Handle AskUserQuestion specially
  if (toolName === 'AskUserQuestion' && req?.input?.questions) {
    return (
      <AskUserQuestion
        questions={req.input.questions}
        onSubmit={(updatedInput) => onPermissionResponse?.(requestId || '', true, updatedInput)}
      />
    );
  }

  const rawInput = (req?.input || {}) as Record<string, unknown>;

  const handleResponse = (approved: boolean) => {
    setAnswered(true);
    onPermissionResponse?.(requestId || '', approved);
  };

  return (
    <Card className={`p-4 border-warning/30 bg-warning/10 ${answered ? 'opacity-60 pointer-events-none' : ''}`}>
      <div className="flex items-center gap-2 mb-2">
        <AlertCircle className="w-4 h-4 text-warning" />
        <span className="font-semibold text-sm">Permission Required</span>
      </div>
      <Badge variant="secondary" className="mb-2 font-mono">{toolName}</Badge>
      <div className="mb-3">
        <ToolInputDisplay toolName={toolName} input={rawInput} />
      </div>
      {!answered && (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => handleResponse(true)}>
            <CheckCircle className="w-4 h-4 mr-1" />
            Allow
          </Button>
          <Button size="sm" variant="destructive" onClick={() => handleResponse(false)}>
            <XCircle className="w-4 h-4 mr-1" />
            Deny
          </Button>
        </div>
      )}
      {answered && (
        <Badge variant="outline" className="text-success border-success">
          <CheckCircle className="w-3 h-3 mr-1" />
          Responded
        </Badge>
      )}
    </Card>
  );
}
