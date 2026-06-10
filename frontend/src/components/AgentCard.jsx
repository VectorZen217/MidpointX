import React, { useState, useEffect, useRef } from 'react';
import { Search, Code, TestTube, CheckCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

const ROLE_CONFIG = {
  researcher: { label: 'RESEARCHER', icon: Search, color: 'var(--accent-teal)' },
  developer:  { label: 'DEVELOPER',  icon: Code,       color: 'var(--accent-neon)' },
  tester:     { label: 'TESTER',     icon: TestTube,   color: '#FFC107' },
};

const AgentCard = ({ agent }) => {
  const [logsOpen, setLogsOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef(null);

  const config = ROLE_CONFIG[agent.role] || ROLE_CONFIG.researcher;
  const Icon = config.icon;

  useEffect(() => {
    if (agent.status === 'active') {
      intervalRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [agent.status]);

  const progressPct = agent.status === 'complete' ? 100 : agent.status === 'error' ? 100 : 40;
  const progressColor = agent.status === 'complete' ? 'var(--accent-neon)' : agent.status === 'error' ? '#FF4757' : '#FFC107';

  return (
    <div className={`agent-card ${agent.status}`}>
      <div className="agent-card-header">
        <div className="agent-role-badge" style={{ color: config.color, borderColor: config.color }}>
          <Icon size={12} />
          <span>{config.label}</span>
        </div>
        {agent.status === 'complete' && <CheckCircle size={14} style={{ color: 'var(--accent-neon)' }} />}
        {agent.status === 'error'    && <AlertCircle size={14} style={{ color: '#FF4757' }} />}
      </div>

      <div className="agent-task-text">
        {(agent.task || '').substring(0, 60)}{(agent.task || '').length > 60 ? '…' : ''}
      </div>

      <div className="agent-progress-bar">
        <div
          className={`agent-progress-fill ${agent.status === 'active' ? 'shimmer' : ''}`}
          style={{ width: `${progressPct}%`, background: progressColor }}
        />
      </div>

      <div className="agent-card-meta">
        <span>{agent.tokensUsed.toLocaleString()} tok</span>
        {agent.status === 'active' && <span>{elapsed}s</span>}
        {agent.status === 'complete' && <span>Done</span>}
        {agent.messages.length > 0 && (
          <button className="agent-logs-toggle" onClick={() => setLogsOpen(o => !o)}>
            {logsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {agent.messages.length} msg{agent.messages.length !== 1 ? 's' : ''}
          </button>
        )}
      </div>

      {logsOpen && (
        <div className="agent-message-log">
          {agent.messages.map((msg, i) => (
            <div key={i} className="agent-log-entry">
              <span className="agent-log-step">{msg.step}</span>
              <span className="agent-log-text">{msg.message.substring(0, 80)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AgentCard;
