import { Router } from "express";
import cron from "node-cron";
import { ProactiveScheduler, CreateScheduleInput } from "../core/proactiveScheduler";

export const scheduleRoutes = Router();

// GET / — list all schedules
scheduleRoutes.get("/", (_req, res) => {
  try {
    const schedules = ProactiveScheduler.listSchedules();
    res.json(schedules);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — create a new schedule
scheduleRoutes.post("/", (req, res) => {
  try {
    const { name, trigger_type, trigger_config, intent, enabled } = req.body;

    // Required fields
    if (!name || !trigger_type || !intent) {
      res.status(400).json({ error: "Missing required fields: name, trigger_type, intent" });
      return;
    }

    if (!["cron", "file_watch", "webhook"].includes(trigger_type)) {
      res.status(400).json({ error: `Unknown trigger_type: ${trigger_type}. Must be cron, file_watch, or webhook.` });
      return;
    }

    // Validate/parse trigger_config
    let parsedConfig: Record<string, unknown>;
    if (trigger_config === undefined || trigger_config === null) {
      res.status(400).json({ error: "Missing required field: trigger_config" });
      return;
    }
    if (typeof trigger_config === "string") {
      try {
        parsedConfig = JSON.parse(trigger_config);
      } catch {
        res.status(400).json({ error: "Invalid JSON in trigger_config" });
        return;
      }
    } else if (typeof trigger_config === "object") {
      parsedConfig = trigger_config as Record<string, unknown>;
    } else {
      res.status(400).json({ error: "trigger_config must be an object or JSON string" });
      return;
    }

    // Trigger-type-specific validation
    if (trigger_type === "cron") {
      const expression = parsedConfig["expression"];
      if (typeof expression !== "string" || !cron.validate(expression)) {
        res.status(400).json({ error: `Invalid cron expression: ${expression}` });
        return;
      }
    } else if (trigger_type === "file_watch") {
      if (!parsedConfig["path"]) {
        res.status(400).json({ error: "file_watch trigger_config must include a 'path' field" });
        return;
      }
    } else if (trigger_type === "webhook") {
      const webhookPath = parsedConfig["path"];
      if (typeof webhookPath !== "string" || !webhookPath.startsWith("/")) {
        res.status(400).json({ error: "webhook trigger_config 'path' must start with '/'" });
        return;
      }
      const existingId = ProactiveScheduler.getWebhookScheduleId(webhookPath);
      if (existingId) {
        res.status(409).json({ error: `Webhook path '${webhookPath}' is already registered to schedule ${existingId}` });
        return;
      }
    }

    const input: CreateScheduleInput = {
      name,
      trigger_type,
      trigger_config: parsedConfig,
      intent,
      enabled,
    };

    let schedule;
    try {
      schedule = ProactiveScheduler.createSchedule(input);
    } catch (err: any) {
      if (err.message && err.message.includes("already exists")) {
        res.status(409).json({ error: err.message });
        return;
      }
      throw err;
    }

    // Hot-register trigger if enabled
    if (schedule.enabled === 1) {
      if (trigger_type === "cron") {
        ProactiveScheduler._registerCron(schedule);
      } else if (trigger_type === "file_watch") {
        ProactiveScheduler._registerFileWatch(schedule);
      }
    }

    res.status(201).json(schedule);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /:id — update a schedule
scheduleRoutes.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const existing = ProactiveScheduler.getSchedule(id);
    if (!existing) {
      res.status(404).json({ error: `Schedule ${id} not found` });
      return;
    }

    const updates: Partial<CreateScheduleInput> = {};
    const { name, trigger_type, trigger_config, intent, enabled } = req.body;

    if (name !== undefined) updates.name = name;
    if (intent !== undefined) updates.intent = intent;
    if (enabled !== undefined) updates.enabled = enabled;

    if (trigger_type !== undefined) {
      if (!["cron", "file_watch", "webhook"].includes(trigger_type)) {
        res.status(400).json({ error: `Unknown trigger_type: ${trigger_type}` });
        return;
      }
      updates.trigger_type = trigger_type;
    }

    if (trigger_config !== undefined) {
      let parsedConfig: Record<string, unknown>;
      if (typeof trigger_config === "string") {
        try {
          parsedConfig = JSON.parse(trigger_config);
        } catch {
          res.status(400).json({ error: "Invalid JSON in trigger_config" });
          return;
        }
      } else if (typeof trigger_config === "object" && trigger_config !== null) {
        parsedConfig = trigger_config as Record<string, unknown>;
      } else {
        res.status(400).json({ error: "trigger_config must be an object or JSON string" });
        return;
      }
      updates.trigger_config = parsedConfig;
    }

    let updated;
    try {
      updated = ProactiveScheduler.updateSchedule(id, updates);
    } catch (err: any) {
      if (err.message && err.message.includes("not found")) {
        res.status(404).json({ error: err.message });
        return;
      }
      throw err;
    }

    // Hot-reload: deregister old, re-register if enabled
    ProactiveScheduler._deregisterCron(id);
    ProactiveScheduler._deregisterFileWatch(id);

    if (updated.enabled === 1) {
      if (updated.trigger_type === "cron") {
        ProactiveScheduler._registerCron(updated);
      } else if (updated.trigger_type === "file_watch") {
        ProactiveScheduler._registerFileWatch(updated);
      }
    }

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id — delete a schedule
scheduleRoutes.delete("/:id", async (_req, res) => {
  try {
    const { id } = _req.params;
    const existing = ProactiveScheduler.getSchedule(id);
    if (!existing) {
      res.status(404).json({ error: `Schedule ${id} not found` });
      return;
    }

    // Deregister both trigger types (safe even if not registered)
    ProactiveScheduler._deregisterCron(id);
    ProactiveScheduler._deregisterFileWatch(id);

    ProactiveScheduler.deleteSchedule(id);
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:id/toggle — enable or disable a schedule
scheduleRoutes.post("/:id/toggle", async (req, res) => {
  try {
    const { id } = req.params;
    const schedule = ProactiveScheduler.getSchedule(id);
    if (!schedule) {
      res.status(404).json({ error: `Schedule ${id} not found` });
      return;
    }

    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "Request body must include 'enabled' as a boolean" });
      return;
    }

    ProactiveScheduler.toggleSchedule(id, enabled);

    if (!enabled) {
      // Disabling: deregister triggers
      ProactiveScheduler._deregisterCron(id);
      ProactiveScheduler._deregisterFileWatch(id);
    } else {
      // Enabling: re-register appropriate trigger
      const updated = ProactiveScheduler.getSchedule(id);
      if (updated) {
        if (updated.trigger_type === "cron") {
          ProactiveScheduler._registerCron(updated);
        } else if (updated.trigger_type === "file_watch") {
          ProactiveScheduler._registerFileWatch(updated);
        }
      }
    }

    const updated = ProactiveScheduler.getSchedule(id);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:id/trigger — manually fire a schedule
scheduleRoutes.post("/:id/trigger", async (req, res) => {
  try {
    const { id } = req.params;
    const schedule = ProactiveScheduler.getSchedule(id);
    if (!schedule) {
      res.status(404).json({ error: `Schedule ${id} not found` });
      return;
    }

    await ProactiveScheduler.triggerManually(id);
    res.json({ success: true, message: `Schedule ${id} triggered manually.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id/runs — get run history for a schedule
scheduleRoutes.get("/:id/runs", (req, res) => {
  try {
    const { id } = req.params;
    const schedule = ProactiveScheduler.getSchedule(id);
    if (!schedule) {
      res.status(404).json({ error: `Schedule ${id} not found` });
      return;
    }

    const rawLimit = parseInt(req.query["limit"] as string ?? "20", 10);
    const rawOffset = parseInt(req.query["offset"] as string ?? "0", 10);
    const limit = isNaN(rawLimit) ? 20 : Math.min(rawLimit, 100);
    const offset = isNaN(rawOffset) ? 0 : Math.max(rawOffset, 0);

    const runs = ProactiveScheduler.getRunHistory(id, limit, offset);
    res.json(runs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
