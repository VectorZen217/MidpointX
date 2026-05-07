import React, { useRef, useEffect, useState } from 'react';
import { Terminal, RefreshCw, Send, Cpu, Plus, Eye, Zap } from 'lucide-react';
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
          <div className="system-badge">
            <span className="badge-dot neon-glow"></span>
            <span>{systemInfo.model}</span>
          </div>
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
    </div>
  );
};

export default ChatView;
