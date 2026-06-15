# Screen Monitor — Design Spec
Date: 2026-06-15
Status: Approved

## Context

MidpointX already reacts to file system events, cron schedules, and webhooks via the Proactive Goal Scheduler. The one trigger class no cloud agent can replicate is **visual state on the user's desktop**. Screen Monitor adds a continuous vision loop: capture the full desktop, send to a vision LLM, match against user-defined detection rules, and fire goals autonomously when something actionable is found.

This is a hard moat — it requires physical co-location with the user's machine. OpenClaw and Hermes cannot offer this.

---

## Architecture

**New module: `src/core/screenMonitor.ts`** — singleton alongside ProactiveScheduler and Observer.

Two responsibilities: **capture** and **analyze**.

### Capture

- Fixed-interval polling via `setInterval` (user-configurable, default 30s)
- Global hotkey trigger via `node-global-key-listener` (default `Ctrl+Shift+S`) — fires immediate capture outside the interval
- Each capture calls `nut-js` `screen.grab()` → converts to PNG → saves to `src/workspace/screenshots/` (rolling window, last 100 kept, oldest deleted automatically)

### Analyze

- After each capture, the PNG is base64-encoded and sent to the active LLM provider as a vision message
- Prompt includes all enabled detection rules as a structured list
- LLM returns JSON array: `[{ rule_id, detected: boolean, description, suggested_action }]`
- Any `detected: true` result fires a **Screen Detection Event** via `ProactiveScheduler._onTriggerFired(ruleScheduleId, { screenshot_path, detection })` — reuses the existing queue management, approval flow, and run history

### Vision LLM Handling

- Uses `llmFactory` with the active provider — works with GPT-4o, Claude 3.5 Sonnet, Gemini Vision
- `vision_model_override` in config forces a specific model for vision calls regardless of `ACTIVE_LLM_PROVIDER`
- If the active provider does not support vision: log warning at startup, poller runs but skips analysis, UI shows "Vision not supported by current provider" banner

### Integration

ScreenMonitor fires goals directly via `MidpointXGraph.stream()` (same pattern as `ProactiveScheduler._fireSchedule`) — no dependency on ProactiveScheduler's trigger types. The `auto_approve` field controls what happens when a detection fires:
- `ask` → goal fires; intent string prefixed with "[SCREEN DETECTION — awaiting approval]" so HumanApprovalGate intercepts it
- `auto` → goal fires autonomously with the detection context injected into the intent
- `notify` → Telegram/Discord notification sent only; no goal fired

Run history is tracked in `screen_detections` directly — no `scheduled_goals` FK needed.

---

## Data Model

Three new SQLite tables in `src/workspace/midpointx.db`. Schema created idempotently via `CREATE TABLE IF NOT EXISTS` in `ScreenMonitor.init()`.

### `screen_detection_rules`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `name` | TEXT | e.g., "Terminal Stack Trace" |
| `description` | TEXT | Plain English sent to vision LLM as detection prompt |
| `enabled` | INTEGER | 0 / 1 |
| `auto_approve` | TEXT | `'ask'` / `'auto'` / `'notify'` |
| `intent` | TEXT | Goal text to fire when detected |
| `is_builtin` | INTEGER | 0 / 1 — built-in rules cannot be deleted |
| `created_at` | INTEGER | epoch ms |
| `updated_at` | INTEGER | epoch ms |

### `screen_detections`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `rule_id` | TEXT FK | parent detection rule |
| `detected_at` | INTEGER | epoch ms |
| `screenshot_path` | TEXT | relative path to saved PNG |
| `description` | TEXT | LLM description of what it saw |
| `goal_id` | TEXT | GoalTracker goal ID (null until fired) |
| `status` | TEXT | `'pending'` / `'fired'` / `'dismissed'` |

### `screen_monitor_config`

Single-row config table:

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | always `'singleton'` |
| `poll_interval_ms` | INTEGER | default 30000 |
| `hotkey` | TEXT | default `'ctrl+shift+s'` |
| `enabled` | INTEGER | 0 / 1 — master switch |
| `vision_model_override` | TEXT | optional — force specific model for vision calls |
| `updated_at` | INTEGER | epoch ms |

### Built-in Detection Rules (seeded at `init()` if absent)

| Name | Description | Default approval |
|---|---|---|
| Error Dialog | "A Windows error dialog, crash popup, or application not responding message" | `ask` |
| Terminal Failure | "Red error text, a stack trace, or a non-zero exit code in a terminal window" | `ask` |
| Build/Test Failure | "Failed tests, TypeScript errors, or CI failure output visible in any window" | `ask` |
| Incoming Notification | "A Slack DM, email popup, Teams message, or any notification banner" | `notify` |

---

## ScreenMonitor Methods

