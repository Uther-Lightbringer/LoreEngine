import React from 'react';
import './NarratorMemoryPanel.css';

const NarratorMemoryPanel = ({ memories, scenes, onClose }) => {
  // 按重要程度和时间排序
  const sortedMemories = [...memories].sort((a, b) => {
    // 先按重要程度降序
    if (b.importance !== a.importance) {
      return b.importance - a.importance;
    }
    // 再按时间降序
    return new Date(b.timestamp) - new Date(a.timestamp);
  });

  // 获取场景名称
  const getSceneName = (sceneId) => {
    if (!sceneId) return '';
    const scene = scenes?.find(s => s.id === sceneId);
    return scene?.name || '';
  };

  const getImpactLevelBadge = (level, sceneId) => {
    const config = {
      '无人知晓': { color: '#718096', bg: '#2d3748' },
      '当前场景': { color: '#4299e1', bg: '#1a365d' },
      '世界知晓': { color: '#ed8936', bg: '#744210' }
    };
    const style = config[level] || config['当前场景'];
    const sceneName = getSceneName(sceneId);
    const displayText = level === '当前场景' && sceneName ? `${level} - ${sceneName}` : level;
    return (
      <span
        className="impact-badge"
        style={{ color: style.color, background: style.bg }}
      >
        {displayText}
      </span>
    );
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="narrator-memory-backdrop" onClick={onClose}>
      <div className="narrator-memory-content" onClick={(e) => e.stopPropagation()}>
        <div className="narrator-memory-header">
          <h2>📜 旁白记忆</h2>
          <button className="narrator-memory-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="narrator-memory-body">
          {sortedMemories.length === 0 ? (
            <div className="narrator-memory-empty">
              还没有任何记忆记录
            </div>
          ) : (
            <div className="narrator-memory-list">
              {sortedMemories.map((memory) => (
                <div key={memory.id} className="narrator-memory-item">
                  <div className="narrator-memory-header">
                    <div className="narrator-memory-meta">
                      <span className="importance-indicator" style={{
                        width: `${memory.importance * 10}px`,
                        background: `hsl(${(10 - memory.importance) * 12}, 80%, 50%)`
                      }} />
                      {getImpactLevelBadge(memory.impactLevel, memory.sceneId)}
                      <span className="narrator-memory-time">{formatDate(memory.timestamp)}</span>
                    </div>
                  </div>
                  <div className="narrator-memory-content-text">
                    {memory.content}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="narrator-memory-footer">
          <p className="narrator-memory-hint">
            💡 重要程度从1-10，颜色越红表示越重要
          </p>
        </div>
      </div>
    </div>
  );
};

export default NarratorMemoryPanel;