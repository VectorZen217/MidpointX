# Cross-Session Mission Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable MidpointX missions to survive server restarts and, for long-horizon missions, to span multi-session work across days via SqliteSaver checkpoints and a new mission manifest registry.

**Architecture:** Swap `MemorySaver` → `SqliteSaver` in `graph.ts` (one line) so LangGraph writes per-turn checkpoints to `src/workspace/checkpoints.db`. A new `missionStore.ts` module maintains a `mission_manifest` table in `midpointx.db` tracking which thread_ids are active/paused, enabling boot-time resume and a ProactiveScheduler cooldown-based resume loop for long-horizon missions. A `MissionBudgetGate` node intercepts long-horizon missions at turn 140 to pause them cleanly before the hard recursion limit.

**Tech Stack:** TypeScript 5.4, `@langchain/langgraph-checkpoint-sqlite` (new), `better-sqlite3` (existing), LangGraph `SqliteSaver`, Socket.io via `SwarmBus`

**Spec:** `docs/superpowers/specs/2026-06-16-mission-persistence-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/core/missionStore.ts` | **Create** | `mission_manifest` table CRUD — register, tick, complete, fail, pause, resume, query |
| `src/routes/missionRoutes.ts` | **Create** | REST endpoints: GET list, GET single, DELETE (cancel) |
| `src/tests/missionStore.test.ts` | **Create** | Full unit test suite for missionStore |
| `src/core/state.ts` | **Modify** | Add `threadId` and `__missionControl` Annotation fields |
| `src/core/graph.ts` | **Modify** | Swap `MemorySaver` → `SqliteSaver`; add + wire `MissionBudgetGate` node |
| `src/nodes/cognitiveNodes.ts` | **Modify** | Add `missionBudgetGateNode` export |
| `src/core/channelRouter.ts` | **Modify** | Register/complete/fail missions; write `threadId` into initial state |
| `src/core/proactiveScheduler.ts` | **Modify** | Write `threadId` into state in `_fireSchedule`; add paused-mission resume loop to `_pollCompletion` |
| `src/server.ts` | **Modify** | Add `resumeActiveMissions()` boot hook; mount `missionRoutes` |
| `.env.example` | **Modify** | Add `MISSION_RESUME_COOLDOWN_MS` |

---

## Task 1: Install Dependency + Update Config Files

**Files:**
- Modify: `package.json` (via npm)
- Modify: `.env.example`

- [ ] **Step 1: Install `@langchain/langgraph-checkpoint-sqlite`**

```powershell
cd D:\MidpointX
npm install @langchain/langgraph-checkpoint-sqlite
```

Expected: package added to `node_modules` and `package.json` dependencies. No errors.

- [ ] **Step 2: Verify `src/workspace/*.db` in `.gitignore` covers `checkpoints.db`**

Open `.gitignore` and confirm line `src/workspace/*.db` exists (it does — no change needed). The new `checkpoints.db` is automatically excluded.

- [ ] **Step 3: Add env var to `.env.example`**

Open `.env.example` and add this line in the appropriate section (near other numeric tunables):

```
MISSION_RESUME_COOLDOWN_MS=1800000   # 30 min between long-horizon session resumptions (default)
```

- [ ] **Step 4: Commit**

```powershell
git add package.json package-lock.json .env.example
git commit -m "feat(deps): add langgraph-checkpoint-sqlite for cross-session mission persistence"
```

---

## Task 2: Create `src/core/missionStore.ts` (TDD)

**Files:**
- Create: `src/tests/missionStore.test.ts`
- Create: `src/core/missionStore.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/tests/missionStore.test.ts`:

```typescript
import * as os from "os";
import * as path from "path";

// Suppress SwarmBus "called before init" warnings in test output
beforeAll(() => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

import { MissionStore, _resetMissionStoreForTesting } from "../core/missionStore";

function makeTempDbPath(): string {
  return path.join(os.tmpdir(), `mx-ms-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

beforeEach(() => {
  _resetMissionStoreForTesting(makeTempDbPath());
});

afterEach(() => {
  _resetMissionStoreForTesting();
});

