import express from "express";
import cors from "cors";
import path from "path";

import { EnvironmentManager } from "./services/environmentManager";
import { SessionManager } from "./services/sessionManager";
import { WorkDispatcher } from "./services/workDispatcher";
import { ConnectionManager } from "./services/connectionManager";
import { EventProcessor } from "./services/eventProcessor";

import { createEnvironmentRoutes } from "./routes/environments";
import { createSessionRoutes } from "./routes/sessions";
import { createIngressRoutes } from "./routes/ingress";
import { createCcrV2Routes } from "./routes/ccrV2";
import { createWebApiRoutes } from "./routes/webApi";

export interface AppContext {
  envManager: EnvironmentManager;
  sessionManager: SessionManager;
  workDispatcher: WorkDispatcher;
  connectionManager: ConnectionManager;
  eventProcessor: EventProcessor;
}

export function createApp(): { app: express.Application; ctx: AppContext } {
  const app = express();

  // Services
  const envManager = new EnvironmentManager();
  const sessionManager = new SessionManager();
  const workDispatcher = new WorkDispatcher();
  const connectionManager = new ConnectionManager();
  const eventProcessor = new EventProcessor(sessionManager, connectionManager);

  const ctx: AppContext = {
    envManager,
    sessionManager,
    workDispatcher,
    connectionManager,
    eventProcessor,
  };

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  // Log all requests
  app.use((req, _res, next) => {
    if (process.env.DEBUG) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    }
    next();
  });

  // API routes (CLI protocol)
  app.use(createEnvironmentRoutes(envManager, workDispatcher, sessionManager));
  app.use(createSessionRoutes(sessionManager, workDispatcher, connectionManager));
  app.use(createIngressRoutes(sessionManager, connectionManager, eventProcessor));
  app.use(createCcrV2Routes(sessionManager, connectionManager));

  // Web API routes
  app.use(
    createWebApiRoutes(envManager, sessionManager, workDispatcher, connectionManager)
  );

  // Serve static web frontend
  app.use(express.static(path.join(__dirname, "..", "web")));

  // Fallback to index.html for SPA routing
  app.get("*", (req, res, next) => {
    // Don't intercept API or v1/v2 routes
    if (
      req.path.startsWith("/api/") ||
      req.path.startsWith("/v1/") ||
      req.path.startsWith("/v2/")
    ) {
      next();
      return;
    }
    res.sendFile(path.join(__dirname, "..", "web", "index.html"));
  });

  return { app, ctx };
}
