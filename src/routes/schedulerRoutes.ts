import { Router } from "express";
import { globalSchedulerRegistry } from "../core/schedulerRegistry";
import { PluginRegistry } from "../core/pluginRegistry";

export const schedulerRoutes = Router();

schedulerRoutes.get("/", async (req, res) => {
  try {
    res.json(await globalSchedulerRegistry.listAll());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

schedulerRoutes.post("/toggle", async (req, res) => {
  try {
    const { slug, enabled } = req.body;
    await globalSchedulerRegistry.toggle(slug, enabled);
    await PluginRegistry.reloadMDSkills();
    res.json({ success: true });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});