describe("MissionStore.register()", () => {
  it("creates a new active mission record", () => {
    MissionStore.register("t1", "Do the thing", "short");
    const missions = MissionStore.listActive();
    expect(missions).toHaveLength(1);
    expect(missions[0].thread_id).toBe("t1");
    expect(missions[0].status).toBe("active");
    expect(missions[0].mode).toBe("short");
    expect(missions[0].turn_count).toBe(0);
  });

  it("is idempotent — re-registering same thread_id preserves original", () => {
    MissionStore.register("t1", "First intent", "short");
    MissionStore.register("t1", "Second intent", "long-horizon");
    const missions = MissionStore.listActive();
    expect(missions).toHaveLength(1);
    expect(missions[0].intent_summary).toBe("First intent");
  });

  it("truncates intent_summary to 200 characters", () => {
    const longIntent = "A".repeat(250);
    MissionStore.register("t2", longIntent, "short");
    const m = MissionStore.get("t2");
    expect(m?.intent_summary.length).toBe(200);
  });
});

describe("MissionStore.tick()", () => {
  it("increments turn_count by 1 each call", () => {
    MissionStore.register("t1", "intent", "short");
    MissionStore.tick("t1");
    MissionStore.tick("t1");
    expect(MissionStore.getTurnCount("t1")).toBe(2);
  });

  it("is a no-op for unknown thread_id", () => {
    expect(() => MissionStore.tick("nonexistent")).not.toThrow();
  });
});

describe("MissionStore.complete()", () => {
  it("sets status to completed and removes from listActive()", () => {
    MissionStore.register("t1", "intent", "short");
    MissionStore.complete("t1");
    expect(MissionStore.listActive()).toHaveLength(0);
    const m = MissionStore.listAll().find(r => r.thread_id === "t1");
    expect(m?.status).toBe("completed");
  });
});

describe("MissionStore.fail()", () => {
  it("sets status to failed with the given reason", () => {
    MissionStore.register("t1", "intent", "short");
    MissionStore.fail("t1", "graph threw");
    const m = MissionStore.listAll().find(r => r.thread_id === "t1");
    expect(m?.status).toBe("failed");
    expect(m?.failure_reason).toBe("graph threw");
  });

  it("removes from listActive()", () => {
    MissionStore.register("t1", "intent", "short");
    MissionStore.fail("t1", "err");
    expect(MissionStore.listActive()).toHaveLength(0);
  });
});

describe("MissionStore.pause() and resume()", () => {
  it("pause sets status to paused but keeps in listActive()", () => {
    MissionStore.register("t1", "intent", "long-horizon");
    MissionStore.pause("t1");
    const active = MissionStore.listActive();
    expect(active).toHaveLength(1);
    expect(active[0].status).toBe("paused");
  });

  it("resume sets status back to active", () => {
    MissionStore.register("t1", "intent", "long-horizon");
    MissionStore.pause("t1");
    MissionStore.resume("t1");
    const m = MissionStore.listActive().find(r => r.thread_id === "t1");
    expect(m?.status).toBe("active");
  });
});

describe("MissionStore.getMode()", () => {
  it("returns mode for registered thread", () => {
    MissionStore.register("t1", "intent", "long-horizon");
    expect(MissionStore.getMode("t1")).toBe("long-horizon");
  });

  it("returns null for unknown thread", () => {
    expect(MissionStore.getMode("ghost")).toBeNull();
  });
});

describe("MissionStore.get()", () => {
  it("returns the full record", () => {
    MissionStore.register("t1", "my intent", "short");
    const m = MissionStore.get("t1");
    expect(m).not.toBeNull();
    expect(m?.thread_id).toBe("t1");
    expect(m?.intent_summary).toBe("my intent");
  });

  it("returns null for unknown thread", () => {
    expect(MissionStore.get("ghost")).toBeNull();
  });
});

