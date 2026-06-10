import React from 'react';
import { X } from 'lucide-react';

const FIELD_DEFS = {
  'trigger-schedule':   [{ key: 'cron',    label: 'Cron Expression', placeholder: '0 9 * * 1-5' }],
  'trigger-webhook':    [{ key: 'path',    label: 'Webhook Path',    placeholder: '/webhook/my-trigger' }],
  'condition-contains': [{ key: 'text',    label: 'Contains Text',   placeholder: 'error' }],
  'condition-timeofday':[{ key: 'from',    label: 'From Hour (0-23)',placeholder: '9' },
                         { key: 'to',      label: 'To Hour (0-23)',  placeholder: '17' }],
  'action-slack_send':  [{ key: 'channel', label: 'Slack Channel',   placeholder: '#general' },
                         { key: 'message', label: 'Message',         placeholder: 'Pipeline triggered!' }],
  'action-github_issue':[{ key: 'repo',    label: 'Repo (owner/name)',placeholder: 'owner/repo' },
                         { key: 'title',   label: 'Issue Title',     placeholder: 'Automated issue' }],
  'action-shell':       [{ key: 'command', label: 'Shell Command',   placeholder: 'echo hello' }],
  'agent-invoke':       [{ key: 'prompt',  label: 'Agent Prompt',    placeholder: 'Summarize the latest logs', multiline: true }],
};

const NodeConfigPanel = ({ node, onChange, onClose }) => {
  if (!node) return null;

  const key = `${node.type}-${node.data?.subtype || ''}`;
  const fields = FIELD_DEFS[key] || [];

  const handleChange = (fieldKey, value) => {
    onChange?.({ ...node, data: { ...node.data, config: { ...(node.data?.config || {}), [fieldKey]: value } } });
  };

  return (
    <div className="node-config-panel">
      <div className="node-config-header">
        <span>{node.data?.label || node.type}</span>
        <button onClick={onClose} className="node-config-close"><X size={14} /></button>
      </div>
      {fields.length === 0 && (
        <div className="node-config-empty">No configuration needed for this node type.</div>
      )}
      {fields.map((field) => (
        <div key={field.key} className="node-config-field">
          <label className="node-config-label">{field.label}</label>
          {field.multiline ? (
            <textarea
              className="node-config-input"
              rows={3}
              placeholder={field.placeholder}
              value={node.data?.config?.[field.key] || ''}
              onChange={(e) => handleChange(field.key, e.target.value)}
            />
          ) : (
            <input
              type="text"
              className="node-config-input"
              placeholder={field.placeholder}
              value={node.data?.config?.[field.key] || ''}
              onChange={(e) => handleChange(field.key, e.target.value)}
            />
          )}
        </div>
      ))}
    </div>
  );
};

export default NodeConfigPanel;
