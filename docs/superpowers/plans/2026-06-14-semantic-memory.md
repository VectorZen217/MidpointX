# Semantic Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `AgentMemory` from SQL `LIKE` search to OpenAI vector embeddings with cosine similarity, so the agent receives the most semantically relevant memories for each task instead of the most recently accessed ones.

**Architecture:** `remember()` generates an `text-embedding-3-small` vector on write and stores it in a new `embedding TEXT` column. `recall()` embeds the query and ranks stored memories by cosine similarity; falls back to LIKE search if embeddings are disabled or the OpenAI call fails. `buildMemoryContextBlockAsync(taskQuery)` replaces the sync `buildMemoryContextBlock()` call in cognitive nodes, passing the current task intent as the query so the system prompt receives task-relevant memories rather than most-clicked ones.

**Tech Stack:** `@langchain/openai` (OpenAIEmbeddings — already installed), `better-sqlite3` (already installed), `text-embedding-3-small` model, TypeScript 5.4.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/core/mathUtils.ts` | **CREATE** | `cosineSimilarity(a, b)` — extracted from persistence.ts, shared utility |
| `src/core/agentMemory.ts` | **MODIFY** | Add `embedding` column, `getEmbedding()`, async `remember()`, `recallSemantic()`, async `recall()`, `_resetDbForTesting()` |
| `src/core/persistence.ts` | **MODIFY** | Import `cosineSimilarity` from `mathUtils.ts`, remove local copy |
| `src/core/prompt.ts` | **MODIFY** | Add `injectedMemoryBlock?` param to all builders; add `buildMemoryContextBlockAsync()` |
| `src/nodes/cognitiveNodes.ts` | **MODIFY** | Pre-fetch `buildMemoryContextBlockAsync(state.userIntent)` in reflectNode, analyzeNode, learnNode |
| `src/nodes/executionNodes.ts` | **MODIFY** | Pre-fetch `buildMemoryContextBlockAsync(state.userIntent)` in executionNode |
| `src/routes/memoryRoutes.ts` | **MODIFY** | Make search and POST handlers async, add `await` on `recall()` and `remember()` |
| `src/core/config.ts` | **MODIFY** | Change `EMBEDDING_MODEL` default to `text-embedding-3-small` |
| `.env.example` | **MODIFY** | Document embedding config block |
| `src/tests/mathUtils.test.ts` | **CREATE** | Unit tests for cosineSimilarity |
| `src/tests/agentMemory.test.ts` | **CREATE** | Unit tests for remember, recall (LIKE path + semantic path) |

---

## Task 1: Extract cosineSimilarity to mathUtils.ts

**Files:**
- Create: `src/core/mathUtils.ts`
- Create: `src/tests/mathUtils.test.ts`

- [ ] **Step 1.1: Write failing tests**

Create `src/tests/mathUtils.test.ts`:

```typescript
import { cosineSimilarity } from "../core/mathUtils";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns ~0.707 for 45-degree angle", () => {
    expect(cosineSimilarity([1, 1], [1, 0])).toBeCloseTo(0.707, 2);
  });

  it("returns 0 for empty vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("returns 0 when one vector is all zeros", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it("returns 0 for mismatched lengths", () => {
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
  });
});
```

- [ ] **Step 1.2: Run tests — expect FAIL (module not found)**

```powershell
npx jest mathUtils --no-coverage 2>&1 | Select-String -Pattern "FAIL|PASS|Cannot find|error"
```

Expected: `FAIL` — `Cannot find module '../core/mathUtils'`

- [ ] **Step 1.3: Create mathUtils.ts**

Create `src/core/mathUtils.ts`:

```typescript
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

- [ ] **Step 1.4: Run tests — expect PASS**

```powershell
npx jest mathUtils --no-coverage 2>&1 | Select-String -Pattern "FAIL|PASS|Tests:"
```

Expected: `PASS src/tests/mathUtils.test.ts` — 6 tests pass

