import React, { useState, useEffect } from 'react';
import { Terminal, Globe, FileText, Database, Code, CheckCircle, Search, Plus, MoreVertical, Edit2, Trash2 } from 'lucide-react';

const SkillsView = () => {
  const [skills, setSkills] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' or 'edit'
  const [currentSkill, setCurrentSkill] = useState({ name: '', description: '', content: '', originalSlug: '' });
  const [dropdownOpen, setDropdownOpen] = useState(null);

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
