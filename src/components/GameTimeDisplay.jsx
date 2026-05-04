import React from 'react';
import { useGameState } from '../store/gameState.jsx';
import {
  formatTime,
  formatDate,
  getDayOfWeekName,
  getTimePeriod,
  getTimePeriodName,
  formatFullDateTime
} from '../utils/gameTime.js';
import './GameTimeDisplay.css';

const GameTimeDisplay = () => {
  const { state } = useGameState();
  const gameTime = state.gameTime || {};

  const period = getTimePeriod(gameTime.hour);
  const periodName = getTimePeriodName(period);

  // 获取时间段对应的图标
  const getPeriodIcon = () => {
    switch (period) {
      case 'morning': return '🌅';
      case 'noon': return '☀️';
      case 'evening': return '🌇';
      case 'night': return '🌙';
      default: return '⏰';
    }
  };

  return (
    <div className="game-time-display" title={formatFullDateTime(gameTime)}>
      <div className="time-icon">{getPeriodIcon()}</div>
      <div className="time-info">
        <div className="time-main">
          <span className="time-text">{formatTime(gameTime.hour, gameTime.minute)}</span>
          <span className="period-badge">{periodName}</span>
        </div>
        <div className="date-text">
          {formatDate(gameTime.year, gameTime.month, gameTime.day)} {getDayOfWeekName(gameTime.dayOfWeek)}
        </div>
      </div>
    </div>
  );
};

export default GameTimeDisplay;
