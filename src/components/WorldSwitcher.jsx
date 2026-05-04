import React, { useState, useEffect } from 'react';
import {
  getAllWorlds,
  switchToWorld,
  saveCurrentWorldToCache,
  getCurrentWorldId
} from '../services/saveService.js';
import './WorldSwitcher.css';

const WorldSwitcher = ({ onClose, onLoadWorld, currentGameState }) => {
  const [worlds, setWorlds] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedWorld, setSelectedWorld] = useState(null);
  const [error, setError] = useState('');
  const currentWorldId = getCurrentWorldId();

  useEffect(() => {
    loadWorlds();
  }, []);

  const loadWorlds = async () => {
    setIsLoading(true);
    setError('');
    try {
      const worldList = await getAllWorlds();
      setWorlds(worldList);
    } catch (error) {
      setError('加载世界列表失败: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '未知';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN');
  };

  const handleSwitch = async (world) => {
    if (world.id === currentWorldId) {
      alert('你已经在这个世界中！');
      return;
    }

    // 先保存当前世界状态到缓存
    if (currentGameState && currentWorldId) {
      saveCurrentWorldToCache(currentWorldId, currentGameState);
    }

    try {
      setIsLoading(true);
      const gameState = await switchToWorld(world.id);
      onLoadWorld(gameState);
      onClose();
    } catch (error) {
      setError('切换世界失败: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="worldswitcher-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="worldswitcher-panel">
        <div className="ws-header">
          <h2>🌍 世界切换</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="ws-content">
          {error && <p className="ws-error">{error}</p>}

          {isLoading ? (
            <div className="loading-text">加载中...</div>
          ) : worlds.length === 0 ? (
            <div className="empty-text">
              <p>暂无其他世界</p>
              <p className="hint">继续当前游戏，它将自动保存为一个世界</p>
            </div>
          ) : (
            <div className="world-list">
              {worlds.map(world => (
                <div
                  key={world.id}
                  className={`world-item ${world.id === currentWorldId ? 'current' : ''}`}
                  onClick={() => world.id !== currentWorldId && handleSwitch(world)}
                >
                  {world.image_url && (
                    <img src={world.image_url} alt={world.name} className="world-thumb" />
                  )}
                  <div className="world-info">
                    <h4>
                      {world.name}
                      {world.id === currentWorldId && <span className="current-badge">当前</span>}
                    </h4>
                    <p className="world-desc">{world.description?.substring(0, 80)}...</p>
                    <span className="world-date">更新于: {formatDate(world.updated_at)}</span>
                  </div>
                  {world.id !== currentWorldId && (
                    <button className="switch-btn">切换 →</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="ws-footer">
          <button className="refresh-btn" onClick={loadWorlds}>🔄 刷新列表</button>
        </div>
      </div>
    </div>
  );
};

export default WorldSwitcher;
