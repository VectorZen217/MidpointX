# Autonomous Goal Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `GoalDecomposerActor` that breaks any user request into a SQLite-persisted, dependency-aware sub-task plan, drives execution from that plan via the existing `SupervisorActor`, and sends Telegram notifications at goal lifecycle events.

**Architecture:** A new `GoalTracker` class (same singleton DB pattern as `agentMemory.ts`) owns all SQLite CRUD for two new tables (`goals`, `goal_tasks`). `goalDecomposerNode` runs once per mission — it resumes an existing active goal or calls the LLM to decompose and persist a new one. `SupervisorActor` gains a fast-path that reads the next ready task from `GoalTracker` instead of generating its own plan, keeping the existing LLM-driven path for tasks with no active goal.

**Tech Stack:** `better-sqlite3`, `@langchain/core`, `node-telegram-bot-api` (existing), `uuid` via `crypto.randomUUID()` (Node 22 built-in), Jest + ts-jest.

---

## File Map

| File | Action | What it owns |
|---|---|---|
| `src/core/goalTracker.ts` | **CREATE** | SQLite CRUD for `goals` + `goal_tasks`; cascade-skip on failure |
| `src/tests/goalTracker.test.ts` | **CREATE** | Unit tests for all GoalTracker methods |
| `src/core/state.ts` | **MODIFY** | Add `activeGoalId`, `activeTaskId` Annotation fields |
| `src/nodes/goalDecomposerNode.ts` | **CREATE** | LLM decomposition, resume check, title→UUID conversion, Telegram on create |
| `src/nodes/cognitiveNodes.ts` | **MODIFY** | Add GoalTracker-driven fast path at top of `supervisorNode` |
| `src/core/graph.ts` | **MODIFY** | Import + wire `GoalDecomposerActor` between `AnalysisActor` and `CompactionActor` |
| `src/routes/goalRoutes.ts` | **CREATE** | 4 REST endpoints: list, active, detail, abandon |
| `src/server.ts` | **MODIFY** | Register `goalRoutes` at `/api/v1/goals` |
| `frontend/src/components/Planner.jsx` | **MODIFY** | Add structured task display that polls `/api/v1/goals/active` every 3 s |

---

## Task 1: GoalTracker — TDD

**Files:**
- Create: `src/core/goalTracker.ts`
- Create: `src/tests/goalTracker.test.ts`

- [ ] **Step 1.1: Write the failing tests**

Create `src/tests/goalTracker.test.ts`:

```typescript
import os from "os";
import path from "path";
import fs from "fs";
import { GoalTracker, _resetDbForTesting, Goal, GoalTask } from "../../core/goalTracker";

const TEST_DB = path.join(os.tmpdir(), `goaltracker_test_${Date.now()}.db`);

const SAMPLE_TASKS = [
  { id: "aaa-1", title: "Research APIs", description: "Look up available APIs", dependsOn: [], assignedWorker: "researcher" as const },
  { id: "aaa-2", title: "Write code", description: "Implement the feature", dependsOn: ["aaa-1"], assignedWorker: "developer" as const },
  { id: "aaa-3", title: "Run tests", description: "Verify correctness", dependsOn: ["aaa-2"], assignedWorker: "tester" as const },
];

beforeAll(() => {
  _resetDbForTesting(TEST_DB);
});

afterAll(() => {
  _resetDbForTesting();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  delete process.env.GOAL_TRACKER_DB_PATH;
});

beforeEach(() => {
  _resetDbForTesting(TEST_DB);
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

  it("returns null when first task is pending but dep not met (tasks 2 and 3 depend on task 1)", () => {
    const goal = GoalTracker.createGoal("task-deps", "Dep test", SAMPLE_TASKS);
    // Start task 1 (it's now 'active', not 'pending') — task 2 deps on aaa-1 which is not completed
    GoalTracker.startTask("aaa-1");
    const next = GoalTracker.getNextTask(goal.id);
    // aaa-1 is active, aaa-2 depends on aaa-1 (not completed), aaa-3 depends on aaa-2
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
    expect(t3.status).toBe("skipped");  // cascades through the chain
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
    GoalTracker.createGoal("task-list1", "First goal", SAMPLE_TASKS);
    GoalTracker.createGoal("task-list2", "Second goal", SAMPLE_TASKS);
    const list = GoalTracker.listGoals(10, 0);
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[0].created_at).toBeGreaterThanOrEqual(list[1].created_at);
  });
});
```

- [ ] **Step 1.2: Run tests to confirm they fail**

