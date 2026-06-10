import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Plus, Play, Save, Pause, Workflow } from 'lucide-react';
import NodePalette from './NodePalette';
import NodeConfigPanel from './NodeConfigPanel';

const TYPE_COLORS = {
  trigger:   'var(--accent-teal)',
  condition: '#FFC107',
  action:    'var(--accent-neon)',
  agent:     '#a855f7',
};

function PipelineCanvas({ pipeline, setPipeline }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const reactFlowWrapper = useRef(null);
  const { screenToFlowPosition } = useReactFlow();

  useEffect(() => {
    if (pipeline) {
      setNodes(
        (pipeline.nodes || []).map(n => ({
          id: n.id,
          type: 'default',
          position: n.position,
          data: { label: n.label, subtype: n.config?.subtype, config: n.config, nodeType: n.type },
          style: {
            background: 'var(--bg-secondary)',
            border: `2px solid ${TYPE_COLORS[n.type] || 'var(--border-color)'}`,
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12,
            color: 'var(--text-primary)',
            minWidth: 120,
          },
        }))
      );
      setEdges(
        (pipeline.edges || []).map(e => ({
          id: e.id,
          source: e.source,
          target: e.target,
          style: { stroke: 'var(--border-color)' },
        }))
      );
    }
  }, [pipeline?.id]);

  const onConnect = useCallback(
    (params) => setEdges(eds => addEdge({ ...params, style: { stroke: 'var(--border-color)' } }, eds)),
    [setEdges]
  );

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData('application/reactflow');
      if (!raw) return;
      const { type, subtype, label } = JSON.parse(raw);
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const id = `${type}-${Date.now()}`;
      const color = TYPE_COLORS[type] || 'var(--border-color)';
      setNodes(nds => nds.concat({
        id,
        type: 'default',
        position,
        data: { label, subtype, config: { subtype }, nodeType: type },
        style: {
          background: 'var(--bg-secondary)',
          border: `2px solid ${color}`,
          borderRadius: 8,
          padding: '8px 12px',
          fontSize: 12,
          color: 'var(--text-primary)',
          minWidth: 120,
        },
      }));
    },
    [screenToFlowPosition, setNodes]
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onNodeClick = useCallback((_evt, node) => setSelectedNode(node), []);

  const handleNodeConfigChange = (updatedNode) => {
    setNodes(nds => nds.map(n => n.id === updatedNode.id ? updatedNode : n));
    setSelectedNode(updatedNode);
  };

  const getCanvasPipeline = () => ({
    nodes: nodes.map(n => ({
      id: n.id,
      type: n.data.nodeType || 'action',
      label: n.data.label,
      config: n.data.config || {},
      position: n.position,
    })),
    edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
  });

  // Expose canvas state to parent via ref
  React.useImperativeHandle(pipeline?._ref, () => ({ getCanvasPipeline }));

  return (
    <div style={{ flex: 1, display: 'flex', position: 'relative' }}>
      <NodePalette />
      <div ref={reactFlowWrapper} style={{ flex: 1, height: '100%' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeClick={onNodeClick}
          fitView
        >
          <Background color="rgba(255,255,255,0.03)" gap={20} />
          <Controls style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }} />
          <MiniMap style={{ background: 'var(--bg-secondary)' }} nodeColor={(n) => TYPE_COLORS[n.data?.nodeType] || '#444'} />
        </ReactFlow>
      </div>
      {selectedNode && (
        <NodeConfigPanel
          node={selectedNode}
          onChange={handleNodeConfigChange}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}

const canvasRef = React.createRef();

export default function PipelineView() {
  const [pipelines, setPipelines] = useState([]);
  const [activePipeline, setActivePipeline] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPipelines();
  }, []);

  const fetchPipelines = async () => {
    try {
      const res = await fetch('/api/v1/pipelines');
      const data = await res.json();
      if (data.success) setPipelines(data.pipelines);
    } catch { /* server offline */ }
  };

  const handleNew = () => {
    setActivePipeline({
      id: null,
      name: `Pipeline ${Date.now()}`,
      enabled: true,
      nodes: [],
      edges: [],
      _ref: canvasRef,
    });
  };

  const handleSave = async () => {
    if (!activePipeline) return;
    setSaving(true);
    try {
      const canvas = canvasRef.current?.getCanvasPipeline?.() || { nodes: [], edges: [] };
      const body = {
        id: activePipeline.id || undefined,
        name: activePipeline.name,
        enabled: activePipeline.enabled,
        nodes: canvas.nodes,
        edges: canvas.edges,
      };
      const res = await fetch('/api/v1/pipelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setActivePipeline({ ...data.pipeline, _ref: canvasRef });
        fetchPipelines();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id) => {
    await fetch(`/api/v1/pipelines/${id}/toggle`, { method: 'POST' });
    fetchPipelines();
  };

  const handleDelete = async (id) => {
    await fetch(`/api/v1/pipelines/${id}`, { method: 'DELETE' });
    if (activePipeline?.id === id) setActivePipeline(null);
    fetchPipelines();
  };

  return (
    <div className="pipeline-view">
      <div className="pipeline-toolbar">
        <Workflow size={14} style={{ color: 'var(--accent-neon)' }} />
        <span className="pipeline-toolbar-title">WORKFLOW BUILDER</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="pipeline-btn" onClick={handleNew}><Plus size={12} /> New</button>
          <button className="pipeline-btn pipeline-btn-primary" onClick={handleSave} disabled={!activePipeline || saving}>
            <Save size={12} /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="pipeline-canvas-area">
        {activePipeline ? (
          <ReactFlowProvider>
            <PipelineCanvas pipeline={activePipeline} setPipeline={setActivePipeline} />
          </ReactFlowProvider>
        ) : (
          <div className="pipeline-empty">
            <Workflow size={40} style={{ opacity: 0.2 }} />
            <p>No pipeline selected.</p>
            <p style={{ fontSize: 11, opacity: 0.4 }}>Click <strong>New</strong> to create a workflow, or select one below.</p>
          </div>
        )}
      </div>

      <div className="pipeline-list-strip">
        {pipelines.length === 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '0 16px' }}>No pipelines yet.</span>
        )}
        {pipelines.map(p => (
          <div key={p.id} className={`pipeline-strip-item ${activePipeline?.id === p.id ? 'active' : ''}`}
            onClick={() => setActivePipeline({ ...p, _ref: canvasRef })}>
            <span className={`pipeline-status-dot ${p.enabled ? 'enabled' : ''}`} />
            <span className="pipeline-strip-name">{p.name}</span>
            <button className="pipeline-strip-btn" onClick={(e) => { e.stopPropagation(); handleToggle(p.id); }}>
              {p.enabled ? <Pause size={10} /> : <Play size={10} />}
            </button>
            <button className="pipeline-strip-btn danger" onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}
