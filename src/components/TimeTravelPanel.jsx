import React, { useState, useEffect } from 'react';
import {
  getCurrentWorldTimestamps,
  loadTimestamp,
  forkFromTimestamp,
  getCurrentSaveId
} from '../services/saveService.js';
import './TimeTravelPanel.css';

const TimeTravelPanel = ({ onClose, onLoadState, currentGameState }) => {
  const [timestamps, setTimestamps] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTimestamp, setSelectedTimestamp] = useState(null);
  const [showForkDialog, setShowForkDialog] = useState(false);
  const [forkName, setForkName] = useState('');
  const [previewState, setPreviewState] = useState(null);

  useEffect(() => {
    loadTimestamps();
  }, []);

  const loadTimestamps = async () => {
    setIsLoading(true);
    try {
      const saveId = getCurrentSaveId();
      let tsList = [];
      if (saveId) {
        tsList = await getCurrentWorldTimestamps();
      }
      setTimestamps(tsList);
    } catch (error) {
      console.error('Failed to load timestamps:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '未知';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPreview = async (timestamp) => {
    try {
      setSelectedTimestamp(timestamp);
      setPreviewState(timestamp.game_state);
    } catch (error) {
      console.error('Failed to get preview:', error);
    }
  };

  const handleLoad = async () => {
    if (!selectedTimestamp) return;
    try {
      const gameState = await loadTimestamp(selectedTimestamp.id);
      onLoadState(gameState);
      onClose();
    } catch (error) {
      alert('加载时间点失败: ' + error.message);
    }
  };

  const handleFork = async () => {
    if (!selectedTimestamp || !forkName.trim()) return;
    try {
      const result = await forkFromTimestamp(selectedTimestamp.id, forkName.trim());
      onLoadState(result.gameState);
      onClose();
    } catch (error) {
      alert('分叉失败: ' + error.message);
    }
  };

  const getDialoguePreview = (state) => {
    if (!state?.dialogueHistory || state.dialogueHistory.length === 0) {
      return '暂无对话';
    }
    const lastDialogue = state.dialogueHistory[state.dialogueHistory.length - 1];
    return `${lastDialogue.speaker}: ${lastDialogue.text.substring(0, 50)}...`;
  };

  return (
    <div className="timetravel-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="timetravel-panel">
        <div className="tt-header">
          <h2>⏰ 时间旅行</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="tt-content">
          <div className="tt-sidebar">
            <div className="tt-list-header">
              <h3>历史时间点</h3>
              <button className="refresh-btn" onClick={loadTimestamps}>🔄</button>
            </div>
            {isLoading ? (
              <div className="loading-text">加载中...</div>
            ) : timestamps.length === 0 ? (
              <div className="empty-text">暂无时间点记录</div>
            ) : (
              <div className="tt-list">
                {timestamps.map((ts, index) => (
                  <div
                    key={ts.id}
                    className={`tt-item ${selectedTimestamp?.id === ts.id ? 'selected' : ''}`}
                    onClick={() => getPreview(ts)}
                  >
                    <div className="tt-step">第 {ts.step_number || index + 1} 步</div>
                    <div className="tt-desc">{ts.description || '无描述'}</div>
                    <div className="tt-time">{formatDate(ts.created_at)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="tt-preview">
            {previewState ? (
              <>
                <div className="preview-header">
                  <h3>时间点预览</h3>
                  <span className="preview-step">第 {selectedTimestamp?.step_number} 步</span>
                </div>

                <div className="preview-section">
                  <h4>🌍 世界观</h4>
                  <p>{previewState.world?.name || '未设置'}</p>
                </div>

                <div className="preview-section">
                  <h4>📍 当前场景</h4>
                  <p>
                    {previewState.scenes?.find(s => s.id === previewState.currentSceneId)?.name || '未设置'}
                  </p>
                </div>

                <div className="preview-section">
                  <h4>💬 最新对话</h4>
                  <p className="dialogue-preview">{getDialoguePreview(previewState)}</p>
                </div>

                <div className="preview-section">
                  <h4>👥 角色数量</h4>
                  <p>{previewState.characters?.length || 0} 个角色</p>
                </div>

                <div className="preview-section">
                  <h4>🗺️ 场景数量</h4>
                  <p>{previewState.scenes?.length || 0} 个场景</p>
                </div>

                <div className="tt-actions">
                  <button
                    className="tt-btn load"
                    onClick={handleLoad}
                  >
                    🔙 返回此时
                  </button>
                  <button
                    className="tt-btn fork"
                    onClick={() => setShowForkDialog(true)}
                  >
                    🌿 从此分叉
                  </button>
                </div>
              </>
            ) : (
              <div className="no-selection">
                <p>👈 请从左侧选择一个时间点</p>
              </div>
            )}
          </div>
        </div>

        {showForkDialog && (
          <div className="fork-dialog-overlay" onClick={(e) => e.target === e.currentTarget && setShowForkDialog(false)}>
            <div className="fork-dialog">
              <h3>创建分叉</h3>
              <p>从第 {selectedTimestamp?.step_number} 步创建新的故事线</p>
              <input
                type="text"
                value={forkName}
                onChange={(e) => setForkName(e.target.value)}
                placeholder="输入新存档名称..."
                className="fork-input"
              />
              <div className="fork-actions">
                <button onClick={() => setShowForkDialog(false)}>取消</button>
                <button className="primary" onClick={handleFork} disabled={!forkName.trim()}>
                  创建
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TimeTravelPanel;
