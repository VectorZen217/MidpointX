import { Router, Request, Response } from "express";
import { AgentMemory, MemoryType } from "../core/agentMemory";

export const memoryRoutes = Router();

/**
 * GET /api/v1/memories?offset=0&limit=50
 */
memoryRoutes.get("/", (req: Request, res: Response) => {
  try {
    const offset = parseInt(String(req.query.offset || "0"), 10);
    const limit  = parseInt(String(req.query.limit  || "50"), 10);
    const memories = AgentMemory.list(offset, limit);
    const total = AgentMemory.count();
    res.json({ success: true, memories, total, offset, limit });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/memories/search?q=typescript
 */
memoryRoutes.get("/search", async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || "");
    if (!q) return res.json({ success: true, memories: [] });
    const memories = await AgentMemory.recall(q, 20);
    res.json({ success: true, memories });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/memories
 * Body: { key: string, value: string, type: MemoryType }
 */
memoryRoutes.post("/", async (req: Request, res: Response) => {
  try {
    const { key, value, type } = req.body as { key: string; value: string; type: MemoryType };
    if (!key || !value || !type) {
      return res.status(400).json({ error: "key, value, and type are required" });
    }
    const memory = await AgentMemory.remember(key, value, type, "user");
    res.json({ success: true, memory });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/v1/memories/:id
 */
memoryRoutes.delete("/:id", (req: Request, res: Response) => {
  try {
    AgentMemory.forget(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
