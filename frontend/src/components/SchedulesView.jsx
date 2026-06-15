import React, { useState, useEffect, useCallback } from 'react';
import { CalendarClock, Play, Trash2, ToggleLeft, ToggleRight, Loader } from 'lucide-react';

const TRIGGER_ICONS = { cron: '⏰', file_watch: '📁', webhook: '🪝' };
const STATUS_BADGE = {
  running: { label: 'RUNNING', color: '#3b82f6' },
  completed: { label: 'DONE', color: '#10b981' },
  failed: { label: 'FAILED', color: '#ef4444' },
};

function formatTs(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

function formatDuration(triggeredAt, completedAt) {
  if (!completedAt) return '—';
  const ms = completedAt - triggeredAt;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m`;
}

function parseTriggerSummary(schedule) {
  try {
    const cfg = JSON.parse(schedule.trigger_config);
    if (schedule.trigger_type === 'cron') return cfg.expression;
    if (schedule.trigger_type === 'file_watch') return cfg.path;
    if (schedule.trigger_type === 'webhook') return cfg.path;
  } catch {}
  return '—';
}

export default function SchedulesView() {
  const [schedules, setSchedules] = useState([]);
  const [selected, setSelected] = useState(null);
  const [runs, setRuns] = useState([]);
  const [form, setForm] = useState({
    name: '',
    trigger_type: 'cron',
    expression: '',
    filePath: '',
    fileEvents: ['add', 'change'],
    webhookPath: '',
    intent: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadSchedules = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/schedules');
      const data = await res.json();
      setSchedules(data.schedules || []);
    } catch {}
  }, []);

  const loadRuns = useCallback(async (scheduleId) => {
    try {
      const res = await fetch(`/api/v1/schedules/${scheduleId}/runs?limit=20`);
      const data = await res.json();
      setRuns(data.runs || []);
    } catch {}
  }, []);

  useEffect(() => {
    loadSchedules();
    const interval = setInterval(loadSchedules, 5000);
    return () => clearInterval(interval);
  }, [loadSchedules]);

  useEffect(() => {
    if (!selected) return;
    const hasRunning = schedules.find(s => s.id === selected && s.active_goal_id);
    loadRuns(selected);
    if (!hasRunning) return;
    const interval = setInterval(() => loadRuns(selected), 3000);
    return () => clearInterval(interval);
  }, [selected, schedules, loadRuns]);

  function buildTriggerConfig() {
    if (form.trigger_type === 'cron') return { expression: form.expression };
    if (form.trigger_type === 'file_watch') return { path: form.filePath, events: form.fileEvents };
    if (form.trigger_type === 'webhook') return { path: form.webhookPath.startsWith('/') ? form.webhookPath : `/${form.webhookPath}` };
    return {};
  }

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/v1/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          trigger_type: form.trigger_type,
          trigger_config: buildTriggerConfig(),
          intent: form.intent,
          enabled: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to save'); return; }
      setForm({ name: '', trigger_type: 'cron', expression: '', filePath: '', fileEvents: ['add', 'change'], webhookPath: '', intent: '' });
      await loadSchedules();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(schedule) {
    await fetch(`/api/v1/schedules/${schedule.id}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: schedule.enabled === 0 }),
    });
    await loadSchedules();
  }

  async function handleDelete(id) {
    if (!confirm('Delete this schedule?')) return;
    await fetch(`/api/v1/schedules/${id}`, { method: 'DELETE' });
    if (selected === id) setSelected(null);
    await loadSchedules();
  }

  async function handleManualTrigger(id) {
    await fetch(`/api/v1/schedules/${id}/trigger`, { method: 'POST' });
    await loadSchedules();
  }

  const selectedSchedule = schedules.find(s => s.id === selected);

  return (
    <div style={{ display: 'flex', height: '100%', gap: '1px', background: 'var(--border-subtle)' }}>
      {/* Left column */}
      <div style={{ width: '380px', flexShrink: 0, background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <CalendarClock size={16} color="var(--accent-teal)" />
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', color: 'var(--accent-teal)' }}>PROACTIVE SCHEDULES</span>
          </div>

          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '6px 10px', borderRadius: '4px', fontSize: '12px' }}
              placeholder="Schedule name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
            />
            <select
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '6px 10px', borderRadius: '4px', fontSize: '12px' }}
              value={form.trigger_type}
              onChange={e => setForm(f => ({ ...f, trigger_type: e.target.value }))}
            >
              <option value="cron">⏰ Cron (time-based)</option>
              <option value="file_watch">📁 File Watch</option>
              <option value="webhook">🪝 Webhook</option>
            </select>

            {form.trigger_type === 'cron' && (
              <input
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '6px 10px', borderRadius: '4px', fontSize: '12px' }}
                placeholder="Cron expression (e.g. 0 9 * * *)"
                value={form.expression}
                onChange={e => setForm(f => ({ ...f, expression: e.target.value }))}
                required
              />
            )}
            {form.trigger_type === 'file_watch' && (
              <>
                <input
                  style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '6px 10px', borderRadius: '4px', fontSize: '12px' }}
                  placeholder="Watch path (e.g. D:/Reports)"
                  value={form.filePath}
                  onChange={e => setForm(f => ({ ...f, filePath: e.target.value }))}
                  required
                />
                <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {['add', 'change', 'unlink'].map(ev => (
                    <label key={ev} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={form.fileEvents.includes(ev)}
                        onChange={e => setForm(f => ({ ...f, fileEvents: e.target.checked ? [...f.fileEvents, ev] : f.fileEvents.filter(x => x !== ev) }))}
                      />
                      {ev}
                    </label>
                  ))}
                </div>
              </>
            )}
            {form.trigger_type === 'webhook' && (
              <input
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '6px 10px', borderRadius: '4px', fontSize: '12px' }}
                placeholder="Webhook path (e.g. /my-trigger)"
                value={form.webhookPath}
                onChange={e => setForm(f => ({ ...f, webhookPath: e.target.value }))}
                required
              />
            )}

            <textarea
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '6px 10px', borderRadius: '4px', fontSize: '12px', resize: 'vertical', minHeight: '60px' }}
              placeholder="Intent — what should the agent do when this fires?"
              value={form.intent}
              onChange={e => setForm(f => ({ ...f, intent: e.target.value }))}
              required
            />

            {error && <p style={{ color: '#ef4444', fontSize: '11px', margin: 0 }}>{error}</p>}
            <button
              type="submit"
              disabled={saving}
              style={{ background: 'var(--accent-teal)', color: '#000', border: 'none', padding: '7px 14px', borderRadius: '4px', fontSize: '12px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              {saving ? 'Saving...' : '+ Add Schedule'}
            </button>
          </form>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {schedules.length === 0 && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '11px', padding: '8px', textAlign: 'center' }}>No schedules yet.</p>
          )}
          {schedules.map(s => (
            <div
              key={s.id}
              onClick={() => setSelected(s.id)}
              style={{
                padding: '10px 12px',
                marginBottom: '4px',
                borderRadius: '4px',
                border: `1px solid ${selected === s.id ? 'var(--accent-teal)' : 'var(--border-subtle)'}`,
                background: selected === s.id ? 'rgba(23,113,201,0.08)' : 'var(--bg-primary)',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {TRIGGER_ICONS[s.trigger_type]} {s.name}
                </span>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button title="Manual trigger" onClick={e => { e.stopPropagation(); handleManualTrigger(s.id); }} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px' }}>
                    <Play size={12} />
                  </button>
                  <button title={s.enabled ? 'Disable' : 'Enable'} onClick={e => { e.stopPropagation(); handleToggle(s); }} style={{ background: 'none', border: 'none', color: s.enabled ? 'var(--accent-teal)' : 'var(--text-secondary)', cursor: 'pointer', padding: '2px' }}>
                    {s.enabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                  </button>
                  <button title="Delete" onClick={e => { e.stopPropagation(); handleDelete(s.id); }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                {parseTriggerSummary(s)} · Last: {formatTs(s.last_run_at)}
              </div>
              {s.active_goal_id && (
                <div style={{ fontSize: '10px', color: '#3b82f6', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Loader size={9} />
                  Running now
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right column — run history */}
      <div style={{ flex: 1, background: 'var(--bg-primary)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {!selectedSchedule ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', fontSize: '12px' }}>
            Select a schedule to view run history
          </div>
        ) : (
          <>
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {TRIGGER_ICONS[selectedSchedule.trigger_type]} {selectedSchedule.name}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {selectedSchedule.intent}
              </div>
              {selectedSchedule.active_goal_id && (
                <div style={{ marginTop: '6px', padding: '6px 10px', background: 'rgba(59,130,246,0.1)', borderRadius: '4px', fontSize: '11px', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Loader size={11} />
                  Running now — goal ID: {selectedSchedule.active_goal_id.substring(0, 8)}...
                </div>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              {runs.length === 0 && (
                <p style={{ color: 'var(--text-secondary)', fontSize: '11px', textAlign: 'center', padding: '24px' }}>No runs yet.</p>
              )}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ color: 'var(--text-secondary)', textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px', fontWeight: 600 }}>Triggered</th>
                    <th style={{ padding: '6px 8px', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '6px 8px', fontWeight: 600 }}>Completed</th>
                    <th style={{ padding: '6px 8px', fontWeight: 600 }}>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map(run => {
                    const badge = STATUS_BADGE[run.status] || { label: run.status, color: '#888' };
                    return (
                      <tr key={run.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '7px 8px', color: 'var(--text-primary)' }}>{formatTs(run.triggered_at)}</td>
                        <td style={{ padding: '7px 8px' }}>
                          <span style={{ background: badge.color + '22', color: badge.color, padding: '2px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 700 }}>
                            {badge.label}
                          </span>
                        </td>
                        <td style={{ padding: '7px 8px', color: 'var(--text-secondary)' }}>{formatTs(run.completed_at)}</td>
                        <td style={{ padding: '7px 8px', color: 'var(--text-secondary)' }}>{formatDuration(run.triggered_at, run.completed_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
