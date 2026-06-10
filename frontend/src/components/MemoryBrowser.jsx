import React, { useState, useEffect, useCallback } from 'react';
import { Brain, Search, Plus, Trash2, X } from 'lucide-react';

const TYPE_COLORS = {
  fact:       { color: 'var(--accent-teal)',  label: 'FACT' },
  project:    { color: 'var(--accent-neon)',  label: 'PROJECT' },
  preference: { color: '#FFC107',             label: 'PREF' },
  learned:    { color: '#a855f7',             label: 'LEARNED' },
};

const MemoryBrowser = () => {
  const [memories, setMemories] = useState([]);
  const [total, setTotal]       = useState(0);
  const [search, setSearch]     = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm]   = useState({ key: '', value: '', type: 'fact' });
  const [loading, setLoading]   = useState(false);

  const fetchMemories = useCallback(async () => {
    setLoading(true);
    try {
      const url = search
        ? `/api/v1/memories/search?q=${encodeURIComponent(search)}`
        : `/api/v1/memories`;
      const res = await fetch(url);
      const data = await res.json();
      setMemories(data.memories || []);
      setTotal(data.total ?? data.memories?.length ?? 0);
    } catch {
      setMemories([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  const handleForget = async (id) => {
    await fetch(`/api/v1/memories/${id}`, { method: 'DELETE' });
    setMemories(prev => prev.filter(m => m.id !== id));
    setTotal(prev => prev - 1);
  };

  const handleAdd = async () => {
    if (!addForm.key || !addForm.value) return;
    const res = await fetch('/api/v1/memories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm)
    });
    const data = await res.json();
    if (data.success) {
      setMemories(prev => [data.memory, ...prev]);
      setTotal(prev => prev + 1);
      setShowAddModal(false);
      setAddForm({ key: '', value: '', type: 'fact' });
    }
  };

  return (
    <div className="memory-browser">
      <div className="memory-header">
        <Brain size={16} style={{ color: 'var(--accent-teal)' }} />
        <span>MEMORY BROWSER</span>
        <span className="memory-count">{total} entr{total !== 1 ? 'ies' : 'y'}</span>
        <button className="memory-add-btn" onClick={() => setShowAddModal(true)}>
          <Plus size={12} /> Add
        </button>
      </div>

      <div className="memory-search-bar">
        <Search size={12} />
        <input
          type="text"
          placeholder="Search memories..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="memory-search-input"
        />
        {search && (
          <button onClick={() => setSearch('')} className="memory-search-clear">
            <X size={12} />
          </button>
        )}
      </div>

      <div className="memory-list">
        {loading && <div className="memory-loading">Loading...</div>}
        {!loading && memories.length === 0 && (
          <div className="memory-empty">
            <Brain size={28} style={{ opacity: 0.3 }} />
            <p>No memories yet.</p>
            <p style={{ fontSize: '11px', opacity: 0.5 }}>
              Agents write memories automatically, or add one manually.
            </p>
          </div>
        )}
        {memories.map(m => {
          const cfg = TYPE_COLORS[m.type] || TYPE_COLORS.fact;
          return (
            <div key={m.id} className="memory-row">
              <span className="memory-type-badge" style={{ color: cfg.color, borderColor: cfg.color }}>
                {cfg.label}
              </span>
              <div className="memory-content">
                <div className="memory-key">{m.key}</div>
                <div className="memory-value">{m.value.substring(0, 80)}{m.value.length > 80 ? '…' : ''}</div>
              </div>
              <span className="memory-hits">{m.access_count}x</span>
              <button className="memory-delete-btn" onClick={() => handleForget(m.id)}>
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}
      </div>

      {showAddModal && (
        <div className="memory-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="memory-modal" onClick={e => e.stopPropagation()}>
            <div className="memory-modal-header">
              <span>Add Memory</span>
              <button onClick={() => setShowAddModal(false)}><X size={14} /></button>
            </div>
            <select
              value={addForm.type}
              onChange={e => setAddForm(f => ({ ...f, type: e.target.value }))}
              className="memory-modal-select"
            >
              <option value="fact">Fact</option>
              <option value="project">Project</option>
              <option value="preference">Preference</option>
              <option value="learned">Learned</option>
            </select>
            <input
              type="text"
              placeholder="Key (e.g. user.stack.language)"
              value={addForm.key}
              onChange={e => setAddForm(f => ({ ...f, key: e.target.value }))}
              className="memory-modal-input"
            />
            <textarea
              placeholder="Value"
              value={addForm.value}
              onChange={e => setAddForm(f => ({ ...f, value: e.target.value }))}
              className="memory-modal-textarea"
              rows={3}
            />
            <button className="memory-modal-save" onClick={handleAdd}>Save Memory</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemoryBrowser;
