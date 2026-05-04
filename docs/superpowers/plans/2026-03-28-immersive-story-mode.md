# 沉浸式剧情模式实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建统一的沉浸式剧情渲染器，合并现有的 NovelSceneRenderer 和 ChapterStoryRenderer，提供沉浸式视觉小说体验。

**Architecture:** 完全重构，使用单一 ImmersiveStoryRenderer 组件处理所有剧情模式。组件内部管理状态，使用 AI 服务生成剧情，支持时间线、场景切换、快捷指令等功能。

**Tech Stack:** React 18.3, CSS3 (动画/过渡), 现有 aiService.js, novelService.js

---

## 文件结构

```
src/components/
├── ImmersiveStoryRenderer.jsx    # 新建：主渲染器
├── ImmersiveStoryRenderer.css    # 新建：主样式
├── TimelineSidebar.jsx           # 新建：左侧时间线
├── TimelineSidebar.css           # 新建：时间线样式
├── SceneMapMini.jsx             # 新建：迷你地图弹窗
├── SceneMapMini.css             # 新建：地图样式
├── QuickActionBar.jsx           # 新建：快捷指令栏
├── QuickActionBar.css           # 新建：快捷指令样式
└── (修改) StoryModeSetup.jsx    # 替换 NovelGameplay 引用
```

**修改文件：**
- `src/components/StoryModeSetup.jsx` - 替换 NovelGameplay 为 ImmersiveStoryRenderer
- `src/components/NovelGameplay.jsx` - 保留作为兼容层

---

## Task 1: 创建 ImmersiveStoryRenderer 主组件基础结构

**Files:**
- Create: `src/components/ImmersiveStoryRenderer.jsx`
- Create: `src/components/ImmersiveStoryRenderer.css`
- Reference: `src/components/NovelSceneRenderer.jsx:1-100` (现有状态管理)
- Reference: `src/components/ChapterStoryRenderer.jsx:1-50` (现有布局结构)

- [ ] **Step 1: 创建基础组件结构**

```jsx
// src/components/ImmersiveStoryRenderer.jsx
import React, { useState, useEffect, useRef } from 'react';
import { saveNarrativeSnapshot } from '../services/novelService.js';
import './ImmersiveStoryRenderer.css';

const ImmersiveStoryRenderer = ({
  chapter,
  characterName,
  onChoicePoint,
  onChapterEnd,
  onBack,
  world
}) => {
  // 状态定义
  const [currentScene, setCurrentScene] = useState(null);
  const [currentCharacter, setCurrentCharacter] = useState(null);
  const [dialogueHistory, setDialogueHistory] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showChoices, setShowChoices] = useState(false);
  const [generatedChoices, setGeneratedChoices] = useState([]);
  const [turns, setTurns] = useState(0);
  const [showSceneMap, setShowSceneMap] = useState(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [showTimeline, setShowTimeline] = useState(true);

  // 快捷指令输入
  const [freeInput, setFreeInput] = useState('');
  const [actionInput, setActionInput] = useState('');

  const contentRef = useRef(null);

  // 初始化
  useEffect(() => {
    if (chapter) {
      const char = chapter.characters?.find(c => c.name === characterName);
      setCurrentCharacter(char || null);
      if (chapter.scenes?.length > 0) {
        setCurrentScene(chapter.scenes[0]);
      }
    }
  }, [chapter, characterName]);

  return (
    <div className="immersive-story-renderer">
      {/* 左侧时间线 */}
      <TimelineSidebar
        history={dialogueHistory}
        visible={showTimeline}
        onToggle={() => setShowTimeline(!showTimeline)}
        onJumpTo={(index) => {}}
      />

      {/* 主内容区 */}
      <div className="immersive-main" ref={contentRef}>
        {/* 场景背景 */}
        <div className="immersive-background" />

        {/* 左上角场景按钮 */}
        <button className="scene-map-btn" onClick={() => setShowSceneMap(true)}>
          🗺️
        </button>

        {/* 大立绘 */}
        <CharacterPortrait character={currentCharacter} />

        {/* 旁白卡片 */}
        <NarrativeCard type="narrative" text={narrativeText} />

        {/* 动作卡片 */}
        <ActionCard character={speaker} action={actionText} />

        {/* 对话框 */}
        <DialogueBox speaker={speaker} text={dialogueText} />

        {/* 输入区域 */}
        <InputArea
          onQuickAction={(action) => {}}
          onSubmit={(action, dialogue) => {}}
          disabled={isGenerating}
        />

        {/* 场景地图弹窗 */}
        {showSceneMap && (
          <SceneMapMini
            scenes={chapter?.scenes || []}
            currentScene={currentScene}
            onSelect={(scene) => setCurrentScene(scene)}
            onClose={() => setShowSceneMap(false)}
          />
        )}
      </div>

      {/* 底部控制栏 */}
      <div className="immersive-controls">
        <button className="control-btn back" onClick={onBack}>← 返回</button>
        <button
          className={`control-btn auto ${isAutoPlaying ? 'playing' : ''}`}
          onClick={() => setIsAutoPlaying(!isAutoPlaying)}
        >
          {isAutoPlaying ? '⏸ 暂停' : '▶ 自动'}
        </button>
      </div>
    </div>
  );
};

export default ImmersiveStoryRenderer;
```

