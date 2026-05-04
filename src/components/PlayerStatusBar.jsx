import React from 'react';
import { useGameState } from '../store/gameState.jsx';
import './PlayerStatusBar.css';

const PlayerStatusBar = () => {
  const { state, dispatch } = useGameState();
  const { playerStatus } = state;

  const hpPercent = (playerStatus.hp / playerStatus.maxHp) * 100;
  const mpPercent = (playerStatus.mp / playerStatus.maxMp) * 100;

  const getHpBarColor = () => {
    if (hpPercent > 50) return 'linear-gradient(90deg, #27ae60, #2ecc71)';
    if (hpPercent > 25) return 'linear-gradient(90deg, #f39c12, #e67e22)';
    return 'linear-gradient(90deg, #e74c3c, #c0392b)';
  };

  return (
    <div className="player-status-bar">
      <div className="status-header">
        <span className="player-level">Lv.{playerStatus.level}</span>
        <span className="player-gold">💰 {playerStatus.gold}</span>
      </div>

      <div className="status-bars">
        {/* HP 条 */}
        <div className="status-bar hp-bar">
          <div className="bar-label">
            <span className="bar-icon">❤️</span>
            <span className="bar-name">HP</span>
            <span className="bar-value">{playerStatus.hp}/{playerStatus.maxHp}</span>
          </div>
          <div className="bar-track">
            <div
              className="bar-fill hp-fill"
              style={{
                width: `${hpPercent}%`,
                background: getHpBarColor()
              }}
            />
          </div>
        </div>

        {/* MP 条 */}
        <div className="status-bar mp-bar">
          <div className="bar-label">
            <span className="bar-icon">💎</span>
            <span className="bar-name">MP</span>
            <span className="bar-value">{playerStatus.mp}/{playerStatus.maxMp}</span>
          </div>
          <div className="bar-track">
            <div
              className="bar-fill mp-fill"
              style={{ width: `${mpPercent}%` }}
            />
          </div>
        </div>

        {/* EXP 条 */}
        <div className="status-bar exp-bar">
          <div className="bar-label">
            <span className="bar-icon">⭐</span>
            <span className="bar-name">EXP</span>
            <span className="bar-value">{playerStatus.exp}/100</span>
          </div>
          <div className="bar-track">
            <div
              className="bar-fill exp-fill"
              style={{ width: `${Math.min(playerStatus.exp, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* 状态效果 */}
      {playerStatus.status && (
        <div className="status-effect">
          <span className="status-icon">⚠️</span>
          <span className="status-text">{playerStatus.status}</span>
        </div>
      )}
    </div>
  );
};

export default PlayerStatusBar;
