# Phase 2: Persistent Memory Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a SQLite-backed `AgentMemory` store (separate from the existing `MemoryManager`) that persists facts, preferences, and project context across sessions. Inject top recalled memories into every agent prompt. Surface memories in a Memory Browser frontend panel.

**Architecture:** A new `AgentMemory` class in `src/core/agentMemory.ts` wraps `better-sqlite3` (already in dependencies) with synchronous CRUD. `src/core/prompt.ts` gains a `buildMemoryContextBlock()` call. New Express routes expose CRUD to the frontend. The existing `MemoryManager` is untouched — this is additive.

**Tech Stack:** `better-sqlite3` (already installed), TypeScript, React, Lucide icons.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/core/agentMemory.ts` | Create | SQLite-backed memory CRUD with `remember`, `recall`, `forget`, `summarize` |
| `src/core/prompt.ts` | Modify | Inject top 10 memories into every agent prompt |
| `src/routes/memoryRoutes.ts` | Create | REST CRUD for memories: list, add, delete, search |
| `src/server.ts` | Modify | Register memory routes under `/api/v1/memories` |
| `frontend/src/components/MemoryBrowser.jsx` | Create | Memory browser panel with search and delete |
| `frontend/src/components/Sidebar.jsx` | Modify | Add Memory nav item |
| `frontend/src/App.jsx` | Modify | Wire MemoryBrowser view |
| `frontend/src/index.css` | Modify | MemoryBrowser styles |

---

## Task 1: Create AgentMemory class

**Files:**
- Create: `src/core/agentMemory.ts`

- [ ] **Step 1: Write the file**

```typescript
// src/core/agentMemory.ts
import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";

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
}

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath = path.resolve(process.cwd(), "src/workspace/midpointx.db");
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
  return _db;
}

export const AgentMemory = {
  /**
   * Write or upsert a memory entry.
   * confidence: 1.0 for user-authored, 0.7 for agent-authored.
   */
  remember(key: string, value: string, type: MemoryType, source: string): Memory {
    const db = getDb();
    const now = Date.now();
    const isUserSource = source === "user";
    const id = crypto.randomUUID();
    const confidence = isUserSource ? 1.0 : 0.7;

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

    return db.prepare("SELECT * FROM agent_memories WHERE key = ?").get(key) as Memory;
  },

  /**
   * SQLite LIKE search on key + value, ranked by last_accessed DESC.
   */
  recall(query: string, limit = 10): Memory[] {
    const db = getDb();
    const now = Date.now();
    const pattern = `%${query}%`;
    const rows = db.prepare(`
      SELECT * FROM agent_memories
      WHERE key LIKE ? OR value LIKE ?
      ORDER BY last_accessed DESC
      LIMIT ?
    `).all(pattern, pattern, limit) as Memory[];

    // Update last_accessed for returned rows
    if (rows.length > 0) {
      const ids = rows.map(r => `'${r.id}'`).join(",");
      db.exec(`
        UPDATE agent_memories
        SET last_accessed = ${now}, access_count = access_count + 1
        WHERE id IN (${ids})
      `);
    }
    return rows;
  },

  /**
   * Hard delete a memory by id.
   */
  forget(id: string): void {
    getDb().prepare("DELETE FROM agent_memories WHERE id = ?").run(id);
  },

  /**
   * Returns top memories by access_count for prompt injection.
   */
  summarize(limit = 20): Memory[] {
    return getDb()
      .prepare("SELECT * FROM agent_memories ORDER BY access_count DESC, last_accessed DESC LIMIT ?")
      .all(limit) as Memory[];
  },

  /**
   * Returns all memories, paginated (offset/limit).
   */
  list(offset = 0, limit = 50): Memory[] {
    return getDb()
      .prepare("SELECT * FROM agent_memories ORDER BY last_accessed DESC LIMIT ? OFFSET ?")
      .all(limit, offset) as Memory[];
  },

  count(): number {
    const row = getDb().prepare("SELECT COUNT(*) as n FROM agent_memories").get() as { n: number };
    return row.n;
  }
};
```

- [ ] **Step 2: Type-check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
git add src/core/agentMemory.ts
git commit -m "feat(memory): add AgentMemory SQLite-backed persistent store"
```

---

## Task 2: Inject memories into agent prompt

**Files:**
- Modify: `src/core/prompt.ts`

- [ ] **Step 1: Read the current prompt.ts**

