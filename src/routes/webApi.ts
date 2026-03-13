import fs from "fs";
import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import type { EnvironmentManager } from "../services/environmentManager";
import type { SessionManager } from "../services/sessionManager";
import type { WorkDispatcher } from "../services/workDispatcher";
import type { ConnectionManager } from "../services/connectionManager";
import { config } from "../config";
import { logger } from "../utils/logger";

const TAG = "route:web";

const PLAN_MODE_EXIT_PROMPT = `<system-reminder>
The user has exited plan mode from the UI. Call ExitPlanMode immediately to confirm the exit. Do not add any commentary.
</system-reminder>`;

function sendSlashPlanToCliSession(
  sessionId: string,
  sessionManager: SessionManager,
  connectionManager: ConnectionManager
) {
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
  sessionManager.addMessage(sessionId, msg);
  connectionManager.sendRawToCliSession(sessionId, msg);
  connectionManager.sendEventToWebClients(sessionId, msg);
}

function sendExitPlanModePrompt(
  sessionId: string,
  sessionManager: SessionManager,
  connectionManager: ConnectionManager
) {
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
  sessionManager.addMessage(sessionId, msg);
  connectionManager.sendRawToCliSession(sessionId, msg);
  connectionManager.sendEventToWebClients(sessionId, msg);
}

