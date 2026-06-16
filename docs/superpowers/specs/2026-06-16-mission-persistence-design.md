# Cross-Session Mission Persistence — Design Spec

**Date:** 2026-06-16
**Status:** Approved

---

## Goal

Enable MidpointX missions to survive server restarts and, for flagged long-horizon missions, to span multiple sessions across days — with automatic resume on boot and a clean pause/resume cycle driven by the existing ProactiveScheduler heartbeat.

---

## Architecture Overview

Two independent concerns, solved together:

1. **Checkpoint durability** — swap `MemorySaver` → `SqliteSaver` so LangGraph writes per-turn checkpoints to disk. Thread state survives process death.
2. **Mission registry** — a new `mission_manifest` table tracks which `thread_id`s are active/paused so the server knows what to resume on boot.

Checkpoints go to a dedicated `src/workspace/checkpoints.db`. The mission manifest lives in the existing `src/workspace/midpointx.db`. Separate files prevent WAL contention between high-frequency checkpoint writes and low-frequency manifest updates.

---

## Data Model

### `checkpoints.db`

Managed entirely by `SqliteSaver` from `@langchain/langgraph-checkpoint-sqlite`. No manual schema required — the library initialises its own tables.

### `midpointx.db` — `mission_manifest` table

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | UUID |
| `thread_id` | TEXT | UNIQUE NOT NULL | Stable LangGraph resume key |
| `intent_summary` | TEXT | NOT NULL | First 200 chars of original intent |
| `mode` | TEXT | NOT NULL | `'short'` or `'long-horizon'` |
| `status` | TEXT | NOT NULL | `'active'` / `'paused'` / `'completed'` / `'failed'` |
| `turn_count` | INTEGER | NOT NULL DEFAULT 0 | Incremented each graph turn |
| `failure_reason` | TEXT | | Populated on fail |
| `created_at` | TEXT | NOT NULL | ISO timestamp |
| `last_active_at` | TEXT | NOT NULL | Updated on each turn |

Indexes: `idx_mm_status ON mission_manifest(status)`, `idx_mm_thread ON mission_manifest(thread_id)`.

---

## `thread_id` Stability Strategy

| Caller | `thread_id` source | Notes |
|---|---|---|
| `ChannelRouter` | `message.userId` | Already stable — unchanged |
| `ProactiveScheduler` | `crypto.randomUUID()` at task creation, persisted to manifest | Was ephemeral; now stable for life of mission |
| `ScreenMonitor` | Same as above | |
| `Observer` proactive triggers | Same as above | |

---

## New Module: `src/core/missionStore.ts`

Owns all reads and writes to `mission_manifest`. Uses the existing `getDb()` pattern from `agentMemory.ts` (WAL mode, shared connection).

**Public API:**

```typescript
MissionStore.register(threadId: string, intentSummary: string, mode: 'short' | 'long-horizon'): void
MissionStore.tick(threadId: string): void           // turn_count++ + last_active_at = now
MissionStore.complete(threadId: string): void
MissionStore.fail(threadId: string, reason: string): void
MissionStore.pause(threadId: string): void          // long-horizon only
MissionStore.resume(threadId: string): void
MissionStore.getMode(threadId: string): 'short' | 'long-horizon' | null
MissionStore.getTurnCount(threadId: string): number
MissionStore.listActive(): MissionRecord[]          // status IN ('active', 'paused')
```

---

## State Schema Changes: `src/core/graph.ts`

Two new fields added to `MidpointXState`:

```typescript
threadId?: string;           // stable mission ID; set by callers before stream()
__missionControl?: string;   // internal signal; 'PAUSE_MISSION' triggers budget-gate edge
```

`threadId` is written into the initial state object by each caller (channelRouter, observer, etc.) alongside `intent`. This is how `missionBudgetGateNode` reads it without accessing LangGraph config internals.

---

## Core Change: `src/core/graph.ts`

```typescript
// Remove:
import { MemorySaver } from "@langchain/langgraph";
const checkpointer = new MemorySaver();

// Add:
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
const checkpointer = SqliteSaver.fromConnString(
  path.join(process.cwd(), "src/workspace/checkpoints.db")
);
```

`interruptBefore` and all node wiring remain unchanged — SqliteSaver is a drop-in replacement.

---

## New Node: `MissionBudgetGate`

**Location:** `src/nodes/cognitiveNodes.ts`

**Purpose:** Intercept long-horizon missions at turn 140 (10 turns before the `recursionLimit: 150` hard ceiling), checkpoint cleanly, and pause for ProactiveScheduler to resume later.

```typescript
export async function missionBudgetGateNode(state: MidpointXState): Promise<Partial<MidpointXState>> {
  // threadId is written into state by channelRouter/observer/etc. before stream() is called
  const threadId = state.threadId;
  if (!threadId) return {};

  const mode = MissionStore.getMode(threadId);
  if (mode !== 'long-horizon') return {};

  const turns = MissionStore.getTurnCount(threadId);
  if (turns < 140) return {};

  MissionStore.pause(threadId);
  SwarmBus.emit('mission:paused', { threadId, turns, reason: 'budget' });
  // __missionControl is added to MidpointXState; conditional edge checks this field
  return { __missionControl: 'PAUSE_MISSION' };
}
```

