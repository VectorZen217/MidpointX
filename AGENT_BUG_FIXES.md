# MidpointX Agent Bug Fix Plan
**Source:** Agent Error Msg.txt — Telegram task "research stock/trading bots, save plan to desktop"
**Date:** 2026-05-23
**Status:** 4 root causes identified, fixes planned below

---

## Root Cause Analysis

The agent received a legitimate user task and partially executed it. Three separate bugs caused
the SupervisorActor to repeatedly classify the active user task as a dropped WORKSPACE_SENTINEL
cron event. A fourth bug caused the research fetch to fail with no fallback. The task never
completed — the .TXT file was never written to the desktop.

---

## Bug 1 — CRITICAL: ReflectionActor injects proactive session history into user tasks

### Evidence
```
[ReflectionActor] Injected 4 relevant past session(s) into context.   ← line 18
[SupervisorActor] "The cron event from WORKSPACE_SENTINEL has been
  identified as internal and non-actionable."                          ← lines 33, 49
```

### Root Cause
`MemoryManager.logSession()` is called at the end of every completed ChannelRouter cycle —
including proactive WORKSPACE_SENTINEL cron runs that were assessed as DROP/no-action.
These get stored in the memory log alongside real user sessions.

When the ReflectionActor later retrieves "relevant past sessions" via semantic search and
injects them into the SupervisorActor's context, WORKSPACE_SENTINEL runs appear as recent
relevant sessions. The SupervisorActor's prompt does not distinguish "injected historical
context" from "the current task," so it re-evaluates the injected sessions and concludes the
current task is also a sentinel event — dropping it.

### Fix — `src/core/channelRouter.ts`

**Step 1:** Tag all proactive sessions before logging so they can be filtered.

In the `MemoryManager.logSession()` call (~line 142 of channelRouter.ts), add a `proactive`
flag when the stream originated from the Observer:

```typescript
// BEFORE (current code — logs proactive and user sessions identically):
MemoryManager.logSession(sessionId, message.intent, outcome, toolsUsed).catch(() => {});

// AFTER:
const isProactiveSession = !!initialState.proactiveTrigger;
MemoryManager.logSession(
  sessionId,
  message.intent,
  outcome,
  toolsUsed,
  { proactive: isProactiveSession }   // new metadata param
).catch(() => {});
```

**Step 2:** In `src/core/memory.ts`, update `logSession()` to accept metadata and prefix
proactive session keys so they are excluded from user-task recall:

```typescript
// In MemoryManager.logSession():
const keyPrefix = metadata?.proactive ? "proactive_session" : "session";
await adapter.appendLog(keyPrefix, sessionId, JSON.stringify(entry));
```

**Step 3:** In the ReflectionActor (`src/nodes/cognitiveNodes.ts`), ensure only
`"session"` category logs are fetched — never `"proactive_session"`:

```typescript
// Change the memory retrieval call to explicitly exclude proactive sessions:
const recentSessions = await MemoryManager.getRecentSessions({ excludeProactive: true });
```

**Step 4:** In the SupervisorActor system prompt (`src/core/prompt.ts`), explicitly
label injected past sessions to prevent confusion:

```
CURRENT TASK (from user): ${state.userIntent}

HISTORICAL CONTEXT (past sessions — for reference only, NOT the current task):
${injectedSessions}

IMPORTANT: Do not evaluate the historical context entries as tasks. Only evaluate
"CURRENT TASK" above.
```

---

## Bug 2 — HIGH: `proactiveTrigger` not reset when a new user task starts

### Evidence
```
[SupervisorActor] "The event has been identified as non-actionable
  and is being dropped."                                              ← line 12 (first cycle)
```

This fires on the FIRST SupervisorActor call — before the ReflectionActor even runs. The
LangGraph MemorySaver checkpoint for `thread_id: 6581069287` contains a lingering
`proactiveTrigger` from a previous WORKSPACE_SENTINEL run on that thread. The graph entry
router sees `proactiveTrigger !== null` and routes to `SilentAssessmentActor` instead of
`ReflectionActor`, which then DROPs the task.

