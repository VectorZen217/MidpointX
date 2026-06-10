# Phase 1: Swarm Visualizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instrument the existing ResearcherActor, DeveloperActor, and TesterActor swarm nodes to emit structured socket events, then surface them in a new SwarmView frontend panel showing live agent cards and inter-agent message flow.

**Architecture:** A new `SwarmBus` singleton (module-level) holds the Socket.io `io` instance set by `server.ts` at startup, letting any node deep in the graph emit socket events without passing `io` through the call stack. The frontend listens for `swarm:*` events and maintains an `agents` map keyed by `agentId`.

**Tech Stack:** TypeScript (backend), React + Socket.io-client (frontend), Lucide icons (already installed), existing CSS variables.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/core/swarmBus.ts` | Create | Singleton that holds `io` reference; `emit()` wrapper |
| `src/server.ts` | Modify | Call `SwarmBus.init(io)` after creating io |
| `src/nodes/swarmWorkerNodes.ts` | Modify | Emit swarm events at lifecycle points |
| `frontend/src/components/SwarmView.jsx` | Create | Full-screen swarm panel with agent cards + message flow |
| `frontend/src/components/AgentCard.jsx` | Create | Individual agent card with progress bar and message log |
| `frontend/src/App.jsx` | Modify | Add swarm socket listeners + wire SwarmView |
| `frontend/src/components/Sidebar.jsx` | Modify | Add Swarm nav item |
| `frontend/src/index.css` | Modify | SwarmView + AgentCard styles |

---

## Task 1: Create SwarmBus singleton

**Files:**
- Create: `src/core/swarmBus.ts`

- [ ] **Step 1: Write the file**

```typescript
// src/core/swarmBus.ts
import type { Server } from "socket.io";

let _io: Server | null = null;

export const SwarmBus = {
  init(io: Server): void {
    _io = io;
  },

  emit(event: string, payload: object): void {
    if (_io) {
      _io.emit(event, payload);
    }
  }
};
```

- [ ] **Step 2: Type-check**

```powershell
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```powershell
git add src/core/swarmBus.ts
git commit -m "feat(swarm): add SwarmBus singleton for cross-node socket event emission"
```

---

## Task 2: Initialize SwarmBus in server.ts

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: Add SwarmBus import after the existing imports**

In `src/server.ts`, find the line:
```typescript
import { makeConfigRoutes } from "./routes/configRoutes";
```

Add immediately after:
```typescript
import { SwarmBus } from "./core/swarmBus";
```

- [ ] **Step 2: Initialize SwarmBus after io is created**

Find this line in `src/server.ts`:
```typescript
const io = new Server(httpServer, {
  cors: { origin: allowedOrigins }
});
```

Add immediately after:
```typescript
SwarmBus.init(io);
```

- [ ] **Step 3: Type-check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```powershell
git add src/server.ts
git commit -m "feat(swarm): initialize SwarmBus with io instance at server startup"
```

---

## Task 3: Instrument swarmWorkerNodes.ts

**Files:**
- Modify: `src/nodes/swarmWorkerNodes.ts`

- [ ] **Step 1: Add SwarmBus import**

At the top of `src/nodes/swarmWorkerNodes.ts`, after the existing imports, add:
```typescript
import { SwarmBus } from "../core/swarmBus";
```

- [ ] **Step 2: Instrument researchWorkerNode**

Replace the existing `researchWorkerNode` function body with:
```typescript
export async function researchWorkerNode(state: typeof MidpointXState.State) {
  const agentId = `researcher-${Date.now()}`;
  console.log(`🔍 [ResearcherAgent] Executing sub-goal: "${state.workerSubGoal}"`);

  SwarmBus.emit("swarm:agent_spawned", {
    agentId,
    role: "researcher",
    task: state.workerSubGoal || "Research task",
    parentId: state.taskId
  });

  const model = LLMFactory.getModel({ temperature: 0.1, tier: "worker" });
  const agentPersona = WorkspaceLoader.getAgentPersona();

  const payload = [
    new SystemMessage(`You are the specialized MidpointX ResearcherAgent.\n${agentPersona}\n
