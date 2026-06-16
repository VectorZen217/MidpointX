import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";
import { SwarmBus } from "./swarmBus";

export type MissionMode = "short" | "long-horizon";
export type MissionStatus = "active" | "paused" | "completed" | "failed";

export interface MissionRecord {
  id: string;
  thread_id: string;
  intent_summary: string;
  mode: MissionMode;
  status: MissionStatus;
  turn_count: number;
  failure_reason: string | null;
  created_at: string;
  last_active_at: string;
}

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath =
    process.env.MISSION_STORE_DB_PATH ||
    path.resolve(process.cwd(), "src/workspace/midpointx.db");
  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS mission_manifest (
      id TEXT PRIMARY KEY,
      thread_id TEXT UNIQUE NOT NULL,
      intent_summary TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      turn_count INTEGER NOT NULL DEFAULT 0,
      failure_reason TEXT,
      created_at TEXT NOT NULL,
      last_active_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mm_status ON mission_manifest(status);
    CREATE INDEX IF NOT EXISTS idx_mm_thread ON mission_manifest(thread_id);
  `);
  return _db;
}

export function _resetMissionStoreForTesting(customPath?: string): void {
  if (_db) {
    try { _db.close(); } catch {}
    _db = null;
  }
  if (customPath !== undefined) process.env.MISSION_STORE_DB_PATH = customPath;
}

export const MissionStore = {
  register(threadId: string, intentSummary: string, mode: MissionMode): void {
    const db = getDb();
    const existing = db.prepare("SELECT id FROM mission_manifest WHERE thread_id = ?").get(threadId);
    if (existing) return;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO mission_manifest (id, thread_id, intent_summary, mode, status, turn_count, failure_reason, created_at, last_active_at)
      VALUES (?, ?, ?, ?, 'active', 0, NULL, ?, ?)
    `).run(crypto.randomUUID(), threadId, intentSummary.slice(0, 200), mode, now, now);
    SwarmBus.emit("mission:registered", { threadId, mode, intent: intentSummary.slice(0, 200) });
  },

  tick(threadId: string): void {
    getDb()
      .prepare("UPDATE mission_manifest SET turn_count = turn_count + 1, last_active_at = ? WHERE thread_id = ?")
      .run(new Date().toISOString(), threadId);
  },

  complete(threadId: string): void {
    getDb()
      .prepare("UPDATE mission_manifest SET status = 'completed', last_active_at = ? WHERE thread_id = ?")
      .run(new Date().toISOString(), threadId);
    SwarmBus.emit("mission:completed", { threadId });
  },

  fail(threadId: string, reason: string): void {
    getDb()
      .prepare("UPDATE mission_manifest SET status = 'failed', failure_reason = ?, last_active_at = ? WHERE thread_id = ?")
      .run(reason, new Date().toISOString(), threadId);
    SwarmBus.emit("mission:failed", { threadId, reason });
  },

  pause(threadId: string): void {
    getDb()
      .prepare("UPDATE mission_manifest SET status = 'paused', last_active_at = ? WHERE thread_id = ?")
      .run(new Date().toISOString(), threadId);
  },

  resume(threadId: string): void {
    getDb()
      .prepare("UPDATE mission_manifest SET status = 'active', last_active_at = ? WHERE thread_id = ?")
      .run(new Date().toISOString(), threadId);
    SwarmBus.emit("mission:resumed", { threadId });
  },

  getMode(threadId: string): MissionMode | null {
    const row = getDb()
      .prepare("SELECT mode FROM mission_manifest WHERE thread_id = ?")
      .get(threadId) as { mode: MissionMode } | undefined;
    return row?.mode ?? null;
  },

  getTurnCount(threadId: string): number {
    const row = getDb()
      .prepare("SELECT turn_count FROM mission_manifest WHERE thread_id = ?")
      .get(threadId) as { turn_count: number } | undefined;
    return row?.turn_count ?? 0;
  },

  listActive(): MissionRecord[] {
    return getDb()
      .prepare(
        "SELECT * FROM mission_manifest WHERE status IN ('active', 'paused') ORDER BY last_active_at DESC"
      )
      .all() as MissionRecord[];
  },

  listAll(): MissionRecord[] {
    return getDb()
      .prepare("SELECT * FROM mission_manifest ORDER BY last_active_at DESC")
      .all() as MissionRecord[];
  },

  get(threadId: string): MissionRecord | null {
    return (
      getDb()
        .prepare("SELECT * FROM mission_manifest WHERE thread_id = ?")
        .get(threadId) as MissionRecord | undefined
    ) ?? null;
  },
};