### Root Cause
`ChannelRouter.route()` resets many ephemeral state fields when starting a new user task
(lines ~78–89 of channelRouter.ts), but `proactiveTrigger` is NOT in the reset list. Any
prior proactive trigger value in the checkpoint bleeds into the new user session.

### Fix — `src/core/channelRouter.ts`

Add `proactiveTrigger: null` to the explicit state reset block:

```typescript
// In ChannelRouter.route(), the MidpointXGraph.stream() initial state object:
const stream = await MidpointXGraph.stream({
  taskId: `${message.channel.toUpperCase()}-${Date.now()}`,
  userIntent: message.intent,
  // ... existing fields ...
  proposedShift: null,
  proactiveTrigger: null,    // ← ADD THIS LINE
  assessmentDecision: null,  // ← ADD THIS LINE (prevents stale DROP decision)
  assessmentReasoning: "",   // ← ADD THIS LINE
}, config);
```

This is a one-line fix with high impact — it directly eliminates the Bug 2 DROP on line 12
and reduces the window for Bug 1 to trigger.

---

## Bug 3 — HIGH: Observer fires proactive triggers concurrently with active user tasks

### Evidence
```
[SupervisorActor] Orchestrating cognitive swarm...     ← line 5  (user task in progress)
[ChannelRouter] Inbound from TELEGRAM (User: 6581069287) ← line 7  (new message arrives)
[LLM] Invoking model with payload (2 messages)...      ← line 6  } two LLM calls
[LLM] Invoking model with payload (2 messages)...      ← line 26 } running simultaneously
```

Two graph streams are running concurrently on different thread IDs. The Observer's
WORKSPACE_SENTINEL cron fires while the user's Telegram task is mid-execution. Both
streams are awaiting LLM responses simultaneously in the same Node.js event loop.

While LangGraph's MemorySaver isolates state by `thread_id`, the concurrent execution causes:
- Interleaved log output making debugging nearly impossible
- The proactive session to complete and write to `MemoryManager` WHILE the user task's
  ReflectionActor is about to read from `MemoryManager` — a race condition that injects
  the fresh proactive session into the user task's context (amplifying Bug 1)
- Potential LLM rate-limit pressure from doubled concurrent calls

### Fix — `src/core/observer.ts`

Add a concurrency gate that defers proactive triggers when a user-initiated task is active:

```typescript
// Add a static active-task tracker to ChannelRouter:
// In src/core/channelRouter.ts:
private static activeTasks = new Set<string>();

static async route(message, progressCallback) {
  ChannelRouter.activeTasks.add(message.userId);
  try {
    // ... existing stream logic ...
  } finally {
    ChannelRouter.activeTasks.delete(message.userId);
  }
}

static isUserActive(userId: string): boolean {
  return ChannelRouter.activeTasks.has(userId);
}
```

```typescript
// In src/core/observer.ts, before firing the proactive stream:
// Check if any user task is currently active
import { ChannelRouter } from "./channelRouter";

// Before MidpointXGraph.stream() call in the observer trigger handler:
const primaryUserId = Config.PRIMARY_USER_ID || "system"; // add to config
if (ChannelRouter.isUserActive(primaryUserId)) {
  console.log(`⏸️ [Observer] Deferring ${skill.name} — user task in progress.`);
  // Re-queue for 60 seconds later rather than firing now
  setTimeout(() => this.fireTrigger(skill, triggerType, intent, eventData), 60_000);
  return;
}
```

This prevents the race condition entirely — proactive triggers yield to user tasks.

---

## Bug 4 — MEDIUM: `fetch__fetch` hits a 403 with no URL fallback

