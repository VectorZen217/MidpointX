import { PersistenceFactory } from "./persistence";

export enum SessionStatus {
  ACTIVE = "ACTIVE",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  TIMEOUT = "TIMEOUT",
  CRASHED = "CRASHED"
}

export interface SessionMetadata {
  taskId: string;
  userId: string;
  status: SessionStatus;
  startedAt: string;
  expiresAt: string;
  lastHeartbeat: string;
  stepCount: number;
}

/**
 * SessionManager: Lifecycle management for A2A reasoning loops.
 * Prevents "zombie" states and enables deterministic resource cleanup.
 */
export class SessionManager {
  private static DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
  private static MAX_STEPS = 1000;

  /**
   * Initializes a new reasoning session.
   */
  static async createSession(taskId: string, userId: string): Promise<SessionMetadata> {
    const adapter = PersistenceFactory.getAdapter();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.DEFAULT_TTL_MS);

    const session: SessionMetadata = {
      taskId,
      userId,
      status: SessionStatus.ACTIVE,
      startedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      lastHeartbeat: now.toISOString(),
      stepCount: 0
    };

    // In a production scenario, this would write to Redis or Firestore
    // For now, we utilize the PersistenceAdapter abstraction
    await adapter.saveSession(session);
    console.log(`🚀 [SessionManager] Created session ${taskId} for user ${userId}. Expires at ${session.expiresAt}`);
    
    return session;
  }

  /**
   * Updates the session heartbeat and increments step count.
   * Throws if the session has expired or exceeded step limits.
   */
  static async heartbeat(taskId: string): Promise<void> {
    const adapter = PersistenceFactory.getAdapter();
    const session = await adapter.getSession(taskId);

    if (!session) {
      throw new Error(`❌ [SessionManager] Session ${taskId} not found.`);
    }

    const now = new Date();
    if (new Date(session.expiresAt) < now) {
      await this.terminateSession(taskId, SessionStatus.TIMEOUT);
      throw new Error(`❌ [SessionManager] Session ${taskId} has TIMED OUT.`);
    }

    if (session.stepCount >= this.MAX_STEPS) {
      await this.terminateSession(taskId, SessionStatus.FAILED);
      throw new Error(`❌ [SessionManager] Session ${taskId} exceeded MAX_STEPS (${this.MAX_STEPS}).`);
    }

    session.lastHeartbeat = now.toISOString();
    session.stepCount++;
    
    await adapter.saveSession(session);
  }

  /**
   * Gracefully terminates a session.
   */
  static async terminateSession(taskId: string, status: SessionStatus): Promise<void> {
    const adapter = PersistenceFactory.getAdapter();
    const session = await adapter.getSession(taskId);
    
    if (session) {
      session.status = status;
      await adapter.saveSession(session);
      console.log(`🛑 [SessionManager] Session ${taskId} terminated with status: ${status}`);
    }
  }
}
