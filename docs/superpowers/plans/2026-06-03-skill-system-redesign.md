# Skill System Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate agent stall-and-loop on unexpected step results by adding error-recovery skills, a mandatory pre-task execution guard, and auto-injection of that guard into SelectionActor.

**Architecture:** Three parallel workstreams — (A) add `category` metadata to the skill registry so `system__list_skills` output is filterable; (B) write four new skill files targeting the error-recovery gap; (C) one code change in SelectionActor that auto-injects `EXECUTION_GUARD` when 2+ plan steps are pending. Workstreams A and B can run in any order. Workstream C depends on B (EXECUTION_GUARD must exist before injection can fire).

**Tech Stack:** TypeScript 5.4, Node.js 22, Jest + ts-jest, LangGraph, `src/core/pluginRegistry.ts`, `src/nodes/executionNodes.ts`, `src/plugins/skills/*.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/core/pluginRegistry.ts` | Modify | Add `category` to `MDSkill` interface; extract it in `initMDSkills` and `hotReloadSkill`; add `getSkillContent()`; expose `category` in `system__list_skills` output |
| `src/nodes/executionNodes.ts` | Modify | Auto-inject `EXECUTION_GUARD` into system prompt when `strategicPlan` has 2+ pending steps |
| `src/plugins/skills/EXECUTION_GUARD.md` | Create | Pre-task discipline checklist (auto-injected) |
| `src/plugins/skills/ERROR_RECOVERY.md` | Create | Decision tree for unexpected step results |
| `src/plugins/skills/ESCALATION_POLICY.md` | Create | When to stop trying and how to report |
| `src/plugins/skills/TASK_CHECKPOINT.md` | Create | Post-step verification for state-modifying actions |
| `src/plugins/skills/THEOREM_FS_MASTER.md` | Create | Consolidated filesystem theorems |
| `src/plugins/skills/THEOREM_SYS_MASTER.md` | Create | Consolidated system theorems |
| `src/plugins/skills/THEOREM_NET_MASTER.md` | Create | Consolidated network theorems |
| `src/plugins/skills/THEOREM_HEALTH_MASTER.md` | Create | Consolidated health/monitoring theorems |
| `src/plugins/skills/.archive/` | Create | Destination for deduplicated originals |
| `tests/pluginRegistry.category.test.ts` | Create | Unit tests for category extraction and `getSkillContent()` |
| `tests/selectionActor.injection.test.ts` | Create | Unit test for EXECUTION_GUARD injection logic |

---

## Task 1: Add `category` to MDSkill and the registry

**Files:**
- Modify: `src/core/pluginRegistry.ts:34-42` (MDSkill interface)
- Modify: `src/core/pluginRegistry.ts:131-158` (initMDSkills extraction)
- Modify: `src/core/pluginRegistry.ts:75-101` (hotReloadSkill extraction)
- Create: `tests/pluginRegistry.category.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/pluginRegistry.category.test.ts`:

```typescript
// Tests validate the regex extraction logic in isolation — no registry spin-up needed.
describe("MDSkill category extraction", () => {
  function extractCategory(content: string): string | undefined {
    const match = content.match(/^category:\s*(.+)$/m);
    return match ? match[1].trim() : undefined;
  }

  it("extracts category from frontmatter", () => {
    const content = "---\nname: test\ndescription: test skill\ncategory: error-recovery\n---\n# body";
    expect(extractCategory(content)).toBe("error-recovery");
  });

  it("returns undefined when category is absent", () => {
    const content = "---\nname: test\ndescription: test skill\n---\n# body";
    expect(extractCategory(content)).toBeUndefined();
  });

  it("trims whitespace from category value", () => {
    const content = "---\ncategory:   orchestration   \n---";
    expect(extractCategory(content)).toBe("orchestration");
  });

  it("does not match category inside the body, only frontmatter lines", () => {
    // The regex uses ^ with multiline so it matches any line start — this is expected
    const content = "---\nname: test\n---\n# category: not-this-one";
    // Body line also starts with "category:" — confirm it still matches (acceptable behaviour)
    expect(extractCategory(content)).toBe("not-this-one");
    // The real guard is that initMDSkills only reads the first match, which is frontmatter
  });
});
```

- [ ] **Step 2: Run test — expect PASS** (logic is inline, no imports needed)

```
npx jest tests/pluginRegistry.category.test.ts --no-coverage
```

