import React, { useState } from 'react';
import { importSave, loadFromLocalStorage, clearLocalStorageSave } from '../services/saveService.js';
import { useGameState } from '../store/gameState.jsx';
import DatabaseManager from './DatabaseManager.jsx';
import './MainMenu.css';

const MainMenu = ({ onStartGame, onContinueGame }) => {
  const { dispatch } = useGameState();
  const [loadError, setLoadError] = useState('');
  const [showDatabase, setShowDatabase] = useState(false);
  const [showGameModeModal, setShowGameModeModal] = useState(false);

  const handleNewGame = (mode) => {
    clearLocalStorageSave(); // 清除旧存档
    dispatch({ type: 'RESET_STATE' });
    dispatch({ type: 'SET_GAME_MODE', payload: mode });
    setShowGameModeModal(false);
    onStartGame(mode);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const saveData = await importSave(file);
      dispatch({ type: 'SET_STATE', payload: saveData });
      setLoadError('');
      onContinueGame();
    } catch (error) {
      setLoadError(error.message);
    }

    e.target.value = '';
  };

  const handleQuickLoad = () => {
    const saveData = loadFromLocalStorage();
    if (saveData) {
      dispatch({ type: 'SET_STATE', payload: saveData });
      onContinueGame();
    } else {
      setLoadError('没有找到本地存档');
    }
  };

  const handleLoadSaveFromDB = (gameState) => {
    dispatch({ type: 'SET_STATE', payload: gameState });
    onContinueGame();
  };

  return (
    <div className="main-menu">
      <h1>AI 视觉小说</h1>
      <p className="subtitle">由 AI 驱动的互动故事体验</p>

      <div className="menu-buttons">
        <button className="menu-btn" onClick={() => setShowGameModeModal(true)}>
          新游戏
        </button>
        <button className="menu-btn secondary" onClick={handleQuickLoad}>
          继续游戏
        </button>
        <button className="menu-btn tertiary" onClick={() => setShowDatabase(true)}>
          数据库管理
        </button>
        <label className="file-input-label">
          导入存档
          <input
            type="file"
            accept=".json"
            onChange={handleFileUpload}
            className="file-input"
          />
        </label>
      </div>

      {loadError && <p className="load-error">{loadError}</p>}

      {showDatabase && (
        <DatabaseManager
          onClose={() => setShowDatabase(false)}
          onLoadSave={handleLoadSaveFromDB}
        />
      )}

      {showGameModeModal && (
        <div className="modal-overlay" onClick={() => setShowGameModeModal(false)}>
          <div className="modal-content game-mode-modal" onClick={(e) => e.stopPropagation()}>
            <h2>选择游戏模式</h2>
            <div className="game-mode-options">
              <button
                className="game-mode-btn story-mode"
                onClick={() => handleNewGame('story')}
              >
                <span className="mode-icon">📖</span>
                <span className="mode-title">剧情模式</span>
                <span className="mode-desc">跟随预设剧情，体验完整故事</span>
              </button>
              <button
                className="game-mode-btn free-mode"
                onClick={() => handleNewGame('free')}
              >
                <span className="mode-icon">🎮</span>
                <span className="mode-title">自由模式</span>
                <span className="mode-desc">自由探索，随心所欲行动</span>
              </button>
            </div>
            <button className="modal-close-btn" onClick={() => setShowGameModeModal(false)}>
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MainMenu;
