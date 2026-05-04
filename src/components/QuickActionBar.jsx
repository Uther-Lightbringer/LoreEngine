import React from 'react';
import './QuickActionBar.css';

const QUICK_ACTIONS = [
  { id: 'look', label: '看向', icon: '👀' },
  { id: 'walk', label: '走向', icon: '🚶' },
  { id: 'take', label: '拿起', icon: '✋' },
  { id: 'speak', label: '说', icon: '💬' },
  { id: 'ask', label: '询问', icon: '❓' },
  { id: 'investigate', label: '调查', icon: '🔍' }
];

const QuickActionBar = ({ onAction, disabled }) => {
  const handleAction = (action) => {
    onAction(action.label);
  };

  return (
    <div className="quick-action-bar">
      <div className="quick-actions-grid">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.id}
            className="quick-action-btn"
            onClick={() => handleAction(action)}
            disabled={disabled}
            title={action.label}
          >
            <span className="quick-action-icon">{action.icon}</span>
            <span className="quick-action-label">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default QuickActionBar;
