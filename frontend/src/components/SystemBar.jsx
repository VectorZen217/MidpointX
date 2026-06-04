import React from 'react';

const COST_RATES = {
  anthropic:  { input: 3.0,   output: 15.0  },
  google:     { input: 0.075, output: 0.30  },
  openai:     { input: 2.5,   output: 10.0  },
  openrouter: { input: 1.0,   output: 1.0   },
  nvidia:     { input: 0.2,   output: 0.2   },
  local:      { input: 0,     output: 0     },
};

const NODE_LABELS = {
  idle: 'IDLE', reflection: 'REFLECTION',
  analysis: 'ANALYSIS', action: 'ACTION', compaction: 'COMPACTION',
};

function estimateCost(tokenUsage, provider) {
  const rates = COST_RATES[provider?.toLowerCase()] ?? COST_RATES.local;
  const cost = (tokenUsage.input / 1_000_000) * rates.input
             + (tokenUsage.output / 1_000_000) * rates.output;
  return cost.toFixed(4);
}

const SystemBar = ({ activeNode, tokenUsage, systemInfo, isRunning, socketConnected }) => {
  const provider = systemInfo?.provider?.toLowerCase() || 'local';
  const cost = estimateCost(tokenUsage, provider);
  const nodeLabel = NODE_LABELS[activeNode] || 'IDLE';

  return (
    <div className="system-bar">
      <span className="sb-brand">
        <span className="sb-brand-mid">Midpoint</span>
        <span className="sb-brand-x">X</span>
      </span>

      <div className={`sb-pill ${isRunning ? 'sb-pill-green' : 'sb-pill-muted'}`}>
        <span className={`sb-dot ${isRunning ? 'dot-green' : 'dot-muted'}`} />
        {isRunning ? 'RUNNING' : 'IDLE'}
      </div>

      {isRunning && (
        <div className="sb-pill sb-pill-blue">
          <span className="sb-dot dot-blue" />
          {nodeLabel}
        </div>
      )}

      <div className="sb-pill sb-pill-muted">
        IN&nbsp;<span className="sb-value sb-val-blue">{tokenUsage.input.toLocaleString()}</span>
      </div>
      <div className="sb-pill sb-pill-muted">
        OUT&nbsp;<span className="sb-value sb-val-green">{tokenUsage.output.toLocaleString()}</span>
      </div>
      <div className="sb-pill sb-pill-muted">
        ~<span className="sb-value sb-val-amber">${cost}</span>
      </div>

      <div className="sb-spacer" />

      <div className={`sb-pill ${socketConnected ? 'sb-pill-green-dim' : 'sb-pill-error'}`}>
        <span className={`sb-dot ${socketConnected ? 'dot-green' : 'dot-red'}`} />
        {socketConnected ? 'SOCKET OK' : 'DISCONNECTED'}
      </div>
      <div className="sb-pill sb-pill-muted">{systemInfo?.model || '—'}</div>
      <div className="sb-pill sb-pill-muted">
        {systemInfo?.persistence === 'firestore' ? 'CLOUD' : 'LOCAL'}
      </div>
    </div>
  );
};

export default SystemBar;
