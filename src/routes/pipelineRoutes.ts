import { Router } from "express";
import { randomUUID } from "crypto";
import { PipelineRunner } from "../core/pipelineRunner";
import type { Pipeline } from "../core/pipelineTypes";

const router = Router();

// GET /api/v1/pipelines
router.get("/", (_req, res) => {
  res.json({ success: true, pipelines: PipelineRunner.list() });
});

// POST /api/v1/pipelines  (create or update)
router.post("/", (req, res) => {
  const body = req.body as Partial<Pipeline>;
  if (!body.name) {
    res.status(400).json({ success: false, error: "name is required" });
    return;
  }
  const now = Date.now();
  const pipeline: Pipeline = {
    id: body.id || randomUUID(),
    name: body.name,
    enabled: body.enabled ?? true,
    nodes: body.nodes || [],
    edges: body.edges || [],
    createdAt: body.createdAt || now,
    updatedAt: now,
  };
  PipelineRunner.save(pipeline);
  res.json({ success: true, pipeline });
});

// DELETE /api/v1/pipelines/:id
router.delete("/:id", (req, res) => {
  const deleted = PipelineRunner.delete(req.params.id);
  res.json({ success: deleted, error: deleted ? undefined : "Pipeline not found" });
});

// POST /api/v1/pipelines/:id/toggle
router.post("/:id/toggle", (req, res) => {
  const pipeline = PipelineRunner.toggle(req.params.id);
  if (!pipeline) {
    res.status(404).json({ success: false, error: "Pipeline not found" });
    return;
  }
  res.json({ success: true, pipeline });
});

// GET /api/v1/pipelines/:id/runs
router.get("/:id/runs", (req, res) => {
  res.json({ success: true, runs: PipelineRunner.getRuns(req.params.id) });
});

export { router as pipelineRoutes };
