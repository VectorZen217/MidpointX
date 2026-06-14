# Semantic Memory — Design Spec
Date: 2026-06-14
Status: Approved

## Context

MidpointX's `agentMemory.ts` (Phase 2) stores user and agent memories in SQLite but retrieves them with SQL `LIKE` search — a brittle string match that misses synonyms, related concepts, and contextual relevance. The prompt injector (`buildMemoryContextBlock`) injects the 10 most-recently-accessed memories into every prompt regardless of whether they relate to the current task.

The goal is to replace this with semantic (vector) search: every memory gets an OpenAI embedding on write; every recall query embeds the search term and ranks stored memories by cosine similarity. The prompt injector passes the current task text as the query so the agent receives the 10 most *relevant* memories for what it is about to do — not the 10 most recently clicked.

The existing `MemoryManager` (`memory.ts`) and `persistence.ts` already have a full vector pipeline (embed → store → cosine query). This spec activates the same pattern for `agentMemory.ts`.

---

## Embedding Provider

- **Provider**: OpenAI
- **Model**: `text-embedding-3-small`
- **Config**: `OPENAI_API_KEY` in `.env`, `ENABLE_EMBEDDINGS=true`, `EMBEDDING_MODEL=text-embedding-3-small`
- **Fallback**: if the OpenAI call fails for any reason, the system falls back to LIKE search silently — no crash, no user-visible error

---

## Data Model

Single new nullable column on the existing `agent_memories` table. Added in the DB init block wrapped in a `try/catch` — SQLite's `ALTER TABLE ADD COLUMN` throws if the column already exists, so this pattern handles both first-run and upgrade:

```typescript
try { db.exec("ALTER TABLE agent_memories ADD COLUMN embedding TEXT"); } catch {}
// embedding: JSON-serialized float array (OpenAI vector), nullable
// NULL = written before embeddings enabled; still searchable via LIKE
```

No new tables. Cosine similarity function extracted from `persistence.ts` into `src/core/mathUtils.ts` and imported by both files to eliminate duplication.

---

## Write Path

`remember()` becomes `async`. Behavior:

1. SQLite `INSERT OR REPLACE` — synchronous, identical to today
2. `getEmbedding(key + ": " + value)` — async OpenAI call
   - Success → `UPDATE agent_memories SET embedding = ? WHERE key = ?`
   - Failure → `console.warn`, return normally (memory saved, no vector)

The memory is **always persisted** regardless of embedding success. Memories with `embedding = NULL` participate in LIKE search only.

---

## Read Path

`recall()` becomes `async`. Strategy: semantic-first, LIKE-fallback.

```
recall(query, limit)
├── ENABLE_EMBEDDINGS=true
│   1. getEmbedding(query)                          ← OpenAI
│   2. SELECT * FROM agent_memories WHERE embedding IS NOT NULL
│   3. cosineSimilarity(queryVector, storedVector)  ← in JS
│   4. Sort by score DESC, return top-k
│   └── OpenAI failure → fall through to LIKE
│
└── ENABLE_EMBEDDINGS=false (or fallback)
    LIKE search on key + value                      ← current behavior
```

`summarize()` and `list()` remain synchronous — they are used for pagination and stats, not relevance ranking.

---

## Prompt Injection Upgrade

`buildMemoryContextBlock()` in `prompt.ts` becomes `async` and accepts the current task string as an optional parameter.

| Mode | Behavior |
|---|---|
| `ENABLE_EMBEDDINGS=true` | Calls `AgentMemory.recall(currentTask, 10)` — top 10 by semantic relevance to the task |
| `ENABLE_EMBEDDINGS=false` | Calls `AgentMemory.summarize(10)` — top 10 by access count (current behavior) |

All cognitive nodes that call `buildBaseIdentity()` / `buildMemoryContextBlock()` add `await`.

---

## Files Changed

| File | Change |
|---|---|
| `src/core/mathUtils.ts` | **NEW** — `cosineSimilarity(a, b)` extracted from `persistence.ts` |
| `src/core/agentMemory.ts` | Add `embedding` column; `remember()` async + embed on write; `recall()` async + semantic-first |
| `src/core/prompt.ts` | `buildMemoryContextBlock()` async, task-aware recall |
| `src/core/persistence.ts` | Import `cosineSimilarity` from `mathUtils.ts` (remove local copy) |
| `src/routes/memoryRoutes.ts` | `await` on `remember()` and `recall()` |
| `src/core/config.ts` | `EMBEDDING_MODEL` default → `text-embedding-3-small` |
| `.env.example` | Document `ENABLE_EMBEDDINGS`, `EMBEDDING_MODEL`, `OPENAI_API_KEY` for embeddings |

Cognitive nodes in `src/nodes/` that call `buildBaseIdentity()` add `await` — exact files confirmed during implementation by grepping for the call site.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| `ENABLE_EMBEDDINGS=false` | LIKE search only, zero OpenAI calls |
| OpenAI call fails on write | Memory saved, embedding NULL, warn logged |
| OpenAI call fails on recall | Fall back to LIKE search, warn logged |
| Memory has NULL embedding | Excluded from vector results, included in LIKE results |
| `OPENAI_API_KEY` missing | `getEmbedding()` returns null, LIKE fallback activates |

---

## Verification

1. Set `ENABLE_EMBEDDINGS=true`, `OPENAI_API_KEY=<key>`, `EMBEDDING_MODEL=text-embedding-3-small` in `.env`
2. `npm run backend` — confirm no startup errors
3. Add a memory via MemoryBrowser: verify `embedding` column populated in SQLite (`SELECT id, key, length(embedding) FROM agent_memories`)
4. Search MemoryBrowser with a semantically related term (not an exact keyword match) — confirm relevant results return
5. Send a task in Chat — confirm the injected memory block in the agent's reasoning trace reflects the task topic, not unrelated recently-accessed memories
6. Set `ENABLE_EMBEDDINGS=false` — confirm LIKE search still works, no regressions
7. `npx tsc --noEmit` — clean
8. `npm test` — 210/211 pass (pre-existing failure unrelated)
