# MidpointX — Competitive Moat vs. OpenClaw
**Date:** 2026-06-10  
**Status:** Approved for implementation  
**Scope:** Four-phase feature build to create a decisive competitive advantage over AI agent platforms (OpenClaw, Hermes AI Agent). Each phase ships independently.

---

## 1. Goal

Make MidpointX the best AI agent platform for personal power users by winning on three dimensions simultaneously:

1. **UI/Experience** — real-time multi-agent visualization no competitor matches
2. **Agent Intelligence** — persistent cross-session memory that makes agents genuinely contextual
3. **Integrations & Reach** — proactive outbound connectors (Slack, GitHub, email, webhooks)
4. **No-code automation** — visual pipeline builder for wiring triggers, conditions, and agent actions

**Demo north star (Phase 1):** A viewer comparing MidpointX to OpenClaw should say "I can see every agent thinking in real time" within 30 seconds of opening the app.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    MIDPOINTX COMPETITIVE MOAT                   │
├──────────────────┬──────────────────┬───────────────────────────┤
│  PHASE 1         │  PHASE 2         │  PHASE 3 + 4              │
│  Swarm Visualizer│  Memory Layer    │  Integration Hub +        │
│  (Frontend wow)  │  (Cross-session) │  Workflow Builder         │
├──────────────────┴──────────────────┴───────────────────────────┤
│                    EXISTING FOUNDATIONS                         │
│  LangGraph (18 nodes) · Swarm Workers · Observer · Scheduler   │
│  Docker Sandbox · A2A Protocol · Socket.io · Command Center    │
└─────────────────────────────────────────────────────────────────┘
```

Phases are sequenced so each delivers standalone value:
- **Phase 1** instruments existing swarm nodes + adds SwarmView frontend
- **Phase 2** promotes ephemeral memory to SQLite + adds Memory Browser frontend
- **Phase 3** adds Slack/GitHub/email connectors unified under an IntegrationBus
- **Phase 4** adds a React Flow pipeline editor backed by observer.ts

---

## 3. Phase 1 — Swarm Visualizer

### 3.1 Goal
Instrument `ResearcherActor`, `DeveloperActor`, and `TesterActor` to emit granular socket events, then surface them in a new `SwarmView` frontend panel showing live agent cards and inter-agent message flow.

### 3.2 Backend — Socket Events

New helper `emitSwarmEvent(type, payload)` added to `src/core/channelRouter.ts`. All swarm worker nodes call it at key lifecycle points.

| Event | Trigger | Payload |
|---|---|---|
| `swarm:agent_spawned` | Worker node starts | `{ agentId, role, task, parentId }` |
| `swarm:agent_progress` | Each LLM step | `{ agentId, step, message, tokensUsed }` |
| `swarm:agent_message` | Inter-agent handoff | `{ fromId, toId, content, type }` |
| `swarm:agent_complete` | Worker node finishes | `{ agentId, result, duration, tokensUsed }` |
| `swarm:agent_error` | Worker throws | `{ agentId, error }` |

### 3.3 Frontend — SwarmView

New full-screen view toggled from the Sidebar nav (alongside Operations/Skills/Settings).

**Agent Cards Grid (left 60%):**
- One card per active agent with: role badge, current task (60 char truncation), animated progress bar, live token count + elapsed time, collapsible message log
- Cards animate in on `swarm:agent_spawned`, dim + show checkmark on `swarm:agent_complete`

**Message Flow Panel (right 40%):**
- Chronological stream of inter-agent messages
- Color-coded by sender role: Research=blue, Developer=green, Tester=amber
- Each entry: `FROM → TO: message` truncated to 100 chars with expand toggle

### 3.4 Files Changed

| File | Change |
|---|---|
| `src/core/channelRouter.ts` | Add `emitSwarmEvent()` helper |
| `src/nodes/swarmWorkerNodes.ts` | Instrument with swarm socket events |
| `frontend/src/components/SwarmView.jsx` | New file |
| `frontend/src/components/AgentCard.jsx` | New file |
| `frontend/src/App.jsx` | Wire SwarmView + swarm socket events |
| `frontend/src/index.css` | SwarmView styles |
| `frontend/src/components/Sidebar.jsx` | Add Swarm nav item |

---

## 4. Phase 2 — Persistent Memory Layer

### 4.1 Goal
Promote `src/core/memory.ts` from an ephemeral in-memory Map to a SQLite-backed persistent store. Inject top recalled memories into every agent prompt. Surface memories in a Memory Browser frontend panel.

### 4.2 Backend — Memory Store

**SQLite schema:**
```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  type TEXT,          -- 'fact' | 'project' | 'preference' | 'learned'
  key TEXT,           -- human-readable slug (e.g. "user.stack.language")
  value TEXT,         -- JSON blob
  source TEXT,        -- which agent wrote it
  confidence REAL,    -- 0.0–1.0
  created_at INTEGER,
  last_accessed INTEGER,
  access_count INTEGER
);
```

**Memory operations:**
| Method | Purpose |
|---|---|
| `remember(key, value, type, source)` | Write or upsert a memory; sets `confidence` to 1.0 for user-written, 0.7 for agent-written |
| `recall(query, limit)` | SQLite `LIKE '%query%'` on key + value, ranked by `last_accessed DESC` |
| `forget(key)` | Hard delete |
| `summarize()` | Returns top 20 memories ordered by `access_count DESC` for prompt injection |

**Prompt injection:** `src/core/prompt.ts` gains `buildContextBlock()` — prepends top 10 recalled memories to every agent invocation.

**New API routes:**
| Route | Purpose |
|---|---|
| `GET /api/v1/memories` | List all memories (paginated) |
| `POST /api/v1/memories` | Manually add a memory |
| `DELETE /api/v1/memories/:id` | Forget a memory |
| `GET /api/v1/memories/search?q=` | Search memories |

### 4.3 Frontend — Memory Browser

New panel in Sidebar nav. Displays memories color-coded by type (fact=blue, project=green, preference=amber, learned=purple). Each row shows key, value preview, and access hit count. Rows are deletable. `+ Add` button opens a modal for manual memory entry. Search input filters by key/value.

### 4.4 Files Changed

| File | Change |
|---|---|
| `src/core/memory.ts` | Full rewrite to SQLite-backed store |
| `src/core/prompt.ts` | Add `buildContextBlock()` for memory injection |
| `src/routes/memoryRoutes.ts` | New CRUD routes |
| `src/server.ts` | Register memory routes |
| `frontend/src/components/MemoryBrowser.jsx` | New file |
| `frontend/src/components/Sidebar.jsx` | Add Memory nav item |
| `frontend/src/App.jsx` | Wire MemoryBrowser view |

---

## 5. Phase 3 — Integration Hub

### 5.1 Goal
Unified outbound connector layer for Slack, GitHub, email, and inbound webhooks. Each connector is exposed as an MCP tool so agents can call them directly during task execution.

### 5.2 Backend — IntegrationBus

New `src/core/integrationBus.ts` — all connectors register here and implement:
```ts
interface Connector {
  id: string;
  send(channel: string, message: string, options?: object): Promise<void>;
  receive(handler: (event: InboundEvent) => void): void;
  healthCheck(): Promise<boolean>;
}
```

Existing `discordService.ts` and `telegramService.ts` are refactored to implement this interface (no behavior change).

**New connectors:**
| Connector | File | Capabilities |
|---|---|---|
| Slack | `src/services/slackService.ts` | Send messages, receive slash commands, post to channels |
| GitHub | `src/services/githubService.ts` | Create issues, comment on PRs, push files, read repo state |
| Email | `src/services/emailService.ts` | Send via SMTP/SendGrid, read via IMAP polling |
| Webhook (inbound) | `src/core/observer.ts` (extend) | Receive arbitrary POST payloads, route to graph |

**MCP tool registration:** Each connector registers `slack_send`, `github_create_issue`, `email_send`, etc. in `src/core/pluginRegistry.ts`.

**New config fields** (Zod-validated in `src/core/config.ts`):
```
SLACK_BOT_TOKEN, SLACK_DEFAULT_CHANNEL
GITHUB_TOKEN, GITHUB_DEFAULT_REPO
SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
SENDGRID_API_KEY
```

**New API routes:**
| Route | Purpose |
|---|---|
| `GET /api/v1/integrations/status` | Health of all connectors |
| `POST /api/v1/integrations/:id/test` | Send test message |
| `GET /api/v1/integrations/webhooks` | List inbound webhook endpoints |
| `POST /api/v1/integrations/webhooks` | Register new webhook |

### 5.3 Frontend — Integration Hub Panel

New tab inside `SettingsView.jsx` showing each connector with live health status dot, connection summary, and `[Configure]` button that opens a credential modal with test ping.

### 5.4 Files Changed

| File | Change |
|---|---|
| `src/core/integrationBus.ts` | New unified connector dispatcher |
| `src/services/slackService.ts` | New Slack connector |
| `src/services/githubService.ts` | New GitHub connector |
| `src/services/emailService.ts` | New email connector |
| `src/core/config.ts` | New integration config fields |
| `src/core/pluginRegistry.ts` | Register connectors as MCP tools |
| `src/routes/integrationRoutes.ts` | New CRUD + status routes |
| `src/server.ts` | Register integration routes |
| `frontend/src/components/SettingsView.jsx` | Add Integrations tab |

---

## 6. Phase 4 — Visual Workflow Builder

### 6.1 Goal
Users drag nodes onto a canvas to wire automated pipelines — no code required. Pipelines are stored as JSON and loaded by `observer.ts` at runtime (hot-reload, no restart).

### 6.2 Backend — Pipeline Runtime

**Pipeline schema:**
```ts
interface Pipeline {
  id: string;
  name: string;
  enabled: boolean;
  nodes: PipelineNode[];
  edges: { source: string; target: string }[];
}

