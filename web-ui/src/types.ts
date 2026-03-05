export interface Environment {
  id: string;
  machine_name: string;
  directory: string;
  branch?: string;
  last_poll_at?: number;
}

export interface Session {
  id: string;
  title: string;
  environment_id: string;
  status: 'active' | 'archived';
  created_at: number;
  message_count: number;
}

export interface MessageContent {
  type: string;
  text?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
  id?: string;           // tool_use block ID (Claude API standard)
  tool_use_id?: string;  // tool_result references this to associate with tool_use
  is_error?: boolean;    // tool_result error flag
}

export interface Message {
  type: 'user' | 'assistant' | 'system' | 'result' | 'control_request' | 'control_response' | 'stream_event' | 'keep_alive';
  subtype?: string;
  uuid?: string;
  timestamp?: number;
  message?: {
    content: string | MessageContent[];
  };
  request?: {
    subtype?: string;
    tool_name?: string;
    description?: string;
    input?: {
      questions?: Question[];
    };
    request_id?: string;
    mcp_server_name?: string;
    message?: string;
    requested_schema?: {
      properties?: Record<string, {
        title?: string;
        type?: string;
        description?: string;
        enum?: unknown[];
      }>;
    };
  };
  request_id?: string;
  is_error?: boolean;
  result?: string;
  state?: string;
  events?: EventMessage[];
  response?: {
    subtype?: string;
    request_id?: string;
    response?: {
      behavior?: string;
      action?: string;
      content?: unknown;
      updatedInput?: unknown;
    };
  };
}

export interface EventMessage extends Message {
  // Event from history or batch
}

export interface Question {
  header?: string;
  question: string;
  options: {
    label: string;
    description?: string;
  }[];
  multiSelect?: boolean;
}

export type WebSocketMessage = Partial<Omit<Message, 'type'>> & {
  type?: Message['type'] | 'connection_status' | 'history';
  cli_connected?: boolean;
  events?: EventMessage[];
};
