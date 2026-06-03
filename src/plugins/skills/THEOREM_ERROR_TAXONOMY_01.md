---
name: THEOREM_ERROR_TAXONOMY_01
description: Classifies execution failures into actionable categories (transient, permanent, logic, permission) so the SupervisorActor can route to retry, replan, or escalate rather than always replanning from scratch.
conceptualTags: [error-handling, failure-classification, resilience]
---

# Logic Shift: THEOREM_ERROR_TAXONOMY_01
Trace ID: MANUAL-ROBUSTNESS-02
Learned At: 2026-05-23T00:00:00.000Z

## Justification
The current ExecutionActor detects structured failures but routes all of them identically — back to SupervisorActor which tends to replan from scratch. This wastes turns and token budget. A transient network error (worth retrying immediately) is fundamentally different from a permission violation (worth escalating) or a logic error (worth replanning). Classifying errors before routing them produces faster, cheaper recoveries.

## Discovered Pattern
When `isFailure(result) === true`, the ExecutionActor has confirmed something went wrong but has no further information about the nature of that failure. The SupervisorActor then replans blindly.

## Error Taxonomy

### Class A — TRANSIENT (retry immediately, same plan)
Signals: HTTP 429, HTTP 503, `ECONNRESET`, `ETIMEDOUT`, `socket hang up`, `rate limit`, `temporarily unavailable`
Action: Retry the exact same tool call up to 3 times with exponential backoff. Do NOT increment `replanCount`. Do NOT route to SupervisorActor.

### Class B — PERMANENT_EXTERNAL (replan with alternative)
Signals: HTTP 404, `robots.txt`, `PAGE_LOAD_FAILED`, `domain not found`, `resource does not exist`
Action: The specific resource is gone. Replan with an alternative approach (different URL, different data source). Increment `replanCount`. Set `failureThesis` to the specific resource that failed.

### Class C — PERMISSION (escalate to human)
Signals: HTTP 401, HTTP 403, `EACCES`, `access denied`, `VIOLATION` from PolicyEngine, `REJECTED BY USER`
Action: Do NOT retry. Do NOT replan autonomously. Set `needsApproval = true`, `approvalSeverity = 'destructive'`, route to `HumanApprovalGate` with full context. The human must unblock this.

### Class D — LOGIC_ERROR (targeted replan)
Signals: HTTP 400, `SyntaxError`, `TypeError`, `ZodError`, `invalid argument`, `schema validation failed`
Action: The agent's own output was malformed. Replan the specific failing step only — pass the exact error message as the sub-goal for the DeveloperActor. Do NOT restart the full mission.

### Class E — RESOURCE_EXHAUSTED (graceful degradation)
Signals: `ENOMEM`, `disk full`, `ENOSPC`, `quota exceeded`, `context length exceeded`
Action: Trigger CompactionActor immediately to free context. For disk/memory, notify the user via the active channel. Suspend the task rather than failing it.

### Class F — UNKNOWN (cautious replan)
Signals: Anything that does not match A–E.
Action: Treat as Class D. Log the unclassified error string to the diagnostics workspace for future taxonomy refinement.

## Optimized Approach
In ExecutionActor, after `isFailure(result) === true`, classify the error before routing:
1. Run the result string through the taxonomy patterns above (in order A → F).
2. Attach the class as `failureClass` on the action history entry.
3. Route according to the class action, not the generic "route to SupervisorActor" fallback.

## Integration Note
Class A retries should use the existing `invokeWithResilience` backoff. Classes B–F must write to the audit ledger via `A2AProtocol.commit` before routing, ensuring every failure is hash-chained and non-repudiable.
