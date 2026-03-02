import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger";
import type { SessionMessage } from "../types";

const TAG = "conn";

export class ConnectionManager {
  // CLI session_ingress WebSocket connections: sessionId → ws
  private cliConnections = new Map<string, WebSocket>();

  // Web frontend WebSocket connections: sessionId → Set<ws>
  private webConnections = new Map<string, Set<WebSocket>>();

  // Sequence counters for SSE-style events
  private sequenceCounters = new Map<string, number>();

  // ─── CLI connections ───────────────────────────────────

  registerCliConnection(sessionId: string, ws: WebSocket): void {
    // Close existing connection if any
    const existing = this.cliConnections.get(sessionId);
    if (existing && existing.readyState === WebSocket.OPEN) {
      existing.close();
    }
    this.cliConnections.set(sessionId, ws);
    logger.info(TAG, `CLI connected for session ${sessionId}`);

    ws.on("close", () => {
      if (this.cliConnections.get(sessionId) === ws) {
        this.cliConnections.delete(sessionId);
        logger.info(TAG, `CLI disconnected for session ${sessionId}`);
      }
    });
  }

  getCliConnection(sessionId: string): WebSocket | undefined {
    return this.cliConnections.get(sessionId);
  }

  /**
   * Send a message to CLI via its session_ingress WebSocket.
   * CLI expects raw JSON strings (not SSE wrapped).
   */
  sendToCliSession(sessionId: string, message: any): boolean {
    const ws = this.cliConnections.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      const payload = JSON.stringify(message);
      ws.send(payload);
      logger.debug(TAG, `Sent to CLI session ${sessionId}: ${message.type || "unknown"}`);
      return true;
    }
    logger.warn(TAG, `No CLI connection for session ${sessionId}`);
    return false;
  }

  /**
   * Send a raw payload to CLI without client_event wrapping.
   * CLI's processLine expects top-level `type` field (e.g. "user", "control_request").
   * The payload is sent as JSON string + newline (CLI reads lines via Cr6.read()).
   */
  sendRawToCliSession(sessionId: string, payload: any): boolean {
    const ws = this.cliConnections.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload) + "\n");
      logger.debug(TAG, `Sent raw to CLI session ${sessionId}: ${payload.type || "unknown"}`);
      return true;
    }
    logger.warn(TAG, `No CLI connection for session ${sessionId}`);
    return false;
  }

  // ─── Web frontend connections ──────────────────────────

  registerWebConnection(sessionId: string, ws: WebSocket): void {
    if (!this.webConnections.has(sessionId)) {
      this.webConnections.set(sessionId, new Set());
    }
    this.webConnections.get(sessionId)!.add(ws);
    logger.info(TAG, `Web client connected for session ${sessionId}`);

    ws.on("close", () => {
      const conns = this.webConnections.get(sessionId);
      if (conns) {
        conns.delete(ws);
        if (conns.size === 0) this.webConnections.delete(sessionId);
      }
      logger.info(TAG, `Web client disconnected for session ${sessionId}`);
    });
  }

  /**
   * Send events to all connected web clients for a session.
   */
  sendToWebClients(sessionId: string, events: SessionMessage[]): void {
    const conns = this.webConnections.get(sessionId);
    if (!conns || conns.size === 0) {
      logger.debug(TAG, `No web clients for session ${sessionId}`);
      return;
    }

    const payload = JSON.stringify({ events });
    for (const ws of conns) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
    logger.debug(TAG, `Sent ${events.length} events to ${conns.size} web clients for session ${sessionId}`);
  }

  /**
   * Send a single event to all connected web clients.
   */
  sendEventToWebClients(sessionId: string, event: SessionMessage): void {
    this.sendToWebClients(sessionId, [event]);
  }

  // ─── Helpers ───────────────────────────────────────────

  private getNextSequence(sessionId: string): number {
    const current = this.sequenceCounters.get(sessionId) || 0;
    const next = current + 1;
    this.sequenceCounters.set(sessionId, next);
    return next;
  }

  /**
   * Wrap a payload as a client_event for SSE format (if needed).
   */
  wrapAsClientEvent(sessionId: string, payload: any): any {
    return {
      client_event: {
        sequence_num: this.getNextSequence(sessionId),
        event_id: uuidv4(),
        event_type: payload.type || "message",
        payload,
      },
    };
  }

  getCliSessionIds(): string[] {
    return Array.from(this.cliConnections.keys());
  }

  getWebSessionIds(): string[] {
    return Array.from(this.webConnections.keys());
  }

  hasCliConnection(sessionId: string): boolean {
    const ws = this.cliConnections.get(sessionId);
    return ws !== undefined && ws.readyState === WebSocket.OPEN;
  }
}
