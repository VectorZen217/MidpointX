import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";

export interface ScheduledGoal {
  id: string;
  name: string;
  trigger_type: "cron" | "file_watch" | "webhook";
  trigger_config: string; // JSON
  intent: string;
  enabled: number; // 0 | 1
  active_goal_id: string | null;
  queue: string; // JSON array of timestamps
  last_run_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface ScheduledGoalRun {
  id: string;
  scheduled_goal_id: string;
  goal_id: string | null;
  triggered_at: number;
  completed_at: number | null;
  status: "running" | "completed" | "failed";
  trigger_data: string; // JSON
}

export interface CreateScheduleInput {
  name: string;
  trigger_type: "cron" | "file_watch" | "webhook";
  trigger_config: Record<string, any>;
  intent: string;
  enabled?: boolean;
}

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath =
    process.env.PROACTIVE_SCHEDULER_DB_PATH ||
    path.resolve(process.cwd(), "src/workspace/midpointx.db");
  _db = new Database(dbPath);
  _db.pragma("foreign_keys = ON");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_goals (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      trigger_type TEXT NOT NULL,
      trigger_config TEXT NOT NULL DEFAULT '{}',
      intent TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      active_goal_id TEXT,
      queue TEXT NOT NULL DEFAULT '[]',
      last_run_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scheduled_goal_runs (
      id TEXT PRIMARY KEY,
      scheduled_goal_id TEXT NOT NULL,
      goal_id TEXT,
      triggered_at INTEGER NOT NULL,
      completed_at INTEGER,
      status TEXT NOT NULL DEFAULT 'running',
      trigger_data TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (scheduled_goal_id) REFERENCES scheduled_goals(id)
    );
    CREATE INDEX IF NOT EXISTS idx_scheduled_goals_enabled ON scheduled_goals(enabled);
    CREATE INDEX IF NOT EXISTS idx_scheduled_goal_runs_schedule ON scheduled_goal_runs(scheduled_goal_id);
  `);
  return _db;
}

export function _resetDbForTesting(customPath?: string): void {
  if (_db) {
    try { _db.close(); } catch {}
    _db = null;
  }
  if (customPath !== undefined) process.env.PROACTIVE_SCHEDULER_DB_PATH = customPath;
}

export const ProactiveScheduler = {
  createSchedule(input: CreateScheduleInput): ScheduledGoal {
    const db = getDb();
    const existing = db
      .prepare("SELECT id FROM scheduled_goals WHERE name = ?")
      .get(input.name);
    if (existing) throw new Error(`Schedule "${input.name}" already exists`);

    const id = crypto.randomUUID();
    const now = Date.now();
    db.prepare(`
      INSERT INTO scheduled_goals (id, name, trigger_type, trigger_config, intent, enabled, active_goal_id, queue, last_run_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, '[]', NULL, ?, ?)
    `).run(
      id,
      input.name,
      input.trigger_type,
      JSON.stringify(input.trigger_config),
      input.intent,
      input.enabled !== false ? 1 : 0,
      now,
      now
    );
    return db.prepare("SELECT * FROM scheduled_goals WHERE id = ?").get(id) as ScheduledGoal;
  },

  getSchedule(id: string): ScheduledGoal | null {
    return (getDb()
      .prepare("SELECT * FROM scheduled_goals WHERE id = ?")
      .get(id) as ScheduledGoal | undefined) ?? null;
  },

  updateSchedule(id: string, updates: Partial<CreateScheduleInput>): ScheduledGoal {
    const db = getDb();
    const now = Date.now();
    if (updates.name !== undefined) {
      db.prepare("UPDATE scheduled_goals SET name = ?, updated_at = ? WHERE id = ?")
        .run(updates.name, now, id);
    }
    if (updates.trigger_config !== undefined) {
      db.prepare("UPDATE scheduled_goals SET trigger_config = ?, updated_at = ? WHERE id = ?")
        .run(JSON.stringify(updates.trigger_config), now, id);
    }
    if (updates.intent !== undefined) {
      db.prepare("UPDATE scheduled_goals SET intent = ?, updated_at = ? WHERE id = ?")
        .run(updates.intent, now, id);
    }
    if (updates.trigger_type !== undefined) {
      db.prepare("UPDATE scheduled_goals SET trigger_type = ?, updated_at = ? WHERE id = ?")
        .run(updates.trigger_type, now, id);
    }
    return db.prepare("SELECT * FROM scheduled_goals WHERE id = ?").get(id) as ScheduledGoal;
  },

  deleteSchedule(id: string): void {
    getDb().prepare("DELETE FROM scheduled_goals WHERE id = ?").run(id);
  },

  toggleSchedule(id: string, enabled: boolean): void {
    getDb()
      .prepare("UPDATE scheduled_goals SET enabled = ?, updated_at = ? WHERE id = ?")
      .run(enabled ? 1 : 0, Date.now(), id);
  },

  listSchedules(): ScheduledGoal[] {
    return getDb()
      .prepare("SELECT * FROM scheduled_goals ORDER BY created_at DESC")
      .all() as ScheduledGoal[];
  },

  getRunHistory(scheduleId: string, limit = 20, offset = 0): ScheduledGoalRun[] {
    return getDb()
      .prepare(
        "SELECT * FROM scheduled_goal_runs WHERE scheduled_goal_id = ? ORDER BY triggered_at DESC LIMIT ? OFFSET ?"
      )
      .all(scheduleId, limit, offset) as ScheduledGoalRun[];
  },

  getWebhookScheduleId(webhookPath: string): string | null {
    const row = getDb()
      .prepare(
        `SELECT id FROM scheduled_goals WHERE trigger_type = 'webhook' AND json_extract(trigger_config, '$.path') = ? AND enabled = 1`
      )
      .get(webhookPath) as { id: string } | undefined;
    return row?.id ?? null;
  },

  _setActiveGoalForTest(id: string, goalId: string | null): void {
    getDb()
      .prepare("UPDATE scheduled_goals SET active_goal_id = ? WHERE id = ?")
      .run(goalId, id);
  },

  _appendQueueForTest(id: string, timestamp: number): void {
    const db = getDb();
    const row = db.prepare("SELECT queue FROM scheduled_goals WHERE id = ?").get(id) as { queue: string } | undefined;
    if (!row) return;
    const q: number[] = JSON.parse(row.queue || "[]");
    if (q.length >= 10) return;
    q.push(timestamp);
    db.prepare("UPDATE scheduled_goals SET queue = ? WHERE id = ?").run(JSON.stringify(q), id);
  },
};
