import React, { useState, useEffect, useRef } from 'react';
import { saveNarrativeSnapshot } from '../services/novelService.js';
import './NovelSceneRenderer.css';

const NovelSceneRenderer = ({
  chapter, // 章节数据（包含角色、场景、世界观等）
  characterName, // 当前扮演的角色名
  onChoicePoint,
  onChapterEnd,
  onBack,
  world // 完整的世界观信息
}) => {
  const [currentScene, setCurrentScene] = useState(null);
  const [currentCharacter, setCurrentCharacter] = useState(null);
  const [dialogueHistory, setDialogueHistory] = useState([]); // 剧情对话历史
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [freeInputAction, setFreeInputAction] = useState('');
  const [freeInputDialogue, setFreeInputDialogue] = useState('');
  const [showChoices, setShowChoices] = useState(false); // AI 生成的选择点
  const [generatedChoices, setGeneratedChoices] = useState([]);
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [turns, setTurns] = useState(0); // 当前回合数
  const [showSceneMap, setShowSceneMap] = useState(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const contentRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // 角色扮演模式的段落生成（不再使用原著段落）
  const paragraphs = []; // 留空，剧情完全由玩家输入驱动

  // 初始化场景和角色
  useEffect(() => {
    if (chapter) {
      // 设置当前角色
      const char = chapter.characters?.find(c => c.name === characterName);
      setCurrentCharacter(char || null);

      // 设置初始场景
      if (chapter.scenes?.length > 0) {
        setCurrentScene(chapter.scenes[0]);
      }
    }
  }, [chapter, characterName]);

  // 自动播放时继续生成剧情
  useEffect(() => {
    if (isAutoPlaying && !isTyping && !isGenerating && !showChoices) {
      const timer = setTimeout(() => {
        // 自动模式下，AI 继续叙述场景发展
        handleAutoNarration();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isAutoPlaying, isTyping, isGenerating, showChoices]);

  // 获取 AI 生成器（动态导入以避免循环依赖）
  const getAIService = async () => {
    const module = await import('../services/aiService.js');
    return module;
  };

  // 处理自由输入提交
  const handleFreeInputSubmit = async () => {
    const action = freeInputAction.trim();
    const dialogue = freeInputDialogue.trim();

    if (!action && !dialogue) return;
    if (isGenerating) return;

    setIsGenerating(true);

    // 添加玩家输入到对话历史
    if (dialogue) {
      const playerDialogue = {
        speaker: characterName,
        text: dialogue,
        isPlayer: true,
        action: action || null
      };
      setDialogueHistory(prev => [...prev, playerDialogue]);
    }

    try {
      const { generateWithAI, MAX_TOKENS } = await getAIService();

      // 构建生成剧情的 prompt
      const prompt = buildNarrativePrompt(action, dialogue);

      const result = await generateWithAI(prompt, 'deepseek', {
        maxTokens: MAX_TOKENS.CONTENT,
        jsonResponse: false
      });

      if (result) {
        // 检查是否生成了选择点
        const choicesMatch = result.match(/【选择点】([\s\S]*?)(?=【|$)/);
        let narrativeText = result;
        let choices = null;

        if (choicesMatch) {
          narrativeText = result.replace(choicesMatch[0], '');
          try {
            // 尝试解析选择点 JSON
            const choicesJson = choicesMatch[1].trim();
            choices = JSON.parse(choicesJson);
            if (choices && Array.isArray(choices.branches)) {
              setGeneratedChoices(choices.branches);
              setShowChoices(true);
            }
          } catch (e) {
            // 选择点解析失败，继续正常显示
          }
        }

        // 添加 AI 生成的剧情到对话历史
        const narrativeDialogue = {
          speaker: '旁白',
          text: narrativeText.trim(),
          isPlayer: false
        };
        setDialogueHistory(prev => [...prev, narrativeDialogue]);

        // 增加回合数
        setTurns(prev => prev + 1);
      }
    } catch (error) {
      console.error('生成剧情失败:', error);
      const errorDialogue = {
        speaker: '系统',
        text: `生成失败: ${error.message}`,
        isPlayer: false
      };
      setDialogueHistory(prev => [...prev, errorDialogue]);
    } finally {
      setIsGenerating(false);
      setFreeInputAction('');
      setFreeInputDialogue('');
    }
  };

  // 自动叙述（用于自动播放模式）
  const handleAutoNarration = async () => {
    if (isGenerating || showChoices) return;

    setIsGenerating(true);

    try {
      const { generateWithAI, MAX_TOKENS } = await getAIService();

      const prompt = buildAutoNarrationPrompt();

      const result = await generateWithAI(prompt, 'deepseek', {
        maxTokens: MAX_TOKENS.CONTENT,
        jsonResponse: false
      });

      if (result) {
        const narrativeDialogue = {
          speaker: '旁白',
          text: result.trim(),
          isPlayer: false
        };
        setDialogueHistory(prev => [...prev, narrativeDialogue]);
        setTurns(prev => prev + 1);
      }
    } catch (error) {
      console.error('自动叙述失败:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  // 构建生成剧情的 prompt
  const buildNarrativePrompt = (action, dialogue) => {
    const protagonist = currentCharacter || {};
    const scene = currentScene || {};
    const worldSetting = chapter?.world_setting || world || {};

    // 构建在场角色列表
    const presentCharacters = chapter.characters
      ?.filter(c => c.name !== characterName)
      ?.map(c => `${c.name}(${c.role || '角色'})`)
      ?.join('、') || '其他角色';

    // 构建历史对话摘要
    const recentDialogues = dialogueHistory.slice(-6);
    const historySummary = recentDialogues
      .map(d => d.isPlayer ? `[${characterName}]: ${d.text}` : `[${d.speaker}]: ${d.text}`)
      .join('\n');

    return `
【世界观设定】
${worldSetting.name || '未知世界'} - ${worldSetting.description || worldSetting.setting || '无详细设定'}

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
${action ? `玩家动作：${action}` : ''}
${dialogue ? `玩家对话："${dialogue}"` : ''}

【任务】
请以第三人称旁白形式，续写故事发展。要求：
1. 以 ${characterName} 的视角叙述
2. 描述 ${characterName} 的行动、对话、内心感受
3. 描述其他角色的反应
4. 推动剧情发展，可以引入新的情节元素
5. 篇幅100-200字
6. 语言风格：${worldSetting.type === '古风' || worldSetting.type === '仙侠' ? '古风白话' : '现代叙事'}

${turns >= 5 ? '（提示：剧情已进行一段时间，可以考虑引入一些转折或高潮）' : ''}

请直接输出剧情内容，不要有前缀说明。
`;
  };

  // 构建自动叙述的 prompt
  const buildAutoNarrationPrompt = () => {
    const protagonist = currentCharacter || {};
    const scene = currentScene || {};
    const worldSetting = chapter?.world_setting || world || {};

    const recentDialogues = dialogueHistory.slice(-4);
    const historySummary = recentDialogues
      .map(d => d.isPlayer ? `[${d.speaker}]: ${d.text}` : `[${d.speaker}]: ${d.text}`)
      .join('\n');

    return `
【世界观】
${worldSetting.name || '未知世界'} - ${worldSetting.description || ''}

【当前场景】
${scene.name || '默认场景'} - ${scene.location || ''}

【主角】
${characterName}：${protagonist.personality || ''}

【近期剧情】
${historySummary}

【任务】
继续叙述故事的自然发展，描述场景中的动态变化、角色互动等。篇幅80-150字。

请直接输出剧情内容。
`;
  };

  // 处理 AI 生成的选择
  const handleChoiceSelect = async (choice) => {
    setSelectedChoice(choice);
    setShowChoices(false);

    // 保存选择到叙事快照
    if (chapter?.novel_id && chapter?.id) {
      const snapshotData = {
        keyChoices: [{
          choiceId: choice.id || `choice_${Date.now()}`,
          description: choice.description,
          type: choice.type || 'narrative',
          chapterId: chapter.id,
          timestamp: new Date().toISOString()
        }],
        characterRelationshipChanges: [],
        locationChanges: [],
        inventoryChanges: [],
        narrativeSummary: `在第${turns}回合选择了：${choice.description}`
      };

      saveNarrativeSnapshot(chapter.novel_id, chapter.id, snapshotData)
        .catch(err => console.error('保存叙事快照失败:', err));
    }

    // 将选择作为玩家输入继续剧情
    setFreeInputDialogue(choice.description);
    setFreeInputAction(choice.action || '');

    // 延迟执行输入
    setTimeout(() => {
      handleFreeInputSubmit();
    }, 500);
  };

  // 处理自定义分支输入
  const handleCustomChoiceSubmit = (customText) => {
    if (!customText.trim()) return;

    const customChoice = {
      id: `custom_${Date.now()}`,
      type: 'custom',
      description: customText,
      action: ''
    };

    handleChoiceSelect(customChoice);
  };

  // 获取场景背景
  const getSceneBackground = () => {
    // 支持多种字段名：background_url, imageUrl, image_url
    const bgUrl = currentScene?.background_url || currentScene?.imageUrl || currentScene?.image_url;
    if (bgUrl) {
      return { backgroundImage: `url(${bgUrl})` };
    }
    return {
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)'
    };
  };

  // 获取角色立绘
  const getCharacterPortrait = () => {
    // 支持多种字段名：portrait_url, imageUrl, image_url
    return currentCharacter?.portrait_url || currentCharacter?.imageUrl || currentCharacter?.image_url || null;
  };

  // 获取角色卡片
  const getCharacterCard = () => {
    // 支持多种字段名：card_url, imageUrl, image_url
    return currentCharacter?.card_url || currentCharacter?.imageUrl || currentCharacter?.image_url || null;
  };

  // 跳过打字效果
  const skipTyping = () => {
    if (typingTimeoutRef.current) {
      clearInterval(typingTimeoutRef.current);
    }
    setIsTyping(false);
    if (dialogueHistory.length > 0) {
      setDisplayedText(dialogueHistory[dialogueHistory.length - 1].text);
    }
  };

  // 继续阅读
  const handleContinue = () => {
    if (isTyping) {
      skipTyping();
      return;
    }
  };

  const portraitUrl = getCharacterPortrait();
  const cardUrl = getCharacterCard();

  return (
    <div className="novel-scene-renderer">
      {/* 场景背景 */}
      <div
        className="scene-background"
        style={getSceneBackground()}
        onClick={handleContinue}
      >
        {/* 场景指示器 */}
        <div className="scene-indicator">
          <span className="scene-name">{currentScene?.name || '默认场景'}</span>
          {chapter?.scenes?.length > 1 && (
            <button
              className="scene-map-btn"
              onClick={(e) => {
                e.stopPropagation();
                setShowSceneMap(true);
              }}
              title="查看场景地图"
            >
              🗺️
            </button>
          )}
        </div>

        {/* 回合指示器 */}
        <div className="turn-indicator">
          <span className="turn-label">回合</span>
          <span className="turn-count">{turns}</span>
        </div>

        {/* 角色卡片小图 */}
        {cardUrl && (
          <div className="character-card-mini">
            <img src={cardUrl} alt={characterName} />
          </div>
        )}

        {/* 角色立绘 */}
        {portraitUrl && (
          <div className="character-portrait">
            <img src={portraitUrl} alt={characterName} />
          </div>
        )}

        {/* 内容区域 */}
        <div className="scene-content" ref={contentRef}>
          {/* 对话框 */}
          <div className="dialogue-box">
            <div className="dialogue-speaker">{characterName}</div>
            <div className="dialogue-text">
              {dialogueHistory.length === 0 ? (
                <span className="start-hint">
                  {isGenerating ? 'AI正在思考...' : '输入动作或对话开始你的故事'}
                </span>
              ) : (
                <>
                  {dialogueHistory.slice(-10).map((msg, idx) => (
                    <div
                      key={idx}
                      className={`dialogue-item ${msg.isPlayer ? 'player' : 'narrator'} ${msg.speaker === '系统' ? 'system' : ''}`}
                    >
                      {!msg.isPlayer && msg.speaker !== '系统' && (
                        <div className="dialogue-speaker">{msg.speaker}</div>
                      )}
                      {msg.action && (
                        <div className="dialogue-action">（{msg.action}）</div>
                      )}
                      <div className="dialogue-text">{msg.text}</div>
                    </div>
                  ))}
                  {displayedText && (
                    <div className="dialogue-item narrator current">
                      <div className="dialogue-text">
                        {displayedText}
                        {isTyping && <span className="typing-cursor">|</span>}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* AI 生成中提示 */}
          {isGenerating && (
            <div className="generating-indicator">
              <span className="generating-text">AI正在生成剧情...</span>
            </div>
          )}

          {/* 继续提示 */}
          {!isTyping && !isGenerating && dialogueHistory.length > 0 && (
            <div className="continue-hint">
              点击继续或输入内容
            </div>
          )}

          {/* AI 生成的选择点 */}
          {showChoices && generatedChoices.length > 0 && (
            <div className="choice-point-overlay">
              <div className="choice-panel">
                <div className="choice-title">命运的岔路口</div>
                {generatedChoices.map((choice, index) => (
                  <button
                    key={choice.id || index}
                    className={`choice-btn ${selectedChoice?.id === choice.id ? 'selected' : ''}`}
                    onClick={() => handleChoiceSelect(choice)}
                  >
                    <span className="choice-type">{choice.type || '选择'}</span>
                    <span className="choice-desc">{choice.description}</span>
                    {choice.hint && <span className="choice-hint">{choice.hint}</span>}
                  </button>
                ))}
                {/* 自定义输入 */}
                <div className="custom-choice-input">
                  <input
                    type="text"
                    placeholder="或者输入你想做的事..."
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && e.target.value.trim()) {
                        handleCustomChoiceSubmit(e.target.value);
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 自由输入区域 */}
        {!showChoices && (
          <div className="free-input-area">
            <input
              type="text"
              className="free-input action-input"
              placeholder="输入动作（可选）"
              value={freeInputAction}
              onChange={(e) => setFreeInputAction(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleFreeInputSubmit()}
              disabled={isGenerating}
            />
            <input
              type="text"
              className="free-input dialogue-input"
              placeholder="输入对话/行动..."
              value={freeInputDialogue}
              onChange={(e) => setFreeInputDialogue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleFreeInputSubmit()}
              disabled={isGenerating}
            />
            <button
              className="submit-btn"
              onClick={handleFreeInputSubmit}
              disabled={isGenerating || (!freeInputAction.trim() && !freeInputDialogue.trim())}
            >
              发送
            </button>
          </div>
        )}
      </div>

      {/* 控制栏 */}
      <div className="renderer-controls">
        <button className="control-btn back" onClick={onBack}>
          ← 返回
        </button>
        <button
          className={`control-btn auto ${isAutoPlaying ? 'playing' : ''}`}
          onClick={() => setIsAutoPlaying(!isAutoPlaying)}
        >
          {isAutoPlaying ? '⏸ 暂停' : '▶ 自动'}
        </button>
        <div className="character-info">
          <span className="character-name">{characterName}</span>
        </div>
        <div className="progress-indicator">
          {turns} 回合
        </div>
      </div>

      {/* 场景地图 */}
      {showSceneMap && chapter?.scenes && (
        <div className="scene-map-overlay" onClick={() => setShowSceneMap(false)}>
          <div className="scene-map-panel" onClick={(e) => e.stopPropagation()}>
            <div className="scene-map-header">
              <span className="scene-map-icon">🗺️</span>
              <span className="scene-map-title">场景地图</span>
              <button className="close-btn" onClick={() => setShowSceneMap(false)}>✕</button>
            </div>
            <div className="scene-map-list">
              {chapter.scenes.map((scene, idx) => (
                <div
                  key={scene.id || idx}
                  className={`scene-map-item ${currentScene?.id === scene.id ? 'current' : ''}`}
                  onClick={() => {
                    setCurrentScene(scene);
                    setShowSceneMap(false);
                  }}
                >
                  <div
                    className="scene-thumbnail"
                    style={{
                      backgroundImage: (scene.background_url || scene.imageUrl || scene.image_url)
                        ? `url(${scene.background_url || scene.imageUrl || scene.image_url})`
                        : 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)'
                    }}
                  />
                  <div className="scene-info">
                    <div className="scene-title">{scene.name || `场景 ${idx + 1}`}</div>
                    <div className="scene-location">{scene.location || ''}</div>
                    {currentScene?.id === scene.id && (
                      <div className="current-badge">当前</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NovelSceneRenderer;