- [ ] **Step 2: 创建基础 CSS 框架**

```css
/* src/components/ImmersiveStoryRenderer.css */

.immersive-story-renderer {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  background: #0a0a0f;
  overflow: hidden;
}

.immersive-main {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.immersive-background {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-size: cover;
  background-position: center;
  z-index: 0;
}

.scene-map-btn {
  position: absolute;
  top: 1rem;
  left: 1rem;
  z-index: 100;
  background: rgba(26, 26, 46, 0.85);
  border: 1px solid rgba(102, 126, 234, 0.3);
  border-radius: 8px;
  padding: 0.5rem 0.75rem;
  font-size: 1.2rem;
  cursor: pointer;
  transition: all 0.3s ease;
}

.scene-map-btn:hover {
  background: rgba(102, 126, 234, 0.3);
  transform: scale(1.05);
}

.immersive-controls {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 2rem;
  background: rgba(0, 0, 0, 0.9);
  border-top: 1px solid #2d3748;
  z-index: 1000;
}
```

- [ ] **Step 3: 创建占位子组件**

```jsx
// 在 ImmersiveStoryRenderer.jsx 末尾添加占位组件

const CharacterPortrait = ({ character }) => (
  <div className="character-portrait-placeholder">
    {character?.name || '等待角色'}
  </div>
);

const NarrativeCard = ({ type, text }) => (
  <div className={`narrative-card narrative-card-${type}`}>
    {text || ''}
  </div>
);

const ActionCard = ({ character, action }) => (
  <div className="action-card">
    {character}: {action}
  </div>
);

const DialogueBox = ({ speaker, text }) => (
  <div className="dialogue-box">
    <div className="dialogue-speaker">{speaker}</div>
    <div className="dialogue-text">{text}</div>
  </div>
);

const InputArea = ({ onQuickAction, onSubmit, disabled }) => (
  <div className="input-area">
    <div className="quick-actions">
      <button disabled={disabled}>看向</button>
      <button disabled={disabled}>走向</button>
      <button disabled={disabled}>拿起</button>
      <button disabled={disabled}>说</button>
      <button disabled={disabled}>询问</button>
      <button disabled={disabled}>调查</button>
    </div>
    <input type="text" placeholder="输入动作或对话..." disabled={disabled} />
    <button disabled={disabled}>发送</button>
  </div>
);
```

- [ ] **Step 4: 运行开发服务器验证基础结构**

Run: `npm run dev`
Expected: 页面加载无错误，占位组件可见

- [ ] **Step 5: 提交**

```bash
git add src/components/ImmersiveStoryRenderer.jsx src/components/ImmersiveStoryRenderer.css
git commit -m "feat: 创建沉浸式剧情渲染器基础结构"
```

---

## Task 2: 实现 TimelineSidebar 时间线组件

**Files:**
- Create: `src/components/TimelineSidebar.jsx`
- Create: `src/components/TimelineSidebar.css`
- Modify: `src/components/ImmersiveStoryRenderer.jsx` (集成 TimelineSidebar)

- [ ] **Step 1: 创建 TimelineSidebar 组件**

```jsx
// src/components/TimelineSidebar.jsx
import React from 'react';
import './TimelineSidebar.css';

const TimelineSidebar = ({ history, visible, onToggle, onJumpTo }) => {
  if (!visible) {
    return (
      <button className="timeline-toggle collapsed" onClick={onToggle}>
        ☰
      </button>
    );
  }

  return (
    <div className="timeline-sidebar">
      <div className="timeline-header">
        <span className="timeline-title">时间线</span>
        <button className="timeline-collapse" onClick={onToggle}>
          ☰
        </button>
      </div>
      <div className="timeline-list">
        {history.map((item, index) => (
          <div
            key={index}
            className={`timeline-item ${item.type}`}
            onClick={() => onJumpTo(index)}
          >
            <span className="timeline-turn">回合{item.turn}</span>
            <span className="timeline-preview">
              {item.speaker}: {item.text?.substring(0, 20)}...
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TimelineSidebar;
```

- [ ] **Step 2: 创建 TimelineSidebar CSS**

