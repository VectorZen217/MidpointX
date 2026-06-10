export type NodeType = 'trigger' | 'condition' | 'action' | 'agent';

export interface PipelineNode {
  id: string;
  type: NodeType;
  label: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
}

export interface PipelineEdge {
  id: string;
  source: string;
  target: string;
}

export interface Pipeline {
  id: string;
  name: string;
  enabled: boolean;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  createdAt: number;
  updatedAt: number;
}

export interface PipelineRun {
  id: string;
  pipelineId: string;
  status: 'success' | 'failure' | 'running';
  startedAt: number;
  finishedAt?: number;
  log: string[];
}