- [ ] **Step 1.5: Commit**

```powershell
git add src/core/mathUtils.ts src/tests/mathUtils.test.ts
git commit -m "feat(memory): extract cosineSimilarity into shared mathUtils.ts"
```

---

## Task 2: Update persistence.ts to import from mathUtils.ts

**Files:**
- Modify: `src/core/persistence.ts` (bottom of file, around line 506)

- [ ] **Step 2.1: Replace local cosineSimilarity with import**

At the top of `src/core/persistence.ts`, add the import (after existing imports):

```typescript
import { cosineSimilarity } from "./mathUtils";
```

Delete the local `cosineSimilarity` function at the bottom of the file (lines ~504–518):

```typescript
// DELETE this entire block:
/**
 * Cosine Similarity Math Helper (100% native vector operations)
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

- [ ] **Step 2.2: Type-check**

```powershell
npx tsc --noEmit 2>&1
```

Expected: no output (clean)

- [ ] **Step 2.3: Run persistence tests**

```powershell
npx jest persistence --no-coverage 2>&1 | Select-String -Pattern "FAIL|PASS|Tests:"
```

Expected: `PASS src/tests/persistence.test.ts`

- [ ] **Step 2.4: Commit**

```powershell
git add src/core/persistence.ts
git commit -m "refactor(persistence): import cosineSimilarity from shared mathUtils"
```

---

## Task 3: Add embedding column and getEmbedding to agentMemory.ts

**Files:**
- Modify: `src/core/agentMemory.ts`

- [ ] **Step 3.1: Add imports and getEmbedding helper**

Replace the top of `src/core/agentMemory.ts` (the import block and the `let _db` declaration) with:

```typescript
import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";
import { cosineSimilarity } from "./mathUtils";
import { Config } from "./config";

export type MemoryType = "fact" | "project" | "preference" | "learned";

export interface Memory {
  id: string;
  type: MemoryType;
  key: string;
  value: string;
  source: string;
  confidence: number;
  created_at: number;
  last_accessed: number;
  access_count: number;
  embedding?: string | null;
}

let _db: Database.Database | null = null;

async function getEmbedding(text: string): Promise<number[] | null> {
  if (!Config.ENABLE_EMBEDDINGS || !Config.OPENAI_API_KEY) return null;
  try {
    const { OpenAIEmbeddings } = await import("@langchain/openai");
    const embeddings = new OpenAIEmbeddings({
      apiKey: Config.OPENAI_API_KEY,
      modelName: Config.EMBEDDING_MODEL,
    });
    return await embeddings.embedQuery(text);
  } catch (e) {
    console.warn("⚠️ [AgentMemory] Failed to generate embedding:", e);
    return null;
  }
}
```

- [ ] **Step 3.2: Add embedding column migration in getDb()**

Replace the `getDb()` function:

```typescript
function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath = process.env.AGENT_MEMORY_DB_PATH ||
    path.resolve(process.cwd(), "src/workspace/midpointx.db");
  _db = new Database(dbPath);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS agent_memories (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      source TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 1.0,
      created_at INTEGER NOT NULL,
      last_accessed INTEGER NOT NULL,
      access_count INTEGER NOT NULL DEFAULT 0
    );
  `);
  try { _db.exec("ALTER TABLE agent_memories ADD COLUMN embedding TEXT"); } catch {}
  return _db;
}

export function _resetDbForTesting(customPath?: string): void {
  if (_db) { try { _db.close(); } catch {} _db = null; }
  if (customPath !== undefined) process.env.AGENT_MEMORY_DB_PATH = customPath;
}
```

- [ ] **Step 3.3: Type-check**

```powershell
npx tsc --noEmit 2>&1
```

Expected: no output (clean)

- [ ] **Step 3.4: Commit**

```powershell
git add src/core/agentMemory.ts
git commit -m "feat(memory): add embedding column migration and getEmbedding helper"
```

