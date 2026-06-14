import React, { useRef, useEffect, useState } from 'react';
import { ClipboardList, CheckCircle2, Circle, Clock, AlertCircle, SkipForward } from 'lucide-react';

const STATUS_ICONS = {
  completed:  (size) => <CheckCircle2 size={size} color="var(--accent-neon)" />,
  active:     (size) => <Clock size={size} color="var(--accent-amber)" className="animate-pulse" />,
  failed:     (size) => <AlertCircle size={size} color="#ef4444" />,
  skipped:    (size) => <SkipForward size={size} color="var(--text-muted)" />,
  pending:    (size) => <Circle size={size} color="var(--text-muted)" />,
};

const WORKER_BADGE = {
  researcher: { label: 'RES', color: '#6366f1' },
  developer:  { label: 'DEV', color: '#10b981' },
  tester:     { label: 'TST', color: '#f59e0b' },
  executor:   { label: 'EXE', color: '#3b82f6' },
  none:       { label: 'EXE', color: '#3b82f6' },
};

// ── Structured task row (used when active goal is in SQLite) ──────────────────
const GoalTaskRow = ({ task, index }) => {
  const stepStartRef = useRef(null);
  const [elapsed, setElapsed] = useState(0);
  const isActive = task.status === 'active';
  const badge = WORKER_BADGE[task.assigned_worker] || WORKER_BADGE.executor;
  const icon = STATUS_ICONS[task.status] || STATUS_ICONS.pending;
  const depsBlocked = task.status === 'pending' && task.depends_on?.length > 0;

  useEffect(() => {
    if (!isActive) return;
    stepStartRef.current = Date.now();
    setElapsed(0);
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - stepStartRef.current) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [isActive]);

  return (
    <div className={`planner-item ${task.status}`} style={{ opacity: depsBlocked ? 0.5 : 1 }}>
      <div className="planner-item-icon">{icon(14)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="planner-item-text">{task.title}</span>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
            background: badge.color + '33', color: badge.color, letterSpacing: '0.05em',
          }}>{badge.label}</span>
        </div>
        <div className="planner-progress-bar">
          <div
            className={`planner-progress-fill${isActive ? ' planner-shimmer' : ''}`}
            style={{
              width: task.status === 'completed' ? '100%' : isActive ? '50%' : '0%',
              background: task.status === 'completed' ? 'var(--accent-neon)'
                        : task.status === 'failed'    ? '#ef4444'
                        : 'var(--accent-amber)',
            }}
          />
        </div>
        {isActive && <div className="planner-elapsed">{elapsed}s elapsed</div>}
        {task.status === 'failed' && task.failure_reason && (
          <div style={{ fontSize: 10, color: '#ef4444', marginTop: 2, opacity: 0.8 }}>
            {task.failure_reason.substring(0, 80)}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Legacy string-step row (fallback when no active goal) ─────────────────────
const LegacyStepRow = ({ step, status }) => {
  const stepStartRef = useRef(null);
  const [elapsed, setElapsed] = useState(0);
  const isActive = status === 'active';
  const isCompleted = status === 'completed';
  const icon = STATUS_ICONS[status] || STATUS_ICONS.pending;

  useEffect(() => {
    if (!isActive) return;
    stepStartRef.current = Date.now();
    setElapsed(0);
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - stepStartRef.current) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [isActive]);

  return (
    <div className={`planner-item ${status}`}>
      <div className="planner-item-icon">{icon(14)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span className="planner-item-text">{step}</span>
        <div className="planner-progress-bar">
          <div
            className={`planner-progress-fill${isActive ? ' planner-shimmer' : ''}`}
            style={{
              width: isCompleted ? '100%' : isActive ? '50%' : '0%',
              background: isCompleted ? 'var(--accent-neon)' : 'var(--accent-amber)',
            }}
          />
        </div>
        {isActive && <div className="planner-elapsed">{elapsed}s elapsed</div>}
      </div>
    </div>
  );
};

// ── Main Planner panel ────────────────────────────────────────────────────────
const Planner = ({ strategicPlan, planStatus, width }) => {
  const [activeGoal, setActiveGoal] = useState(null);

  // Poll /api/v1/goals/active every 3 seconds
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch('/api/v1/goals/active');
        if (!cancelled) setActiveGoal(res.ok ? await res.json() : null);
      } catch {
        if (!cancelled) setActiveGoal(null);
      }
    };
    poll();
    const iv = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const useGoalTracker = activeGoal && Array.isArray(activeGoal.tasks) && activeGoal.tasks.length > 0;

  return (
    <div className="planner-panel glass-panel" style={{ width: width ? `${width}px` : undefined }}>
      <div className="planner-header">
        <ClipboardList size={18} className="text-accent-neon" />
        <span>MISSION PLAN</span>
        {useGoalTracker && (
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>
            {activeGoal.completed_count}/{activeGoal.task_count} steps
          </span>
        )}
      </div>
      <div className="planner-content custom-scrollbar">
        {useGoalTracker
          ? activeGoal.tasks.map((task, idx) => <GoalTaskRow key={task.id} task={task} index={idx} />)
          : strategicPlan.map((step, idx) => (
              <LegacyStepRow key={idx} step={step} status={planStatus[step] || 'pending'} />
            ))
        }
      </div>
    </div>
  );
};

export default Planner;
