import React, { useState, useEffect } from 'react';
import apiClient, { worldsApi, savesApi, imagesApi, timestampsApi, checkBackendStatus } from '../services/apiClient.js';
import { setCurrentWorldId, setCurrentSaveId, setStepCounter } from '../services/saveService.js';
import './DatabaseManager.css';

const DatabaseManager = ({ onClose, onLoadSave }) => {
  const [activeTab, setActiveTab] = useState('worlds');
  const [worlds, setWorlds] = useState([]);
  const [saves, setSaves] = useState([]);
  const [images, setImages] = useState([]);
  const [timestamps, setTimestamps] = useState([]);
  const [selectedWorld, setSelectedWorld] = useState(null);
  const [selectedSave, setSelectedSave] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [backendAvailable, setBackendAvailable] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    checkBackend();
  }, []);

  useEffect(() => {
    if (backendAvailable) {
      loadData();
    }
  }, [activeTab, selectedWorld, backendAvailable]);

  const checkBackend = async () => {
    const available = await checkBackendStatus();
    setBackendAvailable(available);
    if (!available) {
      setError('后端服务器未运行，请先启动后端服务器 (npm run server)');
    }
    setIsLoading(false);
  };

  const loadData = async () => {
    if (!backendAvailable) return;

    setIsLoading(true);
    setError('');
    try {
      if (activeTab === 'worlds') {
        const worldList = await worldsApi.getAll();
        setWorlds(worldList);
      } else if (activeTab === 'saves') {
        const saveList = await savesApi.getAll();
        setSaves(saveList);
      } else if (activeTab === 'timestamps') {
        if (selectedSave) {
          const timestampList = await timestampsApi.getBySaveId(selectedSave.id);
          setTimestamps(timestampList);
        }
      } else if (activeTab === 'images' && selectedWorld) {
        const imageList = await imagesApi.getByWorldId(selectedWorld.id);
        setImages(imageList);
      }
    } catch (error) {
      setError('加载数据失败: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteWorld = async (id) => {
    if (confirm('确定要删除这个世界观吗？相关的存档和图片也会被删除！')) {
      try {
        await worldsApi.delete(id);
        loadData();
      } catch (error) {
        setError('删除失败: ' + error.message);
      }
    }
  };

  const handleDeleteSave = async (id) => {
    if (confirm('确定要删除这个存档吗？')) {
      try {
        await savesApi.delete(id);
        loadData();
      } catch (error) {
        setError('删除失败: ' + error.message);
      }
    }
  };

  const handleLoadSave = async (id) => {
    try {
      const save = await savesApi.getById(id);
      if (save && save.game_state) {
        // 设置当前存档ID和世界ID
        setCurrentSaveId(save.id);
        if (save.world_id) {
          setCurrentWorldId(save.world_id);
        }
        // 加载时间点列表来设置步数
        try {
          const timestampList = await timestampsApi.getBySaveId(save.id);
          if (timestampList.length > 0) {
            setStepCounter(timestampList[timestampList.length - 1].step_number || 0);
          }
        } catch (e) {
          console.warn('Failed to load timestamps for save:', e);
        }
        onLoadSave(save.game_state);
        onClose();
      }
    } catch (error) {
      setError('加载存档失败: ' + error.message);
    }
  };

  const handleLoadTimestamp = async (id) => {
    try {
      const ts = await timestampsApi.getById(id);
      if (ts && ts.game_state) {
        onLoadSave(ts.game_state);
        onClose();
      }
    } catch (error) {
      setError('加载时间点失败: ' + error.message);
    }
  };

  const handleDeleteTimestamp = async (id) => {
    if (confirm('确定要删除这个时间点吗？')) {
      try {
        await timestampsApi.delete(id);
        loadData();
      } catch (error) {
        setError('删除失败: ' + error.message);
      }
    }
  };

  const handleDeleteImage = async (id) => {
    if (confirm('确定要删除这张图片吗？')) {
      try {
        await imagesApi.delete(id);
        loadData();
      } catch (error) {
        setError('删除失败: ' + error.message);
      }
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '未知';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN');
  };

  return (
    <div className="database-manager-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="database-manager">
        <div className="db-header">
          <h2>数据库管理</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {!backendAvailable ? (
          <div className="db-content">
            <div className="error-section">
              <p className="error-text">⚠️ {error}</p>
              <p className="hint-text">请在项目根目录运行以下命令启动后端：</p>
              <code className="hint-code">cd server && npm install && npm start</code>
              <button className="retry-btn" onClick={checkBackend}>
                重试连接
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="db-tabs">
              <button
                className={`db-tab ${activeTab === 'worlds' ? 'active' : ''}`}
                onClick={() => setActiveTab('worlds')}
              >
                世界观 ({worlds.length})
              </button>
              <button
                className={`db-tab ${activeTab === 'saves' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('saves');
                  setSelectedSave(null);
                }}
              >
                存档 ({saves.length})
              </button>
              <button
                className={`db-tab ${activeTab === 'timestamps' ? 'active' : ''}`}
                onClick={() => setActiveTab('timestamps')}
                disabled={saves.length === 0}
              >
                时间点
              </button>
              <button
                className={`db-tab ${activeTab === 'images' ? 'active' : ''}`}
                onClick={() => setActiveTab('images')}
                disabled={worlds.length === 0}
              >
                图片
              </button>
            </div>

            <div className="db-content">
              {isLoading ? (
                <div className="loading-text">加载中...</div>
              ) : (
                <>
                  {error && <p className="db-error">{error}</p>}

                  {activeTab === 'worlds' && (
                    <div className="world-list">
                      {worlds.length === 0 ? (
                        <p className="empty-text">暂无保存的世界观</p>
                      ) : (
                        worlds.map(world => (
                          <div key={world.id} className="world-item">
                            <div className="world-info">
                              <h4>{world.name}</h4>
                              <p className="world-desc">{world.description?.substring(0, 100)}...</p>
                              <span className="world-date">更新于: {formatDate(world.updated_at)}</span>
                            </div>
                            <div className="world-actions">
                              {world.image_url && (
                                <img src={world.image_url} alt={world.name} className="world-thumb" />
                              )}
                              <button
                                className="small-btn delete"
                                onClick={() => handleDeleteWorld(world.id)}
                              >
                                删除
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {activeTab === 'saves' && (
                    <div className="save-list">
                      {saves.length === 0 ? (
                        <p className="empty-text">暂无保存的存档</p>
                      ) : (
                        saves.map(save => (
                          <div key={save.id} className="save-item">
                            <div className="save-info">
                              <h4>{save.name}</h4>
                              <span className="save-date">保存于: {formatDate(save.updated_at)}</span>
                              {save.game_state?.world?.name && (
                                <span className="save-world">世界观: {save.game_state.world.name}</span>
                              )}
                            </div>
                            <div className="save-actions">
                              <button
                                className="small-btn edit"
                                onClick={() => {
                                  setSelectedSave(save);
                                  setActiveTab('timestamps');
                                }}
                              >
                                时间点
                              </button>
                              <button
                                className="small-btn edit"
                                onClick={() => handleLoadSave(save.id)}
                              >
                                加载
                              </button>
                              <button
                                className="small-btn delete"
                                onClick={() => handleDeleteSave(save.id)}
                              >
                                删除
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {activeTab === 'timestamps' && (
                    <div className="timestamps-tab">
                      <div className="save-selector">
                        <label>选择存档:</label>
                        <select
                          value={selectedSave?.id || ''}
                          onChange={(e) => {
                            const save = saves.find(s => s.id === Number(e.target.value));
                            setSelectedSave(save);
                          }}
                        >
                          <option value="">请选择...</option>
                          {saves.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>

                      {selectedSave && (
                        <div className="timestamp-list">
                          {timestamps.length === 0 ? (
                            <p className="empty-text">此存档暂无时间点记录</p>
                          ) : (
                            timestamps.map((ts, index) => (
                              <div key={ts.id} className="timestamp-item">
                                <div className="timestamp-info">
                                  <h4>第 {ts.step_number || index + 1} 步</h4>
                                  <span className="timestamp-desc">{ts.description || '无描述'}</span>
                                  <span className="timestamp-date">{formatDate(ts.created_at)}</span>
                                  {ts.game_state?.dialogueHistory?.length > 0 && (
                                    <span className="timestamp-dialogue">
                                      对话数: {ts.game_state.dialogueHistory.length}
                                    </span>
                                  )}
                                </div>
                                <div className="timestamp-actions">
                                  <button
                                    className="small-btn edit"
                                    onClick={() => handleLoadTimestamp(ts.id)}
                                  >
                                    加载
                                  </button>
                                  <button
                                    className="small-btn delete"
                                    onClick={() => handleDeleteTimestamp(ts.id)}
                                  >
                                    删除
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'images' && (
                    <div className="images-tab">
                      <div className="world-selector">
                        <label>选择世界观:</label>
                        <select
                          value={selectedWorld?.id || ''}
                          onChange={(e) => {
                            const world = worlds.find(w => w.id === Number(e.target.value));
                            setSelectedWorld(world);
                          }}
                        >
                          <option value="">请选择...</option>
                          {worlds.map(w => (
                            <option key={w.id} value={w.id}>{w.name}</option>
                          ))}
                        </select>
                      </div>

                      {selectedWorld && (
                        <div className="image-grid">
                          {images.length === 0 ? (
                            <p className="empty-text">此世界观暂无保存的图片</p>
                          ) : (
                            images.map(img => (
                              <div key={img.id} className="image-item">
                                {img.image_url ? (
                                  <img src={img.image_url} alt={img.image_type} />
                                ) : (
                                  <div className="image-placeholder">图片数据</div>
                                )}
                                <div className="image-info">
                                  <span className="image-type">{img.image_type}</span>
                                  <span className="image-date">{formatDate(img.created_at)}</span>
                                </div>
                                <button
                                  className="small-btn delete"
                                  onClick={() => handleDeleteImage(img.id)}
                                >
                                  删除
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DatabaseManager;
