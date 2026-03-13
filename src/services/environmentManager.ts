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
    // Support reusing an existing environment ID
    if (req.environment_id && this.environments.has(req.environment_id)) {
      const existing = this.environments.get(req.environment_id)!;
      // Update fields
      existing.machineName = req.machine_name;
      existing.directory = req.directory;
      existing.branch = req.branch;
      existing.gitRepoUrl = req.git_repo_url;
      existing.maxSessions = req.max_sessions;
      existing.spawnMode = req.spawn_mode;
      existing.metadata = req.metadata;
      existing.registeredAt = Date.now();
      logger.info(
        TAG,
        `Re-registered environment ${existing.id} (${req.machine_name}:${req.directory})`
      );
      return { environment_id: existing.id, environment_secret: existing.secret };
    }

    const id = req.environment_id || uuidv4();
    const secret = uuidv4();
    const env: Environment = {
      id,
      secret,
      machineName: req.machine_name,
      directory: req.directory,
      branch: req.branch,
      gitRepoUrl: req.git_repo_url,
      maxSessions: req.max_sessions,
      spawnMode: req.spawn_mode,
      metadata: req.metadata,
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
