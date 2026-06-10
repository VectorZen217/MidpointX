# Phase 4: Visual Workflow Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users drag nodes onto a canvas to wire automated pipelines — no code required. Pipelines stored as JSON in `src/workspace/pipelines/` are loaded and executed by a new `PipelineRunner` backed by the existing `Observer`. The frontend uses React Flow for the node canvas.

**Architecture:** `PipelineRunner` evaluates a pipeline's node graph at runtime: resolves the trigger → walks edges → evaluates conditions → executes action/agent nodes in order. `Observer` gains a `loadPipelines()` method that registers active pipelines as cron/webhook/file handlers. The frontend canvas serializes to the same pipeline JSON format and POSTs it to `/api/v1/pipelines`.

**Prerequisite:** Phase 3 Integration Hub must be complete before integration action nodes (Send Slack, Create GitHub issue, Send email) can be tested end-to-end. The canvas itself and trigger/condition nodes are independent.

**Tech Stack:** `reactflow` (new frontend dep), TypeScript, Express, `node-cron` (already used by Observer).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/core/pipelineRunner.ts` | Create | Evaluates pipeline node graphs at runtime |
| `src/core/observer.ts` | Modify | `loadPipelines()`: registers pipelines as live handlers |
| `src/routes/pipelineRoutes.ts` | Create | CRUD + run history routes for pipelines |
| `src/server.ts` | Modify | Mount pipeline routes; call `Observer.loadPipelines()` at startup |
| `frontend/src/components/PipelineView.jsx` | Create | React Flow canvas with NodePalette and toolbar |
| `frontend/src/components/NodePalette.jsx` | Create | Draggable node types panel |
| `frontend/src/components/NodeConfigPanel.jsx` | Create | Context-sensitive config sidebar for selected node |
| `frontend/src/components/Sidebar.jsx` | Modify | Add Pipelines nav item |
| `frontend/src/App.jsx` | Modify | Wire PipelineView |
| `frontend/src/index.css` | Modify | Pipeline editor styles |
| `frontend/package.json` | Modify | Add `reactflow` dependency |

---

## Task 1: Install React Flow

- [ ] **Step 1: Install frontend dependency**

```powershell
cd frontend; npm install reactflow; cd ..
```

- [ ] **Step 2: Verify**

```powershell
cd frontend; npm run build 2>&1 | Select-String "error"; cd ..
```

Expected: no build errors.

- [ ] **Step 3: Commit**

```powershell
git add frontend/package.json frontend/package-lock.json
git commit -m "chore(deps): add reactflow for visual pipeline builder"
```

---

## Task 2: Define pipeline schema types

**Files:**
- Create: `src/core/pipelineTypes.ts`

- [ ] **Step 1: Write the file**

```typescript
// src/core/pipelineTypes.ts

export type PipelineNodeType = "trigger" | "condition" | "action" | "agent";

export type TriggerKind   = "schedule" | "webhook" | "file_change";
export type ConditionKind = "contains_text" | "time_of_day" | "day_of_week";
export type ActionKind    = "slack_send" | "github_create_issue" | "email_send" | "shell_command";

export interface PipelineNode {
  id: string;
  type: PipelineNodeType;
  kind: TriggerKind | ConditionKind | ActionKind | "invoke_agent";
  config: Record<string, unknown>;
  position: { x: number; y: number };
}

export interface PipelineEdge {
  source: string;
  target: string;
}

export interface Pipeline {
  id: string;
  name: string;
  enabled: boolean;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  createdAt: number;
  updatedAt: number;
}

export interface PipelineRunRecord {
  pipelineId: string;
  runAt: number;
  success: boolean;
  error?: string;
  durationMs: number;
}
```

- [ ] **Step 2: Type-check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
git add src/core/pipelineTypes.ts
git commit -m "feat(pipelines): add pipeline schema types"
```

---

## Task 3: Create PipelineRunner

**Files:**
- Create: `src/core/pipelineRunner.ts`

- [ ] **Step 1: Write the file**

