# Autonomous Goal Decomposition — Design Spec
Date: 2026-06-14
Status: Approved

## Context

MidpointX's `SupervisorActor` already creates a loose `strategicPlan: string[]` on the fly, but it generates and executes the plan in the same turn — there is no upfront decomposition pass, no dependency tracking between steps, and no persistence if the server restarts mid-task. For complex, multi-session goals this means the agent loses all progress on restart and cannot reason about which steps block which.

This spec adds a dedicated `GoalDecomposerActor` that runs once per user request to produce a structured, dependency-aware task plan stored in SQLite. The `SupervisorActor` then drives execution from that persistent plan, resuming automatically after restarts. Telegram notifications keep the user informed at each milestone.

---

## Data Model

Two new tables added to the existing `src/workspace/midpointx.db` (same file as `agent_memories`). Migration uses the same idempotent `try { ALTER/CREATE } catch {}` pattern as `agentMemory.ts`.

### `goals` table

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `user_intent` | TEXT | original user message |
| `task_id` | TEXT | LangGraph taskId — used to resume on restart |
| `status` | TEXT | `active` / `completed` / `failed` / `abandoned` |
| `task_count` | INTEGER | total sub-tasks |
| `completed_count` | INTEGER | how many are done |
| `created_at` | INTEGER | epoch ms |
| `updated_at` | INTEGER | epoch ms |

### `goal_tasks` table

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `goal_id` | TEXT FK | parent goal |
| `title` | TEXT | short step label (shown in Planner UI) |
| `description` | TEXT | what needs to be done |
| `depends_on` | TEXT | JSON-serialized string[] of task IDs |
| `status` | TEXT | `pending` / `active` / `completed` / `failed` / `skipped` |
| `assigned_worker` | TEXT | `researcher` / `developer` / `tester` / `executor` / null |
| `result` | TEXT | summary written on completion |
| `failure_reason` | TEXT | written on failure |
| `created_at` | INTEGER | epoch ms |
| `updated_at` | INTEGER | epoch ms |

### LangGraph state additions (`src/core/state.ts`)

```typescript
activeGoalId: Annotation<string>  // UUID of current goal in SQLite
activeTaskId: Annotation<string>  // UUID of currently executing task
```

---

## GoalTracker (`src/core/goalTracker.ts`)

Single class owning all DB operations. Follows the same module-level singleton pattern as `agentMemory.ts` (`let _db: Database.Database | null = null`).

### Methods

| Method | Returns | Purpose |
|---|---|---|
| `createGoal(taskId, userIntent, tasks[])` | `Goal` | Insert goal + all tasks atomically |
| `getActiveGoal(taskId)` | `Goal \| null` | Find in-progress goal by LangGraph taskId |
| `getNextTask(goalId)` | `GoalTask \| null` | Next `pending` task whose `dependsOn` are all `completed` |
| `startTask(taskId)` | `void` | Set task status → `active`, update `updated_at` |
| `completeTask(taskId, result)` | `void` | Set task status → `completed`, write result, update counts |
| `failTask(taskId, reason)` | `void` | Set task → `failed`, auto-skip dependent tasks |
| `retryTask(taskId)` | `void` | Reset task → `pending`, clear failure_reason |
| `completeGoal(goalId)` | `void` | Set goal → `completed` |
| `failGoal(goalId, reason)` | `void` | Set goal → `failed` |
| `abandonGoal(goalId)` | `void` | Set goal → `abandoned` |
| `getGoal(goalId)` | `Goal & { tasks: GoalTask[] }` | Full detail with tasks |
| `listGoals(limit, offset)` | `Goal[]` | Paginated, newest first |
| `_resetDbForTesting(path?)` | `void` | Test isolation (same pattern as agentMemory.ts) |

`failTask()` cascades: after marking the task `failed`, it queries all tasks whose `depends_on` contains the failed task's ID and marks them `skipped`.

---

## Write Path — GoalDecomposerActor (`src/nodes/goalDecomposerNode.ts`)

Runs **once** per user request, inserted between `AnalysisActor` and `CompactionActor` in the graph.

### Resume check (runs first)

```
existingGoal = GoalTracker.getActiveGoal(state.taskId)
if existingGoal → skip decomposition, set state.activeGoalId, return
```

This is the only resume logic. On server restart the graph re-enters from `START`, reaches `GoalDecomposerActor`, finds the existing plan, and continues from the first `pending` or `failed` task.

### Decomposition (fresh goals only)

Calls LLM with structured output schema:

```typescript
const GoalTaskSchema = z.object({
  title: z.string(),
  description: z.string(),
  dependsOn: z.array(z.string()).describe("titles of tasks that must complete first"),
  estimatedComplexity: z.enum(["simple", "medium", "complex"]),
  assignedWorker: z.enum(["researcher", "developer", "tester", "executor"])
});

const DecompositionSchema = z.object({
  tasks: z.array(GoalTaskSchema).max(12),
  rationale: z.string()
});
```

`dependsOn` uses task **titles** (human-readable) in the LLM response; the node converts them to UUIDs before writing to SQLite.

**Guardrails:**
- Max 12 sub-tasks — prevents over-decomposition on simple requests
- `estimatedComplexity: 'simple'` + `assignedWorker: 'executor'` → skips cognitive workers, goes straight to tool execution
- LLM prompt includes `state.analysisResult` so decomposition is informed by the reflection already computed

### Telegram notification on plan creation

```
🎯 New Goal: {userIntent}
📋 {N} steps planned:
1. {task1.title}
2. {task2.title}
...
```

---

## Read/Update Path — SupervisorActor Changes

`SupervisorActor` in `src/nodes/cognitiveNodes.ts` is modified to drive execution from `GoalTracker` instead of generating its own `strategicPlan` string array.

