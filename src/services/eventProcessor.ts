import { v4 as uuidv4 } from "uuid";
import type { SessionManager } from "./sessionManager";
import type { ConnectionManager } from "./connectionManager";
import { logger } from "../utils/logger";

const TAG = "event-processor";

export class EventProcessor {
  constructor(
    private sessionManager: SessionManager,
    private connectionManager: ConnectionManager,
  ) {}

  /**
   * Process a single CLI event for plan mode detection and auto-approval.
   * Returns true if the event was intercepted (e.g. can_use_tool auto-approved),
   * meaning the caller should still store+forward but skip default handling.
   */
  processCliEvent(sessionId: string, event: any): boolean {
    // 1. Auto-respond to can_use_tool based on permissionMode
    if (event.type === "control_request" && event.request?.subtype === "can_use_tool") {
      const session = this.sessionManager.get(sessionId);
      const mode = session?.permissionMode || "default";

      let autoAllow = false;
      if (mode === "bypassPermissions") {
        autoAllow = true;
      } else if (mode === "acceptEdits") {
        const editTools = new Set(["Edit", "Write", "NotebookEdit", "MultiEdit"]);
        if (editTools.has(event.request?.tool_name)) {
          autoAllow = true;
        }
      }

      // Auto-approve EnterPlanMode (no side effects, safe to allow)
      if (event.request?.tool_name === "EnterPlanMode") {
        autoAllow = true;
      }

      // ExitPlanMode: intercept and store request_id for WebUI approval
      if (event.request?.tool_name === "ExitPlanMode") {
        this.sessionManager.setPendingPlanApproval(sessionId, {
          canUseToolRequestId: event.request_id,
          planFilePath: event.request?.input?.planFilePath,
        });
        logger.info(TAG, `Intercepted ExitPlanMode can_use_tool, stored request_id=${event.request_id}`);

        // Store and forward to web clients for visibility (but do NOT auto-approve)
        const message = { ...event, timestamp: event.timestamp || Date.now() };
        this.sessionManager.addMessage(sessionId, message);
        this.connectionManager.sendEventToWebClients(sessionId, message);
        return true; // intercepted — CLI will wait for control_response from WebUI approval
      }

      if (autoAllow) {
        const autoResponse = {
          type: "control_response",
          response: {
            subtype: "success",
            request_id: event.request_id,
            response: { behavior: "allow" },
          },
          session_id: sessionId,
        };
        this.connectionManager.sendRawToCliSession(sessionId, autoResponse);

        // Still store and forward to web for visibility
        const message = { ...event, timestamp: event.timestamp || Date.now() };
        this.sessionManager.addMessage(sessionId, message);
        this.connectionManager.sendEventToWebClients(sessionId, message);
        return true; // intercepted
      }
    }

    // 2. Extract permissionMode from system/init and system/status events
    if (event.type === "system" && (event.subtype === "init" || event.subtype === "status") && event.permissionMode) {
      this.sessionManager.updatePermissionMode(sessionId, event.permissionMode);
    }

    // 3. Detect ExitPlanMode tool_use in assistant messages → IMMEDIATELY emit plan_approval
    if (event.type === "assistant" && Array.isArray(event.message?.content)) {
      const exitPlanBlock = event.message.content.find(
        (b: any) => b.type === "tool_use" && b.name === "ExitPlanMode"
      );
      if (exitPlanBlock) {
        const approvalRequestId = `plan-approval-${Date.now()}`;
        const approvalEvent = {
          type: "control_request",
          request: {
            subtype: "plan_approval",
            request_id: approvalRequestId,
            plan_file_path: exitPlanBlock.input?.planFilePath,
          },
          request_id: approvalRequestId,
          session_id: sessionId,
          timestamp: Date.now(),
        };
        this.sessionManager.addMessage(sessionId, approvalEvent);
        this.connectionManager.sendEventToWebClients(sessionId, approvalEvent);
      }
    }

    return false; // not intercepted, caller should store+forward normally
  }
}
