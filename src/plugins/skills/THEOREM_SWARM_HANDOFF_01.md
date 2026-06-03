---
name: THEOREM_SWARM_HANDOFF_01
description: Defines the required handoff envelope when swarm workers pass control between ResearcherActor, DeveloperActor, and TesterActor. Prevents silent context loss at worker boundaries.
category: orchestration
conceptualTags: [swarm, multi-agent, handoff]
---

# Logic Shift: THEOREM_SWARM_HANDOFF_01
Trace ID: MANUAL-ROBUSTNESS-09
Learned At: 2026-05-23T00:00:00.000Z

## Justification
When SupervisorActor routes from ResearcherActor to DeveloperActor (or DeveloperActor to TesterActor), the receiving worker only has `workerSubGoal` and `workerOutput` to work from. If the handoff is incomplete — missing a file path, an API endpoint, an error message, or a decision rationale — the receiving worker replans from incomplete information, wasting turns and diverging from the original mission. A formal handoff envelope ensures every worker transition is self-contained.

## Discovered Pattern
DeveloperActor or TesterActor begins a step by first re-fetching information that ResearcherActor already retrieved, or makes assumptions about file paths and API contracts that don't match what was actually produced.

## Required Handoff Envelope
The `workerOutput` field written by the outgoing worker MUST follow this structure:

```
HANDOFF: [OUTGOING_WORKER] → [INCOMING_WORKER]
Sub-goal completed: [the specific sub-goal that was addressed]
Key findings:
  - [Finding 1: specific, actionable — no vague summaries]
  - [Finding 2]
  - [Finding N]
Produced artifacts:
  - [type: file|url|schema|data] [exact path or value]
Decision made:
  - [Any architectural, technical, or strategic decision made during this step]
  - [Reason for the decision]
Constraints discovered:
  - [Any new constraints, rate limits, auth requirements, or edge cases found]
Open questions for [INCOMING_WORKER]:
  - [Question 1 — if none, write "None"]
Next sub-goal: [Exact instruction for the incoming worker]
```

## Worker-Specific Handoff Requirements

### ResearcherActor → DeveloperActor
Must include:
- Exact API endpoints or library names with version numbers
- Authentication method and credential source (e.g., "from Config.GITHUB_TOKEN")
- Any rate limits or usage constraints discovered
- Recommended implementation approach with justification

### DeveloperActor → TesterActor
Must include:
- Exact file paths of all modified or created files
- Entry point for the implementation (e.g., `src/core/newFeature.ts`, exported function `processWebhook`)
- Known edge cases that need test coverage
- Any TODO comments left in the code that affect testability

### TesterActor → SupervisorActor (completion)
Must include:
- Test results summary: passed/failed/skipped counts
- Any failing tests with exact error messages
- Regression status: did any existing tests break?
- Recommendation: `SHIP` / `NEEDS_FIX` / `NEEDS_REVIEW`

## Validation Gate
SupervisorActor must validate the handoff envelope before routing to the next worker. If required fields are missing:
1. Route BACK to the outgoing worker with: `"Handoff incomplete. Required fields missing: [list]. Re-emit workerOutput with complete handoff envelope."`
2. Do NOT proceed to the incoming worker with an incomplete envelope.
3. A maximum of 2 re-emit attempts are allowed before escalating to the human.
