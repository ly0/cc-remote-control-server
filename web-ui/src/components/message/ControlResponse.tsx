import { useState } from 'react';
import type { Message } from '@/types';
import { Avatar } from './Avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';

interface ControlResponseProps {
  event: Message;
}

export function ControlResponse({ event }: ControlResponseProps) {
  const [showDetails, setShowDetails] = useState(false);
  const response = event.response;

  if (!response) return null;

  const responseData = response.response;

  // Get a summary of the response
  let summary = '';
  if (responseData?.behavior) {
    summary = responseData.behavior === 'allow' ? 'Allowed' : 'Denied';
  } else if (responseData?.action) {
    summary = responseData.action === 'accept' ? 'Accepted' : 'Declined';
  }

  return (
    <div className="flex gap-3 mb-4 px-4 py-2 hover:bg-muted/30">
      <Avatar type="system" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-semibold text-gray-400">Response</span>
          {event.timestamp && (
            <span className="text-xs text-muted-foreground">
              {new Date(event.timestamp).toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {summary && (
            <Badge variant="outline" className="text-success border-success">
              <CheckCircle className="w-3 h-3 mr-1" />
              {summary}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDetails(!showDetails)}
            className="h-6 text-xs"
          >
            {showDetails ? 'Hide' : 'Details'}
          </Button>
        </div>
        {showDetails && (
          <pre className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap break-all font-mono bg-muted/50 p-2 rounded">
            {JSON.stringify(response, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