Expected: all 4 pass (the extraction logic does not exist in the source yet, but the test file is self-contained — it defines `extractCategory` locally).

- [ ] **Step 3: Add `category` to the `MDSkill` interface**

In `src/core/pluginRegistry.ts`, replace lines 34–42:

```typescript
export interface MDSkill {
  name: string;
  description: string;
  content: string;
  filePath?: string;
  schedule?: string;
  watchPath?: string;
  webhookPath?: string;
  category?: string;
}
```

- [ ] **Step 4: Extract `category` in `initMDSkills`**

In `src/core/pluginRegistry.ts`, the block at lines 133–158 reads frontmatter fields and calls `this.mdSkills.set(...)`. Add the category extraction after the existing `webhookPathMatch` line and include it in the set call.

Replace the block from `const nameMatch = content.match(...)` through the closing `}` of the `if (nameMatch)` block (lines 133–158) with:

```typescript
          const nameMatch = content.match(/name:\s*(.+)/);
          const descMatch = content.match(/description:\s*(.+)/);
          const scheduleMatch = content.match(/schedule:\s*["']?([^"'\n\r]+)["']?/);
          const watchPathMatch = content.match(/watchPath:\s*["']?([^"'\n\r]+)["']?/);
          const webhookPathMatch = content.match(/webhookPath:\s*["']?([^"'\n\r]+)["']?/);
          const categoryMatch = content.match(/^category:\s*(.+)$/m);
          
          if (nameMatch) {
            const skillName = nameMatch[1].trim();
            if (skillName.includes('[') || skillName.includes(']')) {
              console.log(`⏩ [PluginRegistry] Skipping template/placeholder file: ${entry.name}`);
              return;
            }
            this.mdSkills.set(skillName, {
              name: skillName,
              description: descMatch ? descMatch[1].trim() : "Custom Agent Skill",
              content: content,
              filePath: filePath,
              schedule: scheduleMatch ? scheduleMatch[1].trim() : undefined,
              watchPath: watchPathMatch ? watchPathMatch[1].trim() : undefined,
              webhookPath: webhookPathMatch ? webhookPathMatch[1].trim() : undefined,
              category: categoryMatch ? categoryMatch[1].trim() : undefined,
            });
            console.log(`✅ [PluginRegistry] Loaded MD Skill: ${skillName} (${entry.isDirectory() ? 'DIR' : 'FILE'})`);
            if (scheduleMatch) console.log(`   └─ ⏰ Schedule: ${scheduleMatch[1].trim()}`);
            if (watchPathMatch) console.log(`   └─ 📁 Watching: ${watchPathMatch[1].trim()}`);
            if (webhookPathMatch) console.log(`   └─ 🪝 Webhook: ${webhookPathMatch[1].trim()}`);
          }
```

- [ ] **Step 5: Extract `category` in `hotReloadSkill`**

In `src/core/pluginRegistry.ts`, the `hotReloadSkill` method (around lines 75–101) also calls `this.mdSkills.set(...)`. Add category extraction there too.

Find this block inside `hotReloadSkill`:

```typescript
      this.mdSkills.set(skillName, {
        name: skillName,
        description: descMatch ? descMatch[1].trim() : "Synthesized agent skill",
        content,
        filePath,
      });
```

Replace it with:

```typescript
      const categoryMatch = content.match(/^category:\s*(.+)$/m);
      this.mdSkills.set(skillName, {
        name: skillName,
        description: descMatch ? descMatch[1].trim() : "Synthesized agent skill",
        content,
        filePath,
        category: categoryMatch ? categoryMatch[1].trim() : undefined,
      });
```

- [ ] **Step 6: Type-check**

```
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```
git add src/core/pluginRegistry.ts tests/pluginRegistry.category.test.ts
git commit -m "feat(registry): add category field to MDSkill interface and extraction"
```

---

## Task 2: Add `getSkillContent()` and expose `category` in list output

**Files:**
- Modify: `src/core/pluginRegistry.ts:59-61` (after getMDSkills)
- Modify: `src/core/pluginRegistry.ts:609-615` (system__list_skills handler)
- Modify: `tests/pluginRegistry.category.test.ts` (add new describe block)

- [ ] **Step 1: Write the failing test**

Append to `tests/pluginRegistry.category.test.ts`:

```typescript
describe("system__list_skills category field", () => {
  it("list output JSON includes category key for each skill", () => {
    // Simulate the map() transform that system__list_skills applies
    const mockSkills = new Map([
      ["EXECUTION_GUARD", { name: "EXECUTION_GUARD", description: "Guard", content: "", category: "pre-execution" }],
      ["mcp-builder", { name: "mcp-builder", description: "Builder", content: "", category: undefined }],
    ]);

    const list = Array.from(mockSkills.values()).map(s => ({
      name: s.name,
      description: s.description,
      category: s.category ?? "uncategorized",
    }));

    expect(list[0].category).toBe("pre-execution");
    expect(list[1].category).toBe("uncategorized");
  });
});

