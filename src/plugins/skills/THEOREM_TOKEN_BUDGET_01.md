---
name: THEOREM_TOKEN_BUDGET_01
description: Governs when to compact vs. prune vs. summarize context, and defines what must be preserved verbatim vs. safely condensed. Prevents blind compaction from destroying critical execution state.
category: meta
conceptualTags: [token-management, compaction, context]
---

# Logic Shift: THEOREM_TOKEN_BUDGET_01
Trace ID: MANUAL-ROBUSTNESS-05
Learned At: 2026-05-23T00:00:00.000Z

## Justification
The CompactionActor runs after every SupervisorActor cycle, but it has no explicit policy on what to keep vs. what to compress. Over a long mission, blind compaction can summarize away a critical tool result (e.g., an exact error message or file path) that the agent needs 10 turns later. Conversely, keeping everything verbatim exhausts the context window. An explicit budget policy prevents both failure modes.

## Discovered Pattern
On long multi-step missions, the agent either: (a) runs out of context and crashes mid-task, or (b) over-compacts and loses the precise details needed for subsequent steps — leading to ghost replanning where the same work is redone.

## Token Budget Tiers

### Tier 1 — Green (< 40% context used)
No compaction needed. All history is preserved verbatim. Full `actionHistory` and `reflectionTrace` are available.

### Tier 2 — Yellow (40–70% context used)
Trigger PruningActor with soft compression:
- Summarize `reflectionTrace` to 2 sentences.
- Summarize `analysisResult` to 3 bullet points.
- Preserve ALL tool results verbatim (file contents, error messages, URLs, API responses).
- Preserve ALL `outputArtifacts` entries verbatim.
- Compress `historySummary` by merging completed plan steps into a single "Completed: X, Y, Z" line.

### Tier 3 — Orange (70–85% context used)
Trigger CompactionActor with aggressive compression:
- Reduce `actionHistory` to the last 5 entries verbatim + a summary of all prior entries.
- Reduce `strategicPlan` to only the remaining pending steps.
- Drop all `visualBuffer` frames older than the current step.
- Drop `reflectionTrace` entirely (it has served its purpose).
- Keep `failureThesis`, `replanCount`, and `latestAuditHash` always verbatim.

### Tier 4 — Red (> 85% context used)
EMERGENCY compaction. Immediately:
1. Write the full current state to persistence via `PersistenceFactory.getAdapter().appendLog("emergency_compact", taskId, JSON.stringify(state))`.
2. Reduce context to: `userIntent`, `strategicPlan` (remaining steps only), last tool result, `failureThesis`, and `latestAuditHash`.
3. Notify user: `"⚠️ Context limit approaching. State saved to persistence. Continuing with compressed context."`

## Always-Preserve List (never compress, never drop)
- `userIntent` — the original mission statement
- `latestAuditHash` — required for hash chain continuity
- `failureThesis` — active failure context
- `replanCount` — loop prevention counter
- `pendingAction` — any action awaiting human approval
- `approvalStatus` — current approval gate state
- Last tool result that produced an artifact or error
- Any content explicitly tagged `HIGH_FIDELITY` in `highFidelityContext`

## Always-Droppable List (safe to summarize or remove)
- `visualBuffer` older than current execution step
- `reflectionTrace` after the AnalysisActor has consumed it
- Intermediate `workerOutput` from completed swarm steps
- Redundant `historySummary` entries covering already-completed plan steps