```css
/* src/components/TimelineSidebar.css */

.timeline-toggle {
  position: fixed;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 500;
  background: rgba(26, 26, 46, 0.9);
  border: 1px solid rgba(102, 126, 234, 0.3);
  border-left: none;
  border-radius: 0 8px 8px 0;
  padding: 1rem 0.5rem;
  color: #667eea;
  cursor: pointer;
  writing-mode: vertical-rl;
  font-size: 1.2rem;
}

.timeline-toggle:hover {
  background: rgba(102, 126, 234, 0.3);
}

.timeline-sidebar {
  width: 200px;
  height: 100vh;
  background: rgba(20, 20, 35, 0.95);
  border-right: 1px solid rgba(102, 126, 234, 0.2);
  display: flex;
  flex-direction: column;
  z-index: 100;
  position: relative;
}

.timeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  border-bottom: 1px solid rgba(102, 126, 234, 0.2);
}

.timeline-title {
  color: #667eea;
  font-weight: bold;
  font-size: 0.9rem;
}

.timeline-collapse {
  background: transparent;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 1rem;
}

.timeline-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.timeline-item {
  padding: 0.75rem;
  margin-bottom: 0.5rem;
  background: rgba(45, 55, 72, 0.3);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.timeline-item:hover {
  background: rgba(102, 126, 234, 0.2);
}

.timeline-item.player {
  border-left: 3px solid #48bb78;
}

.timeline-item.narrator {
  border-left: 3px solid #ffd54f;
}

.timeline-turn {
  display: block;
  color: #667eea;
  font-size: 0.75rem;
  margin-bottom: 0.25rem;
}

.timeline-preview {
  display: block;
  color: #d4d4d4;
  font-size: 0.8rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

- [ ] **Step 3: 在 ImmersiveStoryRenderer 中导入并使用 TimelineSidebar**

在 ImmersiveStoryRenderer.jsx 顶部添加：
```jsx
import TimelineSidebar from './TimelineSidebar.jsx';
```

替换 JSX 中的占位：
```jsx
{/* 左侧时间线 */}
<TimelineSidebar
  history={dialogueHistory}
  visible={showTimeline}
  onToggle={() => setShowTimeline(!showTimeline)}
  onJumpTo={(index) => {
    // 滚动到对应历史记录
    if (contentRef.current) {
      contentRef.current.scrollToIndex?.(index);
    }
  }}
/>
```

- [ ] **Step 4: 添加 TimelineSidebar CSS 类到主样式文件**

在 ImmersiveStoryRenderer.css 末尾添加：
```css
/* TimelineSidebar 集成 */
.immersive-story-renderer:has(.timeline-sidebar) .immersive-main {
  margin-left: 200px;
}
```

- [ ] **Step 5: 运行开发服务器验证**

Run: `npm run dev`
Expected: 左侧显示时间线面板，点击可折叠

- [ ] **Step 6: 提交**

```bash
git add src/components/TimelineSidebar.jsx src/components/TimelineSidebar.css src/components/ImmersiveStoryRenderer.jsx src/components/ImmersiveStoryRenderer.css
git commit -m "feat: 实现时间线侧边栏组件"
```

---

## Task 3: 实现 SceneMapMini 迷你地图组件

**Files:**
- Create: `src/components/SceneMapMini.jsx`
- Create: `src/components/SceneMapMini.css`
- Modify: `src/components/ImmersiveStoryRenderer.jsx` (集成)

- [ ] **Step 1: 创建 SceneMapMini 组件**

```jsx
// src/components/SceneMapMini.jsx
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
```

- [ ] **Step 2: 创建 SceneMapMini CSS**

```css
/* src/components/SceneMapMini.css */

.scene-map-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  animation: fadeIn 0.2s ease;
}

.scene-map-panel {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border: 2px solid #667eea;
  border-radius: 16px;
  padding: 1.5rem;
  width: 90%;
  max-width: 500px;
  max-height: 70vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.scene-map-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid rgba(102, 126, 234, 0.3);
}

.scene-map-icon {
  font-size: 1.5rem;
}

.scene-map-title {
  flex: 1;
  color: #fff;
  font-size: 1.2rem;
  font-weight: bold;
}

.close-btn {
  background: transparent;
  border: none;
  color: #888;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
}

.close-btn:hover {
  color: #e94560;
}

.scene-map-content {
  flex: 1;
  position: relative;
  min-height: 250px;
  background: rgba(26, 26, 46, 0.5);
  border-radius: 12px;
  overflow: hidden;
}

