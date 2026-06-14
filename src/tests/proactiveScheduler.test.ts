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

  test("updateSchedule throws for unknown id", () => {
    expect(() =>
      ProactiveScheduler.updateSchedule("does-not-exist", { intent: "anything" })
    ).toThrow("not found");
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
    ProactiveScheduler._setActiveGoalForTest(s.id, "fake-goal-id");
    for (let i = 0; i < 11; i++) {
      ProactiveScheduler._appendQueueForTest(s.id, Date.now() + i);
    }
    const row = ProactiveScheduler.getSchedule(s.id)!;
    expect(JSON.parse(row.queue)).toHaveLength(10);
  });
});

describe("ProactiveScheduler _reconcileRun", () => {
  test("_reconcileRun marks run completed and clears active_goal_id", () => {
    const s = ProactiveScheduler.createSchedule({
      name: "ReconcileTest",
      trigger_type: "cron",
      trigger_config: { expression: "* * * * *" },
      intent: "reconcile test",
      enabled: true,
    });

    // Manually insert a run row and set active_goal_id
    const Database = require("better-sqlite3");
    const db = new Database(process.env.PROACTIVE_SCHEDULER_DB_PATH!);
    const runId = "test-run-reconcile-001";
    const fakeGoalId = "fake-goal-reconcile-111";
    db.prepare(
      `INSERT INTO scheduled_goal_runs (id, scheduled_goal_id, goal_id, triggered_at, completed_at, status, trigger_data)
       VALUES (?, ?, ?, ?, NULL, 'running', '{}')`
    ).run(runId, s.id, fakeGoalId, Date.now());
    db.close();

    ProactiveScheduler._setActiveGoalForTest(s.id, fakeGoalId);

    const result = ProactiveScheduler._reconcileRun(s.id, fakeGoalId, runId, "completed");
    expect(result).toBe("cleared");

    const updated = ProactiveScheduler.getSchedule(s.id)!;
    expect(updated.active_goal_id).toBeNull();
    expect(updated.last_run_at).not.toBeNull();
  });

  test("_reconcileRun pops queue and fires next when queue is non-empty", () => {
    const s = ProactiveScheduler.createSchedule({
      name: "QueueDrain",
      trigger_type: "cron",
      trigger_config: { expression: "* * * * *" },
      intent: "queue drain test",
      enabled: true,
    });
    ProactiveScheduler._setActiveGoalForTest(s.id, "active-goal");
    ProactiveScheduler._appendQueueForTest(s.id, Date.now() - 2000);
    ProactiveScheduler._appendQueueForTest(s.id, Date.now() - 1000);

    const Database = require("better-sqlite3");
    const db = new Database(process.env.PROACTIVE_SCHEDULER_DB_PATH!);
    const runId = "test-run-drain-002";
    db.prepare(
      `INSERT INTO scheduled_goal_runs (id, scheduled_goal_id, goal_id, triggered_at, completed_at, status, trigger_data)
       VALUES (?, ?, 'active-goal', ?, NULL, 'running', '{}')`
    ).run(runId, s.id, Date.now());
    db.close();

    const result = ProactiveScheduler._reconcileRun(s.id, "active-goal", runId, "completed");
    expect(result).toBe("queued");

    const updated = ProactiveScheduler.getSchedule(s.id)!;
    const remaining: number[] = JSON.parse(updated.queue);
    expect(remaining).toHaveLength(1);
  });
});
