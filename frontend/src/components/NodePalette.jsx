import React from 'react';
import { Clock, GitBranch, Zap, Bot } from 'lucide-react';

const NODE_TYPES = [
  {
    category: 'TRIGGERS',
    nodes: [
      { type: 'trigger', subtype: 'schedule',    label: 'Schedule',      icon: Clock,      description: 'Run on a cron schedule' },
      { type: 'trigger', subtype: 'webhook',     label: 'Webhook',       icon: Zap,        description: 'Triggered by HTTP POST' },
    ],
  },
  {
    category: 'CONDITIONS',
    nodes: [
      { type: 'condition', subtype: 'contains',  label: 'Contains Text', icon: GitBranch,  description: 'Branch if text matches' },
      { type: 'condition', subtype: 'timeofday', label: 'Time of Day',   icon: Clock,      description: 'Branch by hour range' },
    ],
  },
  {
    category: 'ACTIONS',
    nodes: [
      { type: 'action', subtype: 'slack_send',   label: 'Send Slack',    icon: Zap,        description: 'Post to a Slack channel' },
      { type: 'action', subtype: 'github_issue', label: 'GitHub Issue',  icon: GitBranch,  description: 'Create a GitHub issue' },
      { type: 'action', subtype: 'shell',        label: 'Run Command',   icon: Zap,        description: 'Execute sandboxed shell command' },
    ],
  },
  {
    category: 'AGENT',
    nodes: [
      { type: 'agent',  subtype: 'invoke',       label: 'Invoke Agent',  icon: Bot,        description: 'Run MidpointX cognitive loop' },
    ],
  },
];

const TYPE_COLORS = {
  trigger:   'var(--accent-teal)',
  condition: '#FFC107',
  action:    'var(--accent-neon)',
  agent:     '#a855f7',
};

const NodePalette = ({ onDragStart }) => {
  return (
    <div className="node-palette">
      <div className="node-palette-header">NODE PALETTE</div>
      {NODE_TYPES.map(({ category, nodes }) => (
        <div key={category} className="node-palette-section">
          <div className="node-palette-category">{category}</div>
          {nodes.map((node) => {
            const Icon = node.icon;
            const color = TYPE_COLORS[node.type];
            return (
              <div
                key={`${node.type}-${node.subtype}`}
                className="palette-node"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/reactflow', JSON.stringify({ type: node.type, subtype: node.subtype, label: node.label }));
                  e.dataTransfer.effectAllowed = 'move';
                  onDragStart?.(node);
                }}
                style={{ borderColor: color }}
              >
                <Icon size={12} style={{ color, flexShrink: 0 }} />
                <div className="palette-node-text">
                  <span className="palette-node-label">{node.label}</span>
                  <span className="palette-node-desc">{node.description}</span>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default NodePalette;
