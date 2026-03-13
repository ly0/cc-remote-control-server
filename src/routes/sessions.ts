import { Router } from "express";
import type { SessionManager } from "../services/sessionManager";
import type { WorkDispatcher } from "../services/workDispatcher";
import type { CreateSessionRequest } from "../types";
import { config } from "../config";
import { logger } from "../utils/logger";

const TAG = "route:session";

export function createSessionRoutes(
  sessionManager: SessionManager,
  workDispatcher: WorkDispatcher,
  connectionManager?: import("../services/connectionManager").ConnectionManager
): Router {
  const router = Router();

  // POST /v1/sessions — Create a new session
  router.post("/v1/sessions", (req, res) => {
    const body = req.body as CreateSessionRequest;
    if (!body.environment_id) {
      res.status(400).json({ error: "environment_id is required" });
      return;
    }

    const session = sessionManager.create(body);

    // Dispatch work to the CLI so it connects session ingress WebSocket
    const apiBaseUrl = `http://localhost:${config.port}`;
    const workId = workDispatcher.enqueueWork(
      body.environment_id,
      session.id,
      apiBaseUrl
    );

    logger.info(TAG, `POST /v1/sessions -> 200 (${session.id}, work ${workId})`);
    res.status(200).json({ id: session.id });
  });

  // GET /v1/sessions/:sessionId — Get session info
  router.get("/v1/sessions/:sessionId", (req, res) => {
    const { sessionId } = req.params;
    const session = sessionManager.get(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    logger.debug(TAG, `GET /v1/sessions/${sessionId} -> 200`);
    res.status(200).json({
      id: session.id,
      title: session.title,
      environment_id: session.environmentId,
      source: session.source,
      status: session.status,
      created_at: session.createdAt,
      permission_mode: session.permissionMode,
    });
  });

  // PATCH /v1/sessions/:sessionId — Update session title
  router.patch("/v1/sessions/:sessionId", (req, res) => {
    const { sessionId } = req.params;
    const { title } = req.body;
    if (!title) {
      res.status(400).json({ error: "title is required" });
      return;
    }

    const success = sessionManager.updateTitle(sessionId, title);
    if (success) {
      logger.info(TAG, `PATCH /v1/sessions/${sessionId} -> 200`);
      res.status(200).json({});
    } else {
      res.status(404).json({ error: "Session not found" });
    }
  });

  // POST /v1/sessions/:sessionId/archive — Archive session
  router.post("/v1/sessions/:sessionId/archive", (req, res) => {
    const { sessionId } = req.params;
    const success = sessionManager.archive(sessionId);
    if (success) {
      logger.info(TAG, `POST /v1/sessions/${sessionId}/archive -> 200`);
      res.status(200).json({});
    } else {
      res.status(404).json({ error: "Session not found" });
    }
  });

  // POST /v1/sessions/:sessionId/events — Send events to session (HTTP path)
  router.post("/v1/sessions/:sessionId/events", (req, res) => {
    const { sessionId } = req.params;
    const { events } = req.body;

    const session = sessionManager.get(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    if (!events || !Array.isArray(events)) {
      res.status(400).json({ error: "events array is required" });
      return;
    }

    // Store events as messages
    const timestampedEvents = events.map((e: any) => ({
      ...e,
      timestamp: e.timestamp || Date.now(),
    }));
    sessionManager.addMessages(sessionId, timestampedEvents);

    // Forward to CLI WebSocket and web clients
    if (connectionManager) {
      // Forward to CLI
      for (const event of timestampedEvents) {
        connectionManager.sendRawToCliSession(sessionId, event);
      }
      // Forward to web clients
      connectionManager.sendToWebClients(sessionId, timestampedEvents);
    }

    logger.info(TAG, `POST /v1/sessions/${sessionId}/events -> 200 (${events.length} events)`);
    res.status(200).json({});
  });

  return router;
}
