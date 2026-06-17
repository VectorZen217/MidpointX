# Proactive Goal Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a SQLite-backed scheduler that lets users and the agent define named, trigger-based goals (cron / file_watch / webhook) that run autonomously via GoalTracker.

**Architecture:** `ProactiveScheduler` is a new singleton class owning all user-configured schedules in SQLite. It registers cron jobs and chokidar watchers on `init()`, queues concurrent trigger fires instead of dropping or parallelizing them, and reconciles completion status every 30 seconds via a poller. Observer's `triggerWebhook` is extended to check ProactiveScheduler's webhook map first. The `schedule_goal` agent tool is injected into PluginRegistry via dynamic `require()` to avoid a circular dependency.

**Tech Stack:** TypeScript 5.4, better-sqlite3, node-cron (existing), chokidar (existing), Express, React 18 + lucide-react + Tailwind

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/core/proactiveScheduler.ts` | CREATE | SQLite singleton — schema, CRUD, trigger wiring, _fireSchedule, poller |
| `src/routes/scheduleRoutes.ts` | CREATE | 7 REST endpoints for schedule management |
| `src/server.ts` | MODIFY | Import scheduleRoutes, mount `/api/v1/schedules`, call `ProactiveScheduler.init(io)` |
| `src/core/observer.ts` | MODIFY | `triggerWebhook` checks ProactiveScheduler webhook map before MD skills |
| `src/core/pluginRegistry.ts` | MODIFY | Register `schedule_goal` tool declaration + dynamic require handler |
| `src/tests/proactiveScheduler.test.ts` | CREATE | Unit tests: CRUD, queue logic, poller reconciliation |
| `frontend/src/components/SchedulesView.jsx` | CREATE | Two-column UI: create form + schedule list (left), run history (right) |
| `frontend/src/App.jsx` | MODIFY | Add `proactive-schedules` view import and render |
| `frontend/src/components/Sidebar.jsx` | MODIFY | Add SCHEDULES nav item |

---

## Task 1: ProactiveScheduler — SQLite schema + CRUD

**Files:**
- Create: `src/core/proactiveScheduler.ts`
- Create: `src/tests/proactiveScheduler.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/tests/proactiveScheduler.test.ts`:

```typescript
import os from "os";
import path from "path";
import fs from "fs";
import { ProactiveScheduler, _resetDbForTesting } from "../core/proactiveScheduler";