Read `src/core/prompt.ts` to find where the system prompt is assembled. Look for the function or export that constructs the system message string.

- [ ] **Step 2: Add buildMemoryContextBlock helper**

Add this function to `src/core/prompt.ts` (before the existing export):

```typescript
import { AgentMemory } from "./agentMemory";

/**
 * Returns a compact memory context block for the top recalled memories.
 * Called once per agent invocation; result prepended to the system prompt.
 */
export function buildMemoryContextBlock(): string {
  try {
    const memories = AgentMemory.summarize(10);
    if (memories.length === 0) return "";
    const lines = memories.map(m => `- [${m.type.toUpperCase()}] ${m.key}: ${m.value}`).join("\n");
    return `\n\n## Persistent Memory (what I know about you and your projects)\n${lines}\n`;
  } catch {
    return "";
  }
}
```

- [ ] **Step 3: Inject the block into the system prompt**

In the same file, find where the main system prompt string is built (look for `WorkspaceLoader.getAgentPersona()` or a large template literal). Append the memory context block to it:

```typescript
import { buildMemoryContextBlock } from "./prompt";
// Inside the prompt builder:
const memCtx = buildMemoryContextBlock();
// Append memCtx to the system message content string, e.g.:
// systemPrompt = basePrompt + memCtx;
```

The exact location depends on the current shape of `prompt.ts`. Find the `return` statement that produces the full system prompt string and append `+ buildMemoryContextBlock()` before it.

- [ ] **Step 4: Type-check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```powershell
git add src/core/prompt.ts
git commit -m "feat(memory): inject top 10 persistent memories into agent system prompt"
```

---

## Task 3: Create memory API routes

**Files:**
- Create: `src/routes/memoryRoutes.ts`

- [ ] **Step 1: Write the file**

```typescript
// src/routes/memoryRoutes.ts
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
memoryRoutes.get("/search", (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || "");
    if (!q) return res.json({ success: true, memories: [] });
    const memories = AgentMemory.recall(q, 20);
    res.json({ success: true, memories });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/memories
 * Body: { key: string, value: string, type: MemoryType }
 */
memoryRoutes.post("/", (req: Request, res: Response) => {
  try {
    const { key, value, type } = req.body as { key: string; value: string; type: MemoryType };
    if (!key || !value || !type) {
      return res.status(400).json({ error: "key, value, and type are required" });
    }
    const memory = AgentMemory.remember(key, value, type, "user");
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

- [ ] **Step 2: Register routes in server.ts**

In `src/server.ts`, add the import after the existing route imports:
```typescript
import { memoryRoutes } from "./routes/memoryRoutes";
```

Then after the line `app.use("/api/v1/scheduler", schedulerRoutes);`, add:
```typescript
app.use("/api/v1/memories", memoryRoutes);
```

- [ ] **Step 3: Type-check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```powershell
git add src/routes/memoryRoutes.ts src/server.ts
git commit -m "feat(memory): add REST CRUD routes for persistent memory at /api/v1/memories"
```

---

## Task 4: Create MemoryBrowser frontend component

**Files:**
- Create: `frontend/src/components/MemoryBrowser.jsx`

- [ ] **Step 1: Write the component**

```jsx
// frontend/src/components/MemoryBrowser.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Brain, Search, Plus, Trash2, X } from 'lucide-react';

const TYPE_COLORS = {
  fact:       { color: 'var(--accent-teal)',  label: 'FACT' },
  project:    { color: 'var(--accent-neon)',  label: 'PROJECT' },
  preference: { color: '#FFC107',             label: 'PREF' },
  learned:    { color: '#a855f7',             label: 'LEARNED' },
};

const MemoryBrowser = () => {
  const [memories, setMemories] = useState([]);
  const [total, setTotal]       = useState(0);
  const [search, setSearch]     = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm]   = useState({ key: '', value: '', type: 'fact' });
  const [loading, setLoading]   = useState(false);

  const fetchMemories = useCallback(async () => {
    setLoading(true);
    try {
      const url = search
        ? `/api/v1/memories/search?q=${encodeURIComponent(search)}`
        : `/api/v1/memories`;
      const res = await fetch(url);
      const data = await res.json();
      setMemories(data.memories || []);
      setTotal(data.total ?? data.memories?.length ?? 0);
    } catch {
      setMemories([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  const handleForget = async (id) => {
    await fetch(`/api/v1/memories/${id}`, { method: 'DELETE' });
    setMemories(prev => prev.filter(m => m.id !== id));
    setTotal(prev => prev - 1);
  };

  const handleAdd = async () => {
    if (!addForm.key || !addForm.value) return;
    const res = await fetch('/api/v1/memories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm)
    });
    const data = await res.json();
    if (data.success) {
      setMemories(prev => [data.memory, ...prev]);
      setTotal(prev => prev + 1);
      setShowAddModal(false);
      setAddForm({ key: '', value: '', type: 'fact' });
    }
  };

  return (
    <div className="memory-browser">
      <div className="memory-header">
        <Brain size={16} style={{ color: 'var(--accent-teal)' }} />
        <span>MEMORY BROWSER</span>
        <span className="memory-count">{total} entr{total !== 1 ? 'ies' : 'y'}</span>
        <button className="memory-add-btn" onClick={() => setShowAddModal(true)}>
          <Plus size={12} /> Add
        </button>
      </div>

      <div className="memory-search-bar">
        <Search size={12} />
        <input
          type="text"
          placeholder="Search memories..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="memory-search-input"
        />
        {search && (
          <button onClick={() => setSearch('')} className="memory-search-clear">
            <X size={12} />
          </button>
        )}
      </div>

      <div className="memory-list">
        {loading && <div className="memory-loading">Loading...</div>}
        {!loading && memories.length === 0 && (
          <div className="memory-empty">
            <Brain size={28} style={{ opacity: 0.3 }} />
            <p>No memories yet.</p>
            <p style={{ fontSize: '11px', opacity: 0.5 }}>
              Agents write memories automatically, or add one manually.
            </p>
          </div>
        )}
        {memories.map(m => {
          const cfg = TYPE_COLORS[m.type] || TYPE_COLORS.fact;
          return (
            <div key={m.id} className="memory-row">
              <span className="memory-type-badge" style={{ color: cfg.color, borderColor: cfg.color }}>
                {cfg.label}
              </span>
              <div className="memory-content">
                <div className="memory-key">{m.key}</div>
                <div className="memory-value">{m.value.substring(0, 80)}{m.value.length > 80 ? '…' : ''}</div>
              </div>
              <span className="memory-hits">{m.access_count}x</span>
              <button className="memory-delete-btn" onClick={() => handleForget(m.id)}>
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}
      </div>

      {showAddModal && (
        <div className="memory-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="memory-modal" onClick={e => e.stopPropagation()}>
            <div className="memory-modal-header">
              <span>Add Memory</span>
              <button onClick={() => setShowAddModal(false)}><X size={14} /></button>
            </div>
            <select
              value={addForm.type}
              onChange={e => setAddForm(f => ({ ...f, type: e.target.value }))}
              className="memory-modal-select"
            >
              <option value="fact">Fact</option>
              <option value="project">Project</option>
              <option value="preference">Preference</option>
              <option value="learned">Learned</option>
            </select>
            <input
              type="text"
              placeholder="Key (e.g. user.stack.language)"
              value={addForm.key}
              onChange={e => setAddForm(f => ({ ...f, key: e.target.value }))}
              className="memory-modal-input"
            />
            <textarea
              placeholder="Value"
              value={addForm.value}
              onChange={e => setAddForm(f => ({ ...f, value: e.target.value }))}
              className="memory-modal-textarea"
              rows={3}
            />
            <button className="memory-modal-save" onClick={handleAdd}>Save Memory</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemoryBrowser;
```

- [ ] **Step 2: Commit**

```powershell
git add frontend/src/components/MemoryBrowser.jsx
git commit -m "feat(memory): add MemoryBrowser component with search, add, and delete"
```

---

## Task 5: Wire MemoryBrowser into App + Sidebar

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Sidebar.jsx`

- [ ] **Step 1: Add import in App.jsx**

Add after existing imports:
```jsx
import MemoryBrowser from './components/MemoryBrowser';
```

- [ ] **Step 2: Add view to render output in App.jsx**

After `{activeView === 'swarm' && <SwarmView ... />}`, add:
```jsx
{activeView === 'memory' && <MemoryBrowser />}
```

- [ ] **Step 3: Add nav item in Sidebar.jsx**

Add `Brain` to the lucide import:
```jsx
import { MessageSquare, Settings, Box, Cpu, ChevronRight, Menu, Calendar, Clock, Network, Brain } from 'lucide-react';
```

Add `{ id: 'memory', label: 'MEMORY', icon: Brain }` to `navItems`:
```jsx
const navItems = [
  { id: 'chat',     label: 'OPERATIONS', icon: MessageSquare },
  { id: 'swarm',    label: 'SWARM',      icon: Network },
  { id: 'memory',   label: 'MEMORY',     icon: Brain },
  { id: 'skills',   label: 'SKILLS',     icon: Box },
  { id: 'schedule', label: 'SCHEDULE',   icon: Calendar },
  { id: 'settings', label: 'CONFIG',     icon: Settings },
];
```

- [ ] **Step 4: Commit**

```powershell
git add frontend/src/App.jsx frontend/src/components/Sidebar.jsx
git commit -m "feat(memory): wire MemoryBrowser view and MEMORY nav item"
```

---

## Task 6: Add MemoryBrowser styles

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Append styles at end of index.css**

```css
/* ============================================================
   MEMORY BROWSER
   ============================================================ */

.memory-browser {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary);
}

.memory-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1.5px;
  color: var(--text-secondary);
}

.memory-count {
  margin-left: auto;
  font-size: 10px;
  color: var(--accent-teal);
}

.memory-add-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(23,113,201,0.15);
  border: 1px solid var(--accent-teal);
  color: var(--accent-teal);
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 10px;
  cursor: pointer;
}

.memory-search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
  color: var(--text-secondary);
}

