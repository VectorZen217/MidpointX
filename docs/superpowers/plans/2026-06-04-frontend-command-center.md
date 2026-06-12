# Frontend Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the MidpointX Operations view into a high-density command center with a top system bar, session history drawer, upgraded planner, color-coded activity feed, Markdown chat rendering, and a floating approval panel.

**Architecture:** All new components receive props from `App.jsx` — no new global state, no context. Two new components (`SystemBar`, `HistoryDrawer`) are added; `ReasoningTree` is replaced by `ActivityFeed`. All socket event listeners stay in `App.jsx`.

**Tech Stack:** React 18, Vite, Vitest + @testing-library/react (new), react-markdown + remark-gfm (new), lucide-react (existing), socket.io-client (existing).

---

## File Map

| File | Action |
|---|---|
| `frontend/vite.config.js` | Modify — add vitest config |
| `frontend/src/test-setup.js` | Create — jest-dom matchers |
| `frontend/package.json` | Modify — add 4 new packages |
| `frontend/src/components/SystemBar.jsx` | Create |
| `frontend/src/components/ActivityFeed.jsx` | Create (replaces ReasoningTree.jsx) |
| `frontend/src/components/HistoryDrawer.jsx` | Create |
| `frontend/src/components/Planner.jsx` | Modify |
| `frontend/src/components/ChatView.jsx` | Modify |
| `frontend/src/components/Sidebar.jsx` | Modify |
| `frontend/src/App.jsx` | Modify |
| `frontend/src/index.css` | Modify |
| `frontend/src/components/__tests__/SystemBar.test.jsx` | Create |
| `frontend/src/components/__tests__/ActivityFeed.test.jsx` | Create |
| `frontend/src/components/__tests__/Planner.test.jsx` | Create |
| `frontend/src/components/__tests__/ChatView.test.jsx` | Create |
| `frontend/src/components/__tests__/HistoryDrawer.test.jsx` | Create |

---

## Task 1: Project Setup — Vitest + New Dependencies

**Files:**
- Modify: `frontend/vite.config.js`
- Create: `frontend/src/test-setup.js`
- Modify: `frontend/package.json` (via npm install)

- [ ] **Step 1: Install dependencies**

```bash
cd frontend
npm install react-markdown remark-gfm
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

Expected: all 4 packages install without errors.

- [ ] **Step 2: Create test setup file**

Create `frontend/src/test-setup.js`:
```js
import '@testing-library/jest-dom';
```

- [ ] **Step 3: Update vite.config.js to add vitest block**

Replace `frontend/vite.config.js` with:
```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test-setup.js',
  },
  server: {
    port: 8080,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:5001', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:5001', ws: true },
    },
  },
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
})
```

- [ ] **Step 4: Add test script to package.json**

In `frontend/package.json`, add to the `"scripts"` block:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Verify vitest is wired up**

```bash
cd frontend
npx vitest run --reporter=verbose
```

Expected: "No test files found, exiting with code 0" (not an error — no tests yet).

- [ ] **Step 6: Commit**

```bash
git add frontend/vite.config.js frontend/src/test-setup.js frontend/package.json frontend/package-lock.json
git commit -m "chore(frontend): add vitest, react-markdown, remark-gfm"
```

---

## Task 2: SystemBar Component

**Files:**
- Create: `frontend/src/components/SystemBar.jsx`
- Create: `frontend/src/components/__tests__/SystemBar.test.jsx`
- Modify: `frontend/src/index.css` (add SystemBar styles)

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/__tests__/SystemBar.test.jsx`:
```jsx
import { render, screen } from '@testing-library/react';
import SystemBar from '../SystemBar';

const base = {
  activeNode: 'idle',
  tokenUsage: { input: 0, output: 0 },
  systemInfo: { model: 'GEMINI-2.0-FLASH', persistence: 'local', provider: 'google' },
  isRunning: false,
  socketConnected: true,
};

test('shows IDLE when not running', () => {
  render(<SystemBar {...base} />);
  expect(screen.getByText('IDLE')).toBeInTheDocument();
});

test('shows RUNNING and node label when isRunning=true', () => {
  render(<SystemBar {...base} isRunning={true} activeNode="reflection" />);
  expect(screen.getByText('RUNNING')).toBeInTheDocument();
  expect(screen.getByText('REFLECTION')).toBeInTheDocument();
});

test('formats token counts with locale separators', () => {
  render(<SystemBar {...base} tokenUsage={{ input: 12450, output: 3812 }} />);
  expect(screen.getByText('12,450')).toBeInTheDocument();
  expect(screen.getByText('3,812')).toBeInTheDocument();
});

test('shows DISCONNECTED when socketConnected=false', () => {
  render(<SystemBar {...base} socketConnected={false} />);
  expect(screen.getByText('DISCONNECTED')).toBeInTheDocument();
});

test('estimates cost to 4 decimal places', () => {
  // google: 0.075/1M input + 0.30/1M output
  // 1M+1M = $0.3750
  render(<SystemBar {...base} tokenUsage={{ input: 1_000_000, output: 1_000_000 }} />);
  expect(screen.getByText('$0.3750')).toBeInTheDocument();
});

test('shows zero cost for local provider', () => {
  render(<SystemBar {...base} systemInfo={{ ...base.systemInfo, provider: 'local' }} tokenUsage={{ input: 999999, output: 999999 }} />);
  expect(screen.getByText('$0.0000')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd frontend && npx vitest run src/components/__tests__/SystemBar.test.jsx
```

Expected: FAIL — "Cannot find module '../SystemBar'"