function tempDb(): string {
  return path.join(os.tmpdir(), `pgs_test_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
}

beforeEach(() => {
  const dbPath = tempDb();
  _resetDbForTesting(dbPath);
});

afterEach(() => {
  _resetDbForTesting();
});

describe("ProactiveScheduler CRUD", () => {
  test("createSchedule inserts a row and returns it", () => {
    const s = ProactiveScheduler.createSchedule({
      name: "Morning Digest",
      trigger_type: "cron",
      trigger_config: { expression: "0 9 * * *" },
      intent: "Summarize overnight news",
      enabled: true,
    });
    expect(s.id).toHaveLength(36);
    expect(s.name).toBe("Morning Digest");
    expect(s.enabled).toBe(1);
    expect(JSON.parse(s.queue)).toEqual([]);
    expect(s.active_goal_id).toBeNull();
  });

  test("getSchedule returns null for unknown id", () => {
    expect(ProactiveScheduler.getSchedule("nonexistent")).toBeNull();
  });

  test("getSchedule returns inserted row", () => {
    const s = ProactiveScheduler.createSchedule({
      name: "File Watcher",
      trigger_type: "file_watch",
      trigger_config: { path: "D:/Reports", events: ["add", "change"] },
      intent: "Process new report files",
    });
    const retrieved = ProactiveScheduler.getSchedule(s.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.name).toBe("File Watcher");
  });

  test("createSchedule rejects duplicate name", () => {
    ProactiveScheduler.createSchedule({
      name: "Duplicate",
      trigger_type: "cron",
      trigger_config: { expression: "* * * * *" },
      intent: "test",
    });
    expect(() =>
      ProactiveScheduler.createSchedule({
        name: "Duplicate",
        trigger_type: "cron",
        trigger_config: { expression: "* * * * *" },
        intent: "test2",
      })
    ).toThrow("already exists");
  });

  test("updateSchedule changes fields", () => {
    const s = ProactiveScheduler.createSchedule({
      name: "Original",
      trigger_type: "cron",
      trigger_config: { expression: "0 9 * * *" },
      intent: "Old intent",
    });
    const updated = ProactiveScheduler.updateSchedule(s.id, { intent: "New intent" });
    expect(updated.intent).toBe("New intent");
    expect(updated.name).toBe("Original");
  });

  test("deleteSchedule removes the row", () => {
    const s = ProactiveScheduler.createSchedule({
      name: "ToDelete",
      trigger_type: "cron",
      trigger_config: { expression: "0 9 * * *" },
      intent: "delete me",
    });
    ProactiveScheduler.deleteSchedule(s.id);
    expect(ProactiveScheduler.getSchedule(s.id)).toBeNull();
  });

  test("toggleSchedule flips enabled flag", () => {
    const s = ProactiveScheduler.createSchedule({
      name: "Toggleable",
      trigger_type: "cron",
      trigger_config: { expression: "0 9 * * *" },
      intent: "toggle test",
      enabled: true,
    });
    ProactiveScheduler.toggleSchedule(s.id, false);
    expect(ProactiveScheduler.getSchedule(s.id)!.enabled).toBe(0);
    ProactiveScheduler.toggleSchedule(s.id, true);
    expect(ProactiveScheduler.getSchedule(s.id)!.enabled).toBe(1);
  });

  test("listSchedules returns all rows", () => {
    ProactiveScheduler.createSchedule({ name: "A", trigger_type: "cron", trigger_config: { expression: "* * * * *" }, intent: "a" });
    ProactiveScheduler.createSchedule({ name: "B", trigger_type: "cron", trigger_config: { expression: "* * * * *" }, intent: "b" });
    expect(ProactiveScheduler.listSchedules()).toHaveLength(2);
  });

  test("queue append and cap at 10", () => {
    const s = ProactiveScheduler.createSchedule({
      name: "QueueTest",
      trigger_type: "cron",
      trigger_config: { expression: "* * * * *" },
      intent: "queue test",
      enabled: true,
    });
    // Set active_goal_id to simulate busy schedule
    ProactiveScheduler._setActiveGoalForTest(s.id, "fake-goal-id");
    // Append 11 timestamps — 11th should be dropped
    for (let i = 0; i < 11; i++) {
      ProactiveScheduler._appendQueueForTest(s.id, Date.now() + i);
    }
    const row = ProactiveScheduler.getSchedule(s.id)!;
    expect(JSON.parse(row.queue)).toHaveLength(10);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```powershell
npx jest proactiveScheduler --no-coverage 2>&1 | Select-Object -Last 20
```

Expected: FAIL — `Cannot find module '../core/proactiveScheduler'`

- [ ] **Step 3: Implement the ProactiveScheduler class (CRUD only)**

Create `src/core/proactiveScheduler.ts`:

```typescript
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

  // Test helpers — not called in production code
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
    if (q.length >= 10) return; // cap
    q.push(timestamp);
    db.prepare("UPDATE scheduled_goals SET queue = ? WHERE id = ?").run(JSON.stringify(q), id);
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npx jest proactiveScheduler --no-coverage 2>&1 | Select-Object -Last 20
```

Expected: All tests PASS

- [ ] **Step 5: Type-check**

```powershell
npx tsc --noEmit 2>&1 | Select-Object -Last 20
```

Expected: No errors

- [ ] **Step 6: Commit**

```powershell
git add src/core/proactiveScheduler.ts src/tests/proactiveScheduler.test.ts
git commit -m "feat(scheduler): add ProactiveScheduler SQLite schema and CRUD methods"
```

---

## Task 2: ProactiveScheduler — Trigger wiring + _fireSchedule

**Files:**
- Modify: `src/core/proactiveScheduler.ts`

- [ ] **Step 1: Add imports and class-level state maps to proactiveScheduler.ts**

Add at the top of `src/core/proactiveScheduler.ts`, after the existing imports:

```typescript
import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import * as chokidar from "chokidar";
import { Server } from "socket.io";
import { MidpointXGraph } from "./graph";
import { Config } from "./config";
import { GoalTracker } from "./goalTracker";
import { TelegramService } from "../services/telegramService";
import fs from "fs";
```

Add these private maps as module-level variables (above `let _db`):

```typescript
const _cronJobs = new Map<string, ScheduledTask>();
const _fileWatchers = new Map<string, chokidar.FSWatcher>();
let _pollerHandle: NodeJS.Timeout | null = null;
let _ioInstance: Server | undefined;
```

- [ ] **Step 2: Add init() and private trigger registration methods to ProactiveScheduler**

Add the following methods to the `ProactiveScheduler` object (after `_appendQueueForTest`):

```typescript
  async init(io?: Server): Promise<void> {
    _ioInstance = io;
    console.log("📅 [ProactiveScheduler] Initializing...");
    const schedules = this.listSchedules().filter(s => s.enabled === 1);
    for (const s of schedules) {
      if (s.trigger_type === "cron") this._registerCron(s);
      else if (s.trigger_type === "file_watch") this._registerFileWatch(s);
      else if (s.trigger_type === "webhook") {
        // webhook map is queried via getWebhookScheduleId — no runtime registration needed
      }
    }
    this._startPoller();
    console.log(`📅 [ProactiveScheduler] Ready. ${schedules.length} schedule(s) active.`);
  },

  _registerCron(schedule: ScheduledGoal): void {
    this._deregisterCron(schedule.id);
    try {
      const config = JSON.parse(schedule.trigger_config);
      if (!cron.validate(config.expression)) {
        console.error(`❌ [ProactiveScheduler] Invalid cron expression for "${schedule.name}": ${config.expression}`);
        return;
      }
      const job = cron.schedule(config.expression, async () => {
        await this._onTriggerFired(schedule.id, { time: new Date().toISOString() });
      });
      _cronJobs.set(schedule.id, job);
      console.log(`📅 [ProactiveScheduler] Registered cron "${schedule.name}" [${config.expression}]`);
    } catch (err: any) {
      console.error(`❌ [ProactiveScheduler] Failed to register cron for "${schedule.name}":`, err.message);
    }
  },

  _deregisterCron(id: string): void {
    const job = _cronJobs.get(id);
    if (job) { job.stop(); _cronJobs.delete(id); }
  },

  _registerFileWatch(schedule: ScheduledGoal): void {
    this._deregisterFileWatch(schedule.id);
    try {
      const config = JSON.parse(schedule.trigger_config);
      const targetPath = config.path as string;
      const events: string[] = config.events || ["add", "change", "unlink"];
      if (!fs.existsSync(targetPath)) {
        console.warn(`⚠️ [ProactiveScheduler] Watch path not found for "${schedule.name}": ${targetPath}. Schedule saved as disabled.`);
        this.toggleSchedule(schedule.id, false);
        return;
      }
      const watcher = chokidar.watch(targetPath, { persistent: true, ignoreInitial: true });
      watcher.on("all", async (event, eventPath) => {
        if (!events.includes(event)) return;
        await this._onTriggerFired(schedule.id, { event, path: eventPath });
      });
      _fileWatchers.set(schedule.id, watcher);
      console.log(`📅 [ProactiveScheduler] Registered file watch "${schedule.name}" at ${targetPath}`);
    } catch (err: any) {
      console.error(`❌ [ProactiveScheduler] Failed to register file watch for "${schedule.name}":`, err.message);
    }
  },

  async _deregisterFileWatch(id: string): Promise<void> {
    const watcher = _fileWatchers.get(id);
    if (watcher) { await watcher.close(); _fileWatchers.delete(id); }
  },

  async _onTriggerFired(scheduleId: string, triggerData: any): Promise<void> {
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
      console.log(`📅 [ProactiveScheduler] Queued trigger for "${schedule.name}" (queue depth: ${q.length})`);
      return;
    }

    await this._fireSchedule(schedule, triggerData);
  },

  async _fireSchedule(schedule: ScheduledGoal, triggerData: any): Promise<void> {
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
          const stateUpdate = (chunk as any)[nodeName];
          if (!goalId && stateUpdate?.activeGoalId) {
            goalId = stateUpdate.activeGoalId;
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
      } catch (err: any) {
        console.error(`❌ [ProactiveScheduler] Graph execution failed for "${schedule.name}":`, err.message);
        db.prepare(
          "UPDATE scheduled_goal_runs SET status = 'failed', completed_at = ?, trigger_data = ? WHERE id = ?"
        ).run(
          Date.now(),
          JSON.stringify({ ...triggerData, error: err.message }),
          runId
        );
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
```

- [ ] **Step 3: Type-check**

```powershell
npx tsc --noEmit 2>&1 | Select-Object -Last 30
```

Expected: No errors. If `Server` from socket.io causes issues, change to `import type { Server } from "socket.io"` and cast `_ioInstance` accordingly.

- [ ] **Step 4: Run existing tests to verify nothing broke**

```powershell
npx jest proactiveScheduler --no-coverage 2>&1 | Select-Object -Last 20
```

Expected: All tests still PASS (trigger methods not tested yet — that's in Task 3's integration approach)

- [ ] **Step 5: Commit**

```powershell
git add src/core/proactiveScheduler.ts
git commit -m "feat(scheduler): add ProactiveScheduler trigger wiring and _fireSchedule"
```

---

## Task 3: ProactiveScheduler — Completion poller

**Files:**
- Modify: `src/core/proactiveScheduler.ts`
- Modify: `src/tests/proactiveScheduler.test.ts`

- [ ] **Step 1: Write failing tests for poller reconciliation**

Add to `src/tests/proactiveScheduler.test.ts`:

```typescript
describe("ProactiveScheduler poller reconciliation", () => {
  test("_reconcileRun marks completed when GoalTracker goal is completed", () => {
    const s = ProactiveScheduler.createSchedule({
      name: "PollerTest",
      trigger_type: "cron",
      trigger_config: { expression: "* * * * *" },
      intent: "poller test",
      enabled: true,
    });

    // Manually insert a run row and set active_goal_id
    const db = require("better-sqlite3")(process.env.PROACTIVE_SCHEDULER_DB_PATH!);
    const runId = "test-run-id-001";
    const fakeGoalId = "fake-goal-111";
    db.prepare(
      `INSERT INTO scheduled_goal_runs (id, scheduled_goal_id, goal_id, triggered_at, completed_at, status, trigger_data)
       VALUES (?, ?, ?, ?, NULL, 'running', '{}')`
    ).run(runId, s.id, fakeGoalId, Date.now());
    ProactiveScheduler._setActiveGoalForTest(s.id, fakeGoalId);
    db.close();

    // Simulate GoalTracker returning a completed goal by mocking _reconcileRun
    const result = ProactiveScheduler._reconcileRun(s.id, fakeGoalId, runId, "completed");
    expect(result).toBe("cleared");

    const updated = ProactiveScheduler.getSchedule(s.id)!;
    expect(updated.active_goal_id).toBeNull();
    expect(updated.last_run_at).not.toBeNull();
  });

  test("_reconcileRun pops queue and returns 'queued' when queue is non-empty", () => {
    const s = ProactiveScheduler.createSchedule({
      name: "QueueDrain",
      trigger_type: "cron",
      trigger_config: { expression: "* * * * *" },
      intent: "queue drain test",
      enabled: true,
    });
    ProactiveScheduler._setActiveGoalForTest(s.id, "active-goal");
    // Add 2 queued timestamps
    ProactiveScheduler._appendQueueForTest(s.id, Date.now() - 2000);
    ProactiveScheduler._appendQueueForTest(s.id, Date.now() - 1000);

    const db = require("better-sqlite3")(process.env.PROACTIVE_SCHEDULER_DB_PATH!);
    const runId = "test-run-id-002";
    db.prepare(
      `INSERT INTO scheduled_goal_runs (id, scheduled_goal_id, goal_id, triggered_at, completed_at, status, trigger_data)
       VALUES (?, ?, 'active-goal', ?, NULL, 'running', '{}')`
    ).run(runId, s.id, Date.now());
    db.close();

    const result = ProactiveScheduler._reconcileRun(s.id, "active-goal", runId, "completed");
    expect(result).toBe("queued"); // popped 1 from queue, queued next

    const updated = ProactiveScheduler.getSchedule(s.id)!;
    const remaining: number[] = JSON.parse(updated.queue);
    expect(remaining).toHaveLength(1); // 1 left in queue
  });
});
```

- [ ] **Step 2: Run tests to confirm new ones fail**

```powershell
npx jest proactiveScheduler --no-coverage 2>&1 | Select-Object -Last 20
```

Expected: 2 new tests FAIL — `_reconcileRun is not a function`

- [ ] **Step 3: Implement `_startPoller`, `_stopPoller`, and `_reconcileRun`**

Add to the `ProactiveScheduler` object in `src/core/proactiveScheduler.ts`:

```typescript
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
      if (!schedule.active_goal_id) continue;
      const run = db
        .prepare(
          "SELECT * FROM scheduled_goal_runs WHERE scheduled_goal_id = ? AND status = 'running' ORDER BY triggered_at DESC LIMIT 1"
        )
        .get(schedule.id) as ScheduledGoalRun | undefined;
      if (!run) continue;

      const goal = GoalTracker.getGoal(schedule.active_goal_id);
      if (!goal) continue;

      // 24h hang detection
      const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
      if (goal.status === "active" && run.triggered_at < Date.now() - TWENTY_FOUR_HOURS) {
        console.warn(`⚠️ [ProactiveScheduler] Hang detected for "${schedule.name}" — marking failed`);
        this._reconcileRun(schedule.id, schedule.active_goal_id, run.id, "failed");
        continue;
      }

      if (goal.status === "completed" || goal.status === "failed") {
        this._reconcileRun(schedule.id, schedule.active_goal_id, run.id, goal.status === "completed" ? "completed" : "failed");
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

    db.prepare(
      "UPDATE scheduled_goal_runs SET status = ?, completed_at = ? WHERE id = ?"
    ).run(finalStatus, now, runId);

    db.prepare(
      "UPDATE scheduled_goals SET active_goal_id = NULL, last_run_at = ?, updated_at = ? WHERE id = ?"
    ).run(now, now, scheduleId);

    const schedule = db
      .prepare("SELECT * FROM scheduled_goals WHERE id = ?")
      .get(scheduleId) as ScheduledGoal | undefined;
    if (!schedule) return "cleared";

    const queue: number[] = JSON.parse(schedule.queue || "[]");
    if (queue.length > 0) {
      const nextTimestamp = queue.shift()!;
      db.prepare("UPDATE scheduled_goals SET queue = ?, updated_at = ? WHERE id = ?")
        .run(JSON.stringify(queue), now, scheduleId);
      // Fire in background — trigger data is the queued timestamp
      this._fireSchedule(schedule, { queued_at: nextTimestamp, time: new Date(nextTimestamp).toISOString() })
        .catch(err => console.error(`❌ [ProactiveScheduler] Queue drain fire failed:`, err.message));
      return "queued";
    }

    return "cleared";
  },
```

- [ ] **Step 4: Run all tests**

```powershell
npx jest proactiveScheduler --no-coverage 2>&1 | Select-Object -Last 20
```

Expected: All tests PASS

- [ ] **Step 5: Type-check**

```powershell
npx tsc --noEmit 2>&1 | Select-Object -Last 20
```

Expected: No errors

- [ ] **Step 6: Commit**

```powershell
git add src/core/proactiveScheduler.ts src/tests/proactiveScheduler.test.ts
git commit -m "feat(scheduler): add ProactiveScheduler completion poller and queue drain"
```

---

## Task 4: Observer webhook integration

**Files:**
- Modify: `src/core/observer.ts`

- [ ] **Step 1: Add import for ProactiveScheduler at top of observer.ts**

Add this import after the existing imports in `src/core/observer.ts`:

```typescript
import { ProactiveScheduler } from "./proactiveScheduler";
```

- [ ] **Step 2: Modify `triggerWebhook` to check ProactiveScheduler first**

In `src/core/observer.ts`, replace the `triggerWebhook` method (lines 110–119):

```typescript
  public static async triggerWebhook(webhookPath: string, payload: any) {
    // Check ProactiveScheduler user-configured webhooks first
    const scheduleId = ProactiveScheduler.getWebhookScheduleId(webhookPath);
    if (scheduleId) {
      console.log(`🪝 [Observer] Webhook routed to ProactiveScheduler schedule: ${scheduleId}`);
      await ProactiveScheduler._onTriggerFired(scheduleId, payload);
      return;
    }

    const skills = PluginRegistry.getMDSkills();
    const targetSkill = skills.find(s => s.webhookPath === webhookPath);
    if (!targetSkill) {
      console.warn(`⚠️ [Observer] Received webhook for unmapped path: ${webhookPath}`);
      return;
    }
    console.log(`🪝 [Observer] Webhook triggered for: ${targetSkill.name}`);
    await this.triggerProactiveEvent("webhook", targetSkill, payload);
  }
```

Note: `_onTriggerFired` must be made public. In `proactiveScheduler.ts`, change `_onTriggerFired` from a private-convention method to a public one (it is already on the exported object, so this is just a documentation note — no change needed since TypeScript object literal methods are public).

- [ ] **Step 3: Type-check**

```powershell
npx tsc --noEmit 2>&1 | Select-Object -Last 20
```

Expected: No errors

- [ ] **Step 4: Commit**

```powershell
git add src/core/observer.ts
git commit -m "feat(scheduler): route webhooks to ProactiveScheduler before MD skills"
```

---

## Task 5: schedule_goal agent tool in PluginRegistry

**Files:**
- Modify: `src/core/pluginRegistry.ts`

- [ ] **Step 1: Register the `schedule_goal` tool declaration in `rebuildToolsArray`**

In `src/core/pluginRegistry.ts`, find the block that pushes `system__update_skill` (around line 589). After that block, add:

```typescript
    rawTools.push({
      name: "schedule_goal",
      description: "Create a new proactive schedule so the agent can trigger a goal automatically. Use this when the user asks you to run something on a schedule, watch a file, or respond to a webhook. trigger_type must be 'cron', 'file_watch', or 'webhook'. trigger_config is a JSON string: for cron use {\"expression\":\"0 9 * * *\"}, for file_watch use {\"path\":\"D:/Reports\",\"events\":[\"add\",\"change\"]}, for webhook use {\"path\":\"/my-hook\"}.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Short human-readable label for this schedule" },
          trigger_type: { type: "string", enum: ["cron", "file_watch", "webhook"] },
          trigger_config: { type: "string", description: "JSON string matching the trigger type schema" },
          intent: { type: "string", description: "The goal text the agent will execute when this fires" },
        },
        required: ["name", "trigger_type", "trigger_config", "intent"],
      } as any,
    });