interface PipelineNode {
  id: string;
  type: 'trigger' | 'condition' | 'action' | 'agent';
  config: Record<string, unknown>;
  position: { x: number; y: number };
}
```

Pipelines stored in `src/workspace/pipelines/` as JSON. `src/core/observer.ts` loads them on startup and on `POST /api/v1/pipelines` (no restart required).

New `src/core/pipelineRunner.ts` evaluates the node graph at runtime: resolves trigger → walks edges → evaluates conditions → executes actions/agents in order.

**Node types at launch:**
| Category | Nodes |
|---|---|
| Triggers | Schedule (cron), Webhook inbound, File change, Slack message |
| Conditions | Contains text, Time of day, Day of week, Agent confidence threshold |
| Actions | Send Slack, Create GitHub issue, Send email, Run shell command (sandboxed) |
| Agent | Invoke MidpointX cognitive loop with a prompt template |

**New API routes:**
| Route | Purpose |
|---|---|
| `GET /api/v1/pipelines` | List all pipelines |
| `POST /api/v1/pipelines` | Create / update pipeline |
| `DELETE /api/v1/pipelines/:id` | Delete pipeline |
| `POST /api/v1/pipelines/:id/toggle` | Enable / disable |
| `GET /api/v1/pipelines/:id/runs` | Execution history |

### 6.3 Frontend — Pipeline Editor

New `PipelineView` added to Sidebar nav. Built on **React Flow**.

- **Node Palette** (left sidebar): Trigger / Condition / Action / Agent nodes draggable onto canvas
- **Canvas**: Nodes connect via output→input port dragging. Click a node to open config panel.
- **Config Panel** (right sidebar, context-sensitive): Type-specific fields — cron expression builder, prompt template editor, Slack channel picker, etc.
- **Toolbar**: `[+ New]` `[▶ Deploy]` `[💾 Save]` `[⏸ Disable]`
- **Pipeline List** (bottom strip): Active pipelines with last-run status and toggle

Deploy serializes canvas JSON → POST to backend → observer registers immediately.

### 6.4 Files Changed

| File | Change |
|---|---|
| `src/core/observer.ts` | Add pipeline loader + hot-reload |
| `src/core/pipelineRunner.ts` | New — evaluates node graph at runtime |
| `src/routes/pipelineRoutes.ts` | New CRUD + run history routes |
| `src/server.ts` | Register pipeline routes |
| `frontend/src/components/PipelineView.jsx` | New file (React Flow canvas) |
| `frontend/src/components/NodePalette.jsx` | New file |
| `frontend/src/components/NodeConfigPanel.jsx` | New file |
| `frontend/src/components/Sidebar.jsx` | Add Pipelines nav item |
| `frontend/package.json` | Add `reactflow` dependency |

---

## 7. Phase Dependencies

Phase 4 pipeline action nodes (`Send Slack`, `Create GitHub issue`, `Send email`) call the connectors built in Phase 3. Phase 4 can be built in parallel with Phase 3, but the integration action nodes cannot be functionally tested until Phase 3 connectors are wired. The pipeline builder canvas and trigger/condition nodes are fully independent of Phase 3.

Phases 1 and 2 are fully independent of each other and of Phases 3–4.

---

## 9. Out of Scope

- Mobile/responsive layout
- Cloud sync or multi-user support
- LLM fine-tuning or model hosting
- Billing / usage metering UI
- OAuth flows for integrations (use static tokens for now)

---

## 10. Phase Sequence Summary

| Phase | Deliverable | New Dependencies |
|---|---|---|
| 1 | Swarm Visualizer (SwarmView + AgentCard) | None |
| 2 | Persistent Memory (memory.ts rewrite + MemoryBrowser) | `better-sqlite3` (already present) |
| 3 | Integration Hub (Slack/GitHub/email + IntegrationBus) | `@slack/web-api`, `@octokit/rest`, `nodemailer` |
| 4 | Visual Workflow Builder (PipelineView + pipelineRunner) | `reactflow` |