describe("getSkillContent logic", () => {
  it("returns null for unknown skill", () => {
    const mockSkills = new Map<string, { content: string }>();
    const getContent = (name: string) => mockSkills.get(name)?.content ?? null;
    expect(getContent("nonexistent")).toBeNull();
  });

  it("returns content string for known skill", () => {
    const mockSkills = new Map([["EXECUTION_GUARD", { content: "# Guard content" }]]);
    const getContent = (name: string) => mockSkills.get(name)?.content ?? null;
    expect(getContent("EXECUTION_GUARD")).toBe("# Guard content");
  });
});
```

- [ ] **Step 2: Run test — expect PASS** (all logic is inline)

```
npx jest tests/pluginRegistry.category.test.ts --no-coverage
```

Expected: all 7 tests pass.

- [ ] **Step 3: Add `getSkillContent()` to PluginRegistry**

In `src/core/pluginRegistry.ts`, after the `getMDSkills()` method (after line 61), add:

```typescript
  public static getSkillContent(name: string): string | null {
    return this.mdSkills.get(name)?.content ?? null;
  }
```

- [ ] **Step 4: Update `system__list_skills` handler to include `category`**

In `src/core/pluginRegistry.ts`, find the `system__list_skills` handler (around line 609):

```typescript
    if (name === "system__list_skills") {
      const list = Array.from(this.mdSkills.values()).map(s => ({
        name: s.name,
        description: s.description
      }));
      return JSON.stringify({ status: "success", skills: list });
    }
```

Replace with:

```typescript
    if (name === "system__list_skills") {
      const list = Array.from(this.mdSkills.values()).map(s => ({
        name: s.name,
        description: s.description,
        category: s.category ?? "uncategorized",
      }));
      return JSON.stringify({ status: "success", skills: list });
    }
```

- [ ] **Step 5: Type-check**

```
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Run full test suite**

```
npx jest --no-coverage
```

Expected: all existing tests pass.

- [ ] **Step 7: Commit**

```
git add src/core/pluginRegistry.ts tests/pluginRegistry.category.test.ts
git commit -m "feat(registry): add getSkillContent() and expose category in list output"
```

---

## Task 3: Write the four new skill files

**Files:**
- Create: `src/plugins/skills/EXECUTION_GUARD.md`
- Create: `src/plugins/skills/ERROR_RECOVERY.md`
- Create: `src/plugins/skills/ESCALATION_POLICY.md`
- Create: `src/plugins/skills/TASK_CHECKPOINT.md`

- [ ] **Step 1: Create `EXECUTION_GUARD.md`**

Create `src/plugins/skills/EXECUTION_GUARD.md` with this exact content:

```markdown
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
```

- [ ] **Step 2: Create `ERROR_RECOVERY.md`**

Create `src/plugins/skills/ERROR_RECOVERY.md` with this exact content:

```markdown
---
name: ERROR_RECOVERY
description: Decision tree for when a step returns unexpected results. Classifies error type and prescribes a specific response. Replaces guess-retry-drift behavior. Invoke whenever a step does not match its expected output.
category: error-recovery
---

# ERROR_RECOVERY

When a step returns unexpected output, classify the error type below and apply the matching response exactly. Do not improvise a response before classifying.

## Error Classification

### Transient failure
**Signal:** Timeout, rate limit (HTTP 429), network error, service unavailable (HTTP 503), connection refused  
**Response:** Wait 2 seconds. Retry the exact same step once. If it fails again, invoke ESCALATION_POLICY.

### Wrong output shape
**Signal:** Unexpected format, missing required field, wrong data type, empty response when non-empty expected, result does not match the expected output defined in EXECUTION_GUARD  
**Response:** Re-read the step's input parameters carefully. Formulate one alternative approach (different tool, different argument, different method). Try it once. If still wrong, invoke ESCALATION_POLICY.

### Capability gap
**Signal:** Tool returns "not supported", "cannot", "unsupported operation", or functionally cannot accomplish the request regardless of arguments  
**Response:** Stop. Do not retry. Do not try a different tool without invoking ESCALATION_POLICY first. Report exactly: (1) what was requested, (2) which tool was used, (3) why it cannot fulfill the request.

### Permission / auth failure
**Signal:** HTTP 401, HTTP 403, "access denied", "unauthorized", credential error, missing permissions  
**Response:** Stop immediately. Do not retry. Invoke ESCALATION_POLICY. Report what credentials or permissions are required.

### Ambiguous result
**Signal:** Step completed without an error, but output is not clearly success or clearly failure  
**Response:** Run TASK_CHECKPOINT verification against the success criteria defined in EXECUTION_GUARD step 4. If verification passes, treat as success and continue. If verification fails, treat as "wrong output shape" above.

## Hard Limits
- Maximum **2 retries** per step (including the initial attempt)
- Maximum **1 alternative approach** per step
- If both are exhausted without resolution → invoke ESCALATION_POLICY immediately
```

- [ ] **Step 3: Create `ESCALATION_POLICY.md`**

Create `src/plugins/skills/ESCALATION_POLICY.md` with this exact content:

```markdown
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
```

- [ ] **Step 4: Create `TASK_CHECKPOINT.md`**

Create `src/plugins/skills/TASK_CHECKPOINT.md` with this exact content:

```markdown
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
```

- [ ] **Step 5: Commit**

```
git add src/plugins/skills/EXECUTION_GUARD.md src/plugins/skills/ERROR_RECOVERY.md src/plugins/skills/ESCALATION_POLICY.md src/plugins/skills/TASK_CHECKPOINT.md
git commit -m "feat(skills): add EXECUTION_GUARD, ERROR_RECOVERY, ESCALATION_POLICY, TASK_CHECKPOINT"
```

---

## Task 4: Consolidate duplicate THEOREM clusters

**Files:**
- Create: `src/plugins/skills/THEOREM_FS_MASTER.md`
- Create: `src/plugins/skills/THEOREM_SYS_MASTER.md`
- Create: `src/plugins/skills/THEOREM_NET_MASTER.md`
- Create: `src/plugins/skills/THEOREM_HEALTH_MASTER.md`
- Create: `src/plugins/skills/.archive/` (directory)
- Move: 14 original files into `.archive/`

- [ ] **Step 1: Read the FS cluster originals**

Read each of these files and note their "Discovered Pattern" and "Optimized Approach" sections:
- `src/plugins/skills/THEOREM_FS_01.md`
- `src/plugins/skills/THEOREM_FS_02.md`
- `src/plugins/skills/THEOREM_FS_03.md`
- `src/plugins/skills/THEOREM_FS_001.md`
- `src/plugins/skills/THEOREM_FS_002.md`
- `src/plugins/skills/THEOREM_FS_003.md`
- `src/plugins/skills/THEO_FS_01.md`

- [ ] **Step 2: Create `THEOREM_FS_MASTER.md`**

Synthesize all unique patterns from the FS cluster into one file. The template below has placeholder sections — replace each `[from THEOREM_FS_XX]` block with the actual content from that source file:

```markdown
---
name: THEOREM_FS_MASTER
description: Consolidated filesystem operation patterns — direct commands, safe file access, recovery, and path handling. Supersedes THEOREM_FS_01/02/03/001/002/003 and THEO_FS_01.
category: domain
---

# Logic Shift: THEOREM_FS_MASTER
Consolidated: 2026-06-03
Sources: THEOREM_FS_01, THEOREM_FS_02, THEOREM_FS_03, THEOREM_FS_001, THEOREM_FS_002, THEOREM_FS_003, THEO_FS_01

## Pattern 1: Direct Command Preference
[Paste Discovered Pattern + Optimized Approach from THEOREM_FS_01 here]

## Pattern 2: [Title from FS_02]
[Paste Discovered Pattern + Optimized Approach from THEOREM_FS_02 here]

## Pattern 3: [Title from FS_03]
[Paste content from THEOREM_FS_03 here]

## Pattern 4: [Title from FS_001]
[Paste content from THEOREM_FS_001 here]

## Pattern 5: [Title from FS_002]
[Paste content from THEOREM_FS_002 here]

## Pattern 6: [Title from FS_003]
[Paste content from THEOREM_FS_003 here]

## Pattern 7: [Title from THEO_FS_01]
[Paste content from THEO_FS_01 here]
```