```

- [ ] **Step 2: Add handler in `routeAndExecute`**

In `src/core/pluginRegistry.ts`, find the block `if (name === "system__update_skill")` and add this immediately after it (before the `if (name.startsWith("filesystem__"))` block):

```typescript
    if (name === "schedule_goal") {
      try {
        const { ProactiveScheduler } = require("../core/proactiveScheduler");
        let triggerConfig: Record<string, any>;
        try {
          triggerConfig = JSON.parse(args.trigger_config);
        } catch {
          return `Error: trigger_config must be valid JSON. Received: ${args.trigger_config}`;
        }
        const schedule = ProactiveScheduler.createSchedule({
          name: args.name,
          trigger_type: args.trigger_type,
          trigger_config: triggerConfig,
          intent: args.intent,
          enabled: true,
        });
        return `Schedule created successfully. ID: ${schedule.id}. Name: "${schedule.name}". Trigger: ${schedule.trigger_type}. The schedule is now active.`;
      } catch (err: any) {
        return `Error creating schedule: ${err.message}`;
      }
    }
```

- [ ] **Step 3: Type-check**

```powershell
npx tsc --noEmit 2>&1 | Select-Object -Last 20
```

Expected: No errors

- [ ] **Step 4: Run all tests**

```powershell
npx jest --no-coverage 2>&1 | Select-Object -Last 20
```

Expected: All existing tests pass

- [ ] **Step 5: Commit**

```powershell
git add src/core/pluginRegistry.ts
git commit -m "feat(scheduler): register schedule_goal agent tool in PluginRegistry"
```

---

## Task 6: REST API routes + server.ts wiring

**Files:**
- Create: `src/routes/scheduleRoutes.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: Create `src/routes/scheduleRoutes.ts`**

