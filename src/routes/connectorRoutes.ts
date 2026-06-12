import { Router } from "express";
import { ConnectorRegistry } from "../core/connectorRegistry";

const router = Router();

router.get("/library", (_req, res) => {
  const connectors = ConnectorRegistry.getLibrary().map(c => ({
    id: c.id, name: c.name, category: c.category,
    authType: c.authType, configFields: c.configFields
  }));
  res.json({ success: true, connectors });
});

router.get("/active", (_req, res) => {
  res.json({ success: true, connectors: ConnectorRegistry.getActive() });
});

router.post("/:id/enable", async (req, res) => {
  try {
    await ConnectorRegistry.enable(req.params.id, req.body.credentials ?? {});
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post("/:id/disable", async (req, res) => {
  try {
    await ConnectorRegistry.disable(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await ConnectorRegistry.remove(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/:id/health", async (req, res) => {
  try {
    const status = await ConnectorRegistry.forceHealthCheck(req.params.id);
    res.json({ success: true, status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export { router as connectorRoutes };
