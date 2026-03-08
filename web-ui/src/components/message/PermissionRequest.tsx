import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import type { Message } from '@/types';
import { AskUserQuestion } from './AskUserQuestion';
import { ToolInputDisplay } from './ToolInputDisplay';

interface PermissionRequestProps {
  event: Message;
  isAlreadyAnswered?: boolean;
  responseData?: Record<string, unknown>;
  onPermissionResponse?: (requestId: string, approved: boolean, updatedInput?: unknown) => void;
}

export function PermissionRequest({ event, isAlreadyAnswered, responseData, onPermissionResponse }: PermissionRequestProps) {
  const [answered, setAnswered] = useState(isAlreadyAnswered || false);
  const [localBehavior, setLocalBehavior] = useState<'allow' | 'deny' | null>(null);

  useEffect(() => {
    if (isAlreadyAnswered) setAnswered(true);
  }, [isAlreadyAnswered]);

  const req = event.request;
  const requestId = event.request_id || req?.request_id;
  const toolName = req?.tool_name || 'unknown tool';

  // Determine the behavior to display
  const behavior = localBehavior || (responseData?.behavior as string | undefined);

  // Handle AskUserQuestion specially
  if (toolName === 'AskUserQuestion' && req?.input?.questions) {
    return (
      <AskUserQuestion
        questions={req.input.questions}
        isAlreadyAnswered={isAlreadyAnswered}
        responseData={responseData}
        onSubmit={(updatedInput) => onPermissionResponse?.(requestId || '', true, updatedInput)}
      />
    );
  }

  const rawInput = (req?.input || {}) as Record<string, unknown>;

  const handleResponse = (approved: boolean) => {
    setAnswered(true);
    setLocalBehavior(approved ? 'allow' : 'deny');
    onPermissionResponse?.(requestId || '', approved);
  };

  if (answered) {
    return (
      <div className="flex items-center gap-2 px-4 py-1.5 text-sm text-muted-foreground">
        <AlertCircle className="w-4 h-4 text-warning" />
        <Badge variant="secondary" className="font-mono">{toolName}</Badge>
        <span>—</span>
        {behavior === 'deny' ? (
          <Badge variant="outline" className="text-destructive border-destructive">
            <XCircle className="w-3 h-3 mr-1" />
            Denied
          </Badge>
        ) : behavior === 'allow' ? (
          <Badge variant="outline" className="text-success border-success">
            <CheckCircle className="w-3 h-3 mr-1" />
            Allowed
          </Badge>
        ) : (
          <Badge variant="outline" className="text-success border-success">
            <CheckCircle className="w-3 h-3 mr-1" />
            Responded
          </Badge>
        )}
      </div>
    );
  }

  return (
    <Card className="p-4 border-warning/30 bg-warning/10">
      <div className="flex items-center gap-2 mb-2">
        <AlertCircle className="w-4 h-4 text-warning" />
        <span className="font-semibold text-sm">Permission Required</span>
      </div>
      <Badge variant="secondary" className="mb-2 font-mono">{toolName}</Badge>
      <div className="mb-3">
        <ToolInputDisplay toolName={toolName} input={rawInput} />
      </div>
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
    </Card>
  );
}
