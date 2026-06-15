import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";
import type { Server } from "socket.io";
import { LLMFactory } from "./llmFactory";
import { HumanMessage } from "@langchain/core/messages";
import { MidpointXGraph } from "./graph";
import { Config } from "./config";
import { TelegramService } from "../services/telegramService";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScreenDetectionRule {
  id: string;
  name: string;
  description: string;
  enabled: 0 | 1;
  auto_approve: "ask" | "auto" | "notify";
  intent: string;
  is_builtin: 0 | 1;
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
  enabled: 0 | 1;
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

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let _db: Database.Database | null = null;
let _ioInstance: Server | undefined;
let _pollerHandle: NodeJS.Timeout | null = null;
let _consecutiveCaptureFails = 0;
const MAX_CONSECUTIVE_FAILS = 5;
const COOLDOWN_MS = 5 * 60 * 1000;
const MAX_SCREENSHOTS = 100;

// ---------------------------------------------------------------------------
// DB bootstrap
// ---------------------------------------------------------------------------

function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath =
    process.env.SCREEN_MONITOR_DB_PATH ||
    path.resolve(process.cwd(), "src/workspace/midpointx.db");

  _db = new Database(dbPath);
  _db.pragma("foreign_keys = ON");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS screen_detection_rules (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL UNIQUE,
      description  TEXT NOT NULL,
      enabled      INTEGER NOT NULL DEFAULT 1,
      auto_approve TEXT NOT NULL DEFAULT 'ask',
      intent       TEXT NOT NULL,
      is_builtin   INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS screen_detections (
      id              TEXT PRIMARY KEY,
      rule_id         TEXT NOT NULL,
      detected_at     INTEGER NOT NULL,
      screenshot_path TEXT NOT NULL,
      description     TEXT NOT NULL,
      goal_id         TEXT,
      status          TEXT NOT NULL DEFAULT 'pending',
      FOREIGN KEY (rule_id) REFERENCES screen_detection_rules(id)
    );

    CREATE INDEX IF NOT EXISTS idx_sd_rule_id ON screen_detections(rule_id);
    CREATE INDEX IF NOT EXISTS idx_sd_status  ON screen_detections(status);

    CREATE TABLE IF NOT EXISTS screen_monitor_config (
      id                   TEXT PRIMARY KEY DEFAULT 'singleton',
      poll_interval_ms     INTEGER NOT NULL DEFAULT 30000,
      hotkey               TEXT    NOT NULL DEFAULT 'ctrl+shift+s',
      enabled              INTEGER NOT NULL DEFAULT 0,
      vision_model_override TEXT,
      updated_at           INTEGER NOT NULL
    );
  `);

  return _db;
}

// ---------------------------------------------------------------------------
// Testing helper — exported so test files can reset between runs
// ---------------------------------------------------------------------------

export function _resetDbForTesting(customPath?: string): void {
  if (_pollerHandle) {
    clearInterval(_pollerHandle);
    _pollerHandle = null;
  }
  if (_db) {
    try { _db.close(); } catch {}
    _db = null;
  }
  _consecutiveCaptureFails = 0;
  if (customPath !== undefined) {
    process.env.SCREEN_MONITOR_DB_PATH = customPath;
  }
}

// ---------------------------------------------------------------------------
// Built-in rules
// ---------------------------------------------------------------------------

interface BuiltinRuleDef {
  name: string;
  description: string;
  intent: string;
  auto_approve: "ask" | "auto" | "notify";
}

const BUILTIN_RULES: BuiltinRuleDef[] = [
  {
    name: "Error Dialog",
    description: "Detects modal error dialogs or crash reports on screen",
    intent: "Alert the user and offer to diagnose or dismiss the error",
    auto_approve: "ask",
  },
  {
    name: "Terminal Failure",
    description: "Detects error or exception output in a terminal window",
    intent: "Surface the error to the user and suggest a fix",
    auto_approve: "ask",
  },
  {
    name: "Build/Test Failure",
    description: "Detects failed build or test output in IDE or terminal",
    intent: "Notify the user and optionally trigger a fix workflow",
    auto_approve: "ask",
  },
  {
    name: "Incoming Notification",
    description: "Detects toast or banner notifications arriving on screen",
    intent: "Log the notification and optionally surface it to the assistant",
    auto_approve: "notify",
  },
];

function seedBuiltinRules(db: Database.Database): void {
  const now = Date.now();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO screen_detection_rules
      (id, name, description, enabled, auto_approve, intent, is_builtin, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?, 1, ?, ?)
  `);
  const run = db.transaction(() => {
    for (const rule of BUILTIN_RULES) {
      const id = crypto.createHash("sha1").update(`builtin:${rule.name}`).digest("hex").slice(0, 16);
      insert.run(id, rule.name, rule.description, rule.auto_approve, rule.intent, now, now);
    }
  });
  run();
}

