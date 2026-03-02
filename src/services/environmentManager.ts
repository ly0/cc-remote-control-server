import { v4 as uuidv4 } from "uuid";
import type { Environment, RegisterEnvironmentRequest } from "../types";
import { logger } from "../utils/logger";

const TAG = "env";

export class EnvironmentManager {
  private environments = new Map<string, Environment>();

  register(req: RegisterEnvironmentRequest): {
    environment_id: string;
    environment_secret: string;
  } {
    const id = uuidv4();
    const secret = uuidv4();
    const env: Environment = {
      id,
      secret,
      machineName: req.machine_name,
      directory: req.directory,
      branch: req.branch,
      gitRepoUrl: req.git_repo_url,
      registeredAt: Date.now(),
    };
    this.environments.set(id, env);
    logger.info(
      TAG,
      `Registered environment ${id} (${req.machine_name}:${req.directory})`
    );
    return { environment_id: id, environment_secret: secret };
  }

  deregister(envId: string): boolean {
    const existed = this.environments.delete(envId);
    if (existed) {
      logger.info(TAG, `Deregistered environment ${envId}`);
    }
    return existed;
  }

  get(envId: string): Environment | undefined {
    return this.environments.get(envId);
  }

  getAll(): Environment[] {
    return Array.from(this.environments.values());
  }

  updateLastPoll(envId: string): void {
    const env = this.environments.get(envId);
    if (env) {
      env.lastPollAt = Date.now();
    }
  }
}