Your mandate is to gather information, search files, read documentation, and discover APIs.
Output your research findings in a clean, highly structured Markdown report. Limit yourself strictly to investigation and research. Do not attempt to modify code or run tests.`),
    new HumanMessage(`Sub-Goal to Investigate: ${state.workerSubGoal}\n\nCurrent Action History Context:\n${JSON.stringify(state.actionHistory.slice(-5))}`)
  ];

  SwarmBus.emit("swarm:agent_progress", {
    agentId,
    step: "Invoking LLM",
    message: "Analyzing task and gathering information...",
    tokensUsed: 0
  });

  const response = await invokeWithResilience(model, payload);
  const textOutput = extractText(response.content);
  const tokensUsed = (response.usage_metadata?.input_tokens || 0) + (response.usage_metadata?.output_tokens || 0);

  SwarmBus.emit("swarm:agent_complete", {
    agentId,
    result: textOutput.substring(0, 200),
    duration: 0,
    tokensUsed
  });

  console.log(`✅ [ResearcherAgent] Investigation complete.`);

  return A2AProtocol.commit("ResearcherAgent", {
    workerOutput: textOutput,
    totalInputTokens: response.usage_metadata?.input_tokens || 0,
    totalOutputTokens: response.usage_metadata?.output_tokens || 0
  }, state);
}
```

- [ ] **Step 3: Instrument developerWorkerNode**

Replace the existing `developerWorkerNode` function body with:
```typescript
export async function developerWorkerNode(state: typeof MidpointXState.State) {
  const agentId = `developer-${Date.now()}`;
  console.log(`💻 [DeveloperAgent] Executing sub-goal: "${state.workerSubGoal}"`);

  SwarmBus.emit("swarm:agent_spawned", {
    agentId,
    role: "developer",
    task: state.workerSubGoal || "Development task",
    parentId: state.taskId
  });

  const model = LLMFactory.getModel({ temperature: 0.2, tier: "worker" });
  const agentPersona = WorkspaceLoader.getAgentPersona();

  const payload = [
    new SystemMessage(`You are the specialized MidpointX DeveloperAgent.\n${agentPersona}\n
