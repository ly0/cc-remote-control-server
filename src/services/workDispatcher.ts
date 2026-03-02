import { v4 as uuidv4 } from "uuid";
import type { WorkItem, PollWaiter } from "../types";
import { encodeWorkSecret } from "../utils/workSecret";
import { config } from "../config";
import { logger } from "../utils/logger";

const TAG = "work";

export class WorkDispatcher {
  private pendingWork = new Map<string, WorkItem[]>();
  private waitingPolls = new Map<string, PollWaiter[]>();

  /**
   * Long-poll for work. Returns immediately if work is available,
   * otherwise waits up to pollTimeoutMs.
   */
  poll(envId: string, signal?: AbortSignal): Promise<WorkItem | null> {
    // Check for pending work first
    const pending = this.pendingWork.get(envId);
    if (pending && pending.length > 0) {
      const item = pending.shift()!;
      if (pending.length === 0) this.pendingWork.delete(envId);
      logger.info(TAG, `Poll for env ${envId}: returning pending work ${item.id}`);
      return Promise.resolve(item);
    }

    // No work available — hang the request
    return new Promise<WorkItem | null>((resolve) => {
      const timer = setTimeout(() => {
        // Timeout — remove this waiter and return null
        const waiters = this.waitingPolls.get(envId);
        if (waiters) {
          const idx = waiters.findIndex((w) => w.resolve === resolve);
          if (idx >= 0) waiters.splice(idx, 1);
          if (waiters.length === 0) this.waitingPolls.delete(envId);
        }
        logger.debug(TAG, `Poll for env ${envId}: timeout, returning null`);
        resolve(null);
      }, config.pollTimeoutMs);

      const waiter: PollWaiter = { resolve, timer };

      if (!this.waitingPolls.has(envId)) {
        this.waitingPolls.set(envId, []);
      }
      this.waitingPolls.get(envId)!.push(waiter);

      // Handle abort
      if (signal) {
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          const waiters = this.waitingPolls.get(envId);
          if (waiters) {
            const idx = waiters.findIndex((w) => w.resolve === resolve);
            if (idx >= 0) waiters.splice(idx, 1);
            if (waiters.length === 0) this.waitingPolls.delete(envId);
          }
          resolve(null);
        });
      }
    });
  }

  /**
   * Enqueue work for a specific environment.
   * If there's a waiting poll, resolve it immediately.
   */
  enqueueWork(
    envId: string,
    sessionId: string,
    apiBaseUrl: string
  ): string {
    const workId = uuidv4();
    const secret = encodeWorkSecret(sessionId, apiBaseUrl);

    const workItem: WorkItem = {
      id: workId,
      secret,
      data: { type: "session", id: sessionId },
    };

    // Try to fulfill a waiting poll first
    const waiters = this.waitingPolls.get(envId);
    if (waiters && waiters.length > 0) {
      const waiter = waiters.shift()!;
      if (waiters.length === 0) this.waitingPolls.delete(envId);
      clearTimeout(waiter.timer);
      logger.info(TAG, `Dispatching work ${workId} to waiting poll for env ${envId}`);
      waiter.resolve(workItem);
      return workId;
    }

    // No waiting poll — queue it
    if (!this.pendingWork.has(envId)) {
      this.pendingWork.set(envId, []);
    }
    this.pendingWork.get(envId)!.push(workItem);
    logger.info(TAG, `Queued work ${workId} for env ${envId}`);
    return workId;
  }

  acknowledgeWork(envId: string, workId: string): void {
    logger.info(TAG, `Work ${workId} acknowledged by env ${envId}`);
  }

  stopWork(envId: string, workId: string, force: boolean): void {
    logger.info(TAG, `Work ${workId} stop requested (force=${force}) for env ${envId}`);
  }
}