```typescript
// src/core/pipelineRunner.ts
import { Pipeline, PipelineNode, PipelineRunRecord } from "./pipelineTypes";
import { IntegrationBus } from "./integrationBus";
import { ChannelRouter } from "./channelRouter";

const _runHistory: PipelineRunRecord[] = [];

async function evaluateCondition(node: PipelineNode, _context: Record<string, unknown>): Promise<boolean> {
  const cfg = node.config;
  switch (node.kind) {
    case "contains_text": {
      const text = String(_context.triggerText || "");
      return text.toLowerCase().includes(String(cfg.text || "").toLowerCase());
    }
    case "time_of_day": {
      const hour = new Date().getHours();
      const from = Number(cfg.fromHour ?? 0);
      const to   = Number(cfg.toHour   ?? 23);
      return hour >= from && hour <= to;
    }
    case "day_of_week": {
      const day = new Date().getDay(); // 0=Sun, 6=Sat
      const allowed = (cfg.days as number[]) || [];
      return allowed.includes(day);
    }
    default:
      return true;
  }
}

async function executeAction(node: PipelineNode, _context: Record<string, unknown>): Promise<void> {
  const cfg = node.config;
  switch (node.kind) {
    case "slack_send":
      await IntegrationBus.send("slack", String(cfg.channel || ""), String(cfg.message || "Pipeline triggered"));
      break;
    case "github_create_issue": {
      const gh = IntegrationBus.get("github") as any;
      if (gh) await gh.createIssue(String(cfg.title || "Pipeline Issue"), String(cfg.body || ""), String(cfg.repo || ""));
      break;
    }
    case "email_send":
      await IntegrationBus.send("email", String(cfg.to || ""), String(cfg.message || "Pipeline triggered"), { subject: cfg.subject });
      break;
    case "shell_command":
      // Shell commands run in the Docker sandbox via the existing ChannelRouter
      await ChannelRouter.route({
        userId: "pipeline_runner",
        intent: `Run this shell command in sandbox: ${cfg.command}`,
        channel: "api",
        a2aCertificate: undefined as any
      });
      break;
    case "invoke_agent":
      await ChannelRouter.route({
        userId: "pipeline_runner",
        intent: String(cfg.prompt || "Pipeline agent invocation"),
        channel: "api",
        a2aCertificate: undefined as any
      });
      break;
    default:
      console.warn(`[PipelineRunner] Unknown action kind: ${node.kind}`);
  }
}

export const PipelineRunner = {
  async run(pipeline: Pipeline, triggerContext: Record<string, unknown> = {}): Promise<PipelineRunRecord> {
    const start = Date.now();
    const record: PipelineRunRecord = {
      pipelineId: pipeline.id,
      runAt: start,
      success: false,
      durationMs: 0
    };

    try {
      console.log(`▶️ [PipelineRunner] Running pipeline: ${pipeline.name}`);

      // Build adjacency map
      const adjacency = new Map<string, string[]>();
      for (const edge of pipeline.edges) {
        const targets = adjacency.get(edge.source) || [];
        targets.push(edge.target);
        adjacency.set(edge.source, targets);
      }
      const nodeMap = new Map(pipeline.nodes.map(n => [n.id, n]));

      // Find the trigger node (entry point)
      const triggerNode = pipeline.nodes.find(n => n.type === "trigger");
      if (!triggerNode) throw new Error("Pipeline has no trigger node");

      // BFS walk from trigger
      const queue = adjacency.get(triggerNode.id) || [];
      for (const nodeId of queue) {
        const node = nodeMap.get(nodeId);
        if (!node) continue;

        if (node.type === "condition") {
          const pass = await evaluateCondition(node, triggerContext);
          if (!pass) {
            console.log(`[PipelineRunner] Condition "${node.kind}" failed — stopping.`);
            break;
          }
        } else if (node.type === "action" || node.type === "agent") {
          await executeAction(node, triggerContext);
        }

        // Enqueue next nodes
        const next = adjacency.get(nodeId) || [];
        queue.push(...next);
      }

      record.success = true;
      console.log(`✅ [PipelineRunner] Pipeline "${pipeline.name}" completed.`);
    } catch (err: any) {
      record.error = err.message;
      console.error(`❌ [PipelineRunner] Pipeline "${pipeline.name}" failed:`, err.message);
    }

    record.durationMs = Date.now() - start;
    _runHistory.unshift(record);
    if (_runHistory.length > 200) _runHistory.pop(); // keep last 200
    return record;
  },

  getHistory(pipelineId?: string): PipelineRunRecord[] {
    if (pipelineId) return _runHistory.filter(r => r.pipelineId === pipelineId);
    return _runHistory;
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
git add src/core/pipelineRunner.ts
git commit -m "feat(pipelines): add PipelineRunner — BFS graph evaluator for trigger/condition/action nodes"
```

---

## Task 4: Create pipeline CRUD routes

**Files:**
- Create: `src/routes/pipelineRoutes.ts`

- [ ] **Step 1: Write the file**

