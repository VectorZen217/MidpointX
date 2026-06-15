import React, { useState, useEffect, useCallback } from 'react';
import { Eye, Play, Trash2, ToggleLeft, ToggleRight, Pencil, X, Check, Loader } from 'lucide-react';

const APPROVE_BADGE = {
  ask:    { label: 'ASK',    color: '#f59e0b' },
  auto:   { label: 'AUTO',   color: '#10b981' },
  notify: { label: 'NOTIFY', color: '#3b82f6' },
};

const STATUS_BADGE = {
  pending:   { label: 'PENDING',   color: '#f59e0b' },
  fired:     { label: 'FIRED',     color: '#10b981' },
  dismissed: { label: 'DISMISSED', color: '#6b7280' },
};

function Badge({ type, map }) {
  const b = map[type] || { label: type, color: '#888' };
  return (
    <span style={{ background: b.color + '22', color: b.color, padding: '2px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 700 }}>
      {b.label}
    </span>
  );
}

function formatTs(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

const EMPTY_FORM = { name: '', description: '', intent: '', auto_approve: 'ask', enabled: true };

export default function ScreenMonitorView() {
  const [config, setConfig] = useState(null);
  const [rules, setRules] = useState([]);
  const [detections, setDetections] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingRule, setEditingRule] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [capturing, setCapturing] = useState(false);
  const [savingCfg, setSavingCfg] = useState(false);
  const [cfgForm, setCfgForm] = useState({ poll_interval_s: 30 });
  const [error, setError] = useState('');
  const [visionWarning, setVisionWarning] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [cfgRes, rulesRes, detRes] = await Promise.all([
        fetch('/api/v1/screen-monitor/config'),
        fetch('/api/v1/screen-monitor/rules'),
        fetch('/api/v1/screen-monitor/detections?limit=50'),
      ]);
      const [cfg, rulesData, dets] = await Promise.all([cfgRes.json(), rulesRes.json(), detRes.json()]);
      setConfig(cfg);
      setCfgForm({ poll_interval_s: Math.round(cfg.poll_interval_ms / 1000) });
      setRules(rulesData);
      setDetections(dets);
    } catch {}
  }, []);

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 5000);
    return () => clearInterval(interval);
  }, [loadAll]);

  useEffect(() => {
    fetch('/api/v1/config')
      .then(r => r.json())
      .then(data => {
        const provider = (data.ACTIVE_LLM_PROVIDER || '').toLowerCase();
        const VISION = ['anthropic', 'openai', 'google', 'openrouter', 'nvidia'];
        setVisionWarning(!VISION.includes(provider));
      })
      .catch(() => {});
  }, []);

  async function toggleMaster() {
    if (!config) return;
    const newEnabled = config.enabled === 1 ? 0 : 1;
    const res = await fetch('/api/v1/screen-monitor/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: newEnabled }),
    });
    const data = await res.json();
    setConfig(data);
  }

  async function saveConfig(e) {
    e.preventDefault();
    setSavingCfg(true);
    try {
      const res = await fetch('/api/v1/screen-monitor/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poll_interval_ms: cfgForm.poll_interval_s * 1000 }),
      });
      const data = await res.json();
      setConfig(data);
    } finally { setSavingCfg(false); }
  }

  async function handleCapture() {
    setCapturing(true);
    try {
      await fetch('/api/v1/screen-monitor/capture', { method: 'POST' });
      await loadAll();
    } finally { setCapturing(false); }
  }

  async function handleAddRule(e) {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/v1/screen-monitor/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); return; }
    setForm(EMPTY_FORM);
    await loadAll();
  }

  async function handleDeleteRule(id) {
    if (!confirm('Delete this rule?')) return;
    await fetch(`/api/v1/screen-monitor/rules/${id}`, { method: 'DELETE' });
    await loadAll();
  }

  async function handleToggleRule(rule) {
    await fetch(`/api/v1/screen-monitor/rules/${rule.id}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: rule.enabled === 0 }),
    });
    await loadAll();
  }

  async function handleSaveEdit(id) {
    await fetch(`/api/v1/screen-monitor/rules/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    setEditingRule(null);
    await loadAll();
  }

  async function handleDismiss(id) {
    await fetch(`/api/v1/screen-monitor/detections/${id}/dismiss`, { method: 'POST' });
    await loadAll();
  }

  if (!config) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', fontSize: '12px' }}>
      Loading...
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100%', gap: '1px', background: 'var(--border-subtle)' }}>
      {/* Left Column */}
      <div style={{ width: '400px', flexShrink: 0, background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Eye size={16} color="var(--accent-teal)" />
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', color: 'var(--accent-teal)' }}>SCREEN MONITOR</span>
          </div>

          {visionWarning && (
            <div style={{ padding: '8px 10px', marginBottom: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: '4px', fontSize: '11px', color: '#ef4444' }}>
              Vision not supported by current provider. Switch to anthropic, openai, google, openrouter, or nvidia.
            </div>
          )}

          {/* Master toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: config.enabled === 1 ? '#10b981' : 'var(--text-secondary)' }}>
                {config.enabled === 1 ? '● ACTIVE' : '○ INACTIVE'}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Hotkey: {config.hotkey} · Every {Math.round(config.poll_interval_ms / 1000)}s
              </div>
            </div>
            <button
              onClick={toggleMaster}
              style={{
                background: config.enabled === 1 ? 'rgba(16,185,129,0.15)' : 'var(--bg-primary)',
                border: `1px solid ${config.enabled === 1 ? '#10b981' : 'var(--border-subtle)'}`,
                color: config.enabled === 1 ? '#10b981' : 'var(--text-secondary)',
                padding: '6px 14px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, cursor: 'pointer'
              }}
            >
              {config.enabled === 1 ? 'DISABLE' : 'ENABLE'}
            </button>
          </div>

          {/* Poll interval */}
          <form onSubmit={saveConfig} style={{ display: 'flex', gap: '6px', marginBottom: '10px', alignItems: 'center' }}>
            <input
              type="number" min="5"
              style={{ width: '70px', background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '5px 8px', borderRadius: '4px', fontSize: '12px' }}
              value={cfgForm.poll_interval_s}
              onChange={e => setCfgForm({ poll_interval_s: parseInt(e.target.value) || 30 })}
            />
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', flex: 1 }}>sec interval</span>
            <button type="submit" disabled={savingCfg} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '5px 10px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}>
              Save
            </button>
          </form>

          {/* Manual capture */}
          <button
            onClick={handleCapture}
            disabled={capturing}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'var(--accent-teal)', color: '#000', border: 'none', padding: '7px', borderRadius: '4px', fontSize: '12px', fontWeight: 700, cursor: capturing ? 'not-allowed' : 'pointer' }}
          >
            {capturing ? <Loader size={13} /> : <Play size={13} />}
            {capturing ? 'Analyzing...' : 'Manual Capture'}
          </button>
        </div>

        {/* Rules list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: 'var(--text-secondary)', padding: '4px 8px', marginBottom: '4px' }}>DETECTION RULES</div>

          {rules.map(rule => (
            <div key={rule.id} style={{ padding: '10px 12px', marginBottom: '4px', borderRadius: '4px', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)' }}>
              {editingRule === rule.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <input style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '4px 8px', borderRadius: '3px', fontSize: '11px' }}
                    value={editForm.name || ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder="Name" />
                  <textarea style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '4px 8px', borderRadius: '3px', fontSize: '11px', resize: 'vertical', minHeight: '48px' }}
                    value={editForm.description || ''} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} placeholder="Description" />
                  <textarea style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '4px 8px', borderRadius: '3px', fontSize: '11px', resize: 'vertical', minHeight: '40px' }}
                    value={editForm.intent || ''} onChange={e => setEditForm(f => ({ ...f, intent: e.target.value }))} placeholder="Intent" />
                  <select style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '4px 8px', borderRadius: '3px', fontSize: '11px' }}
                    value={editForm.auto_approve || 'ask'} onChange={e => setEditForm(f => ({ ...f, auto_approve: e.target.value }))}>
                    <option value="ask">ASK</option>
                    <option value="auto">AUTO</option>
                    <option value="notify">NOTIFY</option>
                  </select>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => handleSaveEdit(rule.id)} style={{ flex: 1, background: 'var(--accent-teal)', color: '#000', border: 'none', padding: '4px', borderRadius: '3px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                      <Check size={11} /> Save
                    </button>
                    <button onClick={() => setEditingRule(null)} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', padding: '4px 8px', borderRadius: '3px', fontSize: '11px', cursor: 'pointer' }}>
                      <X size={11} />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{rule.name}</span>
                      <Badge type={rule.auto_approve} map={APPROVE_BADGE} />
                    </div>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <button onClick={() => handleToggleRule(rule)} style={{ background: 'none', border: 'none', color: rule.enabled ? 'var(--accent-teal)' : 'var(--text-secondary)', cursor: 'pointer', padding: '2px' }}>
                        {rule.enabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                      </button>
                      <button onClick={() => { setEditingRule(rule.id); setEditForm({ name: rule.name, description: rule.description, intent: rule.intent, auto_approve: rule.auto_approve }); }}
                        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px' }}>
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        disabled={rule.is_builtin === 1}
                        title={rule.is_builtin ? 'Built-in rule cannot be deleted' : 'Delete'}
                        style={{ background: 'none', border: 'none', color: rule.is_builtin ? '#444' : '#ef4444', cursor: rule.is_builtin ? 'not-allowed' : 'pointer', padding: '2px' }}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '3px' }}>{rule.description}</div>
                </>
              )}
            </div>
          ))}

          {/* Add rule form */}
          <div style={{ marginTop: '8px', padding: '10px 12px', borderRadius: '4px', border: '1px dashed var(--border-subtle)' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', color: 'var(--text-secondary)', marginBottom: '8px' }}>+ ADD RULE</div>
            <form onSubmit={handleAddRule} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <input required style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '5px 8px', borderRadius: '3px', fontSize: '11px' }}
                placeholder="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <textarea required style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '5px 8px', borderRadius: '3px', fontSize: '11px', resize: 'vertical', minHeight: '48px' }}
                placeholder="Description — what to detect (plain English)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              <textarea required style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '5px 8px', borderRadius: '3px', fontSize: '11px', resize: 'vertical', minHeight: '40px' }}
                placeholder="Intent — what should the agent do?" value={form.intent} onChange={e => setForm(f => ({ ...f, intent: e.target.value }))} />
              <select style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '5px 8px', borderRadius: '3px', fontSize: '11px' }}
                value={form.auto_approve} onChange={e => setForm(f => ({ ...f, auto_approve: e.target.value }))}>
                <option value="ask">ASK — require approval</option>
                <option value="auto">AUTO — fire autonomously</option>
                <option value="notify">NOTIFY — Telegram only</option>
              </select>
              {error && <p style={{ color: '#ef4444', fontSize: '10px', margin: 0 }}>{error}</p>}
              <button type="submit" style={{ background: 'var(--bg-primary)', border: '1px solid var(--accent-teal)', color: 'var(--accent-teal)', padding: '5px', borderRadius: '3px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                Add Rule
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Right Column — Detection History */}
      <div style={{ flex: 1, background: 'var(--bg-primary)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', color: 'var(--text-secondary)' }}>DETECTION HISTORY</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {detections.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)', fontSize: '12px' }}>
              No detections yet. Captures run every {Math.round((config?.poll_interval_ms ?? 30000) / 1000)}s or via {config?.hotkey ?? 'Ctrl+Shift+S'}.
            </div>
          ) : (
            detections.map(det => {
              const rule = rules.find(r => r.id === det.rule_id);
              return (
                <div key={det.id} style={{ padding: '12px', marginBottom: '6px', borderRadius: '4px', border: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{rule?.name || det.rule_id}</span>
                      <Badge type={det.status} map={STATUS_BADGE} />
                    </div>
                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{formatTs(det.detected_at)}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px' }}>{det.description}</div>
                  {det.goal_id && (
                    <div style={{ fontSize: '10px', color: '#3b82f6', marginBottom: '4px' }}>Goal: {det.goal_id.substring(0, 8)}...</div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📸 {det.screenshot_path}</span>
                    {det.status === 'pending' && (
                      <button onClick={() => handleDismiss(det.id)} style={{ background: 'none', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '3px', fontSize: '10px', cursor: 'pointer', flexShrink: 0 }}>
                        Dismiss
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
