---
name: ESCALATION_POLICY
description: Defines when to stop trying and surface to the user. Invoked by ERROR_RECOVERY when retry and fallback are exhausted, or on capability/auth failures. Eliminates vague "should I continue?" questions.
category: error-recovery
---

# ESCALATION_POLICY

When ERROR_RECOVERY's limits are reached, stop all tool use and report to the user. Never ask vague questions.

## Stop Conditions
Stop immediately and report when any of these are true:
- 2 retries + 1 alternative approach have been exhausted on any single step
- A capability gap was encountered (no retries were applicable)
- An auth/permission failure was encountered (no retries were applicable)
- Continuing the next step would require an irreversible action on state that has not been verified

## Required Report Format
Always report these four things, in this order:

1. **What the step was supposed to do** — one sentence from your original plan (from EXECUTION_GUARD step 2)
2. **What actually happened** — the exact error message, unexpected output, or failure result
3. **What was tried** — list every retry and alternative approach attempted, with results
4. **Current system state** — which steps completed successfully and what they produced; which steps did not run yet; any partial changes already made to files, APIs, or config

## Forbidden Patterns
Never ask:
- "Should I continue?"
- "Do you want me to try a different approach?"
- "Is this correct?"
- "What should I do?"

Always report specific state. The user decides what happens next.

## Partial Completion Rule
If 50% or more of the task's steps completed successfully before failure:
- State explicitly which steps completed and what each produced
- State which step failed and why
- Do not silently roll back completed steps unless the user asks
