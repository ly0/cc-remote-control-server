import { Router } from "express";
import type { SessionManager } from "../services/sessionManager";
import type { ConnectionManager } from "../services/connectionManager";
import type { IngressEventBatch, SessionMessage } from "../types";
import { logger } from "../utils/logger";

const TAG = "route:ingress";

export function createIngressRoutes(
  sessionManager: SessionManager,
  connectionManager: ConnectionManager
): Router {
  const router = Router();

  /**
   * POST /v2/session_ingress/session/:sessionId/events
   *
   * CLI sends events here via HybridTransport.
   * We store messages and forward them to web clients.
   */
  router.post(
    "/v2/session_ingress/session/:sessionId/events",
    (req, res) => {
      const { sessionId } = req.params;
      const body = req.body as IngressEventBatch;

      if (!body.events || !Array.isArray(body.events)) {
        res.status(400).json({ error: "events array is required" });
        return;
      }

      // Add timestamps to events
      const timestampedEvents: SessionMessage[] = body.events.map((e) => ({
        ...e,
        timestamp: e.timestamp || Date.now(),
      }));

      // Store messages in session
      sessionManager.addMessages(sessionId, timestampedEvents);

      // Forward to web clients
      connectionManager.sendToWebClients(sessionId, timestampedEvents);

      logger.debug(
        TAG,
        `POST /v2/.../events for session ${sessionId}: ${timestampedEvents.length} events`
      );

      res.status(200).json({});
    }
  );

  return router;
}