```typescript
// src/routes/pipelineRoutes.ts
import { Router, Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { Pipeline } from "../core/pipelineTypes";
import { PipelineRunner } from "../core/pipelineRunner";

const PIPELINES_DIR = path.resolve(process.cwd(), "src/workspace/pipelines");

async function ensureDir() {
  await fs.mkdir(PIPELINES_DIR, { recursive: true });
}

async function readPipeline(id: string): Promise<Pipeline | null> {
  try {
    const raw = await fs.readFile(path.join(PIPELINES_DIR, `${id}.json`), "utf8");
    return JSON.parse(raw) as Pipeline;
  } catch {
    return null;
  }
}

async function writePipeline(p: Pipeline): Promise<void> {
  await ensureDir();
  await fs.writeFile(path.join(PIPELINES_DIR, `${p.id}.json`), JSON.stringify(p, null, 2), "utf8");
}

export const pipelineRoutes = Router();

/** GET /api/v1/pipelines */
pipelineRoutes.get("/", async (_req: Request, res: Response) => {
  try {
    await ensureDir();
    const files = await fs.readdir(PIPELINES_DIR);
    const pipelines: Pipeline[] = [];
    for (const f of files.filter(f => f.endsWith(".json"))) {
      const raw = await fs.readFile(path.join(PIPELINES_DIR, f), "utf8");
      pipelines.push(JSON.parse(raw));
    }
    res.json({ success: true, pipelines: pipelines.sort((a, b) => b.updatedAt - a.updatedAt) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/v1/pipelines — create or update */
pipelineRoutes.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body as Partial<Pipeline>;
    const now = Date.now();
    const pipeline: Pipeline = {
      id:        body.id        || crypto.randomUUID(),
      name:      body.name      || "Untitled Pipeline",
      enabled:   body.enabled   ?? true,
      nodes:     body.nodes     || [],
      edges:     body.edges     || [],
      createdAt: body.createdAt || now,
      updatedAt: now
    };
    await writePipeline(pipeline);
    // Hot-reload: re-register in Observer
    const { Observer } = await import("../core/observer");
    await Observer.loadPipelines();
    res.json({ success: true, pipeline });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/v1/pipelines/:id */
pipelineRoutes.delete("/:id", async (req: Request, res: Response) => {
  try {
    await fs.unlink(path.join(PIPELINES_DIR, `${req.params.id}.json`));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/v1/pipelines/:id/toggle */
pipelineRoutes.post("/:id/toggle", async (req: Request, res: Response) => {
  try {
    const p = await readPipeline(req.params.id);
    if (!p) return res.status(404).json({ error: "Pipeline not found" });
    p.enabled = !p.enabled;
    p.updatedAt = Date.now();
    await writePipeline(p);
    res.json({ success: true, enabled: p.enabled });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/v1/pipelines/:id/runs */
pipelineRoutes.get("/:id/runs", (req: Request, res: Response) => {
  const history = PipelineRunner.getHistory(req.params.id);
  res.json({ success: true, runs: history });
});
```

- [ ] **Step 2: Type-check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Mount routes in server.ts**

In `src/server.ts`, add the import with the other route imports:
```typescript
import { pipelineRoutes } from "./routes/pipelineRoutes";
```

After `app.use("/api/v1/integrations", integrationRoutes);`, add:
```typescript
app.use("/api/v1/pipelines", pipelineRoutes);
```

- [ ] **Step 4: Type-check again**

