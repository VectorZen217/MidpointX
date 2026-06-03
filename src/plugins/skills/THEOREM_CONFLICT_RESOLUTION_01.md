---
name: THEOREM_CONFLICT_RESOLUTION_01
description: Tiebreaker protocol when swarm workers reach contradictory conclusions. Uses the expert-tier LLM as arbiter and ensures the resolution is audited and explained.
category: error-recovery
conceptualTags: [swarm, conflict-resolution, multi-agent]
---

# Logic Shift: THEOREM_CONFLICT_RESOLUTION_01
Trace ID: MANUAL-ROBUSTNESS-10
Learned At: 2026-05-23T00:00:00.000Z

## Justification
When ResearcherActor and DeveloperActor (or any two workers) reach contradictory conclusions — "use library X" vs. "library X has a CVE", "endpoint returns JSON" vs. "endpoint returns XML" — the SupervisorActor currently has no tiebreaker logic and either picks the most recent output or replans from scratch. Both outcomes are suboptimal: the agent may proceed with bad information, or waste turns redoing work. An explicit arbitration step resolves conflicts in one additional turn rather than triggering an unbounded replan cycle.

## Discovered Pattern
`workerOutput` from two sequential workers contains mutually exclusive claims about the same subject (an API, a file, a technology choice, a system behavior). SupervisorActor detects inconsistency but has no resolution path.

## Conflict Detection
SupervisorActor should flag a conflict when `workerOutput` contains any of these signals:
- Explicit contradiction: "X is Y" from one worker, "X is not Y" from another
- Opposing recommendations for the same decision point
- A worker explicitly writes: `"WARNING: Previous worker's finding may be incorrect"`
- Security/CVE information that contradicts a technology recommendation

## Resolution Protocol

### Step 1 — Freeze and Document
1. Set `activeWorker = "none"` — halt swarm routing.
2. Write both conflicting outputs to `highFidelityContext` for the arbitration step.
3. Log: `"CONFLICT_DETECTED: [Worker A] vs [Worker B] on subject: [topic]"`

### Step 2 — Arbitration via Expert-Tier LLM
1. Invoke `LLMFactory.getModel({ tier: "expert", temperature: 0 })` directly from SupervisorActor.
2. Prompt structure:
```
You are a neutral technical arbiter. Two agents reached contradictory conclusions.
Worker A ([name]) concluded: [exact finding]
Worker B ([name]) concluded: [exact finding]
Original task: [userIntent]

Determine which finding is correct, or synthesize a reconciled position.
Output: { winner: "A" | "B" | "reconciled", rationale: string, resolvedFinding: string }
```
3. The arbiter's decision is authoritative. Do not re-invoke either worker to "check again."

### Step 3 — Apply and Proceed
1. Write `resolvedFinding` as the new `workerOutput`.
2. Write the arbitration rationale to the audit ledger.
3. Set `activeWorker` to whichever worker should act next based on the resolved finding.
4. Log: `"CONFLICT_RESOLVED: [winner/reconciled]. Rationale: [rationale]"`

### Step 4 — Learn from the Conflict
1. After task completion, if the conflict involved factual information (API behavior, library status), create a targeted skill amendment using THEOREM_SKILL_DEDUPLICATION_01's amendment process to record the correct information for future tasks.

## Escalation to Human
If the expert-tier arbitration returns confidence below 0.6 (ambiguous rationale) OR the conflict involves a security decision (CVE, auth, data handling), escalate to the human rather than auto-resolving:
- Message: `"⚖️ Conflicting information found. I need your input before proceeding. [Worker A finding] vs [Worker B finding]. Which should I trust?"`