Your mandate is to write clean, maintainable TypeScript/JavaScript code, perform surgical edits, refactor components, and design implementation patterns.
Analyze the researcher's findings and user goals, and draft precise code updates or structural refactoring blocks. Focus exclusively on development tasks.`),
    new HumanMessage(`Sub-Goal to Implement: ${state.workerSubGoal}\n\nResearcher Input/Context:\n${state.workerOutput}\n\nCurrent Action History Context:\n${JSON.stringify(state.actionHistory.slice(-5))}`)
  ];

  SwarmBus.emit("swarm:agent_progress", {
    agentId,
    step: "Invoking LLM",
    message: "Synthesizing implementation from research output...",
    tokensUsed: 0
  });

  // Emit inter-agent message to show handoff from researcher
  if (state.workerOutput) {
    SwarmBus.emit("swarm:agent_message", {
      fromId: `researcher`,
      toId: agentId,
      content: state.workerOutput.substring(0, 120),
      type: "handoff"
    });
  }

  const response = await invokeWithResilience(model, payload);
  const textOutput = extractText(response.content);
  const tokensUsed = (response.usage_metadata?.input_tokens || 0) + (response.usage_metadata?.output_tokens || 0);

  SwarmBus.emit("swarm:agent_complete", {
    agentId,
    result: textOutput.substring(0, 200),
    duration: 0,
    tokensUsed
  });

  console.log(`✅ [DeveloperAgent] Synthesis complete.`);

  return A2AProtocol.commit("DeveloperAgent", {
    workerOutput: textOutput,
    totalInputTokens: response.usage_metadata?.input_tokens || 0,
    totalOutputTokens: response.usage_metadata?.output_tokens || 0
  }, state);
}
```

- [ ] **Step 4: Instrument testerWorkerNode**

Replace the existing `testerWorkerNode` function body with:
```typescript
export async function testerWorkerNode(state: typeof MidpointXState.State) {
  const agentId = `tester-${Date.now()}`;
  console.log(`🧪 [TesterAgent] Executing sub-goal: "${state.workerSubGoal}"`);

  SwarmBus.emit("swarm:agent_spawned", {
    agentId,
    role: "tester",
    task: state.workerSubGoal || "Verification task",
    parentId: state.taskId
  });

  const model = LLMFactory.getModel({ temperature: 0.1, tier: "worker" });
  const agentPersona = WorkspaceLoader.getAgentPersona();

  const payload = [
    new SystemMessage(`You are the specialized MidpointX TesterAgent.\n${agentPersona}\n
Your mandate is to run test suites, check linter output, execute tsc type checking, audit security boundaries, and evaluate system stability.
Identify edge cases, failure scenarios, and verify builds based on developer outputs.`),
    new HumanMessage(`Sub-Goal to Verify: ${state.workerSubGoal}\n\nDeveloper Output to Verify:\n${state.workerOutput}\n\nCompiler Trace Context:\n${state.compilerTrace || "No trace active"}`)
  ];

  SwarmBus.emit("swarm:agent_progress", {
    agentId,
    step: "Invoking LLM",
    message: "Verifying developer output for correctness...",
    tokensUsed: 0
  });

  if (state.workerOutput) {
    SwarmBus.emit("swarm:agent_message", {
      fromId: `developer`,
      toId: agentId,
      content: state.workerOutput.substring(0, 120),
      type: "handoff"
    });
  }

  const response = await invokeWithResilience(model, payload);
  const textOutput = extractText(response.content);
  const tokensUsed = (response.usage_metadata?.input_tokens || 0) + (response.usage_metadata?.output_tokens || 0);

  SwarmBus.emit("swarm:agent_complete", {
    agentId,
    result: textOutput.substring(0, 200),
    duration: 0,
    tokensUsed
  });

  console.log(`✅ [TesterAgent] Verification planning complete.`);

  return A2AProtocol.commit("TesterAgent", {
    workerOutput: textOutput,
    totalInputTokens: response.usage_metadata?.input_tokens || 0,
    totalOutputTokens: response.usage_metadata?.output_tokens || 0
  }, state);
}
```

- [ ] **Step 5: Type-check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```powershell
git add src/nodes/swarmWorkerNodes.ts
git commit -m "feat(swarm): instrument ResearcherActor, DeveloperActor, TesterActor with swarm socket events"
```

---

## Task 4: Create AgentCard component

**Files:**
- Create: `frontend/src/components/AgentCard.jsx`

- [ ] **Step 1: Write the component**

```jsx
// frontend/src/components/AgentCard.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Search, Code, TestTube, CheckCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

const ROLE_CONFIG = {
  researcher: { label: 'RESEARCHER', icon: Search, color: 'var(--accent-teal)' },
  developer:  { label: 'DEVELOPER',  icon: Code,       color: 'var(--accent-neon)' },
  tester:     { label: 'TESTER',     icon: TestTube,   color: '#FFC107' },
};