```powershell
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```powershell
git add src/routes/pipelineRoutes.ts src/server.ts
git commit -m "feat(pipelines): add pipeline CRUD routes at /api/v1/pipelines"
```

---

## Task 5: Add loadPipelines to Observer

**Files:**
- Modify: `src/core/observer.ts`

- [ ] **Step 1: Read observer.ts**

Open `src/core/observer.ts` and find the `Observer` class or object and its `init()` or startup method.

- [ ] **Step 2: Add loadPipelines method**

Add this method to the `Observer` class/object:

```typescript
static async loadPipelines(): Promise<void> {
  const { PipelineRunner } = await import("./pipelineRunner");
  const pipelinesDir = path.resolve(process.cwd(), "src/workspace/pipelines");
  
  try {
    await fs.mkdir(pipelinesDir, { recursive: true });
    const files = await fs.readdir(pipelinesDir);
    const jsonFiles = files.filter(f => f.endsWith(".json"));
    
    // Clear existing pipeline cron jobs (stored in a static Map)
    if (!Observer._pipelineCrons) Observer._pipelineCrons = new Map();
    for (const [, task] of Observer._pipelineCrons) task.stop();
    Observer._pipelineCrons.clear();
    
    for (const file of jsonFiles) {
      try {
        const raw = await fs.readFile(path.join(pipelinesDir, file), "utf8");
        const pipeline = JSON.parse(raw);
        if (!pipeline.enabled) continue;
        
        const triggerNode = pipeline.nodes?.find((n: any) => n.type === "trigger");
        if (!triggerNode) continue;
        
        if (triggerNode.kind === "schedule" && triggerNode.config.cron) {
          const task = cron.schedule(triggerNode.config.cron, async () => {
            console.log(`⏰ [Observer] Firing scheduled pipeline: ${pipeline.name}`);
            await PipelineRunner.run(pipeline, { triggerKind: "schedule" });
          });
          Observer._pipelineCrons.set(pipeline.id, task);
          console.log(`📋 [Observer] Registered pipeline "${pipeline.name}" on cron: ${triggerNode.config.cron}`);
        }
      } catch (err: any) {
        console.warn(`⚠️ [Observer] Failed to load pipeline from ${file}:`, err.message);
      }
    }
    
    console.log(`✅ [Observer] Loaded ${Observer._pipelineCrons.size} active pipeline(s).`);
  } catch (err: any) {
    console.error(`❌ [Observer] loadPipelines failed:`, err.message);
  }
}

// Declare on the class (add next to other static fields):
static _pipelineCrons: Map<string, any> = new Map();
```

Note: `observer.ts` likely already imports `cron` from `node-cron` and `fs` from `fs/promises` and `path` — verify and add only what's missing.

- [ ] **Step 3: Call loadPipelines at server startup**

In `src/server.ts`, find where `Observer.init()` or `Observer.start()` is called. After it, add:
```typescript
Observer.loadPipelines().catch(err => console.error("Failed to load pipelines:", err));
```

- [ ] **Step 4: Type-check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```powershell
git add src/core/observer.ts src/server.ts
git commit -m "feat(pipelines): add Observer.loadPipelines — hot-register pipeline cron jobs at startup"
```

---

## Task 6: Create NodePalette component

**Files:**
- Create: `frontend/src/components/NodePalette.jsx`

- [ ] **Step 1: Write the file**

```jsx
// frontend/src/components/NodePalette.jsx
import React from 'react';
import { Clock, Webhook, FileText, AlignLeft, Timer, Calendar, Send, GitBranch, Mail, Terminal, Bot } from 'lucide-react';

const PALETTE_NODES = [
  {
    category: 'TRIGGERS',
    nodes: [
      { kind: 'schedule',    label: 'Schedule',    icon: Clock,    type: 'trigger', defaultConfig: { cron: '0 9 * * *' } },
      { kind: 'webhook',     label: 'Webhook',     icon: Webhook,  type: 'trigger', defaultConfig: { path: '/trigger' } },
      { kind: 'file_change', label: 'File Change', icon: FileText, type: 'trigger', defaultConfig: { glob: 'src/**/*.ts' } },
    ]
  },
  {
    category: 'CONDITIONS',
    nodes: [
      { kind: 'contains_text', label: 'Contains Text', icon: AlignLeft, type: 'condition', defaultConfig: { text: '' } },
      { kind: 'time_of_day',   label: 'Time of Day',   icon: Timer,     type: 'condition', defaultConfig: { fromHour: 9, toHour: 17 } },
      { kind: 'day_of_week',   label: 'Day of Week',   icon: Calendar,  type: 'condition', defaultConfig: { days: [1,2,3,4,5] } },
    ]
  },
  {
    category: 'ACTIONS',
    nodes: [
      { kind: 'slack_send',           label: 'Send Slack',     icon: Send,       type: 'action', defaultConfig: { channel: '#general', message: '' } },
      { kind: 'github_create_issue',  label: 'GitHub Issue',   icon: GitBranch,  type: 'action', defaultConfig: { title: '', body: '', repo: '' } },
      { kind: 'email_send',           label: 'Send Email',     icon: Mail,       type: 'action', defaultConfig: { to: '', subject: '', message: '' } },
      { kind: 'shell_command',        label: 'Shell Command',  icon: Terminal,   type: 'action', defaultConfig: { command: '' } },
    ]
  },
  {
    category: 'AGENT',
    nodes: [
      { kind: 'invoke_agent', label: 'Invoke Agent', icon: Bot, type: 'agent', defaultConfig: { prompt: '' } },
    ]
  }
];

