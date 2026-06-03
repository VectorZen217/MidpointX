---
name: THEOREM_CONTEXT_RECOVERY_01
description: Recovery procedure when session context is corrupted, over-compressed, or a MemorySaver checkpoint is invalid. Re-anchors the agent from the last valid audit hash without losing the mission.
conceptualTags: [context-recovery, resilience, session]
---

# Logic Shift: THEOREM_CONTEXT_RECOVERY_01
Trace ID: MANUAL-ROBUSTNESS-06
Learned At: 2026-05-23T00:00:00.000Z

## Justification
LangGraph's MemorySaver checkpointer can produce an invalid or over-compressed state if: (a) the process crashes mid-compaction, (b) a Tier 4 emergency compact truncates critical fields, or (c) a hot-reload of the graph changes the state schema between checkpoints. Without a recovery procedure, the agent either loops (replanning the same step) or crashes with a schema mismatch. The A2A audit ledger provides a reliable recovery anchor.

## Discovered Pattern
The agent begins a turn with empty or contradictory state — `userIntent` is blank, `strategicPlan` is empty, or `replanCount` is unexpectedly 0 after many turns. This indicates checkpoint corruption.

## Corruption Detection Signals
Treat state as potentially corrupted if ANY of the following are true on session resume:
- `userIntent === ""` but `internalTurns > 0`
- `strategicPlan.length === 0` but `isTaskComplete === false`
- `latestAuditHash === "0"` but `actionHistory.length > 0`
- `replanCount` decreased compared to the previous checkpoint
- A `ZodError` is thrown when parsing checkpoint state

## Recovery Procedure

### Phase 1 — Detect and Halt
1. On session start, validate state against the detection signals above.
2. If any signal is true: do NOT proceed to ReflectionActor. Set a recovery flag.
3. Log: `"STATE_RECOVERY: Corruption detected. Initiating recovery from audit ledger."`

### Phase 2 — Audit Ledger Replay
1. Load the full audit ledger via `PersistenceFactory.getAdapter().readLogs("audit", taskId)`.
2. Walk entries from newest to oldest. Find the last entry where `node === "SupervisorActor"` or `node === "ExecutionActor"` with a non-empty `commit.finalOutcome` or `commit.strategicPlan`.
3. Extract: `userIntent`, `strategicPlan`, `replanCount`, and the last confirmed `latestAuditHash` from that entry.

### Phase 3 — Emergency Compact Restore
1. Check persistence for an emergency compact log: `readLogs("emergency_compact", taskId)`.
2. If found, merge the saved state with the audit-recovered fields. Audit ledger values take precedence.

### Phase 4 — Minimal State Reconstruction
Rebuild the minimum viable state:
```
userIntent:     [from audit]
strategicPlan:  [from audit, pending steps only]
replanCount:    [from audit]
latestAuditHash: [from audit]
historySummary: "RECOVERED: Session resumed from audit ledger after checkpoint corruption."
isTaskComplete: false
```

### Phase 5 — Resume
1. Route directly to SupervisorActor with the reconstructed state.
2. Notify user: `"🔄 Session state recovered from audit ledger. Resuming from last confirmed checkpoint."`
3. Log recovery event to the audit ledger itself.

## Prevention
- Always write an emergency compact entry (see THEOREM_TOKEN_BUDGET_01 Tier 4) before any state transition that modifies more than 5 fields at once.
- Run `A2AProtocol.commit()` on every SupervisorActor cycle, not just on skill-gap and tool-execution transitions.
