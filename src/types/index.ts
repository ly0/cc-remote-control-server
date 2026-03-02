import type { Response } from "express";

// ─── Environment ────────────────────────────────────────

export interface Environment {
  id: string;
  secret: string;
  machineName: string;
  directory: string;
  branch?: string;
  gitRepoUrl?: string;
  registeredAt: number;
  lastPollAt?: number;
}

export interface RegisterEnvironmentRequest {
  machine_name: string;
  directory: string;
  branch?: string;
  git_repo_url?: string;
}

export interface RegisterEnvironmentResponse {
  environment_id: string;
  environment_secret: string;
}

// ─── Work ───────────────────────────────────────────────

export interface WorkItem {
  id: string;
  secret: string;
  data: WorkData;
}

export interface WorkData {
  type: "session" | "healthcheck";
  id?: string;
}

export interface WorkSecret {
  version: number;
  session_ingress_token: string;
  api_base_url: string;
}

export interface PollWaiter {
  resolve: (item: WorkItem | null) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ─── Session ────────────────────────────────────────────

export interface Session {
  id: string;
  title: string;
  environmentId: string;
  source: string;
  status: "active" | "archived";
  messages: SessionMessage[];
  createdAt: number;
  permissionMode?: string;
}

export interface CreateSessionRequest {
  title: string;
  events?: any[];
  session_context?: any;
  environment_id: string;
  source?: string;
  permission_mode?: string;
}

export interface SessionMessage {
  type: string;
  subtype?: string;
  message?: any;
  session_id?: string;
  uuid?: string;
  parent_tool_use_id?: string;
  request_id?: string;
  request?: any;
  response?: any;
  timestamp: number;
  [key: string]: any;
}

// ─── Ingress Events ─────────────────────────────────────

export interface IngressEventBatch {
  events: SessionMessage[];
}

export interface ClientEvent {
  sequence_num: number;
  event_id: string;
  event_type: string;
  payload: any;
}

// ─── Control Messages ───────────────────────────────────

export interface ControlRequest {
  type: "control_request";
  request_id: string;
  request: {
    subtype: "initialize" | "set_model" | "set_max_thinking_tokens" | "interrupt";
    model?: string;
    max_thinking_tokens?: number | null;
  };
  session_id: string;
}

export interface ControlResponse {
  type: "control_response";
  response: {
    subtype: string;
    request_id: string;
    response?: any;
  };
  session_id: string;
}

// ─── Web API ────────────────────────────────────────────

export interface WebSendMessageRequest {
  message: string;
  parent_tool_use_id?: string;
}

export interface WebCreateSessionRequest {
  environment_id: string;
  title?: string;
  prompt?: string;
}

// ─── Long Poll ──────────────────────────────────────────

export interface LongPollRequest {
  res: Response;
  timer: ReturnType<typeof setTimeout>;
  abortController: AbortController;
}
