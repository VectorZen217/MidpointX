import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import SettingsView from './components/SettingsView';
import SkillsView from './components/SkillsView';
import ScheduledTasksView from './components/ScheduledTasksView';
import Planner from './components/Planner';
import ReasoningTree from './components/ReasoningTree';
import { Cpu, LayoutDashboard } from 'lucide-react';
import SystemBar from './components/SystemBar';

const socket = io(); // Connect to the active backend serving the frontend

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeUser, setActiveUser] = useState(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  
  const [activeView, setActiveView] = useState('chat'); // chat, settings, skills
  
  const [task, setTask] = useState('');
  const [executionMode, setExecutionMode] = useState('api'); // 'api' or 'visual'
  const [isRunning, setIsRunning] = useState(false);
  const [activeNode, setActiveNode] = useState('idle');
  const [trace, setTrace] = useState([
    { type: 'system', message: 'MidpointX Runtime Initialized // Local Gateway Active', time: new Date().toLocaleTimeString() },
  ]);
  const [tokenUsage, setTokenUsage] = useState({ input: 0, output: 0 });
  const [chatMessages, setChatMessages] = useState([]);
  const [systemInfo, setSystemInfo] = useState({ provider: 'GOOGLE', model: 'GEMINI-2.0-FLASH', persistence: 'local', env: 'development' });
  const [pendingApproval, setPendingApproval] = useState(null);
  const [hasNotifiedSovereign, setHasNotifiedSovereign] = useState(false);
  
  // Dynamic Mission Plan (Live Monitoring)
  const [strategicPlan, setStrategicPlan] = useState([
    "Initialize System Environment",
    "Analyze User Intent & Context",
    "Execute Logic // Master Strategy",
    "Validate Task Completion"
  ]);
  const [planStatus, setPlanStatus] = useState({
    "Initialize System Environment": "completed",
    "Analyze User Intent & Context": "active"
  });

  const [plannerWidth, setPlannerWidth] = useState(320);
  const [reasoningWidth, setReasoningWidth] = useState(320);
  const [socketConnected, setSocketConnected] = useState(true);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  
  const startResizingPlanner = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = plannerWidth;
    
    const onMouseMove = (moveEvent) => {
      const newWidth = Math.max(200, Math.min(800, startWidth + (moveEvent.clientX - startX)));
      setPlannerWidth(newWidth);
    };
    
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const startResizingReasoning = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = reasoningWidth;
    
    const onMouseMove = (moveEvent) => {
      const newWidth = Math.max(200, Math.min(800, startWidth - (moveEvent.clientX - startX)));
      setReasoningWidth(newWidth);
    };
    
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleResume = (approved) => {
    if (!pendingApproval) return;
    socket.emit('loop:resume', { 
      taskId: activeUser?.uid || 'web_user', 
      approved 
    });
    setPendingApproval(null);
    setTrace(prev => [...prev, { 
      type: 'system', 
      message: `>> [ Approval ${approved ? 'Granted' : 'Denied'} ]`, 
      time: new Date().toLocaleTimeString() 
    }]);
  };

  useEffect(() => {
    fetch('/api/v1/config')
      .then(res => res.json())
      .then(data => {
        setSystemInfo(prev => ({
          ...prev,
          provider: data.ACTIVE_LLM_PROVIDER?.toUpperCase() || prev.provider,
          model: data.ACTIVE_MODEL_NAME?.toUpperCase() || prev.model,
          persistence: data.PERSISTENCE_ADAPTER || prev.persistence
        }));
      })
      .catch(console.error);

    // Bypass Auth
    setIsAuthenticated(true);
    setActiveUser({
      uid: 'bypass_admin',
      email: 'admin@midpointx.bypass',
      name: 'Dev Bypass Admin'
    });
    setIsAuthChecking(false);
  }, []);

  useEffect(() => {
    // Socket real-time events
    socket.on('connect', () => setSocketConnected(true));
    socket.on('disconnect', () => setSocketConnected(false));

    socket.on('agent:progress', (payload) => {
      const nodeStage = String(payload.stage).toLowerCase();
      if (nodeStage.includes('reflection')) setActiveNode('reflection');
      else if (nodeStage.includes('analysis')) setActiveNode('analysis');
      else if (nodeStage.includes('compaction')) setActiveNode('compaction');
      else if (nodeStage.includes('selection')) setActiveNode('action');
      else if (nodeStage.includes('execution')) setActiveNode('action');
      
      if (payload.tokenUsage) {
        setTokenUsage({
          input: payload.tokenUsage.input || 0,
          output: payload.tokenUsage.output || 0
        });
      }

      // 🛰️ Sync Dynamic Plan (Phase 4 Monitoring)
      if (payload.data?.strategicPlan) {
        setStrategicPlan(payload.data.strategicPlan);
      }
      if (payload.data?.planStatus) {
        setPlanStatus(payload.data.planStatus);
      }

      // 🛡️ Intelligent Sovereign Notification
      if (payload.data?.autoApproved && !hasNotifiedSovereign) {
        setHasNotifiedSovereign(true);
        setChatMessages(prev => [...prev, {
          sender: 'agent',
          text: "🛡️ Sovereign Automation Active // Auto-approving safe operations.",
          time: new Date().toLocaleTimeString(),
          isSovereignMode: true
        }]);
      }

      // 🧠 Filtered Reasoning Trace (Reduce Noise)
      // Only show high-level actions, human gates, or final results
      const significantStages = ['executorNode', 'HumanApprovalGate', 'strategicPlanner'];
      const isSignificant = significantStages.some(s => nodeStage.includes(s)) || payload.data?.isTaskComplete;

      if (isSignificant) {
        let logMessage = `>> [ ${payload.stage.toUpperCase()} ]`;
        if (payload.data?.reasoning) {
           logMessage += `\n💭 THOUGHT: ${payload.data.reasoning}`;
        }
        if (payload.data?.pendingAction) {
           logMessage += `\n🎯 DECIDED: ${payload.data.pendingAction.tool}\n   Args: ${JSON.stringify(payload.data.pendingAction.args)}`;
        } else if (payload.data?.actionHistory) {
           const lastAction = payload.data.actionHistory[payload.data.actionHistory.length - 1];
           logMessage += `\n🛠️ EXECUTED: ${lastAction.tool}\n   Result: ${lastAction.result.substring(0, 100)}...`;
        } else if (typeof payload.data === 'string') {
           logMessage += `\n   ${payload.data}`;
        }

        setTrace(prev => [...prev, { 
          type: nodeStage.includes('reflection') ? 'reflection' : 'system', 
          message: logMessage, 
          hash: payload.data?.latestAuditHash,
          time: new Date().toLocaleTimeString() 
        }]);
      }
    });

    socket.on('agent:complete', (payload) => {
      setStrategicPlan(prev => prev); // Trigger re-render
      setPlanStatus(prev => {
        const finished = { ...prev };
        Object.keys(finished).forEach(k => finished[k] = 'completed');
        return finished;
      });

      setTrace(prev => [...prev, { 
        type: 'system', 
        message: `>> [ MISSION ACCOMPLISHED ]\n${payload.message}`, 
        time: new Date().toLocaleTimeString() 
      }]);

      if (payload.tokenUsage) {
        setTokenUsage({
          input: payload.tokenUsage.totalInputTokens || 0,
          output: payload.tokenUsage.totalOutputTokens || 0
        });
      }

      setIsRunning(false);
      setActiveNode('idle');
    });

    socket.on('agent:error', (payload) => {
      setTrace(prev => [...prev, { 
        type: 'system', 
        message: `>> [ Error ]\n${payload.error}`, 
        time: new Date().toLocaleTimeString() 
      }]);
      setIsRunning(false);
      setActiveNode('idle');
    });

    socket.on('agent:message', (payload) => {
      setChatMessages(prev => [...prev, {
        sender: 'agent',
        text: typeof payload.message === 'object' ? JSON.stringify(payload.message, null, 2) : String(payload.message),
        artifacts: payload.artifacts || [],
        time: new Date().toLocaleTimeString()
      }]);
    });

    socket.on('agent:approval_required', (payload) => {
      setPendingApproval(payload);
    });

    socket.on('system:init', (payload) => {
      setSystemInfo({
        provider: payload.provider.toUpperCase(),
        model: payload.model.toUpperCase(),
        persistence: payload.persistence,
        env: payload.env
      });
      
      const gatewayStatus = payload.persistence === 'firestore' ? 'Cloud Gateway' : 'Local Gateway';
      setTrace([{ type: 'system', message: `MidpointX Runtime Initialized // ${gatewayStatus} Active`, time: new Date().toLocaleTimeString() }]);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('agent:progress');
      socket.off('agent:complete');
      socket.off('agent:error');
      socket.off('agent:message');
      socket.off('system:init');
    };
  }, []);

  const handleStart = () => {
    if (!task.trim()) return;
    
    // Add user message to chat
    setChatMessages(prev => [...prev, {
      sender: 'user',
      text: task,
      time: new Date().toLocaleTimeString()
    }]);

    setIsRunning(true);
    setTrace([{ type: 'system', message: 'Starting sequence...', time: new Date().toLocaleTimeString()}]);
    
    const currentTask = task;
    setTask('');

    setHasNotifiedSovereign(false);
    socket.emit('loop:start', {
      taskId: `UI-${Date.now()}`,
      task: currentTask,
      identity: activeUser,
      executionMode: executionMode
    });
  };

  const clearChat = () => {
    setChatMessages([]);
    setTrace([{ type: 'system', message: 'MidpointX Runtime Initialized // Local Gateway Active', time: new Date().toLocaleTimeString() }]);
    setTask('');
  };

  if (isAuthChecking) {
    return (
      <div className="login-container">
        <div style={{ animation: 'pulse 2s infinite', color: 'var(--accent-teal)' }}>
          <Cpu size={48} />
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Sidebar activeView={activeView} setActiveView={setActiveView} activeUser={activeUser} clearChat={clearChat} />
      
      <div className="main-content">
        <SystemBar
          activeNode={activeNode}
          tokenUsage={tokenUsage}
          systemInfo={systemInfo}
          isRunning={isRunning}
          socketConnected={socketConnected}
        />
        {activeView === 'chat' && (
          <div className="mission-control-layout">
            <Planner strategicPlan={strategicPlan} planStatus={planStatus} width={plannerWidth} />
            <div className="resizer" onMouseDown={startResizingPlanner}></div>
            <ChatView
              task={task}
              setTask={setTask}
              handleStart={handleStart}
              isRunning={isRunning}
              chatMessages={chatMessages}
              trace={trace}
              tokenUsage={tokenUsage}
              activeNode={activeNode}
              systemInfo={systemInfo}
              activeUser={activeUser}
              clearChat={clearChat}
              pendingApproval={pendingApproval}
              handleResume={handleResume}
              executionMode={executionMode}
              setExecutionMode={setExecutionMode}
            />
            <div className="resizer" onMouseDown={startResizingReasoning}></div>
            <ReasoningTree trace={trace} tokenUsage={tokenUsage} width={reasoningWidth} />
          </div>
        )}

        {activeView === 'settings' && <SettingsView />}
        {activeView === 'skills' && <SkillsView />}
        {activeView === 'schedule' && <ScheduledTasksView />}
      </div>
    </div>
  );
};

export default App;