const AgentCard = ({ agent }) => {
  const [logsOpen, setLogsOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef(null);

  const config = ROLE_CONFIG[agent.role] || ROLE_CONFIG.researcher;
  const Icon = config.icon;

  useEffect(() => {
    if (agent.status === 'active') {
      intervalRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [agent.status]);

  const progressPct = agent.status === 'complete' ? 100 : agent.status === 'error' ? 100 : 40;
  const progressColor = agent.status === 'complete' ? 'var(--accent-neon)' : agent.status === 'error' ? '#FF4757' : '#FFC107';

  return (
    <div className={`agent-card ${agent.status}`}>
      <div className="agent-card-header">
        <div className="agent-role-badge" style={{ color: config.color, borderColor: config.color }}>
          <Icon size={12} />
          <span>{config.label}</span>
        </div>
        {agent.status === 'complete' && <CheckCircle size={14} style={{ color: 'var(--accent-neon)' }} />}
        {agent.status === 'error'    && <AlertCircle size={14} style={{ color: '#FF4757' }} />}
      </div>

      <div className="agent-task-text">
        {(agent.task || '').substring(0, 60)}{(agent.task || '').length > 60 ? '…' : ''}
      </div>

      <div className="agent-progress-bar">
        <div
          className={`agent-progress-fill ${agent.status === 'active' ? 'shimmer' : ''}`}
          style={{ width: `${progressPct}%`, background: progressColor }}
        />
      </div>

      <div className="agent-card-meta">
        <span>{agent.tokensUsed.toLocaleString()} tok</span>
        {agent.status === 'active' && <span>{elapsed}s</span>}
        {agent.status === 'complete' && <span>Done</span>}
        {agent.messages.length > 0 && (
          <button className="agent-logs-toggle" onClick={() => setLogsOpen(o => !o)}>
            {logsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {agent.messages.length} msg{agent.messages.length !== 1 ? 's' : ''}
          </button>
        )}
      </div>

      {logsOpen && (
        <div className="agent-message-log">
          {agent.messages.map((msg, i) => (
            <div key={i} className="agent-log-entry">
              <span className="agent-log-step">{msg.step}</span>
              <span className="agent-log-text">{msg.message.substring(0, 80)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AgentCard;
```

- [ ] **Step 2: Commit**

```powershell
git add frontend/src/components/AgentCard.jsx
git commit -m "feat(swarm): add AgentCard component with progress bar and message log"
```

---

## Task 5: Create SwarmView component

**Files:**
- Create: `frontend/src/components/SwarmView.jsx`

- [ ] **Step 1: Write the component**

```jsx
// frontend/src/components/SwarmView.jsx
import React from 'react';
import { Activity, ArrowRight } from 'lucide-react';
import AgentCard from './AgentCard';

const SwarmView = ({ agents, messages }) => {
  const agentList = Object.values(agents);

  return (
    <div className="swarm-view">
      <div className="swarm-header">
        <Activity size={16} style={{ color: 'var(--accent-teal)' }} />
        <span>SWARM COORDINATION</span>
        <span className="swarm-agent-count">{agentList.length} agent{agentList.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="swarm-body">
        <div className="swarm-agents-panel">
          {agentList.length === 0 ? (
            <div className="swarm-empty">
              <Activity size={32} style={{ opacity: 0.3 }} />
              <p>No swarm agents active.</p>
              <p style={{ fontSize: '11px', opacity: 0.5 }}>Agents appear here when a multi-step task spawns workers.</p>
            </div>
          ) : (
            agentList.map(agent => (
              <AgentCard key={agent.agentId} agent={agent} />
            ))
          )}
        </div>

        <div className="swarm-divider" />

        <div className="swarm-messages-panel">
          <div className="swarm-messages-header">
            <ArrowRight size={12} />
            <span>INTER-AGENT MESSAGES</span>
          </div>
          <div className="swarm-messages-list">
            {messages.length === 0 ? (
              <div className="swarm-empty" style={{ padding: '16px' }}>
                <p style={{ fontSize: '11px', opacity: 0.5 }}>Agent handoffs appear here.</p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`swarm-message swarm-message-${msg.fromRole}`}>
                  <span className="swarm-message-from">{msg.fromId.split('-')[0].toUpperCase()}</span>
                  <ArrowRight size={10} style={{ opacity: 0.5 }} />
                  <span className="swarm-message-to">{msg.toId.split('-')[0].toUpperCase()}</span>
                  <span className="swarm-message-text">
                    {msg.content.substring(0, 100)}{msg.content.length > 100 ? '…' : ''}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SwarmView;
```

- [ ] **Step 2: Commit**

```powershell
git add frontend/src/components/SwarmView.jsx
git commit -m "feat(swarm): add SwarmView panel with agent grid and message flow"
```

---

## Task 6: Wire SwarmView into App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Add imports**

In `frontend/src/App.jsx`, after the existing imports, add:
```jsx
import SwarmView from './components/SwarmView';
```

- [ ] **Step 2: Add swarm state**

In the `App` component, after the `const [activeSessionId, setActiveSessionId] = useState(null);` line, add:
```jsx
const [swarmAgents, setSwarmAgents] = useState({});
const [swarmMessages, setSwarmMessages] = useState([]);
```

- [ ] **Step 3: Add swarm socket listeners**

In the `useEffect` that registers socket listeners (the one with `socket.on('connect', ...)`), add these listeners before the `return () => { ... }` cleanup block:

```jsx
socket.on('swarm:agent_spawned', (payload) => {
  setSwarmAgents(prev => ({
    ...prev,
    [payload.agentId]: {
      agentId: payload.agentId,
      role: payload.role,
      task: payload.task,
      status: 'active',
      tokensUsed: 0,
      messages: []
    }
  }));
});

socket.on('swarm:agent_progress', (payload) => {
  setSwarmAgents(prev => {
    const agent = prev[payload.agentId];
    if (!agent) return prev;
    return {
      ...prev,
      [payload.agentId]: {
        ...agent,
        tokensUsed: agent.tokensUsed + (payload.tokensUsed || 0),
        messages: [...agent.messages, { step: payload.step, message: payload.message }]
      }
    };
  });
});

socket.on('swarm:agent_message', (payload) => {
  setSwarmMessages(prev => [...prev, payload]);
});

socket.on('swarm:agent_complete', (payload) => {
  setSwarmAgents(prev => {
    const agent = prev[payload.agentId];
    if (!agent) return prev;
    return {
      ...prev,
      [payload.agentId]: { ...agent, status: 'complete', tokensUsed: agent.tokensUsed + (payload.tokensUsed || 0) }
    };
  });
});

socket.on('swarm:agent_error', (payload) => {
  setSwarmAgents(prev => {
    const agent = prev[payload.agentId];
    if (!agent) return prev;
    return { ...prev, [payload.agentId]: { ...agent, status: 'error' } };
  });
});
```

- [ ] **Step 4: Add cleanup for new listeners**

In the same `useEffect` cleanup (`return () => { ... }`), add after `socket.off('system:init')`:
```jsx
socket.off('swarm:agent_spawned');
socket.off('swarm:agent_progress');
socket.off('swarm:agent_message');
socket.off('swarm:agent_complete');
socket.off('swarm:agent_error');
```

- [ ] **Step 5: Add SwarmView to the render output**

In the return JSX, after:
```jsx
{activeView === 'schedule' && <ScheduledTasksView />}
```

Add:
```jsx
{activeView === 'swarm' && (
  <SwarmView agents={swarmAgents} messages={swarmMessages} />
)}
```

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/App.jsx
git commit -m "feat(swarm): wire SwarmView and swarm socket event listeners into App"
```

---

## Task 7: Add Swarm nav item to Sidebar

**Files:**
- Modify: `frontend/src/components/Sidebar.jsx`

- [ ] **Step 1: Add import and nav item**

In `frontend/src/components/Sidebar.jsx`, add `Network` to the lucide import:
```jsx
import { MessageSquare, Settings, Box, Cpu, ChevronRight, Menu, Calendar, Clock, Network } from 'lucide-react';
```

Add `{ id: 'swarm', label: 'SWARM', icon: Network }` to the `navItems` array:
```jsx
const navItems = [
  { id: 'chat',     label: 'OPERATIONS', icon: MessageSquare },
  { id: 'swarm',    label: 'SWARM',      icon: Network },
  { id: 'skills',   label: 'SKILLS',     icon: Box },
  { id: 'schedule', label: 'SCHEDULE',   icon: Calendar },
  { id: 'settings', label: 'CONFIG',     icon: Settings },
];
```

- [ ] **Step 2: Commit**

```powershell
git add frontend/src/components/Sidebar.jsx
git commit -m "feat(swarm): add SWARM nav item to sidebar"
```

---

## Task 8: Add SwarmView styles to index.css

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Append styles**

Add the following at the end of `frontend/src/index.css`:

```css
/* ============================================================
   SWARM VIEW
   ============================================================ */

.swarm-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary);
  overflow: hidden;
}

.swarm-header {
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

.swarm-agent-count {
  margin-left: auto;
  font-size: 10px;
  color: var(--accent-teal);
}

.swarm-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.swarm-agents-panel {
  flex: 0 0 60%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  overflow-y: auto;
}

.swarm-divider {
  width: 1px;
  background: var(--border);
  flex-shrink: 0;
}

.swarm-messages-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.swarm-messages-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border);
}

.swarm-messages-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.swarm-message {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 10px;
  padding: 6px 8px;
  border-radius: 4px;
  background: rgba(255,255,255,0.03);
  border-left: 2px solid var(--border);
}

.swarm-message-researcher { border-left-color: var(--accent-teal); }
.swarm-message-developer  { border-left-color: var(--accent-neon); }
.swarm-message-tester     { border-left-color: #FFC107; }

.swarm-message-from, .swarm-message-to {
  font-weight: 700;
  font-size: 9px;
  opacity: 0.8;
  white-space: nowrap;
}

.swarm-message-text {
  color: var(--text-secondary);
  line-height: 1.4;
}

.swarm-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 12px;
  text-align: center;
  padding: 32px;
}

/* ============================================================
   AGENT CARD
   ============================================================ */

.agent-card {
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px;
  transition: opacity 0.3s;
}

.agent-card.complete { opacity: 0.6; }
.agent-card.error    { border-color: #FF4757; opacity: 0.7; }

.agent-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.agent-role-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1px;
  border: 1px solid;
  border-radius: 3px;
  padding: 2px 6px;
}

.agent-task-text {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 8px;
  line-height: 1.4;
}

.agent-progress-bar {
  height: 3px;
  background: rgba(255,255,255,0.08);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 8px;
}

.agent-progress-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.4s ease;
}

.agent-progress-fill.shimmer {
  background: linear-gradient(90deg, #FFC107 0%, #ffdd57 50%, #FFC107 100%) !important;
  background-size: 200% 100% !important;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.agent-card-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 10px;
  color: var(--text-secondary);
}

.agent-logs-toggle {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-left: auto;
  background: none;
  border: none;
  color: var(--accent-teal);
  cursor: pointer;
  font-size: 10px;
  padding: 0;
}

.agent-message-log {
  margin-top: 8px;
  border-top: 1px solid var(--border);
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.agent-log-entry {
  display: flex;
  gap: 6px;
  font-size: 10px;
}

.agent-log-step {
  color: var(--accent-teal);
  font-weight: 600;
  white-space: nowrap;
}

.agent-log-text {
  color: var(--text-secondary);
}
```

- [ ] **Step 2: Commit**

```powershell
git add frontend/src/index.css
git commit -m "feat(swarm): add SwarmView and AgentCard CSS styles"
```

---

## Task 9: Verify the full feature

- [ ] **Step 1: Run type-check**

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

- [ ] **Step 4: Verify SwarmView appears**

Open `http://localhost:5001` in a browser. Click the `SWARM` nav item in the sidebar. Expected: empty swarm view with "No swarm agents active" message.

- [ ] **Step 5: Trigger a swarm task**

In the Operations view, submit a complex task (e.g., "Research the best TypeScript ORM options and write a comparison"). Watch the SWARM view — agent cards should appear and animate as the swarm workers execute.

- [ ] **Step 6: Final commit**

```powershell
git add -A
git commit -m "feat(phase1): complete Swarm Visualizer — live agent cards, progress bars, inter-agent messages"
```