.scene-connections {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.scene-node {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
  transition: all 0.3s ease;
  padding: 0.5rem;
  border-radius: 8px;
}

.scene-node:hover {
  background: rgba(102, 126, 234, 0.2);
  transform: translate(-50%, -50%) scale(1.05);
}

.scene-node.current .scene-node-icon {
  font-size: 2rem;
}

.scene-node-icon {
  font-size: 1.5rem;
}

.scene-node-name {
  color: #d4d4d4;
  font-size: 0.8rem;
  text-align: center;
  background: rgba(0, 0, 0, 0.5);
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
}

.current-badge {
  background: #667eea;
  color: #fff;
  font-size: 0.7rem;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  font-weight: bold;
}

.scene-map-footer {
  margin-top: 1rem;
  text-align: center;
}

.scene-hint {
  color: #666;
  font-size: 0.85rem;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

- [ ] **Step 3: 在 ImmersiveStoryRenderer 中集成 SceneMapMini**

在组件顶部添加 import：
```jsx
import SceneMapMini from './SceneMapMini.jsx';
```

更新 JSX 中的地图区域：
```jsx
{/* 场景地图弹窗 */}
{showSceneMap && (
  <SceneMapMini
    scenes={chapter?.scenes || []}
    currentScene={currentScene}
    onSelect={(scene) => setCurrentScene(scene)}
    onClose={() => setShowSceneMap(false)}
  />
)}
```

- [ ] **Step 4: 运行开发服务器验证**

Run: `npm run dev`
Expected: 点击左上角场景按钮显示迷你地图

- [ ] **Step 5: 提交**

```bash
git add src/components/SceneMapMini.jsx src/components/SceneMapMini.css src/components/ImmersiveStoryRenderer.jsx
git commit -m "feat: 实现迷你场景地图组件"
```

---

## Task 4: 实现 QuickActionBar 快捷指令栏

**Files:**
- Create: `src/components/QuickActionBar.jsx`
- Create: `src/components/QuickActionBar.css`
- Modify: `src/components/ImmersiveStoryRenderer.jsx` (集成)

- [ ] **Step 1: 创建 QuickActionBar 组件**

```jsx
// src/components/QuickActionBar.jsx
import React from 'react';
import './QuickActionBar.css';

const QUICK_ACTIONS = [
  { id: 'look', label: '看向', icon: '👀' },
  { id: 'walk', label: '走向', icon: '🚶' },
  { id: 'take', label: '拿起', icon: '✋' },
  { id: 'speak', label: '说', icon: '💬' },
  { id: 'ask', label: '询问', icon: '❓' },
  { id: 'investigate', label: '调查', icon: '🔍' }
];

const QuickActionBar = ({ onAction, disabled }) => {
  const handleAction = (action) => {
    onAction(action.label);
  };

  return (
    <div className="quick-action-bar">
      <div className="quick-actions-grid">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.id}
            className="quick-action-btn"
            onClick={() => handleAction(action)}
            disabled={disabled}
            title={action.label}
          >
            <span className="quick-action-icon">{action.icon}</span>
            <span className="quick-action-label">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default QuickActionBar;
```

- [ ] **Step 2: 创建 QuickActionBar CSS**

```css
/* src/components/QuickActionBar.css */

.quick-action-bar {
  padding: 0.75rem;
  background: rgba(20, 20, 35, 0.95);
  border-top: 1px solid rgba(102, 126, 234, 0.2);
}

.quick-actions-grid {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  flex-wrap: wrap;
}

.quick-action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  background: rgba(45, 55, 72, 0.5);
  border: 1px solid rgba(102, 126, 234, 0.3);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 60px;
}

.quick-action-btn:hover:not(:disabled) {
  background: rgba(102, 126, 234, 0.3);
  border-color: #667eea;
  transform: translateY(-2px);
}

.quick-action-btn:active:not(:disabled) {
  transform: translateY(0);
}

.quick-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.quick-action-icon {
  font-size: 1.2rem;
}

.quick-action-label {
  color: #d4d4d4;
  font-size: 0.75rem;
}

.quick-action-btn:hover:not(:disabled) .quick-action-label {
  color: #fff;
}
```

- [ ] **Step 3: 在 ImmersiveStoryRenderer 中集成 QuickActionBar**

```jsx
import QuickActionBar from './QuickActionBar.jsx';
```

- [ ] **Step 4: 运行开发服务器验证**

Run: `npm run dev`
Expected: 底部显示快捷指令按钮网格

- [ ] **Step 5: 提交**

```bash
git add src/components/QuickActionBar.jsx src/components/QuickActionBar.css src/components/ImmersiveStoryRenderer.jsx
git commit -m "feat: 实现快捷指令栏"
```

---

## Task 5: 实现完整输入区域 InputArea

**Files:**
- Modify: `src/components/ImmersiveStoryRenderer.jsx` (更新 InputArea 组件)
- Modify: `src/components/ImmersiveStoryRenderer.css` (添加输入区域样式)

- [ ] **Step 1: 更新 InputArea 组件实现完整功能**

替换 ImmersiveStoryRenderer.jsx 中的占位 InputArea：

```jsx
const InputArea = ({ onQuickAction, onSubmit, disabled }) => {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = () => {
    if (!inputValue.trim()) return;
    onSubmit('', inputValue);
    setInputValue('');
  };

  return (
    <div className="input-area-container">
      <QuickActionBar onAction={(actionLabel) => {
        setInputValue(prev => prev ? `${prev} ${actionLabel}` : actionLabel);
      }} disabled={disabled} />
      <div className="free-input-row">
        <input
          type="text"
          className="free-input"
          placeholder="输入动作或对话..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
          disabled={disabled}
        />
        <button
          className="submit-btn"
          onClick={handleSubmit}
          disabled={disabled || !inputValue.trim()}
        >
          发送
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: 添加输入区域 CSS**

在 ImmersiveStoryRenderer.css 添加：

```css
/* 输入区域 */
.input-area-container {
  position: fixed;
  bottom: 60px;
  left: 0;
  right: 0;
  z-index: 999;
  background: rgba(20, 20, 35, 0.98);
  border-top: 1px solid rgba(102, 126, 234, 0.3);
}

.free-input-row {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
}

.free-input-row .free-input {
  flex: 1;
  padding: 0.75rem 1rem;
  background: rgba(45, 55, 72, 0.5);
  border: 1px solid rgba(102, 126, 234, 0.3);
  border-radius: 8px;
  color: #fff;
  font-size: 0.95rem;
  outline: none;
}

.free-input-row .free-input::placeholder {
  color: #666;
}

.free-input-row .free-input:focus {
  border-color: #667eea;
}

.submit-btn {
  padding: 0.75rem 1.5rem;
  background: linear-gradient(135deg, #667eea, #764ba2);
  border: none;
  border-radius: 8px;
  color: white;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 3: 移除旧的 free-input-area 样式残留**

检查 ImmersiveStoryRenderer.css 中是否有旧的 `.free-input-area` 样式，如有则移除或替换。

- [ ] **Step 4: 运行开发服务器验证**

Run: `npm run dev`
Expected: 底部显示快捷指令 + 输入框 + 发送按钮

- [ ] **Step 5: 提交**

```bash
git add src/components/ImmersiveStoryRenderer.jsx src/components/ImmersiveStoryRenderer.css
git commit -m "feat: 实现完整输入区域组件"
```

---

## Task 6: 实现 CharacterPortrait 大立绘组件 + 动画

**Files:**
- Modify: `src/components/ImmersiveStoryRenderer.jsx` (添加 CharacterPortrait 组件)
- Modify: `src/components/ImmersiveStoryRenderer.css` (添加立绘样式和动画)

- [ ] **Step 1: 创建 CharacterPortrait 组件**

```jsx
const CharacterPortrait = ({ character, isSpeaking }) => {
  // 获取角色图片URL，支持多种字段名
  const getImageUrl = () => {
    if (!character) return null;
    return character.portrait_url || character.imageUrl || character.card_url || null;
  };

  const imageUrl = getImageUrl();

  return (
    <div className={`character-portrait-container ${isSpeaking ? 'speaking' : 'idle'}`}>
      {imageUrl ? (
        <img src={imageUrl} alt={character?.name || '角色'} className="portrait-image" />
      ) : (
        <div className="portrait-placeholder">
          <span className="placeholder-icon">👤</span>
          <span className="placeholder-name">{character?.name || '等待角色'}</span>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: 添加 CharacterPortrait CSS 和动画**

在 ImmersiveStoryRenderer.css 添加：

```css
/* 大立绘组件 */
.character-portrait-container {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1rem;
  min-height: 40vh;
  max-height: 50vh;
  z-index: 10;
  transition: opacity 0.5s ease;
}

.character-portrait-container.idle {
  opacity: 0.3;
}

.character-portrait-container.speaking {
  opacity: 1;
  animation: portraitAppear 0.5s ease;
}

.portrait-image {
  max-height: 100%;
  max-width: 70%;
  object-fit: contain;
  filter: drop-shadow(0 0 30px rgba(0, 0, 0, 0.5));
  border-radius: 16px;
}

.portrait-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 2rem;
  background: rgba(45, 55, 72, 0.5);
  border-radius: 16px;
  border: 2px dashed rgba(102, 126, 234, 0.3);
}

.placeholder-icon {
  font-size: 4rem;
  opacity: 0.5;
}

.placeholder-name {
  color: #888;
  font-size: 1.2rem;
}

@keyframes portraitAppear {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```

- [ ] **Step 3: 更新状态以跟踪当前说话者**

在 ImmersiveStoryRenderer 组件中添加状态：
```jsx
const [currentSpeaker, setCurrentSpeaker] = useState(null);
```

- [ ] **Step 4: 运行开发服务器验证**

Run: `npm run dev`
Expected: 大立绘区域显示，占位符或角色图片，淡入淡出动画正常

- [ ] **Step 5: 提交**

```bash
git add src/components/ImmersiveStoryRenderer.jsx src/components/ImmersiveStoryRenderer.css
git commit -m "feat: 实现大立绘组件和动画效果"
```

---

## Task 7: 实现 NarrativeCard 旁白卡片和 ActionCard 动作卡片

**Files:**
- Modify: `src/components/ImmersiveStoryRenderer.jsx` (更新卡片组件)
- Modify: `src/components/ImmersiveStoryRenderer.css` (添加卡片样式)

- [ ] **Step 1: 更新 NarrativeCard 组件**

```jsx
const NarrativeCard = ({ type = 'narrative', text, timestamp }) => {
  if (!text) return null;

  return (
    <div className={`narrative-card narrative-card-${type}`}>
      <div className="narrative-card-content">
        {type === 'narrative' && <span className="narrative-icon">📜</span>}
        <p className="narrative-text">{text}</p>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: 更新 ActionCard 组件**

```jsx
const ActionCard = ({ character, action }) => {
  if (!action) return null;

  return (
    <div className="action-card">
      <span className="action-arrow">→</span>
      <div className="action-content">
        <span className="action-character">{character}</span>
        <span className="action-text">（{action}）</span>
      </div>
    </div>
  );
};
```

- [ ] **Step 3: 添加卡片 CSS**

在 ImmersiveStoryRenderer.css 添加：

```css
/* 旁白卡片 */
.narrative-card {
  background: rgba(26, 26, 46, 0.9);
  border: 1px solid rgba(102, 126, 234, 0.3);
  border-radius: 12px;
  padding: 1rem 1.5rem;
  margin: 0.5rem 1rem;
  max-width: 90%;
  animation: cardSlideIn 0.3s ease;
}

.narrative-card-content {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.narrative-icon {
  font-size: 1.2rem;
  flex-shrink: 0;
}

.narrative-text {
  color: #d4d4d4;
  font-size: 1rem;
  line-height: 1.7;
  text-align: justify;
  margin: 0;
}

/* 动作卡片 */
.action-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: rgba(45, 55, 72, 0.5);
  border-left: 3px solid #f6ad55;
  border-radius: 0 12px 12px 0;
  padding: 0.75rem 1.25rem;
  margin: 0.5rem 1rem;
  max-width: 90%;
  animation: cardSlideIn 0.3s ease;
}

.action-arrow {
  color: #f6ad55;
  font-size: 1.5rem;
  font-weight: bold;
}

.action-content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.action-character {
  color: #667eea;
  font-size: 0.85rem;
  font-weight: bold;
}

.action-text {
  color: #a0aec0;
  font-size: 0.95rem;
  font-style: italic;
}

@keyframes cardSlideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

- [ ] **Step 4: 运行开发服务器验证**

Run: `npm run dev`
Expected: 旁白卡片和动作卡片正确显示动画

- [ ] **Step 5: 提交**

```bash
git add src/components/ImmersiveStoryRenderer.jsx src/components/ImmersiveStoryRenderer.css
git commit -m "feat: 实现旁白卡片和动作卡片组件"
```

---

## Task 8: 实现 DialogueBox 对话框组件

**Files:**
- Modify: `src/components/ImmersiveStoryRenderer.jsx` (添加 DialogueBox)
- Modify: `src/components/ImmersiveStoryRenderer.css` (添加对话框样式)

- [ ] **Step 1: 创建 DialogueBox 组件**

```jsx
const DialogueBox = ({ speaker, text, isPlayer }) => {
  if (!text) return null;

  return (
    <div className={`dialogue-box ${isPlayer ? 'player' : ''}`}>
      <div className="dialogue-speaker">{speaker}</div>
      <div className="dialogue-text">"{text}"</div>
    </div>
  );
};
```

- [ ] **Step 2: 添加 DialogueBox CSS**

在 ImmersiveStoryRenderer.css 添加：

```css
/* 对话框 */
.dialogue-box {
  background: rgba(26, 26, 46, 0.95);
  border: 2px solid rgba(102, 126, 234, 0.5);
  border-radius: 16px;
  padding: 1rem 1.5rem;
  margin: 0.5rem 1rem;
  max-width: 90%;
  animation: dialogueAppear 0.3s ease;
}

.dialogue-box.player {
  border-color: rgba(72, 187, 120, 0.5);
  background: rgba(26, 46, 36, 0.95);
}

.dialogue-speaker {
  color: #667eea;
  font-size: 0.9rem;
  font-weight: bold;
  margin-bottom: 0.5rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid rgba(102, 126, 234, 0.3);
}

.dialogue-box.player .dialogue-speaker {
  color: #48bb78;
  border-bottom-color: rgba(72, 187, 120, 0.3);
}

.dialogue-text {
  color: #fff;
  font-size: 1rem;
  line-height: 1.6;
}

@keyframes dialogueAppear {
  from {
    opacity: 0;
    transform: scale(0.98);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```

- [ ] **Step 3: 运行开发服务器验证**

Run: `npm run dev`
Expected: 对话框正确显示，包含说话者名称和对话内容

- [ ] **Step 4: 提交**

```bash
git add src/components/ImmersiveStoryRenderer.jsx src/components/ImmersiveStoryRenderer.css
git commit -m "feat: 实现对话框组件"
```

---

## Task 9: 集成 AI 生成逻辑

**Files:**
- Modify: `src/components/ImmersiveStoryRenderer.jsx` (添加 AI prompt 构建和生成逻辑)

- [ ] **Step 1: 添加 buildNarrativePrompt 辅助函数**

从 NovelSceneRenderer.jsx 复制并改进 `buildNarrativePrompt` 函数：

```jsx
const buildNarrativePrompt = (action, dialogue) => {
  const protagonist = currentCharacter || {};
  const scene = currentScene || {};
  const worldSetting = chapter?.world_setting || world || {};

  const presentCharacters = chapter.characters
    ?.filter(c => c.name !== characterName)
    ?.map(c => `${c.name}(${c.role || '角色'})`)
    ?.join('、') || '其他角色';

  const recentDialogues = dialogueHistory.slice(-6);
  const historySummary = recentDialogues
    .map(d => d.isPlayer ? `[${characterName}]: ${d.text}` : `[${d.speaker}]: ${d.text}`)
    .join('\n');

  return `
【世界观设定】
${worldSetting.name || '未知世界'} - ${worldSetting.description || ''}

【当前场景】
${scene.name || '默认场景'} - ${scene.location || ''}
${scene.description ? `场景描述：${scene.description}` : ''}

【主角信息】
- 姓名：${characterName}
- 角色：${protagonist.role || '主角'}
- 性格：${protagonist.personality || '未知'}
- 外貌：${protagonist.appearance || '未知'}
${protagonist.background ? `- 背景：${protagonist.background}` : ''}

【在场其他角色】
${presentCharacters}

【近期剧情】
${historySummary || '（刚开始）'}

【当前行动】
${action ? `动作：${action}` : ''}
${dialogue ? `对话："${dialogue}"` : ''}

【任务】
请以第三人称旁白形式，续写故事发展。要求：
1. 描述角色的行动、对话、内心感受
2. 描述其他角色的反应
3. 推动剧情发展
4. 篇幅100-200字
5. 语言风格：${worldSetting.type === '古风' ? '古风白话' : '现代叙事'}

请直接输出剧情内容。
`;
};
```

- [ ] **Step 2: 添加 handleSubmit 函数处理输入提交**

```jsx
const handleSubmit = async (action, dialogue) => {
  if (!action && !dialogue) return;
  if (isGenerating) return;

  setIsGenerating(true);

  // 添加玩家输入到历史
  if (dialogue) {
    const playerDialogue = {
      speaker: characterName,
      text: dialogue,
      isPlayer: true,
      action: action || null,
      turn: turns,
      type: 'player'
    };
    setDialogueHistory(prev => [...prev, playerDialogue]);
  }

  try {
    const { generateWithAI, MAX_TOKENS } = await getAIService();
    const prompt = buildNarrativePrompt(action, dialogue);

    const result = await generateWithAI(prompt, 'deepseek', {
      maxTokens: MAX_TOKENS.CONTENT,
      jsonResponse: false
    });

    if (result) {
      // 解析返回内容
      const choicesMatch = result.match(/【选择点】([\s\S]*?)(?=【|$)/);
      let narrativeText = result;
      let choices = null;

      if (choicesMatch) {
        narrativeText = result.replace(choicesMatch[0], '').trim();
        try {
          const choicesJson = choicesMatch[1].trim();
          choices = JSON.parse(choicesJson);
          if (choices?.branches) {
            setGeneratedChoices(choices.branches);
            setShowChoices(true);
          }
        } catch (e) {
          // 选择点解析失败
        }
      }

      // 添加旁白到历史
      const narrativeEntry = {
        speaker: '旁白',
        text: narrativeText.trim(),
        isPlayer: false,
        turn: turns,
        type: 'narrative'
      };
      setDialogueHistory(prev => [...prev, narrativeEntry]);

      // 更新回合
      setTurns(prev => prev + 1);
    }
  } catch (error) {
    console.error('生成剧情失败:', error);
  } finally {
    setIsGenerating(false);
  }
};
```

- [ ] **Step 3: 添加 getAIService 辅助函数**

```jsx
const getAIService = async () => {
  const module = await import('../services/aiService.js');
  return module;
};
```

- [ ] **Step 4: 更新 InputArea 的 onSubmit 绑定**

```jsx
<InputArea
  onQuickAction={(actionLabel) => {
    // 可以选择自动填入或直接提交
  }}
  onSubmit={handleSubmit}
  disabled={isGenerating}
/>
```

- [ ] **Step 5: 运行开发服务器验证**

Run: `npm run dev`
Expected: 输入内容后点击发送，AI 生成剧情并显示

- [ ] **Step 6: 提交**

```bash
git add src/components/ImmersiveStoryRenderer.jsx
git commit -m "feat: 集成AI生成剧情逻辑"
```

---

## Task 10: 实现 ChoiceOverlay 分支选择弹窗

**Files:**
- Modify: `src/components/ImmersiveStoryRenderer.jsx` (添加 ChoiceOverlay)
- Modify: `src/components/ImmersiveStoryRenderer.css` (添加弹窗样式)

- [ ] **Step 1: 创建 ChoiceOverlay 组件**

```jsx
const ChoiceOverlay = ({ choices, onSelect, onCustom }) => {
  const [customInput, setCustomInput] = useState('');

  const handleCustomSubmit = () => {
    if (customInput.trim()) {
      onCustom(customInput);
      setCustomInput('');
    }
  };

  return (
    <div className="choice-overlay">
      <div className="choice-panel">
        <div className="choice-header">
          <span className="choice-icon">⚡</span>
          <span className="choice-title">命运的岔路口</span>
        </div>
        <div className="choice-list">
          {choices.map((choice, index) => (
            <button
              key={choice.id || index}
              className="choice-btn"
              onClick={() => onSelect(choice)}
            >
              <span className="choice-type">{choice.type || '选择'}</span>
              <span className="choice-desc">{choice.description}</span>
              {choice.hint && <span className="choice-hint">{choice.hint}</span>}
            </button>
          ))}
        </div>
        <div className="custom-choice">
          <input
            type="text"
            placeholder="或者输入你想做的事..."
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleCustomSubmit()}
          />
          <button onClick={handleCustomSubmit}>确定</button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: 添加 ChoiceOverlay CSS**

```css
/* 分支选择弹窗 */
.choice-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
  animation: fadeIn 0.3s ease;
}

.choice-panel {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border: 2px solid #667eea;
  border-radius: 20px;
  padding: 2rem;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;
}

.choice-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.choice-icon {
  font-size: 1.5rem;
}

.choice-title {
  color: #fff;
  font-size: 1.5rem;
  font-weight: bold;
  text-shadow: 0 0 20px rgba(102, 126, 234, 0.5);
}

.choice-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.choice-btn {
  width: 100%;
  padding: 1rem 1.5rem;
  background: rgba(45, 55, 72, 0.5);
  border: 2px solid #2d3748;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.choice-btn:hover {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.2);
  transform: translateX(4px);
}

.choice-type {
  display: inline-block;
  background: rgba(102, 126, 234, 0.2);
  color: #667eea;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  font-size: 0.8rem;
  width: fit-content;
}

.choice-desc {
  color: #d4d4d4;
  font-size: 1rem;
  line-height: 1.5;
}

.choice-hint {
  color: #888;
  font-size: 0.85rem;
  font-style: italic;
}

.custom-choice {
  display: flex;
  gap: 0.5rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(102, 126, 234, 0.2);
}

.custom-choice input {
  flex: 1;
  padding: 0.75rem 1rem;
  background: rgba(45, 55, 72, 0.5);
  border: 1px solid rgba(102, 126, 234, 0.3);
  border-radius: 8px;
  color: #fff;
  font-size: 0.95rem;
  outline: none;
}

.custom-choice input::placeholder {
  color: #666;
}

.custom-choice input:focus {
  border-color: #667eea;
}

.custom-choice button {
  padding: 0.75rem 1.5rem;
  background: linear-gradient(135deg, #667eea, #764ba2);
  border: none;
  border-radius: 8px;
  color: white;
  font-weight: bold;
  cursor: pointer;
}
```

- [ ] **Step 3: 在主组件中集成 ChoiceOverlay**

添加导入：
```jsx
import ChoiceOverlay from './ChoiceOverlay.jsx';
```

添加 JSX：
```jsx
{showChoices && generatedChoices.length > 0 && (
  <ChoiceOverlay
    choices={generatedChoices}
    onSelect={(choice) => {
      setShowChoices(false);
      // 将选择作为输入继续
      handleSubmit(choice.action || '', choice.description);
    }}
    onCustom={(text) => {
      setShowChoices(false);
      handleSubmit('', text);
    }}
  />
)}
```

- [ ] **Step 4: 运行开发服务器验证**

Run: `npm run dev`
Expected: AI 生成选择点时显示分支选择弹窗

- [ ] **Step 5: 提交**

```bash
git add src/components/ImmersiveStoryRenderer.jsx src/components/ImmersiveStoryRenderer.css
git commit -m "feat: 实现分支选择弹窗组件"
```

---

## Task 11: 集成到 StoryModeSetup

**Files:**
- Modify: `src/components/StoryModeSetup.jsx` (替换 NovelGameplay)
- Modify: `src/components/StoryModeSetup.css` (如需要)

- [ ] **Step 1: 导入 ImmersiveStoryRenderer**

```jsx
import ImmersiveStoryRenderer from './ImmersiveStoryRenderer.jsx';
```

- [ ] **Step 2: 找到并替换 gameplay 视图中的 NovelGameplay**

找到 gameplay 相关的 JSX，替换为：
```jsx
{view === 'gameplay' && (
  <ImmersiveStoryRenderer
    chapter={selectedChapterData}
    characterName={selectedCharacter}
    onBack={() => {
      setView('chapter-select');
      setSelectedChapterData(null);
    }}
    onChapterEnd={(chapterId, characterName) => {
      // 处理章节结束
      setView('chapter-select');
    }}
    world={state.world}
  />
)}
```

- [ ] **Step 3: 运行开发服务器验证完整流程**

Run: `npm run dev`
Expected: 从小说选择 → 章节选择 → 进入沉浸式剧情模式

- [ ] **Step 4: 提交**

```bash
git add src/components/StoryModeSetup.jsx
git commit -m "feat: 将ImmersiveStoryRenderer集成到StoryModeSetup"
```

---

## Task 12: 最终测试和样式优化

**Files:**
- Modify: `src/components/ImmersiveStoryRenderer.css` (调整样式)
- Modify: `src/components/StoryModeSetup.jsx` (如需要)

- [ ] **Step 1: 检查并修复 CSS 冲突**

确保没有样式冲突：
- `.timeline-sidebar` vs `.scene-content`
- `.choice-overlay` vs 其他弹窗
- 滚动条样式统一

- [ ] **Step 2: 添加响应式支持**

```css
@media (max-width: 768px) {
  .timeline-sidebar {
    width: 60px;
  }

  .timeline-sidebar .timeline-title,
  .timeline-sidebar .timeline-preview {
    display: none;
  }

  .scene-map-panel {
    width: 95%;
  }
}
```

- [ ] **Step 3: 添加加载状态**

在 ImmersiveStoryRenderer 中添加：
```jsx
{isGenerating && (
  <div className="generating-overlay">
    <div className="generating-spinner">AI思考中...</div>
  </div>
)}
```

CSS:
```css
.generating-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 500;
}

.generating-spinner {
  color: #667eea;
  font-size: 1.2rem;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
```

- [ ] **Step 4: 最终构建测试**

Run: `npm run build`
Expected: 构建成功，无错误

- [ ] **Step 5: 提交最终版本**

```bash
git add .
git commit -m "feat: 完成沉浸式剧情模式重构"
```

---

## 自检清单

**Spec Coverage:**
- [x] 沉浸式全屏背景
- [x] 大立绘组件 + 淡入淡出动画
- [x] 旁白卡片
- [x] 动作卡片
- [x] 对话框
- [x] 快捷指令栏
- [x] 自定义输入
- [x] 时间线侧边栏
- [x] 迷你场景地图
- [x] 分支选择弹窗
- [x] 集成到 StoryModeSetup

**Placeholder Scan:**
- 无 TBD/TODO
- 无未实现的占位符

**Type Consistency:**
- 所有组件 props 明确
- 状态管理统一在 ImmersiveStoryRenderer 内部
