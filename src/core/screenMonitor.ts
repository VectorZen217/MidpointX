import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";
import type { Server } from "socket.io";
import { LLMFactory } from "./llmFactory";
import { HumanMessage } from "@langchain/core/messages";
import { MidpointXGraph } from "./graph";
import { Config } from "./config";
import { TelegramService } from "../services/telegramService";
import { screen, saveImage, FileType } from "@nut-tree-fork/nut-js";
import { GlobalKeyboardListener } from "node-global-key-listener";
import fs from "fs";

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
let _hotkeyListener: InstanceType<typeof GlobalKeyboardListener> | null = null;

// Vision-capable providers — checked in init() (warn) and _analyzeScreenshot() (skip)
const VISION_PROVIDERS = ["anthropic", "openai", "google", "openrouter", "nvidia"] as const;

// Invalidated on any rule write; avoids a DB round-trip on every capture cycle
let _rulesCache: ScreenDetectionRule[] | null = null;
type VisionProvider = (typeof VISION_PROVIDERS)[number];

// Resolved once at module load; recomputed each capture only if not yet created
const SCREENSHOTS_DIR = path.resolve(process.cwd(), "src/workspace/screenshots");

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
  _db.pragma("journal_mode = WAL");

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
  if (_hotkeyListener) {
    try { (_hotkeyListener as any).kill?.(); } catch {}
    _hotkeyListener = null;
  }
  if (_db) {
    try { _db.close(); } catch {}
    _db = null;
  }
  _consecutiveCaptureFails = 0;
  _rulesCache = null;
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
    // Reset fail counter so re-init after a circuit-breaker trip doesn't immediately
    // re-trip on the first subsequent failure.
    _consecutiveCaptureFails = 0;

    const db = getDb();
    seedBuiltinRules(db);
    ensureConfigRow(db);

    // Ensure screenshots directory exists once at init time rather than on every capture.
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

    const provider = Config.ACTIVE_LLM_PROVIDER.toLowerCase() as VisionProvider;
    if (!(VISION_PROVIDERS as readonly string[]).includes(provider)) {
      console.warn(
        `[ScreenMonitor] Provider "${provider}" does not support vision. Poller will run but skip analysis.`
      );
    }

    this._registerHotkey();

    const cfg = this.getConfig();
    if (cfg.enabled === 1) {
      this.startPolling();
    }

    console.log("[ScreenMonitor] Initialized.");
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
    if (_rulesCache) return _rulesCache;
    const db = getDb();
    _rulesCache = db
      .prepare(
        `SELECT * FROM screen_detection_rules ORDER BY is_builtin DESC, created_at ASC`
      )
      .all() as ScreenDetectionRule[];
    return _rulesCache;
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
    _rulesCache = null;

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
      _rulesCache = null;
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
    _rulesCache = null;
  },

  toggleRule(id: string, enabled: boolean): void {
    const db = getDb();
    const existing = db.prepare("SELECT id FROM screen_detection_rules WHERE id = ?").get(id);
    if (!existing) throw new Error(`Rule ${id} not found`);
    db.prepare("UPDATE screen_detection_rules SET enabled = ?, updated_at = ? WHERE id = ?")
      .run(enabled ? 1 : 0, Date.now(), id);
    _rulesCache = null;
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

  // ── Hotkey ───────────────────────────────────────────────────────────────

  _registerHotkey(): void {
    // Idempotent — do not spawn a second native key-server process if already registered.
    if (_hotkeyListener) return;

    const cfg = this.getConfig();
    const hotkey = cfg.hotkey.toLowerCase();
    const keys = hotkey.split("+").map((k: string) => k.trim());

    // Guard against empty or malformed hotkey strings (e.g. "" or "+")
    if (keys.length === 0 || keys.every(k => !k)) {
      console.warn("[ScreenMonitor] Invalid hotkey config — skipping registration");
      return;
    }

    const modMap: Record<string, string[]> = {
      ctrl: ["LEFT CTRL", "RIGHT CTRL"],
      shift: ["LEFT SHIFT", "RIGHT SHIFT"],
      alt: ["LEFT ALT", "RIGHT ALT"],
      meta: ["LEFT META", "RIGHT META"],
    };

    try {
      _hotkeyListener = new GlobalKeyboardListener();
      const listenerFn = (e: any, down: Record<string, boolean>) => {
        if (e.state !== "DOWN") return;
        for (const key of keys) {
          if (modMap[key]) {
            if (!modMap[key].some((k: string) => down[k])) return;
          } else {
            if (e.name?.toUpperCase() !== key.toUpperCase()) return;
          }
        }
        console.log("[ScreenMonitor] Hotkey triggered — capturing");
        this.captureAndAnalyze().catch((err: unknown) =>
          console.error("[ScreenMonitor] Hotkey capture error:", err)
        );
      };
      // addListener is async (spawns native key server); attach .catch so rejection
      // doesn't become an unhandled promise rejection in non-GUI environments (e.g. tests)
      Promise.resolve(_hotkeyListener.addListener(listenerFn))
        .then(() => console.log(`[ScreenMonitor] Hotkey registered: ${cfg.hotkey}`))
        .catch((err: unknown) => {
          console.warn(
            "[ScreenMonitor] Hotkey registration failed (polling-only):",
            (err as Error).message
          );
          _hotkeyListener = null;
        });
    } catch (err: unknown) {
      console.warn(
        "[ScreenMonitor] Hotkey registration failed (polling-only):",
        (err as Error).message
      );
    }
  },

  // ── Polling ──────────────────────────────────────────────────────────────

  startPolling(): void {
    if (_pollerHandle) return;
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

  // ── Capture & Analyze ─────────────────────────────────────────────────────

  async captureAndAnalyze(): Promise<void> {
    // SCREENSHOTS_DIR is created once in init(); mkdirSync here is a cheap no-op if it
    // already exists but keeps captureAndAnalyze safe when called standalone (e.g. hotkey).
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

    const filename = `screen_${Date.now()}.png`;
    const screenshotPath = path.join(SCREENSHOTS_DIR, filename);

    let base64: string;
    try {
      // `screen.grab` and `saveImage` are cast to `any` because nut-js's bundled type
      // definitions diverge from the actual runtime signatures in v4.x — the Image type
      // is not exported in a way that matches the save overload.
      const image = await (screen.grab as any)();
      await (saveImage as any)({ image, path: screenshotPath, type: FileType.PNG });
      // nut-js Image does not expose a raw Buffer, so we read back from disk to obtain
      // the base64 string required by the vision API.
      base64 = fs.readFileSync(screenshotPath).toString("base64");
      _consecutiveCaptureFails = 0;
    } catch (err: unknown) {
      _consecutiveCaptureFails++;
      console.error(
        `[ScreenMonitor] Capture failed (${_consecutiveCaptureFails}/${MAX_CONSECUTIVE_FAILS}):`,
        (err as Error).message
      );
      if (_consecutiveCaptureFails >= MAX_CONSECUTIVE_FAILS) {
        console.error("[ScreenMonitor] Too many consecutive failures — disabling monitor.");
        this.updateConfig({ enabled: 0 });
        this.stopPolling();
        TelegramService.sendMessage(
          "⚠️ Screen Monitor disabled after 5 consecutive capture failures."
        ).catch(() => {});
      }
      return;
    }

    // Rolling window — delete oldest screenshots if over MAX_SCREENSHOTS.
    // Files are named screen_${Date.now()}.png, so lexicographic sort = chronological order.
    try {
      const files = fs.readdirSync(SCREENSHOTS_DIR)
        .filter(f => f.endsWith(".png"))
        .sort();
      while (files.length > MAX_SCREENSHOTS) {
        fs.unlinkSync(path.join(SCREENSHOTS_DIR, files.shift()!));
      }
    } catch { /* disk error — non-fatal */ }

    const relativePath = path.relative(process.cwd(), screenshotPath);
    const results = await this._analyzeScreenshot(relativePath, base64);
    await this._fireDetections(results, relativePath);
  },

  async _analyzeScreenshot(_screenshotPath: string, base64: string): Promise<DetectionResult[]> {
    const provider = Config.ACTIVE_LLM_PROVIDER.toLowerCase() as VisionProvider;
    if (!(VISION_PROVIDERS as readonly string[]).includes(provider)) {
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

    // Honor vision_model_override when set by the user; fall back to the default model.
    const cfg = this.getConfig();
    const model = LLMFactory.getModel({
      temperature: 0,
      ...(cfg.vision_model_override ? { modelName: cfg.vision_model_override } : {})
    });
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
      })().catch(err =>
        console.error(
          `[ScreenMonitor] IIFE outer rejection for detection ${detectionId}:`,
          (err as Error).message
        )
      );
    }
  },
};
