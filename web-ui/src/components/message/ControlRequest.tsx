import type { Message } from '@/types';
import { PermissionRequest } from './PermissionRequest';
import { Elicitation } from './Elicitation';

interface ControlRequestProps {
  event: Message;
  onPermissionResponse?: (requestId: string, approved: boolean, updatedInput?: unknown) => void;
  onElicitationResponse?: (requestId: string, action: 'accept' | 'decline', content?: Record<string, unknown>) => void;
}

export function ControlRequest({ event, onPermissionResponse, onElicitationResponse }: ControlRequestProps) {
  const subtype = event.request?.subtype;

  if (subtype === 'can_use_tool') {
    return (
      <div className="px-4 mb-4">
        <PermissionRequest event={event} onPermissionResponse={onPermissionResponse} />
      </div>
    );
  }

  if (subtype === 'elicitation') {
    return (
      <div className="px-4 mb-4">
        <Elicitation event={event} onElicitationResponse={onElicitationResponse} />
      </div>
    );
  }

  // Unknown control request subtype - don't render
  return null;
}
