import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

const HistoryDrawer = ({ width, onSelectSession, activeSessionId }) => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    fetch('/api/v1/history')
      .then(res => {
        if (!res.ok) throw new Error('unavailable');
        return res.json();
      })
      .then(data => {
        setSessions(data);
        setAvailable(true);
      })
      .catch(() => setAvailable(false))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div
      className="history-drawer glass-panel"
      style={{ width: width ? `${width}px` : '200px' }}
    >
      <div className="history-header">
        <Clock size={14} color="var(--accent-teal)" />
        <span>HISTORY</span>
      </div>
      <div className="history-content custom-scrollbar">
        {loading ? (
          <div className="history-empty">Loading...</div>
        ) : !available || sessions.length === 0 ? (
          <div className="history-empty">
            No history yet.<br />Sessions appear here after completion.
          </div>
        ) : (
          sessions.map(session => (
            <div
              key={session.id}
              className={`history-item${session.id === activeSessionId ? ' history-item-active' : ''}`}
              onClick={() => onSelectSession(session.id)}
            >
              <div className="history-title">{session.title}</div>
              <div className="history-meta">
                {new Date(session.timestamp).toLocaleDateString()} · {session.stepCount} steps
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default HistoryDrawer;
