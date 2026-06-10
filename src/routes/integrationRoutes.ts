import { Router } from "express";
import { IntegrationBus } from "../core/integrationBus";

const router = Router();

// GET /api/v1/integrations/status
router.get("/status", async (_req, res) => {
  try {
    const health = await IntegrationBus.healthCheckAll();
    const connectors = IntegrationBus.list().map((c) => ({
      id: c.id,
      healthy: health[c.id] ?? false,
    }));
    res.json({ success: true, connectors });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/integrations/:id/test
router.post("/:id/test", async (req, res) => {
  const { id } = req.params;
  const connector = IntegrationBus.get(id);
  if (!connector) {
    res.status(404).json({ success: false, error: `Connector not found: ${id}` });
    return;
  }
  try {
    await connector.send("test", `MidpointX test ping from connector ${id}`, {});
    res.json({ success: true, message: `Test message sent via ${id}` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export { router as integrationRoutes };
