import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Play, Power, Plus, Trash2, Search, Info, AlertCircle } from 'lucide-react';

const ScheduledTasksView = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTask, setNewTask] = useState({ name: '', description: '', schedule: '0 */12 * * *', intent: '' });

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/scheduler');
      const data = await res.json();
      setTasks(data);
    } catch (err) {
      console.error("Failed to fetch scheduled tasks", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleToggle = async (task) => {
    try {
      await fetch('/api/v1/scheduler/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: task.slug, enabled: !task.enabled })
      });
      fetchTasks();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddTask = async () => {
    if (!newTask.name || !newTask.intent || !newTask.schedule) return;
    
    try {
      // We create a new skill with the schedule
      await fetch('/api/v1/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTask.name,
          description: newTask.description || 'Scheduled Task',
          content: `schedule: "${newTask.schedule}"\n\n# Mission Objective\n${newTask.intent}`
        })
      });
      setIsModalOpen(false);
      setNewTask({ name: '', description: '', schedule: '0 */12 * * *', intent: '' });
      fetchTasks();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="view-container">
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <div className="view-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 className="view-title">Scheduled Autonomy</h2>
            <p className="view-description">Configure the proactive heartbeat and periodic missions of MidpointX.</p>
          </div>
          
          <button className="btn-primary" onClick={() => setIsModalOpen(true)} style={{ width: 'auto' }}>
            <Plus size={16} /> New Task
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
            <div className="animate-pulse" style={{ color: 'var(--accent-teal)' }}>
              <Clock size={32} />
            </div>
          </div>
        ) : (
          <div className="skill-grid">
            {tasks.filter(t => t.schedule).map(task => (
              <div key={task.slug} className={`skill-card ${!task.enabled ? 'dimmed' : ''}`} style={{ borderLeft: task.enabled ? '4px solid var(--accent-teal)' : '4px solid var(--text-muted)' }}>
                <div className="skill-header">
                  <div className="skill-icon" style={{ background: task.enabled ? 'rgba(0, 255, 242, 0.1)' : 'rgba(255, 255, 255, 0.05)' }}>
                    <Calendar size={20} color={task.enabled ? 'var(--accent-teal)' : 'var(--text-muted)'} />
                  </div>
                  
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      className={`btn-icon ${task.enabled ? 'text-teal' : 'text-muted'}`}
                      onClick={() => handleToggle(task)}
                      title={task.enabled ? 'Disable Task' : 'Enable Task'}
                    >
                      <Power size={18} />
                    </button>
                  </div>
                </div>
                
                <h3 className="skill-title">{task.name}</h3>
                <p className="skill-desc" style={{ minHeight: '40px' }}>{task.description}</p>
                
                <div style={{
                  marginTop: '16px',
                  padding: '12px',
                  background: 'rgba(0, 0, 0, 0.2)',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: task.enabled ? 'var(--accent-neon)' : 'var(--text-muted)'
                }}>
                  <Clock size={14} />
                  <span>Cron: {task.schedule}</span>
                </div>

                <div style={{
                  marginTop: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                   <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                     Status: <span style={{ color: task.enabled ? 'var(--accent-teal)' : 'var(--text-muted)' }}>{task.enabled ? 'ACTIVE' : 'IDLE'}</span>
                   </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && tasks.filter(t => t.schedule).length === 0 && (
          <div style={{ textAlign: 'center', padding: '64px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '16px', border: '1px dashed var(--border-color)' }}>
            <Calendar size={48} style={{ margin: '0 auto 16px', color: 'var(--text-muted)', opacity: 0.5 }} />
            <h3 style={{ color: 'var(--text-primary)' }}>No Scheduled Tasks</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', maxWidth: '300px', margin: '8px auto' }}>
              Create a proactive mission to have MidpointX perform tasks autonomously while you sleep.
            </p>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <h2 className="view-title mb-4">Schedule New Mission</h2>
            
            <div className="form-group">
              <label className="form-label">Task Name</label>
              <input 
                type="text" 
                className="form-input" 
                value={newTask.name} 
                onChange={e => setNewTask({...newTask, name: e.target.value})}
                placeholder="e.g. Daily Market Summary"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Cron Expression</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text" 
                  className="form-input" 
                  value={newTask.schedule} 
                  onChange={e => setNewTask({...newTask, schedule: e.target.value})}
                  placeholder="0 * * * *"
                />
                <button 
                   className="btn-outline" 
                   style={{ margin: 0, padding: '0 12px', fontSize: '10px' }}
                   onClick={() => setNewTask({...newTask, schedule: '0 0 * * *'})}
                >
                  Daily
                </button>
              </div>
              <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Format: minute hour day month weekday
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">Agent Intent (What should the agent do?)</label>
              <textarea 
                className="form-input custom-scrollbar" 
                style={{ minHeight: '120px', resize: 'vertical' }}
                value={newTask.intent} 
                onChange={e => setNewTask({...newTask, intent: e.target.value})}
                placeholder="e.g. Browse the latest news about OpenAI and send a summary to my Telegram..."
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button className="btn-outline" style={{ margin: 0, width: 'auto' }} onClick={() => setIsModalOpen(false)}>
                Cancel
              </button>
              <button className="btn-primary" style={{ width: 'auto' }} onClick={handleAddTask} disabled={!newTask.name || !newTask.intent}>
                Initialize Autonomy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduledTasksView;
