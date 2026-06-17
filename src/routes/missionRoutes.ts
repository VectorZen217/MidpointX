import { Router, Request, Response } from "express";
import { MissionStore } from "../core/missionStore";

export const missionRoutes = Router();

/**
 * GET /api/v1/missions
 * List all missions (active, paused, completed, failed).
 */
missionRoutes.get("/", (req: Request, res: Response) => {
  try {
    const missions = MissionStore.listAll();
    res.json({ success: true, missions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/missions/:threadId
 * Single mission detail.
 */
missionRoutes.get("/:threadId", (req: Request, res: Response) => {
  try {
    const mission = MissionStore.get(req.params.threadId);
    if (!mission) return res.status(404).json({ error: "Mission not found" });
    res.json({ success: true, mission });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/v1/missions/:threadId
 * Cancel a mission (marks as failed with "Cancelled by user").
 */
missionRoutes.delete("/:threadId", (req: Request, res: Response) => {
  try {
    const mission = MissionStore.get(req.params.threadId);
    if (!mission) return res.status(404).json({ error: "Mission not found" });
    MissionStore.fail(req.params.threadId, "Cancelled by user");
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
