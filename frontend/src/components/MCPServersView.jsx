import React, { useState, useEffect, useCallback } from 'react';
import { Server, Plus, Trash2, Terminal } from 'lucide-react';

const MCPServersView = () => {
  const [tab, setTab] = useState('library');
  const [library, setLibrary] = useState([]);
  const [active, setActive] = useState([]);
  const [adding, setAdding] = useState(null);
  const [addCustomOpen, setAddCustomOpen] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState({});
  const [logs, setLogs] = useState({});
  const [loading, setLoading] = useState(true);
  const [customForm, setCustomForm] = useState({ id: '', name: '', command: 'npx', args: '', env: '' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [libRes, activeRes] = await Promise.all([
        fetch('/api/v1/mcp-servers/library').then(r => r.json()),
        fetch('/api/v1/mcp-servers').then(r => r.json())
      ]);
      if (libRes.success) setLibrary(libRes.servers);
      if (activeRes.success) setActive(activeRes.servers);
    } catch (e) {
      console.error('MCPServersView fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAddFromLibrary = async (server, envValues) => {
    const env = {};
    (server.configFields ?? []).forEach(f => { if (envValues[f.key]) env[f.key] = envValues[f.key]; });
    const res = await fetch('/api/v1/mcp-servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: server.id, name: server.name, command: server.command,
        args: server.args, env, enabled: true, source: 'library'
      })
    });
    const data = await res.json();
    if (!data.success) { alert(data.error ?? 'Failed to add server'); return; }
    setAdding(null);
    await fetchData();
  };

  const handleAddCustom = async (e) => {
    e.preventDefault();
    let envObj = {};
    try { envObj = customForm.env ? JSON.parse(customForm.env) : {}; } catch { alert('Invalid JSON in env vars'); return; }
    await fetch('/api/v1/mcp-servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: customForm.id, name: customForm.name, command: customForm.command,
        args: customForm.args.split(' ').filter(Boolean), env: envObj, enabled: true, source: 'custom'
      })
    });
    setAddCustomOpen(false);
    setCustomForm({ id: '', name: '', command: 'npx', args: '', env: '' });
    await fetchData();
  };

  const handleRemove = async (id) => {
    await fetch(`/api/v1/mcp-servers/${id}`, { method: 'DELETE' });
    await fetchData();
  };

  const handleToggleLogs = async (id) => {
    if (!expandedLogs[id]) {
      const res = await fetch(`/api/v1/mcp-servers/${id}/logs`).then(r => r.json());
      if (res.success) setLogs(prev => ({ ...prev, [id]: res.logs }));
    }
    setExpandedLogs(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const LibraryAddForm = ({ server }) => {
    const [envVals, setEnvVals] = useState({});
    return (
      <div style={{ marginTop: 12, padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
        {(server.configFields ?? []).length > 0 && server.configFields.map(f => (
          <div key={f.key} style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{f.label}</label>
            <input
              type="password"
              placeholder={f.placeholder ?? ''}
              value={envVals[f.key] ?? ''}
              onChange={e => setEnvVals(v => ({ ...v, [f.key]: e.target.value }))}
              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: 4, padding: '5px 8px', color: 'var(--text-primary)', fontSize: 12, boxSizing: 'border-box' }}
            />
          </div>
        ))}
        {(server.configFields ?? []).length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '0 0 10px' }}>No configuration required.</p>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-primary" style={{ fontSize: 11 }} onClick={() => handleAddFromLibrary(server, envVals)}>Add Server</button>
          <button className="btn-secondary" style={{ fontSize: 11 }} onClick={() => setAdding(null)}>Cancel</button>
        </div>
      </div>
    );
  };

  const activeIds = new Set(active.map(s => s.id));

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Server size={24} color="var(--accent-teal)" />
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>MCP Servers</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>Manage Model Context Protocol server connections</p>
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
          {library.map(s => (
            <div key={s.id} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <strong style={{ fontSize: 14 }}>
                  <Server size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                  {s.name}
                </strong>
                {activeIds.has(s.id) && (
                  <span style={{ fontSize: 10, color: 'var(--accent-teal)', padding: '2px 6px', borderRadius: 4, background: 'rgba(0,200,200,0.1)' }}>Active</span>
                )}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 12px' }}>{s.description}</p>
              {!activeIds.has(s.id) && (
                <>
                  <button className="btn-primary" style={{ fontSize: 11 }} onClick={() => setAdding(adding === s.id ? null : s.id)}>
                    <Plus size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Add
                  </button>
                  {adding === s.id && <LibraryAddForm server={s} />}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && tab === 'active' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {active.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No MCP servers configured. Browse the library or add a custom server below.</p>
          )}
          {active.map(s => (
            <div key={s.id} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.status === 'registered' ? '#f59e0b' : s.status === 'running' ? 'var(--accent-teal)' : '#ef4444', display: 'inline-block' }} />
                  <strong style={{ fontSize: 14 }}>{s.name}</strong>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.id}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-icon-small" onClick={() => handleToggleLogs(s.id)} title="View Logs">
                    <Terminal size={14} />
                  </button>
                  <button className="btn-icon-small" onClick={() => handleRemove(s.id)} title="Remove" style={{ color: '#ef4444' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {expandedLogs[s.id] && (
                <div style={{ marginTop: 10, background: '#000', borderRadius: 4, padding: 10, maxHeight: 200, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11 }}>
                  {(logs[s.id] ?? []).length === 0
                    ? <span style={{ color: 'var(--text-muted)' }}>No logs yet.</span>
                    : (logs[s.id] ?? []).map((l, i) => <div key={i} style={{ color: '#00ff88', marginBottom: 2 }}>{l}</div>)
                  }
                </div>
              )}
            </div>
          ))}

          <div style={{ marginTop: 16, borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
            <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setAddCustomOpen(!addCustomOpen)}>
              <Plus size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Add Custom Server
            </button>
            {addCustomOpen && (
              <form onSubmit={handleAddCustom} style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                {[
                  { key: 'id', label: 'Server ID', placeholder: 'my-server' },
                  { key: 'name', label: 'Display Name', placeholder: 'My Server' },
                  { key: 'command', label: 'Command', placeholder: 'npx' },
                  { key: 'args', label: 'Args (space-separated)', placeholder: '-y @some/mcp-server' },
                  { key: 'env', label: 'Env vars (JSON)', placeholder: '{"API_KEY":"..."}' }
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{f.label}</label>
                    <input
                      type="text" placeholder={f.placeholder}
                      value={customForm[f.key]}
                      onChange={e => setCustomForm(v => ({ ...v, [f.key]: e.target.value }))}
                      style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: 4, padding: '5px 8px', color: 'var(--text-primary)', fontSize: 12, boxSizing: 'border-box' }}
                    />
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="btn-primary" style={{ fontSize: 12 }}>Add Server</button>
                  <button type="button" className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setAddCustomOpen(false)}>Cancel</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MCPServersView;
