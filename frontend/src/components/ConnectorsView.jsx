import React, { useState, useEffect, useCallback } from 'react';
import { Plug, CheckCircle, AlertTriangle, XCircle, Plus, Trash2, RefreshCw } from 'lucide-react';

const CATEGORY_ICONS = {
  calendar: '📅', email: '📧', finance: '📈',
  tasks: '✅', communication: '💬', weather: '🌤'
};

const AUTH_LABELS = {
  oauth2: 'OAuth2 — Setup in Phase 2',
  apikey: 'API Key',
  basic: 'Username/Password',
  none: 'No Auth Required'
};

const StatusBadge = ({ status }) => {
  const config = {
    healthy:      { icon: CheckCircle,   color: 'var(--accent-teal)',  label: 'healthy' },
    degraded:     { icon: AlertTriangle, color: '#f59e0b',             label: 'degraded' },
    failed:       { icon: XCircle,       color: '#ef4444',             label: 'failed' },
    disconnected: { icon: XCircle,       color: 'var(--text-muted)',   label: 'disconnected' }
  }[status] ?? { icon: XCircle, color: 'var(--text-muted)', label: status };
  const Icon = config.icon;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: config.color, fontSize: 12 }}>
      <Icon size={12} /> {config.label}
    </span>
  );
};

const ConnectorForm = ({ connector, onSubmit, onCancel }) => {
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/connectors/${connector.id}/enable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials: values })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      onSubmit();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (connector.authType === 'oauth2') {
    return (
      <div style={{ marginTop: 12, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          OAuth2 connectors will be available in Phase 2. The redirect URI handler is not yet implemented.
        </p>
        <button className="btn-secondary" onClick={onCancel} style={{ marginTop: 8 }}>Close</button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 12, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
      {connector.authType === 'none' ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>No credentials required.</p>
      ) : (
        connector.configFields.map(field => (
          <div key={field.key} style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{field.label}</label>
            <input
              type={field.type === 'password' ? 'password' : 'text'}
              placeholder={field.placeholder ?? ''}
              value={values[field.key] ?? ''}
              onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: 4, padding: '6px 10px', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
        ))
      )}
      {error && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn-primary" disabled={loading} style={{ fontSize: 12 }}>
          {loading ? 'Connecting...' : 'Enable'}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel} style={{ fontSize: 12 }}>Cancel</button>
      </div>
    </form>
  );
};

const ConnectorsView = () => {
  const [tab, setTab] = useState('library');
  const [library, setLibrary] = useState([]);
  const [active, setActive] = useState([]);
  const [adding, setAdding] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [libRes, activeRes] = await Promise.all([
        fetch('/api/v1/connectors/library').then(r => r.json()),
        fetch('/api/v1/connectors/active').then(r => r.json())
      ]);
      if (libRes.success) setLibrary(libRes.connectors);
      if (activeRes.success) setActive(activeRes.connectors);
    } catch (e) {
      console.error('ConnectorsView fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleEnable = async () => {
    setAdding(null);
    await fetchData();
  };

  const handleRemove = async (id) => {
    await fetch(`/api/v1/connectors/${id}`, { method: 'DELETE' });
    await fetchData();
  };

  const handleHealthCheck = async (id) => {
    await fetch(`/api/v1/connectors/${id}/health`);
    await fetchData();
  };

  const activeIds = new Set(active.map(c => c.id));

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Plug size={24} color="var(--accent-teal)" />
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Connectors</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>Connect MidpointX to your daily services</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['library', 'active'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={tab === t ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: 12, textTransform: 'capitalize' }}>
            {t === 'active' ? `Active (${active.length})` : 'Browse Library'}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading...</p>}

      {!loading && tab === 'library' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {library.map(c => (
            <div key={c.id} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <span style={{ fontSize: 20, marginRight: 8 }}>{CATEGORY_ICONS[c.category] ?? '🔌'}</span>
                  <strong style={{ fontSize: 14 }}>{c.name}</strong>
                </div>
                <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  {c.category}
                </span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 12px' }}>{AUTH_LABELS[c.authType]}</p>
              {activeIds.has(c.id) ? (
                <StatusBadge status={active.find(a => a.id === c.id)?.status ?? 'healthy'} />
              ) : (
                <>
                  <button className="btn-primary" style={{ fontSize: 11 }} onClick={() => setAdding(adding === c.id ? null : c.id)}>
                    <Plus size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Add
                  </button>
                  {adding === c.id && (
                    <ConnectorForm connector={c} onSubmit={handleEnable} onCancel={() => setAdding(null)} />
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && tab === 'active' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, alignItems: 'start' }}>
          {active.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No connectors active. Browse the library to add one.</p>
          )}
          {active.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>{CATEGORY_ICONS[c.category] ?? '🔌'}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</div>
                  <StatusBadge status={c.status} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-icon-small" onClick={() => handleHealthCheck(c.id)} title="Health Check">
                  <RefreshCw size={14} />
                </button>
                <button className="btn-icon-small" onClick={() => handleRemove(c.id)} title="Remove" style={{ color: '#ef4444' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </div>
  );
};

export default ConnectorsView;