export function createWebApiRoutes(
  envManager: EnvironmentManager,
  sessionManager: SessionManager,
  workDispatcher: WorkDispatcher,
  connectionManager: ConnectionManager
): Router {
  const router = Router();

  // GET /api/oauth/profile — Stub for CLI's profile check
  // ny() calls ps() which hits this endpoint to get organizationUuid
  router.get("/api/oauth/profile", (_req, res) => {
    res.json({
      account_uuid: "self-hosted",
      email: "self-hosted@localhost",
      organization: {
        uuid: "self-hosted-org",
      },
    });
  });

  // GET /api/environments — List all registered environments
  router.get("/api/environments", (_req, res) => {
    const envs = envManager.getAll();
    res.json(
      envs.map((e) => ({
        id: e.id,
        machine_name: e.machineName,
        directory: e.directory,
        branch: e.branch,
        git_repo_url: e.gitRepoUrl,
        registered_at: e.registeredAt,
        last_poll_at: e.lastPollAt,
      }))
    );
  });

  // GET /api/sessions — List all sessions
  router.get("/api/sessions", (_req, res) => {
    const sessions = sessionManager.getAll();
    res.json(
      sessions.map((s) => ({
        id: s.id,
        title: s.title,
        environment_id: s.environmentId,
        status: s.status,
        created_at: s.createdAt,
        message_count: s.messages.length,
      }))
    );
  });

  // GET /api/sessions/:sessionId — Get session details with messages
  router.get("/api/sessions/:sessionId", (req, res) => {
    const session = sessionManager.get(req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json({
      id: session.id,
      title: session.title,
      environment_id: session.environmentId,
      status: session.status,
      created_at: session.createdAt,
      permission_mode: session.permissionMode,
      messages: session.messages,
    });
  });

  // GET /api/sessions/:sessionId/messages — Get session messages
  router.get("/api/sessions/:sessionId/messages", (req, res) => {
    const messages = sessionManager.getMessages(req.params.sessionId);
    res.json(messages);
  });

  /**
   * POST /api/sessions — Create a new session and dispatch work to CLI
   *
   * This is the main entry point for web users:
   * 1. Create session in session manager
   * 2. Enqueue work for the target environment (wakes up CLI's long poll)
   * 3. Optionally send initial user message
   */
  router.post("/api/sessions", (req, res) => {
    const { environment_id, title, prompt } = req.body;
    if (!environment_id) {
      res.status(400).json({ error: "environment_id is required" });
      return;
    }

    const env = envManager.get(environment_id);
    if (!env) {
      res.status(404).json({ error: "Environment not found" });
      return;
    }

    // Claude Code remote-control bridge runs one active CLI session per environment.
    // If a CLI-connected active session already exists, reuse it instead of creating
    // a foreign session that the bridge will reject.
    const activeSessionsForEnv = sessionManager
      .getByEnvironment(environment_id)
      .filter((s) => s.status === "active");
    const connectedSession = activeSessionsForEnv.find((s) =>
      connectionManager.hasCliConnection(s.id)
    );
    if (connectedSession) {
      if (prompt) {
        const userMessage = {
          type: "user" as const,
          message: {
            role: "user" as const,
            content: [{ type: "text", text: prompt }],
          },
          session_id: connectedSession.id,
          uuid: uuidv4(),
          timestamp: Date.now(),
        };
        sessionManager.addMessage(connectedSession.id, userMessage);
        connectionManager.sendRawToCliSession(connectedSession.id, userMessage);
        connectionManager.sendEventToWebClients(connectedSession.id, userMessage);
      }
      logger.info(
        TAG,
        `POST /api/sessions -> reused active CLI session ${connectedSession.id} for env ${environment_id}`
      );
      res.json({
        id: connectedSession.id,
        reused: true,
      });
      return;
    }

    // Create the session
    const session = sessionManager.create({
      title: title || "Remote Session",
      environment_id,
      source: "web",
    });

    // Compute the API base URL
    const apiBaseUrl = `http://localhost:${config.port}`;

    // Enqueue work for the CLI's long poll
    const workId = workDispatcher.enqueueWork(
      environment_id,
      session.id,
      apiBaseUrl
    );

    logger.info(
      TAG,
      `POST /api/sessions -> created session ${session.id}, work ${workId}`
    );

    // If there's an initial prompt, store it and we'll send it once CLI connects
    if (prompt) {
      const userMessage = {
        type: "user",
        message: {
          role: "user" as const,
          content: [{ type: "text", text: prompt }],
        },
        session_id: session.id,
        uuid: uuidv4(),
        timestamp: Date.now(),
      };
      sessionManager.addMessage(session.id, userMessage);
    }

    res.json({
      id: session.id,
      work_id: workId,
    });
  });

  /**
   * POST /api/sessions/:sessionId/message — Send a user message to CLI
   */
  router.post("/api/sessions/:sessionId/message", (req, res) => {
    const { sessionId } = req.params;
    const { message, parent_tool_use_id } = req.body;

    if (!message) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    const session = sessionManager.get(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const userEvent = {
      type: "user" as const,
      message: {
        role: "user" as const,
        content: [{ type: "text", text: message }],
      },
      session_id: sessionId,
      uuid: uuidv4(),
      parent_tool_use_id,
      timestamp: Date.now(),
    };

    // Store in session
    sessionManager.addMessage(sessionId, userEvent);

    // Send to CLI via WebSocket (raw, no client_event wrapping)
    const sent = connectionManager.sendRawToCliSession(sessionId, userEvent);

    if (sent) {
      logger.info(TAG, `Message sent to CLI for session ${sessionId}`);
      res.json({ status: "sent" });
    } else {
      logger.warn(TAG, `No CLI connection for session ${sessionId}`);
      res.status(503).json({ error: "CLI not connected", status: "queued" });
    }
  });

  /**
   * POST /api/sessions/:sessionId/control — Send control request to CLI
   */
  router.post("/api/sessions/:sessionId/control", (req, res) => {
    const { sessionId } = req.params;
    const { subtype, model, max_thinking_tokens, mode } = req.body;

    if (!subtype) {
      res.status(400).json({ error: "subtype is required" });
      return;
    }

    const requestId = uuidv4();

    // Intercept set_permission_mode
    if (subtype === "set_permission_mode") {
      const session = sessionManager.get(sessionId);
      if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      const newMode = mode || "default";
      const previousMode = session.permissionMode || "default";

      if (config.experimentalSetPermissionMode) {
        // Forward mode: send control_request to CLI, let CLI handle it
        // CLI natively handles mode switching (like shift+tab), no extra commands needed
        const controlRequest: any = {
          type: "control_request",
          request_id: requestId,
          request: { subtype: "set_permission_mode", mode: newMode },
          session_id: sessionId,
        };
        const sent = connectionManager.sendRawToCliSession(sessionId, controlRequest);

        if (sent) {
          res.json({ status: "sent", request_id: requestId });
        } else {
          res.status(503).json({ error: "CLI not connected" });
        }
        return;
      }

      // Server-side mode: handle locally and synthesize response
      sessionManager.updatePermissionMode(sessionId, newMode);
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
      sessionManager.addMessage(sessionId, controlResponse);
      connectionManager.sendEventToWebClients(sessionId, controlResponse);

      // Plan mode transitions
      if (newMode === "plan" && previousMode !== "plan") {
        sendSlashPlanToCliSession(sessionId, sessionManager, connectionManager);
      } else if (newMode !== "plan" && previousMode === "plan") {
        sendExitPlanModePrompt(sessionId, sessionManager, connectionManager);
      }

      res.json({ status: "sent", request_id: requestId });
      return;
    }

    const controlRequest: any = {
      type: "control_request",
      request_id: requestId,
      request: { subtype, model, max_thinking_tokens, mode },
      session_id: sessionId,
    };

    const sent = connectionManager.sendRawToCliSession(sessionId, controlRequest);

    if (sent) {
      res.json({ status: "sent", request_id: requestId });
    } else {
      res.status(503).json({ error: "CLI not connected" });
    }
  });

  /**
   * POST /api/sessions/:sessionId/interrupt — Interrupt the CLI session
   */
  router.post("/api/sessions/:sessionId/interrupt", (req, res) => {
    const { sessionId } = req.params;
    const requestId = uuidv4();

    const controlRequest = {
      type: "control_request",
      request_id: requestId,
      request: { subtype: "interrupt" },
      session_id: sessionId,
    };

    const sent = connectionManager.sendRawToCliSession(sessionId, controlRequest);

    if (sent) {
      res.json({ status: "sent", request_id: requestId });
    } else {
      res.status(503).json({ error: "CLI not connected" });
    }
  });

  /**
   * POST /api/sessions/:sessionId/permission — Respond to a permission request
   */
  router.post("/api/sessions/:sessionId/permission", (req, res) => {
    const { sessionId } = req.params;
    const { request_id, approved } = req.body;

    if (!request_id) {
      res.status(400).json({ error: "request_id is required" });
      return;
    }

    const behavior = req.body.behavior || (approved ? "allow" : "deny");
    const controlResponse = {
      type: "control_response",
      response: {
        subtype: "success",
        request_id,
        response: {
          behavior,
          ...(req.body.updatedInput && { updatedInput: req.body.updatedInput }),
        },
      },
      session_id: sessionId,
    };

    const sent = connectionManager.sendRawToCliSession(sessionId, controlResponse);

    if (sent) {
      res.json({ status: "sent" });
    } else {
      res.status(503).json({ error: "CLI not connected" });
    }
  });

  /**
   * POST /api/sessions/:sessionId/plan-approval — Respond to ExitPlanMode plan approval
   */
  router.post("/api/sessions/:sessionId/plan-approval", async (req, res) => {
    const { sessionId } = req.params;
    const { action, mode, clearContext, feedback, request_id, plan_file_path } = req.body;

    const session = sessionManager.get(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    if (action === "approve") {
      const newMode = mode || "default";

      // Wait for can_use_tool to arrive from CLI (race condition: plan_approval
      // from assistant message detection may arrive before can_use_tool from Qiq)
      let pending = sessionManager.getPendingPlanApproval(sessionId);
      if (!pending) {
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 100));
          pending = sessionManager.getPendingPlanApproval(sessionId);
          if (pending) break;
        }
      }

      const responseRequestId = pending?.canUseToolRequestId || uuidv4();

      if (clearContext) {
        // clearContext: CLI local flow calls onReject(), not onAllow()
        // The sequence is: set mode → deny ExitPlanMode → send plan as user message
        // CLI then restarts the conversation with the plan content.

        // 1. Change mode via set_permission_mode control_request
        const modeRequest = {
          type: "control_request",
          request_id: uuidv4(),
          request: { subtype: "set_permission_mode", mode: newMode },
          session_id: sessionId,
        };
        connectionManager.sendRawToCliSession(sessionId, modeRequest);

        // 2. DENY ExitPlanMode (matching CLI's onReject behavior)
        const denyResponse = {
          type: "control_response",
          response: {
            subtype: "success",
            request_id: responseRequestId,
            response: { behavior: "deny", message: "Context cleared, implementing plan" },
          },
          session_id: sessionId,
        };
        connectionManager.sendRawToCliSession(sessionId, denyResponse);
        logger.info(TAG, `Sent control_response (deny+clearContext) for ExitPlanMode, request_id=${responseRequestId}, had_pending=${!!pending}`);

        // 3. Send plan as user message
        const resolvedPlanPath = plan_file_path || pending?.planFilePath;
        if (resolvedPlanPath) {
          let planText = "";
          try {
            planText = fs.readFileSync(resolvedPlanPath, "utf-8");
          } catch (e) {
            logger.warn(TAG, `Failed to read plan file: ${resolvedPlanPath}`);
          }
          if (planText) {
            const implementMsg = {
              type: "user" as const,
              message: {
                role: "user" as const,
                content: [{ type: "text", text: `Implement the following plan:\n\n${planText}` }],
              },
              session_id: sessionId,
              uuid: uuidv4(),
              timestamp: Date.now(),
            };
            sessionManager.addMessage(sessionId, implementMsg);
            connectionManager.sendRawToCliSession(sessionId, implementMsg);
            connectionManager.sendEventToWebClients(sessionId, implementMsg);
          }
        }
      } else {
        // Non-clearContext: "Auto-accept edits" / "Manually approve edits"
        // Send clean allow (no updatedPermissions) — Map handler ignores it,
        // and fallback path would TypeError on undefined second arg to onAllow.
        const allowResponse = {
          type: "control_response",
          response: {
            subtype: "success",
            request_id: responseRequestId,
            response: { behavior: "allow" },
          },
          session_id: sessionId,
        };
        connectionManager.sendRawToCliSession(sessionId, allowResponse);
        logger.info(TAG, `Sent control_response (allow) for ExitPlanMode, request_id=${responseRequestId}, had_pending=${!!pending}`);

        // ExitPlanMode.call() changes mode to prePlanMode (usually "default").
        // Send set_permission_mode AFTER a delay to override to user's desired mode.
        setTimeout(() => {
          const modeRequest = {
            type: "control_request",
            request_id: uuidv4(),
            request: { subtype: "set_permission_mode", mode: newMode },
            session_id: sessionId,
          };
          connectionManager.sendRawToCliSession(sessionId, modeRequest);
          logger.info(TAG, `Sent delayed set_permission_mode (${newMode}) after ExitPlanMode`);
        }, 300);
      }

      if (pending) {
        sessionManager.clearPendingPlanApproval(sessionId);
      }

      // Update server-side permission mode + notify WebUI
      sessionManager.updatePermissionMode(sessionId, newMode);
      const controlResponse = {
        type: "control_response",
        response: {
          subtype: "success",
          request_id,
          response: { mode: newMode },
        },
        session_id: sessionId,
        uuid: uuidv4(),
        timestamp: Date.now(),
      };
      sessionManager.addMessage(sessionId, controlResponse);
      connectionManager.sendEventToWebClients(sessionId, controlResponse);
    } else if (action === "reject") {
      // Wait for can_use_tool to arrive (same race condition as approve path)
      let pending = sessionManager.getPendingPlanApproval(sessionId);
      if (!pending) {
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 100));
          pending = sessionManager.getPendingPlanApproval(sessionId);
          if (pending) break;
        }
      }

      // 1. Send control_response (deny) to dismiss CLI's "Ready to code?" prompt
      const denyRequestId = pending?.canUseToolRequestId || uuidv4();
      const denyResponse = {
        type: "control_response",
        response: {
          subtype: "success",
          request_id: denyRequestId,
          response: { behavior: "deny", message: feedback || "User wants to continue planning" },
        },
        session_id: sessionId,
      };
      connectionManager.sendRawToCliSession(sessionId, denyResponse);
      logger.info(TAG, `Sent control_response (deny) for ExitPlanMode, request_id=${denyRequestId}, had_pending=${!!pending}`);

      if (pending) {
        sessionManager.clearPendingPlanApproval(sessionId);
      }

      // 2. Switch back to plan mode
      sessionManager.updatePermissionMode(sessionId, "plan");
      const controlResponse = {
        type: "control_response",
        response: {
          subtype: "success",
          request_id,
          response: { mode: "plan" },
        },
        session_id: sessionId,
        uuid: uuidv4(),
        timestamp: Date.now(),
      };
      sessionManager.addMessage(sessionId, controlResponse);
      connectionManager.sendEventToWebClients(sessionId, controlResponse);

      // 3. Send EnterPlanMode prompt to CLI
      const planPrompt = {
        type: "user" as const,
        message: {
          role: "user" as const,
          content: [{ type: "text", text: `<system-reminder>\nThe user has rejected the plan and wants to continue planning. Call EnterPlanMode immediately to re-enter plan mode.\n</system-reminder>` }],
        },
        isMeta: true,
        session_id: sessionId,
        uuid: uuidv4(),
        timestamp: Date.now(),
      };
      sessionManager.addMessage(sessionId, planPrompt);
      connectionManager.sendRawToCliSession(sessionId, planPrompt);
      connectionManager.sendEventToWebClients(sessionId, planPrompt);

      // 4. Send user feedback if provided
      if (feedback) {
        const feedbackMsg = {
          type: "user" as const,
          message: {
            role: "user" as const,
            content: [{ type: "text", text: feedback }],
          },
          session_id: sessionId,
          uuid: uuidv4(),
          timestamp: Date.now(),
        };
        sessionManager.addMessage(sessionId, feedbackMsg);
        connectionManager.sendRawToCliSession(sessionId, feedbackMsg);
        connectionManager.sendEventToWebClients(sessionId, feedbackMsg);
      }
    }

    res.json({ status: "ok" });
  });

  // GET /api/status — Server status
  router.get("/api/status", (_req, res) => {
    res.json({
      status: "ok",
      environments: envManager.getAll().length,
      sessions: sessionManager.getAll().length,
      cli_connections: connectionManager.getCliSessionIds().length,
      web_connections: connectionManager.getWebSessionIds().length,
    });
  });

  return router;
}
