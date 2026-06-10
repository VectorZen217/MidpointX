import React, { useState } from 'react';
import { MessageSquare, Settings, Box, Cpu, ChevronRight, Menu, Calendar, Clock, Network } from 'lucide-react';
import MidpointLogo from './MidpointLogo';

const Sidebar = ({ activeView, setActiveView, activeUser, clearChat, toggleHistoryDrawer, historyDrawerOpen }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const navItems = [
    { id: 'chat',     label: 'OPERATIONS', icon: MessageSquare },
    { id: 'swarm',    label: 'SWARM',      icon: Network },
    { id: 'skills',   label: 'SKILLS',     icon: Box },
    { id: 'schedule', label: 'SCHEDULE',   icon: Calendar },
    { id: 'settings', label: 'CONFIG',     icon: Settings },
  ];

  return (
    <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <button className="menu-toggle" onClick={() => setIsCollapsed(!isCollapsed)}>
          <Menu size={18} />
        </button>
        {!isCollapsed && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '4px' }}>
              <MidpointLogo size={28} />
            </div>
            <div>
              <h1 className="sidebar-title" style={{ fontSize: '18px' }}>
                <span style={{ color: 'var(--accent-teal)' }}>Midpoint</span>
                <span style={{ color: 'var(--accent-neon)' }}>X</span>
              </h1>
              <p className="sidebar-subtitle" style={{ textTransform: 'none', fontSize: '8px', whiteSpace: 'nowrap', letterSpacing: '0.5px' }}>
                Sovereign Automation • Grounded Truth
              </p>
            </div>
          </>
        )}
      </div>
      
      <div className="sidebar-nav">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => {
              if (item.id === 'chat' && activeView === 'chat') {
                clearChat();
              } else {
                setActiveView(item.id);
              }
            }}
            className={`nav-item ${activeView === item.id ? 'active' : ''}`}
          >
            <div className="nav-item-icon">
              <item.icon size={18} />
            </div>
            {!isCollapsed && (
              <>
                <span>{item.label}</span>
                {activeView === item.id && <ChevronRight size={14} style={{ marginLeft: 'auto' }} />}
              </>
            )}
          </button>
        ))}
      </div>

      <div className="sidebar-footer">
        <button
          onClick={toggleHistoryDrawer}
          className="btn-icon-small"
          title="Toggle Session History"
          style={{
            marginRight: isCollapsed ? 0 : 8,
            background: historyDrawerOpen ? 'rgba(23,113,201,0.15)' : undefined,
            borderColor: historyDrawerOpen ? 'var(--accent-teal)' : undefined,
            color: historyDrawerOpen ? 'var(--accent-teal)' : undefined,
          }}
        >
          <Clock size={14} />
        </button>
        <div className="user-avatar">
          {activeUser?.name?.[0] || 'O'}
        </div>
        {!isCollapsed && (
          <div className="user-info">
            <p className="user-name">{activeUser?.name || 'Operator'}</p>
            <p className="user-status">Connected</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