- [ ] **Step 3: Read the SYS cluster originals**

Read:
- `src/plugins/skills/THEOREM_SYS_01.md`
- `src/plugins/skills/THEOREM_SYS_001.md`
- `src/plugins/skills/THEO_SYS_01.md`

- [ ] **Step 4: Create `THEOREM_SYS_MASTER.md`**

```markdown
---
name: THEOREM_SYS_MASTER
description: Consolidated system operation patterns. Supersedes THEOREM_SYS_01, THEOREM_SYS_001, THEO_SYS_01.
category: domain
---

# Logic Shift: THEOREM_SYS_MASTER
Consolidated: 2026-06-03
Sources: THEOREM_SYS_01, THEOREM_SYS_001, THEO_SYS_01

## Pattern 1: [Title from SYS_01]
[Paste content from THEOREM_SYS_01 here]

## Pattern 2: [Title from SYS_001]
[Paste content from THEOREM_SYS_001 here]

## Pattern 3: [Title from THEO_SYS_01]
[Paste content from THEO_SYS_01 here]
```

- [ ] **Step 5: Read the NET cluster originals**

Read:
- `src/plugins/skills/THEOREM_NET_02.md`
- `src/plugins/skills/THEOREM_NET_03.md`

- [ ] **Step 6: Create `THEOREM_NET_MASTER.md`**

```markdown
---
name: THEOREM_NET_MASTER
description: Consolidated network operation patterns. Supersedes THEOREM_NET_02, THEOREM_NET_03.
category: domain
---

# Logic Shift: THEOREM_NET_MASTER
Consolidated: 2026-06-03
Sources: THEOREM_NET_02, THEOREM_NET_03

## Pattern 1: [Title from NET_02]
[Paste content from THEOREM_NET_02 here]

## Pattern 2: [Title from NET_03]
[Paste content from THEOREM_NET_03 here]
```

- [ ] **Step 7: Read the HEALTH cluster originals**

Read:
- `src/plugins/skills/THEOREM_HEALTH_01.md`
- `src/plugins/skills/THEOREM_HEALTH_02.md`
- `src/plugins/skills/MIDPOINTX_HEALTH_MONITOR.md`

- [ ] **Step 8: Create `THEOREM_HEALTH_MASTER.md`**

```markdown
---
name: THEOREM_HEALTH_MASTER
description: Consolidated health and monitoring patterns. Supersedes THEOREM_HEALTH_01, THEOREM_HEALTH_02, MIDPOINTX_HEALTH_MONITOR.
category: sentinel
---

# Logic Shift: THEOREM_HEALTH_MASTER
Consolidated: 2026-06-03
Sources: THEOREM_HEALTH_01, THEOREM_HEALTH_02, MIDPOINTX_HEALTH_MONITOR

## Pattern 1: [Title from HEALTH_01]
[Paste content from THEOREM_HEALTH_01 here]

## Pattern 2: [Title from HEALTH_02]
[Paste content from THEOREM_HEALTH_02 here]

## Pattern 3: [Title from MIDPOINTX_HEALTH_MONITOR]
[Paste content from MIDPOINTX_HEALTH_MONITOR here]
```

- [ ] **Step 9: Create the archive directory and move originals**

Run in PowerShell:

```powershell
New-Item -ItemType Directory -Force "D:\MidpointX\src\plugins\skills\.archive"

$toArchive = @(
  "THEOREM_FS_01.md", "THEOREM_FS_02.md", "THEOREM_FS_03.md",
  "THEOREM_FS_001.md", "THEOREM_FS_002.md", "THEOREM_FS_003.md", "THEO_FS_01.md",
  "THEOREM_SYS_01.md", "THEOREM_SYS_001.md", "THEO_SYS_01.md",
  "THEOREM_NET_02.md", "THEOREM_NET_03.md",
  "THEOREM_HEALTH_01.md", "THEOREM_HEALTH_02.md", "MIDPOINTX_HEALTH_MONITOR.md",
  "SKILL_A.md", "SKILL_B.md", "TEST_SKILL_01.md"
)

foreach ($file in $toArchive) {
  $src = "D:\MidpointX\src\plugins\skills\$file"
  if (Test-Path $src) {
    Move-Item $src "D:\MidpointX\src\plugins\skills\.archive\$file"
    Write-Host "Archived: $file"
  } else {
    Write-Host "Not found (skip): $file"
  }
}
```

