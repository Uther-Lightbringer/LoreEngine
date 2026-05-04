import React, { useRef, useState, useEffect, useCallback } from 'react';
import './WorldMapModal.css';

const WorldMapModal = ({ scenes, characters, currentSceneId, onClose, onSceneClick }) => {
  const canvasRef = useRef(null);
  const [scenePositions, setScenePositions] = useState({});
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialOffset, setInitialOffset] = useState({ x: 0, y: 0 });

  // 初始化场景位置
  useEffect(() => {
    const positions = {};
    scenes.forEach((scene, index) => {
      // 优先使用场景数据中存储的地图位置
      if (scene.mapX !== undefined && scene.mapY !== undefined) {
        positions[scene.id] = {
          x: scene.mapX,
          y: scene.mapY,
          width: 200,
          height: 140
        };
      } else {
        // 网格布局作为后备
        const cols = 3;
        const row = Math.floor(index / cols);
        const col = index % cols;
        positions[scene.id] = {
          x: 150 + col * 250,
          y: 150 + row * 200,
          width: 200,
          height: 140
        };
      }
    });
    setScenePositions(positions);
  }, [scenes.map(s => s.id).join(',')]);

  // 计算视图偏移，使当前场景居中
  useEffect(() => {
    if (currentSceneId && scenePositions[currentSceneId] && canvasRef.current) {
      const canvas = canvasRef.current;
      const pos = scenePositions[currentSceneId];
      const centerX = canvas.clientWidth / 2;
      const centerY = canvas.clientHeight / 2;
      setViewOffset({
        x: centerX - (pos.x + pos.width / 2),
        y: centerY - (pos.y + pos.height / 2)
      });
    }
  }, [currentSceneId, scenePositions]);

  // 鼠标/触摸事件处理 - 拖拽画布
  const handleMouseDown = (e) => {
    // 检查是否点击在场景上，如果是则不拖拽画布
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;

    // 转换到场景坐标
    const sceneX = (x - viewOffset.x) / scale;
    const sceneY = (y - viewOffset.y) / scale;

    // 检查是否点击在某个场景上
    let clickedOnScene = false;
    for (const scene of scenes) {
      const pos = scenePositions[scene.id];
      if (pos &&
          sceneX >= pos.x && sceneX <= pos.x + pos.width &&
          sceneY >= pos.y && sceneY <= pos.y + pos.height) {
        clickedOnScene = true;
        break;
      }
    }

    if (!clickedOnScene) {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX || e.touches?.[0]?.clientX, y: e.clientY || e.touches?.[0]?.clientY });
      setInitialOffset({ ...viewOffset });
    }
  };

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;

    const clientX = e.clientX || e.touches?.[0]?.clientX;
    const clientY = e.clientY || e.touches?.[0]?.clientY;

    const deltaX = clientX - dragStart.x;
    const deltaY = clientY - dragStart.y;

    setViewOffset({
      x: initialOffset.x + deltaX,
      y: initialOffset.y + deltaY
    });
  }, [isDragging, dragStart, initialOffset]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleMouseMove, { passive: false });
      window.addEventListener('touchend', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // 获取场景中的角色
  const getSceneCharacters = (scene) => {
    return (scene.npcs || []).map(charId =>
      characters.find(c => c.id === charId)
    ).filter(Boolean);
  };

  // 绘制连接线
  const drawConnections = () => {
    const connections = [];
    scenes.forEach(scene => {
      (scene.connectedScenes || []).forEach(targetId => {
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
          stroke="rgba(102, 126, 234, 0.6)"
          strokeWidth="4"
          strokeLinecap="round"
        />
      );
    });
  };

  // 绘制场景
  const drawScenes = () => {
    return scenes.map(scene => {
      const pos = scenePositions[scene.id];
      if (!pos) return null;

      const isCurrentScene = scene.id === currentSceneId;
      const isConnected = scenes.find(s => s.id === currentSceneId)?.connectedScenes?.includes(scene.id);
      const sceneCharacters = getSceneCharacters(scene);

      return (
        <g key={scene.id}>
          {/* 场景背景 - 使用图片 */}
          {scene.imageUrl ? (
            <image
              href={scene.imageUrl}
              x={pos.x}
              y={pos.y}
              width={pos.width}
              height={pos.height}
              preserveAspectRatio="xMidYMid slice"
              style={{
                filter: isCurrentScene ? 'none' : isConnected ? 'grayscale(30%)' : 'grayscale(60%)',
                opacity: isCurrentScene ? 1 : isConnected ? 0.9 : 0.7,
                cursor: isConnected && !isCurrentScene ? 'pointer' : 'default'
              }}
              onClick={() => {
                if (isConnected && !isCurrentScene && onSceneClick) {
                  onSceneClick(scene);
                }
              }}
            />
          ) : (
            <rect
              x={pos.x}
              y={pos.y}
              width={pos.width}
              height={pos.height}
              fill={isCurrentScene ? '#2d3748' : isConnected ? '#1a202c' : '#0d1117'}
              stroke={isCurrentScene ? '#27ae60' : isConnected ? '#4a5568' : '#2d3748'}
              strokeWidth={isCurrentScene ? 3 : 2}
              rx="12"
              style={{
                cursor: isConnected && !isCurrentScene ? 'pointer' : 'default'
              }}
              onClick={() => {
                if (isConnected && !isCurrentScene && onSceneClick) {
                  onSceneClick(scene);
                }
              }}
            />
          )}

          {/* 场景名称 */}
          <text
            x={pos.x + pos.width / 2}
            y={pos.y + pos.height / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#fff"
            fontSize="14"
            fontWeight="bold"
            style={{
              pointerEvents: 'none',
              textShadow: '0 0 10px rgba(0,0,0,0.8), 0 2px 4px rgba(0,0,0,0.8)'
            }}
          >
            {scene.name}
          </text>

          {/* 当前场景标记 - 📍 放到左下角 */}
          {isCurrentScene && (
            <text
              x={pos.x + 8}
              y={pos.y + pos.height - 8}
              textAnchor="start"
              dominantBaseline="auto"
              fontSize="32"
              style={{
                pointerEvents: 'none',
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))'
              }}
            >
              📍
            </text>
          )}

          {/* 场景中的角色头像 - 放到右下角 */}
          {sceneCharacters.length > 0 && (
            <g>
              {sceneCharacters.slice(0, 2).map((char, index) => (
                <g key={char.id}>
                  {/* 角色头像 */}
                  {char.imageUrl ? (
                    <image
                      href={char.imageUrl}
                      x={pos.x + pos.width - 28 - index * 24}
                      y={pos.y + pos.height - 28}
                      width="24"
                      height="24"
                      preserveAspectRatio="xMidYMid slice"
                      style={{
                        pointerEvents: 'none',
                        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))'
                      }}
                      clipPath={`url(#avatarClip_${scene.id}_${index})`}
                    />
                  ) : (
                    <circle
                      cx={pos.x + pos.width - 16 - index * 24}
                      cy={pos.y + pos.height - 16}
                      r="12"
                      fill="#4a5568"
                      stroke="#2d3748"
                      strokeWidth="2"
                      style={{
                        pointerEvents: 'none'
                      }}
                    />
                  )}
                  {/* 裁剪圆 */}
                  <defs>
                    <clipPath id={`avatarClip_${scene.id}_${index}`}>
                      <circle
                        cx={pos.x + pos.width - 16 - index * 24}
                        cy={pos.y + pos.height - 16}
                        r="12"
                      />
                    </clipPath>
                  </defs>
                  {/* 角色名称（只显示一个角色时） */}
                  {sceneCharacters.length === 1 && (
                    <text
                      x={pos.x + pos.width - 34}
                      y={pos.y + pos.height - 32}
                      textAnchor="end"
                      dominantBaseline="auto"
                      fill="#fff"
                      fontSize="10"
                      fontWeight="bold"
                      style={{
                        pointerEvents: 'none',
                        textShadow: '0 0 4px rgba(0,0,0,0.9), 0 1px 2px rgba(0,0,0,0.9)'
                      }}
                    >
                      {char.name}
                    </text>
                  )}
                </g>
              ))}
              {/* 如果超过2个角色，显示数量 */}
              {sceneCharacters.length > 2 && (
                <text
                  x={pos.x + pos.width - 8}
                  y={pos.y + pos.height - 32}
                  textAnchor="end"
                  dominantBaseline="auto"
                  fill="#fff"
                  fontSize="10"
                  fontWeight="bold"
                  style={{
                    pointerEvents: 'none',
                    textShadow: '0 0 4px rgba(0,0,0,0.9), 0 1px 2px rgba(0,0,0,0.9)'
                  }}
                >
                  +{sceneCharacters.length - 2}
                </text>
              )}
            </g>
          )}
        </g>
      );
    });
  };

  return (
    <div className="world-map-modal-backdrop" onClick={handleBackdropClick}>
      <div className="world-map-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="world-map-header">
          <h2>世界地图</h2>
          <button className="world-map-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div
          className="world-map-body"
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 1000 800`}
            style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' }}
          >
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(102, 126, 234, 0.1)" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />

            <g transform={`translate(${viewOffset.x}, ${viewOffset.y}) scale(${scale})`}>
              {drawConnections()}
              {drawScenes()}
            </g>
          </svg>
        </div>
        <div className="world-map-footer">
          <p className="map-hint">💡 拖拽画布移动视角，点击可前往的场景进行移动</p>
        </div>
      </div>
    </div>
  );
};

export default WorldMapModal;
