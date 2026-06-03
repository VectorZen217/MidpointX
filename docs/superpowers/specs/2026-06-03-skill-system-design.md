# MidpointX Skill System Redesign
**Date:** 2026-06-03  
**Status:** Approved  
**Author:** Randy (via brainstorming session)

---

## Problem Statement

The MidpointX agent creates task lists correctly and executes happy-path workflows reliably. However, when any step in a 2–5 step task returns an unexpected result, the agent enters a guess-retry-drift-give-up loop. It has no structured decision framework for classifying what went wrong or choosing a recovery strategy. Compounding this, the skill library has grown to 128 files with no taxonomy — `system__list_skills` returns an unscannable flat dump, making relevant skills effectively undiscoverable.

**Failure chain:**
1. Step N returns unexpected result
2. Agent retries same step OR improvises alternate approach
3. Neither works reliably; agent drifts off course
4. Agent gives up or asks user a vague question

**Root causes:**
- No `error-recovery` skills exist at all
- No mandatory pre-task execution discipline skill
- No escalation policy (when to stop trying vs. surface to user)
- No mid-task checkpoint pattern
- 128 flat skills including ~15 duplicates — discoverability is poor

---

## Solution Overview

Three parallel workstreams:

1. **Taxonomy + cleanup** — add `category:` frontmatter to all skills, consolidate duplicate THEOREM clusters
2. **New skills** — four targeted skills filling the error-recovery and pre-execution gaps
3. **One code change** — `SelectionActor` injects `EXECUTION_GUARD` automatically when 2+ tasks are pending

---

## Section 1: Skill Taxonomy & Cleanup

### Frontmatter Addition

Add a `category:` field to every skill's frontmatter. The registry already extracts arbitrary frontmatter fields — no code changes needed to support this.

**Categories:**

| Category | Purpose |
|---|---|
| `orchestration` | Multi-step task flow and lifecycle management |
| `error-recovery` | Decision framework for unexpected results and failures |
| `pre-execution` | Must-read before starting a task type |
| `domain` | How to operate a specific tool, API, or service |
| `sentinel` | Proactive scheduled monitoring tasks |
| `meta` | Skills about the skill system itself |

### Deduplication

Consolidate these clusters into single authoritative files. Archive originals to `src/plugins/skills/.archive/`:

| Cluster | Files to merge | Target file |
|---|---|---|
| Filesystem ops | THEOREM_FS_01, FS_02, FS_03, FS_001, FS_002, FS_003, THEO_FS_01 | `THEOREM_FS_MASTER.md` |
| System ops | THEO_SYS_01, THEOREM_SYS_01, THEOREM_SYS_001 | `THEOREM_SYS_MASTER.md` |
| Network ops | THEOREM_NET_02, THEOREM_NET_03 | `THEOREM_NET_MASTER.md` |
| Health monitoring | THEOREM_HEALTH_01, THEOREM_HEALTH_02, MIDPOINTX_HEALTH_MONITOR | `THEOREM_HEALTH_MASTER.md` |
| Placeholders/tests | SKILL_A.md, SKILL_B.md, TEST_SKILL_01.md | Archive only (no replacement) |

**Target:** ~128 files → ~95 files. No knowledge lost.

### Updated `system__list_skills` Output

After tagging, expose `category` in the list output so the agent can filter by type when deciding what to read:

```json
[
  { "name": "EXECUTION_GUARD", "description": "...", "category": "pre-execution" },
  { "name": "ERROR_RECOVERY", "description": "...", "category": "error-recovery" },
  ...
]
```

This requires a one-line change to the `system__list_skills` handler in `pluginRegistry.ts`.

---

## Section 2: New Skills

### 2.1 `EXECUTION_GUARD` (category: pre-execution)

**Purpose:** Mandatory pre-task ritual enforcing execution discipline before any multi-step task begins.

**Content structure:**
- Confirm the goal in one sentence before touching any tool
- List all steps explicitly with expected output for each
- Identify which steps are irreversible (file deletion, API mutations, config changes)
- Define success criteria for the overall task
- Note: this skill is auto-injected by SelectionActor — do not call `system__read_skill` for it manually

**Trigger:** Auto-injected by SelectionActor when `state.tasks` has 2+ pending items.

---

### 2.2 `ERROR_RECOVERY` (category: error-recovery)

**Purpose:** Decision tree for when a step returns something unexpected. Replaces guess-retry-drift behavior with a structured response.

**Decision tree:**