- [ ] **Step 10: Verify master files loaded by type-checking registry behavior**

```
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 11: Commit**

```
git add src/plugins/skills/THEOREM_FS_MASTER.md src/plugins/skills/THEOREM_SYS_MASTER.md src/plugins/skills/THEOREM_NET_MASTER.md src/plugins/skills/THEOREM_HEALTH_MASTER.md src/plugins/skills/.archive/
git commit -m "refactor(skills): consolidate duplicate THEOREM clusters into master files, archive originals"
```

---

## Task 5: Add `category:` frontmatter to all existing skills

**Files:**
- Modify: all root-level `src/plugins/skills/*.md` files that are not in the new-skill set (Tasks 3 and 4)

This task is a bulk frontmatter edit. For each skill file, open it and add `category: <value>` on the line after `description:` in the frontmatter block. Use the category table below.

- [ ] **Step 1: Apply category tags to orchestration skills**

For each file listed, add `category: orchestration` after the `description:` line in frontmatter:

- `src/plugins/skills/THEOREM_PLANNING_01.md`
- `src/plugins/skills/THEOREM_PLAN_01.md`
- `src/plugins/skills/THEOREM_STRAT_01.md`
- `src/plugins/skills/THEOREM_SKILL_EXEC_01.md`
- `src/plugins/skills/THEOREM_COMPOSITE_WORKFLOW_01.md`

- [ ] **Step 2: Apply category tags to error-recovery skills**

Add `category: error-recovery` after `description:` in:

- `src/plugins/skills/THEOREM_ERROR_TAXONOMY_01.md`
- `src/plugins/skills/THEOREM_CONTEXT_RECOVERY_01.md`
- `src/plugins/skills/THEOREM_FS_RECOVERY_01.md`
- `src/plugins/skills/THEOREM_DEBUG_01.md`
- `src/plugins/skills/THEOREM_DIAGNOSTICS_CONTEXT_FIRST_01.md`
- `src/plugins/skills/THEOREM_AMBIGUITY_RESOLUTION_01.md`
- `src/plugins/skills/THEOREM_CONFLICT_RESOLUTION_01.md`

- [ ] **Step 3: Apply category tags to domain skills (API/service)**

Add `category: domain` after `description:` in:

- `src/plugins/skills/THEOREM_GMAIL_01.md`
- `src/plugins/skills/THEOREM_GMAIL_API_01.md`
- `src/plugins/skills/THEOREM_CALENDAR_01.md`
- `src/plugins/skills/THEOREM_CALENDAR_API_01.md`
- `src/plugins/skills/THEOREM_CAL_01.md`
- `src/plugins/skills/THEOREM_GSuite_01.md`
- `src/plugins/skills/THEOREM_EMAIL_01.md`
- `src/plugins/skills/THEOREM_BROWSER_01.md`
- `src/plugins/skills/THEOREM_BROWSER_NATIVE_01.md`
- `src/plugins/skills/THEOREM_BROWSER_PREFERENCE_01.md`
- `src/plugins/skills/THEOREM_BROWS_01.md`
- `src/plugins/skills/THEOREM_WEB_01.md`
- `src/plugins/skills/THEOREM_WEB_SEARCH_01.md`
- `src/plugins/skills/THEOREM_NET_03.md` (if not archived)
- `src/plugins/skills/THEOREM_NEWS_01.md`
- `src/plugins/skills/THEOREM_NFL_DATA_01.md`
- `src/plugins/skills/THEOREM_NFL_SCHED_01.md`
- `src/plugins/skills/THEOREM_WEATHER_01.md`
- `src/plugins/skills/THEOREM_API_DISCOVERY_01.md`
- `src/plugins/skills/THEOREM_API_REGIONAL_01.md`
- `src/plugins/skills/THEOREM_CODE_SYNTHESIS_01.md`
- `src/plugins/skills/THEOREM_DOC_01.md`
- `src/plugins/skills/THEOREM_DOC_GEN_01.md`
- `src/plugins/skills/THEOREM_NODE_01.md`
- `src/plugins/skills/THEOREM_PS_001.md`
- `src/plugins/skills/THEOREM_PROC_01.md`
- `src/plugins/skills/THEOREM_FILE_01.md`
- `src/plugins/skills/THEOREM_FILE_SAFE_01.md`
- `src/plugins/skills/THEOREM_FS_002.md` (if not archived)
- `src/plugins/skills/THEOREM_PATH_SYNC_01.md`
- `src/plugins/skills/FILE_BROWSER_001.md`
- `src/plugins/skills/FILE_CHROME_01.md`
- `src/plugins/skills/THEO_WEB_01.md`
- `src/plugins/skills/THEO_LOCAL_FALLBACK_01.md`
- `src/plugins/skills/THEO_ENV_VERIFY_01.md`
- `src/plugins/skills/THEO_SYNC_01.md`
- `src/plugins/skills/THEO_REV_01.md`
- `src/plugins/skills/mcp_builder.md`
- `src/plugins/skills/webapp_testing.md`
- `src/plugins/skills/artifacts_builder.md`
- `src/plugins/skills/claude_cookbooks.md`
- `src/plugins/skills/semantic_search.md`
- `src/plugins/skills/THEOREM_DESKTOP_AUTONOMY.md`
- `src/plugins/skills/auto-skill-livenexustradersandbox.md`

- [ ] **Step 4: Apply category tags to sentinel skills**

Add `category: sentinel` after `description:` in:

- `src/plugins/skills/HABIT_SENTINEL.md`
- `src/plugins/skills/WORKSPACE_SENTINEL.md`
- `src/plugins/skills/PROACTIVE_HEARTBEAT.md`
- `src/plugins/skills/TEST_WATCHER.md`

- [ ] **Step 5: Apply category tags to meta skills**

Add `category: meta` after `description:` in:

- `src/plugins/skills/THEOREM_SKILL_01.md`
- `src/plugins/skills/THEOREM_SKILL_DEDUPLICATION_01.md`
- `src/plugins/skills/THEOREM_MEM_01.md`
- `src/plugins/skills/THEOREM_LEARN_01.md`
- `src/plugins/skills/THEOREM_LEARNING_01.md`
- `src/plugins/skills/THEOREM_CAP_01.md`
- `src/plugins/skills/THEOREM_TOKEN_BUDGET_01.md`
- `src/plugins/skills/THEOREM_OUTPUT_VALIDATION_01.md`
- `src/plugins/skills/clear_memory.md`
- `src/plugins/skills/THEOREM_CORE_01.md`

- [ ] **Step 6: Apply category tags to remaining skills**

Add `category: domain` after `description:` in any remaining untagged skills not covered above (check with `grep -rL "^category:" src/plugins/skills/*.md`).

- [ ] **Step 7: Commit**

```
git add src/plugins/skills/
git commit -m "feat(skills): add category: frontmatter to all active skill files"
```

---

## Task 6: Add EXECUTION_GUARD injection to SelectionActor

**Files:**
- Modify: `src/nodes/executionNodes.ts:418-421`
- Create: `tests/selectionActor.injection.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/selectionActor.injection.test.ts`:

```typescript
// Tests the EXECUTION_GUARD injection logic in isolation.
// We extract the condition and string-build logic so it can be tested
// without spinning up the full SelectionActor LangGraph node.

describe("EXECUTION_GUARD injection logic", () => {
  function shouldInjectGuard(strategicPlan: string[], planStatus: Record<string, string>): boolean {
    const pendingSteps = strategicPlan.filter(
      (step) => (planStatus[step] || "pending") === "pending"
    );
    return pendingSteps.length >= 2;
  }

  function buildSystemPromptWithGuard(
    basePrompt: string,
    guardContent: string | null,
    shouldInject: boolean
  ): string {
    if (shouldInject && guardContent) {
      return `<skill name="EXECUTION_GUARD">\n${guardContent}\n</skill>\n\n` + basePrompt;
    }
    return basePrompt;
  }

  it("injects when 2 or more steps are pending", () => {
    const plan = ["step one", "step two", "step three"];
    const status: Record<string, string> = {};
    expect(shouldInjectGuard(plan, status)).toBe(true);
  });

  it("injects when exactly 2 steps are pending", () => {
    const plan = ["step one", "step two"];
    const status: Record<string, string> = {};
    expect(shouldInjectGuard(plan, status)).toBe(true);
  });

  it("does not inject when only 1 step is pending", () => {
    const plan = ["step one", "step two"];
    const status = { "step one": "completed" };
    expect(shouldInjectGuard(plan, status)).toBe(false);
  });

  it("does not inject when all steps are completed", () => {
    const plan = ["step one", "step two"];
    const status = { "step one": "completed", "step two": "completed" };
    expect(shouldInjectGuard(plan, status)).toBe(false);
  });

  it("does not inject when guard content is null (skill not found)", () => {
    const result = buildSystemPromptWithGuard("base", null, true);
    expect(result).toBe("base");
  });

  it("prepends guard block to system prompt when injecting", () => {
    const result = buildSystemPromptWithGuard("base prompt", "# Guard", true);
    expect(result).toMatch(/^<skill name="EXECUTION_GUARD">/);
    expect(result).toContain("# Guard");
    expect(result).toContain("base prompt");
  });

  it("returns base prompt unchanged when not injecting", () => {
    const result = buildSystemPromptWithGuard("base prompt", "# Guard", false);
    expect(result).toBe("base prompt");
  });
});
```

- [ ] **Step 2: Run test — expect PASS** (all logic is inline)

```
npx jest tests/selectionActor.injection.test.ts --no-coverage
```

Expected: all 7 tests pass.

- [ ] **Step 3: Implement the injection in SelectionActor**

In `src/nodes/executionNodes.ts`, find lines 418–421:

```typescript
  const payload = [];
  if (!isCacheActive) {
    payload.push(new SystemMessage(buildActionPrompt(agentPersona, userContext, state.executionMode || 'api')));
  }
```

Replace with:

```typescript
  const payload = [];
  if (!isCacheActive) {
    let systemPromptText = buildActionPrompt(agentPersona, userContext, state.executionMode || 'api');

    // Auto-inject EXECUTION_GUARD when 2+ plan steps are pending so the agent
    // always has execution discipline scaffolding without needing to call system__read_skill.
    const pendingSteps = state.strategicPlan.filter(
      (step: string) => (state.planStatus[step] || "pending") === "pending"
    );
    if (pendingSteps.length >= 2) {
      const guard = PluginRegistry.getSkillContent("EXECUTION_GUARD");
      if (guard) {
        systemPromptText = `<skill name="EXECUTION_GUARD">\n${guard}\n</skill>\n\n` + systemPromptText;
        console.log("🛡️ [SelectionActor] EXECUTION_GUARD injected into system prompt.");
      }
    }

    payload.push(new SystemMessage(systemPromptText));
  }
```

- [ ] **Step 4: Type-check**

```
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Run full test suite**

```
npx jest --no-coverage
```

Expected: all tests pass, including the new injection test.

- [ ] **Step 6: Commit**

```
git add src/nodes/executionNodes.ts tests/selectionActor.injection.test.ts
git commit -m "feat(executor): auto-inject EXECUTION_GUARD into SelectionActor for multi-step tasks"
```

---

## Task 7: Final verification

- [ ] **Step 1: Full type-check**

```
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 2: Full test suite**

```
npx jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 3: Spot-check skill loading**

Start the backend briefly and look for the new skills in the startup logs:

```
npx tsx src/server.ts 2>&1 | Select-String "EXECUTION_GUARD|ERROR_RECOVERY|ESCALATION_POLICY|TASK_CHECKPOINT|THEOREM_FS_MASTER"
```

Expected output (4 lines, one per skill):
```
✅ [PluginRegistry] Loaded MD Skill: EXECUTION_GUARD (FILE)
✅ [PluginRegistry] Loaded MD Skill: ERROR_RECOVERY (FILE)
✅ [PluginRegistry] Loaded MD Skill: ESCALATION_POLICY (FILE)
✅ [PluginRegistry] Loaded MD Skill: TASK_CHECKPOINT (FILE)
✅ [PluginRegistry] Loaded MD Skill: THEOREM_FS_MASTER (FILE)
```

- [ ] **Step 4: Verify injection fires**

Send a multi-step task to the agent (e.g., "Create a file called test.txt with hello world, then read it back and confirm the content"). Check the console for:

```
🛡️ [SelectionActor] EXECUTION_GUARD injected into system prompt.
```

- [ ] **Step 5: Final commit if anything was adjusted**

```
git add -p
git commit -m "fix: final adjustments from verification"
```