describe("MissionStore.listAll()", () => {
  it("includes completed and failed missions", () => {
    MissionStore.register("t1", "a", "short");
    MissionStore.register("t2", "b", "short");
    MissionStore.complete("t1");
    MissionStore.fail("t2", "err");
    const all = MissionStore.listAll();
    expect(all).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
npx jest src/tests/missionStore.test.ts --no-coverage 2>&1 | Select-Object -Last 10
```

Expected: `FAIL` with `Cannot find module '../core/missionStore'`

- [ ] **Step 3: Implement `src/core/missionStore.ts`**

Create `src/core/missionStore.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npx jest src/tests/missionStore.test.ts --no-coverage 2>&1 | Select-Object -Last 10
```

Expected: `PASS src/tests/missionStore.test.ts` — all tests green.

- [ ] **Step 5: Type-check**

```powershell
npx tsc --noEmit 2>&1 | Select-Object -Last 20
```

Expected: no output (clean).

- [ ] **Step 6: Commit**

```powershell
git add src/core/missionStore.ts src/tests/missionStore.test.ts
git commit -m "feat(missionStore): add mission_manifest SQLite registry with full TDD coverage"
```

---

## Task 3: Add State Schema Fields

**Files:**
- Modify: `src/core/state.ts` (add 2 Annotation fields)

- [ ] **Step 1: Add `threadId` and `__missionControl` to `MidpointXState`**

Open `src/core/state.ts`. After the `synthesizedSkillId` field (line 107), add these two fields before the closing `});`:

```typescript
  // Mission Persistence — written by callers (channelRouter, proactiveScheduler, etc.)
  // before stream() so MissionBudgetGate can look up the mission in mission_manifest.
  threadId: Annotation<string>({ reducer: (x: string, y: string) => y, default: () => "" }),
  // Internal budget-gate signal: 'PAUSE_MISSION' routes the conditional edge to END.
  __missionControl: Annotation<string>({ reducer: (x: string, y: string) => y, default: () => "" }),
```

- [ ] **Step 2: Type-check**

```powershell
npx tsc --noEmit 2>&1 | Select-Object -Last 20
```

Expected: no output.

- [ ] **Step 3: Commit**

```powershell
git add src/core/state.ts
git commit -m "feat(state): add threadId and __missionControl fields for mission persistence"
```

---

## Task 4: Swap `MemorySaver` → `SqliteSaver` in `graph.ts`

**Files:**
- Modify: `src/core/graph.ts` (lines 1 and 19)

- [ ] **Step 1: Replace the checkpointer**

In `src/core/graph.ts`, replace lines 1 and 19:

**Remove:**
```typescript
import { StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
// ...
const checkpointer = new MemorySaver();
```

**Add:**
```typescript
import { StateGraph, START, END } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import path from "path";
// ...
const checkpointer = SqliteSaver.fromConnString(
  path.resolve(process.cwd(), "src/workspace/checkpoints.db")
);
```

The full top of the file (lines 1–20) should now look like:

```typescript
import { StateGraph, START, END } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import path from "path";
import { MidpointXState } from "./state";

// Explicit state type — needed because builder is cast to `any` above,
// which loses inference on callback parameters.
type GraphState = typeof MidpointXState.State;
import { reflectNode, analyzeNode, supervisorNode, learnNode, silentAssessmentNode } from "../nodes/cognitiveNodes";
import { justifyNode, regressNode, verificationNode } from "../nodes/safeguardNodes";
import { modifyNode } from "../nodes/modifyNode";
import { compilerNode } from "../nodes/compilerNode";
import { selectionActor, executionActor } from "../nodes/executionNodes";
import { compactionNode } from "../nodes/compactionNode";
import { pruningNode } from "../nodes/pruningNode";
import { researchWorkerNode, developerWorkerNode, testerWorkerNode } from "../nodes/swarmWorkerNodes";
import { skillAcquisitionNode } from "../nodes/skillAcquisitionNode";
import { goalDecomposerNode } from "../nodes/goalDecomposerNode";

// Persistent checkpointer: writes per-turn SQLite checkpoints so missions survive restarts.
const checkpointer = SqliteSaver.fromConnString(
  path.resolve(process.cwd(), "src/workspace/checkpoints.db")
);
```

- [ ] **Step 2: Type-check**

```powershell
npx tsc --noEmit 2>&1 | Select-Object -Last 20
```

Expected: no output.

- [ ] **Step 3: Commit**

```powershell
git add src/core/graph.ts
git commit -m "feat(graph): swap MemorySaver for SqliteSaver — checkpoint durability across restarts"
```

---

## Task 5: Add `MissionBudgetGate` Node

**Files:**
- Modify: `src/nodes/cognitiveNodes.ts` (add export at end of file)
- Modify: `src/core/graph.ts` (add node registration + wiring)

- [ ] **Step 1: Add `missionBudgetGateNode` to `cognitiveNodes.ts`**

Add the following imports at the top of `src/nodes/cognitiveNodes.ts` (after the existing imports):

```typescript
import { MissionStore } from "../core/missionStore";
import { SwarmBus } from "../core/swarmBus";
```

Then add this function at the **end** of `src/nodes/cognitiveNodes.ts`, before any final closing lines:

```typescript
/**
 * Intercepts long-horizon missions at turn 140 and pauses them cleanly
 * before the recursionLimit (150) hard ceiling. Short missions pass through instantly.
 * Also ticks the turn counter for all missions on every cycle.
 */
export async function missionBudgetGateNode(state: typeof MidpointXState.State): Promise<Partial<typeof MidpointXState.State>> {
  const threadId = state.threadId;
  if (!threadId) return {};

  MissionStore.tick(threadId);

  const mode = MissionStore.getMode(threadId);
  if (mode !== "long-horizon") return {};

  const turns = MissionStore.getTurnCount(threadId);
  if (turns < 140) return {};

  MissionStore.pause(threadId);
  SwarmBus.emit("mission:paused", { threadId, turns: turns as unknown as string, reason: "budget" });
  return { __missionControl: "PAUSE_MISSION" };
}
```

- [ ] **Step 2: Wire `MissionBudgetGate` into `graph.ts`**

In `src/core/graph.ts`, add the import for `missionBudgetGateNode` to the existing cognitiveNodes import line:

```typescript
import { reflectNode, analyzeNode, supervisorNode, learnNode, silentAssessmentNode, missionBudgetGateNode } from "../nodes/cognitiveNodes";
```

Then find the line:
```typescript
builder.addEdge("CompactionActor", "SelectionActor");
```

Replace it with:

```typescript
builder.addEdge("CompactionActor", "MissionBudgetGate");

builder.addNode("MissionBudgetGate", (state: GraphState) => missionBudgetGateNode(state));

builder.addConditionalEdges(
  "MissionBudgetGate",
  (state: GraphState) => state.__missionControl === "PAUSE_MISSION" ? "end" : "select",
  {
    end: END,
    select: "SelectionActor"
  }
);
```

- [ ] **Step 3: Type-check**

```powershell
npx tsc --noEmit 2>&1 | Select-Object -Last 20
```

Expected: no output.

- [ ] **Step 4: Commit**

```powershell
git add src/nodes/cognitiveNodes.ts src/core/graph.ts
git commit -m "feat(graph): add MissionBudgetGate node — pauses long-horizon missions at turn 140"
```

---

## Task 6: Integrate MissionStore into `channelRouter.ts`

**Files:**
- Modify: `src/core/channelRouter.ts`

The `ChannelRouter.route()` method in `src/core/channelRouter.ts` currently streams without registering a mission. We add: import MissionStore, detect mode, register before stream, write `threadId` into initial state, and complete/fail after.

- [ ] **Step 1: Add import**

At the top of `src/core/channelRouter.ts`, add after the existing imports:

```typescript
import { MissionStore, MissionMode } from "./missionStore";
```

- [ ] **Step 2: Add mission registration and lifecycle calls to `route()`**

Find the `route()` method body. Locate the line that reads:

```typescript
const config = { 
  configurable: { thread_id: message.userId },
  recursionLimit: Config.MAX_RECURSION_LIMIT 
};
```

Insert the following **before** that line:

```typescript
const threadId = message.userId;
const isLongHorizon =
  message.executionMode === "long-horizon" ||
  message.intent.startsWith("[LONG-HORIZON]");
const missionMode: MissionMode = isLongHorizon ? "long-horizon" : "short";
MissionStore.register(threadId, message.intent, missionMode);
```

Then find the `MidpointXGraph.stream({` call and add `threadId` to the initial state object. Locate the `executionMode: message.executionMode || "api",` line and add after it:

```typescript
        threadId: threadId,
```

Then in the `try/catch` of `route()`, find the `return` statements at the bottom. Just before `return { message: outcome, ... }` (the success path), add:

```typescript
      MissionStore.complete(threadId);
```

And in the `catch (error: any)` block, add before the `return` statement:

```typescript
      MissionStore.fail(threadId, error.message || "Unknown Fault");
```

The final structure of the try/catch in `route()` should look like:

```typescript
    try {
      const stream = await MidpointXGraph.stream({
        taskId: `${message.channel.toUpperCase()}-${Date.now()}`,
        userIntent: message.intent,
        highFidelityContext: message.highFidelityContext || [],
        operatorIdentity: { 
          uid: message.userId, 
          source: message.channel,
          originatorId: message.a2aCertificate?.originatorId,
          timestamp: new Date().toISOString()
        },
        executionMode: message.executionMode || "api",
        threadId: threadId,
        // CRITICAL: Reset ephemeral state for new tasks on the same thread
        actionHistory: [],
        strategicPlan: [],
        planStatus: {},
        isTaskComplete: false,
        finalOutcome: "",
        internalTurns: 0,
        replanCount: 0,
        reflectionTrace: "",
        analysisResult: "",
        historySummary: "",
        failureThesis: "",
        proposedShift: null
      }, config);

      // ... (existing streaming loop unchanged) ...

      MissionStore.complete(threadId);

      if (artifacts.length > 0) {
        return { message: outcome, artifacts, telemetry: { turns: turnsUsed, tokens: tokensUsed } };
      }
      return { message: outcome, telemetry: { turns: turnsUsed, tokens: tokensUsed } };

    } catch (error: any) {
      console.error(`❌ [ChannelRouter] Error during graph execution:`, error);
      MissionStore.fail(threadId, error.message || "Unknown Fault");
      return `⚠️ Internal Agent Error: ${error.message || "Unknown Fault"}`;
    }
```

- [ ] **Step 3: Type-check**

```powershell
npx tsc --noEmit 2>&1 | Select-Object -Last 20
```

Expected: no output.

- [ ] **Step 4: Commit**

```powershell
git add src/core/channelRouter.ts
git commit -m "feat(channelRouter): register missions with MissionStore on every route() call"
```

---

## Task 7: Integrate MissionStore into `proactiveScheduler.ts`

**Files:**
- Modify: `src/core/proactiveScheduler.ts`

Two changes: (1) write `threadId` into the graph's initial state in `_fireSchedule`; (2) add paused-mission resume loop to `_pollCompletion`.

- [ ] **Step 1: Add import**

At the top of `src/core/proactiveScheduler.ts`, add after the existing imports:

```typescript
import { MissionStore } from "./missionStore";
```

- [ ] **Step 2: Register mission and write threadId in `_fireSchedule`**

In `_fireSchedule`, find the line:

```typescript
    const scheduledTaskId = `SCHEDULE_${schedule.id}_${Date.now()}`;
```

After it, add:

```typescript
    MissionStore.register(scheduledTaskId, schedule.intent, "short");
```

Then find the `MidpointXGraph.stream({` call inside the IIFE. Locate `userIntent: schedule.intent,` and add after it:

```typescript
            threadId: scheduledTaskId,
```

Then in the IIFE's `catch (err)` block, add before the `db.prepare(...)` calls:

```typescript
        MissionStore.fail(scheduledTaskId, (err as Error).message ?? String(err));
```

And after the streaming loop completes successfully (after the `for await` loop closes), add:

```typescript
        MissionStore.complete(scheduledTaskId);
```

The IIFE should look like:

```typescript
    (async () => {
      try {
        const stream = await MidpointXGraph.stream(
          {
            taskId: scheduledTaskId,
            userIntent: schedule.intent,
            threadId: scheduledTaskId,
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
        MissionStore.complete(scheduledTaskId);
      } catch (err: unknown) {
        const message = (err as Error).message ?? String(err);
        console.error(`❌ [ProactiveScheduler] Graph execution failed for "${schedule.name}":`, message);
        MissionStore.fail(scheduledTaskId, message);
        db.prepare(
          "UPDATE scheduled_goal_runs SET status = 'failed', completed_at = ? WHERE id = ?"
        ).run(Date.now(), runId);
        db.prepare(
          "UPDATE scheduled_goals SET active_goal_id = NULL, updated_at = ? WHERE id = ?"
        ).run(Date.now(), schedule.id);
      }
    })().catch(console.error);
```

- [ ] **Step 3: Add paused-mission resume loop to `_pollCompletion`**

In `_pollCompletion`, find the end of the method (after the `for (const schedule of active)` loop's closing brace). Add after it:

```typescript
    // Resume long-horizon missions that have been paused beyond the cooldown window
    const RESUME_COOLDOWN_MS = parseInt(process.env.MISSION_RESUME_COOLDOWN_MS ?? "1800000", 10);
    const paused = MissionStore.listActive().filter(m => m.status === "paused");
    for (const m of paused) {
      const idleMs = Date.now() - new Date(m.last_active_at).getTime();
      if (idleMs > RESUME_COOLDOWN_MS) {
        MissionStore.resume(m.thread_id);
        MidpointXGraph.stream(null, {
          configurable: { thread_id: m.thread_id },
          recursionLimit: Config.MAX_RECURSION_LIMIT,
        }).catch((err: Error) => MissionStore.fail(m.thread_id, err.message));
      }
    }
```

- [ ] **Step 4: Type-check**

```powershell
npx tsc --noEmit 2>&1 | Select-Object -Last 20
```

Expected: no output.

- [ ] **Step 5: Commit**

```powershell
git add src/core/proactiveScheduler.ts
git commit -m "feat(scheduler): register missions, write threadId into state, add paused-mission resume loop"
```

---

## Task 8: Boot Resume + Mission Routes + Final Server Wiring

**Files:**
- Create: `src/routes/missionRoutes.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: Create `src/routes/missionRoutes.ts`**

Create the file:

```typescript
import { Router, Request, Response } from "express";
import { MissionStore } from "../core/missionStore";

export const missionRoutes = Router();

/**
 * GET /api/v1/missions
 * List all missions (active, paused, completed, failed).
 */
missionRoutes.get("/", (req: Request, res: Response) => {
  try {
    const missions = MissionStore.listAll();
    res.json({ success: true, missions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/missions/:threadId
 * Single mission detail.
 */
missionRoutes.get("/:threadId", (req: Request, res: Response) => {
  try {
    const mission = MissionStore.get(req.params.threadId);
    if (!mission) return res.status(404).json({ error: "Mission not found" });
    res.json({ success: true, mission });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/v1/missions/:threadId
 * Cancel a mission (marks as failed with "Cancelled by user").
 */
missionRoutes.delete("/:threadId", (req: Request, res: Response) => {
  try {
    const mission = MissionStore.get(req.params.threadId);
    if (!mission) return res.status(404).json({ error: "Mission not found" });
    MissionStore.fail(req.params.threadId, "Cancelled by user");
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 2: Add boot resume function and mount routes in `src/server.ts`**

Add the following import near the other core/route imports:

```typescript
import { MissionStore } from "./core/missionStore";
import { missionRoutes } from "./routes/missionRoutes";
```

Add the route mount after the `screenMonitorRoutes` mount (around line 124):

```typescript
app.use("/api/v1/missions", missionRoutes);
```

Add the `resumeActiveMissions` function definition before `startServer()`:

```typescript
async function resumeActiveMissions(): Promise<void> {
  const active = MissionStore.listActive().filter(m => m.status === "active");
  if (active.length === 0) return;
  console.log(`[Boot] Resuming ${active.length} active mission(s) from checkpoint...`);
  for (const m of active) {
    console.log(`[Boot] Resuming ${m.thread_id}: ${m.intent_summary}`);
    MidpointXGraph.stream(null, {
      configurable: { thread_id: m.thread_id },
      recursionLimit: Config.MAX_RECURSION_LIMIT,
    }).catch((err: Error) => {
      console.error(`[Boot] Resume failed for ${m.thread_id}:`, err.message);
      MissionStore.fail(m.thread_id, err.message);
    });
  }
}
```

Inside `startServer()`, add the call after `await ProactiveScheduler.init(io)`:

```typescript
    await resumeActiveMissions();
```

- [ ] **Step 3: Type-check**

```powershell
npx tsc --noEmit 2>&1 | Select-Object -Last 20
```

Expected: no output.

- [ ] **Step 4: Run the full test suite**

```powershell
npx jest --no-coverage 2>&1 | Select-Object -Last 20
```

Expected: same pass/fail ratio as before these changes (3 pre-existing failures only: `fetch server`, `PROACTIVE_HEARTBEAT.md`, `THEOREM_NODE_01.md`). The new `missionStore` tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/routes/missionRoutes.ts src/server.ts
git commit -m "feat(server): add mission routes and boot-time resume of active missions"
```

---

## Self-Review Checklist

After all tasks are committed, verify:

- [ ] `npx tsc --noEmit` is clean
- [ ] `npx jest --no-coverage` shows missionStore tests passing, no new failures
- [ ] `GET /api/v1/missions` returns `{ success: true, missions: [] }` on a fresh server
- [ ] `src/workspace/checkpoints.db` is created when the server starts (check `src/workspace/`)
- [ ] Spec section "Out of Scope" items (dependency chains, manual UI scheduling, cross-device handoff, priority queuing) are NOT implemented
