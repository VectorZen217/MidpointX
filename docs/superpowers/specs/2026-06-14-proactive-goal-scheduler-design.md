# Proactive Goal Scheduler — Design Spec
Date: 2026-06-14
Status: Approved

## Context

MidpointX already handles proactive triggers for MD Skill–based automation (cron, file watch, webhook) via the `Observer` class. However, those triggers are tied to skill files and cannot be configured from the UI or created autonomously by the agent. There is no persistent run history, no queue management for concurrent fires, and no structured link between a trigger and a GoalTracker goal.

This spec adds `ProactiveScheduler` — a SQLite-backed scheduler that lets users (and the agent itself) define named, trigger-based goals that run autonomously in the background. It integrates with the existing GoalTracker for execution and Planner for live status.

---

## Data Model

Two new tables added to `src/workspace/midpointx.db` (same file as `agent_memories` and `goals`). Schema created idempotently via `CREATE TABLE IF NOT EXISTS` in `ProactiveScheduler.init()`.

### `scheduled_goals` table

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `name` | TEXT | user-readable label (unique) |
| `trigger_type` | TEXT | `'cron'` / `'file_watch'` / `'webhook'` |
| `trigger_config` | TEXT | JSON: `{expression}` for cron, `{path, events[]}` for file_watch, `{path}` for webhook |
| `intent` | TEXT | static goal text sent to the agent |
| `enabled` | INTEGER | 0 / 1 |
| `active_goal_id` | TEXT | running GoalTracker goal ID; null when idle |
| `queue` | TEXT | JSON array of pending trigger timestamps |
| `last_run_at` | INTEGER | epoch ms; null if never run |
| `created_at` | INTEGER | epoch ms |
| `updated_at` | INTEGER | epoch ms |

### `scheduled_goal_runs` table

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `scheduled_goal_id` | TEXT FK | parent schedule |
| `goal_id` | TEXT | GoalTracker goal ID |
| `triggered_at` | INTEGER | epoch ms |
| `completed_at` | INTEGER | epoch ms; null while running |
| `status` | TEXT | `'running'` / `'completed'` / `'failed'` |
| `trigger_data` | TEXT | JSON — event metadata (file path changed, webhook body, cron timestamp) |

---

## ProactiveScheduler Architecture

New singleton class `src/core/proactiveScheduler.ts`. The existing `Observer` class is not modified — it continues to handle MD Skill–based triggers.

### `init(io?)`

Called at server startup. Reads all enabled `scheduled_goals` from SQLite and registers each trigger:

- **Cron** → `node-cron` job
- **File watch** → `chokidar` watcher (same pattern as Observer)
- **Webhook** → path registered in an internal `Map<string, string>` (path → schedule ID); `Observer.triggerWebhook()` checks `ProactiveScheduler` first before falling back to skill-based paths

Also starts the **completion poller** (`setInterval` every 30 seconds).

### On trigger fired

1. Load the `scheduled_goal` row
2. If `active_goal_id` is set and that GoalTracker goal is still `active` → append current timestamp to `queue` column and return
3. If `queue` has grown beyond 10 entries → drop the new trigger, log `"queue full, trigger skipped"`
4. Otherwise → call `_fireSchedule(schedule, triggerData)`:
   - Invoke LangGraph with the intent string as the user message
   - Store the returned goal ID in `active_goal_id`
   - Write a `scheduled_goal_runs` row with `status: 'running'`

### Completion poller

Runs every 30 seconds. For each `scheduled_goal` with a non-null `active_goal_id`:

- Call `GoalTracker.getGoal(active_goal_id)` — check status
- If `completed` or `failed`:
  - Update the `scheduled_goal_runs` row (`status`, `completed_at`)
  - Clear `active_goal_id`, update `last_run_at`
  - If `active` for > 24h → mark run `failed`, clear `active_goal_id`, log warning
  - If `queue` is non-empty → pop the oldest timestamp, call `_fireSchedule()` immediately

### CRUD methods

`createSchedule()`, `updateSchedule()`, `deleteSchedule()`, `toggleSchedule()` — each modifies SQLite then hot-reloads the relevant cron job / chokidar watcher without server restart.

### Agent tool

`schedule_goal` registered as a built-in tool in `PluginRegistry`. Input: `name`, `trigger_type`, `trigger_config` (JSON string), `intent`. Calls `ProactiveScheduler.createSchedule()` and returns a confirmation string with the schedule ID. Errors returned as the tool result string — never thrown.

---

## REST API