### Each turn

1. `GoalTracker.getNextTask(state.activeGoalId)` → next ready task
2. If null and all tasks completed → `GoalTracker.completeGoal()`, set `isTaskComplete: true`
3. If null and tasks remain (dependencies not yet met) → wait, re-enter supervisor on next loop
4. Mark selected task `active` via `GoalTracker.startTask(taskId)`, set `state.activeTaskId`
5. Assign worker based on task's `assignedWorker` hint (Supervisor may override based on context)
6. After worker/executor cycle completes:
   - Success → `GoalTracker.completeTask(taskId, result)`; Telegram: `✅ Step done: {title}`
   - Failure → `GoalTracker.failTask(taskId, reason)` (cascades to dependent tasks automatically)

### Failure handling

On task failure the Supervisor decides:
- **Retry** (transient error, e.g. network timeout): `GoalTracker.retryTask(taskId)`, max 2 retries per task
- **Replan** (logic error): mark failed, generate replacement tasks via a new LLM call, insert them into SQLite with appropriate `depends_on` links
- **Abandon** (unrecoverable): `GoalTracker.failGoal()`, Telegram: `❌ Goal failed at step "{title}": {reason}`

### Compatibility with existing `strategicPlan`

`SupervisorActor` continues to write `strategicPlan` state (derived from GoalTracker task titles) so the existing Planner socket events and frontend continue working unchanged during transition.

---

## Telegram Notifications

Uses existing `TelegramService` (already initialized on startup). Four events fire:

| Event | Message |
|---|---|
| Goal created | `🎯 New Goal: {intent}\n📋 {N} steps:\n1. {title}\n2. {title}...` |
| Step completed | `✅ Step done ({n}/{total}): {title}` |
| Step failed | `⚠️ Step failed: {title}\n{reason}` |
| Goal complete | `🏁 Goal achieved: {intent}\n⏱ {duration}min · {n}/{n} steps` |
| Goal failed | `❌ Goal failed: {intent}\nFailed at: {title}\n{reason}` |

Telegram calls are fire-and-forget (`catch` logs warning, never blocks execution).

---

## API Routes (`src/routes/goalRoutes.ts`)

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/v1/goals` | List all goals, paginated (`?limit=20&offset=0`), newest first |
| `GET` | `/api/v1/goals/active` | Current in-progress goal with full task list |
| `GET` | `/api/v1/goals/:id` | Full goal detail — goal row + all tasks |
| `DELETE` | `/api/v1/goals/:id` | Abandon a goal (sets status → `abandoned`) |

No POST endpoint — goals are created exclusively by the agent.

---

## UI — Enhanced Planner Panel (`frontend/src/components/Planner.jsx`)

The existing Planner already displays `strategicPlan` string steps from socket events. When a goal is active, it switches to polling `GET /api/v1/goals/active` every 3 seconds and renders the structured task list:

- **Header**: `Goal Progress: 4 / 9 steps`
- **Task row**: status icon · title · worker badge · dependency indicator
  - ⏳ pending (grayed if dependencies not yet met)
  - ▶ active (pulsing)
  - ✅ completed
  - ❌ failed
  - ⏭ skipped
- Falls back to the existing string-list display when no active goal exists (backward compatible)

---

## Graph Wiring (`src/core/graph.ts`)

```
AnalysisActor → GoalDecomposerActor → CompactionActor
```

`GoalDecomposerActor` has no conditional edges — it always passes through to `CompactionActor`. The resume logic is internal to the node.

---

## Files Changed

| File | Action | Purpose |
|---|---|---|
| `src/core/goalTracker.ts` | **CREATE** | SQLite goal/task CRUD, cascade skip on failure |
| `src/core/state.ts` | **MODIFY** | Add `activeGoalId`, `activeTaskId` fields |
| `src/nodes/goalDecomposerNode.ts` | **CREATE** | LLM decomposition + resume check + Telegram on create |
| `src/nodes/cognitiveNodes.ts` | **MODIFY** | SupervisorActor reads/updates GoalTracker each turn |
| `src/core/graph.ts` | **MODIFY** | Wire GoalDecomposerActor between AnalysisActor and CompactionActor |
| `src/routes/goalRoutes.ts` | **CREATE** | 4 REST endpoints |
| `src/server.ts` | **MODIFY** | Register goal routes |
| `frontend/src/components/Planner.jsx` | **MODIFY** | Structured task display with polling |
| `src/tests/goalTracker.test.ts` | **CREATE** | Unit tests for CRUD + cascade skip |

---

## Error Handling

| Scenario | Behavior |
|---|---|
| LLM decomposition fails | Fall back to single-task plan (`title: userIntent, worker: executor`); Telegram notifies |
| `getNextTask()` returns null with pending tasks | Supervisor loops back; timeout after `MAX_TURNS_PER_MISSION` |
| Task fails, no dependents | Supervisor retries up to 2×, then fails goal |
| SQLite write fails | Log error, continue with in-memory strategicPlan (graceful degradation) |
| Telegram send fails | Log warning, never block execution |
| Server restart mid-task | Resume check in GoalDecomposerActor finds active goal, restores state |

---

## Verification

1. `npx tsc --noEmit` — clean
2. `npx jest goalTracker --no-coverage` — all unit tests pass
3. Start backend, send a multi-step task (e.g. "research the top 3 AI agent platforms and write a comparison report")
4. Confirm Telegram receives the plan creation message
5. Watch Planner panel update step-by-step with status icons
6. Kill and restart the backend mid-task — confirm the agent resumes from the correct step
7. `SELECT * FROM goals; SELECT * FROM goal_tasks;` in SQLite — verify rows and statuses
8. `GET /api/v1/goals/active` — confirm JSON response matches SQLite state