- [ ] **Step 3: Create SystemBar.jsx**

Create `frontend/src/components/SystemBar.jsx`:
```jsx
import React from 'react';

const COST_RATES = {
  anthropic:  { input: 3.0,   output: 15.0  },
  google:     { input: 0.075, output: 0.30  },
  openai:     { input: 2.5,   output: 10.0  },
  openrouter: { input: 1.0,   output: 1.0   },
  nvidia:     { input: 0.2,   output: 0.2   },
  local:      { input: 0,     output: 0     },
};

const NODE_LABELS = {
  idle: 'IDLE', reflection: 'REFLECTION',
  analysis: 'ANALYSIS', action: 'ACTION', compaction: 'COMPACTION',
};

function estimateCost(tokenUsage, provider) {
  const rates = COST_RATES[provider?.toLowerCase()] ?? COST_RATES.local;
  const cost = (tokenUsage.input / 1_000_000) * rates.input
             + (tokenUsage.output / 1_000_000) * rates.output;
  return cost.toFixed(4);
}

const SystemBar = ({ activeNode, tokenUsage, systemInfo, isRunning, socketConnected }) => {
  const provider = systemInfo?.provider?.toLowerCase() || 'local';
  const cost = estimateCost(tokenUsage, provider);
  const nodeLabel = NODE_LABELS[activeNode] || 'IDLE';

  return (
    <div className="system-bar">
      <span className="sb-brand">
        <span className="sb-brand-mid">Midpoint</span>
        <span className="sb-brand-x">X</span>
      </span>

      <div className={`sb-pill ${isRunning ? 'sb-pill-green' : 'sb-pill-muted'}`}>
        <span className={`sb-dot ${isRunning ? 'dot-green' : 'dot-muted'}`} />
        {isRunning ? 'RUNNING' : 'IDLE'}
      </div>

      {isRunning && (
        <div className="sb-pill sb-pill-blue">
          <span className="sb-dot dot-blue" />
          {nodeLabel}
        </div>
      )}

      <div className="sb-pill sb-pill-muted">
        IN&nbsp;<span className="sb-value sb-val-blue">{tokenUsage.input.toLocaleString()}</span>
      </div>
      <div className="sb-pill sb-pill-muted">
        OUT&nbsp;<span className="sb-value sb-val-green">{tokenUsage.output.toLocaleString()}</span>
      </div>
      <div className="sb-pill sb-pill-muted">
        ~<span className="sb-value sb-val-amber">${cost}</span>
      </div>

      <div className="sb-spacer" />

      <div className={`sb-pill ${socketConnected ? 'sb-pill-green-dim' : 'sb-pill-error'}`}>
        <span className={`sb-dot ${socketConnected ? 'dot-green' : 'dot-red'}`} />
        {socketConnected ? 'SOCKET OK' : 'DISCONNECTED'}
      </div>
      <div className="sb-pill sb-pill-muted">{systemInfo?.model || '—'}</div>
      <div className="sb-pill sb-pill-muted">
        {systemInfo?.persistence === 'firestore' ? 'CLOUD' : 'LOCAL'}
      </div>
    </div>
  );
};

export default SystemBar;
```

- [ ] **Step 4: Add SystemBar CSS to index.css**

Append to `frontend/src/index.css`:
```css
/* ── SystemBar ── */
.system-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  height: 44px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.sb-brand {
  font-size: 14px;
  font-weight: 800;
  margin-right: 8px;
  letter-spacing: 0.5px;
}
.sb-brand-mid { color: var(--accent-teal); }
.sb-brand-x   { color: var(--accent-neon); }

.sb-spacer { flex: 1; }

.sb-pill {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  border: 1px solid transparent;
  white-space: nowrap;
}
.sb-pill-muted    { background: rgba(255,255,255,0.04); border-color: var(--border-color); color: var(--text-secondary); }
.sb-pill-green    { background: rgba(71,194,81,0.12);   border-color: rgba(71,194,81,0.3);  color: var(--accent-neon); }
.sb-pill-green-dim{ background: rgba(71,194,81,0.07);   border-color: rgba(71,194,81,0.2);  color: var(--accent-neon); }
.sb-pill-blue     { background: rgba(23,113,201,0.15);  border-color: rgba(23,113,201,0.3); color: var(--accent-teal); }
.sb-pill-error    { background: rgba(255,71,87,0.12);   border-color: rgba(255,71,87,0.3);  color: var(--accent-coral); }

.sb-dot {
  width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
}
.dot-green { background: var(--accent-neon);  box-shadow: 0 0 6px rgba(71,194,81,0.5); }
.dot-blue  { background: var(--accent-teal);  box-shadow: 0 0 6px rgba(23,113,201,0.5); }
.dot-red   { background: var(--accent-coral); }
.dot-muted { background: var(--text-muted); }

.sb-value { font-family: 'JetBrains Mono', monospace; }
.sb-val-blue  { color: var(--accent-teal); }
.sb-val-green { color: var(--accent-neon); }
.sb-val-amber { color: var(--accent-amber); }
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd frontend && npx vitest run src/components/__tests__/SystemBar.test.jsx
```

