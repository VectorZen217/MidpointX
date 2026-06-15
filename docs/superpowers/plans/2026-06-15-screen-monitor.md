# Screen Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live desktop vision loop that captures the full screen, sends it to a vision LLM, matches against user-defined detection rules, and fires goals autonomously when something actionable is found.

**Architecture:** `src/core/screenMonitor.ts` is a singleton (same pattern as `ProactiveScheduler`) that owns three SQLite tables in `midpointx.db`, a capture loop via `nut-js`, a global hotkey via `node-global-key-listener`, and vision LLM analysis via `LLMFactory.getModel()`. Goals are fired via `MidpointXGraph.stream()` — same background IIFE pattern used by `ProactiveScheduler._fireSchedule`.

**Tech Stack:** `better-sqlite3`, `@nut-tree-fork/nut-js` (screen.grab, saveImage), `node-global-key-listener` (GlobalKeyboardListener), `@langchain/core/messages` (HumanMessage), `LLMFactory`, `MidpointXGraph`, Express Router, React 18

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/core/screenMonitor.ts` | CREATE | Singleton — schema, CRUD, capture, analyze, poller, hotkey |
| `src/routes/screenMonitorRoutes.ts` | CREATE | REST endpoints for config, rules, captures, detections |
| `src/server.ts` | MODIFY | Import + mount routes; call `ScreenMonitor.init(io)` |
| `src/tests/screenMonitor.test.ts` | CREATE | Unit tests — CRUD, cooldown, config, seeding |
| `frontend/src/components/ScreenMonitorView.jsx` | CREATE | Two-column UI: config+rules left, detection history right |
| `frontend/src/App.jsx` | MODIFY | Add `screen-monitor` view |
| `frontend/src/components/Sidebar.jsx` | MODIFY | Add SCREEN nav item with Eye icon |

---

### Task 1: SQLite Schema, Types, CRUD, and Tests

**Files:**
- Create: `src/core/screenMonitor.ts` (schema + CRUD only — no capture/poller yet)
- Create: `src/tests/screenMonitor.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/tests/screenMonitor.test.ts`:

```typescript
import path from "path";
import os from "os";
import fs from "fs";
import { _resetDbForTesting, ScreenMonitor } from "../core/screenMonitor";

let tmpDb: string;

beforeEach(() => {
  tmpDb = path.join(os.tmpdir(), `sm_test_${Date.now()}.db`);
  _resetDbForTesting(tmpDb);
});

afterEach(() => {
  _resetDbForTesting();
  try { fs.unlinkSync(tmpDb); } catch {}
});

describe("ScreenMonitor schema & config", () => {
  it("seeds built-in rules on init", async () => {
    await ScreenMonitor.init();
    const rules = ScreenMonitor.listRules();
    expect(rules.length).toBe(4);
    expect(rules.map(r => r.name)).toContain("Error Dialog");
    expect(rules.map(r => r.name)).toContain("Terminal Failure");
    expect(rules.map(r => r.name)).toContain("Build/Test Failure");
    expect(rules.map(r => r.name)).toContain("Incoming Notification");
  });

  it("built-in rules have is_builtin = 1", async () => {
    await ScreenMonitor.init();
    const rules = ScreenMonitor.listRules();
    expect(rules.every(r => r.is_builtin === 1)).toBe(true);
  });

  it("init is idempotent — calling twice does not duplicate rules", async () => {
    await ScreenMonitor.init();
    await ScreenMonitor.init();
    const rules = ScreenMonitor.listRules();
    expect(rules.length).toBe(4);
  });

  it("getConfig returns singleton row with defaults", async () => {
    await ScreenMonitor.init();
    const cfg = ScreenMonitor.getConfig();
    expect(cfg.id).toBe("singleton");
    expect(cfg.poll_interval_ms).toBe(30000);
    expect(cfg.hotkey).toBe("ctrl+shift+s");
    expect(cfg.enabled).toBe(0);
    expect(cfg.vision_model_override).toBeNull();
  });

  it("updateConfig persists changes", async () => {
    await ScreenMonitor.init();
    const updated = ScreenMonitor.updateConfig({ poll_interval_ms: 60000, enabled: 1 });
    expect(updated.poll_interval_ms).toBe(60000);
    expect(updated.enabled).toBe(1);
    // Re-read from DB
    const refetched = ScreenMonitor.getConfig();
    expect(refetched.poll_interval_ms).toBe(60000);
  });
});

describe("ScreenMonitor rules CRUD", () => {
  beforeEach(async () => { await ScreenMonitor.init(); });

  it("createRule adds a custom rule", () => {
    const rule = ScreenMonitor.createRule({
      name: "Custom Rule",
      description: "Detect something",
      intent: "Do something about it",
      auto_approve: "auto",
    });
    expect(rule.id).toBeDefined();
    expect(rule.name).toBe("Custom Rule");
    expect(rule.is_builtin).toBe(0);
    expect(rule.enabled).toBe(1);
  });

  it("updateRule modifies name and description", () => {
    const rule = ScreenMonitor.createRule({ name: "R1", description: "d1", intent: "i1", auto_approve: "ask" });
    const updated = ScreenMonitor.updateRule(rule.id, { name: "R1 Updated", description: "d2" });
    expect(updated.name).toBe("R1 Updated");
    expect(updated.description).toBe("d2");
  });

  it("deleteRule removes custom rule", () => {
    const rule = ScreenMonitor.createRule({ name: "R2", description: "d", intent: "i", auto_approve: "ask" });
    ScreenMonitor.deleteRule(rule.id);
    const all = ScreenMonitor.listRules();
    expect(all.find(r => r.id === rule.id)).toBeUndefined();
  });

  it("deleteRule throws for built-in rule", () => {
    const builtin = ScreenMonitor.listRules().find(r => r.is_builtin === 1)!;
    expect(() => ScreenMonitor.deleteRule(builtin.id)).toThrow("Cannot delete built-in");
  });

  it("toggleRule enables and disables", () => {
    const rule = ScreenMonitor.createRule({ name: "R3", description: "d", intent: "i", auto_approve: "ask" });
    ScreenMonitor.toggleRule(rule.id, false);
    expect(ScreenMonitor.listRules().find(r => r.id === rule.id)!.enabled).toBe(0);
    ScreenMonitor.toggleRule(rule.id, true);
    expect(ScreenMonitor.listRules().find(r => r.id === rule.id)!.enabled).toBe(1);
  });
});

