import { v4 as uuidv4 } from "uuid";
import type { Session, CreateSessionRequest, SessionMessage } from "../types";
import { logger } from "../utils/logger";

const TAG = "session";

export class SessionManager {
  private sessions = new Map<string, Session>();

  create(req: CreateSessionRequest): Session {
    const id = uuidv4();
    const session: Session = {
      id,
      title: req.title || "Untitled Session",
      environmentId: req.environment_id,
      source: req.source || "web",
      status: "active",
      messages: [],
      createdAt: Date.now(),
      permissionMode: req.permission_mode,
    };

    // Add initial events as messages if provided
    if (req.events && Array.isArray(req.events)) {
      for (const event of req.events) {
        session.messages.push({ ...event, timestamp: Date.now() });
      }
    }

    this.sessions.set(id, session);
    logger.info(TAG, `Created session ${id} for env ${req.environment_id}`);
    return session;
  }

  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  archive(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = "archived";
      logger.info(TAG, `Archived session ${sessionId}`);
      return true;
    }
    return false;
  }

  updateTitle(sessionId: string, title: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.title = title;
      return true;
    }
    return false;
  }

  addMessage(sessionId: string, message: SessionMessage): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messages.push(message);
    }
  }

  addMessages(sessionId: string, messages: SessionMessage[]): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messages.push(...messages);
    }
  }

  getMessages(sessionId: string): SessionMessage[] {
    const session = this.sessions.get(sessionId);
    return session ? session.messages : [];
  }

  getByEnvironment(envId: string): Session[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.environmentId === envId
    );
  }

  getAll(): Session[] {
    return Array.from(this.sessions.values());
  }
}
