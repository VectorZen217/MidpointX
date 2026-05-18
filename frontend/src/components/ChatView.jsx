import React, { useRef, useEffect, useState } from 'react';
import { Terminal, RefreshCw, Send, Cpu, Plus, Eye, Zap, Globe } from 'lucide-react';
import MidpointLogo from './MidpointLogo';

const ChatView = ({ 
  task, 
  setTask, 
  handleStart, 
  isRunning, 
  chatMessages, 
  trace, 
  tokenUsage,
  activeNode,
  systemInfo,
  activeUser,
  clearChat,
  pendingApproval,
  handleResume,
  executionMode,
  setExecutionMode
}) => {
  const chatEndRef = useRef(null);
  const [tracePanelWidth, setTracePanelWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);

  // Phase 4: Stateful browser sessions rehydration state
  const [showSessionsDrawer, setShowSessionsDrawer] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [rehydratingId, setRehydratingId] = useState(null);
  const [rehydrateStatus, setRehydrateStatus] = useState(null);

  useEffect(() => {
    if (showSessionsDrawer) {
      fetchSessions();
    }
  }, [showSessionsDrawer]);

  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/v1/browser/sessions');
      const data = await res.json();
      if (data.success) {
        setSessions(data.sessions);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRehydrate = async (taskId) => {
    setRehydratingId(taskId);
    setRehydrateStatus(`Spawning headless=false Chrome engine for session '${taskId}'...`);
    try {
      const res = await fetch('/api/v1/browser/rehydrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId })
      });
      const data = await res.json();
      if (data.success) {
        await new Promise(r => setTimeout(r, 1500));
        setRehydrateStatus(`✓ Visible Puppeteer window instantiated and cookie state injected successfully.`);
      } else {
        throw new Error(data.error || 'Rehydration failed');
      }
    } catch (e) {
      setRehydrateStatus(`❌ Error: ${e.message}`);
    } finally {
      setRehydratingId(null);
    }
  };
  
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, trace]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      const newWidth = document.body.clientWidth - e.clientX;
      if (newWidth > 200 && newWidth < 800) {
        setTracePanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleStart();
    }
  };

  return (
    <div className="chat-view-center">
      {/* Top Bar */}
      <header className="chat-header glass-panel">
        <div className="chat-header-left">
          <h2 className="chat-header-title">MISSION CONTROL</h2>
          <button onClick={clearChat} className="btn-icon-small" title="New Mission">
            <Plus size={14} />
          </button>
        </div>

        {/* Cognitive Pipeline */}
        <div className="cognitive-pipeline">
          {['reflection', 'analysis', 'action', 'compaction'].map((node) => (
            <div key={node} className={`pipeline-step ${activeNode === node ? 'active' : ''}`}>
              <div className="step-dot"></div>
              <span className="step-label">{node.toUpperCase()}</span>
            </div>
          ))}
        </div>

        <div className="chat-header-right" style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <div 
            className="mode-toggle" 
            onClick={() => setExecutionMode(executionMode === 'api' ? 'visual' : 'api')}
            title="Toggle Execution Mode"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '4px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: '20px', border: '1px solid var(--border-color)' }}
          >
            {executionMode === 'api' ? (
              <><Zap size={14} color="#f59e0b" /> <span style={{fontSize: '0.8rem', color: '#f59e0b', fontWeight: 'bold'}}>API MODE</span></>
            ) : (
              <><Eye size={14} color="#10b981" /> <span style={{fontSize: '0.8rem', color: '#10b981', fontWeight: 'bold'}}>VISUAL MODE</span></>
            )}
          </div>
          <div className="system-badge persistence-badge" style={{ background: systemInfo.persistence === 'firestore' ? 'rgba(23,113,201,0.1)' : 'rgba(128,128,128,0.1)', borderColor: systemInfo.persistence === 'firestore' ? 'var(--accent-teal)' : 'var(--border-color)' }}>
            <span className={`badge-dot ${systemInfo.persistence === 'firestore' ? 'neon-glow' : ''}`} style={{ background: systemInfo.persistence === 'firestore' ? 'var(--accent-teal)' : '#888' }}></span>
            <span style={{ color: systemInfo.persistence === 'firestore' ? 'var(--accent-teal)' : '#888' }}>
              {systemInfo.persistence === 'firestore' ? 'SOVEREIGN GATEWAY' : 'SOVEREIGN LOCAL'}
            </span>
          </div>
          <div className="system-badge">
            <span className="badge-dot neon-glow"></span>
            <span>{systemInfo.model}</span>
          </div>
          <button 
            onClick={() => setShowSessionsDrawer(!showSessionsDrawer)} 
            className="mode-toggle"
            title="Sovereign Browser Sessions"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '4px 12px', background: 'rgba(23,113,201,0.15)', borderRadius: '20px', border: '1px solid var(--accent-teal)', marginTop: 0 }}
          >
            <Globe size={14} color="var(--accent-teal)" />
            <span style={{fontSize: '0.8rem', color: 'var(--accent-teal)', fontWeight: 'bold'}}>SESSIONS</span>
          </button>
        </div>
      </header>

      {/* Messages Area */}
      <div className="chat-messages-container custom-scrollbar">
        {chatMessages.length === 0 ? (
          <div className="empty-state">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px', filter: 'drop-shadow(0 0 15px rgba(23,113,201,0.4))' }}>
              <MidpointLogo size={64} />
            </div>
            <h3 style={{ fontSize: '20px', letterSpacing: '0.5px' }}>MidpointX Intelligence Active</h3>
            <p>Deploy a task to begin sovereign automation.</p>
          </div>
        ) : (
          <div className="messages-list">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`message-bubble ${msg.sender === 'user' ? 'user' : 'agent'} ${msg.isSovereignMode ? 'sovereign-mode' : ''}`}>
                <div className="message-text">{msg.text}</div>
                <span className="message-meta">{msg.time}</span>
              </div>
            ))}
            
            {pendingApproval && (
              <div className="approval-card glass-panel neon-glow-amber">
                <div className="approval-header">
                  <div className="badge-amber">SECURITY CHALLENGE</div>
                </div>
                <div className="approval-body">
                  <pre>{pendingApproval.tool === 'execute_system_command' ? pendingApproval.args.command : JSON.stringify(pendingApproval.args, null, 2)}</pre>
                </div>
                <div className="approval-footer">
                  <button onClick={() => handleResume(true)} className="btn-approve">APPROVE</button>
                  <button onClick={() => handleResume(false)} className="btn-deny">DENY</button>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="chat-input-container glass-panel">
        <textarea 
          value={task}
          onChange={(e) => setTask(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Awaiting orders..."
          rows={1}
        />
        <button 
          onClick={handleStart}
          disabled={isRunning || !task.trim()}
          className="send-button"
        >
          {isRunning ? <RefreshCw size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>

      {showSessionsDrawer && (
        <div className="session-list-drawer glass-panel cyber-grid">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 'bold', color: 'var(--accent-teal)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Globe size={14} /> ACTIVE BROWSER SESSIONS
            </h4>
            <button onClick={() => setShowSessionsDrawer(false)} className="btn-icon-small" style={{ fontSize: '10px', minWidth: 'auto', padding: '4px' }}>✕</button>
          </div>
          
          <p className="text-muted" style={{ fontSize: '11px', margin: '0 0 16px 0', lineHeight: '1.4' }}>
            Puppeteer session states serialized to persistent storage. Select any session to rehydrate cookie states into a visible, live Chrome context.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '250px', overflowY: 'auto' }}>
            {sessions.map((sess) => (
              <div key={sess.id} style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '11px', color: 'var(--accent-neon)' }}>
                  <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🔑 {sess.id}</span>
                  <span>{sess.cookiesCount} cookies</span>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {sess.url}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>Mined: {new Date(sess.timestamp).toLocaleTimeString()}</span>
                  <button 
                    onClick={() => handleRehydrate(sess.id)}
                    disabled={rehydratingId === sess.id}
                    className="btn-primary" 
                    style={{ width: 'auto', padding: '4px 10px', fontSize: '10px', marginTop: 0 }}
                  >
                    {rehydratingId === sess.id ? 'Rehydrating...' : 'Rehydrate (Visible)'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {rehydrateStatus && (
            <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--accent-neon)', fontFamily: 'JetBrains Mono', background: 'rgba(0,0,0,0.2)', padding: '6px', borderRadius: '4px', border: '1px solid rgba(71,194,81,0.2)' }}>
              {rehydrateStatus}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ChatView;
