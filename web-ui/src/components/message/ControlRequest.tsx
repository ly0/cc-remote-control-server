import type { Message } from '@/types';
import { PermissionRequest } from './PermissionRequest';
import { Elicitation } from './Elicitation';

interface ControlRequestProps {
  event: Message;
  answeredRequestIds?: Map<string, Record<string, unknown>>;
  onPermissionResponse?: (requestId: string, approved: boolean, updatedInput?: unknown) => void;
  onElicitationResponse?: (requestId: string, action: 'accept' | 'decline', content?: Record<string, unknown>) => void;
}

export function ControlRequest({ event, answeredRequestIds, onPermissionResponse, onElicitationResponse }: ControlRequestProps) {
  const subtype = event.request?.subtype;
  const requestId = event.request_id || event.request?.request_id;
  const responseData = requestId ? answeredRequestIds?.get(requestId) : undefined;
  const isAlreadyAnswered = !!responseData;

  if (subtype === 'can_use_tool') {
    return (
      <div className="px-4 mb-4">
        <PermissionRequest event={event} isAlreadyAnswered={isAlreadyAnswered} responseData={responseData} onPermissionResponse={onPermissionResponse} />
      </div>
    );
  }

  if (subtype === 'elicitation') {
    return (
      <div className="px-4 mb-4">
        <Elicitation event={event} isAlreadyAnswered={isAlreadyAnswered} responseData={responseData} onElicitationResponse={onElicitationResponse} />
      </div>
    );
  }

  // Unknown control request subtype - don't render
  return null;
}
