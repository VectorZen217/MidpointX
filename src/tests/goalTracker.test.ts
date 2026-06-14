import os from "os";
import path from "path";
import fs from "fs";
import { GoalTracker, _resetDbForTesting, Goal, GoalTask } from "../core/goalTracker";

// Use a fresh DB path per test to avoid UNIQUE constraint collisions
// from hard-coded task IDs in SAMPLE_TASKS across describe blocks.
// Pattern matches agentMemory.test.ts which also generates a fresh path per test.
const trackedDbs: string[] = [];

function makeTempDbPath(): string {
  const p = path.join(os.tmpdir(), `goaltracker_test_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
  trackedDbs.push(p);
  return p;
}

const SAMPLE_TASKS = [
  { id: "aaa-1", title: "Research APIs", description: "Look up available APIs", dependsOn: [], assignedWorker: "researcher" as const },
  { id: "aaa-2", title: "Write code", description: "Implement the feature", dependsOn: ["aaa-1"], assignedWorker: "developer" as const },
  { id: "aaa-3", title: "Run tests", description: "Verify correctness", dependsOn: ["aaa-2"], assignedWorker: "tester" as const },
];

afterAll(() => {
  _resetDbForTesting();
  for (const p of trackedDbs) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  delete process.env.GOAL_TRACKER_DB_PATH;
});

beforeEach(() => {
  _resetDbForTesting(makeTempDbPath());
});

describe("GoalTracker.createGoal", () => {
  it("persists goal row and task rows atomically", () => {
    const goal = GoalTracker.createGoal("task-abc", "Build a thing", SAMPLE_TASKS);
    expect(goal.id).toBeTruthy();
    expect(goal.user_intent).toBe("Build a thing");
    expect(goal.task_id).toBe("task-abc");
    expect(goal.status).toBe("active");
    expect(goal.task_count).toBe(3);
    expect(goal.completed_count).toBe(0);

    const detail = GoalTracker.getGoal(goal.id)!;
    expect(detail.tasks).toHaveLength(3);
    expect(detail.tasks[0].title).toBe("Research APIs");
    expect(detail.tasks[0].depends_on).toEqual([]);
    expect(detail.tasks[1].depends_on).toEqual(["aaa-1"]);
  });
});

describe("GoalTracker.getActiveGoal", () => {
  it("finds an active goal by LangGraph taskId", () => {
    GoalTracker.createGoal("task-xyz", "Do stuff", SAMPLE_TASKS);
    const found = GoalTracker.getActiveGoal("task-xyz");
    expect(found).not.toBeNull();
    expect(found!.task_id).toBe("task-xyz");
  });

  it("returns null after goal is completed", () => {
    const goal = GoalTracker.createGoal("task-done", "Done thing", SAMPLE_TASKS);
    GoalTracker.completeGoal(goal.id);
    expect(GoalTracker.getActiveGoal("task-done")).toBeNull();
  });
});

describe("GoalTracker.getNextTask", () => {
  it("returns first task when no deps", () => {
    const goal = GoalTracker.createGoal("task-next1", "Next task test", SAMPLE_TASKS);
    const next = GoalTracker.getNextTask(goal.id);
    expect(next).not.toBeNull();
    expect(next!.title).toBe("Research APIs");
  });

  it("returns null when first task is active (not yet completed)", () => {
    const goal = GoalTracker.createGoal("task-deps", "Dep test", SAMPLE_TASKS);
    GoalTracker.startTask("aaa-1");
    const next = GoalTracker.getNextTask(goal.id);
    // aaa-1 is active (not pending), aaa-2 depends on aaa-1 (not completed), aaa-3 depends on aaa-2
    expect(next).toBeNull();
  });

  it("returns task 2 after task 1 completes", () => {
    const goal = GoalTracker.createGoal("task-seq", "Sequential test", SAMPLE_TASKS);
    GoalTracker.startTask("aaa-1");
    GoalTracker.completeTask("aaa-1", "done");
    const next = GoalTracker.getNextTask(goal.id);
    expect(next!.title).toBe("Write code");
  });
});

describe("GoalTracker.completeTask", () => {
  it("increments completed_count on the parent goal", () => {
    const goal = GoalTracker.createGoal("task-count", "Count test", SAMPLE_TASKS);
    GoalTracker.startTask("aaa-1");
    GoalTracker.completeTask("aaa-1", "result text");
    const updated = GoalTracker.getGoal(goal.id)!;
    expect(updated.completed_count).toBe(1);
    const task1 = updated.tasks.find(t => t.id === "aaa-1")!;
    expect(task1.status).toBe("completed");
    expect(task1.result).toBe("result text");
  });
});

describe("GoalTracker.failTask", () => {
  it("cascades skip to all tasks that depend on the failed task", () => {
    const goal = GoalTracker.createGoal("task-fail", "Fail cascade test", SAMPLE_TASKS);
    GoalTracker.startTask("aaa-1");
    GoalTracker.failTask("aaa-1", "network error");
    const detail = GoalTracker.getGoal(goal.id)!;
    const t1 = detail.tasks.find(t => t.id === "aaa-1")!;
    const t2 = detail.tasks.find(t => t.id === "aaa-2")!;
    const t3 = detail.tasks.find(t => t.id === "aaa-3")!;
    expect(t1.status).toBe("failed");
    expect(t1.failure_reason).toBe("network error");
    expect(t2.status).toBe("skipped");
    expect(t3.status).toBe("skipped");
  });
});

describe("GoalTracker.retryTask", () => {
  it("resets a failed task back to pending", () => {
    const goal = GoalTracker.createGoal("task-retry", "Retry test", SAMPLE_TASKS);
    GoalTracker.startTask("aaa-1");
    GoalTracker.failTask("aaa-1", "transient error");
    GoalTracker.retryTask("aaa-1");
    const detail = GoalTracker.getGoal(goal.id)!;
    const t1 = detail.tasks.find(t => t.id === "aaa-1")!;
    expect(t1.status).toBe("pending");
    expect(t1.failure_reason).toBeNull();
  });
});

describe("GoalTracker.listGoals", () => {
  it("returns goals newest first with pagination", () => {
    // Use distinct task IDs per createGoal call to avoid UNIQUE constraint collisions
    const tasks1 = SAMPLE_TASKS.map(t => ({ ...t, id: `list1-${t.id}`, dependsOn: t.dependsOn.map(d => `list1-${d}`) }));
    const tasks2 = SAMPLE_TASKS.map(t => ({ ...t, id: `list2-${t.id}`, dependsOn: t.dependsOn.map(d => `list2-${d}`) }));
    GoalTracker.createGoal("task-list1", "First goal", tasks1);
    GoalTracker.createGoal("task-list2", "Second goal", tasks2);
    const list = GoalTracker.listGoals(10, 0);
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[0].created_at).toBeGreaterThanOrEqual(list[1].created_at);
  });
});