```powershell
npx jest goalTracker --no-coverage 2>&1 | Select-Object -Last 20
```

Expected: `Cannot find module '../../core/goalTracker'` or similar compile error.

- [ ] **Step 1.3: Implement GoalTracker**

Create `src/core/goalTracker.ts`:

```typescript
import Database from "better-sqlite3";
import path from "path";

export type GoalStatus = 'active' | 'completed' | 'failed' | 'abandoned';
export type TaskStatus = 'pending' | 'active' | 'completed' | 'failed' | 'skipped';
export type WorkerType = 'researcher' | 'developer' | 'tester' | 'executor';

export interface Goal {
  id: string;
  user_intent: string;
  task_id: string;
  status: GoalStatus;
  task_count: number;
  completed_count: number;
  created_at: number;
  updated_at: number;
}

export interface GoalTask {
  id: string;
  goal_id: string;
  title: string;
  description: string;
  depends_on: string[];
  status: TaskStatus;
  assigned_worker: WorkerType | null;
  result: string | null;
  failure_reason: string | null;
  created_at: number;
  updated_at: number;
}

interface RawTask {
  id: string;
  goal_id: string;
  title: string;
  description: string;
  depends_on: string;
  status: TaskStatus;
  assigned_worker: WorkerType | null;
  result: string | null;
  failure_reason: string | null;
  created_at: number;
  updated_at: number;
}

export interface CreateTaskInput {
  id: string;
  title: string;
  description: string;
  dependsOn: string[];
  assignedWorker: WorkerType;
}

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath = process.env.GOAL_TRACKER_DB_PATH ||
    path.resolve(process.cwd(), "src/workspace/midpointx.db");
  _db = new Database(dbPath);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      user_intent TEXT NOT NULL,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      task_count INTEGER NOT NULL DEFAULT 0,
      completed_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS goal_tasks (
      id TEXT PRIMARY KEY,
      goal_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      depends_on TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending',
      assigned_worker TEXT,
      result TEXT,
      failure_reason TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (goal_id) REFERENCES goals(id)
    );
  `);
  return _db;
}

export function _resetDbForTesting(customPath?: string): void {
  if (_db) { try { _db.close(); } catch {} _db = null; }
  if (customPath !== undefined) process.env.GOAL_TRACKER_DB_PATH = customPath;
}

function parseTask(raw: RawTask): GoalTask {
  return { ...raw, depends_on: JSON.parse(raw.depends_on || '[]') };
}

