---
name: state-field
description: Add a new field to MidpointXState in src/core/state.ts with the correct Annotation reducer, TypeScript type, default value, and section placement. Args: <fieldName> <description-of-what-it-stores>
---

You are adding a new field to the MidpointX LangGraph state definition in `src/core/state.ts`.

## Step 1 — Read the current state file

Read `src/core/state.ts` in full before writing anything. Understand the existing sections and field patterns.

## Step 2 — Choose the correct reducer

Ask yourself ONE question: **How does this field change across graph iterations?**

| Behavior | Reducer | Example fields |
|---|---|---|
| Overwritten each turn — only the latest value matters | `(x, y) => y` | `userIntent`, `pendingAction`, `isTaskComplete` |
| Array that grows across turns — all values accumulate | `(x, y) => [...x, ...y]` | `outputArtifacts`, `abandonedPlans` |
| Array that grows but must be unique | `(x, y) => [...new Set([...x, ...y])]` | `citedSkills`, `highFidelityContext` |
| Numeric counter that accumulates across all nodes | `(x, y) => x + y` | `totalInputTokens`, `replanCount` |

**Default to replace (`(x, y) => y`) unless the field clearly accumulates.** A wrong accumulate reducer causes unbounded array growth; a wrong sum reducer causes state corruption.

## Step 3 — Choose the TypeScript type

Rules:
- NEVER use `any` unless you are annotating a field that wraps an external library type that has no TypeScript definition available in the project
- For union literals: use `'VALUE_A' | 'VALUE_B' | null` — not `string`
- For structured objects: define an inline type or import an existing schema type from this file
- For nullable fields: always include `| null` in the type and `default: () => null`

## Step 4 — Choose the correct section

Place the new field in the section whose comment best describes its role:

| Section comment | Fields that belong here |
|---|---|
| `// Ingress` | User-supplied inputs, task IDs, trigger metadata |
| `// Cognitive Layer Outputs` | Outputs of ReflectionActor, AnalysisActor, LearnActor |
| `// Strategic Planning (Phase 2)` | Plan arrays, step status tracking |
| `// Safeguard Layer` | Boolean flags from JustificationProtocol, VerificationNode, RegressionTester |
| `// Execution Layer` | Action history, task completion, final outputs |
| `// Diagnostics` | Token counts, turn counters, performance metrics |
| `// Desktop OS State` | Screenshot buffers, mouse position, visual output |
| `// Security & Human Doorbell` | Approval flags, pending actions, severity levels |
| `// Artifacts & File Delivery` | Output files, structured results |
| `// Intent Preservation & Context Compression` | Summaries, compacted history |
| `// Re-planning & Security` | Replan count, failure thesis, abandoned plans |
| `// Sandbox Compiler Feedback` | Compiler output, recompile flags |
| `// Swarm Routing & Multi-Agent Execution State` | Active worker, sub-goals, worker outputs |
| `// Mid-Task Skill Synthesis` | Skill gap queries, synthesized skill IDs |

## Step 5 — Write the field

Add the field using this exact format:
```typescript
fieldName: Annotation<TypeHere>({ reducer: (x: TypeHere, y: TypeHere) => <reducer>, default: () => <default> }),
```

## Step 6 — Verify

Run `npx tsc --noEmit` and confirm no errors before reporting success.

## Hard rules
- NEVER use `Annotation<any>` unless you can cite which external library type is missing
- NEVER add a field without a `default` — missing defaults cause LangGraph to throw at graph initialization
- NEVER use `x + y` (sum) for string fields — use `(x, y) => y` (replace)
- After adding, confirm the field name to the user and remind them to update any node that should read or write it
