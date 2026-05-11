import React from 'react';
import { Network } from 'lucide-react';

const ReasoningTree = ({ trace, tokenUsage, width }) => {
  const scrollRef = React.useRef(null);
  const [showAudit, setShowAudit] = React.useState(false);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [trace]);

  return (
    <div className="reasoning-panel glass-panel" style={{ width: width ? `${width}px` : undefined }}>
      <div className="reasoning-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Network size={18} className="text-accent-teal" />
          <span>REASONING TRACE</span>
        </div>
        <div 
          className="audit-toggle"
          onClick={() => setShowAudit(!showAudit)}
          title="Toggle Cryptographic Audit Ledger"
          style={{ 
            fontSize: '10px', 
            padding: '2px 8px', 
            borderRadius: '10px', 
            background: showAudit ? 'rgba(23,113,201,0.2)' : 'rgba(0,0,0,0.2)',
            border: `1px solid ${showAudit ? 'var(--accent-teal)' : 'var(--border-color)'}`,
            cursor: 'pointer',
            color: showAudit ? 'var(--accent-teal)' : '#888'
          }}
        >
          {showAudit ? 'AUDIT: ON' : 'AUDIT: OFF'}
        </div>
      </div>
      <div className="reasoning-content custom-scrollbar" ref={scrollRef}>
        {trace.length === 0 ? (
          <div className="tree-overlay-text">
            No active reasoning trace detected.
          </div>
        ) : (
          <div className="trace-list">
            {trace.map((item, idx) => (
              <div key={idx} className={`trace-item ${item.type}`}>
                <div className="trace-meta">
                  <span className="trace-time">{item.time}</span>
                  <span className="trace-type">{item.type.toUpperCase()}</span>
                </div>
                <pre className="trace-message">{item.message}</pre>
                {showAudit && item.hash && (
                  <div className="audit-hash-display">
                    <span style={{ color: '#666', marginRight: '5px' }}>SHA-256:</span>
                    <span style={{ color: 'var(--accent-teal)', opacity: 0.8 }}>{item.hash}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReasoningTree;