const NodePalette = ({ onDragStart }) => (
  <div className="node-palette">
    {PALETTE_NODES.map(group => (
      <div key={group.category} className="palette-group">
        <div className="palette-group-label">{group.category}</div>
        {group.nodes.map(n => {
          const Icon = n.icon;
          return (
            <div
              key={n.kind}
              className={`palette-node palette-node-${n.type}`}
              draggable
              onDragStart={(e) => onDragStart(e, { type: n.type, kind: n.kind, label: n.label, defaultConfig: n.defaultConfig })}
            >
              <Icon size={12} />
              <span>{n.label}</span>
            </div>
          );
        })}
      </div>
    ))}
  </div>
);

export default NodePalette;
export { PALETTE_NODES };
```

- [ ] **Step 2: Commit**

```powershell
git add frontend/src/components/NodePalette.jsx
git commit -m "feat(pipelines): add NodePalette with trigger, condition, action, agent nodes"
```

---

## Task 7: Create NodeConfigPanel component

**Files:**
- Create: `frontend/src/components/NodeConfigPanel.jsx`

- [ ] **Step 1: Write the file**

```jsx
// frontend/src/components/NodeConfigPanel.jsx
import React from 'react';
import { X } from 'lucide-react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const NodeConfigPanel = ({ node, onUpdate, onClose }) => {
  if (!node) return null;
  const cfg = node.data?.config || {};

  const setField = (key, value) => {
    onUpdate(node.id, { ...cfg, [key]: value });
  };

  const renderFields = () => {
    switch (node.data?.kind) {
      case 'schedule':
        return (
          <>
            <label className="config-label">Cron Expression</label>
            <input className="config-input" value={cfg.cron || ''} onChange={e => setField('cron', e.target.value)} placeholder="0 9 * * *" />
            <p className="config-hint">e.g. "0 9 * * *" = every day at 9am</p>
          </>
        );
      case 'webhook':
        return (
          <>
            <label className="config-label">Webhook Path</label>
            <input className="config-input" value={cfg.path || ''} onChange={e => setField('path', e.target.value)} placeholder="/trigger/my-event" />
          </>
        );
      case 'file_change':
        return (
          <>
            <label className="config-label">File Glob Pattern</label>
            <input className="config-input" value={cfg.glob || ''} onChange={e => setField('glob', e.target.value)} placeholder="src/**/*.ts" />
          </>
        );
      case 'contains_text':
        return (
          <>
            <label className="config-label">Text to Match</label>
            <input className="config-input" value={cfg.text || ''} onChange={e => setField('text', e.target.value)} placeholder="error" />
          </>
        );
      case 'time_of_day':
        return (
          <>
            <label className="config-label">From Hour (0–23)</label>
            <input type="number" min={0} max={23} className="config-input" value={cfg.fromHour ?? 9} onChange={e => setField('fromHour', parseInt(e.target.value))} />
            <label className="config-label">To Hour (0–23)</label>
            <input type="number" min={0} max={23} className="config-input" value={cfg.toHour ?? 17} onChange={e => setField('toHour', parseInt(e.target.value))} />
          </>
        );
      case 'day_of_week':
        return (
          <>
            <label className="config-label">Active Days</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DAYS.map((d, i) => (
                <button
                  key={d}
                  className={`day-toggle ${(cfg.days || []).includes(i) ? 'active' : ''}`}
                  onClick={() => {
                    const days = cfg.days || [];
                    setField('days', days.includes(i) ? days.filter(x => x !== i) : [...days, i]);
                  }}
                >{d}</button>
              ))}
            </div>
          </>
        );
      case 'slack_send':
        return (
          <>
            <label className="config-label">Channel</label>
            <input className="config-input" value={cfg.channel || ''} onChange={e => setField('channel', e.target.value)} placeholder="#general" />
            <label className="config-label">Message</label>
            <textarea className="config-textarea" rows={3} value={cfg.message || ''} onChange={e => setField('message', e.target.value)} placeholder="Notification message..." />
          </>
        );
      case 'github_create_issue':
        return (
          <>
            <label className="config-label">Repository (owner/repo)</label>
            <input className="config-input" value={cfg.repo || ''} onChange={e => setField('repo', e.target.value)} placeholder="owner/repo" />
            <label className="config-label">Issue Title</label>
            <input className="config-input" value={cfg.title || ''} onChange={e => setField('title', e.target.value)} placeholder="Automated issue" />
            <label className="config-label">Body</label>
            <textarea className="config-textarea" rows={3} value={cfg.body || ''} onChange={e => setField('body', e.target.value)} placeholder="Issue description..." />
          </>
        );
      case 'email_send':
        return (
          <>
            <label className="config-label">To</label>
            <input className="config-input" value={cfg.to || ''} onChange={e => setField('to', e.target.value)} placeholder="user@example.com" />
            <label className="config-label">Subject</label>
            <input className="config-input" value={cfg.subject || ''} onChange={e => setField('subject', e.target.value)} placeholder="Notification" />
            <label className="config-label">Message</label>
            <textarea className="config-textarea" rows={3} value={cfg.message || ''} onChange={e => setField('message', e.target.value)} placeholder="Email body..." />
          </>
        );
      case 'shell_command':
        return (
          <>
            <label className="config-label">Command (runs in sandbox)</label>
            <textarea className="config-textarea" rows={3} value={cfg.command || ''} onChange={e => setField('command', e.target.value)} placeholder="npm run build" />
          </>
        );
      case 'invoke_agent':
        return (
          <>
            <label className="config-label">Agent Prompt</label>
            <textarea className="config-textarea" rows={5} value={cfg.prompt || ''} onChange={e => setField('prompt', e.target.value)} placeholder="Summarize my emails from today and send a Slack digest..." />
          </>
        );
      default:
        return <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No configuration for this node type.</p>;
    }
  };

  return (
    <div className="node-config-panel">
      <div className="config-header">
        <span>{node.data?.label || 'Node Config'}</span>
        <button onClick={onClose}><X size={14} /></button>
      </div>
      <div className="config-body">
        {renderFields()}
      </div>
    </div>
  );
};

