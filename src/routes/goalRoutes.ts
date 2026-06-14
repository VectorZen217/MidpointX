import { Router, Request, Response } from "express";
import { GoalTracker } from "../core/goalTracker";

export const goalRoutes = Router();

/**
 * GET /api/v1/goals?offset=0&limit=20
 * List all goals, paginated, newest first
 */
goalRoutes.get("/", (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;
    const goals = GoalTracker.listGoals(limit, offset);
    res.json({ success: true, goals, limit, offset });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/goals/active
 * Current in-progress goal with full task list
 */
goalRoutes.get("/active", (req: Request, res: Response) => {
  try {
    const detail = GoalTracker.getFirstActiveGoal();
    res.json(detail);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/goals/:id
 * Full goal detail — goal row + all tasks
 */
goalRoutes.get("/:id", (req: Request, res: Response) => {
  try {
    const detail = GoalTracker.getGoal(req.params.id);
    if (!detail) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }
    res.json(detail);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/v1/goals/:id
 * Abandon a goal
 */
goalRoutes.delete("/:id", (req: Request, res: Response) => {
  try {
    const detail = GoalTracker.getGoal(req.params.id);
    if (!detail) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }
    GoalTracker.abandonGoal(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
