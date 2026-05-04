import React from 'react';
import './TimelineSidebar.css';

const TimelineSidebar = ({ history, visible, onToggle, onJumpTo }) => {
  if (!visible) {
    return (
      <button className="timeline-toggle collapsed" onClick={onToggle}>
        ☰
      </button>
    );
  }

  return (
    <div className="timeline-sidebar">
      <div className="timeline-header">
        <span className="timeline-title">时间线</span>
        <button className="timeline-collapse" onClick={onToggle}>
          ☰
        </button>
      </div>
      <div className="timeline-list">
        {history.map((item, index) => (
          <div
            key={index}
            className={`timeline-item ${item.type}`}
            onClick={() => onJumpTo(index)}
          >
            <span className="timeline-turn">回合{item.turn}</span>
            <span className="timeline-preview">
              {item.speaker}: {item.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TimelineSidebar;