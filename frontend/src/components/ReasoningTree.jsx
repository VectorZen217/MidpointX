import React from 'react';
import { Network } from 'lucide-react';

const ReasoningTree = ({ trace, tokenUsage, width }) => {
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [trace]);

  return (
    <div className="reasoning-panel glass-panel" style={{ width: width ? `${width}px` : undefined }}>
      <div className="reasoning-header">
        <Network size={18} className="text-accent-teal" />
        <span>REASONING TRACE</span>
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReasoningTree;