Expected: 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/SystemBar.jsx frontend/src/components/__tests__/SystemBar.test.jsx frontend/src/index.css
git commit -m "feat(frontend): add SystemBar with live token/cost/node/socket pills"
```

---

## Task 3: Wire SystemBar into App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Add socket tracking + historyDrawerOpen state**

In `frontend/src/App.jsx`, after the existing state declarations (around line 32), add:
```jsx
const [socketConnected, setSocketConnected] = useState(true);
const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
```

- [ ] **Step 2: Add socket connect/disconnect listeners**

In the second `useEffect` (the socket events one, line 124), add inside the return cleanup:
```jsx
socket.on('connect', () => setSocketConnected(true));
socket.on('disconnect', () => setSocketConnected(false));
```

And add to the cleanup `return () => { ... }` block:
```jsx
socket.off('connect');
socket.off('disconnect');
```

- [ ] **Step 3: Import SystemBar**

At the top of `frontend/src/App.jsx`, add:
```jsx
import SystemBar from './components/SystemBar';
```

- [ ] **Step 4: Render SystemBar above the mission-control-layout**

Replace the `.main-content` div's contents:
```jsx
<div className="main-content">
  <SystemBar
    activeNode={activeNode}
    tokenUsage={tokenUsage}
    systemInfo={systemInfo}
    isRunning={isRunning}
    socketConnected={socketConnected}
  />
  {activeView === 'chat' && (
    <div className="mission-control-layout">
      {/* existing panels unchanged for now */}
    </div>
  )}
  {activeView === 'settings' && <SettingsView />}
  {activeView === 'skills' && <SkillsView />}
  {activeView === 'schedule' && <ScheduledTasksView />}
</div>
```

- [ ] **Step 5: Update .main-content CSS to accommodate SystemBar**

In `frontend/src/index.css`, update the `.main-content` rule:
```css
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;   /* changed from row-implicit to column */
  background-color: transparent;
  overflow: hidden;
  position: relative;
}
```

And update `.mission-control-layout` so it fills remaining height:
```css
.mission-control-layout {
  display: flex;
  flex: 1;
  gap: 16px;
  padding: 16px;
  overflow: hidden;
  width: 100%;
  min-height: 0;  /* add this — prevents flex children from overflowing */
}
```

- [ ] **Step 6: Start dev server and verify SystemBar renders**

```bash
npm run dev
```

Open http://localhost:8080 — confirm the teal/green system bar appears at the top of the main content area with IDLE status, zero tokens, $0.0000 cost, and SOCKET OK.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.jsx frontend/src/index.css
git commit -m "feat(frontend): wire SystemBar into App.jsx with socket tracking"
```

---

## Task 4: Upgrade Planner — Progress Bars + Step Timing

**Files:**
- Modify: `frontend/src/components/Planner.jsx`
- Create: `frontend/src/components/__tests__/Planner.test.jsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/__tests__/Planner.test.jsx`:
```jsx
import { render, screen } from '@testing-library/react';
import Planner from '../Planner';

const plan = ['Step One', 'Step Two', 'Step Three'];

test('renders all steps', () => {
  render(<Planner strategicPlan={plan} planStatus={{}} />);
  expect(screen.getByText('Step One')).toBeInTheDocument();
  expect(screen.getByText('Step Two')).toBeInTheDocument();
  expect(screen.getByText('Step Three')).toBeInTheDocument();
});

test('active step shows elapsed timer', () => {
  render(<Planner strategicPlan={plan} planStatus={{ 'Step One': 'active' }} />);
  expect(screen.getByText(/elapsed/i)).toBeInTheDocument();
});

test('completed step does not show elapsed timer', () => {
  render(<Planner strategicPlan={plan} planStatus={{ 'Step One': 'completed' }} />);
  expect(screen.queryByText(/elapsed/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests — expect FAIL on the timer test**

```bash
cd frontend && npx vitest run src/components/__tests__/Planner.test.jsx
```

Expected: "renders all steps" PASS, "active step shows elapsed timer" FAIL.

- [ ] **Step 3: Replace Planner.jsx**

Replace `frontend/src/components/Planner.jsx` with:
```jsx
import React, { useRef, useEffect, useState } from 'react';
import { ClipboardList, CheckCircle2, Circle, Clock } from 'lucide-react';