```typescript
export const ScreenMonitor = {
  init(io?: Server): Promise<void>          // create tables, seed rules, start poller, register hotkey
  getConfig(): ScreenMonitorConfig
  updateConfig(updates: Partial<ScreenMonitorConfig>): ScreenMonitorConfig  // hot-reloads poller
  startPolling(): void
  stopPolling(): void
  captureAndAnalyze(): Promise<void>        // one-shot: grab → save → analyze → fire detections

  // Rules CRUD
  listRules(): ScreenDetectionRule[]
  createRule(input: CreateRuleInput): ScreenDetectionRule   // also creates linked scheduled_goal
  updateRule(id: string, updates: Partial<CreateRuleInput>): ScreenDetectionRule
  deleteRule(id: string): void              // throws if is_builtin
  toggleRule(id: string, enabled: boolean): void

  // Detections
  listDetections(opts?: { limit?: number; offset?: number; rule_id?: string }): ScreenDetection[]
  dismissDetection(id: string): void

  // Internal
  _analyzeScreenshot(screenshotPath: string, base64: string): Promise<DetectionResult[]>
  _fireDections(results: DetectionResult[], screenshotPath: string): Promise<void>
}
```

### Cooldown

A rule cannot re-fire within 5 minutes of its last detection. Checked by querying `screen_detections` for the most recent fired/pending entry for that rule before calling `_onTriggerFired`.

---

## REST API

Mounted at `/api/v1/screen-monitor` in `src/routes/screenMonitorRoutes.ts`.

### Config

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/config` | Get current config |
| `PATCH` | `/config` | Update interval / hotkey / enabled / vision_model_override — hot-reloads poller |

### Detection Rules

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/rules` | List all rules |
| `POST` | `/rules` | Create custom rule — body: `{ name, description, intent, auto_approve, enabled? }` |
| `PATCH` | `/rules/:id` | Update name / description / intent / auto_approve |
| `DELETE` | `/rules/:id` | Delete — 403 if built-in |
| `POST` | `/rules/:id/toggle` | Enable / disable |

### Captures & Detections

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/capture` | Manual one-shot capture + analyze |
| `GET` | `/detections` | Detection history — `?limit=20&offset=0&rule_id=` |
| `POST` | `/detections/:id/dismiss` | Mark dismissed |

---

## Frontend

New sidebar nav item **SCREEN** (Eye icon), added between SCHEDULES and SCHEDULE. Single file: `frontend/src/components/ScreenMonitorView.jsx`.

### Left Column — Config + Rules

- **Master toggle** — enable/disable entire monitor; shows current status (interval countdown, last capture timestamp)
- **Config row** — poll interval input (seconds) + hotkey display + Save button
- **Manual Capture button** — fires `POST /capture`, shows spinner while analyzing
- **Detection Rules list** — each row: rule name, approval badge (`ASK` / `AUTO` / `NOTIFY`), enable toggle, edit pencil, delete button (disabled for built-ins)
- **+ Add Rule** — inline form: name, description (plain English), intent, approval mode dropdown

### Right Column — Detection History

- Live feed, auto-refreshes every 5s; newest detection at top
- Each entry: timestamp + rule name, screenshot thumbnail (clickable → full-size modal), LLM description, status badge (`PENDING` / `FIRED` / `DISMISSED`), linked goal ID (clicking navigates to Planner), Dismiss button for `PENDING` entries
- Empty state: "No detections yet. Captures run every `{interval}s`."

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Vision LLM doesn't support images | Log warning at startup; poller skips analysis; UI shows "Vision not supported" banner |
| `nut-js` screen capture fails | Log error; skip cycle; disable monitor after 5 consecutive failures + Telegram alert |
| LLM returns malformed JSON | Log raw response; skip cycle; no goals fired |
| Same detection fires every cycle | 5-minute cooldown per rule — checked before `_onTriggerFired` |
| Screenshot directory / disk error | Skip save; run analysis in-memory; log warning |
| `node-global-key-listener` fails | Fall back to polling-only; log warning; UI shows hotkey as "unavailable" |
| Server restart | `init()` re-registers hotkey and restarts poller |

---

## Files Changed

| File | Action | Purpose |
|---|---|---|
| `src/core/screenMonitor.ts` | CREATE | Singleton — capture, analyze, rules CRUD, poller, hotkey |
| `src/routes/screenMonitorRoutes.ts` | CREATE | REST endpoints for config, rules, captures, detections |
| `src/server.ts` | MODIFY | Import + mount screenMonitorRoutes; call `ScreenMonitor.init(io)` after ProactiveScheduler |
| `src/tests/screenMonitor.test.ts` | CREATE | Unit tests: CRUD, cooldown, config, detection seeding |
| `frontend/src/components/ScreenMonitorView.jsx` | CREATE | Two-column UI: config + rules (left), detection history (right) |
| `frontend/src/App.jsx` | MODIFY | Add `screen-monitor` view |
| `frontend/src/components/Sidebar.jsx` | MODIFY | Add SCREEN nav item with Eye icon |

---

## Dependencies

- `node-global-key-listener` — new npm dependency for global hotkey registration
- `@nut-tree-fork/nut-js` — already in stack, used for `screen.grab()`
- Vision-capable LLM (GPT-4o, Claude 3.5 Sonnet, Gemini) — uses existing `llmFactory`

---

## Verification

1. `npx tsc --noEmit` — clean
2. `npx jest screenMonitor --no-coverage` — all unit tests pass
3. Start backend; open SCREEN view; verify built-in rules appear
4. Press `Ctrl+Shift+S`; confirm screenshot appears in detection history
5. Open a terminal, type a failing command; wait for next poll; confirm "Terminal Failure" detection fires
6. Create a custom rule; confirm it appears and can be toggled
7. Dismiss a detection; confirm status updates to `DISMISSED`