export const GoalTracker = {
  createGoal(taskId: string, userIntent: string, tasks: CreateTaskInput[]): Goal {
    const db = getDb();
    const now = Date.now();
    const goalId = require('crypto').randomUUID() as string;

    const insertGoal = db.prepare(`
      INSERT INTO goals (id, user_intent, task_id, status, task_count, completed_count, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, 0, ?, ?)
    `);
    const insertTask = db.prepare(`
      INSERT INTO goal_tasks (id, goal_id, title, description, depends_on, status, assigned_worker, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `);

    db.transaction(() => {
      insertGoal.run(goalId, userIntent, taskId, tasks.length, now, now);
      for (const t of tasks) {
        insertTask.run(t.id, goalId, t.title, t.description, JSON.stringify(t.dependsOn), t.assignedWorker, now, now);
      }
    })();

    return db.prepare('SELECT * FROM goals WHERE id = ?').get(goalId) as Goal;
  },

  getActiveGoal(taskId: string): Goal | null {
    return getDb()
      .prepare(`SELECT * FROM goals WHERE task_id = ? AND status = 'active'`)
      .get(taskId) as Goal | null;
  },

  getNextTask(goalId: string): GoalTask | null {
    const db = getDb();
    const completedIds = (
      db.prepare(`SELECT id FROM goal_tasks WHERE goal_id = ? AND status = 'completed'`).all(goalId) as { id: string }[]
    ).map(r => r.id);

    const pending = (
      db.prepare(`SELECT * FROM goal_tasks WHERE goal_id = ? AND status = 'pending' ORDER BY created_at ASC`).all(goalId) as RawTask[]
    ).map(parseTask);

    return pending.find(t => t.depends_on.every(dep => completedIds.includes(dep))) ?? null;
  },

  startTask(taskId: string): void {
    getDb()
      .prepare(`UPDATE goal_tasks SET status = 'active', updated_at = ? WHERE id = ?`)
      .run(Date.now(), taskId);
  },

  completeTask(taskId: string, result: string): void {
    const db = getDb();
    const now = Date.now();
    const row = db.prepare('SELECT goal_id FROM goal_tasks WHERE id = ?').get(taskId) as { goal_id: string } | undefined;
    if (!row) return;
    db.prepare(`UPDATE goal_tasks SET status = 'completed', result = ?, updated_at = ? WHERE id = ?`).run(result, now, taskId);
    db.prepare(`UPDATE goals SET completed_count = completed_count + 1, updated_at = ? WHERE id = ?`).run(now, row.goal_id);
  },

  failTask(taskId: string, reason: string): void {
    const db = getDb();
    const now = Date.now();
    db.prepare(`UPDATE goal_tasks SET status = 'failed', failure_reason = ?, updated_at = ? WHERE id = ?`).run(reason, now, taskId);

    // Cascade: mark all tasks that depend on this one as skipped
    const allPending = db.prepare(`SELECT id, depends_on FROM goal_tasks WHERE status = 'pending'`).all() as { id: string; depends_on: string }[];
    const skipStmt = db.prepare(`UPDATE goal_tasks SET status = 'skipped', updated_at = ? WHERE id = ?`);
    for (const row of allPending) {
      const deps: string[] = JSON.parse(row.depends_on || '[]');
      if (deps.includes(taskId)) skipStmt.run(now, row.id);
    }
  },

  retryTask(taskId: string): void {
    getDb()
      .prepare(`UPDATE goal_tasks SET status = 'pending', failure_reason = NULL, updated_at = ? WHERE id = ?`)
      .run(Date.now(), taskId);
  },

  completeGoal(goalId: string): void {
    getDb()
      .prepare(`UPDATE goals SET status = 'completed', updated_at = ? WHERE id = ?`)
      .run(Date.now(), goalId);
  },

  failGoal(goalId: string): void {
    getDb()
      .prepare(`UPDATE goals SET status = 'failed', updated_at = ? WHERE id = ?`)
      .run(Date.now(), goalId);
  },

  abandonGoal(goalId: string): void {
    getDb()
      .prepare(`UPDATE goals SET status = 'abandoned', updated_at = ? WHERE id = ?`)
      .run(Date.now(), goalId);
  },

  getGoal(goalId: string): (Goal & { tasks: GoalTask[] }) | null {
    const db = getDb();
    const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(goalId) as Goal | undefined;
    if (!goal) return null;
    const tasks = (db.prepare('SELECT * FROM goal_tasks WHERE goal_id = ? ORDER BY created_at ASC').all(goalId) as RawTask[]).map(parseTask);
    return { ...goal, tasks };
  },

  listGoals(limit = 20, offset = 0): Goal[] {
    return getDb()
      .prepare('SELECT * FROM goals ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .all(limit, offset) as Goal[];
  },
};
```

- [ ] **Step 1.4: Run tests to confirm they pass**

```powershell
npx jest goalTracker --no-coverage 2>&1 | Select-Object -Last 20
```

Expected: `Tests: 7 passed, 7 total` (or similar). All green.

- [ ] **Step 1.5: Commit**

```powershell
git add src/core/goalTracker.ts src/tests/goalTracker.test.ts
git commit -m "feat(goal-tracker): add GoalTracker SQLite CRUD with cascade-skip on failure"
```

---

## Task 2: State — Add activeGoalId and activeTaskId

**Files:**
- Modify: `src/core/state.ts`

- [ ] **Step 2.1: Add two Annotation fields to state.ts**

In `src/core/state.ts`, after the `// Swarm Routing & Multi-Agent Execution State` block (line 94), add:

```typescript
  // Autonomous Goal Decomposition
  activeGoalId: Annotation<string>({ reducer: (x: string, y: string) => y, default: () => "" }),
  activeTaskId: Annotation<string>({ reducer: (x: string, y: string) => y, default: () => "" }),
```

The section should look like:

```typescript
  // Swarm Routing & Multi-Agent Execution State
  activeWorker: Annotation<string>({ reducer: (x: string, y: string) => y, default: () => "none" }),
  workerSubGoal: Annotation<string>({ reducer: (x: string, y: string) => y, default: () => "" }),
  workerOutput: Annotation<string>({ reducer: (x: string, y: string) => y, default: () => "" }),

  // Autonomous Goal Decomposition
  activeGoalId: Annotation<string>({ reducer: (x: string, y: string) => y, default: () => "" }),
  activeTaskId: Annotation<string>({ reducer: (x: string, y: string) => y, default: () => "" }),
```

- [ ] **Step 2.2: Type-check**

```powershell
npx tsc --noEmit 2>&1 | Select-Object -First 20
```

Expected: no errors related to state.ts.

- [ ] **Step 2.3: Commit**

```powershell
git add src/core/state.ts
git commit -m "feat(state): add activeGoalId and activeTaskId to LangGraph state"
```

---

## Task 3: GoalDecomposerNode

**Files:**
- Create: `src/nodes/goalDecomposerNode.ts`

- [ ] **Step 3.1: Create the node**

Create `src/nodes/goalDecomposerNode.ts`:

```typescript
import crypto from "crypto";
import { z } from "zod";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { GoalTracker, WorkerType, CreateTaskInput } from "../core/goalTracker";
import { LLMFactory } from "../core/llmFactory";
import { TelegramService } from "../services/telegramService";
import { MidpointXState } from "../core/state";

const GoalTaskSchema = z.object({
  title: z.string().describe("Short label for this step (shown in UI)"),
  description: z.string().describe("What the worker must accomplish"),
  dependsOn: z.array(z.string()).describe("Titles of tasks that must complete before this one"),
  estimatedComplexity: z.enum(["simple", "medium", "complex"]),
  assignedWorker: z.enum(["researcher", "developer", "tester", "executor"]),
});

const DecompositionSchema = z.object({
  tasks: z.array(GoalTaskSchema).max(12),
  rationale: z.string(),
});

export async function goalDecomposerNode(state: typeof MidpointXState.State) {
  console.log("🎯 [GoalDecomposerActor] Checking for active goal or decomposing...");

  // Resume check: if this LangGraph taskId already has an active goal, skip decomposition
  if (state.taskId) {
    const existing = GoalTracker.getActiveGoal(state.taskId);
    if (existing) {
      console.log(`🔄 [GoalDecomposerActor] Resuming active goal ${existing.id} (${existing.task_count} tasks)`);
      return { activeGoalId: existing.id };
    }
  }

  const userIntent = state.userIntent || "";
  const analysisResult = state.analysisResult || "";

  try {
    const rawModel = LLMFactory.getModel({ temperature: 0.2 }) as any;
    const structuredModel = rawModel.withStructuredOutput(DecompositionSchema);

    const response = await structuredModel.invoke([
      new SystemMessage(
        `You are a task decomposition expert for an autonomous AI agent called MidpointX.
Break the user's goal into at most 12 concrete, ordered sub-tasks.
Worker roles:
- researcher: web research, reading documentation, scanning files
- developer: writing or editing code files
- tester: running tests, verifying builds, checking output
- executor: direct tool calls — file writes, shell commands, API calls (use this for simple single-step actions)

Use executor for any task completable with one tool call.
Only use researcher/developer/tester when the step needs multi-step cognitive work.

dependsOn: list the exact TITLES of tasks that must complete before this task starts.
Keep tasks focused and sequential. Avoid over-decomposing simple requests.`
      ),
      new HumanMessage(
        `User Goal: ${userIntent}\n\nAnalysis Context:\n${analysisResult}\n\nDecompose this into concrete sub-tasks.`
      ),
    ]);

    // Pre-assign UUIDs so we can resolve title-based dependsOn to IDs before writing to SQLite
    const titleToId: Record<string, string> = {};
    const withIds = response.tasks.map((t: z.infer<typeof GoalTaskSchema>) => {
      const id = crypto.randomUUID();
      titleToId[t.title] = id;
      return { ...t, id };
    });

    const taskInputs: CreateTaskInput[] = withIds.map((t: any) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      dependsOn: t.dependsOn.map((depTitle: string) => titleToId[depTitle]).filter(Boolean) as string[],
      assignedWorker: t.assignedWorker as WorkerType,
    }));

    const goal = GoalTracker.createGoal(state.taskId, userIntent, taskInputs);

    const taskList = taskInputs.map((t, i) => `${i + 1}. ${t.title}`).join("\n");
    TelegramService.sendMessage(
      `🎯 *New Goal:* ${userIntent}\n📋 *${taskInputs.length} steps planned:*\n${taskList}`
    ).catch(e => console.warn("[GoalDecomposer] Telegram send failed:", e.message));

    console.log(`✅ [GoalDecomposerActor] Created goal ${goal.id} with ${taskInputs.length} tasks`);
    return { activeGoalId: goal.id };

  } catch (err: any) {
    console.error("[GoalDecomposerActor] Decomposition failed, falling back to single-task plan:", err.message);

    const fallbackId = crypto.randomUUID();
    const goal = GoalTracker.createGoal(state.taskId, userIntent, [
      { id: fallbackId, title: userIntent, description: userIntent, dependsOn: [], assignedWorker: "executor" },
    ]);

    TelegramService.sendMessage(
      `⚠️ *Decomposition failed — running directly:* ${userIntent}`
    ).catch(() => {});

    return { activeGoalId: goal.id };
  }
}
```

- [ ] **Step 3.2: Type-check**

```powershell
npx tsc --noEmit 2>&1 | Select-Object -First 20
```

Expected: no errors in `goalDecomposerNode.ts`.

- [ ] **Step 3.3: Commit**

```powershell
git add src/nodes/goalDecomposerNode.ts
git commit -m "feat(goal-decomposer): add GoalDecomposerActor with LLM decomposition, resume check, and Telegram notification"
```

---

## Task 4: Modify SupervisorActor

**Files:**
- Modify: `src/nodes/cognitiveNodes.ts`

The `supervisorNode` function (starting at line 225) needs a GoalTracker-driven fast path injected at the top. When `state.activeGoalId` is set, the supervisor reads the next task directly from SQLite instead of calling the LLM for planning.

- [ ] **Step 4.1: Add imports at the top of cognitiveNodes.ts**

Find the existing imports in `src/nodes/cognitiveNodes.ts` and add:

```typescript
import { GoalTracker } from "../core/goalTracker";
import { TelegramService } from "../services/telegramService";
```

- [ ] **Step 4.2: Add GoalTracker fast path to supervisorNode**

Inside `supervisorNode`, immediately after the `console.log("👑 [SupervisorActor]..."` line (line 226), insert the following block **before** the existing `const envFingerprint = ...` line:

```typescript
  // ── GoalTracker Fast Path ─────────────────────────────────────────────────
  // When a structured goal plan exists in SQLite, drive execution from it
  // instead of calling the LLM planner on every supervisor turn.
  if (state.activeGoalId) {
    const goal = GoalTracker.getGoal(state.activeGoalId);
    if (goal) {
      // If a task was active, mark it complete or failed based on execution result
      if (state.activeTaskId) {
        const hadFailure = !!state.failureThesis;
        if (hadFailure) {
          GoalTracker.failTask(state.activeTaskId, state.failureThesis);
          const task = goal.tasks.find(t => t.id === state.activeTaskId);
          TelegramService.sendMessage(
            `⚠️ *Step failed:* ${task?.title || state.activeTaskId}\n${state.failureThesis}`
          ).catch(e => console.warn("[Supervisor] Telegram send failed:", e.message));
        } else {
          const resultSnippet = state.workerOutput ||
            (state.actionHistory?.slice(-1)[0]?.result ? String(state.actionHistory.slice(-1)[0].result).substring(0, 300) : "completed");
          GoalTracker.completeTask(state.activeTaskId, resultSnippet);

          const updatedGoal = GoalTracker.getGoal(state.activeGoalId)!;
          const task = updatedGoal.tasks.find(t => t.id === state.activeTaskId);
          TelegramService.sendMessage(
            `✅ *Step done (${updatedGoal.completed_count}/${updatedGoal.task_count}):* ${task?.title || state.activeTaskId}`
          ).catch(e => console.warn("[Supervisor] Telegram send failed:", e.message));
        }
      }

      // Get next ready task
      const nextTask = GoalTracker.getNextTask(state.activeGoalId);

      if (!nextTask) {
        const freshGoal = GoalTracker.getGoal(state.activeGoalId)!;
        const allTerminated = freshGoal.tasks.every(t =>
          ['completed', 'failed', 'skipped'].includes(t.status)
        );

        if (allTerminated) {
          GoalTracker.completeGoal(state.activeGoalId);
          const durationMin = Math.floor((Date.now() - freshGoal.created_at) / 60000);
          TelegramService.sendMessage(
            `🏁 *Goal achieved:* ${freshGoal.user_intent}\n⏱ ${durationMin}min · ${freshGoal.completed_count}/${freshGoal.task_count} steps`
          ).catch(e => console.warn("[Supervisor] Telegram send failed:", e.message));

          return A2AProtocol.commit("SupervisorActor", {
            isTaskComplete: true,
            activeTaskId: "",
            strategicPlan: freshGoal.tasks.map(t => t.title),
            planStatus: Object.fromEntries(freshGoal.tasks.map(t => [t.title, t.status as any])),
            totalInputTokens: 0,
            totalOutputTokens: 0,
            internalTurns: 1,
          });
        }

        // Dependencies not yet met — loop back to supervisor without advancing
        console.log("⏳ [SupervisorActor] No ready task (dependencies pending). Looping...");
        return A2AProtocol.commit("SupervisorActor", {
          activeTaskId: "",
          totalInputTokens: 0,
          totalOutputTokens: 0,
          internalTurns: 1,
        });
      }

      GoalTracker.startTask(nextTask.id);

      const workerMap: Record<string, string> = {
        researcher: 'researcher',
        developer: 'developer',
        tester: 'tester',
        executor: 'none',
      };
      const assignedWorker = workerMap[nextTask.assigned_worker || 'executor'] ?? 'none';
      const freshGoal = GoalTracker.getGoal(state.activeGoalId)!;
      const strategicPlan = freshGoal.tasks.map(t => t.title);
      const planStatus = Object.fromEntries(freshGoal.tasks.map(t => [t.title, t.status as any]));

      console.log(`👑 [SupervisorActor][GoalTracker] Next task: "${nextTask.title}" → worker: ${assignedWorker}`);
      return A2AProtocol.commit("SupervisorActor", {
        activeTaskId: nextTask.id,
        workerSubGoal: nextTask.description,
        activeWorker: assignedWorker,
        strategicPlan,
        planStatus,
        isTaskComplete: false,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        internalTurns: 1,
      });
    }
  }
  // ── End GoalTracker Fast Path ─────────────────────────────────────────────
```

- [ ] **Step 4.3: Type-check**

```powershell
npx tsc --noEmit 2>&1 | Select-Object -First 30
```

Expected: no new errors. If `A2AProtocol.commit` type errors appear, check that all keys match existing `MidpointXState` fields.

- [ ] **Step 4.4: Commit**

```powershell
git add src/nodes/cognitiveNodes.ts
git commit -m "feat(supervisor): add GoalTracker-driven fast path with Telegram step notifications"
```

---

## Task 5: Wire GoalDecomposerActor into the Graph

**Files:**
- Modify: `src/core/graph.ts`

- [ ] **Step 5.1: Add import and node registration**

In `src/core/graph.ts`, add the import after the existing node imports (after line 15):

```typescript
import { goalDecomposerNode } from "../nodes/goalDecomposerNode";
```

Then add the node registration after the existing `builder.addNode("SkillAcquisitionActor", ...)` line (after line 48):

```typescript
builder.addNode("GoalDecomposerActor", (state: GraphState) => goalDecomposerNode(state));
```

- [ ] **Step 5.2: Replace the AnalysisActor → CompactionActor edge**

Find this line in `graph.ts` (line 87):

```typescript
builder.addEdge("AnalysisActor", "CompactionActor");
```

Replace it with:

```typescript
builder.addEdge("AnalysisActor", "GoalDecomposerActor");
builder.addEdge("GoalDecomposerActor", "CompactionActor");
```

- [ ] **Step 5.3: Type-check**

```powershell
npx tsc --noEmit 2>&1 | Select-Object -First 20
```

Expected: no errors.

- [ ] **Step 5.4: Commit**

```powershell
git add src/core/graph.ts
git commit -m "feat(graph): wire GoalDecomposerActor between AnalysisActor and CompactionActor"
```

---

## Task 6: Goal API Routes

**Files:**
- Create: `src/routes/goalRoutes.ts`
- Modify: `src/server.ts`

- [ ] **Step 6.1: Create goalRoutes.ts**

Create `src/routes/goalRoutes.ts`:

```typescript
import { Router } from "express";
import { GoalTracker } from "../core/goalTracker";

export const goalRoutes = Router();

// List all goals, paginated, newest first
goalRoutes.get("/", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Number(req.query.offset) || 0;
  const goals = GoalTracker.listGoals(limit, offset);
  res.json({ goals, limit, offset });
});

// Current in-progress goal with full task list
goalRoutes.get("/active", (req, res) => {
  // Find the most recent active goal across all taskIds
  const all = GoalTracker.listGoals(50, 0);
  const active = all.find(g => g.status === 'active');
  if (!active) return res.json(null);
  const detail = GoalTracker.getGoal(active.id);
  res.json(detail);
});

// Full goal detail — goal row + all tasks
goalRoutes.get("/:id", (req, res) => {
  const detail = GoalTracker.getGoal(req.params.id);
  if (!detail) return res.status(404).json({ error: "Goal not found" });
  res.json(detail);
});

// Abandon a goal
goalRoutes.delete("/:id", (req, res) => {
  const detail = GoalTracker.getGoal(req.params.id);
  if (!detail) return res.status(404).json({ error: "Goal not found" });
  GoalTracker.abandonGoal(req.params.id);
  res.json({ success: true });
});
```

- [ ] **Step 6.2: Register in server.ts**

In `src/server.ts`, add the import with the other route imports (after the `mcpServerRoutes` import, around line 39):

```typescript
import { goalRoutes } from "./routes/goalRoutes";
```

Then add the route registration after the existing `app.use("/api/v1/mcp-servers", mcpServerRoutes)` line (around line 116):

```typescript
app.use("/api/v1/goals", goalRoutes);
```

- [ ] **Step 6.3: Type-check**

```powershell
npx tsc --noEmit 2>&1 | Select-Object -First 20
```

Expected: no errors.

- [ ] **Step 6.4: Commit**

```powershell
git add src/routes/goalRoutes.ts src/server.ts
git commit -m "feat(api): add goal routes for list, active, detail, and abandon"
```

---

## Task 7: Update Planner.jsx

**Files:**
- Modify: `frontend/src/components/Planner.jsx`

The existing Planner renders `strategicPlan` string steps from socket props. This update adds an internal polling loop that fetches `GET /api/v1/goals/active` every 3 seconds and renders structured task rows when an active goal is available.

- [ ] **Step 7.1: Replace Planner.jsx**

Replace the full contents of `frontend/src/components/Planner.jsx`:

```jsx
import React, { useRef, useEffect, useState } from 'react';
import { ClipboardList, CheckCircle2, Circle, Clock, AlertCircle, SkipForward } from 'lucide-react';

const STATUS_ICONS = {
  completed:  (size) => <CheckCircle2 size={size} color="var(--accent-neon)" />,
  active:     (size) => <Clock size={size} color="var(--accent-amber)" className="animate-pulse" />,
  failed:     (size) => <AlertCircle size={size} color="#ef4444" />,
  skipped:    (size) => <SkipForward size={size} color="var(--text-muted)" />,
  pending:    (size) => <Circle size={size} color="var(--text-muted)" />,
};

const WORKER_BADGE = {
  researcher: { label: 'RES', color: '#6366f1' },
  developer:  { label: 'DEV', color: '#10b981' },
  tester:     { label: 'TST', color: '#f59e0b' },
  executor:   { label: 'EXE', color: '#3b82f6' },
  none:       { label: 'EXE', color: '#3b82f6' },
};

// ── Structured task row (used when active goal is in SQLite) ──────────────────
const GoalTaskRow = ({ task, index }) => {
  const stepStartRef = useRef(null);
  const [elapsed, setElapsed] = useState(0);
  const isActive = task.status === 'active';
  const badge = WORKER_BADGE[task.assigned_worker] || WORKER_BADGE.executor;
  const icon = STATUS_ICONS[task.status] || STATUS_ICONS.pending;
  const depsBlocked = task.status === 'pending' && task.depends_on?.length > 0;

  useEffect(() => {
    if (!isActive) return;
    stepStartRef.current = Date.now();
    setElapsed(0);
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - stepStartRef.current) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [isActive]);

  return (
    <div className={`planner-item ${task.status}`} style={{ opacity: depsBlocked ? 0.5 : 1 }}>
      <div className="planner-item-icon">{icon(14)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="planner-item-text">{task.title}</span>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
            background: badge.color + '33', color: badge.color, letterSpacing: '0.05em',
          }}>{badge.label}</span>
        </div>
        <div className="planner-progress-bar">
          <div
            className={`planner-progress-fill${isActive ? ' planner-shimmer' : ''}`}
            style={{
              width: task.status === 'completed' ? '100%' : isActive ? '50%' : '0%',
              background: task.status === 'completed' ? 'var(--accent-neon)'
                        : task.status === 'failed'    ? '#ef4444'
                        : 'var(--accent-amber)',
            }}
          />
        </div>
        {isActive && <div className="planner-elapsed">{elapsed}s elapsed</div>}
        {task.status === 'failed' && task.failure_reason && (
          <div style={{ fontSize: 10, color: '#ef4444', marginTop: 2, opacity: 0.8 }}>
            {task.failure_reason.substring(0, 80)}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Legacy string-step row (fallback when no active goal) ─────────────────────
const LegacyStepRow = ({ step, status }) => {
  const stepStartRef = useRef(null);
  const [elapsed, setElapsed] = useState(0);
  const isActive = status === 'active';
  const isCompleted = status === 'completed';
  const icon = STATUS_ICONS[status] || STATUS_ICONS.pending;

  useEffect(() => {
    if (!isActive) return;
    stepStartRef.current = Date.now();
    setElapsed(0);
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - stepStartRef.current) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [isActive]);

  return (
    <div className={`planner-item ${status}`}>
      <div className="planner-item-icon">{icon(14)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span className="planner-item-text">{step}</span>
        <div className="planner-progress-bar">
          <div
            className={`planner-progress-fill${isActive ? ' planner-shimmer' : ''}`}
            style={{
              width: isCompleted ? '100%' : isActive ? '50%' : '0%',
              background: isCompleted ? 'var(--accent-neon)' : 'var(--accent-amber)',
            }}
          />
        </div>
        {isActive && <div className="planner-elapsed">{elapsed}s elapsed</div>}
      </div>
    </div>
  );
};

// ── Main Planner panel ────────────────────────────────────────────────────────
const Planner = ({ strategicPlan, planStatus, width }) => {
  const [activeGoal, setActiveGoal] = useState(null);

  // Poll /api/v1/goals/active every 3 seconds
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch('/api/v1/goals/active');
        if (!cancelled) setActiveGoal(res.ok ? await res.json() : null);
      } catch {
        if (!cancelled) setActiveGoal(null);
      }
    };
    poll();
    const iv = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const useGoalTracker = activeGoal && Array.isArray(activeGoal.tasks) && activeGoal.tasks.length > 0;

  return (
    <div className="planner-panel glass-panel" style={{ width: width ? `${width}px` : undefined }}>
      <div className="planner-header">
        <ClipboardList size={18} className="text-accent-neon" />
        <span>MISSION PLAN</span>
        {useGoalTracker && (
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>
            {activeGoal.completed_count}/{activeGoal.task_count} steps
          </span>
        )}
      </div>
      <div className="planner-content custom-scrollbar">
        {useGoalTracker
          ? activeGoal.tasks.map((task, idx) => <GoalTaskRow key={task.id} task={task} index={idx} />)
          : strategicPlan.map((step, idx) => (
              <LegacyStepRow key={idx} step={step} status={planStatus[step] || 'pending'} />
            ))
        }
      </div>
    </div>
  );
};

export default Planner;
```

- [ ] **Step 7.2: Verify the frontend builds without errors**

```powershell
cd D:\MidpointX; npx vite build --mode development 2>&1 | Select-Object -Last 20
```

Expected: build succeeds with no errors (warnings about unused vars are fine).

- [ ] **Step 7.3: Commit**

```powershell
git add frontend/src/components/Planner.jsx
git commit -m "feat(planner): add structured goal task display with 3s polling and worker badges"
```

---

## Task 8: Full Verification

- [ ] **Step 8.1: Full TypeScript type-check**

```powershell
npx tsc --noEmit 2>&1
```

Expected: zero errors. If errors appear, fix them before continuing.

- [ ] **Step 8.2: Run GoalTracker unit tests**

```powershell
npx jest goalTracker --no-coverage --verbose 2>&1 | Select-Object -Last 30
```

Expected: all 7+ tests pass.

- [ ] **Step 8.3: Start backend and confirm startup is clean**

```powershell
npm run backend 2>&1 | Select-Object -First 30
```

Expected: server starts on port 5001 with no errors. `GoalTracker` tables are created silently on first DB connection.

- [ ] **Step 8.4: Confirm API endpoints respond**

```powershell
Invoke-WebRequest -Uri "http://localhost:5001/api/v1/goals" -UseBasicParsing | Select-Object -ExpandProperty Content
```

Expected: `{"goals":[],"limit":20,"offset":0}`

```powershell
Invoke-WebRequest -Uri "http://localhost:5001/api/v1/goals/active" -UseBasicParsing | Select-Object -ExpandProperty Content
```

Expected: `null`

- [ ] **Step 8.5: Smoke test — send a multi-step goal**

With the backend running, send via the Telegram bot or the web UI:
> "Research the top 3 AI agent frameworks, compare them, and write a comparison table to D:/Reports/ai-agents-comparison.md"

Confirm:
1. Telegram receives the `🎯 New Goal:` message with numbered steps
2. Planner panel switches from string list to structured task rows
3. Each step shows status icon + worker badge
4. Telegram receives `✅ Step done` messages as steps complete
5. Final `🏁 Goal achieved` message arrives on Telegram

- [ ] **Step 8.6: SQLite verification**

With `sqlite3` or the MCP sqlite server, run:
```sql
SELECT id, user_intent, status, task_count, completed_count FROM goals;
SELECT id, goal_id, title, status, assigned_worker FROM goal_tasks;
```

Confirm rows and statuses match what was shown in the UI.

- [ ] **Step 8.7: Final commit (if any cleanup was needed)**

```powershell
git add -p
git commit -m "fix(goal-decomposition): verification cleanup"
```