const Planner = ({ strategicPlan, planStatus, width }) => {
  const stepStartRef = useRef(null);
  const [elapsed, setElapsed] = useState(0);

  const activeStep = strategicPlan.find(step => planStatus[step] === 'active');

  useEffect(() => {
    if (!activeStep) return;
    stepStartRef.current = Date.now();
    setElapsed(0);
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - stepStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeStep]);

  return (
    <div className="planner-panel glass-panel" style={{ width: width ? `${width}px` : undefined }}>
      <div className="planner-header">
        <ClipboardList size={18} className="text-accent-neon" />
        <span>MISSION PLAN</span>
      </div>
      <div className="planner-content custom-scrollbar">
        {strategicPlan.map((step, idx) => {
          const status = planStatus[step] || 'pending';
          const isActive = status === 'active';
          const isCompleted = status === 'completed';

          return (
            <div key={idx} className={`planner-item ${status}`}>
              <div className="planner-item-icon">
                {isCompleted && <CheckCircle2 size={14} color="var(--accent-neon)" />}
                {isActive    && <Clock size={14} color="var(--accent-amber)" className="animate-pulse" />}
                {status === 'pending' && <Circle size={14} color="var(--text-muted)" />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span className="planner-item-text">{step}</span>
                <div className="planner-progress-bar">
                  <div
                    className={`planner-progress-fill${isActive ? ' planner-shimmer' : ''}`}
                    style={{
                      width: isCompleted ? '100%' : isActive ? '50%' : '0%',
                      background: isCompleted ? 'var(--accent-neon)' : 'var(--accent-amber)',
                    }}
                  />
                </div>
                {isActive && (
                  <div className="planner-elapsed">{elapsed}s elapsed</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Planner;
```

- [ ] **Step 4: Add Planner CSS to index.css**

Append to `frontend/src/index.css`:
```css
/* ── Planner upgrades ── */
.planner-progress-bar {
  height: 3px;
  background: rgba(255,255,255,0.06);
  border-radius: 2px;
  margin-top: 5px;
  overflow: hidden;
}

.planner-progress-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.6s ease;
}

@keyframes shimmer {
  0%   { opacity: 0.5; }
  50%  { opacity: 1; }
  100% { opacity: 0.5; }
}

.planner-shimmer { animation: shimmer 1.5s ease-in-out infinite; }

.planner-elapsed {
  font-size: 10px;
  color: var(--accent-amber);
  margin-top: 3px;
  font-family: 'JetBrains Mono', monospace;
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd frontend && npx vitest run src/components/__tests__/Planner.test.jsx
```

Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Planner.jsx frontend/src/components/__tests__/Planner.test.jsx frontend/src/index.css
git commit -m "feat(frontend): upgrade Planner with animated progress bars and step timing"
```

---

## Task 5: ActivityFeed (Replace ReasoningTree)

**Files:**
- Create: `frontend/src/components/ActivityFeed.jsx`
- Create: `frontend/src/components/__tests__/ActivityFeed.test.jsx`
- Modify: `frontend/src/App.jsx` (swap import)
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/__tests__/ActivityFeed.test.jsx`:
```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import ActivityFeed from '../ActivityFeed';

const trace = [
  { type: 'system',     message: 'MidpointX initialized',  time: '10:00:00' },
  { type: 'reflection', message: 'Analyzing user intent',  time: '10:00:01' },
  { type: 'error',      message: 'Connection timed out',   time: '10:00:02' },
];
const tokenUsage = { input: 500, output: 200 };

test('renders all trace items by default', () => {
  render(<ActivityFeed trace={trace} tokenUsage={tokenUsage} />);
  expect(screen.getByText('MidpointX initialized')).toBeInTheDocument();
  expect(screen.getByText('Analyzing user intent')).toBeInTheDocument();
  expect(screen.getByText('Connection timed out')).toBeInTheDocument();
});

test('SYS filter shows only system entries', () => {
  render(<ActivityFeed trace={trace} tokenUsage={tokenUsage} />);
  fireEvent.click(screen.getByText('SYS'));
  expect(screen.getByText('MidpointX initialized')).toBeInTheDocument();
  expect(screen.queryByText('Analyzing user intent')).not.toBeInTheDocument();
  expect(screen.queryByText('Connection timed out')).not.toBeInTheDocument();
});

test('ERR filter shows only error entries', () => {
  render(<ActivityFeed trace={trace} tokenUsage={tokenUsage} />);
  fireEvent.click(screen.getByText('ERR'));
  expect(screen.getByText('Connection timed out')).toBeInTheDocument();
  expect(screen.queryByText('MidpointX initialized')).not.toBeInTheDocument();
});

test('search filters by message content', () => {
  render(<ActivityFeed trace={trace} tokenUsage={tokenUsage} />);
  fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'timed' } });
  expect(screen.getByText('Connection timed out')).toBeInTheDocument();
  expect(screen.queryByText('MidpointX initialized')).not.toBeInTheDocument();
});

test('shows token counts in footer', () => {
  render(<ActivityFeed trace={trace} tokenUsage={tokenUsage} />);
  expect(screen.getByText('500')).toBeInTheDocument();
  expect(screen.getByText('200')).toBeInTheDocument();
});

test('long messages get truncated with show-more button', () => {
  const longTrace = [{ type: 'system', message: 'A'.repeat(150), time: '10:00:00' }];
  render(<ActivityFeed trace={longTrace} tokenUsage={tokenUsage} />);
  expect(screen.getByText('show more')).toBeInTheDocument();
  fireEvent.click(screen.getByText('show more'));
  expect(screen.getByText('show less')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd frontend && npx vitest run src/components/__tests__/ActivityFeed.test.jsx
```

Expected: FAIL — "Cannot find module '../ActivityFeed'"

- [ ] **Step 3: Create ActivityFeed.jsx**

Create `frontend/src/components/ActivityFeed.jsx`:
```jsx
import React, { useRef, useState, useEffect } from 'react';
import { Activity, Search } from 'lucide-react';

const TYPE_META = {
  system:     { label: 'SYS',   color: 'var(--accent-teal)',  border: 'var(--accent-teal)'  },
  reflection: { label: 'AGENT', color: 'var(--accent-neon)',  border: 'var(--accent-neon)'  },
  agent:      { label: 'AGENT', color: 'var(--accent-neon)',  border: 'var(--accent-neon)'  },
  error:      { label: 'ERR',   color: 'var(--accent-coral)', border: 'var(--accent-coral)' },
  warn:       { label: 'WARN',  color: 'var(--accent-amber)', border: 'var(--accent-amber)' },
};

function getMeta(type) {
  return TYPE_META[type] || TYPE_META.system;
}

const TraceEntry = ({ item, showAudit }) => {
  const [expanded, setExpanded] = useState(false);
  const meta = getMeta(item.type);
  const text = item.message || '';
  const isLong = text.length > 120;

  return (
    <div className="af-item" style={{ borderLeft: `3px solid ${meta.border}` }}>
      <div className="af-item-meta">
        <span className="af-time">{item.time}</span>
        <span className="af-type" style={{ color: meta.color }}>{meta.label}</span>
      </div>
      <pre className="af-message">
        {isLong && !expanded ? text.slice(0, 120) + '…' : text}
      </pre>
      {isLong && (
        <button className="af-expand" onClick={() => setExpanded(e => !e)}>
          {expanded ? 'show less' : 'show more'}
        </button>
      )}
      {showAudit && item.hash && (
        <div className="af-hash">
          <span style={{ color: '#666' }}>SHA-256: </span>
          <span style={{ color: 'var(--accent-teal)', opacity: 0.8 }}>{item.hash}</span>
        </div>
      )}
    </div>
  );
};

const FILTERS = ['all', 'system', 'agent', 'error'];

const ActivityFeed = ({ trace, tokenUsage, width }) => {
  const scrollRef = useRef(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showAudit, setShowAudit] = useState(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [trace]);

  const filtered = trace.filter(item => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'agent' && (item.type === 'agent' || item.type === 'reflection')) ||
      item.type === filter;
    const matchesSearch = !search || item.message?.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="af-panel glass-panel" style={{ width: width ? `${width}px` : undefined }}>
      <div className="af-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={16} color="var(--accent-teal)" />
          <span>ACTIVITY FEED</span>
        </div>
        <div
          className="audit-toggle"
          onClick={() => setShowAudit(a => !a)}
          style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 10, cursor: 'pointer',
            background: showAudit ? 'rgba(23,113,201,0.2)' : 'rgba(0,0,0,0.2)',
            border: `1px solid ${showAudit ? 'var(--accent-teal)' : 'var(--border-color)'}`,
            color: showAudit ? 'var(--accent-teal)' : '#888',
          }}
        >
          {showAudit ? 'AUDIT: ON' : 'AUDIT: OFF'}
        </div>
      </div>

      <div className="af-controls">
        <div className="af-filters">
          {FILTERS.map(f => (
            <button
              key={f}
              className={`af-chip${filter === f ? ' af-chip-active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'ALL' : f === 'system' ? 'SYS' : f === 'agent' ? 'AGENT' : 'ERR'}
            </button>
          ))}
        </div>
        <div className="af-search-wrap">
          <Search size={11} className="af-search-icon" />
          <input
            className="af-search"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="af-content custom-scrollbar" ref={scrollRef}>
        {filtered.length === 0 ? (
          <div className="af-empty">No entries{filter !== 'all' ? ` for "${filter}"` : ''}.</div>
        ) : (
          filtered.map((item, idx) => (
            <TraceEntry key={idx} item={item} showAudit={showAudit} />
          ))
        )}
      </div>

      <div className="af-token-bar">
        <div className="af-token-item">
          <span className="af-token-label">IN</span>
          <span className="af-token-value" style={{ color: 'var(--accent-teal)' }}>
            {tokenUsage.input.toLocaleString()}
          </span>
        </div>
        <div className="af-token-item">
          <span className="af-token-label">OUT</span>
          <span className="af-token-value" style={{ color: 'var(--accent-neon)' }}>
            {tokenUsage.output.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ActivityFeed;
```

- [ ] **Step 4: Add ActivityFeed CSS to index.css**

Append to `frontend/src/index.css`:
```css
/* ── ActivityFeed ── */
.af-panel {
  display: flex;
  flex-direction: column;
  border-radius: var(--border-radius);
  overflow: hidden;
  flex-shrink: 0;
}

.af-header {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-color);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.af-controls {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.af-filters {
  display: flex;
  gap: 4px;
}

.af-chip {
  font-size: 9px;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 10px;
  letter-spacing: 0.5px;
  cursor: pointer;
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  transition: all 0.2s;
}
.af-chip:hover { background: rgba(255,255,255,0.08); }
.af-chip-active {
  background: rgba(23,113,201,0.2);
  border-color: var(--accent-teal);
  color: var(--accent-teal);
}

.af-search-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 4px 8px;
}
.af-search-icon { color: var(--text-muted); flex-shrink: 0; }
.af-search {
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-size: 11px;
  width: 100%;
  font-family: inherit;
}
.af-search::placeholder { color: var(--text-muted); }

.af-content {
  flex: 1;
  overflow-y: auto;
}

.af-empty {
  padding: 20px;
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
}

.af-item {
  padding: 8px 10px 8px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.03);
}

.af-item-meta {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.af-time {
  font-size: 9px;
  color: var(--text-muted);
  font-weight: 600;
}

.af-type {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.5px;
}

.af-message {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--text-primary);
  line-height: 1.4;
}

.af-expand {
  font-size: 10px;
  color: var(--accent-teal);
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 0;
  margin-top: 2px;
}

.af-hash {
  font-size: 9px;
  margin-top: 4px;
  font-family: 'JetBrains Mono', monospace;
  word-break: break-all;
}

.af-token-bar {
  display: flex;
  padding: 10px 14px;
  border-top: 1px solid var(--border-color);
  gap: 20px;
  flex-shrink: 0;
  background: var(--bg-surface);
}

.af-token-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.af-token-label {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}

.af-token-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 600;
}
```

- [ ] **Step 5: Update App.jsx to use ActivityFeed instead of ReasoningTree**

In `frontend/src/App.jsx`:
1. Replace: `import ReasoningTree from './components/ReasoningTree';`  
   With: `import ActivityFeed from './components/ActivityFeed';`

2. Replace the `<ReasoningTree ...>` JSX element:
   ```jsx
   <ActivityFeed trace={trace} tokenUsage={tokenUsage} width={reasoningWidth} />
   ```

- [ ] **Step 6: Run tests — expect PASS**

```bash
cd frontend && npx vitest run src/components/__tests__/ActivityFeed.test.jsx
```

Expected: 6 tests PASS.

- [ ] **Step 7: Verify in browser**

```bash
npm run dev
```

Open http://localhost:8080 — confirm the right panel is now "ACTIVITY FEED" with filter chips and search. The old ReasoningTree is gone.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/ActivityFeed.jsx frontend/src/components/__tests__/ActivityFeed.test.jsx frontend/src/App.jsx frontend/src/index.css
git commit -m "feat(frontend): add ActivityFeed with filters, search, color-coding; replace ReasoningTree"
```

---

## Task 6: ChatView — Markdown Rendering + Floating Approval

**Files:**
- Modify: `frontend/src/components/ChatView.jsx`
- Create: `frontend/src/components/__tests__/ChatView.test.jsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/__tests__/ChatView.test.jsx`:
```jsx
import { render, screen } from '@testing-library/react';
import ChatView from '../ChatView';

const baseProps = {
  task: '', setTask: () => {}, handleStart: () => {}, isRunning: false,
  chatMessages: [], trace: [], tokenUsage: { input: 0, output: 0 },
  activeNode: 'idle', systemInfo: { model: 'TEST', persistence: 'local' },
  activeUser: { name: 'Test', uid: 'test' },
  clearChat: () => {}, pendingApproval: null, handleResume: () => {},
  executionMode: 'api', setExecutionMode: () => {},
};

test('renders empty state when no messages', () => {
  render(<ChatView {...baseProps} />);
  expect(screen.getByText('MidpointX Intelligence Active')).toBeInTheDocument();
});

test('user messages render as plain text', () => {
  const msgs = [{ sender: 'user', text: '**hello**', time: '10:00' }];
  render(<ChatView {...baseProps} chatMessages={msgs} />);
  expect(screen.getByText('**hello**')).toBeInTheDocument();
});

test('agent messages render Markdown bold', () => {
  const msgs = [{ sender: 'agent', text: '**hello**', time: '10:00' }];
  render(<ChatView {...baseProps} chatMessages={msgs} />);
  const bold = screen.getByText('hello');
  expect(bold.tagName).toBe('STRONG');
});

test('approval panel does NOT appear in message list when pendingApproval is null', () => {
  render(<ChatView {...baseProps} />);
  expect(screen.queryByText('SECURITY CHALLENGE')).not.toBeInTheDocument();
});

test('floating approval panel appears when pendingApproval is set', () => {
  const approval = { tool: 'execute_system_command', args: { command: 'ls' } };
  render(<ChatView {...baseProps} pendingApproval={approval} />);
  expect(screen.getByText('SECURITY CHALLENGE')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd frontend && npx vitest run src/components/__tests__/ChatView.test.jsx
```

Expected: "agent messages render Markdown bold" FAIL (currently renders plain text).

- [ ] **Step 3: Update ChatView.jsx — add Markdown rendering**

At the top of `frontend/src/components/ChatView.jsx`, add:
```jsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
```

Replace the message bubble content block (currently `<div className="message-text">{msg.text}</div>`) with:
```jsx
{msg.sender === 'agent' ? (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      code({ inline, children, ...props }) {
        return inline
          ? <code className="md-inline-code" {...props}>{children}</code>
          : <pre className="md-code-block"><code {...props}>{children}</code></pre>;
      },
    }}
  >
    {msg.text}
  </ReactMarkdown>
) : (
  <div className="message-text">{msg.text}</div>
)}
```

- [ ] **Step 4: Extract floating approval panel from message list**

In `frontend/src/components/ChatView.jsx`:

1. **Remove** the approval card from inside the `messages-list` div (the `{pendingApproval && (<div className="approval-card ...">...)}` block).

2. **Add** a floating approval div as a direct child of `.chat-view-center` (after the messages container, before the input):

```jsx
{pendingApproval && (
  <div className="approval-float glass-panel neon-glow-amber">
    <div className="approval-float-header">
      <div className="badge-amber">SECURITY CHALLENGE</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
        Tool: <strong style={{ color: 'var(--text-primary)' }}>{pendingApproval.tool}</strong>
      </div>
    </div>
    <pre className="approval-float-cmd">
      {pendingApproval.tool === 'execute_system_command'
        ? pendingApproval.args.command
        : JSON.stringify(pendingApproval.args, null, 2)}
    </pre>
    <div className="approval-float-btns">
      <button onClick={() => handleResume(true)}  className="btn-approve">APPROVE</button>
      <button onClick={() => handleResume(false)} className="btn-deny">DENY</button>
    </div>
  </div>
)}
```

Also add a placeholder message when approval is pending (insert in `chatMessages` render, after the message map but before `ref={chatEndRef}`):
```jsx
{pendingApproval && (
  <div className="message-bubble agent">
    <div className="message-text" style={{ color: 'var(--accent-amber)' }}>
      ⚠ Awaiting approval for: <strong>{pendingApproval.tool}</strong>
    </div>
  </div>
)}
```

- [ ] **Step 5: Add CSS for Markdown + floating approval**

Append to `frontend/src/index.css`:
```css
/* ── Markdown in chat ── */
.message-bubble.agent p  { margin: 0 0 8px; }
.message-bubble.agent p:last-child { margin-bottom: 0; }
.message-bubble.agent ul, .message-bubble.agent ol {
  padding-left: 20px;
  margin: 4px 0 8px;
}
.message-bubble.agent li { margin-bottom: 2px; }

.md-inline-code {
  background: rgba(0,0,0,0.35);
  padding: 1px 5px;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--accent-teal);
}

.md-code-block {
  background: rgba(0,0,0,0.35);
  padding: 12px;
  border-radius: 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  overflow-x: auto;
  margin: 8px 0;
  border: 1px solid var(--border-color);
}

/* ── Floating approval ── */
.approval-float {
  position: absolute;
  bottom: 76px;
  right: 16px;
  width: 300px;
  padding: 16px;
  border-radius: 14px;
  z-index: 20;
  border: 1px solid var(--accent-amber) !important;
}

.approval-float-header { margin-bottom: 10px; }

.approval-float-cmd {
  background: rgba(0,0,0,0.3);
  border-radius: 8px;
  padding: 10px 12px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--text-primary);
  margin: 10px 0;
  overflow-x: auto;
  max-height: 120px;
  white-space: pre-wrap;
  word-break: break-all;
}

.approval-float-btns {
  display: flex;
  gap: 8px;
}
```

Also make `.chat-view-center` position-relative so the floating panel anchors inside it:
```css
.chat-view-center { position: relative; }
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
cd frontend && npx vitest run src/components/__tests__/ChatView.test.jsx
```

Expected: 5 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ChatView.jsx frontend/src/components/__tests__/ChatView.test.jsx frontend/src/index.css
git commit -m "feat(frontend): Markdown rendering in agent messages; floating approval panel"
```

---

## Task 7: HistoryDrawer Component

**Files:**
- Create: `frontend/src/components/HistoryDrawer.jsx`
- Create: `frontend/src/components/__tests__/HistoryDrawer.test.jsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/__tests__/HistoryDrawer.test.jsx`:
```jsx
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import HistoryDrawer from '../HistoryDrawer';

test('shows loading state initially', () => {
  global.fetch = vi.fn(() => new Promise(() => {})); // never resolves
  render(<HistoryDrawer onSelectSession={() => {}} activeSessionId={null} />);
  expect(screen.getByText('Loading...')).toBeInTheDocument();
});

test('shows empty state when fetch returns 404', async () => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: false }));
  render(<HistoryDrawer onSelectSession={() => {}} activeSessionId={null} />);
  await waitFor(() => expect(screen.getByText(/No history yet/i)).toBeInTheDocument());
});

test('shows empty state when fetch returns empty array', async () => {
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }));
  render(<HistoryDrawer onSelectSession={() => {}} activeSessionId={null} />);
  await waitFor(() => expect(screen.getByText(/No history yet/i)).toBeInTheDocument());
});

test('renders session list when fetch succeeds', async () => {
  const sessions = [
    { id: 's1', title: 'Analyze bugs', timestamp: Date.now(), stepCount: 5, toolCount: 2 },
  ];
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(sessions) }));
  render(<HistoryDrawer onSelectSession={() => {}} activeSessionId={null} />);
  await waitFor(() => expect(screen.getByText('Analyze bugs')).toBeInTheDocument());
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd frontend && npx vitest run src/components/__tests__/HistoryDrawer.test.jsx
```

Expected: FAIL — "Cannot find module '../HistoryDrawer'"

- [ ] **Step 3: Create HistoryDrawer.jsx**

Create `frontend/src/components/HistoryDrawer.jsx`:
```jsx
import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

const HistoryDrawer = ({ width, onSelectSession, activeSessionId }) => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    fetch('/api/v1/history')
      .then(res => {
        if (!res.ok) throw new Error('unavailable');
        return res.json();
      })
      .then(data => {
        setSessions(data);
        setAvailable(true);
      })
      .catch(() => setAvailable(false))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div
      className="history-drawer glass-panel"
      style={{ width: width ? `${width}px` : '200px' }}
    >
      <div className="history-header">
        <Clock size={14} color="var(--accent-teal)" />
        <span>HISTORY</span>
      </div>
      <div className="history-content custom-scrollbar">
        {loading ? (
          <div className="history-empty">Loading...</div>
        ) : !available || sessions.length === 0 ? (
          <div className="history-empty">
            No history yet.<br />Sessions appear here after completion.
          </div>
        ) : (
          sessions.map(session => (
            <div
              key={session.id}
              className={`history-item${session.id === activeSessionId ? ' history-item-active' : ''}`}
              onClick={() => onSelectSession(session.id)}
            >
              <div className="history-title">{session.title}</div>
              <div className="history-meta">
                {new Date(session.timestamp).toLocaleDateString()} · {session.stepCount} steps
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default HistoryDrawer;
```

- [ ] **Step 4: Add HistoryDrawer CSS to index.css**

Append to `frontend/src/index.css`:
```css
/* ── HistoryDrawer ── */
.history-drawer {
  display: flex;
  flex-direction: column;
  border-radius: var(--border-radius);
  overflow: hidden;
  flex-shrink: 0;
}

.history-header {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-color);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.history-content {
  flex: 1;
  overflow-y: auto;
}

.history-empty {
  padding: 20px 14px;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.5;
  text-align: center;
}

.history-item {
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.03);
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: background 0.15s;
}
.history-item:hover { background: rgba(255,255,255,0.03); }
.history-item-active {
  background: rgba(23,113,201,0.08);
  border-left-color: var(--accent-teal);
}

.history-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-meta {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 2px;
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd frontend && npx vitest run src/components/__tests__/HistoryDrawer.test.jsx
```

Expected: 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/HistoryDrawer.jsx frontend/src/components/__tests__/HistoryDrawer.test.jsx frontend/src/index.css
git commit -m "feat(frontend): add HistoryDrawer with graceful empty state when endpoint unavailable"
```

---

## Task 8: Sidebar Toggle + App.jsx Full Wiring

**Files:**
- Modify: `frontend/src/components/Sidebar.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Add history toggle to Sidebar**

In `frontend/src/components/Sidebar.jsx`, add `toggleHistoryDrawer` and `historyDrawerOpen` to props:

```jsx
const Sidebar = ({ activeView, setActiveView, activeUser, clearChat, toggleHistoryDrawer, historyDrawerOpen }) => {
```

In the `sidebar-footer` div, add a history toggle button before the user avatar:
```jsx
<div className="sidebar-footer">
  <button
    onClick={toggleHistoryDrawer}
    className={`btn-icon-small${historyDrawerOpen ? ' active' : ''}`}
    title="Toggle Session History"
    style={{
      marginRight: isCollapsed ? 0 : 8,
      background: historyDrawerOpen ? 'rgba(23,113,201,0.15)' : undefined,
      borderColor: historyDrawerOpen ? 'var(--accent-teal)' : undefined,
      color: historyDrawerOpen ? 'var(--accent-teal)' : undefined,
    }}
  >
    <Clock size={14} />
  </button>
  <div className="user-avatar">
    {activeUser?.name?.[0] || 'O'}
  </div>
  {/* ... rest of footer ... */}
</div>
```

Also add the Clock import to the existing lucide-react import line:
```jsx
import { MessageSquare, Settings, Box, Cpu, ChevronRight, Menu, Calendar, Clock } from 'lucide-react';
```

- [ ] **Step 2: Wire HistoryDrawer into App.jsx**

In `frontend/src/App.jsx`:

1. Add imports at the top:
```jsx
import HistoryDrawer from './components/HistoryDrawer';
```

2. Add state (after existing state declarations):
```jsx
const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
const [historyWidth, setHistoryWidth] = useState(200);
const [activeSessionId, setActiveSessionId] = useState(null);
```

3. Add `startResizingHistory` function (after existing resize functions):
```jsx
const startResizingHistory = (e) => {
  e.preventDefault();
  const startX = e.clientX;
  const startWidth = historyWidth;
  const onMouseMove = (moveEvent) => {
    const newWidth = Math.max(160, Math.min(300, startWidth + (moveEvent.clientX - startX)));
    setHistoryWidth(newWidth);
  };
  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
};
```

4. Add `handleSelectSession` function:
```jsx
const handleSelectSession = (sessionId) => {
  setActiveSessionId(sessionId);
  setTrace(prev => [...prev, {
    type: 'system',
    message: `>> [ SESSION LOADED ] Session ${sessionId}`,
    time: new Date().toLocaleTimeString(),
  }]);
};
```

5. Pass new props to `Sidebar`:
```jsx
<Sidebar
  activeView={activeView}
  setActiveView={setActiveView}
  activeUser={activeUser}
  clearChat={clearChat}
  toggleHistoryDrawer={() => setHistoryDrawerOpen(o => !o)}
  historyDrawerOpen={historyDrawerOpen}
/>
```

6. Update the mission-control-layout to include the history drawer when open:
```jsx
<div className="mission-control-layout">
  {historyDrawerOpen && (
    <>
      <HistoryDrawer
        width={historyWidth}
        onSelectSession={handleSelectSession}
        activeSessionId={activeSessionId}
      />
      <div className="resizer" onMouseDown={startResizingHistory} />
    </>
  )}
  <Planner strategicPlan={strategicPlan} planStatus={planStatus} width={plannerWidth} />
  <div className="resizer" onMouseDown={startResizingPlanner} />
  <ChatView
    task={task}
    setTask={setTask}
    handleStart={handleStart}
    isRunning={isRunning}
    chatMessages={chatMessages}
    trace={trace}
    tokenUsage={tokenUsage}
    activeNode={activeNode}
    systemInfo={systemInfo}
    activeUser={activeUser}
    clearChat={clearChat}
    pendingApproval={pendingApproval}
    handleResume={handleResume}
    executionMode={executionMode}
    setExecutionMode={setExecutionMode}
  />
  <div className="resizer" onMouseDown={startResizingReasoning} />
  <ActivityFeed trace={trace} tokenUsage={tokenUsage} width={reasoningWidth} />
</div>
```

- [ ] **Step 3: Run all frontend tests**

```bash
cd frontend && npx vitest run
```

Expected: All tests PASS. Count should be ≥ 20 tests across 5 test files.

- [ ] **Step 4: Start dev server for full visual verification**

```bash
npm run dev
```

Verify all of the following work:
- [ ] SystemBar shows at top with correct pills and live updates when a task runs
- [ ] Clock icon in sidebar footer toggles the HistoryDrawer open/closed
- [ ] HistoryDrawer shows "No history yet" empty state (no backend endpoint yet)
- [ ] Planner shows animated progress bars and elapsed timer on active step
- [ ] Agent messages in chat render bold, code, and lists from Markdown
- [ ] Approval panel appears as a floating card above the input, not inside the message stream
- [ ] ActivityFeed filter chips filter entries; search input works
- [ ] All three panels are still resizable with drag handles

- [ ] **Step 5: Run TypeScript check on backend (ensure no regressions)**

```bash
npx tsc --noEmit
```

Expected: 0 errors (frontend changes don't affect backend TypeScript).

- [ ] **Step 6: Final commit**

```bash
git add frontend/src/components/Sidebar.jsx frontend/src/App.jsx
git commit -m "feat(frontend): wire HistoryDrawer + Sidebar history toggle into App; complete command center"
```