describe("ScreenMonitor detections", () => {
  beforeEach(async () => { await ScreenMonitor.init(); });

  it("listDetections returns empty initially", () => {
    expect(ScreenMonitor.listDetections()).toEqual([]);
  });

  it("dismissDetection updates status", () => {
    const rule = ScreenMonitor.listRules()[0];
    // Insert a detection directly via internal helper
    const detId = ScreenMonitor._insertDetectionForTest(rule.id, "/tmp/test.png", "saw something");
    ScreenMonitor.dismissDetection(detId);
    const det = ScreenMonitor.listDetections()[0];
    expect(det.status).toBe("dismissed");
  });
});

describe("ScreenMonitor cooldown", () => {
  beforeEach(async () => { await ScreenMonitor.init(); });

  it("rule on cooldown is not re-fired within 5 minutes", () => {
    const rule = ScreenMonitor.listRules()[0];
    ScreenMonitor._insertDetectionForTest(rule.id, "/tmp/t.png", "x");
    expect(ScreenMonitor._isOnCooldown(rule.id)).toBe(true);
  });

  it("rule not on cooldown when no recent detection", () => {
    const rule = ScreenMonitor.listRules()[0];
    expect(ScreenMonitor._isOnCooldown(rule.id)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```powershell
npx jest screenMonitor --no-coverage 2>&1 | Select-Object -First 30
```

Expected: FAIL — `../core/screenMonitor` module not found.

- [ ] **Step 3: Create `src/core/screenMonitor.ts` with schema + CRUD**

```typescript
import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";
import type { Server } from "socket.io";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScreenDetectionRule {
  id: string;
  name: string;
  description: string;
  enabled: number; // 0 | 1
  auto_approve: "ask" | "auto" | "notify";
  intent: string;
  is_builtin: number; // 0 | 1
  created_at: number;
  updated_at: number;
}

export interface ScreenDetection {
  id: string;
  rule_id: string;
  detected_at: number;
  screenshot_path: string;
  description: string;
  goal_id: string | null;
  status: "pending" | "fired" | "dismissed";
}

export interface ScreenMonitorConfig {
  id: string;
  poll_interval_ms: number;
  hotkey: string;
  enabled: number; // 0 | 1
  vision_model_override: string | null;
  updated_at: number;
}

export interface CreateRuleInput {
  name: string;
  description: string;
  intent: string;
  auto_approve: "ask" | "auto" | "notify";
  enabled?: boolean;
}

export interface DetectionResult {
  rule_id: string;
  detected: boolean;
  description: string;
  suggested_action: string;
}

// ─── DB Singleton ─────────────────────────────────────────────────────────────

let _db: Database.Database | null = null;
let _ioInstance: Server | undefined;
let _pollerHandle: NodeJS.Timeout | null = null;
let _consecutiveCaptureFails = 0;
const MAX_CONSECUTIVE_FAILS = 5;
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const MAX_SCREENSHOTS = 100;

function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath =
    process.env.SCREEN_MONITOR_DB_PATH ||
    path.resolve(process.cwd(), "src/workspace/midpointx.db");
  _db = new Database(dbPath);
  _db.pragma("foreign_keys = ON");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS screen_detection_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      auto_approve TEXT NOT NULL DEFAULT 'ask',
      intent TEXT NOT NULL,
      is_builtin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS screen_detections (
      id TEXT PRIMARY KEY,
      rule_id TEXT NOT NULL,
      detected_at INTEGER NOT NULL,
      screenshot_path TEXT NOT NULL,
      description TEXT NOT NULL,
      goal_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      FOREIGN KEY (rule_id) REFERENCES screen_detection_rules(id)
    );
    CREATE TABLE IF NOT EXISTS screen_monitor_config (
      id TEXT PRIMARY KEY DEFAULT 'singleton',
      poll_interval_ms INTEGER NOT NULL DEFAULT 30000,
      hotkey TEXT NOT NULL DEFAULT 'ctrl+shift+s',
      enabled INTEGER NOT NULL DEFAULT 0,
      vision_model_override TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_screen_detections_rule ON screen_detections(rule_id);
    CREATE INDEX IF NOT EXISTS idx_screen_detections_status ON screen_detections(status);
  `);
  return _db;
}

export function _resetDbForTesting(customPath?: string): void {
  if (_pollerHandle) { clearInterval(_pollerHandle); _pollerHandle = null; }
  if (_db) { try { _db.close(); } catch {} _db = null; }
  if (customPath !== undefined) process.env.SCREEN_MONITOR_DB_PATH = customPath;
  _consecutiveCaptureFails = 0;
}

// ─── Built-in Rules ──────────────────────────────────────────────────────────

const BUILTIN_RULES: Omit<ScreenDetectionRule, "id" | "created_at" | "updated_at">[] = [
  {
    name: "Error Dialog",
    description: "A Windows error dialog, crash popup, or application not responding message",
    enabled: 1,
    auto_approve: "ask",
    intent: "An error dialog appeared on screen. Investigate and resolve it.",
    is_builtin: 1,
  },
  {
    name: "Terminal Failure",
    description: "Red error text, a stack trace, or a non-zero exit code in a terminal window",
    enabled: 1,
    auto_approve: "ask",
    intent: "A terminal error or stack trace is visible. Diagnose and fix it.",
    is_builtin: 1,
  },
  {
    name: "Build/Test Failure",
    description: "Failed tests, TypeScript errors, or CI failure output visible in any window",
    enabled: 1,
    auto_approve: "ask",
    intent: "Build or test failure detected on screen. Investigate the errors and fix them.",
    is_builtin: 1,
  },
  {
    name: "Incoming Notification",
    description: "A Slack DM, email popup, Teams message, or any notification banner",
    enabled: 1,
    auto_approve: "notify",
    intent: "Incoming notification detected. Review and respond as appropriate.",
    is_builtin: 1,
  },
];

function seedBuiltinRules(db: Database.Database): void {
  const now = Date.now();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO screen_detection_rules (id, name, description, enabled, auto_approve, intent, is_builtin, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const rule of BUILTIN_RULES) {
    insert.run(crypto.randomUUID(), rule.name, rule.description, rule.enabled, rule.auto_approve, rule.intent, rule.is_builtin, now, now);
  }
}

function ensureConfigRow(db: Database.Database): void {
  const existing = db.prepare("SELECT id FROM screen_monitor_config WHERE id = 'singleton'").get();
  if (!existing) {
    db.prepare(`
      INSERT INTO screen_monitor_config (id, poll_interval_ms, hotkey, enabled, vision_model_override, updated_at)
      VALUES ('singleton', 30000, 'ctrl+shift+s', 0, NULL, ?)
    `).run(Date.now());
  }
}

// ─── ScreenMonitor Singleton ──────────────────────────────────────────────────

export const ScreenMonitor = {
  async init(io?: Server): Promise<void> {
    _ioInstance = io;
    const db = getDb();
    seedBuiltinRules(db);
    ensureConfigRow(db);
    // Capture + poller + hotkey wired in Task 3
  },

  getConfig(): ScreenMonitorConfig {
    return getDb().prepare("SELECT * FROM screen_monitor_config WHERE id = 'singleton'").get() as ScreenMonitorConfig;
  },

  updateConfig(updates: Partial<Omit<ScreenMonitorConfig, "id" | "updated_at">>): ScreenMonitorConfig {
    const db = getDb();
    const now = Date.now();
    const allowed = ["poll_interval_ms", "hotkey", "enabled", "vision_model_override"] as const;
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        db.prepare(`UPDATE screen_monitor_config SET ${key} = ?, updated_at = ? WHERE id = 'singleton'`)
          .run(updates[key] as string | number | null, now);
      }
    }
    return this.getConfig();
  },

  // ── Rules CRUD ──────────────────────────────────────────────────────────────

  listRules(): ScreenDetectionRule[] {
    return getDb().prepare("SELECT * FROM screen_detection_rules ORDER BY is_builtin DESC, created_at ASC").all() as ScreenDetectionRule[];
  },

  createRule(input: CreateRuleInput): ScreenDetectionRule {
    const db = getDb();
    const id = crypto.randomUUID();
    const now = Date.now();
    db.prepare(`
      INSERT INTO screen_detection_rules (id, name, description, enabled, auto_approve, intent, is_builtin, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(id, input.name, input.description, input.enabled !== false ? 1 : 0, input.auto_approve, input.intent, now, now);
    return db.prepare("SELECT * FROM screen_detection_rules WHERE id = ?").get(id) as ScreenDetectionRule;
  },

  updateRule(id: string, updates: Partial<CreateRuleInput>): ScreenDetectionRule {
    const db = getDb();
    const existing = db.prepare("SELECT id FROM screen_detection_rules WHERE id = ?").get(id);
    if (!existing) throw new Error(`Rule ${id} not found`);
    const now = Date.now();
    const allowed = ["name", "description", "intent", "auto_approve"] as const;
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        db.prepare(`UPDATE screen_detection_rules SET ${key} = ?, updated_at = ? WHERE id = ?`)
          .run(updates[key] as string, now, id);
      }
    }
    return db.prepare("SELECT * FROM screen_detection_rules WHERE id = ?").get(id) as ScreenDetectionRule;
  },

  deleteRule(id: string): void {
    const db = getDb();
    const rule = db.prepare("SELECT is_builtin FROM screen_detection_rules WHERE id = ?").get(id) as { is_builtin: number } | undefined;
    if (!rule) throw new Error(`Rule ${id} not found`);
    if (rule.is_builtin === 1) throw new Error("Cannot delete built-in detection rule");
    db.prepare("DELETE FROM screen_detection_rules WHERE id = ?").run(id);
  },

  toggleRule(id: string, enabled: boolean): void {
    getDb().prepare("UPDATE screen_detection_rules SET enabled = ?, updated_at = ? WHERE id = ?")
      .run(enabled ? 1 : 0, Date.now(), id);
  },

  // ── Detections ──────────────────────────────────────────────────────────────

  listDetections(opts: { limit?: number; offset?: number; rule_id?: string } = {}): ScreenDetection[] {
    const { limit = 50, offset = 0, rule_id } = opts;
    if (rule_id) {
      return getDb().prepare("SELECT * FROM screen_detections WHERE rule_id = ? ORDER BY detected_at DESC LIMIT ? OFFSET ?")
        .all(rule_id, limit, offset) as ScreenDetection[];
    }
    return getDb().prepare("SELECT * FROM screen_detections ORDER BY detected_at DESC LIMIT ? OFFSET ?")
      .all(limit, offset) as ScreenDetection[];
  },

  dismissDetection(id: string): void {
    getDb().prepare("UPDATE screen_detections SET status = 'dismissed' WHERE id = ?").run(id);
  },

  // ── Internal helpers exposed for tests ──────────────────────────────────────

  _isOnCooldown(ruleId: string): boolean {
    const recent = getDb().prepare(`
      SELECT detected_at FROM screen_detections
      WHERE rule_id = ? AND status IN ('pending', 'fired')
      ORDER BY detected_at DESC LIMIT 1
    `).get(ruleId) as { detected_at: number } | undefined;
    if (!recent) return false;
    return (Date.now() - recent.detected_at) < COOLDOWN_MS;
  },

  _insertDetectionForTest(ruleId: string, screenshotPath: string, description: string): string {
    const id = crypto.randomUUID();
    getDb().prepare(`
      INSERT INTO screen_detections (id, rule_id, detected_at, screenshot_path, description, goal_id, status)
      VALUES (?, ?, ?, ?, ?, NULL, 'pending')
    `).run(id, ruleId, Date.now(), screenshotPath, description);
    return id;
  },

  // Stubs — implemented in Tasks 2 & 3
  startPolling(): void {},
  stopPolling(): void {},
  async captureAndAnalyze(): Promise<void> {},
  async _analyzeScreenshot(_screenshotPath: string, _base64: string): Promise<DetectionResult[]> { return []; },
  async _fireDetections(_results: DetectionResult[], _screenshotPath: string): Promise<void> {},
};
```

- [ ] **Step 4: Run tests — confirm all pass**

```powershell
npx jest screenMonitor --no-coverage 2>&1
```

Expected: all 13 tests PASS.

- [ ] **Step 5: Type-check**

```powershell
npx tsc --noEmit 2>&1 | Select-Object -First 20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```powershell
git add src/core/screenMonitor.ts src/tests/screenMonitor.test.ts
git commit -m "feat(screen-monitor): SQLite schema, CRUD, config, cooldown — Task 1"
```

---

### Task 2: Vision LLM Analysis and Goal Firing

**Files:**
- Modify: `src/core/screenMonitor.ts` — replace stub `_analyzeScreenshot` and `_fireDetections`

This task wires up the vision LLM call and goal-firing logic. No capture or poller yet.

- [ ] **Step 1: Add vision LLM analysis — replace the two stubs**

Add these imports at the top of `src/core/screenMonitor.ts` (after existing imports):

```typescript
import { LLMFactory } from "./llmFactory";
import { HumanMessage } from "@langchain/core/messages";
import { MidpointXGraph } from "./graph";
import { Config } from "./config";
import { TelegramService } from "../services/telegramService";
```

Then replace the stub `_analyzeScreenshot` and `_fireDetections` methods:

```typescript
  async _analyzeScreenshot(screenshotPath: string, base64: string): Promise<DetectionResult[]> {
    const provider = Config.ACTIVE_LLM_PROVIDER.toLowerCase();
    const VISION_PROVIDERS = ["anthropic", "openai", "google", "openrouter", "nvidia"];
    if (!VISION_PROVIDERS.includes(provider)) {
      console.warn(`[ScreenMonitor] Provider "${provider}" does not support vision. Skipping analysis.`);
      return [];
    }

    const rules = this.listRules().filter(r => r.enabled === 1);
    if (rules.length === 0) return [];

    const ruleList = rules.map((r, i) =>
      `${i + 1}. rule_id="${r.id}" name="${r.name}" — ${r.description}`
    ).join("\n");

    const prompt = `You are a desktop vision monitor. Analyze this screenshot and check for each detection rule below.

Return a JSON array only — no markdown, no prose. Each element:
{ "rule_id": "<exact rule_id>", "detected": true/false, "description": "<what you saw or why not detected>", "suggested_action": "<brief action>" }

Detection rules:
${ruleList}`;

    const model = LLMFactory.getModel({ temperature: 0 });
    const message = new HumanMessage({
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } },
      ],
    });

    const response = await model.invoke([message]);
    const raw = typeof response.content === "string" ? response.content : JSON.stringify(response.content);

    try {
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      return JSON.parse(cleaned) as DetectionResult[];
    } catch {
      console.error("[ScreenMonitor] LLM returned malformed JSON. Raw:", raw.substring(0, 200));
      return [];
    }
  },

  async _fireDetections(results: DetectionResult[], screenshotPath: string): Promise<void> {
    const db = getDb();
    for (const result of results) {
      if (!result.detected) continue;
      if (this._isOnCooldown(result.rule_id)) {
        console.log(`[ScreenMonitor] Rule ${result.rule_id} on cooldown — skipping`);
        continue;
      }

      const rule = db.prepare("SELECT * FROM screen_detection_rules WHERE id = ?").get(result.rule_id) as ScreenDetectionRule | undefined;
      if (!rule || rule.enabled === 0) continue;

      const detectionId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO screen_detections (id, rule_id, detected_at, screenshot_path, description, goal_id, status)
        VALUES (?, ?, ?, ?, ?, NULL, 'pending')
      `).run(detectionId, rule.id, Date.now(), screenshotPath, result.description);

      if (rule.auto_approve === "notify") {
        TelegramService.sendMessage(
          `👁️ Screen detection: **${rule.name}**\n${result.description}`
        ).catch(() => {});
        db.prepare("UPDATE screen_detections SET status = 'fired' WHERE id = ?").run(detectionId);
        continue;
      }

      const intent = rule.auto_approve === "ask"
        ? `[SCREEN DETECTION — awaiting approval] ${rule.intent}\n\nDetection: ${result.description}`
        : `${rule.intent}\n\nScreen detection context: ${result.description}`;

      const taskId = `SCREEN_${detectionId}_${Date.now()}`;

      // Fire goal in background — same IIFE pattern as ProactiveScheduler._fireSchedule
      (async () => {
        try {
          const stream = await MidpointXGraph.stream(
            {
              taskId,
              userIntent: intent,
              proactiveTrigger: { type: "screen_detection", data: { rule: rule.name, screenshotPath, description: result.description } },
            },
            {
              recursionLimit: Config.MAX_RECURSION_LIMIT,
              configurable: { thread_id: taskId },
            }
          );

          let goalId: string | null = null;
          for await (const chunk of stream) {
            const nodeName = Object.keys(chunk)[0];
            const stateUpdate = (chunk as Record<string, Record<string, unknown>>)[nodeName];
            if (!goalId && stateUpdate?.activeGoalId) {
              goalId = stateUpdate.activeGoalId as string;
              db.prepare("UPDATE screen_detections SET goal_id = ?, status = 'fired' WHERE id = ?")
                .run(goalId, detectionId);
            }
            if (_ioInstance && nodeName !== "__end__") {
              _ioInstance.emit("agent:progress", { stage: nodeName, data: stateUpdate });
            }
          }
        } catch (err: unknown) {
          console.error(`[ScreenMonitor] Goal fire failed for detection ${detectionId}:`, (err as Error).message);
        }
      })();
    }
  },
```

- [ ] **Step 2: Run type-check**

```powershell
npx tsc --noEmit 2>&1 | Select-Object -First 30
```

Expected: no errors. If `HumanMessage` content type errors appear, add `as any` to the content array — LangChain's multimodal types vary by version.

- [ ] **Step 3: Run tests — still all pass**

```powershell
npx jest screenMonitor --no-coverage 2>&1
```

Expected: all 13 still PASS (no tests for LLM calls — they require mocking; covered by integration testing in verification).

- [ ] **Step 4: Commit**

```powershell
git add src/core/screenMonitor.ts
git commit -m "feat(screen-monitor): vision LLM analysis and goal-firing — Task 2"
```

---

### Task 3: Capture, Poller, Hotkey, and `init()`

**Files:**
- Modify: `src/core/screenMonitor.ts` — replace stub `captureAndAnalyze`, `startPolling`, `stopPolling`; wire `init()`
- Create directory: `src/workspace/screenshots/` (if absent — `fs.mkdirSync` with `{ recursive: true }`)

- [ ] **Step 1: Add imports and implement `captureAndAnalyze`**

Add these imports at the top of `src/core/screenMonitor.ts` (after existing imports):

```typescript
import { screen, saveImage, FileType } from "@nut-tree-fork/nut-js";
import { GlobalKeyboardListener } from "node-global-key-listener";
import fs from "fs";
```

Replace the stub `captureAndAnalyze`:

```typescript
  async captureAndAnalyze(): Promise<void> {
    const screenshotsDir = path.resolve(process.cwd(), "src/workspace/screenshots");
    fs.mkdirSync(screenshotsDir, { recursive: true });

    const filename = `screen_${Date.now()}.png`;
    const screenshotPath = path.join(screenshotsDir, filename);

    // Capture full desktop
    let base64: string;
    try {
      const image = await screen.grab();
      await saveImage({ image, path: screenshotPath, type: FileType.PNG });
      base64 = fs.readFileSync(screenshotPath).toString("base64");
      _consecutiveCaptureFails = 0;
    } catch (err: unknown) {
      _consecutiveCaptureFails++;
      console.error(`[ScreenMonitor] Capture failed (${_consecutiveCaptureFails}/${MAX_CONSECUTIVE_FAILS}):`, (err as Error).message);
      if (_consecutiveCaptureFails >= MAX_CONSECUTIVE_FAILS) {
        console.error("[ScreenMonitor] Too many consecutive failures — disabling monitor.");
        this.updateConfig({ enabled: 0 });
        this.stopPolling();
        TelegramService.sendMessage("⚠️ Screen Monitor disabled after 5 consecutive capture failures.").catch(() => {});
      }
      return;
    }

    // Rolling window — delete oldest if over MAX_SCREENSHOTS
    try {
      const files = fs.readdirSync(screenshotsDir)
        .filter(f => f.endsWith(".png"))
        .map(f => ({ name: f, mtime: fs.statSync(path.join(screenshotsDir, f)).mtimeMs }))
        .sort((a, b) => a.mtime - b.mtime);
      while (files.length > MAX_SCREENSHOTS) {
        const oldest = files.shift()!;
        fs.unlinkSync(path.join(screenshotsDir, oldest.name));
      }
    } catch { /* disk error — non-fatal */ }

    // Analyze
    const relativePath = path.relative(process.cwd(), screenshotPath);
    const results = await this._analyzeScreenshot(relativePath, base64);
    await this._fireDetections(results, relativePath);
  },
```

- [ ] **Step 2: Implement `startPolling`, `stopPolling`**

Replace the stubs:

```typescript
  startPolling(): void {
    if (_pollerHandle) return; // already running
    const cfg = this.getConfig();
    _pollerHandle = setInterval(async () => {
      const current = this.getConfig();
      if (current.enabled === 0) return;
      await this.captureAndAnalyze().catch(err =>
        console.error("[ScreenMonitor] captureAndAnalyze error:", err)
      );
    }, cfg.poll_interval_ms);
    console.log(`[ScreenMonitor] Polling started at ${cfg.poll_interval_ms}ms interval`);
  },

  stopPolling(): void {
    if (_pollerHandle) {
      clearInterval(_pollerHandle);
      _pollerHandle = null;
      console.log("[ScreenMonitor] Polling stopped");
    }
  },
```

- [ ] **Step 3: Implement hotkey registration**

Add module-level variable after existing module-level declarations:

```typescript
let _hotkeyListener: InstanceType<typeof GlobalKeyboardListener> | null = null;
```

Add `_registerHotkey` method:

```typescript
  _registerHotkey(): void {
    const cfg = this.getConfig();
    const hotkey = cfg.hotkey.toLowerCase(); // e.g. "ctrl+shift+s"
    const keys = hotkey.split("+").map(k => k.trim());

    try {
      _hotkeyListener = new GlobalKeyboardListener();
      _hotkeyListener.addListener((e, down) => {
        if (e.state !== "DOWN") return;
        // Check all modifier keys + trigger key
        const modMap: Record<string, string[]> = {
          ctrl: ["LEFT CTRL", "RIGHT CTRL"],
          shift: ["LEFT SHIFT", "RIGHT SHIFT"],
          alt: ["LEFT ALT", "RIGHT ALT"],
          meta: ["LEFT META", "RIGHT META"],
        };
        for (const key of keys) {
          if (modMap[key]) {
            if (!modMap[key].some(k => down[k])) return;
          } else {
            // Trigger key — matches current event
            if (e.name?.toLowerCase() !== key.toUpperCase() && e.name?.toLowerCase() !== key) return;
          }
        }
        console.log("[ScreenMonitor] Hotkey triggered — capturing");
        this.captureAndAnalyze().catch(err => console.error("[ScreenMonitor] Hotkey capture error:", err));
      });
      console.log(`[ScreenMonitor] Hotkey registered: ${cfg.hotkey}`);
    } catch (err: unknown) {
      console.warn("[ScreenMonitor] Hotkey registration failed (falling back to poll-only):", (err as Error).message);
    }
  },
```

- [ ] **Step 4: Wire `init()` with all subsystems**

Replace the stub `init`:

```typescript
  async init(io?: Server): Promise<void> {
    _ioInstance = io;
    const db = getDb();
    seedBuiltinRules(db);
    ensureConfigRow(db);

    const cfg = this.getConfig();
    const provider = Config.ACTIVE_LLM_PROVIDER.toLowerCase();
    const VISION_PROVIDERS = ["anthropic", "openai", "google", "openrouter", "nvidia"];
    if (!VISION_PROVIDERS.includes(provider)) {
      console.warn(`[ScreenMonitor] Provider "${provider}" does not support vision. Poller will run but skip analysis.`);
    }

    this._registerHotkey();

    if (cfg.enabled === 1) {
      this.startPolling();
    }

    console.log("[ScreenMonitor] Initialized.");
  },
```

- [ ] **Step 5: Type-check**

```powershell
npx tsc --noEmit 2>&1 | Select-Object -First 30
```

Expected: no errors. Common issue: `saveImage` type — if it requires `{ image, path, type }`, it matches the nut-js API. If `FileType` isn't exported, use `"png"` string literal instead.

- [ ] **Step 6: Run tests**

```powershell
npx jest screenMonitor --no-coverage 2>&1
```

Expected: all 13 PASS. The new methods touch nut-js and LLM which aren't called in unit tests.

- [ ] **Step 7: Commit**

```powershell
git add src/core/screenMonitor.ts
git commit -m "feat(screen-monitor): capture loop, poller, hotkey, full init() — Task 3"
```

---

### Task 4: REST API Routes and Server Wiring

**Files:**
- Create: `src/routes/screenMonitorRoutes.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: Create `src/routes/screenMonitorRoutes.ts`**

```typescript
import { Router } from "express";
import { ScreenMonitor } from "../core/screenMonitor";

const router = Router();

// ── Config ───────────────────────────────────────────────────────────────────

router.get("/config", (_req, res) => {
  res.json(ScreenMonitor.getConfig());
});

router.patch("/config", (req, res) => {
  try {
    const { poll_interval_ms, hotkey, enabled, vision_model_override } = req.body as {
      poll_interval_ms?: number;
      hotkey?: string;
      enabled?: number;
      vision_model_override?: string | null;
    };
    const updates: Parameters<typeof ScreenMonitor.updateConfig>[0] = {};
    if (poll_interval_ms !== undefined) updates.poll_interval_ms = poll_interval_ms;
    if (hotkey !== undefined) updates.hotkey = hotkey;
    if (enabled !== undefined) updates.enabled = enabled;
    if (vision_model_override !== undefined) updates.vision_model_override = vision_model_override;

    const cfg = ScreenMonitor.updateConfig(updates);

    // Hot-reload poller when enabled or interval changes
    if (enabled !== undefined || poll_interval_ms !== undefined) {
      ScreenMonitor.stopPolling();
      if (cfg.enabled === 1) ScreenMonitor.startPolling();
    }

    res.json(cfg);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Detection Rules ───────────────────────────────────────────────────────────

router.get("/rules", (_req, res) => {
  res.json(ScreenMonitor.listRules());
});

router.post("/rules", (req, res) => {
  try {
    const { name, description, intent, auto_approve, enabled } = req.body as {
      name: string;
      description: string;
      intent: string;
      auto_approve: "ask" | "auto" | "notify";
      enabled?: boolean;
    };
    if (!name || !description || !intent || !auto_approve) {
      res.status(400).json({ error: "name, description, intent, auto_approve required" });
      return;
    }
    const rule = ScreenMonitor.createRule({ name, description, intent, auto_approve, enabled });
    res.status(201).json(rule);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/rules/:id", (req, res) => {
  try {
    const rule = ScreenMonitor.updateRule(req.params.id, req.body);
    res.json(rule);
  } catch (err: any) {
    res.status(err.message.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

router.delete("/rules/:id", (req, res) => {
  try {
    ScreenMonitor.deleteRule(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    const status = err.message.includes("built-in") ? 403 : err.message.includes("not found") ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

router.post("/rules/:id/toggle", (req, res) => {
  try {
    const { enabled } = req.body as { enabled: boolean };
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "enabled (boolean) required" });
      return;
    }
    ScreenMonitor.toggleRule(req.params.id, enabled);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Captures & Detections ─────────────────────────────────────────────────────

router.post("/capture", async (_req, res) => {
  try {
    await ScreenMonitor.captureAndAnalyze();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/detections", (req, res) => {
  const limit = parseInt(String(req.query.limit || "50"), 10);
  const offset = parseInt(String(req.query.offset || "0"), 10);
  const rule_id = req.query.rule_id as string | undefined;
  res.json(ScreenMonitor.listDetections({ limit, offset, rule_id }));
});

router.post("/detections/:id/dismiss", (req, res) => {
  try {
    ScreenMonitor.dismissDetection(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export { router as screenMonitorRoutes };
```

- [ ] **Step 2: Wire into `src/server.ts`**

After line 42 (`import { ProactiveScheduler } from "./core/proactiveScheduler";`), add:

```typescript
import { screenMonitorRoutes } from "./routes/screenMonitorRoutes";
import { ScreenMonitor } from "./core/screenMonitor";
```

After line 121 (`app.use("/api/v1/schedules", scheduleRoutes);`), add:

```typescript
app.use("/api/v1/screen-monitor", screenMonitorRoutes);
```

After line 315 (`await ProactiveScheduler.init(io);`), add:

```typescript
await ScreenMonitor.init(io);
```

- [ ] **Step 3: Type-check**

```powershell
npx tsc --noEmit 2>&1 | Select-Object -First 30
```

Expected: no errors.

- [ ] **Step 4: Run all tests**

```powershell
npx jest --no-coverage 2>&1 | tail -20
```

Expected: all existing tests + screenMonitor tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/routes/screenMonitorRoutes.ts src/server.ts
git commit -m "feat(screen-monitor): REST API routes and server wiring — Task 4"
```

---

### Task 5: Frontend — ScreenMonitorView

**Files:**
- Create: `frontend/src/components/ScreenMonitorView.jsx`
- Modify: `frontend/src/App.jsx` — add `screen-monitor` view
- Modify: `frontend/src/components/Sidebar.jsx` — add SCREEN nav item with Eye icon

- [ ] **Step 1: Create `frontend/src/components/ScreenMonitorView.jsx`**

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Eye, Play, Trash2, ToggleLeft, ToggleRight, Pencil, X, Check, Loader } from 'lucide-react';

const APPROVE_BADGE = {
  ask:    { label: 'ASK',    color: '#f59e0b' },
  auto:   { label: 'AUTO',   color: '#10b981' },
  notify: { label: 'NOTIFY', color: '#3b82f6' },
};

const STATUS_BADGE = {
  pending:   { label: 'PENDING',   color: '#f59e0b' },
  fired:     { label: 'FIRED',     color: '#10b981' },
  dismissed: { label: 'DISMISSED', color: '#6b7280' },
};

function Badge({ type, map }) {
  const b = map[type] || { label: type, color: '#888' };
  return (
    <span style={{ background: b.color + '22', color: b.color, padding: '2px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 700 }}>
      {b.label}
    </span>
  );
}

function formatTs(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

const EMPTY_FORM = { name: '', description: '', intent: '', auto_approve: 'ask', enabled: true };

export default function ScreenMonitorView() {
  const [config, setConfig] = useState(null);
  const [rules, setRules] = useState([]);
  const [detections, setDetections] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingRule, setEditingRule] = useState(null); // rule id being edited
  const [editForm, setEditForm] = useState({});
  const [capturing, setCapturing] = useState(false);
  const [savingCfg, setSavingCfg] = useState(false);
  const [cfgForm, setCfgForm] = useState({ poll_interval_ms: 30000 });
  const [error, setError] = useState('');
  const [visionWarning, setVisionWarning] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [cfgRes, rulesRes, detRes] = await Promise.all([
        fetch('/api/v1/screen-monitor/config'),
        fetch('/api/v1/screen-monitor/rules'),
        fetch('/api/v1/screen-monitor/detections?limit=50'),
      ]);
      const [cfg, rulesData, dets] = await Promise.all([cfgRes.json(), rulesRes.json(), detRes.json()]);
      setConfig(cfg);
      setCfgForm({ poll_interval_ms: Math.round(cfg.poll_interval_ms / 1000) });
      setRules(rulesData);
      setDetections(dets);
    } catch {}
  }, []);

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 5000);
    return () => clearInterval(interval);
  }, [loadAll]);

  // Check for vision provider warning
  useEffect(() => {
    fetch('/api/v1/config')
      .then(r => r.json())
      .then(data => {
        const provider = (data.ACTIVE_LLM_PROVIDER || '').toLowerCase();
        const VISION = ['anthropic', 'openai', 'google', 'openrouter', 'nvidia'];
        setVisionWarning(!VISION.includes(provider));
      })
      .catch(() => {});
  }, []);

  async function toggleMaster() {
    if (!config) return;
    const newEnabled = config.enabled === 1 ? 0 : 1;
    const res = await fetch('/api/v1/screen-monitor/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: newEnabled }),
    });
    const data = await res.json();
    setConfig(data);
  }

  async function saveConfig(e) {
    e.preventDefault();
    setSavingCfg(true);
    try {
      const res = await fetch('/api/v1/screen-monitor/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poll_interval_ms: cfgForm.poll_interval_ms * 1000 }),
      });
      const data = await res.json();
      setConfig(data);
    } finally { setSavingCfg(false); }
  }

  async function handleCapture() {
    setCapturing(true);
    try {
      await fetch('/api/v1/screen-monitor/capture', { method: 'POST' });
      await loadAll();
    } finally { setCapturing(false); }
  }

  async function handleAddRule(e) {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/v1/screen-monitor/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); return; }
    setForm(EMPTY_FORM);
    await loadAll();
  }

  async function handleDeleteRule(id) {
    if (!confirm('Delete this rule?')) return;
    await fetch(`/api/v1/screen-monitor/rules/${id}`, { method: 'DELETE' });
    await loadAll();
  }

  async function handleToggleRule(rule) {
    await fetch(`/api/v1/screen-monitor/rules/${rule.id}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: rule.enabled === 0 }),
    });
    await loadAll();
  }

  async function handleSaveEdit(id) {
    await fetch(`/api/v1/screen-monitor/rules/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    setEditingRule(null);
    await loadAll();
  }

  async function handleDismiss(id) {
    await fetch(`/api/v1/screen-monitor/detections/${id}/dismiss`, { method: 'POST' });
    await loadAll();
  }

  if (!config) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', fontSize: '12px' }}>Loading...</div>;

  return (
    <div style={{ display: 'flex', height: '100%', gap: '1px', background: 'var(--border-subtle)' }}>
      {/* Left Column */}
      <div style={{ width: '400px', flexShrink: 0, background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Eye size={16} color="var(--accent-teal)" />
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', color: 'var(--accent-teal)' }}>SCREEN MONITOR</span>
          </div>

          {visionWarning && (
            <div style={{ padding: '8px 10px', marginBottom: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: '4px', fontSize: '11px', color: '#ef4444' }}>
              Vision not supported by current provider. Switch to anthropic, openai, google, openrouter, or nvidia.
            </div>
          )}

          {/* Master toggle + status */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {config.enabled === 1 ? '● ACTIVE' : '○ INACTIVE'}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Hotkey: {config.hotkey} · Every {Math.round(config.poll_interval_ms / 1000)}s
              </div>
            </div>
            <button
              onClick={toggleMaster}
              style={{ background: config.enabled === 1 ? 'rgba(16,185,129,0.15)' : 'var(--bg-primary)', border: `1px solid ${config.enabled === 1 ? '#10b981' : 'var(--border-subtle)'}`, color: config.enabled === 1 ? '#10b981' : 'var(--text-secondary)', padding: '6px 14px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
            >
              {config.enabled === 1 ? 'DISABLE' : 'ENABLE'}
            </button>
          </div>

          {/* Poll interval config */}
          <form onSubmit={saveConfig} style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="number"
                min="5"
                style={{ width: '70px', background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '5px 8px', borderRadius: '4px', fontSize: '12px' }}
                value={cfgForm.poll_interval_ms}
                onChange={e => setCfgForm(f => ({ ...f, poll_interval_ms: parseInt(e.target.value) || 30 }))}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>sec interval</span>
            </div>
            <button type="submit" disabled={savingCfg} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '5px 10px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}>
              Save
            </button>
          </form>

          {/* Manual capture */}
          <button
            onClick={handleCapture}
            disabled={capturing}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'var(--accent-teal)', color: '#000', border: 'none', padding: '7px', borderRadius: '4px', fontSize: '12px', fontWeight: 700, cursor: capturing ? 'not-allowed' : 'pointer' }}
          >
            {capturing ? <Loader size={13} /> : <Play size={13} />}
            {capturing ? 'Analyzing...' : 'Manual Capture'}
          </button>
        </div>

        {/* Detection rules */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: 'var(--text-secondary)', padding: '4px 8px', marginBottom: '4px' }}>DETECTION RULES</div>
          {rules.map(rule => (
            <div key={rule.id} style={{ padding: '10px 12px', marginBottom: '4px', borderRadius: '4px', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)' }}>
              {editingRule === rule.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <input style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '4px 8px', borderRadius: '3px', fontSize: '11px' }} value={editForm.name || ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder="Name" />
                  <textarea style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '4px 8px', borderRadius: '3px', fontSize: '11px', resize: 'vertical', minHeight: '48px' }} value={editForm.description || ''} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} placeholder="Description" />
                  <textarea style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '4px 8px', borderRadius: '3px', fontSize: '11px', resize: 'vertical', minHeight: '40px' }} value={editForm.intent || ''} onChange={e => setEditForm(f => ({ ...f, intent: e.target.value }))} placeholder="Intent" />
                  <select style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '4px 8px', borderRadius: '3px', fontSize: '11px' }} value={editForm.auto_approve || 'ask'} onChange={e => setEditForm(f => ({ ...f, auto_approve: e.target.value }))}>
                    <option value="ask">ASK</option>
                    <option value="auto">AUTO</option>
                    <option value="notify">NOTIFY</option>
                  </select>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => handleSaveEdit(rule.id)} style={{ flex: 1, background: 'var(--accent-teal)', color: '#000', border: 'none', padding: '4px', borderRadius: '3px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}><Check size={11} /> Save</button>
                    <button onClick={() => setEditingRule(null)} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', padding: '4px 8px', borderRadius: '3px', fontSize: '11px', cursor: 'pointer' }}><X size={11} /></button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{rule.name}</span>
                      <Badge type={rule.auto_approve} map={APPROVE_BADGE} />
                    </div>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <button onClick={() => handleToggleRule(rule)} style={{ background: 'none', border: 'none', color: rule.enabled ? 'var(--accent-teal)' : 'var(--text-secondary)', cursor: 'pointer', padding: '2px' }}>
                        {rule.enabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                      </button>
                      <button onClick={() => { setEditingRule(rule.id); setEditForm({ name: rule.name, description: rule.description, intent: rule.intent, auto_approve: rule.auto_approve }); }} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px' }}>
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        disabled={rule.is_builtin === 1}
                        title={rule.is_builtin ? "Built-in rule cannot be deleted" : "Delete"}
                        style={{ background: 'none', border: 'none', color: rule.is_builtin ? '#444' : '#ef4444', cursor: rule.is_builtin ? 'not-allowed' : 'pointer', padding: '2px' }}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '3px' }}>{rule.description}</div>
                </>
              )}
            </div>
          ))}

          {/* Add rule form */}
          <div style={{ marginTop: '8px', padding: '10px 12px', borderRadius: '4px', border: '1px dashed var(--border-subtle)' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: 'var(--text-secondary)', marginBottom: '8px' }}>+ ADD RULE</div>
            <form onSubmit={handleAddRule} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <input required style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '5px 8px', borderRadius: '3px', fontSize: '11px' }} placeholder="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <textarea required style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '5px 8px', borderRadius: '3px', fontSize: '11px', resize: 'vertical', minHeight: '48px' }} placeholder="Description — what to detect (plain English)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              <textarea required style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '5px 8px', borderRadius: '3px', fontSize: '11px', resize: 'vertical', minHeight: '40px' }} placeholder="Intent — what should the agent do?" value={form.intent} onChange={e => setForm(f => ({ ...f, intent: e.target.value }))} />
              <select style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '5px 8px', borderRadius: '3px', fontSize: '11px' }} value={form.auto_approve} onChange={e => setForm(f => ({ ...f, auto_approve: e.target.value }))}>
                <option value="ask">ASK — require approval</option>
                <option value="auto">AUTO — fire autonomously</option>
                <option value="notify">NOTIFY — Telegram only</option>
              </select>
              {error && <p style={{ color: '#ef4444', fontSize: '10px', margin: 0 }}>{error}</p>}
              <button type="submit" style={{ background: 'var(--bg-primary)', border: '1px solid var(--accent-teal)', color: 'var(--accent-teal)', padding: '5px', borderRadius: '3px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                Add Rule
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Right Column — Detection History */}
      <div style={{ flex: 1, background: 'var(--bg-primary)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', color: 'var(--text-secondary)' }}>DETECTION HISTORY</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {detections.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)', fontSize: '12px' }}>
              No detections yet. Captures run every {config ? Math.round(config.poll_interval_ms / 1000) : 30}s or via Ctrl+Shift+S.
            </div>
          ) : (
            detections.map(det => {
              const rule = rules.find(r => r.id === det.rule_id);
              return (
                <div key={det.id} style={{ padding: '12px', marginBottom: '6px', borderRadius: '4px', border: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{rule?.name || det.rule_id}</span>
                      <Badge type={det.status} map={STATUS_BADGE} />
                    </div>
                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{formatTs(det.detected_at)}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px' }}>{det.description}</div>
                  {det.goal_id && (
                    <div style={{ fontSize: '10px', color: '#3b82f6', marginBottom: '4px' }}>Goal: {det.goal_id.substring(0, 8)}...</div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>📸 {det.screenshot_path}</span>
                    {det.status === 'pending' && (
                      <button onClick={() => handleDismiss(det.id)} style={{ background: 'none', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '3px', fontSize: '10px', cursor: 'pointer' }}>
                        Dismiss
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `frontend/src/App.jsx`**

After line 18 (`import SchedulesView from './components/SchedulesView';`), add:

```jsx
import ScreenMonitorView from './components/ScreenMonitorView';
```

After line 464 (`{activeView === 'proactive-schedules' && <SchedulesView />}`), add:

```jsx
{activeView === 'screen-monitor' && <ScreenMonitorView />}
```

- [ ] **Step 3: Wire into `frontend/src/components/Sidebar.jsx`**

Change the lucide-react import (line 2) to add `Eye`:

```jsx
import { MessageSquare, Settings, Box, Cpu, ChevronRight, Menu, Calendar, CalendarClock, Clock, Network, Brain, Workflow, Plug, Server, Eye } from 'lucide-react';
```

Add SCREEN nav item after the `proactive-schedules` entry (after line 15):

```jsx
    { id: 'screen-monitor', label: 'SCREEN', icon: Eye },
```

- [ ] **Step 4: Type-check**

```powershell
npx tsc --noEmit 2>&1 | Select-Object -First 20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/components/ScreenMonitorView.jsx frontend/src/App.jsx frontend/src/components/Sidebar.jsx
git commit -m "feat(screen-monitor): frontend ScreenMonitorView, App routing, Sidebar nav — Task 5"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Full type-check**

```powershell
npx tsc --noEmit 2>&1
```

Expected: zero errors.

- [ ] **Step 2: Run full test suite**

```powershell
npx jest --no-coverage 2>&1 | tail -20
```

Expected: all tests pass including `screenMonitor` suite (13 tests).

- [ ] **Step 3: Start server and verify built-in rules appear**

```powershell
npm run dev
```

Navigate to `http://localhost:3000`, click SCREEN in the sidebar. Verify:
- 4 built-in rules appear: Error Dialog, Terminal Failure, Build/Test Failure, Incoming Notification
- Master toggle shows INACTIVE
- Poll interval shows 30s
- Hotkey displays `ctrl+shift+s`

- [ ] **Step 4: Test manual capture**

Press the ENABLE button, then Manual Capture. Verify:
- Button shows "Analyzing..." spinner while running
- Screenshot appears in detection history (or "No detections" if nothing was found — both are valid)
- No server errors in terminal

- [ ] **Step 5: Test hotkey**

With monitor ENABLED, press Ctrl+Shift+S. Verify in server terminal:
```
[ScreenMonitor] Hotkey triggered — capturing
```

- [ ] **Step 6: Test custom rule CRUD**

- Add a rule named "Test Rule" with auto_approve=auto
- Verify it appears in the list (no built-in badge)
- Toggle it off and on
- Delete it — confirm it disappears

- [ ] **Step 7: Final commit**

```powershell
git add -A
git commit -m "feat(screen-monitor): complete implementation verified — Task 6"
```
