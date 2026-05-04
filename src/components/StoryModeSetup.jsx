import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameState } from '../store/gameState.jsx';
import { generateWithAI, MAX_TOKENS } from '../services/aiService.js';
import { getNovels, deleteNovel, getNarrativeSnapshots } from '../services/novelService.js';
import NovelUpload from './NovelUpload.jsx';
import NovelChapterSelect from './NovelChapterSelect.jsx';
import NovelGameplay from './NovelGameplay.jsx';
import ChapterStoryRenderer from './ChapterStoryRenderer.jsx';
import ImmersiveStoryRenderer from './ImmersiveStoryRenderer.jsx';
import './StoryModeSetup.css';

// 辅助函数：从字符串或对象中提取JSON数据
const extractData = (result, fallback = {}) => {
  if (typeof result === 'object' && result !== null) {
    return result;
  }
  if (typeof result === 'string') {
    try {
      return JSON.parse(result);
    } catch {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch {
          return fallback;
        }
      }
    }
  }
  return fallback;
};

const StoryModeSetup = ({ onOpenApiSettings }) => {
  const navigate = useNavigate();
  const { dispatch, state } = useGameState();
  const [storyPrompt, setStoryPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState('setup'); // setup, novel-list, upload, chapter-select, gameplay, chapter-select, chapter-gameplay
  const [novels, setNovels] = useState([]);
  const [selectedNovel, setSelectedNovel] = useState(null);
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [selectedCharacterObj, setSelectedCharacterObj] = useState(null);

  // 章节模式相关状态
  const [chapters, setChapters] = useState([]); // 可用章节列表
  const [selectedChapterData, setSelectedChapterData] = useState(null); // 选中的章节数据
  const [narrativeHistory, setNarrativeHistory] = useState([]); // 叙事历史

  // 加载用户小说列表
  useEffect(() => {
    if (view === 'novel-list') {
      loadNovels();
    }
  }, [view]);

  const loadNovels = async () => {
    try {
      const data = await getNovels();
      // GET /novels 返回数组，API返回 { novelId, ... }
      const novelsList = Array.isArray(data) ? data : (data.novels || []);
      setNovels(novelsList);
    } catch (err) {
      console.error('加载小说列表失败:', err);
    }
  };

  const handleNovelUploaded = (result) => {
    // API 返回 { novelId, name, chapters, ... }，转换为 id 字段
    const novel = {
      id: result.novelId,
      name: result.name,
      type: result.type,
      chapters: result.chapters || [],
      created_at: new Date().toISOString()
    };
    setSelectedNovel(novel);
    setView('chapter-select');
    loadNovels();
  };

  const handleSelectChapter = (chapterId, characterName, charObj = null) => {
    setSelectedChapter({ id: chapterId });
    setSelectedCharacter(characterName);
    // 优先使用传入的角色对象，否则尝试从 state.characters 查找
    if (charObj) {
      setSelectedCharacterObj(charObj);
    } else {
      const foundChar = state.characters.find(c => c.name === characterName);
      setSelectedCharacterObj(foundChar || null);
    }
    setView('gameplay');
  };

  const handleChapterBack = () => {
    setView('novel-list');
    loadNovels();
  };

  const handleGameplayComplete = () => {
    setView('chapter-select');
  };

  // ========== 章节模式相关 ==========

  // 检查是否有可用的世界观/角色/场景数据
  const hasWorldData = () => {
    return state.world && state.characters && state.characters.length > 0 && state.scenes && state.scenes.length > 0;
  };

  // 加载叙事历史
  const loadNarrativeHistory = async () => {
    if (!state.world?.id) return;
    try {
      const snapshots = await getNarrativeSnapshots(state.world.id);
      setNarrativeHistory(snapshots || []);
    } catch (err) {
      console.error('加载叙事历史失败:', err);
    }
  };

  // 进入章节选择
  const handleEnterChapterMode = () => {
    if (!hasWorldData()) {
      setError('请先创建世界观、角色和场景后再使用章节模式');
      return;
    }
    setError('');
    loadNarrativeHistory();
    // 初始化默认章节
    const defaultChapters = [
      {
        id: 'chapter_1',
        title: '第一章',
        endingGoal: '完成初始冲突',
        scenes: state.scenes.slice(0, Math.min(3, state.scenes.length)),
        characters: state.characters,
        maxTurns: 40,
        normalPhaseTurns: 30
      }
    ];
    setChapters(defaultChapters);
    setView('chapter-select');
  };

  // 选择章节开始游戏
  const handleStartChapter = (chapter) => {
    const protagonist = state.characters.find(c => c.isProtagonist) || state.characters[0];
    setSelectedChapterData({
      ...chapter,
      protagonistName: protagonist?.name || '主角',
      protagonist: protagonist // 保存完整角色对象
    });
    setSelectedCharacter(protagonist?.name || '主角');
    setSelectedCharacterObj(protagonist || null);
    setView('chapter-gameplay');
  };

  // 章节结束回调
  const handleChapterEnd = (result) => {
    console.log('[章节模式] 章节结束:', result);
    // 返回章节选择
    setView('chapter-select');
    setSelectedChapterData(null);
  };

  // 章节模式返回
  const handleChapterModeBack = () => {
    setView('setup');
    setChapters([]);
    setSelectedChapterData(null);
    setNarrativeHistory([]);
  };

  const handleGenerateStory = async () => {
    if (!storyPrompt.trim()) {
      setError('请输入剧情提示词');
      return;
    }

    setIsGenerating(true);
    setError('');

    try {
      // 构建生成世界观的提示词
      const worldPrompt = `基于以下剧情设定，生成一个完整的世界观：

剧情概要：${storyPrompt}

请生成一个JSON格式的世界设定，包含：
{
  "name": "世界名称",
  "description": "世界观详细描述（300字以内）",
  "setting": "背景设定细节"
}`;

      const worldResult = await generateWithAI(worldPrompt, 'deepseek', { maxTokens: MAX_TOKENS.CONTENT, jsonResponse: true });
      const worldData = extractData(worldResult);

      // 更新世界观
      dispatch({
        type: 'UPDATE_WORLD',
        payload: {
          name: worldData.name || '未命名世界',
          description: worldData.description || worldData.setting || '',
          setting: worldData.setting || worldData.description || ''
        }
      });

      // 生成主角
      const protagonistPrompt = `基于以下剧情设定，生成一个主角：

剧情概要：${storyPrompt}
世界观：${worldData.description || worldData.setting || ''}

请生成一个JSON格式的主角设定：
{
  "name": "主角姓名",
  "personality": "性格特点详细描述",
  "appearance": "外貌描述",
  "background": "背景故事"
}`;

      const protagonistResult = await generateWithAI(protagonistPrompt, 'deepseek', { maxTokens: MAX_TOKENS.CONTENT, jsonResponse: true });
      const protagonistData = extractData(protagonistResult);

      // 添加主角
      const protagonistId = `protagonist_${Date.now()}`;
      dispatch({
        type: 'ADD_CHARACTER',
        payload: {
          id: protagonistId,
          name: protagonistData.name || '主角',
          personality: protagonistData.personality || '',
          appearance: protagonistData.appearance || '',
          background: protagonistData.background || '',
          isProtagonist: true
        }
      });

      // 生成初始场景
      const scenePrompt = `基于以下设定，生成一个初始场景：

世界观：${worldData.description || worldData.setting || ''}
剧情概要：${storyPrompt}

请生成一个JSON格式的场景设定：
{
  "name": "场景名称",
  "description": "场景详细描述（150字以内）"
}`;

      const sceneResult = await generateWithAI(scenePrompt, 'deepseek', { maxTokens: MAX_TOKENS.CONTENT, jsonResponse: true });
      const sceneData = extractData(sceneResult);

      // 添加初始场景
      const sceneId = `scene_${Date.now()}`;
      dispatch({
        type: 'ADD_SCENE',
        payload: {
          id: sceneId,
          name: sceneData.name || '初始场景',
          description: sceneData.description || '',
          connectedScenes: []
        }
      });

      // 设置当前场景
      dispatch({ type: 'SET_CURRENT_SCENE', payload: sceneId });

      // 移动主角到初始场景
      dispatch({
        type: 'MOVE_CHARACTER',
        payload: { characterId: protagonistId, sceneId }
      });

      // 生成其他角色（2-3个）
      const charactersPrompt = `基于以下设定，生成3个配角角色：

世界观：${worldData.description || worldData.setting || ''}
剧情概要：${storyPrompt}

请生成一个JSON格式的角色列表：
{
  "characters": [
    {
      "name": "角色1姓名",
      "personality": "性格特点",
      "appearance": "外貌描述"
    },
    {
      "name": "角色2姓名",
      "personality": "性格特点",
      "appearance": "外貌描述"
    },
    {
      "name": "角色3姓名",
      "personality": "性格特点",
      "appearance": "外貌描述"
    }
  ]
}`;

      const charactersResult = await generateWithAI(charactersPrompt, 'deepseek', { maxTokens: MAX_TOKENS.CONTENT, jsonResponse: true });
      const charactersData = extractData(charactersResult);

      // 添加配角角色
      if (charactersData.characters && Array.isArray(charactersData.characters)) {
        charactersData.characters.forEach((char, index) => {
          const charId = `npc_${Date.now()}_${index}`;
          dispatch({
            type: 'ADD_CHARACTER',
            payload: {
              id: charId,
              name: char.name || `角色${index + 1}`,
              personality: char.personality || '',
              appearance: char.appearance || '',
              isProtagonist: false,
              currentSceneId: sceneId
            }
          });
        });
      }

      // 进入游戏
      navigate('/play');
    } catch (err) {
      console.error('生成剧情失败:', err);
      setError(`生成失败: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // 根据视图渲染不同内容
  if (view === 'upload') {
    return (
      <NovelUpload
        onSuccess={handleNovelUploaded}
        onBack={() => setView('novel-list')}
      />
    );
  }

  // 小说模式 - 章节选择（需要selectedNovel）
  if (view === 'chapter-select' && selectedNovel) {
    return (
      <NovelChapterSelect
        novelId={selectedNovel.id}
        onSelectChapter={handleSelectChapter}
        onBack={handleChapterBack}
      />
    );
  }

  if (view === 'gameplay' && selectedNovel && selectedChapter && selectedCharacter) {
    // 从 selectedNovel.chapters 中获取完整的章节数据
    const fullChapter = selectedNovel.chapters?.find(c => c.id === selectedChapter.id) || selectedChapter;
    return (
      <ImmersiveStoryRenderer
        chapter={{ ...fullChapter, novelId: selectedNovel.id }}
        character={selectedCharacterObj}
        characterName={selectedCharacter}
        onBack={() => {
          handleChapterBack();
        }}
        onChapterEnd={(chapterId, characterName) => {
          handleGameplayComplete();
        }}
        world={state.world}
      />
    );
  }

  // 章节模式 - 章节选择视图
  if (view === 'chapter-select' && !selectedNovel) {
    return (
      <div className="story-mode-setup">
        <div className="setup-header">
          <button className="back-btn" onClick={handleChapterModeBack}>← 返回</button>
          <h2>章节模式</h2>
        </div>

        {/* 叙事历史预览 */}
        {narrativeHistory.length > 0 && (
          <div className="narrative-history-preview">
            <div className="history-header">
              <span className="history-icon">📜</span>
              <span>过往选择 ({narrativeHistory.length})</span>
            </div>
            <div className="history-summary">
              {narrativeHistory.slice(-3).map((snap, idx) => (
                <div key={idx} className="history-item">
                  <span className="history-chapter">{snap.chapterId || `选择 ${idx + 1}`}</span>
                  <span className="history-choice">{snap.narrativeSummary || '无描述'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="chapter-list">
          {chapters.length === 0 ? (
            <div className="empty-state">
              <p>暂无可用章节</p>
              <p className="hint">请先在自由模式中创建角色和场景</p>
            </div>
          ) : (
            chapters.map((chapter, idx) => (
              <div
                key={chapter.id || idx}
                className="chapter-item"
                onClick={() => handleStartChapter(chapter)}
              >
                <div className="chapter-icon">📖</div>
                <div className="chapter-details">
                  <h3>{chapter.title || `第${idx + 1}章`}</h3>
                  <p className="chapter-meta">
                    结局目标：{chapter.endingGoal} · {chapter.maxTurns || 40}回合
                  </p>
                  <p className="chapter-scenes">
                    包含 {chapter.scenes?.length || 0} 个场景
                  </p>
                </div>
                <div className="chapter-start">开始 →</div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // 章节模式 - 游戏视图
  if (view === 'chapter-gameplay' && selectedChapterData) {
    return (
      <ImmersiveStoryRenderer
        chapter={selectedChapterData}
        character={selectedChapterData.protagonist}
        characterName={selectedChapterData.protagonistName}
        onBack={handleChapterModeBack}
        onChapterEnd={handleChapterEnd}
        world={state.world}
      />
    );
  }

  if (view === 'novel-list') {
    return (
      <div className="story-mode-setup">
        <div className="setup-header">
          <button className="back-btn" onClick={() => setView('setup')}>← 返回</button>
          <h2>我的小说</h2>
          <button className="upload-btn" onClick={() => setView('upload')}>上传小说</button>
        </div>

        <div className="novel-list">
          {novels.length === 0 ? (
            <div className="empty-state">
              <p>还没有上传的小说</p>
              <button className="primary-btn" onClick={() => setView('upload')}>
                上传第一部小说
              </button>
            </div>
          ) : (
            novels.map(novel => (
              <div
                key={novel.id}
                className="novel-item"
                onClick={() => {
                  setSelectedNovel(novel);
                  setView('chapter-select');
                }}
              >
                <div className="novel-icon">📚</div>
                <div className="novel-details">
                  <h3>{novel.name}</h3>
                  <p className="novel-meta">类型：{novel.type} · {novel.chapters?.length || 0}章</p>
                  <p className="novel-date">{new Date(novel.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // 默认显示 setup 视图
  return (
    <div className="story-mode-setup">
      <div className="setup-header">
        <h2>剧情模式</h2>
        <p className="setup-subtitle">选择一个剧情创建方式</p>
      </div>

      <div className="setup-options">
        {/* AI生成剧情选项 */}
        <div className="setup-option ai-generate">
          <div className="option-icon">🤖</div>
          <h3>AI生成剧情</h3>
          <p className="option-desc">输入你的剧情创意，AI将为你创建完整的世界观、角色和场景</p>

          <div className="prompt-input-area">
            <textarea
              className="story-prompt-input"
              value={storyPrompt}
              onChange={(e) => setStoryPrompt(e.target.value)}
              placeholder={"描述你想要的剧情，例如：\n一个发生在未来都市的赛博朋克故事，主角是一名黑客..."}
              rows={5}
              disabled={isGenerating}
            />
            {error && <p className="error-message">{error}</p>}
            <button
              className="generate-btn"
              onClick={handleGenerateStory}
              disabled={isGenerating || !storyPrompt.trim()}
            >
              {isGenerating ? '生成中...' : '开始生成'}
            </button>
          </div>
        </div>

        {/* 体验小说剧情选项 */}
        <div className="setup-option novel-mode" onClick={() => setView('novel-list')}>
          <div className="option-icon">📚</div>
          <h3>体验小说剧情</h3>
          <p className="option-desc">上传小说文本，AI将解析并生成可体验的剧情</p>
        </div>

        {/* 章节模式选项 */}
        <div className="setup-option chapter-mode" onClick={handleEnterChapterMode}>
          <div className="option-icon">📖</div>
          <h3>章节模式</h3>
          <p className="option-desc">基于已有的世界观/角色/场景，在章节框架内自由探索剧情</p>
        </div>
      </div>

      <div className="setup-footer">
        <button className="back-btn" onClick={() => navigate('/')}>
          返回
        </button>
      </div>
    </div>
  );
};

export default StoryModeSetup;
