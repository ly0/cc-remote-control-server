import type { Message, MessageContent } from '@/types';
import {
  UserMessage,
  AssistantMessage,
  SystemMessage,
  ErrorMessage,
  ThinkingIndicator,
  ControlRequest,
  ControlResponse,
} from '@/components/message';

interface MessageItemProps {
  event: Message;
  externalToolResults?: Map<string, MessageContent>;
  onPermissionResponse?: (requestId: string, approved: boolean, updatedInput?: unknown) => void;
  onElicitationResponse?: (requestId: string, action: 'accept' | 'decline', content?: Record<string, unknown>) => void;
}

/**
 * MessageItem - Main component that renders different message types
 *
 * Message types handled:
 * - user: User messages
 * - assistant: Claude's responses
 * - system: System notifications
 * - result: Error results (only shown if is_error is true)
 * - control_request: Permission requests, elicitation
 * - control_response: Response confirmations
 * - stream_event: Thinking indicator
 *
 * Hidden types (return null):
 * - keep_alive: Heartbeat messages
 * - connection_status: WebSocket connection status (handled separately)
 */
export function MessageItem({ event, externalToolResults, onPermissionResponse, onElicitationResponse }: MessageItemProps) {
  switch (event.type) {
    case 'user':
      return <UserMessage event={event} />;

    case 'assistant':
      return <AssistantMessage event={event} externalToolResults={externalToolResults} />;

    case 'system':
      return <SystemMessage event={event} />;

    case 'result':
      return <ErrorMessage event={event} />;

    case 'control_request':
      return (
        <ControlRequest
          event={event}
          onPermissionResponse={onPermissionResponse}
          onElicitationResponse={onElicitationResponse}
        />
      );

    case 'control_response':
      return <ControlResponse event={event} />;

    case 'stream_event':
      return <ThinkingIndicator timestamp={event.timestamp} />;

    case 'keep_alive':
      // Hidden message types
      return null;

    default:
      // Unknown message type - log for debugging but don't crash
      console.warn('[MessageItem] Unknown message type:', event.type, event);
      return null;
  }
}
