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
