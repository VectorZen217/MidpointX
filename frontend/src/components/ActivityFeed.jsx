import React, { useRef, useState, useEffect } from 'react';
import { Activity, Search } from 'lucide-react';

const TYPE_META = {
  system:     { label: 'SYS',   color: 'var(--accent-teal)',  border: 'var(--accent-teal)'  },
  reflection: { label: 'AGENT', color: 'var(--accent-neon)',  border: 'var(--accent-neon)'  },
  agent:      { label: 'AGENT', color: 'var(--accent-neon)',  border: 'var(--accent-neon)'  },
  error:      { label: 'ERR',   color: 'var(--accent-coral)', border: 'var(--accent-coral)' },
  warn:       { label: 'WARN',  color: 'var(--accent-amber)', border: 'var(--accent-amber)' },
};

function getMeta(type) {
  return TYPE_META[type] || TYPE_META.system;
}

const TraceEntry = ({ item, showAudit }) => {
  const [expanded, setExpanded] = useState(false);
  const meta = getMeta(item.type);
  const text = item.message || '';
  const isLong = text.length > 120;

  return (
    <div className="af-item" style={{ borderLeft: `3px solid ${meta.border}` }}>
      <div className="af-item-meta">
        <span className="af-time">{item.time}</span>
        <span className="af-type" style={{ color: meta.color }} aria-hidden="true">{meta.label}</span>
      </div>
      <pre className="af-message">
        {isLong && !expanded ? text.slice(0, 120) + '…' : text}
      </pre>
      {isLong && (
        <button className="af-expand" onClick={() => setExpanded(e => !e)}>
          {expanded ? 'show less' : 'show more'}
        </button>
      )}
      {showAudit && item.hash && (
        <div className="af-hash">
          <span style={{ color: '#666' }}>SHA-256: </span>
          <span style={{ color: 'var(--accent-teal)', opacity: 0.8 }}>{item.hash}</span>
        </div>
      )}
    </div>
  );
};

const FILTERS = ['all', 'system', 'agent', 'error'];

const ActivityFeed = ({ trace, tokenUsage, width }) => {
  const scrollRef = useRef(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showAudit, setShowAudit] = useState(false);

  useEffect(() => {
    if (scrollRef.current && typeof scrollRef.current.scrollTo === 'function') {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [trace]);

  const filtered = trace.filter(item => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'agent' && (item.type === 'agent' || item.type === 'reflection')) ||
      item.type === filter;
    const matchesSearch = !search || item.message?.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="af-panel glass-panel" style={{ width: width ? `${width}px` : undefined }}>
      <div className="af-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={16} color="var(--accent-teal)" />
          <span>ACTIVITY FEED</span>
        </div>
        <div
          className="audit-toggle"
          onClick={() => setShowAudit(a => !a)}
          style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 10, cursor: 'pointer',
            background: showAudit ? 'rgba(23,113,201,0.2)' : 'rgba(0,0,0,0.2)',
            border: `1px solid ${showAudit ? 'var(--accent-teal)' : 'var(--border-color)'}`,
            color: showAudit ? 'var(--accent-teal)' : '#888',
          }}
        >
          {showAudit ? 'AUDIT: ON' : 'AUDIT: OFF'}
        </div>
      </div>

      <div className="af-controls">
        <div className="af-filters">
          {FILTERS.map(f => (
            <button
              key={f}
              className={`af-chip${filter === f ? ' af-chip-active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'ALL' : f === 'system' ? 'SYS' : f === 'agent' ? 'AGENT' : 'ERR'}
            </button>
          ))}
        </div>
        <div className="af-search-wrap">
          <Search size={11} className="af-search-icon" />
          <input
            className="af-search"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="af-content custom-scrollbar" ref={scrollRef}>
        {filtered.length === 0 ? (
          <div className="af-empty">No entries{filter !== 'all' ? ` for "${filter}"` : ''}.</div>
        ) : (
          filtered.map((item, idx) => (
            <TraceEntry key={idx} item={item} showAudit={showAudit} />
          ))
        )}
      </div>

      <div className="af-token-bar">
        <div className="af-token-item">
          <span className="af-token-label">IN</span>
          <span className="af-token-value" style={{ color: 'var(--accent-teal)' }}>
            {tokenUsage.input.toLocaleString()}
          </span>
        </div>
        <div className="af-token-item">
          <span className="af-token-label">OUT</span>
          <span className="af-token-value" style={{ color: 'var(--accent-neon)' }}>
            {tokenUsage.output.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ActivityFeed;
