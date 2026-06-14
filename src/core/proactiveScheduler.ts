import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";
import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import * as chokidar from "chokidar";
import type { Server } from "socket.io";
import { MidpointXGraph } from "./graph";
import { Config } from "./config";
import { TelegramService } from "../services/telegramService";
import fs from "fs";
import { GoalTracker } from "./goalTracker";

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
  trigger_config: Record<string, unknown>;
  intent: string;
  enabled?: boolean;
}

const _cronJobs = new Map<string, ScheduledTask>();
const _fileWatchers = new Map<string, chokidar.FSWatcher>();
let _pollerHandle: NodeJS.Timeout | null = null;
let _ioInstance: Server | undefined;

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
    const existing = db.prepare("SELECT id FROM scheduled_goals WHERE id = ?").get(id);
    if (!existing) throw new Error(`Schedule ${id} not found`);
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

  async init(io?: Server): Promise<void> {
    _ioInstance = io;
    console.log("📅 [ProactiveScheduler] Initializing...");
    const schedules = this.listSchedules().filter(s => s.enabled === 1);
    for (const s of schedules) {
      if (s.trigger_type === "cron") this._registerCron(s);
      else if (s.trigger_type === "file_watch") this._registerFileWatch(s);
      // webhook: queried on-demand via getWebhookScheduleId — no runtime registration needed
    }
    console.log(`📅 [ProactiveScheduler] Ready. ${schedules.length} schedule(s) active.`);
    this._startPoller();
  },

  _registerCron(schedule: ScheduledGoal): void {
    this._deregisterCron(schedule.id);
    try {
      const config = JSON.parse(schedule.trigger_config) as { expression: string };
      if (!cron.validate(config.expression)) {
        console.error(`❌ [ProactiveScheduler] Invalid cron expression for "${schedule.name}": ${config.expression}`);
        return;
      }
      const job = cron.schedule(config.expression, async () => {
        await this._onTriggerFired(schedule.id, { time: new Date().toISOString() });
      });
      _cronJobs.set(schedule.id, job);
      console.log(`📅 [ProactiveScheduler] Registered cron "${schedule.name}" [${config.expression}]`);
    } catch (err: unknown) {
      console.error(`❌ [ProactiveScheduler] Failed to register cron for "${schedule.name}":`, (err as Error).message);
    }
  },

  _deregisterCron(id: string): void {
    const job = _cronJobs.get(id);
    if (job) { job.stop(); _cronJobs.delete(id); }
  },

  _registerFileWatch(schedule: ScheduledGoal): void {
    this._deregisterFileWatch(schedule.id);
    try {
      const config = JSON.parse(schedule.trigger_config) as { path: string; events?: string[] };
      const targetPath = config.path;
      const events: string[] = config.events ?? ["add", "change", "unlink"];
      if (!fs.existsSync(targetPath)) {
        console.warn(`⚠️ [ProactiveScheduler] Watch path not found for "${schedule.name}": ${targetPath}. Disabling schedule.`);
        this.toggleSchedule(schedule.id, false);
        return;
      }
      const watcher = chokidar.watch(targetPath, { persistent: true, ignoreInitial: true });
      watcher.on("all", async (event: string, eventPath: string) => {
        if (!events.includes(event)) return;
        await this._onTriggerFired(schedule.id, { event, path: eventPath });
      });
      _fileWatchers.set(schedule.id, watcher);
      console.log(`📅 [ProactiveScheduler] Registered file watch "${schedule.name}" at ${targetPath}`);
    } catch (err: unknown) {
      console.error(`❌ [ProactiveScheduler] Failed to register file watch for "${schedule.name}":`, (err as Error).message);
    }
  },

  _deregisterFileWatch(id: string): void {
    const watcher = _fileWatchers.get(id);
    if (watcher) { watcher.close().catch(console.error); _fileWatchers.delete(id); }
  },

  async _onTriggerFired(scheduleId: string, triggerData: unknown): Promise<void> {
    const db = getDb();
    const schedule = db
      .prepare("SELECT * FROM scheduled_goals WHERE id = ? AND enabled = 1")
      .get(scheduleId) as ScheduledGoal | undefined;
    if (!schedule) return;

    if (schedule.active_goal_id) {
      const q: number[] = JSON.parse(schedule.queue || "[]");
      if (q.length >= 10) {
        console.warn(`⚠️ [ProactiveScheduler] Queue full for "${schedule.name}", trigger skipped.`);
        return;
      }
      q.push(Date.now());
      db.prepare("UPDATE scheduled_goals SET queue = ?, updated_at = ? WHERE id = ?")
        .run(JSON.stringify(q), Date.now(), scheduleId);
      console.log(`📅 [ProactiveScheduler] Queued trigger for "${schedule.name}" (depth: ${q.length})`);
      return;
    }

    await this._fireSchedule(schedule, triggerData);
  },

  async _fireSchedule(schedule: ScheduledGoal, triggerData: unknown): Promise<void> {
    const db = getDb();
    const runId = crypto.randomUUID();
    const scheduledTaskId = `SCHEDULE_${schedule.id}_${Date.now()}`;
    const now = Date.now();

    db.prepare(`
      INSERT INTO scheduled_goal_runs (id, scheduled_goal_id, goal_id, triggered_at, completed_at, status, trigger_data)
      VALUES (?, ?, NULL, ?, NULL, 'running', ?)
    `).run(runId, schedule.id, now, JSON.stringify(triggerData));

    console.log(`🔔 [ProactiveScheduler] Firing schedule "${schedule.name}"`);
    TelegramService.sendMessage(
      `🕐 Schedule fired: **${schedule.name}**\n${schedule.intent}`
    ).catch(() => {});

    // Fire graph in background — do not await full execution
    (async () => {
      try {
        const stream = await MidpointXGraph.stream(
          {
            taskId: scheduledTaskId,
            userIntent: schedule.intent,
            proactiveTrigger: { type: schedule.trigger_type, data: triggerData },
          },
          {
            recursionLimit: Config.MAX_RECURSION_LIMIT,
            configurable: { thread_id: scheduledTaskId },
          }
        );

        let goalId: string | null = null;
        for await (const chunk of stream) {
          const nodeName = Object.keys(chunk)[0];
          const stateUpdate = (chunk as Record<string, Record<string, unknown>>)[nodeName];
          if (!goalId && stateUpdate?.activeGoalId) {
            goalId = stateUpdate.activeGoalId as string;
            db.prepare(
              "UPDATE scheduled_goals SET active_goal_id = ?, updated_at = ? WHERE id = ?"
            ).run(goalId, Date.now(), schedule.id);
            db.prepare(
              "UPDATE scheduled_goal_runs SET goal_id = ? WHERE id = ?"
            ).run(goalId, runId);
          }
          if (_ioInstance && nodeName !== "__end__") {
            _ioInstance.emit("agent:progress", { stage: nodeName, data: stateUpdate });
          }
        }
        // active_goal_id is cleared by the completion poller (_reconcileRun) when
        // GoalTracker reports the goal as completed or failed — not here in _fireSchedule.
      } catch (err: unknown) {
        const message = (err as Error).message ?? String(err);
        console.error(`❌ [ProactiveScheduler] Graph execution failed for "${schedule.name}":`, message);
        db.prepare(
          "UPDATE scheduled_goal_runs SET status = 'failed', completed_at = ? WHERE id = ?"
        ).run(Date.now(), runId);
        db.prepare(
          "UPDATE scheduled_goals SET active_goal_id = NULL, updated_at = ? WHERE id = ?"
        ).run(Date.now(), schedule.id);
      }
    })().catch(console.error);
  },

  async triggerManually(id: string): Promise<void> {
    const schedule = this.getSchedule(id);
    if (!schedule) throw new Error(`Schedule ${id} not found`);
    await this._onTriggerFired(id, { manual: true, time: new Date().toISOString() });
  },

  _startPoller(): void {
    if (_pollerHandle) clearInterval(_pollerHandle);
    _pollerHandle = setInterval(() => {
      this._pollCompletion();
    }, 30_000);
    console.log("📅 [ProactiveScheduler] Completion poller started (30s interval)");
  },

  _stopPoller(): void {
    if (_pollerHandle) { clearInterval(_pollerHandle); _pollerHandle = null; }
  },

  _pollCompletion(): void {
    const db = getDb();
    const active = db
      .prepare("SELECT * FROM scheduled_goals WHERE active_goal_id IS NOT NULL")
      .all() as ScheduledGoal[];

    for (const schedule of active) {
      try {
        if (!schedule.active_goal_id) continue;
        const run = db
          .prepare(
            "SELECT * FROM scheduled_goal_runs WHERE scheduled_goal_id = ? AND status = 'running' ORDER BY triggered_at DESC LIMIT 1"
          )
          .get(schedule.id) as ScheduledGoalRun | undefined;
        if (!run) continue;

        const goal = GoalTracker.getGoal(schedule.active_goal_id);
        if (!goal) continue;

        const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
        if (goal.status === "active" && run.triggered_at < Date.now() - TWENTY_FOUR_HOURS) {
          console.warn(`⚠️ [ProactiveScheduler] Hang detected for "${schedule.name}" — marking failed`);
          this._reconcileRun(schedule.id, schedule.active_goal_id, run.id, "failed");
          continue;
        }

        if (goal.status === "completed" || goal.status === "failed") {
          this._reconcileRun(
            schedule.id,
            schedule.active_goal_id,
            run.id,
            goal.status === "completed" ? "completed" : "failed"
          );
        }
      } catch (err: unknown) {
        console.error(
          `❌ [ProactiveScheduler] _pollCompletion error for schedule "${schedule.name}":`,
          (err as Error).message
        );
      }
    }
  },

  _reconcileRun(
    scheduleId: string,
    goalId: string,
    runId: string,
    finalStatus: "completed" | "failed"
  ): "cleared" | "queued" {
    const db = getDb();
    const now = Date.now();

    // Check that we are reconciling the correct goal (race condition guard)
    const current = db
      .prepare("SELECT active_goal_id, queue FROM scheduled_goals WHERE id = ?")
      .get(scheduleId) as { active_goal_id: string | null; queue: string } | undefined;
    if (!current || current.active_goal_id !== goalId) return "cleared";

    const queue: number[] = JSON.parse(current.queue || "[]");

    // Atomic: update run status + clear active_goal_id + shrink queue in one transaction
    let nextTimestamp: number | null = null;
    if (queue.length > 0) {
      nextTimestamp = queue.shift()!;
    }

    db.transaction(() => {
      db.prepare(
        "UPDATE scheduled_goal_runs SET status = ?, completed_at = ? WHERE id = ?"
      ).run(finalStatus, now, runId);

      db.prepare(
        "UPDATE scheduled_goals SET active_goal_id = NULL, last_run_at = ?, updated_at = ?, queue = ? WHERE id = ?"
      ).run(now, now, JSON.stringify(queue), scheduleId);
    })();

    if (nextTimestamp !== null) {
      const schedule = db
        .prepare("SELECT * FROM scheduled_goals WHERE id = ?")
        .get(scheduleId) as ScheduledGoal | undefined;
      if (schedule) {
        this._fireSchedule(schedule, { queued_at: nextTimestamp, time: new Date(nextTimestamp).toISOString() })
          .catch(err => console.error(`❌ [ProactiveScheduler] Queue drain fire failed:`, (err as Error).message));
      }
      return "queued";
    }

    return "cleared";
  },
};
