import { Router } from "express";
import { MCPServerManager, MCPServerConfig } from "../core/mcpServerManager";

const router = Router();

router.get("/library", (_req, res) => {
  res.json({ success: true, servers: MCPServerManager.getLibrary() });
});

router.get("/", async (_req, res) => {
  try {
    res.json({ success: true, servers: await MCPServerManager.getActive() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const config: MCPServerConfig = req.body;
    if (!config.id || !config.command) {
      res.status(400).json({ success: false, error: "id and command are required" });
      return;
    }
    await MCPServerManager.add(config);
    res.json({ success: true, message: `Server "${config.id}" added. Restart to activate.` });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await MCPServerManager.remove(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/:id/logs", (req, res) => {
  res.json({ success: true, logs: MCPServerManager.getLogs(req.params.id) });
});

export { router as mcpServerRoutes };