function ensureConfigRow(db: Database.Database): void {
  const now = Date.now();
  db.prepare(`
    INSERT OR IGNORE INTO screen_monitor_config (id, updated_at)
    VALUES ('singleton', ?)
  `).run(now);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const ScreenMonitor = {
  // ── Lifecycle ────────────────────────────────────────────────────────────

  async init(io?: Server): Promise<void> {
    _ioInstance = io;
    const db = getDb();
    seedBuiltinRules(db);
    ensureConfigRow(db);
    // Capture / poller / hotkey registration — stubs, implemented in Tasks 2 & 3
  },

  // ── Config ───────────────────────────────────────────────────────────────

  getConfig(): ScreenMonitorConfig {
    const db = getDb();
    return db
      .prepare(`SELECT * FROM screen_monitor_config WHERE id = 'singleton'`)
      .get() as ScreenMonitorConfig;
  },

  updateConfig(
    updates: Partial<Omit<ScreenMonitorConfig, "id" | "updated_at">>
  ): ScreenMonitorConfig {
    const db = getDb();
    const now = Date.now();
    const allowed = ["poll_interval_ms", "hotkey", "enabled", "vision_model_override"] as const;
    const set: string[] = [];
    const values: unknown[] = [];

    for (const key of allowed) {
      if (key in updates && (updates as Record<string, unknown>)[key] !== undefined) {
        set.push(`${key} = ?`);
        values.push((updates as Record<string, unknown>)[key]);
      }
    }

    if (set.length > 0) {
      set.push("updated_at = ?");
      values.push(now);
      values.push("singleton");
      db.prepare(
        `UPDATE screen_monitor_config SET ${set.join(", ")} WHERE id = ?`
      ).run(...values);
    }

    return ScreenMonitor.getConfig();
  },

  // ── Rules ────────────────────────────────────────────────────────────────

  listRules(): ScreenDetectionRule[] {
    const db = getDb();
    return db
      .prepare(
        `SELECT * FROM screen_detection_rules ORDER BY is_builtin DESC, created_at ASC`
      )
      .all() as ScreenDetectionRule[];
  },

  createRule(input: CreateRuleInput): ScreenDetectionRule {
    const db = getDb();
    const now = Date.now();
    const id = crypto.randomBytes(8).toString("hex");
    const enabled = input.enabled === false ? 0 : 1;

    db.prepare(`
      INSERT INTO screen_detection_rules
        (id, name, description, enabled, auto_approve, intent, is_builtin, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(id, input.name, input.description, enabled, input.auto_approve, input.intent, now, now);

    return db
      .prepare(`SELECT * FROM screen_detection_rules WHERE id = ?`)
      .get(id) as ScreenDetectionRule;
  },

  updateRule(
    id: string,
    updates: Partial<Pick<ScreenDetectionRule, "name" | "description" | "intent" | "auto_approve">>
  ): ScreenDetectionRule {
    const db = getDb();
    const existing = db
      .prepare(`SELECT * FROM screen_detection_rules WHERE id = ?`)
      .get(id) as ScreenDetectionRule | undefined;

    if (!existing) throw new Error(`Rule ${id} not found`);

    const now = Date.now();
    const allowed = ["name", "description", "intent", "auto_approve"] as const;
    const set: string[] = [];
    const values: unknown[] = [];

    for (const key of allowed) {
      if (key in updates && (updates as Record<string, unknown>)[key] !== undefined) {
        set.push(`${key} = ?`);
        values.push((updates as Record<string, unknown>)[key]);
      }
    }

    if (set.length > 0) {
      set.push("updated_at = ?");
      values.push(now);
      values.push(id);
      db.prepare(
        `UPDATE screen_detection_rules SET ${set.join(", ")} WHERE id = ?`
      ).run(...values);
    }

    return db
      .prepare(`SELECT * FROM screen_detection_rules WHERE id = ?`)
      .get(id) as ScreenDetectionRule;
  },

  deleteRule(id: string): void {
    const db = getDb();
    const row = db
      .prepare(`SELECT is_builtin FROM screen_detection_rules WHERE id = ?`)
      .get(id) as { is_builtin: number } | undefined;

    if (!row) throw new Error(`Rule ${id} not found`);
    if (row.is_builtin === 1) throw new Error("Cannot delete built-in detection rule");

    db.prepare(`DELETE FROM screen_detection_rules WHERE id = ?`).run(id);
  },

  toggleRule(id: string, enabled: boolean): void {
    const db = getDb();
    db.prepare(
      `UPDATE screen_detection_rules SET enabled = ?, updated_at = ? WHERE id = ?`
    ).run(enabled ? 1 : 0, Date.now(), id);
  },

  // ── Detections ───────────────────────────────────────────────────────────

  listDetections(opts?: { limit?: number; offset?: number; rule_id?: string }): ScreenDetection[] {
    const db = getDb();
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (opts?.rule_id) {
      conditions.push("rule_id = ?");
      values.push(opts.rule_id);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;
    values.push(limit, offset);

    return db
      .prepare(
        `SELECT * FROM screen_detections ${where} ORDER BY detected_at DESC LIMIT ? OFFSET ?`
      )
      .all(...values) as ScreenDetection[];
  },

  dismissDetection(id: string): void {
    const db = getDb();
    db.prepare(
      `UPDATE screen_detections SET status = 'dismissed' WHERE id = ?`
    ).run(id);
  },

  // ── Cooldown ─────────────────────────────────────────────────────────────

  _isOnCooldown(ruleId: string): boolean {
    const db = getDb();
    const cutoff = Date.now() - COOLDOWN_MS;
    const row = db
      .prepare(`
        SELECT detected_at FROM screen_detections
        WHERE rule_id = ? AND status IN ('pending', 'fired') AND detected_at >= ?
        ORDER BY detected_at DESC LIMIT 1
      `)
      .get(ruleId, cutoff) as { detected_at: number } | undefined;

    return row !== undefined;
  },

  // ── Test helpers ─────────────────────────────────────────────────────────

  _insertDetectionForTest(ruleId: string, screenshotPath: string, description: string): string {
    const db = getDb();
    const id = crypto.randomBytes(8).toString("hex");
    const now = Date.now();
    db.prepare(`
      INSERT INTO screen_detections (id, rule_id, detected_at, screenshot_path, description, goal_id, status)
      VALUES (?, ?, ?, ?, ?, NULL, 'pending')
    `).run(id, ruleId, now, screenshotPath, description);
    return id;
  },

  // ── Stubs (implemented in Tasks 2 & 3) ───────────────────────────────────

  startPolling(): void {},

  stopPolling(): void {},

  async captureAndAnalyze(): Promise<void> {},

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
      ] as any,
    });

    const response = await model.invoke([message]);
    const raw = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

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

      const rule = db.prepare("SELECT * FROM screen_detection_rules WHERE id = ?")
        .get(result.rule_id) as ScreenDetectionRule | undefined;
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
              proactiveTrigger: {
                type: "screen_detection",
                data: { rule: rule.name, screenshotPath, description: result.description },
              },
            } as any,
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
          console.error(
            `[ScreenMonitor] Goal fire failed for detection ${detectionId}:`,
            (err as Error).message
          );
        }
      })();
    }
  },
};