### Evidence
```
[ExecutionActor] Running: fetch__fetch
  Args: {"url":"https://www.investopedia.com/..."}          ← line 47
[PluginRegistry] Tool fetch reported error: 403             ← line 57
[ExecutionActor] FAULT: fetch__fetch — [object Object]      ← line 60
CONSTRAINT: Tool returned isError flag.
FIX: Identify alternative tool or escalate.                 ← line 62
```

The agent correctly detects the 403, logs a CONSTRAINT, but then routes back to Supervisor
with no alternative URL in the context. The Supervisor replans but has no guidance on what
to try next, so it likely retries the same URL or stalls.

### Root Cause
The ExecutionActor's FAULT handler calls back to the Supervisor with `failureThesis` set,
but the Supervisor's prompt has no explicit instruction to substitute alternative research
sources when a URL is blocked. THEOREM_ERROR_TAXONOMY_01 (Class B — PERMANENT_EXTERNAL)
was written to handle this but is not yet wired into the ExecutionActor.

### Fix — `src/nodes/executionNodes.ts`

When a 403 is detected on a `fetch__fetch` call, inject alternative URLs into `failureThesis`
so the Supervisor has concrete alternatives to plan around:

```typescript
// In ExecutionActor's fault handler, after detecting isError on fetch__fetch:
const FETCH_ALTERNATIVES: Record<string, string[]> = {
  "investopedia.com": [
    "https://en.wikipedia.org/wiki/Algorithmic_trading",
    "https://finance.yahoo.com",
    "https://www.sec.gov/cgi-bin/browse-edgar"
  ],
  "default": [
    "https://en.wikipedia.org",
    "https://finance.yahoo.com",
    "https://www.reuters.com/finance"
  ]
};

function getAlternatives(url: string): string[] {
  const domain = Object.keys(FETCH_ALTERNATIVES).find(d => url.includes(d));
  return FETCH_ALTERNATIVES[domain || "default"];
}

// When tool returns 403:
if (result.includes("403") && currentTool === "fetch__fetch") {
  const alts = getAlternatives(currentArgs.url);
  failureThesis = `FETCH_BLOCKED_403: ${currentArgs.url} returned 403 (bot protection).
  Try these alternatives in order: ${alts.join(", ")}`;
}
```

Additionally, add a `THEOREM_WEB_SCRAPE_FALLBACK` entry to the existing
`THEOREM_WEB_SEARCH_01.md` skill so the agent knows at the reasoning level that
financial sites commonly block scrapers and Wikipedia/Yahoo Finance are reliable
public alternatives.

---

## Fix Priority and Order

| # | Bug | File | Effort | Impact |
|---|-----|------|--------|--------|
| 1 | `proactiveTrigger: null` not reset | `channelRouter.ts` | 3 lines | Eliminates line-12 DROP immediately |
| 2 | Concurrent task gate in Observer | `channelRouter.ts` + `observer.ts` | ~25 lines | Eliminates race condition |
| 3 | Proactive sessions tagged + filtered | `channelRouter.ts`, `memory.ts`, `cognitiveNodes.ts` | ~20 lines | Eliminates lines 33/49 confusion |
| 4 | SupervisorActor prompt labels history | `prompt.ts` | ~5 lines | Prevents future context confusion |
| 5 | fetch 403 fallback alternatives | `executionNodes.ts` | ~20 lines | Research tasks complete reliably |

Apply in this order — fix 1 alone will likely resolve 60% of the observed symptoms.

---

## Verification Tests

After each fix, run:
```powershell
npx tsc --noEmit                           # type-check
npx jest tests/fullCapability.test.ts      # existing suite must stay green
```

Add a targeted regression test in `tests/fullCapability.test.ts` (Section 15):
- Assert `proactiveTrigger: null` is in the ChannelRouter reset block (source scan)
- Assert `ChannelRouter.activeTasks` is a Set (structural check)
- Assert the FETCH_ALTERNATIVES map contains `investopedia.com` (source scan)
- Assert the memory logger separates proactive from user sessions (unit test)
