import React from 'react';
import { Activity, ArrowRight } from 'lucide-react';
import AgentCard from './AgentCard';

const SwarmView = ({ agents, messages }) => {
  const agentList = Object.values(agents);

  return (
    <div className="swarm-view">
      <div className="swarm-header">
        <Activity size={16} style={{ color: 'var(--accent-teal)' }} />
        <span>SWARM COORDINATION</span>
        <span className="swarm-agent-count">{agentList.length} agent{agentList.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="swarm-body">
        <div className="swarm-agents-panel">
          {agentList.length === 0 ? (
            <div className="swarm-empty">
              <Activity size={32} style={{ opacity: 0.3 }} />
              <p>No swarm agents active.</p>
              <p style={{ fontSize: '11px', opacity: 0.5 }}>Agents appear here when a multi-step task spawns workers.</p>
            </div>
          ) : (
            agentList.map(agent => (
              <AgentCard key={agent.agentId} agent={agent} />
            ))
          )}
        </div>

        <div className="swarm-divider" />

        <div className="swarm-messages-panel">
          <div className="swarm-messages-header">
            <ArrowRight size={12} />
            <span>INTER-AGENT MESSAGES</span>
          </div>
          <div className="swarm-messages-list">
            {messages.length === 0 ? (
              <div className="swarm-empty" style={{ padding: '16px' }}>
                <p style={{ fontSize: '11px', opacity: 0.5 }}>Agent handoffs appear here.</p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`swarm-message swarm-message-${msg.fromRole}`}>
                  <span className="swarm-message-from">{msg.fromId.split('-')[0].toUpperCase()}</span>
                  <ArrowRight size={10} style={{ opacity: 0.5 }} />
                  <span className="swarm-message-to">{msg.toId.split('-')[0].toUpperCase()}</span>
                  <span className="swarm-message-text">
                    {msg.content.substring(0, 100)}{msg.content.length > 100 ? '…' : ''}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SwarmView;
