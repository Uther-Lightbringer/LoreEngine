import React from 'react';
import './SceneMapMini.css';

const SceneMapMini = ({ scenes, currentScene, onSelect, onClose }) => {
  // 计算场景位置（简单的网格布局）
  const getScenePosition = (index, total) => {
    const cols = Math.ceil(Math.sqrt(total));
    const row = Math.floor(index / cols);
    const col = index % cols;
    return {
      left: `${15 + col * 35}%`,
      top: `${15 + row * 35}%`
    };
  };

  return (
    <div className="scene-map-overlay" onClick={onClose}>
      <div className="scene-map-panel" onClick={(e) => e.stopPropagation()}>
        <div className="scene-map-header">
          <span className="scene-map-icon">🗺️</span>
          <span className="scene-map-title">场景地图</span>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="scene-map-content">
          {/* 简易场景连接线 */}
          <svg className="scene-connections">
            {scenes.map((scene, index) => {
              if (index < scenes.length - 1) {
                const pos1 = getScenePosition(index, scenes.length);
                const pos2 = getScenePosition(index + 1, scenes.length);
                return (
                  <line
                    key={index}
                    x1={pos1.left}
                    y1={pos1.top}
                    x2={pos2.left}
                    y2={pos2.top}
                    stroke="rgba(102, 126, 234, 0.3)"
                    strokeWidth="2"
                    strokeDasharray="5,5"
                  />
                );
              }
              return null;
            })}
          </svg>

          {/* 场景节点 */}
          {scenes.map((scene, index) => {
            const pos = getScenePosition(index, scenes.length);
            const isCurrent = currentScene?.id === scene.id;
            return (
              <div
                key={scene.id || index}
                className={`scene-node ${isCurrent ? 'current' : ''}`}
                style={{ left: pos.left, top: pos.top }}
                onClick={() => {
                  onSelect(scene);
                  onClose();
                }}
              >
                <div className="scene-node-icon">📍</div>
                <div className="scene-node-name">{scene.name || `场景 ${index + 1}`}</div>
                {isCurrent && <div className="current-badge">当前</div>}
              </div>
            );
          })}
        </div>
        <div className="scene-map-footer">
          <span className="scene-hint">点击场景名称切换</span>
        </div>
      </div>
    </div>
  );
};

export default SceneMapMini;