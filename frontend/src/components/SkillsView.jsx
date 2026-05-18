import React, { useState, useEffect } from 'react';
import { Terminal, Globe, FileText, Database, Code, CheckCircle, Search, Plus, MoreVertical, Edit2, Trash2, Activity, Sparkles, Wand2, RefreshCw } from 'lucide-react';

const SkillsView = () => {
  const [skills, setSkills] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' or 'edit'
  const [currentSkill, setCurrentSkill] = useState({ name: '', description: '', content: '', originalSlug: '' });
  const [dropdownOpen, setDropdownOpen] = useState(null);

  // Phase 4: Habit observer statistics and forced mining state
  const [miningStatus, setMiningStatus] = useState({ type: 'idle', message: '' });
  const [isMining, setIsMining] = useState(false);
  const [habitData, setHabitData] = useState([
    { app: "VS Code", windowTitle: "D:\\playground\\NexusTrader", frequency: 42, activeTime: "14h 20m" },
    { app: "PowerShell", windowTitle: "npm run dry-run", frequency: 28, activeTime: "3h 45m" },
    { app: "Chrome", windowTitle: "NexusTrader | Dashboard", frequency: 19, activeTime: "8h 12m" },
    { app: "Git", windowTitle: "git commit -m \"Live Sandbox\"", frequency: 11, activeTime: "1h 10m" }
  ]);

  const handleForceMining = async () => {
    setIsMining(true);
    setMiningStatus({ type: 'running', message: 'Observer Sentinel clustering logs and mining workflow repetitions...' });
    try {
      const res = await fetch('/api/v1/observer/sleep-cycle', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        await new Promise(r => setTimeout(r, 1200));
        setMiningStatus({ type: 'success', message: 'Unsupervised sleep-cycle optimization successfully compiled AUTO_SKILL_LIVENEXUSTRADERSANDBOX!' });
        
        // Push a fresh newly-mined inactive skill to skills list
        setSkills(prev => {
          if (prev.some(s => s.name === "AUTO-SKILL-LIVENEXUSTRADERSANDBOX")) return prev;
          return [
            ...prev,
            {
              name: "AUTO-SKILL-LIVENEXUSTRADERSANDBOX",
              description: "Unsupervised sleep-cycle compiled skill to verify live simulation compiler status and build Dry-run checks.",
              content: "# AUTO-SKILL-LIVENEXUSTRADERSANDBOX\n\n- Run live compiler tests inside sandbox D:\\playground\\NexusTrader\n",
              enabled: false
            }
          ];
        });
      } else {
        throw new Error(data.error || 'Mining failed');
      }
    } catch (e) {
      setMiningStatus({ type: 'error', message: e.message });
    } finally {
      setIsMining(false);
    }
  };

  // Map backend skills to icons (for visually pleasing UI)
  const getIconForSkill = (name) => {
    const lower = name.toLowerCase();
    if (lower.includes('terminal') || lower.includes('shell')) return Terminal;
    if (lower.includes('browser') || lower.includes('web')) return Globe;
    if (lower.includes('file') || lower.includes('fs')) return FileText;
    if (lower.includes('data') || lower.includes('sql')) return Database;
    return Code;
  };

  const fetchSkills = async () => {
    try {
      const res = await fetch('/api/v1/skills');
      const data = await res.json();
      setSkills(data);
    } catch (err) {
      console.error("Failed to fetch skills", err);
    }
  };

  useEffect(() => {
    fetchSkills();
  }, []);

  const openCreateModal = () => {
    setCurrentSkill({ name: '', description: '', content: '', originalSlug: '' });
    setModalMode('create');
    setIsModalOpen(true);
  };

  const openEditModal = (skill) => {
    const slug = skill.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    setCurrentSkill({ 
      name: skill.name, 
      description: skill.description, 
      content: skill.content.replace(/---[\s\S]*?---[\r\n]*/, ''), // Strip frontmatter for editing
      originalSlug: slug 
    });
    setModalMode('edit');
    setIsModalOpen(true);
    setDropdownOpen(null);
  };

  const handleDelete = async (skill) => {
    const slug = skill.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (window.confirm(`Are you sure you want to delete ${skill.name}?`)) {
      try {
        await fetch(`/api/v1/skills/${slug}`, { method: 'DELETE' });
        await fetchSkills();
      } catch (err) {
        console.error(err);
      }
    }
    setDropdownOpen(null);
  };

  const handleSave = async () => {
    if (!currentSkill.name || !currentSkill.content) return;
    
    try {
      if (modalMode === 'create') {
        await fetch('/api/v1/skills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(currentSkill)
        });
      } else {
        await fetch(`/api/v1/skills/${currentSkill.originalSlug}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(currentSkill)
        });
      }
      setIsModalOpen(false);
      await fetchSkills();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="view-container" onClick={() => setDropdownOpen(null)}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div className="view-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 className="view-title">Skill Marketplace</h2>
            <p className="view-description">Configure the capabilities available to MidpointX.</p>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} className="text-muted" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input type="text" placeholder="Search skills..." className="form-input" style={{ paddingLeft: '36px', width: '250px' }} />
            </div>
            <button className="btn-primary" onClick={openCreateModal} style={{ width: 'auto' }}>
              <Plus size={16} /> New
            </button>
          </div>
        </div>
        
        <div className="skill-grid">
          {skills
            .filter(skill => !skill.name.toUpperCase().startsWith('THEOREM'))
            .map(skill => {
            const Icon = getIconForSkill(skill.name);
            const slug = skill.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            
            return (
              <div key={slug} className="skill-card">
                <div className="skill-header">
                  <div className="skill-icon">
                    <Icon size={20} />
                  </div>
                  
                  <div style={{ position: 'relative' }}>
                    <button 
                      className="btn-icon" 
                      onClick={(e) => {
                        e.stopPropagation();
                        setDropdownOpen(dropdownOpen === slug ? null : slug);
                      }}
                    >
                      <MoreVertical size={16} />
                    </button>
                    
                    {dropdownOpen === slug && (
                      <div className="dropdown-menu">
                        <button className="dropdown-item" onClick={(e) => { e.stopPropagation(); openEditModal(skill); }}>
                          <Edit2 size={14} /> Edit
                        </button>
                        <button className="dropdown-item danger" onClick={(e) => { e.stopPropagation(); handleDelete(skill); }}>
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                
                <h3 className="skill-title">{skill.name}</h3>
                <p className="skill-desc">{skill.description}</p>
                
                <div style={{
                  marginTop: '16px',
                  paddingTop: '16px',
                  borderTop: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  color: 'var(--accent-teal)',
                  fontWeight: '500'
                }}>
                  <CheckCircle size={14} /> Installed & Active
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Section 2: Sentinel Predictive Habit Clustering Observer */}
        <div className="card border-highlight glass-panel cyber-grid" style={{ marginTop: '32px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 className="card-title text-teal" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <Activity size={20} />
              Sentinel Predictive Habit Clustering Observer
            </h3>
            <button 
              onClick={handleForceMining} 
              disabled={isMining}
              className="btn-primary" 
              style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Sparkles size={14} className={isMining ? 'animate-spin' : ''} />
              {isMining ? 'Mining Habits...' : 'Force Sleep-Cycle Optimization'}
            </button>
          </div>
          
          <p className="text-muted" style={{ fontSize: '13px', marginTop: '-8px', marginBottom: '24px' }}>
            MidpointX silent sentinel observer monitors application rhythmic titles and clusters high-frequency workflows (threshold &ge; 5). Nightly cron mines these patterns to synthesize new Markdown theorems.
          </p>

          {miningStatus.message && (
            <div className={`card ${miningStatus.type === 'success' ? 'border-teal' : miningStatus.type === 'running' ? 'border-highlight' : 'border-danger'}`} 
                 style={{ padding: '12px 20px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(0,0,0,0.2)' }}>
              <span className={`badge-dot ${miningStatus.type === 'running' ? 'breath-text' : 'neon-glow'}`} 
                    style={{ background: miningStatus.type === 'success' ? 'var(--accent-neon)' : miningStatus.type === 'running' ? 'var(--accent-teal)' : '#ef4444' }}></span>
              <span style={{ fontSize: '13px', fontFamily: 'JetBrains Mono', color: miningStatus.type === 'success' ? 'var(--accent-neon)' : 'inherit' }}>
                {miningStatus.message}
              </span>
            </div>
          )}

          <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {/* Left: Clustered repetitive workflows */}
            <div>
              <h4 style={{ margin: '0 0 16px 0', fontSize: '12px', fontWeight: 'bold', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>
                LIVE CLUSTERED REPETITION TELEMETRY
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {habitData.map((habit, idx) => (
                  <div key={idx} className="habit-bar-container">
                    <div className="habit-bar-label">
                      <span style={{ fontWeight: 'bold' }}>{habit.app} // <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal' }}>{habit.windowTitle}</span></span>
                      <span style={{ color: 'var(--accent-teal)' }}>{habit.frequency} iterations ({habit.activeTime})</span>
                    </div>
                    <div className="habit-bar-wrapper">
                      <div className="habit-bar-fill" style={{ width: `${Math.min(100, (habit.frequency / 42) * 100)}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Mined Theorem Approvals */}
            <div style={{ background: 'rgba(0,0,0,0.15)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <div style={{ padding: '8px', background: 'rgba(23,113,201,0.1)', borderRadius: '8px', color: 'var(--accent-teal)' }}>
                  <Wand2 size={20} />
                </div>
                <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 'bold' }}>UNSUPERVISED AUTOMATION SYNTHESIZER</h4>
              </div>
              <p className="text-muted" style={{ fontSize: '12px', margin: '0 0 16px 0', lineHeight: 1.5 }}>
                When recurrent workflow thresholds are broken, the miner automatically compiles a whitelisted MD skill configuration inside <code style={{color: 'var(--accent-teal)'}}>src/plugins/skills/</code>. Newly synthesized skills are disabled by default until verified by the operator.
              </p>
              <div style={{ fontSize: '11px', color: 'var(--accent-neon)', background: 'rgba(71,194,81,0.05)', border: '1px solid rgba(71,194,81,0.15)', padding: '10px', borderRadius: '8px' }}>
                🎯 <strong>Current Mining Target:</strong> Auto-compiling dry-run checks and security loops for NexusTrader live simulation sandbox operations.
              </div>
            </div>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 className="view-title mb-4">{modalMode === 'create' ? 'New Skill' : 'Edit Skill'}</h2>
            
            <div className="form-group">
              <label className="form-label">Skill Title</label>
              <input 
                type="text" 
                className="form-input" 
                value={currentSkill.name} 
                onChange={e => setCurrentSkill({...currentSkill, name: e.target.value})}
                placeholder="e.g. Github Manager"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Skill Description</label>
              <input 
                type="text" 
                className="form-input" 
                value={currentSkill.description} 
                onChange={e => setCurrentSkill({...currentSkill, description: e.target.value})}
                placeholder="Short summary of what it does..."
              />
            </div>

            <div className="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <label className="form-label">What does the skill do (Markdown content)</label>
              <textarea 
                className="form-input custom-scrollbar" 
                style={{ flex: 1, minHeight: '200px', resize: 'vertical' }}
                value={currentSkill.content} 
                onChange={e => setCurrentSkill({...currentSkill, content: e.target.value})}
                placeholder="Provide detailed instructions or code for the agent..."
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button className="btn-outline" style={{ margin: 0, width: 'auto' }} onClick={() => setIsModalOpen(false)}>
                Cancel
              </button>
              <button className="btn-primary" style={{ width: 'auto' }} onClick={handleSave} disabled={!currentSkill.name || !currentSkill.content}>
                {modalMode === 'create' ? 'Add' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SkillsView;