export default NodeConfigPanel;
```

- [ ] **Step 2: Commit**

```powershell
git add frontend/src/components/NodeConfigPanel.jsx
git commit -m "feat(pipelines): add NodeConfigPanel with per-kind field editors"
```

---

## Task 8: Create PipelineView component

**Files:**
- Create: `frontend/src/components/PipelineView.jsx`

- [ ] **Step 1: Write the file**

```jsx
// frontend/src/components/PipelineView.jsx
import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesChange,
  useEdgesChange,
  applyNodeChanges,
  applyEdgeChanges,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Plus, Play, Save, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import NodePalette from './NodePalette';
import NodeConfigPanel from './NodeConfigPanel';
import crypto from 'crypto';

const NODE_COLORS = {
  trigger:   '#1771c9',
  condition: '#FFC107',
  action:    '#47c251',
  agent:     '#a855f7',
};

function buildRFNode(id, type, kind, label, config, position) {
  return {
    id,
    type: 'default',
    position,
    data: { label, type, kind, config },
    style: {
      background: 'var(--bg-secondary)',
      border: `2px solid ${NODE_COLORS[type] || '#666'}`,
      borderRadius: 6,
      color: 'var(--text-primary)',
      fontSize: 11,
      padding: '6px 10px',
      minWidth: 120,
    }
  };
}

