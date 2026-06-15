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
      enabled?: 0 | 1;
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
    const status = err.message.includes("built-in") ? 403
      : err.message.includes("not found") ? 404
      : 500;
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
  const limit = parseInt(String(req.query.limit ?? "50"), 10);
  const offset = parseInt(String(req.query.offset ?? "0"), 10);
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
