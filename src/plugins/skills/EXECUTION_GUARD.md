---
name: EXECUTION_GUARD
description: Mandatory pre-task discipline for any multi-step task. Confirm goal, enumerate steps with expected outputs, flag irreversible actions, define done. Auto-injected by SelectionActor when 2+ plan steps are pending — do not call system__read_skill for this manually.
category: pre-execution
---

# EXECUTION_GUARD

Before executing any task with 2 or more steps, complete this checklist in order. Do not skip steps. Do not begin tool use until step 4 is done.

## 1. Confirm the Goal
State the user's goal in one sentence. If you cannot state it unambiguously, stop and ask for clarification before touching any tool.

## 2. List All Steps with Expected Outputs
Write every step explicitly, in order. For each step, state what the expected output is. If you cannot predict the output, state what you will verify instead.

Example:
- Step 1: Read config.json → expect JSON object with `host` and `port` fields
- Step 2: Write updated config.json → expect file exists with new port value
- Step 3: Verify by reading config.json back → confirm new port value is present

## 3. Flag Irreversible Actions
Mark any step that writes or deletes files, calls a mutating API (POST/PUT/PATCH/DELETE), modifies config, sends messages, or changes shared state. These steps require TASK_CHECKPOINT verification after completion.

## 4. Define Done
State the success criteria for the overall task in one sentence. This is what you verify at the very end.

## 5. Proceed
Only now may you begin executing. If any step returns something unexpected, stop and consult ERROR_RECOVERY before continuing.
