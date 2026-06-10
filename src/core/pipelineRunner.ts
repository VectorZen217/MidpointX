import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { Pipeline, PipelineRun } from "./pipelineTypes";

const PIPELINES_DIR = path.resolve(__dirname, "../../src/workspace/pipelines");

const pipelines = new Map<string, Pipeline>();
const runHistory = new Map<string, PipelineRun[]>();

function ensureDir(): void {
  if (!fs.existsSync(PIPELINES_DIR)) fs.mkdirSync(PIPELINES_DIR, { recursive: true });
}

export const PipelineRunner = {
  load(): void {
    ensureDir();
    const files = fs.readdirSync(PIPELINES_DIR).filter(f => f.endsWith(".json"));
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(PIPELINES_DIR, file), "utf-8");
        const pipeline: Pipeline = JSON.parse(raw);
        pipelines.set(pipeline.id, pipeline);
      } catch (err) {
        console.warn(`[PipelineRunner] Failed to load ${file}:`, err);
      }
    }
    console.log(`[PipelineRunner] Loaded ${pipelines.size} pipeline(s)`);
  },

  save(pipeline: Pipeline): void {
    ensureDir();
    pipelines.set(pipeline.id, pipeline);
    const filePath = path.join(PIPELINES_DIR, `${pipeline.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(pipeline, null, 2), "utf-8");
  },

  delete(id: string): boolean {
    const filePath = path.join(PIPELINES_DIR, `${id}.json`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return pipelines.delete(id);
  },

  list(): Pipeline[] {
    return Array.from(pipelines.values());
  },

  get(id: string): Pipeline | undefined {
    return pipelines.get(id);
  },

  toggle(id: string): Pipeline | undefined {
    const pipeline = pipelines.get(id);
    if (!pipeline) return undefined;
    pipeline.enabled = !pipeline.enabled;
    pipeline.updatedAt = Date.now();
    PipelineRunner.save(pipeline);
    return pipeline;
  },

  async run(pipelineId: string, triggerPayload?: Record<string, unknown>): Promise<PipelineRun> {
    const pipeline = pipelines.get(pipelineId);
    const run: PipelineRun = {
      id: randomUUID(),
      pipelineId,
      status: "running",
      startedAt: Date.now(),
      log: [],
    };

    if (!pipeline) {
      run.status = "failure";
      run.finishedAt = Date.now();
      run.log.push(`Pipeline not found: ${pipelineId}`);
      return run;
    }

    if (!pipeline.enabled) {
      run.status = "failure";
      run.finishedAt = Date.now();
      run.log.push("Pipeline is disabled");
      return run;
    }

    try {
      run.log.push(`Starting pipeline: ${pipeline.name}`);
      const nodeMap = new Map(pipeline.nodes.map(n => [n.id, n]));

      // Find trigger nodes (entry points)
      const triggerNodes = pipeline.nodes.filter(n => n.type === "trigger");
      if (triggerNodes.length === 0) {
        throw new Error("Pipeline has no trigger node");
      }

      // Walk edges from each trigger node
      const visited = new Set<string>();
      const queue: string[] = triggerNodes.map(n => n.id);

      while (queue.length > 0) {
        const nodeId = queue.shift()!;
        if (visited.has(nodeId)) continue;
        visited.add(nodeId);

        const node = nodeMap.get(nodeId);
        if (!node) continue;

        run.log.push(`Executing node [${node.type}] ${node.label}`);

        if (node.type === "condition") {
          // Condition nodes log their config and continue — full evaluation in future
          run.log.push(`  Condition: ${JSON.stringify(node.config)}`);
        } else if (node.type === "action") {
          run.log.push(`  Action: ${node.config.actionType || "generic"} — ${JSON.stringify(node.config)}`);
        } else if (node.type === "agent") {
          run.log.push(`  Agent prompt: ${String(node.config.prompt || "").substring(0, 80)}`);
        }

        // Enqueue downstream nodes
        const outgoing = pipeline.edges.filter(e => e.source === nodeId);
        for (const edge of outgoing) queue.push(edge.target);
      }

      run.status = "success";
    } catch (err: any) {
      run.status = "failure";
      run.log.push(`Error: ${err.message}`);
    }

    run.finishedAt = Date.now();

    // Store run history (keep last 50 per pipeline)
    const history = runHistory.get(pipelineId) ?? [];
    history.unshift(run);
    if (history.length > 50) history.splice(50);
    runHistory.set(pipelineId, history);

    return run;
  },

  getRuns(pipelineId: string): PipelineRun[] {
    return runHistory.get(pipelineId) ?? [];
  },
};
