---
name: TASK_CHECKPOINT
description: Post-step verification for state-modifying actions. After any step that writes, deletes, mutates, or sends, verify the expected outcome before marking done and proceeding to the next step.
category: orchestration
---

# TASK_CHECKPOINT

After any state-modifying step completes, run this verification before marking it done. Do not cascade to the next step on an unverified result.

## When to Run This
Run after steps that:
- Write or create files
- Delete or move files
- Call mutating APIs (POST, PUT, PATCH, DELETE)
- Modify configuration
- Send messages, emails, or notifications
- Change any shared or persistent state

Do NOT run after read-only steps (GET requests, file reads, searches). It is unnecessary overhead.

## Verification Steps

**1. Run a verification action** appropriate to what was modified:
- File written → read the file back (`filesystem__read_text_file`) and confirm the content matches intent
- API call → inspect the response status code and body, or query the resource (GET) to confirm the change
- Config modified → read config back and confirm the new value is present
- Message sent → confirm the send response status is 2xx

**2. Compare against success criteria** — the one-sentence definition from EXECUTION_GUARD step 4 and the expected output for this specific step from EXECUTION_GUARD step 2.

**3. Decision:**
- If verified → mark step done. Proceed to the next step.
- If not verified → do NOT mark done. Do NOT proceed. Invoke ERROR_RECOVERY with error type "wrong output shape."

## Core Principle
Never cascade. A broken step 2 makes steps 3 through N wrong by definition. Catching failure here costs one verification call. Missing it costs the entire remaining plan.
