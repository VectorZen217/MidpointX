---
name: strategic-planner
description: Implements a Plan-and-Execute architecture for complex, multi-step tasks. Use when a task requires more than 3 distinct operations or has high ambiguity.
---

# Strategic Planner

> **⚠️ INVOCATION GUARD — READ BEFORE ACTING**
>
> This is a **Markdown reasoning guide**, NOT a callable MCP tool.
>
> - ❌ DO NOT call `strategic_planner__generate_plan` or any `strategic_planner__*` variant — these tools do not exist in the registry and will always return TOOL_NOT_FOUND.
> - ✅ DO load this skill with `system__read_skill`, then **apply its instructions yourself** using registered tools (e.g., `execute_system_command`, `file__write`, etc.).
>
> If you attempted to call a `strategic_planner__*` tool and got TOOL_NOT_FOUND: stop, read this document, and reason through the plan steps directly. Do not retry the function call.

This skill is the **orchestrator** for complex tasks. It selects and sequences the specialized skills below to move from a raw task description to working, verified software.

## Full Pipeline

Each stage has a dedicated skill. Work through them in order. Do not skip stages.

```
Task Description
      │
      ▼
┌─────────────────────┐
│  problem-reasoning  │  Understand goal, constraints, unknowns, done criteria
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  system-architect   │  Component boundaries, interfaces, data models, file map
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  writing-plans      │  Task-by-task implementation plan with TDD steps
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  executing-plans    │  Execute plan tasks sequentially with checkpoints
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  dev-build-loop     │  compile→error→fix→test until green
└─────────┬───────────┘
          │  (if bugs arise at any stage)
          ├──────────────────────────────►  systematic-debugging
          │
          ▼
┌──────────────────────────────┐
│  verification-before-         │  Evidence-based confirmation of done criteria
│  completion                   │
└─────────┬────────────────────┘
          │
          ▼
┌─────────────────────┐
│  finishing-a-        │  Merge, PR, or cleanup
│  development-branch  │
└─────────────────────┘
```

## Stage Rules

**problem-reasoning** — mandatory for any task with ambiguity or scope > 1 file. Produces a Problem Statement with explicit done criteria. Do not plan without it.

**system-architect** — mandatory when the task creates or modifies > 3 files or introduces a new interface. Skip only for isolated single-file changes.

**writing-plans** — always produces `PLAN.md` with bite-sized TDD steps. The plan references the architecture doc's file structure and interfaces.

**executing-plans** — follow the plan exactly. Do not improvise outside the plan scope. If a step is wrong, update `PLAN.md` first, then continue.

**dev-build-loop** — entered whenever `npx tsc --noEmit` or `npm test` is not clean. One error class per iteration. Do not claim green without running the commands.

**systematic-debugging** — entered whenever a bug's root cause is not immediately obvious from the error message. Do not guess. Do not fix without root cause.

**verification-before-completion** — run against the done criteria from `problem-reasoning`. If any criterion cannot be verified with a command, go back and verify it.

## Re-planning

If a step fails and the fix changes scope:
1. Update `PLAN.md` with the revised approach
2. Note the change and why (this feeds the Reflect & Learn step)
3. Ask the user only if the scope change affects the Problem Statement's done criteria

If a step fails and the fix is within scope:
1. Use `systematic-debugging` to find root cause
2. Apply fix
3. Continue with `dev-build-loop`
4. Do not ask the user — handle it

## Pipeline Stage Failure Rules

When any pipeline stage fails, the only valid recovery action is a **corrected retry of that stage**. These actions are always wrong:

- ❌ Writing a failure description as content into the output system (e.g., adding a "pipeline failed" note as a NotebookLM source, committing an error log to the repo, appending a status message to the target document). This pollutes the output artifact with debugging noise and signals giving up, not recovering.
- ❌ Skipping the failed stage and continuing to the next one. A stage that didn't complete leaves the pipeline in a partially-valid state that later stages will build on incorrectly.
- ❌ Declaring the task complete because earlier stages succeeded. Partial success is not success.

**Correct recovery sequence for a failed stage:**

1. Read the full error message — do not act on a summary or assumption
2. Identify the error class (URL scheme, rate limit, missing arg, auth failure, etc.)
3. Correct the specific argument or condition that caused the failure
4. Retry **that stage only** with the corrected call
5. If the retry fails again with a different error, repeat from step 1
6. If the retry fails with the same error after two attempts, escalate via `system__request_replanning` with a thesis that names the exact error, the arg that was corrected, and what was tried

**Stage output is preserved across retries.** A successful stage does not need to be re-run because a later stage failed. Resume from the failed stage, not from the beginning.

## Reflect & Learn

When the task is complete, log outcome to `.memory/` using the self-improvement signal schema:
- What went wrong and why
- Which stage caught it
- What theorem or skill update would prevent it next time
- Propose a Logic Shift if a superior pattern was discovered
