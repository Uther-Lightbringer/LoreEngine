import React, { useRef, useState, useEffect, useCallback } from 'react';
import './SceneMapEditor.css';

const SceneMapEditor = ({ scenes, onUpdateScene, onAddScene, onConnectScenes, currentSceneId, onSceneClick }) => {
  const canvasRef = useRef(null);
  const [draggingScene, setDraggingScene] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [connectingFrom, setConnectingFrom] = useState(null);
  const [tempMousePos, setTempMousePos] = useState({ x: 0, y: 0 });
  const [showContextMenu, setShowContextMenu] = useState(null);
  const [scenePositions, setScenePositions] = useState({});

  // 初始化场景位置
  useEffect(() => {
    const positions = {};
    scenes.forEach((scene, index) => {
      if (!scenePositions[scene.id]) {
        // 优先使用场景数据中存储的地图位置
        if (scene.mapX !== undefined && scene.mapY !== undefined) {
          positions[scene.id] = {
            x: scene.mapX,
            y: scene.mapY,
            width: 180,
            height: 120
          };
        } else {
          // 网格布局作为后备
          const cols = 3;
          const row = Math.floor(index / cols);
          const col = index % cols;
          positions[scene.id] = {
            x: 100 + col * 220,
            y: 100 + row * 180,
            width: 180,
            height: 120
          };
        }
      } else {
        positions[scene.id] = scenePositions[scene.id];
      }
    });
    setScenePositions(positions);
  }, [scenes.map(s => s.id).join(',')]);

  const getSceneAtPosition = useCallback((x, y) => {
    for (const scene of scenes) {
      const pos = scenePositions[scene.id];
      if (pos) {
        if (x >= pos.x && x <= pos.x + pos.width &&
            y >= pos.y && y <= pos.y + pos.height) {
          return scene;
        }
      }
    }
    return null;
  }, [scenes, scenePositions]);

  const handleMouseDown = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setShowContextMenu(null);
    setConnectingFrom(null);

    const scene = getSceneAtPosition(x, y);
    if (scene && e.button === 0) {
      // 左键开始拖拽
      const pos = scenePositions[scene.id];
      setDraggingScene(scene.id);
      setDragOffset({ x: x - pos.x, y: y - pos.y });
    } else if (scene && e.button === 2) {
      // 右键开始连接
      setConnectingFrom(scene.id);
      setTempMousePos({ x, y });
    }
  };

  const handleMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setTempMousePos({ x, y });

    if (draggingScene) {
      setScenePositions(prev => ({
        ...prev,
        [draggingScene]: {
          ...prev[draggingScene],
          x: x - dragOffset.x,
          y: y - dragOffset.y
        }
      }));
    }
  };

  const handleMouseUp = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (connectingFrom) {
      const targetScene = getSceneAtPosition(x, y);
      if (targetScene && targetScene.id !== connectingFrom) {
        onConnectScenes(connectingFrom, targetScene.id);
      }
      setConnectingFrom(null);
    }

    setDraggingScene(null);
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const scene = getSceneAtPosition(x, y);
    if (!scene) {
      setShowContextMenu({ x, y });
    }
  };

  const handleAddScene = () => {
    if (showContextMenu) {
      onAddScene({
        x: showContextMenu.x - 90,
        y: showContextMenu.y - 60
      });
      setShowContextMenu(null);
    }
  };

  // 绘制连接线
  const drawConnections = () => {
    const connections = [];
    scenes.forEach(scene => {
      (scene.connectedScenes || []).forEach(targetId => {
        // 避免重复绘制
        if (scene.id < targetId) {
          connections.push({ from: scene.id, to: targetId });
        }
      });
    });

    return connections.map((conn, i) => {
      const fromPos = scenePositions[conn.from];
      const toPos = scenePositions[conn.to];
      if (!fromPos || !toPos) return null;

      const fromX = fromPos.x + fromPos.width / 2;
      const fromY = fromPos.y + fromPos.height / 2;
      const toX = toPos.x + toPos.width / 2;
      const toY = toPos.y + toPos.height / 2;

      return (
        <line
          key={i}
          x1={fromX}
          y1={fromY}
          x2={toX}
          y2={toY}
          stroke="#667eea"
          strokeWidth="3"
          strokeDasharray="8,4"
        />
      );
    });
  };

  // 绘制临时连接线
  const drawTempConnection = () => {
    if (!connectingFrom) return null;
    const fromPos = scenePositions[connectingFrom];
    if (!fromPos) return null;

    const fromX = fromPos.x + fromPos.width / 2;
    const fromY = fromPos.y + fromPos.height / 2;

    return (
      <line
        x1={fromX}
        y1={fromY}
        x2={tempMousePos.x}
        y2={tempMousePos.y}
        stroke="#e94560"
        strokeWidth="2"
        strokeDasharray="5,5"
      />
    );
  };

  return (
    <div className="scene-map-editor">
      <div
        ref={canvasRef}
        className="map-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={handleContextMenu}
        onMouseLeave={() => {
          setDraggingScene(null);
          setConnectingFrom(null);
        }}
      >
        <svg className="connection-layer">
          {drawConnections()}
          {drawTempConnection()}
        </svg>

        {scenes.map(scene => {
          const pos = scenePositions[scene.id];
          if (!pos) return null;

          const isCurrentScene = scene.id === currentSceneId;
          const isDragging = draggingScene === scene.id;
          const isConnecting = connectingFrom === scene.id;

          return (
            <div
              key={scene.id}
              className={`scene-node ${isCurrentScene ? 'current' : ''} ${isDragging ? 'dragging' : ''} ${isConnecting ? 'connecting' : ''}`}
              style={{
                left: pos.x,
                top: pos.y,
                width: pos.width,
                height: pos.height
              }}
              onClick={(e) => {
                if (!isDragging && !isConnecting && onSceneClick) {
                  e.stopPropagation();
                  onSceneClick(scene);
                }
              }}
            >
              {scene.imageUrl ? (
                <>
                  <div
                    className="scene-node-image-full"
                    style={{ backgroundImage: `url(${scene.imageUrl})` }}
                  />
                  <div className="scene-node-title-overlay">
                    {scene.name}
                  </div>
                </>
              ) : (
                <div className="scene-node-content">
                  <h4 className="scene-node-title">{scene.name}</h4>
                </div>
              )}
              {isCurrentScene && (
                <div className="current-marker">📍</div>
              )}
            </div>
          );
        })}
      </div>

      {showContextMenu && (
        <div
          className="context-menu"
          style={{
            left: showContextMenu.x,
            top: showContextMenu.y
          }}
        >
          <div className="context-menu-item" onClick={handleAddScene}>
            ➕ 添加新场景
          </div>
          <div className="context-menu-item" onClick={() => setShowContextMenu(null)}>
            取消
          </div>
        </div>
      )}

      <div className="map-help">
        <p>💡 提示：左键拖拽移动场景，右键场景并拖动到另一个场景来建立连接</p>
      </div>
    </div>
  );
};

export default SceneMapEditor;
