import { Router } from "express";
import type { SessionManager } from "../services/sessionManager";
import type { ConnectionManager } from "../services/connectionManager";
import type { WorkerSession } from "../types";
import { logger } from "../utils/logger";

const TAG = "route:ccrv2";

/**
 * CCR v2 HTTP transport routes.
 *
 * Used when `use_code_sessions=true` or `CLAUDE_BRIDGE_USE_CCR_V2` is set.
 * CLI uses HTTP instead of WebSocket for event transport.
 *
 * Base path: /v1/code/sessions/:sessionId/worker
 */
export function createCcrV2Routes(
  sessionManager: SessionManager,
  connectionManager: ConnectionManager
): Router {
  const router = Router();

  // In-memory worker sessions: sessionId → WorkerSession
  const workerSessions = new Map<string, WorkerSession>();
  let epochCounter = 0;

  // POST /v1/code/sessions/:sessionId/worker/register — Register worker
  router.post(
    "/v1/code/sessions/:sessionId/worker/register",
    (req, res) => {
      const { sessionId } = req.params;

      const session = sessionManager.get(sessionId);
      if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      epochCounter++;
      const workerSession: WorkerSession = {
        sessionId,
        workerEpoch: epochCounter,
        workerStatus: "idle",
        lastHeartbeatAt: Date.now(),
      };
      workerSessions.set(sessionId, workerSession);

      logger.info(
        TAG,
        `POST /v1/code/sessions/${sessionId}/worker/register -> 200 (epoch: ${epochCounter})`
      );
      res.status(200).json({ worker_epoch: epochCounter });
    }
  );

  // PUT /v1/code/sessions/:sessionId/worker — Update worker status
  router.put("/v1/code/sessions/:sessionId/worker", (req, res) => {
    const { sessionId } = req.params;
    const { worker_epoch, worker_status, external_metadata } = req.body;

    const ws = workerSessions.get(sessionId);
    if (!ws) {
      res.status(404).json({ error: "Worker not registered" });
      return;
    }

    if (worker_epoch !== undefined && worker_epoch !== ws.workerEpoch) {
      res.status(409).json({ error: "Epoch mismatch" });
      return;
    }

    if (worker_status) {
      ws.workerStatus = worker_status;
    }
    if (external_metadata !== undefined) {
      ws.externalMetadata = external_metadata;
    }

    logger.debug(
      TAG,
      `PUT /v1/code/sessions/${sessionId}/worker -> 200 (status: ${ws.workerStatus})`
    );
    res.status(200).json({});
  });

  // POST /v1/code/sessions/:sessionId/worker/events — Upload client events
  router.post(
    "/v1/code/sessions/:sessionId/worker/events",
    (req, res) => {
      const { sessionId } = req.params;
      const { worker_epoch, events } = req.body;

      const ws = workerSessions.get(sessionId);
      if (!ws) {
        res.status(404).json({ error: "Worker not registered" });
        return;
      }

      if (worker_epoch !== undefined && worker_epoch !== ws.workerEpoch) {
        res.status(409).json({ error: "Epoch mismatch" });
        return;
      }

      if (!events || !Array.isArray(events)) {
        res.status(400).json({ error: "events array is required" });
        return;
      }

      // Extract payloads and store as session messages
      const messages = events.map((e: any) => ({
        ...(e.payload || e),
        timestamp: Date.now(),
      }));

      sessionManager.addMessages(sessionId, messages);
      connectionManager.sendToWebClients(sessionId, messages);

      logger.debug(
        TAG,
        `POST /v1/code/sessions/${sessionId}/worker/events -> 200 (${events.length} events)`
      );
      res.status(200).json({});
    }
  );

  // POST /v1/code/sessions/:sessionId/worker/internal-events — Upload internal events
  router.post(
    "/v1/code/sessions/:sessionId/worker/internal-events",
    (req, res) => {
      const { sessionId } = req.params;
      const { worker_epoch, events } = req.body;

      const ws = workerSessions.get(sessionId);
      if (!ws) {
        res.status(404).json({ error: "Worker not registered" });
        return;
      }

      if (worker_epoch !== undefined && worker_epoch !== ws.workerEpoch) {
        res.status(409).json({ error: "Epoch mismatch" });
        return;
      }

      if (!events || !Array.isArray(events)) {
        res.status(400).json({ error: "events array is required" });
        return;
      }

      // Internal events include compaction markers and agent IDs
      const messages = events.map((e: any) => ({
        ...(e.payload || e),
        is_compaction: e.is_compaction,
        agent_id: e.agent_id,
        timestamp: Date.now(),
      }));

      sessionManager.addMessages(sessionId, messages);

      logger.debug(
        TAG,
        `POST /v1/code/sessions/${sessionId}/worker/internal-events -> 200 (${events.length} events)`
      );
      res.status(200).json({});
    }
  );

  // POST /v1/code/sessions/:sessionId/worker/events/:eventId/delivery — Event delivery confirmation
  router.post(
    "/v1/code/sessions/:sessionId/worker/events/:eventId/delivery",
    (req, res) => {
      const { sessionId, eventId } = req.params;
      const { status, worker_epoch } = req.body;

      const ws = workerSessions.get(sessionId);
      if (!ws) {
        res.status(404).json({ error: "Worker not registered" });
        return;
      }

      if (worker_epoch !== undefined && worker_epoch !== ws.workerEpoch) {
        res.status(409).json({ error: "Epoch mismatch" });
        return;
      }

      logger.debug(
        TAG,
        `POST /v1/code/sessions/${sessionId}/worker/events/${eventId}/delivery -> 200 (status: ${status})`
      );
      res.status(200).json({});
    }
  );

  // POST /v1/code/sessions/:sessionId/worker/heartbeat — Worker heartbeat
  router.post(
    "/v1/code/sessions/:sessionId/worker/heartbeat",
    (req, res) => {
      const { sessionId } = req.params;
      const { worker_epoch } = req.body;

      const ws = workerSessions.get(sessionId);
      if (!ws) {
        res.status(404).json({ error: "Worker not registered" });
        return;
      }

      if (worker_epoch !== undefined && worker_epoch !== ws.workerEpoch) {
        res.status(409).json({ error: "Epoch mismatch" });
        return;
      }

      ws.lastHeartbeatAt = Date.now();

      logger.debug(
        TAG,
        `POST /v1/code/sessions/${sessionId}/worker/heartbeat -> 200`
      );
      res.status(200).json({});
    }
  );

  return router;
}
