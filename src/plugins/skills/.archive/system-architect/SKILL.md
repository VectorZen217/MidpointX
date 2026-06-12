---
name: system-architect
description: Use when a problem statement or implementation plan exists and needs to be translated into a concrete architecture — component boundaries, interfaces, data models, file structure, and tech decisions. Bridges the gap between "what to build" and "how to build it."
---

# System Architect

## Overview

A plan tells you what to build. Architecture tells you how the pieces fit together so the plan can be executed without constant backtracking.

**Core principle:** Define boundaries and interfaces before writing code. Code written without architecture is a prototype. Prototypes rot.

**Announce at start:** "I'm using the system-architect skill to design the architecture."

**Prerequisite:** A Problem Statement (from `problem-reasoning`) or an Implementation Plan (from `writing-plans`) must exist before architecture work begins.

## The Iron Law

```
NO FILE CREATION. NO IMPLEMENTATION.
Until component boundaries, interfaces, and data models are defined and documented.
```

## When to Use

Use this skill when:
- Starting a new module, service, or subsystem (> 3 files)
- Integrating two systems that have never communicated before
- Refactoring a component that has grown beyond a single responsibility
- A plan exists but the file structure and interfaces haven't been decided yet
- Multiple implementation approaches are viable and a decision must be made

Skip when:
- Task is a single-file, single-function change with no new interfaces
- Architecture was already decided in a prior session (check `.architect/memory/SIGNALS.json`)

---

## Phase 1: Understand the Landscape

Before designing anything, understand what already exists.

### 1a. Run the Dependency Audit
```bash
node src/plugins/skills/system-architect/scripts/map_dependencies.cjs
```
Read the output. Identify which existing modules the new work will touch.

### 1b. Check the Architecture Memory
```bash
cat .architect/memory/SIGNALS.json 2>/dev/null || echo "No prior decisions recorded."
```
Check for prior decisions that constrain this work. Do not re-litigate closed decisions without cause.

### 1c. Read Key Files
For each module the new work touches:
- Read the module's entry point
- Note its public interface (exported functions/types)
- Note its dependencies

Do not read implementation details — only interfaces.

---

## Phase 2: Identify Components

Break the solution into components. A component is a unit with:
- A single clear responsibility
- A defined public interface (what it exposes to callers)
- A defined private boundary (what callers cannot see)

**Produce a component table:**

| Component | Responsibility | Inputs | Outputs | Depends On |
|-----------|---------------|--------|---------|------------|
| [name] | [one sentence] | [types] | [types] | [other components] |

**Rules:**
- If a component has more than one sentence of responsibility, split it.
- If two components share internal state directly, they should be merged or mediated by a third.
- Components that change together should be in the same module. Components that change independently should be in different modules.
- Prefer thin interfaces. A component exposing 10 methods is a design smell.

---

## Phase 3: Define Interfaces

For each component, define its public interface in TypeScript (or the project's type system).

Write the interface before writing any implementation:

```typescript
// Example — define what callers see, not how it works
interface PluginResult {
  status: "success" | "error";
  output: string;
  errors?: string;
}

interface PluginExecutor {
  execute(toolName: string, args: Record<string, unknown>): Promise<PluginResult>;
  isRegistered(toolName: string): boolean;
}
```

**Rules:**
- Use explicit types. No `any` in interface definitions.
- Return types must be explicit (no inferred `void | Promise<unknown>`).
- Error cases must be represented in the type (not just thrown).
- If an interface requires more than 5 methods, it has too many responsibilities.

---

## Phase 4: Design the Data Model

Define the data structures that flow through the system.

For each significant data entity:
- Name it precisely
- Define its fields with types
- Document invariants (what must always be true about this data)
- Document how it transforms as it moves through components

```typescript
// Example
interface ActionRecord {
  tool: string;          // registered tool name — must exist in registry
  args: Record<string, unknown>;
  result: string;        // JSON-serialized PluginResult
  timestamp: number;     // Unix ms
}
// Invariant: result is always valid JSON. Never store raw error objects.
```

---

## Phase 5: Map the File Structure

Produce the exact file layout before touching the filesystem:

```
src/
  nodes/
    executionNodes.ts       MODIFY — add escape hatch in catch block
  core/
    pluginRegistry.ts       MODIFY — improve "not found" error message
  plugins/
    skills/
      new-skill/
        SKILL.md            CREATE — skill definition
        scripts/
          helper.cjs        CREATE — supporting script
```

**Rules:**
- Every file must have a stated purpose.
- Test files must be named alongside their subject (`foo.ts` → `foo.test.ts`).
- No `util.ts`, `helpers.ts`, or `misc.ts` — name files after what they contain.
- If a file's description is "various things", redesign.

---

## Phase 6: Record Tech Decisions

For each non-obvious decision (library choice, pattern choice, trade-off made), record:

```markdown
### Decision: [Short title]
**Option chosen:** [what was chosen]
**Alternatives considered:** [what was rejected]
**Rationale:** [why this over the alternatives]
**Consequences:** [what this makes easier / harder in future]
```

Log finalized decisions:
```bash
node src/plugins/skills/system-architect/scripts/log_pattern.cjs \
  --decision "[title]" \
  --rationale "[rationale]"
```

---

## Phase 7: Visualize (Optional but Recommended)

For systems with 4+ components, generate a diagram:

```bash
node src/plugins/skills/system-architect/scripts/draw_mermaid.cjs \
  --type C4 \
  --components "[component list]"
```

For data flow, produce a sequence diagram showing the happy path and the primary error path.

---

## Output: Architecture Document

Produce `docs/architecture/[feature-name].md` containing:

1. Component table (Phase 2)
2. Interface definitions (Phase 3) — code blocks
3. Data model (Phase 4) — code blocks
4. File structure (Phase 5)
5. Tech decisions (Phase 6)
6. Diagram link or inline Mermaid (Phase 7 if done)

---

## Handoff

After the architecture document is complete:

> "Architecture complete. Interfaces and file structure defined. Proceeding to `writing-plans` to produce the task-by-task implementation plan."

- **NEXT SKILL:** Use `writing-plans` — the file structure and interfaces from this document become the scaffolding for the plan's tasks.
- The plan's tasks should map one-to-one with components or interface definitions, not with arbitrary lines of code.

## Red Flags — Return to Architecture Before Coding

- A function needs to import from 4+ modules → component boundaries are wrong
- Two components need to share mutable state → mediator or merger needed
- An interface needs to change halfway through implementation → Phase 3 was incomplete
- A file is growing past ~300 lines → single-responsibility was violated; split
- "I'll figure out the interface as I go" → stop; complete Phase 3 first
