import React, { useState, useEffect, useRef } from 'react';
import { saveNarrativeSnapshot } from '../services/novelService.js';
import TimelineSidebar from './TimelineSidebar.jsx';
import SceneMapMini from './SceneMapMini.jsx';
import QuickActionBar from './QuickActionBar.jsx';
import './ImmersiveStoryRenderer.css';

// ChoiceOverlay 分支选择弹窗组件
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

const ImmersiveStoryRenderer = ({
  chapter,
  character,
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
  const [currentSpeaker, setCurrentSpeaker] = useState(null);

  // 快捷指令输入
  const [freeInput, setFreeInput] = useState('');
  const [actionInput, setActionInput] = useState('');

  const contentRef = useRef(null);

  // getAIService 辅助函数
  const getAIService = async () => {
    const module = await import('../services/aiService.js');
    return module;
  };

  // buildNarrativePrompt 辅助函数
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

  // handleSubmit 函数处理输入提交
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

  // 初始化
  useEffect(() => {
    // 优先使用传入的 character 对象
    if (character && typeof character === 'object') {
      setCurrentCharacter(character);
    } else if (characterName && chapter?.characters?.length > 0) {
      // 否则从 chapter.characters 中查找
      const char = chapter.characters.find(c => c.name === characterName);
      setCurrentCharacter(char || null);
    } else {
      setCurrentCharacter(null);
    }
    if (chapter?.scenes?.length > 0) {
      setCurrentScene(chapter.scenes[0]);
    }
  }, [chapter, character, characterName]);

  return (
    <div className="immersive-story-renderer">
      {/* 加载状态 */}
      {isGenerating && (
        <div className="generating-overlay">
          <div className="generating-spinner">AI思考中...</div>
        </div>
      )}

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
        <div
          className="immersive-background"
          style={currentScene?.background_url ? {
            backgroundImage: `url(${currentScene.background_url})`,
            backgroundColor: '#1a1a2e'
          } : undefined}
        />

        {/* 左上角场景按钮 */}
        <button className="scene-map-btn" onClick={() => setShowSceneMap(true)}>
          🗺️
        </button>

        {/* 大立绘 */}
        <CharacterPortrait character={currentCharacter} />

        {/* 旁白卡片 */}
        <NarrativeCard type="narrative" text={null} />

        {/* 动作卡片 */}
        <ActionCard character={null} action={null} />

        {/* 对话框 */}
        <DialogueBox speaker={null} text={null} />

        {/* 输入区域 */}
        <InputArea
          onQuickAction={(action) => {}}
          onSubmit={handleSubmit}
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

        {/* 分支选择弹窗 */}
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

// CharacterPortrait 大立绘组件
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

const DialogueBox = ({ speaker, text, isPlayer }) => {
  if (!text) return null;

  return (
    <div className={`dialogue-box ${isPlayer ? 'player' : ''}`}>
      <div className="dialogue-speaker">{speaker}</div>
      <div className="dialogue-text">"{text}"</div>
    </div>
  );
};

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

export default ImmersiveStoryRenderer;
