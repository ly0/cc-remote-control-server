import { Router } from "express";
import type { SessionManager } from "../services/sessionManager";
import type { ConnectionManager } from "../services/connectionManager";
import type { EventProcessor } from "../services/eventProcessor";
import type { IngressEventBatch, SessionMessage } from "../types";
import { logger } from "../utils/logger";

const TAG = "route:ingress";

export function createIngressRoutes(
  sessionManager: SessionManager,
  connectionManager: ConnectionManager,
  eventProcessor: EventProcessor
): Router {
  const router = Router();

  /**
   * POST /v2/session_ingress/session/:sessionId/events
   *
   * CLI sends events here via HybridTransport.
   * We process events for plan mode detection/auto-approval,
   * then store messages and forward them to web clients.
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

      // Process each event for plan mode detection and auto-approval
      const eventsToStoreAndForward: SessionMessage[] = [];
      for (const event of timestampedEvents) {
        const intercepted = eventProcessor.processCliEvent(sessionId, event);
        if (!intercepted) {
          // Not intercepted: needs normal store+forward
          eventsToStoreAndForward.push(event);
        }
        // Intercepted events are already stored+forwarded by eventProcessor
      }

      // Store and forward remaining (non-intercepted) events
      if (eventsToStoreAndForward.length > 0) {
        sessionManager.addMessages(sessionId, eventsToStoreAndForward);
        connectionManager.sendToWebClients(sessionId, eventsToStoreAndForward);
      }

      logger.debug(
        TAG,
        `POST /v2/.../events for session ${sessionId}: ${timestampedEvents.length} events`
      );

      res.status(200).json({});
    }
  );

  return router;
}
