import { v4 as uuidv4 } from 'uuid';

export interface SessionContext {
  id: string;
  data: Record<string, any>;
}

export class SessionManager {
  private static instance: SessionManager;
  private sessions: Map<string, SessionContext> = new Map();

  private constructor() {}

  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  public createSession(): SessionContext {
    const id = uuidv4();
    const context = { id, data: {} };
    this.sessions.set(id, context);
    return context;
  }

  public getSession(id: string): SessionContext | undefined {
    return this.sessions.get(id);
  }

  public removeSession(id: string) {
    this.sessions.delete(id);
  }
}
