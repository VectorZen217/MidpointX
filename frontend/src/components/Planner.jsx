import React from 'react';
import { ClipboardList, CheckCircle2, Circle, Clock } from 'lucide-react';

const Planner = ({ strategicPlan, planStatus, width }) => {
  return (
    <div className="planner-panel glass-panel" style={{ width: width ? `${width}px` : undefined }}>
      <div className="planner-header">
        <ClipboardList size={18} className="text-accent-neon" />
        <span>MISSION PLAN</span>
      </div>
      <div className="planner-content custom-scrollbar">
        {strategicPlan.map((step, idx) => {
          const status = planStatus[step] || 'pending';
          return (
            <div key={idx} className={`planner-item ${status}`}>
              <div className="planner-item-icon">
                {status === 'completed' && <CheckCircle2 size={14} className="text-accent-neon" />}
                {status === 'active' && <Clock size={14} className="text-accent-amber animate-pulse" />}
                {status === 'pending' && <Circle size={14} className="text-muted" />}
              </div>
              <span className="planner-item-text">{step}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Planner;