---

## Task 4: Make remember() async and add recallSemantic()

**Files:**
- Modify: `src/core/agentMemory.ts`
- Create: `src/tests/agentMemory.test.ts`

- [ ] **Step 4.1: Write failing tests**

Create `src/tests/agentMemory.test.ts`:

```typescript
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

// Must mock before importing agentMemory so dynamic import is intercepted
jest.mock("@langchain/openai", () => ({
  OpenAIEmbeddings: jest.fn().mockImplementation(() => ({
    embedQuery: jest.fn().mockImplementation(async (text: string) => {
      // Return a deterministic vector based on text content for testing
      if (text.includes("typescript")) return [1.0, 0.0, 0.0];
      if (text.includes("python"))    return [0.0, 1.0, 0.0];
      return [0.5, 0.5, 0.0];
    }),
  })),
}));

import { AgentMemory, _resetDbForTesting } from "../core/agentMemory";

function makeTempDbPath(): string {
  return path.join(os.tmpdir(), `mx-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

beforeEach(() => {
  _resetDbForTesting(makeTempDbPath());
  process.env.ENABLE_EMBEDDINGS = "false"; // default off; individual tests opt in
});

afterEach(() => {
  _resetDbForTesting();
  delete process.env.ENABLE_EMBEDDINGS;
});

describe("AgentMemory.remember()", () => {
  it("persists a memory to SQLite", async () => {
    const mem = await AgentMemory.remember("lang", "TypeScript", "fact", "user");
    expect(mem.key).toBe("lang");
    expect(mem.value).toBe("TypeScript");
    expect(mem.confidence).toBe(1.0);
  });

  it("sets confidence 0.7 for agent source", async () => {
    const mem = await AgentMemory.remember("pattern", "BFS works well", "learned", "agent");
    expect(mem.confidence).toBe(0.7);
  });

  it("stores no embedding when ENABLE_EMBEDDINGS is false", async () => {
    const mem = await AgentMemory.remember("lang", "TypeScript", "fact", "user");
    expect(mem.embedding).toBeFalsy();
  });

  it("upserts on key conflict", async () => {
    await AgentMemory.remember("lang", "TypeScript", "fact", "user");
    await AgentMemory.remember("lang", "Go", "fact", "user");
    const all = AgentMemory.list();
    expect(all).toHaveLength(1);
    expect(all[0].value).toBe("Go");
  });
});

describe("AgentMemory.recall() — LIKE path (embeddings off)", () => {
  it("finds a memory by key substring", async () => {
    await AgentMemory.remember("favorite language", "TypeScript", "preference", "user");
    const results = await AgentMemory.recall("language");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].key).toBe("favorite language");
  });

  it("returns empty array when nothing matches", async () => {
    await AgentMemory.remember("foo", "bar", "fact", "user");
    const results = await AgentMemory.recall("zzznomatch");
    expect(results).toHaveLength(0);
  });

  it("increments access_count on recall", async () => {
    await AgentMemory.remember("lang", "TypeScript", "fact", "user");
    await AgentMemory.recall("lang");
    const [mem] = AgentMemory.list();
    expect(mem.access_count).toBe(1);
  });
});

