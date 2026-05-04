import React, { useState, useEffect, useRef } from 'react';
import { useGameState } from '../store/gameState.jsx';
import { generateWithAI, MAX_TOKENS } from '../services/aiService.js';
import { saveNarrativeSnapshot, getNarrativeSnapshots } from '../services/novelService.js';
import './ChapterStoryRenderer.css';

// ChapterStoryRenderer - 基于已有世界观/角色/场景的章节制剧情体验
const ChapterStoryRenderer = ({
  chapter, // 章节数据 { id, title, endingGoal, scenes, characters, maxTurns: 40, normalPhaseTurns: 30 }
  protagonistName,
  onChapterEnd, // 章节结束时回调
  onBack
}) => {
  const { state } = useGameState();

  // === 组件状态 ===
  const [currentScene, setCurrentScene] = useState(null);
  const [currentCharacter, setCurrentCharacter] = useState(null);
  const [dialogueHistory, setDialogueHistory] = useState([]);
  const [choices, setChoices] = useState([]);

  // === 自由输入状态 ===
  const [freeInputAction, setFreeInputAction] = useState('');
  const [freeInputDialogue, setFreeInputDialogue] = useState('');

  // === 章节状态 ===
  const [currentChapter, setCurrentChapter] = useState(chapter || null);
  const [currentTurns, setCurrentTurns] = useState(0); // 当前回合数
  const [endingOccurred, setEndingOccurred] = useState(false); // 结局事件是否已发生
  const [branchPoints, setBranchPoints] = useState([]); // 分支点列表
  const [currentBranchIndex, setCurrentBranchIndex] = useState(-1); // 当前分支索引

  // === 适应级别状态 ===
  const [adaptationLevel, setAdaptationLevel] = useState('light'); // 'light' | 'full'

  // === 叙事上下文状态 ===
  const [narrativeContext, setNarrativeContext] = useState(null); // 当前叙事上下文

  // === 渲染状态 ===
  const [isTyping, setIsTyping] = useState(false);
  const [displayedText, setDisplayedText] = useState('');
  const [showChoices, setShowChoices] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // === 旁白干预状态 ===
  const [isInterventionPhase, setIsInterventionPhase] = useState(false); // 是否处于介入阶段

  // === 场景背景状态 ===
  const [showSceneMap, setShowSceneMap] = useState(false);

  const typingTimeoutRef = useRef(null);
  const contentRef = useRef(null);

  // === 加载叙事上下文 ===
  const loadNarrativeContext = async () => {
    if (!state.world?.id || !currentChapter?.id) return null;

    try {
      const snapshots = await getNarrativeSnapshots(state.world.id);
      // 找到当前章节相关的最新快照
      const relevantSnapshot = snapshots
        ?.filter(s => s.chapterId === currentChapter.id)
        ?.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

      if (relevantSnapshot?.snapshotData) {
        return relevantSnapshot.snapshotData;
      }
    } catch (err) {
      console.error('加载叙事上下文失败:', err);
    }
    return null;
  };

  // === 初始化章节数据 ===
  useEffect(() => {
    if (chapter && state.scenes && state.scenes.length > 0) {
      // 初始化章节
      const initChapter = {
        ...chapter,
        maxTurns: chapter.maxTurns || 40,
        normalPhaseTurns: chapter.normalPhaseTurns || 30
      };
      setCurrentChapter(initChapter);

      // 设置初始场景（使用第一个场景或指定的初始场景）
      const initialScene = chapter.scenes?.[0] || state.scenes[0];
      setCurrentScene(initialScene);

      // 设置主角
      const protagonist = state.characters?.find(c => c.isProtagonist);
      setCurrentCharacter(protagonist || state.characters?.[0] || null);

      // 初始化回合数
      setCurrentTurns(0);
      setEndingOccurred(false);
      setIsInterventionPhase(false);

      // 加载叙事上下文
      loadNarrativeContext().then(context => {
        if (context) {
          setNarrativeContext(context);
        }
      });
    }
  }, [chapter, state.scenes, state.characters]);

  // === 回合阶段检测 ===
  useEffect(() => {
    if (!currentChapter) return;

    const normalPhaseTurns = currentChapter.normalPhaseTurns || 30;
    const currentTurnsVal = currentTurns;

    // 进入介入阶段
    if (currentTurnsVal >= normalPhaseTurns && currentTurnsVal < (currentChapter.maxTurns || 40)) {
      if (!isInterventionPhase) {
        setIsInterventionPhase(true);
      }
    }

    // 强制结局触发（40回合）
    if (currentTurnsVal >= (currentChapter.maxTurns || 40) && !endingOccurred) {
      handleForcedEnding();
    }
  }, [currentTurns, currentChapter, endingOccurred, isInterventionPhase]);

  // === 检测结局事件是否发生 ===
  const checkEndingEvent = (text) => {
    if (!currentChapter?.endingGoal || endingOccurred) return false;

    const goal = currentChapter.endingGoal.toLowerCase();
    const content = text.toLowerCase();

    // 检测结局目标是否在文本中出现
    if (content.includes(goal)) {
      setEndingOccurred(true);
      return true;
    }
    return false;
  };

  // === 处理自由输入提交 ===
  const handleFreeInputSubmit = async () => {
    if (isGenerating) return;

    const action = freeInputAction.trim();
    const dialogue = freeInputDialogue.trim();

    if (!action && !dialogue) return;

    setIsGenerating(true);
    setFreeInputAction('');
    setFreeInputDialogue('');

    try {
      // 构建AI提示词
      const prompt = buildNarrativePrompt(action, dialogue);

      // 添加玩家输入到对话历史
      if (dialogue) {
        const playerDialogue = {
          speaker: protagonistName || currentCharacter?.name || '主角',
          text: dialogue,
          isPlayer: true
        };
        setDialogueHistory(prev => [...prev, playerDialogue]);
      }

      // 调用AI生成叙事内容
      const result = await generateWithAI(prompt, 'deepseek', {
        maxTokens: MAX_TOKENS.CONTENT,
        jsonResponse: false
      });

      // 处理AI返回内容
      if (result) {
        // 检查结局事件
        checkEndingEvent(result);

        // 添加AI叙事到对话历史
        const narrativeDialogue = {
          speaker: '旁白',
          text: result,
          isPlayer: false
        };
        setDialogueHistory(prev => [...prev, narrativeDialogue]);

        // 更新回合数
        setCurrentTurns(prev => prev + 1);
      }
    } catch (error) {
      console.error('生成叙事失败:', error);
      const errorDialogue = {
        speaker: '系统',
        text: `生成失败: ${error.message}`,
        isPlayer: false
      };
      setDialogueHistory(prev => [...prev, errorDialogue]);
    } finally {
      setIsGenerating(false);
    }
  };

  // === 构建叙事AI提示词 ===
  const buildNarrativePrompt = (action, dialogue) => {
    const protagonist = currentCharacter || {};
    const scene = currentScene || {};
    const world = state.world || {};

    // 构建叙事上下文（适应级别）
    let contextInstruction = '';
    if (narrativeContext && adaptationLevel === 'full') {
      const recentChoices = narrativeContext.keyChoices?.slice(-3) || [];
      if (recentChoices.length > 0) {
        contextInstruction = `
【过往选择参考】
${recentChoices.map(c => `- ${c.description || c.narrativeSummary || '无描述'}`).join('\n')}
`;
      }
    }

    // 构建旁白干预指令（介入阶段）
    let narratorInstruction = '';
    if (isInterventionPhase && !endingOccurred) {
      narratorInstruction = `
【旁白干预指令】
当前处于第${currentTurns}回合，结局目标"${currentChapter?.endingGoal}"尚未发生。
请以旁白身份设计一个合理的情节，推动故事向结局目标发展。
叙述中需要包含结局目标的关键元素，使故事自然地导向该结局。
`;
    }

    const prompt = `
世界观：${world.name || '未知世界'} - ${world.description || ''}
当前场景：${scene.name || '未知场景'} - ${scene.description || ''}
场景地点：${scene.location || ''}

主角信息：
- 姓名：${protagonist.name || protagonistName || '主角'}
- 性格：${protagonist.personality || '未知'}
- 外貌：${protagonist.appearance || '未知'}

在场角色：
${state.characters?.map(c => `- ${c.name}: ${c.personality}`).join('\n') || '无'}

当前情境：
${action ? `主角动作：${action}` : ''}
${dialogue ? `主角对话："${dialogue}"` : ''}

${contextInstruction}
${narratorInstruction}

请继续叙述故事的发展，要求：
1. 描述场景氛围和角色反应
2. 以第三人称旁白形式叙述
3. ${currentChapter?.endingGoal ? `最终需要达成结局目标：${currentChapter.endingGoal}` : '推动剧情发展'}
4. ${adaptationLevel === 'full' ? '保持与之前选择的一致性，参考过往选择' : '保持角色性格一致性'}
5. 叙述篇幅适中（100-200字）
`;
    return prompt;
  };

  // === 强制结局触发 ===
  const handleForcedEnding = () => {
    if (endingOccurred) return;

    console.log('[章节模式] 强制结局触发');
    setEndingOccurred(true);

    const forcedDialogue = {
      speaker: '旁白',
      text: `由于回合数已达上限，故事被迫走向结局。`,
      isPlayer: false
    };
    setDialogueHistory(prev => [...prev, forcedDialogue]);

    // 延迟触发分支选择
    setTimeout(() => {
      triggerBranchSelection();
    }, 2000);
  };

  // === 结局事件自然发生 ===
  useEffect(() => {
    if (endingOccurred && !isInterventionPhase) {
      // 自然发生的结局，触发分支选择
      triggerBranchSelection();
    }
  }, [endingOccurred, isInterventionPhase]);

  // === 触发分支选择 ===
  const triggerBranchSelection = () => {
    setShowChoices(true);

    // 保存叙事快照
    if (currentChapter?.id) {
      const snapshotData = {
        keyChoices: [{
          chapterId: currentChapter.id,
          endingGoal: currentChapter.endingGoal,
          turnsUsed: currentTurns,
          endingType: isInterventionPhase ? 'forced' : 'natural',
          timestamp: new Date().toISOString()
        }],
        characterRelationshipChanges: [],
        locationChanges: [{
          from: currentScene?.name,
          to: '结局'
        }],
        inventoryChanges: [],
        narrativeSummary: `第${currentTurns}回合达成结局：${currentChapter.endingGoal}`
      };

      saveNarrativeSnapshot(state.world?.id, currentChapter.id, snapshotData)
        .catch(err => console.error('保存叙事快照失败:', err));
    }

    // 默认分支选项（AI生成失败时的回退）
    const defaultBranches = [
      { id: 'continue', type: 'continue', description: '继续下一章' },
      { id: 'review', type: 'review', description: '回顾本章剧情' },
      { id: 'end', type: 'end', description: '结束游戏' }
    ];

    // AI 生成分支选项
    generateBranchOptions().then(branches => {
      if (branches && branches.length > 0) {
        setBranchPoints(branches);
      } else {
        setBranchPoints(defaultBranches);
      }
    });
  };

  // === AI 生成分支选项 ===
  const generateBranchOptions = async () => {
    if (!state.world?.id) return null;

    try {
      // 构建分支生成的上下文
      const recentDialogues = dialogueHistory.slice(-10);
      const contextSummary = recentDialogues
        .map(d => d.isPlayer ? `[玩家]: ${d.text}` : `[${d.speaker}]: ${d.text}`)
        .join('\n');

      // 在场角色列表
      const presentCharacters = state.characters
        ?.filter(c => !c.isProtagonist)
        ?.map(c => c.name)
        ?.join('、') || '无';

      // 可用场景
      const availableScenes = state.scenes
        ?.filter(s => s.id !== currentScene?.id)
        ?.map(s => s.name)
        ?.join('、') || '无';

      const prompt = `
【当前剧情情境】
世界观：${state.world.name} - ${state.world.description}
当前场景：${currentScene?.name}（${currentScene?.description || '无描述'}）
在场角色：${presentCharacters}
可用探索场景：${availableScenes}

【本章回顾】
${contextSummary}

【本章结局目标】
${currentChapter?.endingGoal}
本回合数：${currentTurns}/${currentChapter?.maxTurns || 40}
结局达成情况：${endingOccurred ? '已达成' : '未达成'}（${isInterventionPhase ? '旁白介入' : '正常'})

【任务】
作为剧情策划，为玩家生成3-4个有意义的分支选项，每个选项应该：
1. 提供不同的剧情走向（探索、对话、休息、整理信息等）
2. 结合当前剧情情境，具有合理性和吸引力
3. 选项描述要具体、有画面感

请以JSON格式返回分支选项：
{
  "branches": [
    {
      "type": "explore/scene/talk/rest/special",
      "description": "具体的选项描述，要生动有画面感",
      "hint": "选择后的可能发展方向提示（10字内）"
    }
  ]
}

注意：只返回JSON，不要有其他文字。
`;

      const result = await generateWithAI(prompt, 'deepseek', {
        maxTokens: 800,
        jsonResponse: true
      });

      // 解析 AI 返回的分支选项
      let branches = null;
      if (typeof result === 'object' && result.branches) {
        branches = result.branches;
      } else if (typeof result === 'string') {
        try {
          const jsonMatch = result.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            branches = parsed.branches;
          }
        } catch (e) {
          console.error('[分支生成] JSON解析失败:', e);
        }
      }

      if (branches && Array.isArray(branches) && branches.length > 0) {
        // 为每个分支生成唯一ID
        return branches.map((b, idx) => ({
          id: `branch_${Date.now()}_${idx}`,
          type: b.type || 'special',
          description: b.description || b.desc || '继续探索',
          hint: b.hint || '',
          isGenerated: true
        }));
      }

      return null;
    } catch (error) {
      console.error('[分支生成] AI生成分支选项失败:', error);
      return null;
    }
  };

  // === 处理分支选择 ===
  const handleBranchSelect = (branch) => {
    setShowChoices(false);
    setCurrentBranchIndex(branchPoints.indexOf(branch));

    // 保存分支选择到快照
    if (currentChapter?.id && state.world?.id) {
      saveNarrativeSnapshot(state.world.id, currentChapter.id, {
        keyChoices: [{
          branchId: branch.id,
          branchType: branch.type,
          description: branch.description,
          hint: branch.hint,
          timestamp: new Date().toISOString()
        }],
        characterRelationshipChanges: [],
        locationChanges: [],
        inventoryChanges: [],
        narrativeSummary: `选择了：${branch.description}`
      }).catch(err => console.error('保存分支选择失败:', err));
    }

    // 根据分支类型处理
    if (branch.type === 'review') {
      // 回顾模式 - 显示本章剧情回顾，然后继续
      showChapterReview();
      return;
    }

    if (branch.type === 'end') {
      // 结束游戏 - 通知父组件
      onChapterEnd?.({
        chapterId: currentChapter?.id,
        branch: branch,
        turnsUsed: currentTurns,
        endingType: isInterventionPhase ? 'forced' : 'natural'
      });
      return;
    }

    // 其他分支类型（explore/scene/talk/special）- 继续下一章
    onChapterEnd?.({
      chapterId: currentChapter?.id,
      branch: branch,
      turnsUsed: currentTurns,
      endingType: isInterventionPhase ? 'forced' : 'natural'
    });
  };

  // === 显示章节回顾 ===
  const [showReview, setShowReview] = useState(false);

  const showChapterReview = () => {
    setShowReview(true);

    // 3秒后自动关闭回顾，继续游戏
    setTimeout(() => {
      setShowReview(false);
      onChapterEnd?.({
        chapterId: currentChapter?.id,
        branch: { type: 'continue', description: '继续游戏' },
        turnsUsed: currentTurns,
        endingType: isInterventionPhase ? 'forced' : 'natural'
      });
    }, 5000);
  };

  // === 处理自定义分支输入 ===
  const handleCustomBranchSubmit = (customText) => {
    if (!customText.trim()) return;

    const customBranch = {
      id: `custom_${Date.now()}`,
      type: 'custom',
      description: customText,
      isCustom: true
    };

    handleBranchSelect(customBranch);
  };

  // === 获取场景背景 ===
  const getSceneBackground = () => {
    if (currentScene?.imageUrl) {
      return { backgroundImage: `url(${currentScene.imageUrl})` };
    }
    // 默认渐变背景
    return {
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)'
    };
  };

  // === 获取角色立绘 ===
  const getCharacterPortrait = () => {
    if (currentCharacter?.imageUrl) {
      return currentCharacter.imageUrl;
    }
    return null;
  };

  // === 打字机效果 ===
  useEffect(() => {
    if (dialogueHistory.length === 0) return;

    const lastDialogue = dialogueHistory[dialogueHistory.length - 1];
    if (lastDialogue.isPlayer) return; // 玩家输入不显示打字机效果

    setDisplayedText('');
    setIsTyping(true);

    let charIndex = 0;
    const text = lastDialogue.text;

    typingTimeoutRef.current = setInterval(() => {
      if (charIndex < text.length) {
        setDisplayedText(text.substring(0, charIndex + 1));
        charIndex++;
      } else {
        clearInterval(typingTimeoutRef.current);
        setIsTyping(false);
        setDisplayedText(text);
      }
    }, 30);

    return () => {
      if (typingTimeoutRef.current) {
        clearInterval(typingTimeoutRef.current);
      }
    };
  }, [dialogueHistory.length]);

  // === 跳过打字机效果 ===
  const skipTyping = () => {
    if (isTyping && dialogueHistory.length > 0) {
      const lastDialogue = dialogueHistory[dialogueHistory.length - 1];
      setDisplayedText(lastDialogue.text);
      setIsTyping(false);
      if (typingTimeoutRef.current) {
        clearInterval(typingTimeoutRef.current);
      }
    }
  };

  // === 点击继续 ===
  const handleContinue = () => {
    if (isTyping) {
      skipTyping();
      return;
    }
    // 如果需要显示下一条对话，可以在这里处理
  };

  return (
    <div className="chapter-story-renderer">
      {/* 场景背景 */}
      <div
        className="scene-background"
        style={getSceneBackground()}
        onClick={handleContinue}
      >
        {/* 场景指示器 */}
        <div className="scene-indicator">
          <span className="scene-name">{currentScene?.name || '默认场景'}</span>
          {currentChapter?.scenes?.length > 1 && (
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
          <span className="turn-count">{currentTurns}</span>
          {isInterventionPhase && (
            <span className="intervention-badge">旁白介入</span>
          )}
        </div>

        {/* 角色立绘 */}
        {getCharacterPortrait() && (
          <div className="character-portrait">
            <img src={getCharacterPortrait()} alt={currentCharacter?.name} />
          </div>
        )}

        {/* 主角卡片 */}
        {currentCharacter && (
          <div className="protagonist-card">
            <div className="protagonist-avatar">
              {currentCharacter.imageUrl ? (
                <img src={currentCharacter.imageUrl} alt={currentCharacter.name} />
              ) : (
                <div className="avatar-placeholder">👤</div>
              )}
            </div>
            <div className="protagonist-info">
              <div className="protagonist-name">{currentCharacter.name || protagonistName}</div>
              <div className="protagonist-title">主角</div>
            </div>
          </div>
        )}

        {/* 对话历史区域 */}
        <div className="dialogue-area" ref={contentRef}>
          {/* 显示对话历史 */}
          <div className="dialogue-history">
            {dialogueHistory.slice(-10).map((dialogue, index) => (
              <div
                key={index}
                className={`dialogue-item ${dialogue.isPlayer ? 'player' : ''} ${dialogue.speaker === '旁白' ? 'narrator' : ''}`}
              >
                {!dialogue.isPlayer && (
                  <div className="dialogue-speaker">{dialogue.speaker}</div>
                )}
                <div className="dialogue-text">{dialogue.text}</div>
              </div>
            ))}

            {/* 当前显示的打字文本 */}
            {displayedText && (
              <div className="dialogue-item current">
                <div className="dialogue-text">
                  {displayedText}
                  {isTyping && <span className="typing-cursor">|</span>}
                </div>
              </div>
            )}
          </div>

          {/* 继续提示 */}
          {!isTyping && !isGenerating && (
            <div className="continue-hint">
              {isTyping ? '点击跳过' : '点击继续'}
            </div>
          )}

          {/* AI生成中提示 */}
          {isGenerating && (
            <div className="generating-indicator">
              <span className="generating-text">AI正在思考...</span>
            </div>
          )}
        </div>

        {/* 自由输入区域 */}
        {!showChoices && !isGenerating && (
          <div className="free-input-area">
            <div className="input-row">
              <input
                type="text"
                className="free-input action-input"
                placeholder="输入动作（可选）"
                value={freeInputAction}
                onChange={(e) => setFreeInputAction(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleFreeInputSubmit()}
              />
            </div>
            <div className="input-row">
              <input
                type="text"
                className="free-input dialogue-input"
                placeholder="输入对话（可选）"
                value={freeInputDialogue}
                onChange={(e) => setFreeInputDialogue(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleFreeInputSubmit()}
              />
              <button
                className="submit-btn"
                onClick={handleFreeInputSubmit}
                disabled={isGenerating}
              >
                发送
              </button>
            </div>
          </div>
        )}

        {/* 章节回顾模式 */}
        {showReview && (
          <div className="chapter-review-overlay">
            <div className="chapter-review-panel">
              <div className="review-header">
                <span className="review-icon">📜</span>
                <span className="review-title">本章回顾</span>
              </div>
              <div className="review-content">
                {dialogueHistory.slice(-20).map((dialogue, index) => (
                  <div
                    key={index}
                    className={`review-item ${dialogue.isPlayer ? 'player' : ''} ${dialogue.speaker === '旁白' ? 'narrator' : ''}`}
                  >
                    {!dialogue.isPlayer && (
                      <span className="review-speaker">{dialogue.speaker}</span>
                    )}
                    <span className="review-text">{dialogue.text}</span>
                  </div>
                ))}
              </div>
              <div className="review-footer">
                <span className="review-hint">5秒后自动继续...</span>
              </div>
            </div>
          </div>
        )}

        {/* 分支选择面板 */}
        {showChoices && (
          <div className="branch-selection-panel">
            <div className="branch-header">
              <span className="branch-icon">⚡</span>
              <span className="branch-title">分支选择</span>
            </div>

            <div className="branch-description">
              {endingOccurred ? (
                <p>结局目标 "{currentChapter?.endingGoal}" 已达成！</p>
              ) : (
                <p>本章即将结束，请选择后续行动。</p>
              )}
            </div>

            <div className="branch-options">
              {branchPoints.map((branch, index) => (
                <button
                  key={branch.id}
                  className={`branch-option ${branch.isGenerated ? 'generated' : ''}`}
                  onClick={() => handleBranchSelect(branch)}
                >
                  <div className="branch-main">
                    {branch.isGenerated && <span className="branch-type-badge">✨</span>}
                    <span className="branch-type">{branch.type}</span>
                    <span className="branch-desc">{branch.description}</span>
                  </div>
                  {branch.hint && (
                    <span className="branch-hint">{branch.hint}</span>
                  )}
                </button>
              ))}
            </div>

            {/* 自定义分支输入 */}
            <div className="custom-branch-input">
              <input
                type="text"
                placeholder="或者输入自定义分支..."
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && e.target.value.trim()) {
                    handleCustomBranchSubmit(e.target.value);
                  }
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 控制栏 */}
      <div className="renderer-controls">
        <button className="control-btn back" onClick={onBack}>
          ← 返回
        </button>
        <div className="chapter-info">
          <span className="chapter-title">{currentChapter?.title || '章节'}</span>
        </div>
        <div className="progress-info">
          {currentTurns} / {currentChapter?.maxTurns || 40} 回合
        </div>
        {/* 适应级别控制 */}
        <div className="adaptation-control">
          <span className="adaptation-label">适应级别：</span>
          <button
            className={`adaptation-btn ${adaptationLevel === 'light' ? 'active' : ''}`}
            onClick={() => setAdaptationLevel('light')}
            title="轻量适应 - 保持角色性格一致"
          >
            轻
          </button>
          <button
            className={`adaptation-btn ${adaptationLevel === 'full' ? 'active' : ''}`}
            onClick={() => setAdaptationLevel('full')}
            title="完全适应 - 保持与之前选择的一致性"
          >
            全
          </button>
        </div>
      </div>

      {/* 场景地图弹窗 */}
      {showSceneMap && currentChapter?.scenes && (
        <div className="scene-map-overlay" onClick={() => setShowSceneMap(false)}>
          <div className="scene-map-panel" onClick={(e) => e.stopPropagation()}>
            <div className="scene-map-header">
              <span className="scene-map-icon">🗺️</span>
              <span className="scene-map-title">场景地图</span>
              <button className="close-btn" onClick={() => setShowSceneMap(false)}>✕</button>
            </div>
            <div className="scene-map-list">
              {currentChapter.scenes.map((scene, idx) => (
                <div
                  key={scene.id || idx}
                  className={`scene-map-item ${currentScene?.id === scene.id ? 'current' : ''}`}
                >
                  <div
                    className="scene-thumbnail"
                    style={{
                      backgroundImage: scene.imageUrl ? `url(${scene.imageUrl})` :
                        'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)'
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

export default ChapterStoryRenderer;
