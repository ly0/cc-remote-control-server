import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import { createApp } from "./server";
import { config } from "./config";
import { logger } from "./utils/logger";

const TAG = "main";

const PLAN_MODE_EXIT_PROMPT = `<system-reminder>
The user has exited plan mode from the UI. Call ExitPlanMode immediately to confirm the exit. Do not add any commentary.
</system-reminder>`;

function sendSlashPlanToCliSession(sessionId: string) {
  const msg = {
    type: "user" as const,
    message: {
      role: "user" as const,
      content: [{ type: "text", text: "/plan" }],
    },
    session_id: sessionId,
    uuid: uuidv4(),
    timestamp: Date.now(),
  };
  ctx.sessionManager.addMessage(sessionId, msg);
  ctx.connectionManager.sendRawToCliSession(sessionId, msg);
  ctx.connectionManager.sendEventToWebClients(sessionId, msg);
}

function sendExitPlanModePrompt(sessionId: string) {
  const msg = {
    type: "user" as const,
    message: {
      role: "user" as const,
      content: [{ type: "text", text: PLAN_MODE_EXIT_PROMPT }],
    },
    session_id: sessionId,
    uuid: uuidv4(),
    isMeta: true,
    timestamp: Date.now(),
  };
  ctx.sessionManager.addMessage(sessionId, msg);
  ctx.connectionManager.sendRawToCliSession(sessionId, msg);
  ctx.connectionManager.sendEventToWebClients(sessionId, msg);
}

const { app, ctx } = createApp();
const server = http.createServer(app);

// ─── WebSocket Server ─────────────────────────────────────

const wss = new WebSocketServer({ server });

wss.on("connection", (ws: WebSocket, req) => {
  const url = req.url || "";
  logger.info(TAG, `WebSocket connection: ${url}`);

  // CLI session_ingress WebSocket: /v2/session_ingress/ws/:sessionId
  const cliMatch = url.match(
    /\/v2\/session_ingress\/ws\/([a-f0-9-]+)/
  );
  if (cliMatch) {
    const sessionId = cliMatch[1];
    handleCliWebSocket(sessionId, ws);
    return;
  }

  // Web frontend WebSocket: /api/ws/:sessionId
  const webMatch = url.match(/\/api\/ws\/([a-f0-9-]+)/);
  if (webMatch) {
    const sessionId = webMatch[1];
    handleWebWebSocket(sessionId, ws);
    return;
  }

  logger.warn(TAG, `Unknown WebSocket path: ${url}`);
  ws.close(4000, "Unknown path");
});

// ─── CLI WebSocket Handler ────────────────────────────────

function handleCliWebSocket(sessionId: string, ws: WebSocket) {
  logger.info(TAG, `CLI WebSocket connected for session ${sessionId}`);
  ctx.connectionManager.registerCliConnection(sessionId, ws);

  // Send initial control request to initialize the session
  ws.send(JSON.stringify({
    type: "control_request",
    request_id: uuidv4(),
    request: { subtype: "initialize" },
    session_id: sessionId,
  }) + "\n");

  // Check if there are pending user messages to send
  const session = ctx.sessionManager.get(sessionId);
  if (session) {
    const pendingUserMessages = session.messages.filter(
      (m) => m.type === "user"
    );
    for (const msg of pendingUserMessages) {
      const sent = ctx.connectionManager.sendRawToCliSession(sessionId, msg);
      if (sent) {
        logger.info(TAG, `Sent pending user message to CLI for session ${sessionId}`);
      }
    }
  }

  ws.on("message", (data) => {
    try {
      const str = data.toString();
      const parsed = JSON.parse(str);

      // CLI may send keep_alive messages
      if (parsed.type === "keep_alive") {
        return;
      }

      // Auto-respond to can_use_tool based on permissionMode
      if (parsed.type === "control_request" && parsed.request?.subtype === "can_use_tool") {
        const session = ctx.sessionManager.get(sessionId);
        const mode = session?.permissionMode || "default";

        let autoAllow = false;
        if (mode === "bypassPermissions") {
          autoAllow = true;
        } else if (mode === "acceptEdits") {
          const editTools = new Set(["Edit", "Write", "NotebookEdit", "MultiEdit"]);
          if (editTools.has(parsed.request?.tool_name)) {
            autoAllow = true;
          }
        }

        // Always auto-approve plan mode toggle tools (no side effects, safe to allow)
        const planModeTools = new Set(["ExitPlanMode", "EnterPlanMode"]);
        if (planModeTools.has(parsed.request?.tool_name)) {
          autoAllow = true;
        }

        if (autoAllow) {
          const autoResponse = {
            type: "control_response",
            response: {
              subtype: "success",
              request_id: parsed.request_id,
              response: { behavior: "allow" },
            },
            session_id: sessionId,
          };
          ctx.connectionManager.sendRawToCliSession(sessionId, autoResponse);

          // Still store and forward to web for visibility
          const message = { ...parsed, timestamp: Date.now() };
          ctx.sessionManager.addMessage(sessionId, message);
          ctx.connectionManager.sendEventToWebClients(sessionId, message);
          return;
        }
      }

      // Extract permissionMode from system/init events
      if (parsed.type === "system" && parsed.subtype === "init" && parsed.permissionMode) {
        ctx.sessionManager.updatePermissionMode(sessionId, parsed.permissionMode);
      }

      // Store and forward to web clients
      const message = { ...parsed, timestamp: Date.now() };
      ctx.sessionManager.addMessage(sessionId, message);
      ctx.connectionManager.sendEventToWebClients(sessionId, message);
    } catch (err) {
      logger.error(TAG, `Error parsing CLI WebSocket message: ${err}`);
    }
  });

  ws.on("close", () => {
    logger.info(TAG, `CLI WebSocket disconnected for session ${sessionId}`);
    // Notify web clients that CLI disconnected
    ctx.connectionManager.sendEventToWebClients(sessionId, {
      type: "system",
      subtype: "cli_disconnected",
      session_id: sessionId,
      timestamp: Date.now(),
    });
  });

  ws.on("error", (err) => {
    logger.error(TAG, `CLI WebSocket error for session ${sessionId}: ${err.message}`);
  });
}