describe("AgentMemory.recall() — semantic path (embeddings on)", () => {
  beforeEach(() => {
    process.env.ENABLE_EMBEDDINGS = "true";
    process.env.OPENAI_API_KEY = "sk-test-fake";
  });

  it("returns semantically ranked results", async () => {
    await AgentMemory.remember("typescript project", "I use TypeScript daily", "fact", "user");
    await AgentMemory.remember("python project", "I use Python for data science", "fact", "user");

    // Query for typescript — mock returns [1,0,0] for it and [0,1,0] for python
    const results = await AgentMemory.recall("typescript query", 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].key).toBe("typescript project");
  });

  it("falls back to LIKE when no embeddings stored", async () => {
    // Write with embeddings OFF so no vectors stored
    process.env.ENABLE_EMBEDDINGS = "false";
    await AgentMemory.remember("typescript note", "TS is great", "fact", "user");
    process.env.ENABLE_EMBEDDINGS = "true";

    // recallSemantic finds nothing (no embeddings), so recall() falls back to LIKE
    const results = await AgentMemory.recall("typescript", 10);
    expect(results.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 4.2: Run tests — expect FAIL**

```powershell
npx jest agentMemory --no-coverage 2>&1 | Select-String -Pattern "FAIL|PASS|TypeError|error"
```

Expected: `FAIL` — `AgentMemory.remember is not a function` or type errors because `remember` is still sync

- [ ] **Step 4.3: Make remember() async and add recallSemantic()**

Replace the `export const AgentMemory = { ... }` object in `src/core/agentMemory.ts` with:

```typescript
export const AgentMemory = {
  async remember(key: string, value: string, type: MemoryType, source: string): Promise<Memory> {
    const db = getDb();
    const now = Date.now();
    const id = crypto.randomUUID();
    const confidence = source === "user" ? 1.0 : 0.7;

    db.prepare(`
      INSERT INTO agent_memories (id, type, key, value, source, confidence, created_at, last_accessed, access_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        type = excluded.type,
        source = excluded.source,
        confidence = excluded.confidence,
        last_accessed = excluded.last_accessed
    `).run(id, type, key, value, source, confidence, now, now);

    const memory = db.prepare("SELECT * FROM agent_memories WHERE key = ?").get(key) as Memory;

    const vector = await getEmbedding(`${key}: ${value}`);
    if (vector) {
      db.prepare("UPDATE agent_memories SET embedding = ? WHERE key = ?")
        .run(JSON.stringify(vector), key);
      memory.embedding = JSON.stringify(vector);
    }

    return memory;
  },

  async recallSemantic(query: string, limit = 10): Promise<Memory[]> {
    const db = getDb();
    const queryVector = await getEmbedding(query);
    if (!queryVector) return [];

    const rows = db.prepare(
      "SELECT * FROM agent_memories WHERE embedding IS NOT NULL"
    ).all() as Memory[];

    if (rows.length === 0) return [];

    const now = Date.now();
    const scored = rows
      .map(row => ({
        memory: row,
        score: cosineSimilarity(queryVector, JSON.parse(row.embedding as string))
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const updateStmt = db.prepare(
      "UPDATE agent_memories SET last_accessed = ?, access_count = access_count + 1 WHERE id = ?"
    );
    for (const { memory } of scored) updateStmt.run(now, memory.id);

    return scored.map(s => s.memory);
  },

  async recall(query: string, limit = 10): Promise<Memory[]> {
    if (Config.ENABLE_EMBEDDINGS) {
      try {
        const semantic = await this.recallSemantic(query, limit);
        if (semantic.length > 0) return semantic;
      } catch (e) {
        console.warn("⚠️ [AgentMemory] Semantic recall failed, falling back to LIKE:", e);
      }
    }
    const db = getDb();
    const now = Date.now();
    const pattern = `%${query}%`;
    const rows = db.prepare(`
      SELECT * FROM agent_memories
      WHERE key LIKE ? OR value LIKE ?
      ORDER BY last_accessed DESC
      LIMIT ?
    `).all(pattern, pattern, limit) as Memory[];

    if (rows.length > 0) {
      const updateStmt = db.prepare(
        "UPDATE agent_memories SET last_accessed = ?, access_count = access_count + 1 WHERE id = ?"
      );
      for (const row of rows) updateStmt.run(now, row.id);
    }
    return rows;
  },

  forget(id: string): void {
    getDb().prepare("DELETE FROM agent_memories WHERE id = ?").run(id);
  },

  summarize(limit = 20): Memory[] {
    return getDb()
      .prepare("SELECT * FROM agent_memories ORDER BY access_count DESC, last_accessed DESC LIMIT ?")
      .all(limit) as Memory[];
  },

  list(offset = 0, limit = 50): Memory[] {
    return getDb()
      .prepare("SELECT * FROM agent_memories ORDER BY last_accessed DESC LIMIT ? OFFSET ?")
      .all(limit, offset) as Memory[];
  },

  count(): number {
    const row = getDb().prepare("SELECT COUNT(*) as n FROM agent_memories").get() as { n: number } | undefined;
    return row?.n ?? 0;
  }
};
```

- [ ] **Step 4.4: Run tests — expect PASS**

```powershell
npx jest agentMemory --no-coverage 2>&1 | Select-String -Pattern "FAIL|PASS|Tests:"
```

Expected: `PASS src/tests/agentMemory.test.ts` — all tests pass

- [ ] **Step 4.5: Type-check**

```powershell
npx tsc --noEmit 2>&1
```

Expected: no output (clean)

- [ ] **Step 4.6: Commit**

```powershell
git add src/core/agentMemory.ts src/tests/agentMemory.test.ts
git commit -m "feat(memory): async remember() with embedding-on-write, recallSemantic(), semantic-first recall()"
```

---

## Task 5: Update memoryRoutes.ts for async recall and remember

**Files:**
- Modify: `src/routes/memoryRoutes.ts`

- [ ] **Step 5.1: Make search and POST handlers async**

Replace the full content of `src/routes/memoryRoutes.ts`:

```typescript
import { Router, Request, Response } from "express";
import { AgentMemory, MemoryType } from "../core/agentMemory";

export const memoryRoutes = Router();

/**
 * GET /api/v1/memories?offset=0&limit=50
 */
memoryRoutes.get("/", (req: Request, res: Response) => {
  try {
    const offset = parseInt(String(req.query.offset || "0"), 10);
    const limit  = parseInt(String(req.query.limit  || "50"), 10);
    const memories = AgentMemory.list(offset, limit);
    const total = AgentMemory.count();
    res.json({ success: true, memories, total, offset, limit });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/memories/search?q=typescript
 */
memoryRoutes.get("/search", async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || "");
    if (!q) return res.json({ success: true, memories: [] });
    const memories = await AgentMemory.recall(q, 20);
    res.json({ success: true, memories });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/memories
 * Body: { key: string, value: string, type: MemoryType }
 */
memoryRoutes.post("/", async (req: Request, res: Response) => {
  try {
    const { key, value, type } = req.body as { key: string; value: string; type: MemoryType };
    if (!key || !value || !type) {
      return res.status(400).json({ error: "key, value, and type are required" });
    }
    const memory = await AgentMemory.remember(key, value, type, "user");
    res.json({ success: true, memory });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/v1/memories/:id
 */
memoryRoutes.delete("/:id", (req: Request, res: Response) => {
  try {
    AgentMemory.forget(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 5.2: Type-check**

```powershell
npx tsc --noEmit 2>&1
```

Expected: no output (clean)

- [ ] **Step 5.3: Commit**

```powershell
git add src/routes/memoryRoutes.ts
git commit -m "fix(routes): await async remember() and recall() in memoryRoutes"
```

---

## Task 6: Add buildMemoryContextBlockAsync to prompt.ts

**Files:**
- Modify: `src/core/prompt.ts`

- [ ] **Step 6.1: Add injectedMemoryBlock param and async builder**

In `src/core/prompt.ts`, make three edits:

**Edit 1** — Add `injectedMemoryBlock?` parameter to `buildMemoryContextBlock` call at the end of `buildBaseIdentity`:

```typescript
// BEFORE:
export function buildBaseIdentity(agentPersona: string, userContext: string): string {
  // ... existing body ...
  return parts.join("\n\n") + buildMemoryContextBlock();
}

// AFTER:
export function buildBaseIdentity(agentPersona: string, userContext: string, injectedMemoryBlock?: string): string {
  // ... existing body unchanged ...
  return parts.join("\n\n") + (injectedMemoryBlock !== undefined ? injectedMemoryBlock : buildMemoryContextBlock());
}
```

**Edit 2** — Add optional `injectedMemoryBlock?` to all four prompt builders. Each one passes it through to `buildBaseIdentity`. Example for `buildReflectPrompt` (apply the same pattern to `buildAnalyzePrompt`, `buildActionPrompt`, `buildLearnPrompt`):

```typescript
// BEFORE:
export function buildReflectPrompt(agentPersona: string, userContext: string): string {
  return `${buildBaseIdentity(agentPersona, userContext)}
  ...`;
}

// AFTER:
export function buildReflectPrompt(agentPersona: string, userContext: string, injectedMemoryBlock?: string): string {
  return `${buildBaseIdentity(agentPersona, userContext, injectedMemoryBlock)}
  ...`;
}
```

For `buildAnalyzePrompt`:

```typescript
// BEFORE:
export function buildAnalyzePrompt(agentPersona: string, userContext: string, executionMode: string = 'api'): string {

// AFTER:
export function buildAnalyzePrompt(agentPersona: string, userContext: string, executionMode: string = 'api', injectedMemoryBlock?: string): string {
```

Change the `buildBaseIdentity` call inside it:
```typescript
// BEFORE:
  return `${buildBaseIdentity(agentPersona, userContext)}
// AFTER:
  return `${buildBaseIdentity(agentPersona, userContext, injectedMemoryBlock)}
```

For `buildActionPrompt`:

```typescript
// BEFORE:
export function buildActionPrompt(agentPersona: string, userContext: string, executionMode: string = 'api'): string {

// AFTER:
export function buildActionPrompt(agentPersona: string, userContext: string, executionMode: string = 'api', injectedMemoryBlock?: string): string {
```

Change the `buildBaseIdentity` call inside it:
```typescript
// BEFORE:
  return `${buildBaseIdentity(agentPersona, userContext)}
// AFTER:
  return `${buildBaseIdentity(agentPersona, userContext, injectedMemoryBlock)}
```

For `buildLearnPrompt`:

```typescript
// BEFORE:
export function buildLearnPrompt(agentPersona: string, userContext: string): string {

// AFTER:
export function buildLearnPrompt(agentPersona: string, userContext: string, injectedMemoryBlock?: string): string {
```

Change the `buildBaseIdentity` call inside it:
```typescript
// BEFORE:
  return `${buildBaseIdentity(agentPersona, userContext)}
// AFTER:
  return `${buildBaseIdentity(agentPersona, userContext, injectedMemoryBlock)}
```

**Edit 3** — Add the async builder after `buildMemoryContextBlock()`:

```typescript
/**
 * Async, task-aware version of buildMemoryContextBlock.
 * When ENABLE_EMBEDDINGS=true, returns the top-k memories most semantically
 * relevant to taskQuery. Falls back to summarize() on any error.
 */
export async function buildMemoryContextBlockAsync(taskQuery: string): Promise<string> {
  try {
    const memories = await AgentMemory.recall(taskQuery, 10);
    if (memories.length === 0) return "";
    const lines = memories
      .map(m => `- [${m.type.toUpperCase()}] ${m.key}: ${m.value}`)
      .join("\n");
    return `\n\n## Persistent Memory (context about you and your projects)\n${lines}\n`;
  } catch {
    return buildMemoryContextBlock();
  }
}
```

- [ ] **Step 6.2: Type-check**

```powershell
npx tsc --noEmit 2>&1
```

Expected: no output (clean)

- [ ] **Step 6.3: Commit**

```powershell
git add src/core/prompt.ts
git commit -m "feat(prompt): add buildMemoryContextBlockAsync for task-aware semantic memory injection"
```

---

## Task 7: Wire async memory into cognitive and execution nodes

**Files:**
- Modify: `src/nodes/cognitiveNodes.ts`
- Modify: `src/nodes/executionNodes.ts`

- [ ] **Step 7.1: Update import in cognitiveNodes.ts**

In `src/nodes/cognitiveNodes.ts`, update the import from `../core/prompt`:

```typescript
// BEFORE:
import { 
  buildReflectPrompt,
  buildAnalyzePrompt,
  buildLearnPrompt,
} from "../core/prompt";

// AFTER:
import { 
  buildReflectPrompt,
  buildAnalyzePrompt,
  buildLearnPrompt,
  buildMemoryContextBlockAsync,
} from "../core/prompt";
```

- [ ] **Step 7.2: Update reflectNode**

In `reflectNode` (around line 176), before the `payload` array is constructed, add the async memory pre-fetch, then pass it to `buildReflectPrompt`:

```typescript
// ADD after the existing memoryBlock construction (around line 152) and before `const identityStr`:
const agentMemoryBlock = await withTimeout(
  buildMemoryContextBlockAsync(state.userIntent || ""),
  3000,
  ""
);

// CHANGE line 176 from:
new SystemMessage(buildReflectPrompt(agentPersona, userContext) + identityStr + swarmStr),
// TO:
new SystemMessage(buildReflectPrompt(agentPersona, userContext, agentMemoryBlock) + identityStr + swarmStr),
```

- [ ] **Step 7.3: Update analyzeNode**

In `analyzeNode` (around line 406), add the pre-fetch before the payload and pass to `buildAnalyzePrompt`:

```typescript
// ADD before the payload line:
const agentMemoryBlock = await withTimeout(
  buildMemoryContextBlockAsync(state.conciseIntent || state.userIntent || ""),
  3000,
  ""
);

// CHANGE line 406 from:
new SystemMessage(buildAnalyzePrompt(agentPersona, userContext, state.executionMode || 'api') + skillsStr),
// TO:
new SystemMessage(buildAnalyzePrompt(agentPersona, userContext, state.executionMode || 'api', agentMemoryBlock) + skillsStr),
```

- [ ] **Step 7.4: Update learnNode**

In `learnNode` (around line 498), add the pre-fetch before the payload and pass to `buildLearnPrompt`:

```typescript
// ADD before the payload line:
const agentMemoryBlock = await withTimeout(
  buildMemoryContextBlockAsync(state.conciseIntent || state.userIntent || ""),
  3000,
  ""
);

// CHANGE line 498 from:
new SystemMessage(buildLearnPrompt(agentPersona, userContext) + identityStr),
// TO:
new SystemMessage(buildLearnPrompt(agentPersona, userContext, agentMemoryBlock) + identityStr),
```

- [ ] **Step 7.5: Update executionNodes.ts**

In `src/nodes/executionNodes.ts`, update the import from `../core/prompt`:

```typescript
// BEFORE:
import { buildActionPrompt } from "../core/prompt";

// AFTER:
import { buildActionPrompt, buildMemoryContextBlockAsync } from "../core/prompt";
```

In the execution node function (around line 420), add the pre-fetch before `buildActionPrompt` is called:

```typescript
// ADD before line 420:
const agentMemoryBlock = await withTimeout(
  buildMemoryContextBlockAsync(state.conciseIntent || state.userIntent || ""),
  3000,
  ""
);

// CHANGE line 420 from:
let systemPromptText = buildActionPrompt(agentPersona, userContext, state.executionMode || 'api');
// TO:
let systemPromptText = buildActionPrompt(agentPersona, userContext, state.executionMode || 'api', agentMemoryBlock);
```

Note: `withTimeout` is already imported in `cognitiveNodes.ts`. For `executionNodes.ts`, add it:

```typescript
// ADD this helper near the top of executionNodes.ts (after imports):
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))
  ]);
}
```

- [ ] **Step 7.6: Type-check**

```powershell
npx tsc --noEmit 2>&1
```

Expected: no output (clean)

- [ ] **Step 7.7: Commit**

```powershell
git add src/nodes/cognitiveNodes.ts src/nodes/executionNodes.ts
git commit -m "feat(nodes): inject task-aware semantic memory block into all cognitive and execution prompts"
```

---

## Task 8: Update config defaults and .env.example

**Files:**
- Modify: `src/core/config.ts`
- Modify: `.env.example`

- [ ] **Step 8.1: Update EMBEDDING_MODEL default in config.ts**

In `src/core/config.ts`, change line 39:

```typescript
// BEFORE:
EMBEDDING_MODEL: z.string().default("nomic-embed-text"),

// AFTER:
EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
```

- [ ] **Step 8.2: Update .env.example**

Add an embeddings section to `.env.example` after the API keys block:

```env
# Semantic Memory (Embeddings)
# Requires OPENAI_API_KEY even if using Anthropic as primary LLM provider
ENABLE_EMBEDDINGS=false           # Set to true to activate semantic recall
EMBEDDING_MODEL=text-embedding-3-small
```

- [ ] **Step 8.3: Type-check**

```powershell
npx tsc --noEmit 2>&1
```

Expected: no output (clean)

- [ ] **Step 8.4: Commit**

```powershell
git add src/core/config.ts .env.example
git commit -m "feat(config): set text-embedding-3-small as default embedding model, document in .env.example"
```

---

## Task 9: Full verification

- [ ] **Step 9.1: Run full test suite**

```powershell
npx jest --no-coverage 2>&1 | Select-String -Pattern "FAIL|PASS|Test Suites:|Tests:"
```

Expected: 210/211 pass (the 1 pre-existing failure is `PROACTIVE_HEARTBEAT.md` not on disk — unrelated to this feature). All new test files pass.

- [ ] **Step 9.2: Final type-check**

```powershell
npx tsc --noEmit 2>&1
```

Expected: no output (clean)

- [ ] **Step 9.3: Start backend and verify startup**

```powershell
npm run backend 2>&1 | Select-String -Pattern "running on port|Error|failed" | Select-Object -First 5
```

Expected: `MidpointX Production Server running on port 5001` — no errors

- [ ] **Step 9.4: Add a test memory via API**

```powershell
Invoke-RestMethod -Uri "http://localhost:5001/api/v1/memories" -Method POST `
  -ContentType "application/json" `
  -Body '{"key":"test semantic","value":"TypeScript is the primary language","type":"fact"}'
```

Expected: `{ success: true, memory: { ... } }`

- [ ] **Step 9.5: Verify embedding stored (LIKE mode — embeddings off)**

```powershell
Invoke-RestMethod -Uri "http://localhost:5001/api/v1/memories/search?q=language"
```

Expected: memory returned via LIKE search

- [ ] **Step 9.6: Enable embeddings and test semantic recall (requires OPENAI_API_KEY in .env)**

Add to `.env`:
```env
ENABLE_EMBEDDINGS=true
OPENAI_API_KEY=sk-...your-key...
EMBEDDING_MODEL=text-embedding-3-small
```

Restart backend, add another memory, then search with a related term that isn't a substring match:

```powershell
Invoke-RestMethod -Uri "http://localhost:5001/api/v1/memories" -Method POST `
  -ContentType "application/json" `
  -Body '{"key":"programming preference","value":"I prefer statically typed languages","type":"preference"}'

# Search with semantically related but not substring-matching query:
Invoke-RestMethod -Uri "http://localhost:5001/api/v1/memories/search?q=compiled+type+safety"
```

Expected: the TypeScript memory and/or the "statically typed" memory should surface even though neither contains "compiled type safety" as a substring.

- [ ] **Step 9.7: Final commit (if any loose files)**

```powershell
git status
```

If clean: done. If stray files remain, stage and commit with `docs: ...` or appropriate prefix.