.memory-search-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-size: 12px;
  font-family: inherit;
}

.memory-search-clear {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
}

.memory-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.memory-loading, .memory-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: 1;
  color: var(--text-secondary);
  font-size: 12px;
  text-align: center;
  padding: 32px;
}

.memory-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  border-radius: 4px;
  background: rgba(255,255,255,0.02);
  border: 1px solid var(--border);
}

.memory-type-badge {
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.8px;
  border: 1px solid;
  border-radius: 3px;
  padding: 2px 5px;
  white-space: nowrap;
  margin-top: 2px;
}

.memory-content { flex: 1; min-width: 0; }

.memory-key {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.memory-value {
  font-size: 10px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.memory-hits {
  font-size: 10px;
  color: var(--text-secondary);
  white-space: nowrap;
  margin-top: 2px;
}

.memory-delete-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 2px;
  border-radius: 3px;
  opacity: 0.4;
}

.memory-delete-btn:hover { opacity: 1; color: #FF4757; }

/* Modal */
.memory-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.memory-modal {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 20px;
  width: 380px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.memory-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 700;
}

.memory-modal-header button {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
}

.memory-modal-select,
.memory-modal-input,
.memory-modal-textarea {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 8px 10px;
  color: var(--text-primary);
  font-size: 12px;
  font-family: inherit;
  width: 100%;
  box-sizing: border-box;
}

.memory-modal-textarea { resize: vertical; }

.memory-modal-save {
  background: var(--accent-teal);
  border: none;
  border-radius: 4px;
  color: #000;
  font-size: 12px;
  font-weight: 700;
  padding: 8px;
  cursor: pointer;
}
```

- [ ] **Step 2: Commit**

```powershell
git add frontend/src/index.css
git commit -m "feat(memory): add MemoryBrowser CSS styles"
```

---

## Task 7: Verify the full feature

- [ ] **Step 1: Type-check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Build frontend**

```powershell
cd frontend; npm run build; cd ..
```

Expected: build completes without errors.

- [ ] **Step 3: Start the app**

```powershell
npm run dev
```

- [ ] **Step 4: Verify Memory Browser appears**

Open `http://localhost:5001`. Click `MEMORY` in the sidebar. Expected: empty memory browser with "No memories yet" message.

- [ ] **Step 5: Add a memory manually**

Click `+ Add`, fill in key `user.name`, value `Randy`, type `fact`. Click Save. Expected: memory appears in the list with FACT badge and 0x hit count.

- [ ] **Step 6: Verify search**

Type `Randy` in the search box. Expected: the memory appears. Clear the search. Expected: all memories shown.

- [ ] **Step 7: Verify prompt injection**

Start a task in Operations view. Check the backend logs — the system prompt should include the `## Persistent Memory` block with the memory you added.

- [ ] **Step 8: Final commit**

```powershell
git add -A
git commit -m "feat(phase2): complete Persistent Memory Layer — SQLite store, prompt injection, MemoryBrowser UI"
```
