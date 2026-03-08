import type { Message, MessageContent } from '@/types';
import {
  UserMessage,
  AssistantMessage,
  SystemMessage,
  ErrorMessage,
  ThinkingIndicator,
  ControlRequest,
  ControlResponse,
  CompactSummary,
  SystemReminderBanner,
  DebugMessage,
} from '@/components/message';
import { extractText, isCliInternalContent, isSystemReminderOnly } from '@/components/message/utils';

interface MessageItemProps {
  event: Message;
  events?: Message[];
  externalToolResults?: Map<string, MessageContent>;
  answeredRequestIds?: Map<string, Record<string, unknown>>;
  onPermissionResponse?: (requestId: string, approved: boolean, updatedInput?: unknown) => void;
  onElicitationResponse?: (requestId: string, action: 'accept' | 'decline', content?: Record<string, unknown>) => void;
  onPlanApproval?: (requestId: string, action: 'approve' | 'reject', mode?: string, clearContext?: boolean, planContent?: string, feedback?: string) => void;
  debugMode?: boolean;
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
export function MessageItem({ event, events, externalToolResults, answeredRequestIds, onPermissionResponse, onElicitationResponse, onPlanApproval, debugMode }: MessageItemProps) {
  switch (event.type) {
    case 'user': {
      const text = extractText(event);
      if (isCliInternalContent(text)) {
        if (debugMode) return <DebugMessage label="cli_internal" event={event} />;
        return null;
      }
      if (isSystemReminderOnly(text)) {
        return <SystemReminderBanner event={event} />;
      }
      if (event.isSynthetic) {
        return <CompactSummary event={event} />;
      }
      return <UserMessage event={event} />;
    }

    case 'assistant':
      return <AssistantMessage event={event} events={events} externalToolResults={externalToolResults} />;

    case 'system':
      return <SystemMessage event={event} />;

    case 'result':
      return <ErrorMessage event={event} debugMode={debugMode} />;

    case 'control_request':
      return (
        <ControlRequest
          event={event}
          answeredRequestIds={answeredRequestIds}
          onPermissionResponse={onPermissionResponse}
          onElicitationResponse={onElicitationResponse}
          onPlanApproval={onPlanApproval}
        />
      );

    case 'control_response':
      return <ControlResponse event={event} />;

    case 'stream_event':
      return <ThinkingIndicator timestamp={event.timestamp} />;

    case 'keep_alive':
      if (debugMode) return <DebugMessage label="keep_alive" event={event} />;
      return null;

    default:
      // Unknown message type - log for debugging but don't crash
      console.warn('[MessageItem] Unknown message type:', event.type, event);
      if (debugMode) return <DebugMessage label="unknown" event={event} />;
      return null;
  }
}
