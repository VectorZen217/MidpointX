# MidpointX Frontend — Command Center Redesign

**Date:** 2026-06-03  
**Status:** Approved for implementation  
**Scope:** Full redesign of the Operations (chat) view into a high-density operator console. No changes to backend APIs except where new data surfaces require minor additions.

---

## 1. Goal

Transform the MidpointX frontend from a functional-but-sparse 3-panel layout into a true operator command center. Every panel should carry live, actionable information. The user should be able to understand the system state at a glance without needing to read raw log traces.

---

## 2. Architecture Overview

The Operations view gains two new zones and three upgrades:

```
┌─────────────────────────── TOP SYSTEM BAR (NEW) ───────────────────────────┐
│ [Sidebar] [History Drawer] [Planner] [──── Chat ────] [Activity Feed]       │
│    64px       200px (tog)   220px      flex:1           260px               │
└─────────────────────────────────────────────────────────────────────────────┘
```

All layout widths except the sidebar remain resizable (existing `startResizing*` pattern).  
The history drawer is toggled open/closed by a button in the sidebar footer — it does not replace the sidebar collapse.

---

## 3. Components

### 3.1 SystemBar (new — `frontend/src/components/SystemBar.jsx`)

A full-width strip pinned to the top of the main content area (above the mission-control-layout row). Always visible.

**Displays:**
| Pill | Source | Update trigger |
|---|---|---|
| Runtime status (ACTIVE / IDLE / ERROR) | `activeNode` prop | `agent:progress`, `agent:complete` |
| Active cognitive node (REFLECTION / ANALYSIS / ACTION / COMPACTION) | `activeNode` prop | `agent:progress` |
| Tokens In | `tokenUsage.input` | `agent:progress`, `agent:complete` |
| Tokens Out | `tokenUsage.output` | same |
| Estimated cost | computed from token counts + provider | same |
| Socket connection status | `socket.connected` | `connect` / `disconnect` events |
| Active LLM model | `systemInfo.model` | `system:init` |
| Persistence mode | `systemInfo.persistence` | `system:init` |

**Cost estimation:** Use a static rate table per provider (e.g. Gemini Flash: $0.075/1M input, $0.30/1M output). Stored in a `COST_RATES` constant in `SystemBar.jsx`. Only shows an estimate — labeled "~$X.XX".

**Props:** `activeNode`, `tokenUsage`, `systemInfo`, `isRunning`, `socketConnected`

**Socket tracking:** `App.jsx` currently has no `connect`/`disconnect` listener. Add `socketConnected` useState (default `true`) in `App.jsx` with:
```js
socket.on('connect', () => setSocketConnected(true));
socket.on('disconnect', () => setSocketConnected(false));
```
Pass `socketConnected` down to `SystemBar`.

---

### 3.2 HistoryDrawer (new — `frontend/src/components/HistoryDrawer.jsx`)

A 200px panel that slides in between the sidebar and the planner. Toggled by a history icon in the sidebar footer.

**State:** `isOpen` boolean lives in `App.jsx` (same level as `activeView`). Passed as prop to `Sidebar` (for the toggle button) and rendered conditionally in the mission-control-layout.

**Data:** Persisted conversation snapshots. Each entry:
```ts
{ id: string, title: string, timestamp: number, stepCount: number, toolCount: number }
```

**Backend endpoint needed:** `GET /api/v1/history` — returns last 20 sessions sorted by timestamp desc. Each session is the first user message (truncated to 50 chars) + metadata from the session's trace. If this endpoint doesn't exist yet, the drawer renders a "No history yet" empty state.

**Behavior:**
- If `GET /api/v1/history` endpoint does not exist (404 or network error), drawer shows a "No history yet" empty state; history items are not clickable
- If endpoint exists: clicking a history item clears the current chat and loads the selected session's messages via `GET /api/v1/history/:id`
- Active session is highlighted with a left blue border
- Drawer is resizable (min 160px, max 300px) using the existing resizer pattern

---

### 3.3 Planner (upgrade — `src/frontend/src/components/Planner.jsx`)

**Changes from current:**
1. Each step gets a thin animated fill bar under the label (CSS transition on width)
2. Active step shows elapsed time: computed from a `stepStartTime` ref that resets each time `planStatus` transitions a step to `active`
3. Completed steps show a checkmark + dim to 50% opacity (already exists, keep)
4. Pending steps show a hollow circle (already exists, keep)

**New props needed:** None — derive `stepStartTime` from the moment a step enters `active` state using a `useEffect` inside `Planner.jsx`.

**Progress bar values:**
- `completed` → 100% fill, green
- `active` → animated shimmer (CSS `@keyframes shimmer`), amber
- `pending` → 0% fill, muted

---

### 3.4 ChatView — Markdown rendering (upgrade)

**Change:** Agent message text currently renders as a raw string. Wrap in a Markdown renderer.