**Wiring in `graph.ts`:**
- Register `MissionBudgetGate` as a node
- Insert between `SupervisorActor` and `HumanApprovalGate`
- Add to `interruptBefore` so the checkpoint is written before execution
- Conditional edge: `state.__missionControl === 'PAUSE_MISSION'` → `END`; otherwise → `HumanApprovalGate`

**Short missions:** The `mode !== 'long-horizon'` guard returns immediately — zero overhead.

---

## Boot Resume: `src/server.ts`

Called once at startup, before the HTTP server accepts connections:

```typescript
async function resumeActiveMissions(): Promise<void> {
  const missions = MissionStore.listActive().filter(m => m.status === 'active');
  for (const m of missions) {
    console.log(`[Boot] Resuming mission ${m.thread_id}: ${m.intent_summary}`);
    MidpointXGraph.stream(null, {
      configurable: { thread_id: m.thread_id },
      recursionLimit: 150
    }).catch(err => MissionStore.fail(m.thread_id, err.message));
  }
}
```

`paused` long-horizon missions are intentionally excluded here — ProactiveScheduler handles them on its next heartbeat tick, respecting the cooldown window.

---

## ProactiveScheduler: Long-Horizon Resume

Added to the existing heartbeat tick in `src/core/proactiveScheduler.ts`:

```typescript
const RESUME_COOLDOWN_MS = parseInt(process.env.MISSION_RESUME_COOLDOWN_MS ?? "1800000"); // 30 min default

const paused = MissionStore.listActive().filter(m => m.status === 'paused');
for (const m of paused) {
  const idleMs = Date.now() - new Date(m.last_active_at).getTime();
  if (idleMs > RESUME_COOLDOWN_MS) {
    MissionStore.resume(m.thread_id);
    MidpointXGraph.stream(null, {
      configurable: { thread_id: m.thread_id },
      recursionLimit: 150
    }).catch(err => MissionStore.fail(m.thread_id, err.message));
  }
}
```

Each resumed session gets a fresh 150-turn budget. SqliteSaver provides full state continuity — the agent resumes exactly where it paused.

---

## Integration Points (existing files, minimal changes)

| File | Change |
|---|---|
| `src/core/graph.ts` | Swap `MemorySaver` → `SqliteSaver`; add `MissionBudgetGate` node + wiring |
| `src/core/channelRouter.ts` | `MissionStore.register/complete/fail` around `stream()` calls; mode = `'long-horizon'` when `message.executionMode === 'long-horizon'` or intent prefixed with `[LONG-HORIZON]`, otherwise `'short'` |
| `src/core/observer.ts` | Same — assign stable `threadId` before `stream()` |
| `src/core/proactiveScheduler.ts` | Stable `threadId` assignment + paused-mission resume loop |
| `src/core/screenMonitor.ts` | Same as observer |
| `src/server.ts` | Call `resumeActiveMissions()` on startup |
| `src/nodes/cognitiveNodes.ts` | Add `missionBudgetGateNode` |

---

## API Routes: `src/routes/missionRoutes.ts` (new)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/missions` | List all missions |
| `GET` | `/api/v1/missions/:threadId` | Single mission detail |
| `DELETE` | `/api/v1/missions/:threadId` | Cancel (mark failed) |

Registered in `src/server.ts` alongside existing route mounts.

---

## UI Surface

`SwarmBus` events surface mission state changes in the existing Swarm Visualizer without polling:

| Event | Payload | Trigger |
|---|---|---|
| `mission:registered` | `{ threadId, mode, intent }` | `MissionStore.register()` |
| `mission:paused` | `{ threadId, turns, reason }` | `MissionBudgetGate` node |
| `mission:resumed` | `{ threadId }` | `MissionStore.resume()` |
| `mission:completed` | `{ threadId }` | `MissionStore.complete()` |
| `mission:failed` | `{ threadId, reason }` | `MissionStore.fail()` |

---

## Error Handling

| Scenario | Handling |
|---|---|
| `checkpoints.db` fails to open | Throw on startup — no silent fallback to `MemorySaver` |
| Boot resume: graph throws | `MissionStore.fail()` + log; server continues |
| Mid-session process kill | SqliteSaver per-turn writes; worst case = one turn replayed on resume |
| `MissionBudgetGate` on short mission | Guard returns `{}` immediately — no state mutation |
| Concurrent ProactiveScheduler resumes | `MissionStore.resume()` is synchronous SQLite; last-writer-wins is safe (idempotent) |

---

## Configuration (`.env`)

```
MISSION_RESUME_COOLDOWN_MS=1800000   # 30 min between long-horizon sessions (default)
```

---

## Out of Scope

- Mission dependency chains
- Manual mission scheduling from the UI
- Cross-device mission handoff
- Mission priority queuing