const PipelineView = () => {
  const [pipelines, setPipelines] = useState([]);
  const [activePipelineId, setActivePipelineId] = useState(null);
  const [pipelineName, setPipelineName] = useState('Untitled Pipeline');
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const reactFlowWrapper = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);

  useEffect(() => {
    fetch('/api/v1/pipelines')
      .then(r => r.json())
      .then(d => setPipelines(d.pipelines || []));
  }, []);

  const onNodesChange = useCallback(changes => setNodes(ns => applyNodeChanges(changes, ns)), []);
  const onEdgesChange = useCallback(changes => setEdges(es => applyEdgeChanges(changes, es)), []);
  const onConnect     = useCallback(conn  => setEdges(es => addEdge(conn, es)), []);

  const onDragOver = useCallback(e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }, []);

  const onDrop = useCallback(e => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/midpointx-node');
    if (!raw) return;
    const { type, kind, label, defaultConfig } = JSON.parse(raw);
    const bounds = reactFlowWrapper.current?.getBoundingClientRect();
    const pos = reactFlowInstance?.project({ x: e.clientX - (bounds?.left || 0), y: e.clientY - (bounds?.top || 0) });
    if (!pos) return;
    const id = `${kind}-${Date.now()}`;
    setNodes(ns => [...ns, buildRFNode(id, type, kind, label, defaultConfig, pos)]);
  }, [reactFlowInstance]);

  const onDragStart = (e, nodeData) => {
    e.dataTransfer.setData('application/midpointx-node', JSON.stringify(nodeData));
    e.dataTransfer.effectAllowed = 'move';
  };

  const onNodeClick = useCallback((_e, node) => setSelectedNode(node), []);

  const handleConfigUpdate = (nodeId, newConfig) => {
    setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, data: { ...n.data, config: newConfig } } : n));
  };

  const handleSave = async () => {
    const pipelineNodes = nodes.map(n => ({
      id: n.id,
      type: n.data.type,
      kind: n.data.kind,
      config: n.data.config || {},
      position: n.position
    }));
    const pipelineEdges = edges.map(e => ({ source: e.source, target: e.target }));
    const body = {
      id: activePipelineId || undefined,
      name: pipelineName,
      enabled: true,
      nodes: pipelineNodes,
      edges: pipelineEdges
    };
    const res = await fetch('/api/v1/pipelines', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (data.success) {
      setActivePipelineId(data.pipeline.id);
      setPipelines(prev => {
        const idx = prev.findIndex(p => p.id === data.pipeline.id);
        if (idx >= 0) { const next = [...prev]; next[idx] = data.pipeline; return next; }
        return [data.pipeline, ...prev];
      });
    }
  };

  const handleNew = () => {
    setActivePipelineId(null);
    setPipelineName('Untitled Pipeline');
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
  };

  const loadPipeline = (p) => {
    setActivePipelineId(p.id);
    setPipelineName(p.name);
    setNodes(p.nodes.map(n => buildRFNode(n.id, n.type, n.kind, n.kind.replace(/_/g, ' '), n.config, n.position)));
    setEdges(p.edges.map((e, i) => ({ id: `e${i}`, source: e.source, target: e.target })));
    setSelectedNode(null);
  };

  return (
    <div className="pipeline-view">
      <div className="pipeline-sidebar-left">
        <NodePalette onDragStart={onDragStart} />
        <div className="pipeline-list-section">
          <div className="pipeline-list-header">SAVED PIPELINES</div>
          {pipelines.map(p => (
            <button key={p.id} className={`pipeline-list-item ${p.id === activePipelineId ? 'active' : ''}`} onClick={() => loadPipeline(p)}>
              <span className={`pipeline-enabled-dot ${p.enabled ? 'on' : 'off'}`} />
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="pipeline-canvas-area" ref={reactFlowWrapper}>
        <div className="pipeline-toolbar">
          <input
            className="pipeline-name-input"
            value={pipelineName}
            onChange={e => setPipelineName(e.target.value)}
          />
          <button className="pipeline-btn" onClick={handleNew}><Plus size={13} /> New</button>
          <button className="pipeline-btn pipeline-btn-primary" onClick={handleSave}><Save size={13} /> Deploy</button>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onInit={setReactFlowInstance}
          onNodeClick={onNodeClick}
          fitView
        >
          <Background color="rgba(255,255,255,0.05)" gap={20} />
          <Controls />
          <MiniMap nodeColor={n => NODE_COLORS[n.data?.type] || '#666'} style={{ background: 'var(--bg-secondary)' }} />
        </ReactFlow>
      </div>

      {selectedNode && (
        <NodeConfigPanel
          node={selectedNode}
          onUpdate={handleConfigUpdate}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
};

export default PipelineView;
```

- [ ] **Step 2: Commit**

```powershell
git add frontend/src/components/PipelineView.jsx
git commit -m "feat(pipelines): add PipelineView with React Flow canvas, drag-and-drop, save/deploy"
```

---

## Task 9: Wire PipelineView into App + Sidebar

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Sidebar.jsx`

- [ ] **Step 1: Add import in App.jsx**

```jsx
import PipelineView from './components/PipelineView';
```

- [ ] **Step 2: Add view in App.jsx render**

After `{activeView === 'memory' && <MemoryBrowser />}`, add:
```jsx
{activeView === 'pipelines' && <PipelineView />}
```

- [ ] **Step 3: Add nav item in Sidebar.jsx**

Add `Workflow` to the lucide import:
```jsx
import { ..., Workflow } from 'lucide-react';
```

Add to `navItems`:
```jsx
{ id: 'pipelines', label: 'PIPELINES', icon: Workflow },
```

Full updated navItems:
```jsx
const navItems = [
  { id: 'chat',      label: 'OPERATIONS', icon: MessageSquare },
  { id: 'swarm',     label: 'SWARM',      icon: Network },
  { id: 'memory',    label: 'MEMORY',     icon: Brain },
  { id: 'pipelines', label: 'PIPELINES',  icon: Workflow },
  { id: 'skills',    label: 'SKILLS',     icon: Box },
  { id: 'schedule',  label: 'SCHEDULE',   icon: Calendar },
  { id: 'settings',  label: 'CONFIG',     icon: Settings },
];
```

- [ ] **Step 4: Commit**

```powershell
git add frontend/src/App.jsx frontend/src/components/Sidebar.jsx
git commit -m "feat(pipelines): wire PipelineView and PIPELINES nav item"
```

---

## Task 10: Add Pipeline styles

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Append to index.css**

```css
/* ============================================================
   PIPELINE BUILDER
   ============================================================ */

.pipeline-view {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.pipeline-sidebar-left {
  width: 180px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border);
  overflow-y: auto;
  background: var(--bg-primary);
}

.node-palette {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.palette-group-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.2px;
  color: var(--text-secondary);
  padding: 8px 4px 4px;
}

.palette-node {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 11px;
  cursor: grab;
  border: 1px solid var(--border);
  background: rgba(255,255,255,0.02);
  user-select: none;
}

.palette-node:active { cursor: grabbing; }
.palette-node-trigger   { border-left: 3px solid #1771c9; }
.palette-node-condition { border-left: 3px solid #FFC107; }
.palette-node-action    { border-left: 3px solid #47c251; }
.palette-node-agent     { border-left: 3px solid #a855f7; }

.pipeline-list-section {
  padding: 8px;
  border-top: 1px solid var(--border);
  margin-top: auto;
}

.pipeline-list-header {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--text-secondary);
  padding: 6px 4px;
}

.pipeline-list-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 11px;
  padding: 5px 8px;
  border-radius: 4px;
  cursor: pointer;
}

.pipeline-list-item.active {
  background: rgba(23,113,201,0.1);
  color: var(--accent-teal);
}

.pipeline-enabled-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.pipeline-enabled-dot.on  { background: var(--accent-neon); }
.pipeline-enabled-dot.off { background: var(--text-secondary); opacity: 0.4; }

.pipeline-canvas-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.pipeline-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-primary);
}

.pipeline-name-input {
  flex: 1;
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 4px 8px;
  color: var(--text-primary);
  font-size: 12px;
  font-family: inherit;
}

.pipeline-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 11px;
  padding: 4px 10px;
  cursor: pointer;
}

.pipeline-btn-primary {
  background: rgba(71,194,81,0.15);
  border-color: var(--accent-neon);
  color: var(--accent-neon);
}

.node-config-panel {
  width: 240px;
  flex-shrink: 0;
  border-left: 1px solid var(--border);
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  font-weight: 700;
}

.config-header button {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
}

.config-body {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.config-label {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-secondary);
  letter-spacing: 0.5px;
}

.config-input, .config-textarea {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 6px 8px;
  color: var(--text-primary);
  font-size: 11px;
  font-family: inherit;
  width: 100%;
  box-sizing: border-box;
}

.config-textarea { resize: vertical; }

.config-hint {
  font-size: 10px;
  color: var(--text-secondary);
  opacity: 0.7;
  margin: 0;
}

.day-toggle {
  background: none;
  border: 1px solid var(--border);
  border-radius: 3px;
  color: var(--text-secondary);
  font-size: 10px;
  padding: 3px 6px;
  cursor: pointer;
}

.day-toggle.active {
  background: rgba(23,113,201,0.2);
  border-color: var(--accent-teal);
  color: var(--accent-teal);
}
```

- [ ] **Step 2: Commit**

```powershell
git add frontend/src/index.css
git commit -m "feat(pipelines): add pipeline editor CSS — canvas, palette, toolbar, config panel"
```

---

## Task 11: Verify the full feature

- [ ] **Step 1: Full type-check**

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

- [ ] **Step 4: Verify PipelineView**

Open `http://localhost:5001`. Click `PIPELINES` in the sidebar. Expected: React Flow canvas with node palette on the left, empty canvas.

- [ ] **Step 5: Build and deploy a pipeline**

1. Drag a `Schedule` trigger onto the canvas.
2. Click it — config panel opens on the right. Set cron to `* * * * *` (every minute).
3. Drag a `Send Slack` action onto the canvas.
4. Draw an edge from the Schedule node to the Slack node.
5. Configure the Slack node with channel `#general` and a message.
6. Click `Deploy`. Expected: pipeline saved, appears in the left panel list with a green dot.
7. Wait 1 minute. Expected: Slack message received (if `SLACK_BOT_TOKEN` is configured) and run history available at `GET /api/v1/pipelines/:id/runs`.

- [ ] **Step 6: Final commit**

```powershell
git add -A
git commit -m "feat(phase4): complete Visual Workflow Builder — React Flow canvas, pipeline CRUD, cron execution"
```
