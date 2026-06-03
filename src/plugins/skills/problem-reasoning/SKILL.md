---
name: problem-reasoning
description: Use BEFORE planning or coding when given any task with more than one step or any ambiguity. Deeply analyzes a problem to produce a clear statement of intent, constraints, unknowns, and success criteria before any plan or code is written.
---

# Problem Reasoning

## Overview

Planning and building the wrong thing is the most expensive mistake possible. This skill ensures the agent fully understands the problem before committing to any approach.

**Core principle:** Understand before acting. A plan built on a misunderstood problem is worse than no plan.

**Announce at start:** "I'm using the problem-reasoning skill to analyze this task before planning."

## The Iron Law

```
NO PLAN. NO CODE. NO TOOL CALLS.
Until you can state the goal, constraints, and success criteria in your own words
and have confirmed them with the user if any ambiguity exists.
```

## When to Use

Use this skill FIRST when:
- The task is described in more than one sentence
- The task involves modifying existing code or systems
- The task has dependencies on external services, data, or users
- The request uses vague terms ("improve", "fix", "update", "make it work")
- The scope is unclear (how much? which parts? what counts as done?)
- Multiple approaches could satisfy the request

Skip only when:
- Task is a single, atomic, fully-specified operation (e.g., "rename variable X to Y in file F")
- You have already completed this analysis in this session

## The Five-Phase Analysis

Work through each phase sequentially. Do not skip phases.

---

### Phase 1: Restate the Goal

Write the goal in your own words as a single clear sentence.

**Template:**
> "The goal is to [outcome], so that [who benefits] can [what they can now do]."

**Test:** Could a developer with no context read this and know exactly what to build?

If no → the goal is underspecified. Surface the ambiguity before continuing.

**Common failure modes:**
- Restating the request verbatim (you haven't processed it)
- Adding scope that wasn't asked for
- Missing the actual motivation (the "so that" clause matters)

---

### Phase 2: Identify Requirements

Split into two lists:

**Explicit requirements** — directly stated in the task description.
List each one. Assign a short ID (R1, R2, ...).

**Implicit requirements** — not stated but necessary for the solution to be correct or acceptable.
Think about: correctness, safety, performance, compatibility, maintainability, user expectations.

**Examples of implicit requirements that are often missed:**
- Must not break existing behavior
- Must handle error cases gracefully
- Must work with the current tech stack (no new deps without approval)
- Must be reversible / not destructive
- Must respect Directive 0 (never touch OS files)

---

### Phase 3: Map Unknowns and Ambiguities

List everything you don't know that could affect the solution. For each unknown:

| Unknown | Impact if wrong | Resolve how? |
|---------|----------------|--------------|
| [question] | [what breaks] | [ask user / inspect code / check docs] |

**Resolve what you can** by inspecting the codebase, reading config files, checking existing skills.

**Escalate to the user** anything that cannot be resolved independently and would materially change the approach.

Do not proceed past Phase 3 if unresolved unknowns would cause a fundamentally wrong plan.

---

### Phase 4: Identify Constraints

Document hard limits the solution must respect:

**Technical constraints:**
- Language / framework versions in use (check `package.json`, `tsconfig.json`, etc.)
- Existing patterns in the codebase (do not introduce a new pattern without reason)
- Performance requirements (latency, memory, throughput)
- Security requirements (Directive 2: keep data local, no secret leaks)
- Safety requirements (Directive 0: never modify OS files or delete data without explicit path)

**Scope constraints:**
- What is explicitly OUT of scope for this task?
- What adjacent problems should NOT be "fixed while we're here"?

**Process constraints:**
- Must pass `npx tsc --noEmit` before committing
- Must pass `npm test` before committing
- Changes must be surgical — avoid unnecessary refactoring

---

### Phase 5: Define Done

Write the exact success criteria. These become the verification checklist at the end.

**Each criterion must be:**
- Observable (you can check it with a command or inspection)
- Binary (pass/fail, not "better than before")
- Specific (not "it works" — what specifically works?)

**Template:**
```
Done when:
- [ ] [specific observable outcome 1]
- [ ] [specific observable outcome 2]
- [ ] npx tsc --noEmit exits 0
- [ ] npm test exits 0 with N passing
- [ ] [no regression in X behavior]
```

---

### Phase 6: Identify Risks

List the top 3–5 ways this task could go wrong. For each:

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| [what could fail] | H/M/L | [how to avoid or recover] |

**Common risks:**
- Changing a shared utility breaks unrelated callers
- Assuming a file/API exists without verifying
- Fixing a symptom instead of root cause
- Introducing a new dependency that conflicts
- Partial completion leaves system in broken state

---

## Output Format

After completing all six phases, produce a **Problem Statement** document:

```markdown
## Problem Statement: [Task Name]

**Goal:** [one sentence from Phase 1]

**Requirements:**
- R1: [explicit requirement]
- R2: [explicit requirement]
- I1: [implicit requirement]
- I2: [implicit requirement]

**Unresolved Unknowns:** [list, or "None — all resolved"]

**Constraints:**
- [constraint 1]
- [constraint 2]

**Done When:**
- [ ] [criterion 1]
- [ ] [criterion 2]

**Top Risks:**
| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| ...  | ...        | ...        |
```

Save to `docs/problems/[task-slug].md` if the task is multi-session.
For single-session tasks, present inline and confirm with user before proceeding.

---

## Handoff

After producing the Problem Statement:

1. If any unknowns were escalated: **wait for user input** before proceeding.
2. If no unknowns: announce readiness:
   > "Problem analysis complete. Proceeding to plan with `writing-plans` skill."
   - **NEXT SKILL:** Use `writing-plans` to produce the implementation plan.

## Red Flags — Stop and Return to Phase Analysis

- You are about to write code and cannot state the success criteria → return to Phase 5
- You realize mid-plan that a requirement was missed → return to Phase 2
- A risk you didn't anticipate emerges during implementation → return to Phase 6, update mitigations
- The user says "that's not what I meant" → return to Phase 1