Mounted at `/api/v1/schedules` in `src/routes/scheduleRoutes.ts`, registered in `src/server.ts`.

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/v1/schedules` | List all schedules (id, name, trigger_type, enabled, last_run_at, active_goal_id) |
| `POST` | `/api/v1/schedules` | Create — body: `{ name, trigger_type, trigger_config, intent, enabled? }` |
| `PATCH` | `/api/v1/schedules/:id` | Update name / trigger_config / intent |
| `DELETE` | `/api/v1/schedules/:id` | Delete + cancel live cron/watcher |
| `POST` | `/api/v1/schedules/:id/toggle` | Enable / disable — hot-reloads trigger if enabling |
| `POST` | `/api/v1/schedules/:id/trigger` | Manual one-shot fire (respects queue logic) |
| `GET` | `/api/v1/schedules/:id/runs` | Run history — `?limit=20&offset=0`, newest first |

**Validation on POST/PATCH:**
- Cron expression validated with `node-cron.validate()` → 400 on invalid
- File watch path validated for existence → schedule saved as disabled with warning if path missing
- Webhook path checked for leading `/` and collision with existing registered paths → 409 on collision
- Duplicate schedule name → 409

---

## Frontend Panel

New sidebar route `/schedules` ("Schedules") between Planner and Pipelines. Single file: `frontend/src/components/SchedulesView.jsx`. No new UI dependencies — uses existing lucide-react icons and Tailwind classes.

### Left column — Create + List

**New Schedule form:**
- Name field
- Trigger type dropdown (Cron / File Watch / Webhook) — switches dynamic config fields:
  - **Cron**: expression input + human-readable preview ("Every day at 9am")
  - **File Watch**: path input + event checkboxes (add, change, unlink)
  - **Webhook**: path input (auto-prefixed `/webhook/`)
- Intent textarea
- Save button

**Schedule list** (below form): scrollable rows showing name, trigger summary, enabled toggle, last run timestamp, delete button.

### Right column — Run History

Clicking a schedule row opens its run history:
- Table: triggered_at, status badge (running / completed / failed), completed_at, duration, link to GoalTracker goal
- If `active_goal_id` set: live "Running now →" banner linking to Planner

**Polling:** list refreshes every 5s; run history refreshes every 3s when a schedule with a running goal is selected.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Invalid cron expression on create | 400: `"Invalid cron expression: <expr>"` — not saved |
| File watch path doesn't exist | Schedule saved as disabled; warning logged; re-validates on enable |
| Webhook path collision | 409: `"Webhook path /foo already registered"` |
| Trigger fires while goal is running | Timestamp appended to `queue`; poller drains in order |
| Queue > 10 entries | 11th trigger dropped: `"queue full, trigger skipped"` |
| Goal hangs > 24h | Run marked `failed`; `active_goal_id` cleared; warning logged |
| `node-cron` job throws | Error caught; `scheduled_goal_runs` row written as `failed`; error in trigger_data |
| Server restart | `init()` re-registers all enabled schedules; in-flight runs reconciled via poller |
| Agent tool validation failure | Error returned as tool result string — not thrown |
| SQLite write fails | 500 with full error message; operation rolled back |

---

## Files Changed

| File | Action | Purpose |
|---|---|---|
| `src/core/proactiveScheduler.ts` | **CREATE** | SQLite-backed scheduler — init, trigger handling, queue, poller, CRUD |
| `src/routes/scheduleRoutes.ts` | **CREATE** | 7 REST endpoints |
| `src/server.ts` | **MODIFY** | Register schedule routes; call `ProactiveScheduler.init()` on startup |
| `src/core/pluginRegistry.ts` | **MODIFY** | Register `schedule_goal` built-in tool |
| `src/tests/proactiveScheduler.test.ts` | **CREATE** | Unit tests: CRUD, queue logic, poller reconciliation, agent tool |
| `frontend/src/components/SchedulesView.jsx` | **CREATE** | Two-column UI: create form + list (left), run history (right) |
| `frontend/src/App.jsx` | **MODIFY** | Add `/schedules` route |
| `frontend/src/components/Sidebar.jsx` | **MODIFY** | Add Schedules nav item |

---

## Integration Points

- **GoalTracker**: `_fireSchedule()` calls `GoalTracker` to create and track the goal; poller reads goal status to detect completion
- **Observer**: webhook dispatch checks `ProactiveScheduler` webhook map first; no other Observer changes
- **PluginRegistry**: `schedule_goal` tool registered alongside built-in tools
- **Planner**: no changes — schedule run links to existing Planner view via `active_goal_id`
- **Telegram**: fire-and-forget notification on schedule trigger: `🕐 Schedule fired: {name}\n{intent}`

---

## Verification

1. `npx tsc --noEmit` — clean
2. `npx jest proactiveScheduler --no-coverage` — all unit tests pass
3. Start backend; create a cron schedule via UI (every minute); confirm it fires and a GoalTracker goal appears in Planner
4. Trigger manually via `POST /api/v1/schedules/:id/trigger`; confirm run history entry created
5. Fire while a goal is running; confirm timestamp queued; confirm poller drains queue after completion
6. Create a file watch schedule; touch the watched file; confirm goal fires
7. Kill and restart server; confirm schedules re-registered and in-flight run reconciled
8. Have agent create a schedule via `schedule_goal` tool; confirm it appears in UI
