import { Router } from "express";
import type { EnvironmentManager } from "../services/environmentManager";
import type { WorkDispatcher } from "../services/workDispatcher";
import type { RegisterEnvironmentRequest } from "../types";
import { logger } from "../utils/logger";

const TAG = "route:env";

export function createEnvironmentRoutes(
  envManager: EnvironmentManager,
  workDispatcher: WorkDispatcher
): Router {
  const router = Router();

  // POST /v1/environments/bridge — Register a bridge environment
  router.post("/v1/environments/bridge", (req, res) => {
    const body = req.body as RegisterEnvironmentRequest;
    if (!body.machine_name || !body.directory) {
      res.status(400).json({ error: "machine_name and directory are required" });
      return;
    }

    const result = envManager.register(body);
    logger.info(TAG, `POST /v1/environments/bridge -> 200 (${result.environment_id})`);
    res.status(200).json(result);
  });

  // GET /v1/environments/:envId/work/poll — Long-poll for work
  router.get("/v1/environments/:envId/work/poll", async (req, res) => {
    const { envId } = req.params;
    const env = envManager.get(envId);
    if (!env) {
      res.status(404).json({ error: "Environment not found" });
      return;
    }

    envManager.updateLastPoll(envId);

    const abortController = new AbortController();
    req.on("close", () => abortController.abort());

    try {
      const work = await workDispatcher.poll(envId, abortController.signal);
      if (work) {
        logger.info(TAG, `GET /v1/environments/${envId}/work/poll -> 200 (work: ${work.id})`);
        res.status(200).json(work);
      } else {
        logger.debug(TAG, `GET /v1/environments/${envId}/work/poll -> 200 (no work)`);
        res.status(200).end();
      }
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  // POST /v1/environments/:envId/work/:workId/ack — Acknowledge work
  router.post("/v1/environments/:envId/work/:workId/ack", (req, res) => {
    const { envId, workId } = req.params;
    workDispatcher.acknowledgeWork(envId, workId);
    logger.info(TAG, `POST /v1/environments/${envId}/work/${workId}/ack -> 200`);
    res.status(200).json({});
  });

  // POST /v1/environments/:envId/work/:workId/stop — Stop work
  router.post("/v1/environments/:envId/work/:workId/stop", (req, res) => {
    const { envId, workId } = req.params;
    const force = req.body?.force === true;
    workDispatcher.stopWork(envId, workId, force);
    logger.info(TAG, `POST /v1/environments/${envId}/work/${workId}/stop -> 200`);
    res.status(200).json({});
  });

  // DELETE /v1/environments/bridge/:envId — Deregister environment
  router.delete("/v1/environments/bridge/:envId", (req, res) => {
    const { envId } = req.params;
    const success = envManager.deregister(envId);
    if (success) {
      logger.info(TAG, `DELETE /v1/environments/bridge/${envId} -> 200`);
      res.status(200).json({});
    } else {
      res.status(404).json({ error: "Environment not found" });
    }
  });

  return router;
}