**Library:** `react-markdown` (already evaluating — add to `frontend/package.json`). Plugins: `remark-gfm` for tables and strikethrough.

**Scope:** Only agent messages get Markdown rendering. User messages stay plain text (they're commands, not documents).

**Code fences:** Render with a dark `pre` block styled to match the existing `.approval-body pre` style.

**No change to message data shape** — `msg.text` is already a string; rendering changes only.

---

### 3.5 ActivityFeed (upgrade — rename/replace `ReasoningTree.jsx` → `ActivityFeed.jsx`)

The raw trace list becomes a filtered, color-coded activity stream.

**Filter chips:** ALL · SYS · AGENT · ERR  
State: `activeFilter` useState, default `'all'`. Filters `trace` array before rendering.

**Color coding by `item.type`:**
| Type | Label color | Left border |
|---|---|---|
| `system` | Midpoint Blue `#1771c9` | blue |
| `agent` / `reflection` | Midpoint Green `#47c251` | green |
| `error` | Coral `#FF4757` | red |
| `warn` / approval | Amber `#FFC107` | amber |

**Message text:** Truncate to 120 chars per entry with a "…show more" toggle (collapsed by default). This prevents the panel from becoming a wall of text.

**Search:** A small search input at the top of the panel (below the filter chips). Filters trace items by text content. `useState('')` + `.filter(item => item.message.toLowerCase().includes(search))`.

**Token mini-bar:** A 2-metric strip at the bottom of the panel showing total tokens in/out for the current session (replaces the existing `metrics-panel` at the bottom of the old ReasoningTree).

**Rename:** File renamed from `ReasoningTree.jsx` to `ActivityFeed.jsx`. Import updated in `App.jsx`.

---

### 3.6 Floating Approval Panel (upgrade)

Currently, approval cards appear inline in the chat message stream. They get lost in long conversations.

**Change:** Extract the approval card out of `ChatView`'s message list. When `pendingApproval` is non-null, render a fixed-position card overlaid above the chat input, bottom-right of the chat panel.

**Positioning:** `position: absolute` on the `.chat-view-center` container (which is already `position: relative`). Place at `bottom: 80px; right: 16px` — floats above the chat input area within the chat panel. This avoids a fixed hardcoded offset that would break when the ActivityFeed panel is resized.

**Visual:** Amber border + glow (existing `neon-glow-amber`), amber "SECURITY CHALLENGE" badge. Unchanged from current design — just repositioned.

**Chat message:** When an approval card is shown, insert a placeholder agent message in the chat stream: `"Awaiting your approval for: {tool}"`. This preserves the conversation context.

---

## 4. Data Flow

No new socket events are needed. Existing events map to the new components:

| Event | Currently consumed by | After redesign |
|---|---|---|
| `agent:progress` | App.jsx → ChatView, Planner | App.jsx → SystemBar, ChatView, Planner, ActivityFeed |
| `agent:complete` | App.jsx | same + SystemBar (reset cost accumulator) |
| `agent:error` | App.jsx → trace | ActivityFeed (type: error) |
| `agent:approval_required` | App.jsx → ChatView | App.jsx → floating panel (out of ChatView) |
| `system:init` | App.jsx → ChatView | App.jsx → SystemBar |

All props flow down from `App.jsx` — no new global state management needed.

---

## 5. New Dependencies

| Package | Used by | Install command |
|---|---|---|
| `react-markdown` | ChatView | `npm install react-markdown` (in `frontend/`) |
| `remark-gfm` | ChatView | `npm install remark-gfm` (in `frontend/`) |

No backend dependencies change.

---

## 6. Backend Endpoint (stretch)

`GET /api/v1/history` — returns session history for the HistoryDrawer. If not implemented, the drawer shows an empty state. This is a stretch goal for Phase 2 and does not block the frontend work.

---

## 7. Files Changed

| File | Change type |
|---|---|
| `frontend/src/App.jsx` | Add `historyDrawerOpen` state, wire SystemBar, rename ReasoningTree import |
| `frontend/src/index.css` | Add SystemBar, HistoryDrawer, ActivityFeed, floating approval styles |
| `frontend/src/components/SystemBar.jsx` | New file |
| `frontend/src/components/HistoryDrawer.jsx` | New file |
| `frontend/src/components/Planner.jsx` | Add progress bars + step timing |
| `frontend/src/components/ChatView.jsx` | Add react-markdown, remove inline approval card |
| `frontend/src/components/ActivityFeed.jsx` | Renamed + upgraded from ReasoningTree.jsx |
| `frontend/src/components/Sidebar.jsx` | Add history drawer toggle button in footer |
| `frontend/package.json` | Add react-markdown, remark-gfm |

---

## 8. Out of Scope

- Mobile/responsive layout (existing overflow:hidden body stays)
- Settings, Skills, Schedule views — no changes
- Backend session persistence for history (stretch goal only)
- Notification system / toasts
- Dark/light theme toggle