// ─── Web Frontend WebSocket Handler ───────────────────────

function handleWebWebSocket(sessionId: string, ws: WebSocket) {
  logger.info(TAG, `Web WebSocket connected for session ${sessionId}`);
  ctx.connectionManager.registerWebConnection(sessionId, ws);

  // Send connection status
  ws.send(
    JSON.stringify({
      type: "connection_status",
      cli_connected: ctx.connectionManager.hasCliConnection(sessionId),
      session_id: sessionId,
    })
  );

  // Send existing messages
  const messages = ctx.sessionManager.getMessages(sessionId);
  if (messages.length > 0) {
    ws.send(JSON.stringify({ type: "history", events: messages }));
  }

  ws.on("message", (data) => {
    try {
      const str = data.toString();
      const parsed = JSON.parse(str);

      // Web client sends user messages
      if (parsed.type === "user_message") {
        const userEvent = {
          type: "user" as const,
          message: {
            role: "user" as const,
            content: [{ type: "text", text: parsed.message }],
          },
          session_id: sessionId,
          uuid: uuidv4(),
          timestamp: Date.now(),
        };

        // Store message
        ctx.sessionManager.addMessage(sessionId, userEvent);

        // Forward to CLI (raw, no client_event wrapping)
        ctx.connectionManager.sendRawToCliSession(sessionId, userEvent);

        // Echo back to all web clients
        ctx.connectionManager.sendEventToWebClients(sessionId, userEvent);
      }

      // AskUserQuestion answers are now handled via the HTTP permission endpoint
      // (POST /api/sessions/:sessionId/permission with updatedInput).
      // The old ask_user_answer WebSocket handler has been removed.

      // Web client responds to elicitation
      if (parsed.type === "elicitation_response") {
        const { request_id, action, content } = parsed;
        const controlResponse = {
          type: "control_response",
          response: {
            subtype: "success",
            request_id,
            response: { action, content: content || {} },
          },
          session_id: sessionId,
        };

        ctx.connectionManager.sendRawToCliSession(sessionId, controlResponse);
      }

      // Web client sends control
      if (parsed.type === "control") {
        // Intercept set_permission_mode — handle server-side
        if (parsed.request?.subtype === "set_permission_mode") {
          const session = ctx.sessionManager.get(sessionId);
          if (session) {
            const requestId = uuidv4();
            const newMode = parsed.request.mode || "default";
            const { previousMode } = ctx.sessionManager.updatePermissionMode(sessionId, newMode);
            const controlResponse = {
              type: "control_response",
              response: {
                subtype: "success",
                request_id: requestId,
                response: { mode: session.permissionMode },
              },
              session_id: sessionId,
              uuid: uuidv4(),
              timestamp: Date.now(),
            };
            ctx.sessionManager.addMessage(sessionId, controlResponse);
            ctx.connectionManager.sendEventToWebClients(sessionId, controlResponse);

            // Enter plan mode: send /plan slash command to CLI
            if (newMode === "plan" && previousMode !== "plan") {
              sendSlashPlanToCliSession(sessionId);
            } else if (newMode !== "plan" && previousMode === "plan") {
              sendExitPlanModePrompt(sessionId);
            }
          }
          return;
        }

        const controlRequest = {
          type: "control_request",
          request_id: uuidv4(),
          request: parsed.request,
          session_id: sessionId,
        };

        ctx.connectionManager.sendRawToCliSession(sessionId, controlRequest);
      }
    } catch (err) {
      logger.error(TAG, `Error parsing Web WebSocket message: ${err}`);
    }
  });

  ws.on("close", () => {
    logger.info(TAG, `Web WebSocket disconnected for session ${sessionId}`);
  });

  ws.on("error", (err) => {
    logger.error(TAG, `Web WebSocket error for session ${sessionId}: ${err.message}`);
  });
}

// ─── Start Server ─────────────────────────────────────────

// Ping interval to keep WebSocket connections alive
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  });
}, config.wsPingIntervalMs);

wss.on("close", () => {
  clearInterval(pingInterval);
});

server.listen(config.port, config.host, () => {
  logger.info(TAG, `Remote Control Server running at http://${config.host}:${config.port}`);
  logger.info(TAG, `Web UI: http://localhost:${config.port}`);
  logger.info(TAG, `CLI API: http://localhost:${config.port}/v1/...`);
  logger.info(TAG, `Session Ingress WS: ws://localhost:${config.port}/v2/session_ingress/ws/:sessionId`);
});
