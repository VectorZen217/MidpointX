import React, { useRef, useEffect, useState } from 'react';
import { ClipboardList, CheckCircle2, Circle, Clock } from 'lucide-react';

const Planner = ({ strategicPlan, planStatus, width }) => {
  const stepStartRef = useRef(null);
  const [elapsed, setElapsed] = useState(0);

  const activeStep = strategicPlan.find(step => planStatus[step] === 'active');

  useEffect(() => {
    if (!activeStep) return;
    stepStartRef.current = Date.now();
    setElapsed(0);
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - stepStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeStep]);

  return (
    <div className="planner-panel glass-panel" style={{ width: width ? `${width}px` : undefined }}>
      <div className="planner-header">
        <ClipboardList size={18} className="text-accent-neon" />
        <span>MISSION PLAN</span>
      </div>
      <div className="planner-content custom-scrollbar">
        {strategicPlan.map((step, idx) => {
          const status = planStatus[step] || 'pending';
          const isActive = status === 'active';
          const isCompleted = status === 'completed';

          return (
            <div key={idx} className={`planner-item ${status}`}>
              <div className="planner-item-icon">
                {isCompleted && <CheckCircle2 size={14} color="var(--accent-neon)" />}
                {isActive    && <Clock size={14} color="var(--accent-amber)" className="animate-pulse" />}
                {status === 'pending' && <Circle size={14} color="var(--text-muted)" />}
              </div>
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
                {isActive && (
                  <div className="planner-elapsed">{elapsed}s elapsed</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Planner;
