import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { importSave, loadFromLocalStorage, clearLocalStorageSave, getDraftSaves, createDraftSave, setCurrentWorldId, setCurrentSaveId } from '../services/saveService.js';
import { useGameState } from '../store/gameState.jsx';
import { savesApi } from '../services/apiClient.js';
import DatabaseManager from './DatabaseManager.jsx';
import './MainMenu.css';

const stepNames = {
  world: '世界观创建',
  protagonist: '主角设定',
  character: '角色创建',
  scene: '场景创建'
};

const stepRoutes = {
  world: '/create/world',
  protagonist: '/create/protagonist',
  character: '/create/character',
  scene: '/create/scene'
};

const MainMenu = () => {
  const navigate = useNavigate();
  const { state, dispatch } = useGameState();
  const [loadError, setLoadError] = useState('');
  const [showDatabase, setShowDatabase] = useState(false);
  const [showGameModeModal, setShowGameModeModal] = useState(false);
  const [draftSaves, setDraftSaves] = useState([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);

  // 加载草稿列表
  useEffect(() => {
    const loadDrafts = async () => {
      setLoadingDrafts(true);
      const drafts = await getDraftSaves();
      setDraftSaves(drafts);
      setLoadingDrafts(false);
    };
    loadDrafts();
  }, []);

  const handleNewGame = async (mode) => {
    clearLocalStorageSave();
    dispatch({ type: 'RESET_STATE' });
    dispatch({ type: 'SET_GAME_MODE', payload: mode });
    setShowGameModeModal(false);

    if (mode !== 'story') {
      dispatch({ type: 'SET_CREATION_STEP', payload: 'world' });
      try {
        const draftResult = await createDraftSave(state);
        if (draftResult) {
          dispatch({ type: 'SET_DRAFT_IDS', payload: {
            saveId: draftResult.saveId,
            worldId: draftResult.worldId
          }});
        }
      } catch (err) {
        console.warn('Failed to create draft, continuing without backend save:', err);
      }
    }

    navigate(mode === 'story' ? '/story' : '/create/world');
  };

  const handleResumeDraft = (draft) => {
    const gameState = draft.game_state;
    dispatch({ type: 'SET_STATE', payload: gameState });

    if (gameState.draftWorldId) {
      setCurrentWorldId(gameState.draftWorldId);
    }
    if (draft.id) {
      setCurrentSaveId(draft.id);
    }

    const route = stepRoutes[gameState.creationStep] || '/create/world';
    navigate(route);
  };

  const handleDeleteDraft = async (draftId) => {
    if (!confirm('确定要删除这个草稿吗？')) return;
    try {
      await savesApi.delete(draftId);
      setDraftSaves(prev => prev.filter(d => d.id !== draftId));
    } catch (err) {
      console.warn('Failed to delete draft:', err);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const saveData = await importSave(file);
      dispatch({ type: 'SET_STATE', payload: saveData });
      setLoadError('');
      navigate('/play');
    } catch (error) {
      setLoadError(error.message);
    }

    e.target.value = '';
  };

  const handleQuickLoad = () => {
    const saveData = loadFromLocalStorage();
    if (saveData) {
      dispatch({ type: 'SET_STATE', payload: saveData });
      navigate('/play');
    } else {
      setLoadError('没有找到本地存档');
    }
  };

  const handleLoadSaveFromDB = (gameState) => {
    dispatch({ type: 'SET_STATE', payload: gameState });
    navigate('/play');
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

      {/* 草稿恢复区域 */}
      {draftSaves.length > 0 && (
        <div className="draft-resume-section">
          <h3 className="draft-section-title">未完成的创建</h3>
          {draftSaves.map(draft => {
            const gs = draft.game_state || {};
            const worldName = gs.world?.name && !gs.world.name.startsWith('draft_')
              ? gs.world.name
              : '未命名世界';
            const stepName = stepNames[gs.creationStep] || '未知步骤';
            const time = draft.updated_at
              ? new Date(draft.updated_at).toLocaleString('zh-CN')
              : '';

            return (
              <div key={draft.id} className="draft-card">
                <div className="draft-info">
                  <span className="draft-world-name">{worldName}</span>
                  <span className="draft-step">{stepName}</span>
                  {time && <span className="draft-time">{time}</span>}
                </div>
                <div className="draft-actions">
                  <button className="draft-btn resume" onClick={() => handleResumeDraft(draft)}>
                    继续创建
                  </button>
                  <button className="draft-btn delete" onClick={() => handleDeleteDraft(draft.id)}>
                    删除
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