```typescript
import { Router, Request, Response } from "express";
import cron from "node-cron";
import { ProactiveScheduler } from "../core/proactiveScheduler";

export const scheduleRoutes = Router();

scheduleRoutes.get("/", (_req: Request, res: Response) => {
  try {
    res.json({ success: true, schedules: ProactiveScheduler.listSchedules() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

scheduleRoutes.post("/", (req: Request, res: Response) => {
  try {
    const { name, trigger_type, trigger_config, intent, enabled } = req.body;
    if (!name || !trigger_type || !trigger_config || !intent) {
      res.status(400).json({ error: "name, trigger_type, trigger_config, and intent are required" });
      return;
    }

    let parsedConfig: Record<string, any>;
    try {
      parsedConfig = typeof trigger_config === "string" ? JSON.parse(trigger_config) : trigger_config;
    } catch {
      res.status(400).json({ error: "trigger_config must be valid JSON" });
      return;
    }

    if (trigger_type === "cron") {
      if (!parsedConfig.expression || !cron.validate(parsedConfig.expression)) {
        res.status(400).json({ error: `Invalid cron expression: ${parsedConfig.expression}` });
        return;
      }
    } else if (trigger_type === "file_watch") {
      if (!parsedConfig.path) {
        res.status(400).json({ error: "file_watch trigger_config requires a 'path' field" });
        return;
      }
    } else if (trigger_type === "webhook") {
      if (!parsedConfig.path || !String(parsedConfig.path).startsWith("/")) {
        res.status(400).json({ error: "webhook trigger_config.path must start with '/'" });
        return;
      }
      const existingId = ProactiveScheduler.getWebhookScheduleId(parsedConfig.path);
      if (existingId) {
        res.status(409).json({ error: `Webhook path ${parsedConfig.path} already registered` });
        return;
      }
    } else {
      res.status(400).json({ error: `Unknown trigger_type: ${trigger_type}` });
      return;
    }

    try {
      const schedule = ProactiveScheduler.createSchedule({
        name,
        trigger_type,
        trigger_config: parsedConfig,
        intent,
        enabled: enabled !== false,
      });
      // Hot-register the new trigger if enabled
      if (schedule.enabled === 1) {
        if (trigger_type === "cron") ProactiveScheduler._registerCron(schedule);
        else if (trigger_type === "file_watch") ProactiveScheduler._registerFileWatch(schedule);
      }
      res.status(201).json({ success: true, schedule });
    } catch (err: any) {
      if (err.message.includes("already exists")) {
        res.status(409).json({ error: err.message });
      } else {
        res.status(500).json({ error: err.message });
      }
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

scheduleRoutes.patch("/:id", (req: Request, res: Response) => {
  try {
    const existing = ProactiveScheduler.getSchedule(req.params.id);
    if (!existing) { res.status(404).json({ error: "Schedule not found" }); return; }

    const { name, trigger_config, intent, trigger_type } = req.body;
    let parsedConfig: Record<string, any> | undefined;
    if (trigger_config !== undefined) {
      try {
        parsedConfig = typeof trigger_config === "string" ? JSON.parse(trigger_config) : trigger_config;
      } catch {
        res.status(400).json({ error: "trigger_config must be valid JSON" });
        return;
      }
    }

    const updated = ProactiveScheduler.updateSchedule(req.params.id, {
      name,
      intent,
      trigger_type,
      trigger_config: parsedConfig,
    });

    // Hot-reload trigger
    const type = updated.trigger_type;
    ProactiveScheduler._deregisterCron(req.params.id);
    await ProactiveScheduler._deregisterFileWatch(req.params.id);
    if (updated.enabled === 1) {
      if (type === "cron") ProactiveScheduler._registerCron(updated);
      else if (type === "file_watch") ProactiveScheduler._registerFileWatch(updated);
    }

    res.json({ success: true, schedule: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

scheduleRoutes.delete("/:id", (req: Request, res: Response) => {
  try {
    const existing = ProactiveScheduler.getSchedule(req.params.id);
    if (!existing) { res.status(404).json({ error: "Schedule not found" }); return; }
    ProactiveScheduler._deregisterCron(req.params.id);
    ProactiveScheduler._deregisterFileWatch(req.params.id);
    ProactiveScheduler.deleteSchedule(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

scheduleRoutes.post("/:id/toggle", (req: Request, res: Response) => {
  try {
    const schedule = ProactiveScheduler.getSchedule(req.params.id);
    if (!schedule) { res.status(404).json({ error: "Schedule not found" }); return; }
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "enabled (boolean) is required" });
      return;
    }
    ProactiveScheduler.toggleSchedule(req.params.id, enabled);
    const updated = ProactiveScheduler.getSchedule(req.params.id)!;
    // Hot-reload
    ProactiveScheduler._deregisterCron(req.params.id);
    ProactiveScheduler._deregisterFileWatch(req.params.id);
    if (enabled) {
      if (updated.trigger_type === "cron") ProactiveScheduler._registerCron(updated);
      else if (updated.trigger_type === "file_watch") ProactiveScheduler._registerFileWatch(updated);
    }
    res.json({ success: true, schedule: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

scheduleRoutes.post("/:id/trigger", async (req: Request, res: Response) => {
  try {
    const schedule = ProactiveScheduler.getSchedule(req.params.id);
    if (!schedule) { res.status(404).json({ error: "Schedule not found" }); return; }
    await ProactiveScheduler.triggerManually(req.params.id);
    res.json({ success: true, message: "Trigger accepted" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

scheduleRoutes.get("/:id/runs", (req: Request, res: Response) => {
  try {
    const schedule = ProactiveScheduler.getSchedule(req.params.id);
    if (!schedule) { res.status(404).json({ error: "Schedule not found" }); return; }
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;
    const runs = ProactiveScheduler.getRunHistory(req.params.id, limit, offset);
    res.json({ success: true, runs, limit, offset });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

Note: The `PATCH` route uses `await` inside a non-async callback. Change the handler signature to `async (req, res)` for that route.

- [ ] **Step 2: Fix the PATCH route signature**

In `scheduleRoutes.ts`, change the PATCH handler:
```typescript
scheduleRoutes.patch("/:id", async (req: Request, res: Response) => {
```

And the DELETE handler:
```typescript
scheduleRoutes.delete("/:id", async (req: Request, res: Response) => {
```

And the toggle handler:
```typescript
scheduleRoutes.post("/:id/toggle", async (req: Request, res: Response) => {
```

- [ ] **Step 3: Add scheduleRoutes to server.ts**

In `src/server.ts`, add the import after the existing goalRoutes import (line 40):

```typescript
import { scheduleRoutes } from "./routes/scheduleRoutes";
```

Add the route mount after the goals route (after `app.use("/api/v1/goals", goalRoutes);`):

```typescript
app.use("/api/v1/schedules", scheduleRoutes);
```

Add `ProactiveScheduler.init(io)` in `startServer()`, after `await Observer.init(io)`:

```typescript
    import { ProactiveScheduler } from "./core/proactiveScheduler";
    // ... inside startServer():
    await Observer.init(io);
    await ProactiveScheduler.init(io);
```

Important: Move the `import { ProactiveScheduler }` to the top of `server.ts` with the other imports, not inside `startServer()`.

- [ ] **Step 4: Type-check**

```powershell
npx tsc --noEmit 2>&1 | Select-Object -Last 30
```

Expected: No errors

- [ ] **Step 5: Smoke test — start the backend and hit the API**

```powershell
npm run backend
```

In another terminal:
```powershell
Invoke-RestMethod -Uri "http://localhost:5001/api/v1/schedules" -Method GET | ConvertTo-Json
```

Expected: `{ "success": true, "schedules": [] }`

```powershell
$body = @{ name="Test Cron"; trigger_type="cron"; trigger_config='{"expression":"* * * * *"}'; intent="Do a test run"; enabled=$true } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:5001/api/v1/schedules" -Method POST -Body $body -ContentType "application/json" | ConvertTo-Json
```

Expected: `{ "success": true, "schedule": { "id": "...", "name": "Test Cron", ... } }`

- [ ] **Step 6: Stop the backend and commit**

```powershell
git add src/routes/scheduleRoutes.ts src/server.ts
git commit -m "feat(scheduler): add REST API routes and wire ProactiveScheduler.init into server startup"
```

---

## Task 7: Frontend — SchedulesView

**Files:**
- Create: `frontend/src/components/SchedulesView.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Sidebar.jsx`

- [ ] **Step 1: Create `frontend/src/components/SchedulesView.jsx`**

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { CalendarClock, Play, Trash2, ToggleLeft, ToggleRight, Clock, CheckCircle, XCircle, Loader } from 'lucide-react';

const TRIGGER_ICONS = { cron: '⏰', file_watch: '📁', webhook: '🪝' };
const STATUS_BADGE = {
  running: { label: 'RUNNING', color: '#3b82f6' },
  completed: { label: 'DONE', color: '#10b981' },
  failed: { label: 'FAILED', color: '#ef4444' },
};

function formatTs(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

function formatDuration(triggeredAt, completedAt) {
  if (!completedAt) return '—';
  const ms = completedAt - triggeredAt;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m`;
}

function parseTriggerSummary(schedule) {
  try {
    const cfg = JSON.parse(schedule.trigger_config);
    if (schedule.trigger_type === 'cron') return cfg.expression;
    if (schedule.trigger_type === 'file_watch') return cfg.path;
    if (schedule.trigger_type === 'webhook') return cfg.path;
  } catch {}
  return '—';
}

export default function SchedulesView() {
  const [schedules, setSchedules] = useState([]);
  const [selected, setSelected] = useState(null);
  const [runs, setRuns] = useState([]);
  const [form, setForm] = useState({
    name: '',
    trigger_type: 'cron',
    expression: '',
    filePath: '',
    fileEvents: ['add', 'change'],
    webhookPath: '',
    intent: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadSchedules = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/schedules');
      const data = await res.json();
      setSchedules(data.schedules || []);
    } catch {}
  }, []);

  const loadRuns = useCallback(async (scheduleId) => {
    try {
      const res = await fetch(`/api/v1/schedules/${scheduleId}/runs?limit=20`);
      const data = await res.json();
      setRuns(data.runs || []);
    } catch {}
  }, []);

  useEffect(() => {
    loadSchedules();
    const interval = setInterval(loadSchedules, 5000);
    return () => clearInterval(interval);
  }, [loadSchedules]);

  useEffect(() => {
    if (!selected) return;
    const hasRunning = schedules.find(s => s.id === selected && s.active_goal_id);
    loadRuns(selected);
    if (!hasRunning) return;
    const interval = setInterval(() => loadRuns(selected), 3000);
    return () => clearInterval(interval);
  }, [selected, schedules, loadRuns]);

  function buildTriggerConfig() {
    if (form.trigger_type === 'cron') return { expression: form.expression };
    if (form.trigger_type === 'file_watch') return { path: form.filePath, events: form.fileEvents };
    if (form.trigger_type === 'webhook') return { path: form.webhookPath.startsWith('/') ? form.webhookPath : `/${form.webhookPath}` };
    return {};
  }

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/v1/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          trigger_type: form.trigger_type,
          trigger_config: buildTriggerConfig(),
          intent: form.intent,
          enabled: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to save'); return; }
      setForm({ name: '', trigger_type: 'cron', expression: '', filePath: '', fileEvents: ['add', 'change'], webhookPath: '', intent: '' });
      await loadSchedules();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(schedule) {
    await fetch(`/api/v1/schedules/${schedule.id}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: schedule.enabled === 0 }),
    });
    await loadSchedules();
  }

  async function handleDelete(id) {
    if (!confirm('Delete this schedule?')) return;
    await fetch(`/api/v1/schedules/${id}`, { method: 'DELETE' });
    if (selected === id) setSelected(null);
    await loadSchedules();
  }

  async function handleManualTrigger(id) {
    await fetch(`/api/v1/schedules/${id}/trigger`, { method: 'POST' });
    await loadSchedules();
  }

  const selectedSchedule = schedules.find(s => s.id === selected);

  return (
    <div style={{ display: 'flex', height: '100%', gap: '1px', background: 'var(--border-subtle)' }}>
      {/* Left column */}
      <div style={{ width: '380px', flexShrink: 0, background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <CalendarClock size={16} color="var(--accent-teal)" />
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', color: 'var(--accent-teal)' }}>PROACTIVE SCHEDULES</span>
          </div>

          {/* Create form */}
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '6px 10px', borderRadius: '4px', fontSize: '12px' }}
              placeholder="Schedule name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
            />
            <select
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '6px 10px', borderRadius: '4px', fontSize: '12px' }}
              value={form.trigger_type}
              onChange={e => setForm(f => ({ ...f, trigger_type: e.target.value }))}
            >
              <option value="cron">⏰ Cron (time-based)</option>
              <option value="file_watch">📁 File Watch</option>
              <option value="webhook">🪝 Webhook</option>
            </select>

            {form.trigger_type === 'cron' && (
              <input
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '6px 10px', borderRadius: '4px', fontSize: '12px' }}
                placeholder="Cron expression (e.g. 0 9 * * *)"
                value={form.expression}
                onChange={e => setForm(f => ({ ...f, expression: e.target.value }))}
                required
              />
            )}
            {form.trigger_type === 'file_watch' && (
              <>
                <input
                  style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '6px 10px', borderRadius: '4px', fontSize: '12px' }}
                  placeholder="Watch path (e.g. D:/Reports)"
                  value={form.filePath}
                  onChange={e => setForm(f => ({ ...f, filePath: e.target.value }))}
                  required
                />
                <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {['add', 'change', 'unlink'].map(ev => (
                    <label key={ev} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={form.fileEvents.includes(ev)}
                        onChange={e => setForm(f => ({ ...f, fileEvents: e.target.checked ? [...f.fileEvents, ev] : f.fileEvents.filter(x => x !== ev) }))}
                      />
                      {ev}
                    </label>
                  ))}
                </div>
              </>
            )}
            {form.trigger_type === 'webhook' && (
              <input
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '6px 10px', borderRadius: '4px', fontSize: '12px' }}
                placeholder="Webhook path (e.g. /my-trigger)"
                value={form.webhookPath}
                onChange={e => setForm(f => ({ ...f, webhookPath: e.target.value }))}
                required
              />
            )}

            <textarea
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '6px 10px', borderRadius: '4px', fontSize: '12px', resize: 'vertical', minHeight: '60px' }}
              placeholder="Intent — what should the agent do when this fires?"
              value={form.intent}
              onChange={e => setForm(f => ({ ...f, intent: e.target.value }))}
              required
            />

            {error && <p style={{ color: '#ef4444', fontSize: '11px', margin: 0 }}>{error}</p>}
            <button
              type="submit"
              disabled={saving}
              style={{ background: 'var(--accent-teal)', color: '#000', border: 'none', padding: '7px 14px', borderRadius: '4px', fontSize: '12px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              {saving ? 'Saving...' : '+ Add Schedule'}
            </button>
          </form>
        </div>

        {/* Schedule list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {schedules.length === 0 && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '11px', padding: '8px', textAlign: 'center' }}>No schedules yet.</p>
          )}
          {schedules.map(s => (
            <div
              key={s.id}
              onClick={() => setSelected(s.id)}
              style={{
                padding: '10px 12px',
                marginBottom: '4px',
                borderRadius: '4px',
                border: `1px solid ${selected === s.id ? 'var(--accent-teal)' : 'var(--border-subtle)'}`,
                background: selected === s.id ? 'rgba(23,113,201,0.08)' : 'var(--bg-primary)',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {TRIGGER_ICONS[s.trigger_type]} {s.name}
                </span>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button title="Manual trigger" onClick={e => { e.stopPropagation(); handleManualTrigger(s.id); }} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px' }}>
                    <Play size={12} />
                  </button>
                  <button title={s.enabled ? 'Disable' : 'Enable'} onClick={e => { e.stopPropagation(); handleToggle(s); }} style={{ background: 'none', border: 'none', color: s.enabled ? 'var(--accent-teal)' : 'var(--text-secondary)', cursor: 'pointer', padding: '2px' }}>
                    {s.enabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                  </button>
                  <button title="Delete" onClick={e => { e.stopPropagation(); handleDelete(s.id); }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                {parseTriggerSummary(s)} · Last: {formatTs(s.last_run_at)}
              </div>
              {s.active_goal_id && (
                <div style={{ fontSize: '10px', color: '#3b82f6', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Loader size={9} style={{ animation: 'spin 1s linear infinite' }} />
                  Running now
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right column — run history */}
      <div style={{ flex: 1, background: 'var(--bg-primary)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {!selectedSchedule ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', fontSize: '12px' }}>
            Select a schedule to view run history
          </div>
        ) : (
          <>
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {TRIGGER_ICONS[selectedSchedule.trigger_type]} {selectedSchedule.name}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {selectedSchedule.intent}
              </div>
              {selectedSchedule.active_goal_id && (
                <div style={{ marginTop: '6px', padding: '6px 10px', background: 'rgba(59,130,246,0.1)', borderRadius: '4px', fontSize: '11px', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} />
                  Running now — goal ID: {selectedSchedule.active_goal_id.substring(0, 8)}...
                </div>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              {runs.length === 0 && (
                <p style={{ color: 'var(--text-secondary)', fontSize: '11px', textAlign: 'center', padding: '24px' }}>No runs yet.</p>
              )}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ color: 'var(--text-secondary)', textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px', fontWeight: 600 }}>Triggered</th>
                    <th style={{ padding: '6px 8px', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '6px 8px', fontWeight: 600 }}>Completed</th>
                    <th style={{ padding: '6px 8px', fontWeight: 600 }}>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map(run => {
                    const badge = STATUS_BADGE[run.status] || { label: run.status, color: '#888' };
                    return (
                      <tr key={run.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '7px 8px', color: 'var(--text-primary)' }}>{formatTs(run.triggered_at)}</td>
                        <td style={{ padding: '7px 8px' }}>
                          <span style={{ background: badge.color + '22', color: badge.color, padding: '2px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 700 }}>
                            {badge.label}
                          </span>
                        </td>
                        <td style={{ padding: '7px 8px', color: 'var(--text-secondary)' }}>{formatTs(run.completed_at)}</td>
                        <td style={{ padding: '7px 8px', color: 'var(--text-secondary)' }}>{formatDuration(run.triggered_at, run.completed_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add SchedulesView to App.jsx**

In `frontend/src/App.jsx`, add the import after the MCPServersView import (line 17):

```jsx
import SchedulesView from './components/SchedulesView';
```

After the existing `{activeView === 'mcp-servers' && <MCPServersView />}` line (line 462), add:

```jsx
        {activeView === 'proactive-schedules' && <SchedulesView />}
```

- [ ] **Step 3: Add SCHEDULES nav item to Sidebar.jsx**

In `frontend/src/components/Sidebar.jsx`, add `CalendarClock` to the lucide-react import:

```jsx
import { MessageSquare, Settings, Box, Cpu, ChevronRight, Menu, Calendar, CalendarClock, Clock, Network, Brain, Workflow, Plug, Server } from 'lucide-react';
```

Add the new nav item to the `navItems` array, before `{ id: 'schedule', label: 'SCHEDULE', icon: Calendar }`:

```jsx
    { id: 'proactive-schedules', label: 'SCHEDULES', icon: CalendarClock },
```

- [ ] **Step 4: Start the frontend dev server and verify**

```powershell
npm run dev
```

Open `http://localhost:3000`. Verify:
- "SCHEDULES" nav item appears in sidebar with CalendarClock icon
- Clicking it shows the two-column SchedulesView
- Create a cron schedule — it appears in the list immediately
- Toggle enable/disable works
- Manual trigger button is present
- Selecting a schedule shows the run history panel

- [ ] **Step 5: Stop the server and commit**

```powershell
git add frontend/src/components/SchedulesView.jsx frontend/src/App.jsx frontend/src/components/Sidebar.jsx
git commit -m "feat(scheduler): add SchedulesView frontend panel with two-column layout"
```

---

## Task 8: Final type-check and verification

**Files:** none changed

- [ ] **Step 1: Full type-check**

```powershell
npx tsc --noEmit 2>&1
```

Expected: 0 errors

- [ ] **Step 2: Full test run**

```powershell
npx jest --no-coverage 2>&1 | Select-Object -Last 30
```

Expected: All tests pass including `proactiveScheduler` suite

- [ ] **Step 3: End-to-end smoke test**

```powershell
npm run dev
```

1. Open UI → SCHEDULES → create a cron schedule with expression `* * * * *` (every minute), intent "List the current time and log it"
2. Wait up to 60 seconds for the cron to fire
3. Verify run appears in the history panel with status `running`
4. Open OPERATIONS view → check Planner shows the goal progress
5. Confirm Telegram receives `🕐 Schedule fired: ...` notification

- [ ] **Step 4: Commit final**

```powershell
git add -A
git commit -m "feat(scheduler): Proactive Goal Scheduler — complete implementation

Adds SQLite-backed ProactiveScheduler with cron/file_watch/webhook triggers,
queue management, 24h hang detection, completion poller, schedule_goal agent
tool, 7 REST endpoints, and SchedulesView frontend panel. Integrates with
GoalTracker for execution tracking and Observer for webhook routing."
```
