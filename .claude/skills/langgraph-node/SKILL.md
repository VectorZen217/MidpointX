---
name: langgraph-node
description: Scaffold a new LangGraph node for MidpointX — creates the typed node function in the correct file and registers it in graph.ts with edge stubs. Args: <NodeName> <category: cognitive|execution|safeguard|swarm>
---

You are scaffolding a new LangGraph node for MidpointX. The graph (`src/core/graph.ts`) uses an imperative builder cast to `any`, so TypeScript won't catch node-wiring errors at compile time — precision here matters.

## Steps

### 1. Determine the target file from the category arg

| Category | Target file |
|---|---|
| `cognitive` | `src/nodes/cognitiveNodes.ts` |
| `execution` | `src/nodes/executionNodes.ts` |
| `safeguard` | `src/nodes/safeguardNodes.ts` |
| `swarm` | `src/nodes/swarmWorkerNodes.ts` |

### 2. Read the target node file
Read the full target file to understand imports, how state is consumed, and the return pattern. Every node returns a **partial state update** (a `Partial<typeof MidpointXState.State>` object), not the full state.

### 3. Write the node function

Append the new node function to the target file. Follow this exact signature:

```typescript
export async function <nodeName>Node(state: typeof MidpointXState.State): Promise<Partial<typeof MidpointXState.State>> {
  console.log("🔷 [<NodeName>] <one-line description>");
  // TODO: implement
  return {};
}
```

Rules:
- NEVER use `any` in the function signature — always type state as `typeof MidpointXState.State`
- The return type is always `Promise<Partial<typeof MidpointXState.State>>`
- State fields are read via `state.<fieldName>` — never mutate state directly
- Return only the fields you are changing — LangGraph merges partial updates
- Log the node entry with a distinctive emoji and the node name in brackets

### 4. Register in graph.ts

Read `src/core/graph.ts`, then add two things:

**a) Import** at the top with the other imports from the same file:
```typescript
import { <nodeName>Node } from "../nodes/<targetFile>";
```

**b) addNode** call after the existing `builder.addNode` block:
```typescript
builder.addNode("<NodeName>", (state: GraphState) => <nodeName>Node(state));
```

**c) Edge stubs** — add after the node registration with a clear TODO:
```typescript
// TODO: wire edges for <NodeName>
// builder.addEdge("<PredecessorNode>", "<NodeName>");
// builder.addEdge("<NodeName>", "<SuccessorNode>");
```

### 5. Confirm

Print:
- The function name and which file it was added to
- The `addNode` line added to `graph.ts`
- A reminder: "Run `npx tsc --noEmit` to verify types, then wire the edge stubs in graph.ts."

## Hard rules
- NEVER add an `addEdge` that would create a new path to `HumanApprovalGate` without a corresponding `interruptBefore` entry in `builder.compile()`
- NEVER route directly to `END` from a new node without going through `PruningActor` (unless it is a terminal error path confirmed by the user)
- The `as any` cast on the builder is intentional — do not remove it or add type assertions around individual `addNode` calls