| Error type | Signal | Response |
|---|---|---|
| Transient failure | Timeout, rate limit, network error | Wait 2s, retry once. If fails again → escalate |
| Wrong output shape | Unexpected format, missing field, wrong type | Re-read step inputs, try one alternative approach |
| Capability gap | Tool cannot accomplish what was requested | Stop. Report exactly what was attempted and why it failed |
| Permission/auth failure | 401, 403, credential error | Stop immediately. Report what credentials are needed |
| Ambiguous result | Not clearly failure, not clearly success | Verify against EXECUTION_GUARD success criteria before continuing |

**Hard rule:** Maximum 2 retries per step. Maximum 1 alternative approach. If both fail → invoke ESCALATION_POLICY.

---

### 2.3 `ESCALATION_POLICY` (category: error-recovery)

**Purpose:** Defines exactly when to stop trying and surface to the user. Eliminates vague "should I continue?" questions.

**Rules:**
- After 2 retries + 1 fallback on the same step: stop
- Report: (1) what the step was supposed to do, (2) what actually happened, (3) what was tried, (4) current system state
- Never ask "should I continue?" — always report specific state and let the user decide next action
- If the task has completed 50%+ of steps before failure: report partial completion explicitly, do not roll back silently

---

### 2.4 `TASK_CHECKPOINT` (category: orchestration)

**Purpose:** After any step that modifies state, verify the expected outcome before marking done and proceeding. Prevents cascading failures from an undetected broken step.

**Pattern:**
1. After state-modifying step completes, run a verification action (read the file back, check the API response, query the DB)
2. Compare result against the success criteria defined in EXECUTION_GUARD
3. If verified → mark step done, proceed
4. If not verified → invoke ERROR_RECOVERY before continuing

**Scope:** Required for steps that write files, call mutating APIs, modify config, or delete/move data. Read-only steps do not require checkpoint.

---

## Section 3: SelectionActor Injection

### Mechanism

In `src/nodes/executionNodes.ts`, within `SelectionActor`'s system prompt assembly, add:

```typescript
// Auto-inject EXECUTION_GUARD when a multi-step task is detected
if ((state.tasks?.filter(t => t.status === 'pending').length ?? 0) >= 2) {
  const guard = PluginRegistry.getSkillContent('EXECUTION_GUARD');
  if (guard) {
    systemPrompt = `<skill name="EXECUTION_GUARD">\n${guard}\n</skill>\n\n` + systemPrompt;
  }
}
```

### Supporting Change: `PluginRegistry.getSkillContent()`

Expose a synchronous getter in `src/core/pluginRegistry.ts` so `SelectionActor` can read skill content without going through the tool dispatch path:

```typescript
public static getSkillContent(name: string): string | null {
  return this.mdSkills.get(name)?.content ?? null;
}
```

### Stats Hook

Every auto-injection increments `EXECUTION_GUARD`'s `usageCount` in `stats.json`. A declining success rate signals the skill content needs updating.

### Scope Boundary

Only `EXECUTION_GUARD` is auto-injected. All other skills remain agent-driven via `system__read_skill`. This keeps the system predictable — one guaranteed injection, not a framework that decides what the agent should know.

---

## Files Changed

| File | Change |
|---|---|
| `src/plugins/skills/*.md` (all) | Add `category:` to frontmatter |
| `src/plugins/skills/THEOREM_FS_MASTER.md` | New — consolidated filesystem theorems |
| `src/plugins/skills/THEOREM_SYS_MASTER.md` | New — consolidated system theorems |
| `src/plugins/skills/THEOREM_NET_MASTER.md` | New — consolidated network theorems |
| `src/plugins/skills/THEOREM_HEALTH_MASTER.md` | New — consolidated health theorems |
| `src/plugins/skills/EXECUTION_GUARD.md` | New — pre-execution discipline |
| `src/plugins/skills/ERROR_RECOVERY.md` | New — unexpected result decision tree |
| `src/plugins/skills/ESCALATION_POLICY.md` | New — when to stop trying |
| `src/plugins/skills/TASK_CHECKPOINT.md` | New — post-step verification pattern |
| `src/plugins/skills/.archive/` | Move deduplicated originals here |
| `src/core/pluginRegistry.ts` | Add `getSkillContent()` method; expose `category` in list output |
| `src/nodes/executionNodes.ts` | Add EXECUTION_GUARD injection in SelectionActor |

---

## Success Criteria

- Agent completes 3–5 step tasks without stalling when a step returns unexpected output
- `system__list_skills` output is filterable by category
- No duplicate THEOREM clusters in the active skills directory
- `EXECUTION_GUARD` injection fires on every multi-step task (verifiable via stats.json)
- `ERROR_RECOVERY` and `ESCALATION_POLICY` are invoked by agent during unexpected-result scenarios (verifiable via stats.json)
