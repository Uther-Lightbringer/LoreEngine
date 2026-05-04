import React, { useState, useRef, useEffect } from 'react';
import { useGameState } from '../store/gameState.jsx';
import {
  exportSave,
  saveGameToDatabase,
  saveTimestamp,
  setCurrentWorldId,
  saveCurrentWorldToCache,
  saveCharacterToDatabase,
  savePhotoToDatabase,
  loadPhotosFromDatabase
} from '../services/saveService.js';
import TimeTravelPanel from './TimeTravelPanel.jsx';
import WorldSwitcher from './WorldSwitcher.jsx';
import GameTimeDisplay from './GameTimeDisplay.jsx';
import { generateWithAI, setProviderConfig, getProviderConfigExport, MAX_TOKENS } from '../services/aiService.js';
import { generateImage, imageToImage, imageToImageWithProgress, uploadImage } from '../services/imageService.js';
import { getUser } from '../services/authService.js';
import apiClient from '../services/apiClient.js';
import { generateScenesFromMap } from '../services/apiService.js';
import {
  loadMemoriesFromDatabase,
  saveMemoriesToDatabase,
  saveCharacterMemoriesToDatabase,
  getCharacterMemoriesText,
  extractMemoriesFromDialogue,
  mergeMemories,
  cleanupMemories,
  consolidateMemoriesWithAI
} from '../services/characterMemoryService.js';
import ImageModal from './ImageModal.jsx';
import PlayerStatusBar from './PlayerStatusBar.jsx';
import CharacterStatusPanel from './CharacterStatusPanel.jsx';
import WorldMapModal from './WorldMapModal.jsx';
import NarratorMemoryPanel from './NarratorMemoryPanel.jsx';
import ClothingChangeModal from './ClothingChangeModal.jsx';
import {
  getTimeInfluencePrompt,
  getSceneImageByTime,
  formatGameTimeForMemory
} from '../utils/gameTime.js';
import './SceneView.css';
import './CharacterStatusPanel.css';

// 主角信息组件
const ProtagonistInfo = ({ protagonist, onEdit, onRegenerate, needsRegen }) => {
  if (!protagonist) return null;

  const physical = protagonist.physicalAppearance || {};

  return (
    <div className="protagonist-info">
      <div className="protagonist-avatar">
        {protagonist.imageUrl ? (
          <img src={protagonist.imageUrl} alt={protagonist.name} />
        ) : (
          <div className="avatar-placeholder">👤</div>
        )}
      </div>
      <div className="protagonist-details">
        <div className="protagonist-name">{protagonist.name}</div>
        <div className="protagonist-title">主角</div>
      </div>
      <div className="protagonist-edit-buttons">
        <button
          className="edit-btn"
          onClick={() => onEdit('hairStyle', physical.hairStyle || '')}
          title="修改发型"
        >
          💇 发型
        </button>
        <button
          className="edit-btn"
          onClick={() => onEdit('hairColor', physical.hairColor || '')}
          title="修改发色"
        >
          🎨 发色
        </button>
        <button
          className="edit-btn"
          onClick={() => onEdit('eyeColor', physical.eyeColor || '')}
          title="修改眼睛"
        >
          👁️ 眼睛
        </button>
        <button
          className="edit-btn"
          onClick={() => onEdit('height', physical.height || '')}
          title="修改身高"
        >
          📏 身高
        </button>
        <button
          className="edit-btn"
          onClick={() => onEdit('clothing', physical.clothing || '')}
          title="修改穿着"
        >
          👔 穿着
        </button>
      </div>
      {needsRegen && (
        <button className="regenerate-btn" onClick={onRegenerate}>
          🔄 重新生成角色图
        </button>
      )}
    </div>
  );
};

// 默认 AI 提供商
const DEFAULT_PROVIDER = 'deepseek';

const SceneView = ({ onBackToMenu }) => {
  const { state, dispatch, saveGame } = useGameState();
  const [isAdmin, setIsAdmin] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showTimeTravel, setShowTimeTravel] = useState(false);
  const [showWorldSwitcher, setShowWorldSwitcher] = useState(false);
  const [showNarratorMemory, setShowNarratorMemory] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isTakingPhoto, setIsTakingPhoto] = useState(false); // 拍照中
  const [showTakingPhoto, setShowTakingPhoto] = useState(false); // 显示"正在拍照"对话框
  const [showPhotoGenerated, setShowPhotoGenerated] = useState(false); // 显示"照片已生成"对话框
  const [photoResult, setPhotoResult] = useState(null); // 当前拍照结果（图片URL）
  const [photoAlbum, setPhotoAlbum] = useState([]); // 相册（所有拍过的照片）
  const [showAlbum, setShowAlbum] = useState(false); // 显示相册
  const [fullscreenPhoto, setFullscreenPhoto] = useState(null); // 全屏显示的照片
  const [showPhotoOptions, setShowPhotoOptions] = useState(false); // 显示拍照选项对话框
  const [photoMode, setPhotoMode] = useState('text'); // 拍照模式：'text' 文生图, 'image2image' 图生图
  const [photoAngle, setPhotoAngle] = useState(''); // 拍摄角度
  const [photoPose, setPhotoPose] = useState(''); // 统一姿势
  const [photoMood, setPhotoMood] = useState(''); // 氛围/心情
  const [photoCustom, setPhotoCustom] = useState(''); // 自定义描述
  const [photoCharacterPoses, setPhotoCharacterPoses] = useState({}); // 每个角色的单独动作 { charId: pose }
  const [photoCoopPose, setPhotoCoopPose] = useState(''); // 合作pose
  const [showMenu, setShowMenu] = useState(false);
  const [showTimeSkip, setShowTimeSkip] = useState(false);
  const [freeInputAction, setFreeInputAction] = useState('');
  const [freeInputDialogue, setFreeInputDialogue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiProvider, setAiProvider] = useState(() => {
    // 先尝试从 localStorage 读取上次使用的提供商
    const lastProvider = localStorage.getItem('last_provider');
    return lastProvider || DEFAULT_PROVIDER;
  });
  const [providerConfig, setProviderConfigState] = useState(() => getProviderConfigExport(DEFAULT_PROVIDER));
  const [configLoaded, setConfigLoaded] = useState(false);
  const [choices, setChoices] = useState([]);
  const [isGeneratingChoices, setIsGeneratingChoices] = useState(false);
  const [modalImage, setModalImage] = useState(null);
  const [selectedTalkingCharacters, setSelectedTalkingCharacters] = useState([]); // 支持多选角色
  const [dialogueStartIndex, setDialogueStartIndex] = useState(0);
  const [showCharacterStatus, setShowCharacterStatus] = useState(null); // 显示角色状态栏的角色
  const [skillActivationMessage, setSkillActivationMessage] = useState(''); // 技能发动提示文字
  const [clothingChangeMessage, setClothingChangeMessage] = useState(''); // 换装提示文字（持续显示直到图片生成）
  const [showCharacterMemory, setShowCharacterMemory] = useState(null); // 显示角色记忆面板的角色
  const [statusChanges, setStatusChanges] = useState({}); // 存储角色状态变化: { characterId: [{ id, label, value, type }] }
  const [compressingCharacters, setCompressingCharacters] = useState(new Set()); // 正在压缩记忆的角色ID集合
  const [respondingCharacters, setRespondingCharacters] = useState([]); // 正在回应的角色队列
  const [isMultiCharacterResponding, setIsMultiCharacterResponding] = useState(false); // 是否正在进行多角色回应
  const [refreshingAvatars, setRefreshingAvatars] = useState(new Set()); // 正在刷新头像的角色ID集合
  const [waitingForConfirm, setWaitingForConfirm] = useState(false); // 是否等待用户确认继续
  const [pendingCharacterResponse, setPendingCharacterResponse] = useState(null); // 待处理的角色回应
  const [hoveredSkill, setHoveredSkill] = useState(null); // 当前鼠标悬停的技能
  const [skillTooltipPos, setSkillTooltipPos] = useState({ x: 0, y: 0 }); // 技能提示框位置
  const [pendingCharacterMove, setPendingCharacterMove] = useState(null); // 待确认的角色移动: { character, moveTo, targetSceneName }
  const [showProtagonistEdit, setShowProtagonistEdit] = useState(false); // 显示主角编辑对话框
  const [protagonistEditField, setProtagonistEditField] = useState(''); // 当前编辑的字段
  const [protagonistEditValue, setProtagonistEditValue] = useState(''); // 编辑的值
  const [protagonistClothingChange, setProtagonistClothingChange] = useState(''); // 主角换装提示
  const [protagonistNeedsRegen, setProtagonistNeedsRegen] = useState(false); // 主角是否需要重新生成图片
  const [showCharacterEdit, setShowCharacterEdit] = useState(false); // 显示角色编辑面板
  const [editingCharacter, setEditingCharacter] = useState(null); // 当前编辑的角色
  const [characterEditData, setCharacterEditData] = useState({}); // 当前编辑的数据
  const [characterNeedsRegen, setCharacterNeedsRegen] = useState({}); // 哪些角色需要重新生成图片 { charId: true }
  const [characterRegenerating, setCharacterRegenerating] = useState(null); // 正在重新生成的角色ID
  const [showClothingChangeModal, setShowClothingChangeModal] = useState(false); // 显示换衣弹窗
  const [clothingChangeCharacter, setClothingChangeCharacter] = useState(null); // 正在换衣的角色
  const [showMindPowerModal, setShowMindPowerModal] = useState(false); // 显示念力弹窗
  const [mindPowerTarget, setMindPowerTarget] = useState(null); // 念力目标角色
  const [mindPowerInput, setMindPowerInput] = useState(''); // 念力输入内容
  const [isMindPowerProcessing, setIsMindPowerProcessing] = useState(false); // 念力处理中
  const historyEndRef = useRef(null);

  // 选项缓存：{ cacheKey: { lastDialogueIndex: number, choices: string[] } }
  // cacheKey格式：单个角色用"char_id"，多个角色用"char_id1,char_id2,char_id3"（按字母排序）
  const choicesCacheRef = useRef({});
  // 记录上次实际对话（非系统消息）的索引
  const lastRealDialogueIndexRef = useRef(0);
  // 防止重复生成的标记
  const isGeneratingRef = useRef(false);
  // 记录最后一次处理的对话索引
  const lastProcessedDialogueIndexRef = useRef(-1);
  // 场景懒加载相关：记录正在懒加载的场景ID
  const lazyLoadingSceneIdRef = useRef(null);
  // 记录已处理的懒加载场景（避免重复处理）
  const processedLazyLoadsRef = useRef(new Set());

  // 生成缓存键：根据选中的角色列表生成唯一缓存键
  const getCacheKey = (characters) => {
    if (!characters || characters.length === 0) return '';
    // 按角色ID排序，确保相同组合生成相同的键
    const sortedIds = characters.map(c => c.id).sort();
    return sortedIds.join(',');
  };

  // 初始化管理员权限
  useEffect(() => {
    const user = getUser();
    setIsAdmin(user?.isAdmin || false);
  }, []);

  // 从数据库加载角色记忆
  useEffect(() => {
    if (!state.world?.id) return;

    const loadMemories = async () => {
      try {
        // 优先从数据库加载
        const dbMemories = await loadMemoriesFromDatabase(state.world.id);
        if (dbMemories && Object.keys(dbMemories).length > 0) {
          Object.keys(dbMemories).forEach(characterId => {
            dispatch({
              type: 'UPDATE_CHARACTER_MEMORIES',
              payload: {
                characterId,
                memories: dbMemories[characterId].memories || []
              }
            });
          });
        }
      } catch (error) {
        console.error('[记忆] 加载失败:', error);
      }
    };

    loadMemories();
  }, [dispatch, state.world?.id]);

  // 从数据库加载照片
  useEffect(() => {
    if (state.world?.id) {
      loadPhotosFromDatabase(state.world.id).then(photos => {
        if (photos.length > 0) {
          setPhotoAlbum(photos);
        }
      });
    }
  }, [state.world?.id]);

  // 保存角色记忆到数据库
  useEffect(() => {
    if (!state.world?.id || !state.characterMemories || Object.keys(state.characterMemories).length === 0) {
      return;
    }

    // 节流：避免频繁保存
    const saveTimeout = setTimeout(() => {
      saveMemoriesToDatabase(state.world.id, state.characterMemories);
    }, 1000);

    return () => clearTimeout(saveTimeout);
  }, [state.characterMemories, state.world?.id]);

  // 加载默认配置
  useEffect(() => {
    const init = () => {
      const lastProvider = localStorage.getItem('last_provider');
      const initialProvider = lastProvider || DEFAULT_PROVIDER;
      setAiProvider(initialProvider);
      setProviderConfigState(getProviderConfigExport(initialProvider));
      setConfigLoaded(true);
    };
    init();
  }, []);

  useEffect(() => {
    if (configLoaded) {
      setProviderConfigState(getProviderConfigExport(aiProvider));
    }
  }, [aiProvider, configLoaded]);

  const currentScene = state.scenes.find(s => s.id === state.currentSceneId);
  const sceneCharacters = (currentScene?.npcs || [])
    .map(id => state.characters.find(c => c.id === id))
    .filter(Boolean);

  const protagonist = state.characters.find(c => c.isProtagonist);

  // 应用技能效果到选中的角色
  // 解析技能描述中的数值效果
  const parseNumericEffect = (text, keywords) => {
    // 匹配多种格式：+10, -10, 10点, 增加10, 减少10, 提升10, 降低10
    const patterns = [
      new RegExp(`[${keywords}][^0-9]*([+-]?\\d+)`),
      new RegExp(`([+-]?\\d+)[^0-9]*[${keywords}]`),
      new RegExp(`(增加|提升|减少|降低|减去)[${keywords}]*?(\\d+)`),
      new RegExp(`[${keywords}]*(增加|提升|减少|降低|减去)(\\d+)`),
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        // 判断是增加还是减少
        const fullMatch = match[0];
        const isDecrease = fullMatch.includes('减少') || fullMatch.includes('降低') || fullMatch.includes('减去') || fullMatch.startsWith('-');
        let value = parseInt(match[match.length - 1]);
        if (isDecrease) value = -value;
        return value;
      }
    }
    return null;
  };

  const applySkillToCharacter = (skill, targetChar) => {
    if (!skill || !skill.description || !targetChar) return null;

    const effect = skill.description;
    const results = [];

    // 解析技能效果 - 好感度
    const affectionValue = parseNumericEffect(effect, '好感');
    if (affectionValue !== null) {
      const currentAffection = targetChar.characterStatus?.relationship?.affection || 50;
      const newAffection = Math.max(0, Math.min(100, currentAffection + affectionValue));
      results.push({ type: 'affection', value: affectionValue, from: currentAffection, to: newAffection });
    }

    // 信赖度
    const trustValue = parseNumericEffect(effect, '信赖');
    if (trustValue !== null) {
      const currentTrust = targetChar.characterStatus?.relationship?.trust || 50;
      const newTrust = Math.max(0, Math.min(100, currentTrust + trustValue));
      results.push({ type: 'trust', value: trustValue, from: currentTrust, to: newTrust });
    }

    // 服从度
    const obedienceValue = parseNumericEffect(effect, '服从');
    if (obedienceValue !== null) {
      const currentObedience = targetChar.characterStatus?.relationship?.obedience || 30;
      const newObedience = Math.max(0, Math.min(100, currentObedience + obedienceValue));
      results.push({ type: 'obedience', value: obedienceValue, from: currentObedience, to: newObedience });
    }

    // 精神压力 - 这个是减少压力的效果
    const stressReduction = parseNumericEffect(effect, '精神压力');
    if (stressReduction !== null) {
      const currentStress = targetChar.characterStatus?.mentalStress || 20;
      const newStress = Math.max(0, Math.min(100, currentStress - stressReduction));
      results.push({ type: 'mentalStress', value: -stressReduction, from: currentStress, to: newStress });
    }

    // 自我意识
    const selfAwarenessValue = parseNumericEffect(effect, '自我意识自我意志');
    if (selfAwarenessValue !== null) {
      const currentSelfAwareness = targetChar.characterStatus?.selfAwareness || 50;
      const newSelfAwareness = Math.max(0, Math.min(100, currentSelfAwareness + selfAwarenessValue));
      results.push({ type: 'selfAwareness', value: selfAwarenessValue, from: currentSelfAwareness, to: newSelfAwareness });
    }

    // 健康/HP效果
    const healthMatch = effect.match(/HP[+-]?(\d+)|生命[+-]?(\d+)/);
    if (healthMatch) {
      const value = parseInt(healthMatch[1] || healthMatch[2]);
      results.push({ type: 'health', value, description: `生命值${value > 0 ? '恢复' : '损失'}${Math.abs(value)}点` });
    }

    // 收服效果
    const captureMatch = effect.match(/收服|成为我的|臣服/);
    if (captureMatch) {
      results.push({ type: 'capture', value: true });
    }

    // 状态标签效果 - 解析技能添加的状态标签
    // 例如："赋予'被魅惑'状态"、"追加'恐惧'效果"、"附加'心动'状态"
    const stateTagMatch = effect.match(/'(.+?)'状态|追加'(.+?)'效果|附加'(.+?)'|赋予(.+?)状态|增加(.+?)状态/);
    if (stateTagMatch) {
      const tagName = stateTagMatch[1] || stateTagMatch[2] || stateTagMatch[3] || stateTagMatch[4] || stateTagMatch[5];
      if (tagName) {
        results.push({ type: 'stateTag', value: tagName.trim() });
      }
    }

    // 情绪效果 - 解析技能改变的情绪
    // 例如："感到愉悦"、"陷入悲伤"、"愤怒"
    const emotionMatch = effect.match(/感到(.+?)[，,]?|陷入(.+?)[，,]?|变成(.+?)表情|情绪变成(.+?)[，,]?/);
    if (emotionMatch) {
      const emotion = emotionMatch[1] || emotionMatch[2] || emotionMatch[3] || emotionMatch[4];
      if (emotion) {
        results.push({ type: 'emotion', value: emotion.trim() });
      }
    }

    // 表情效果 - 解析技能改变的表情
    // 例如："表情变成微笑"、"露出微笑"、"表情严肃"
    const expressionMatch = effect.match(/表情变成(.+?)[，,]?|露出(.+?)[，,]?|表情(.+?)[，,]?/);
    if (expressionMatch) {
      const expression = expressionMatch[1] || expressionMatch[2] || expressionMatch[3];
      if (expression) {
        results.push({ type: 'expression', value: expression.trim() });
      }
    }

    return results;
  };

  // AI更新角色描述（根据状态变化）
  const updateCharacterDescriptionWithAI = async (character, effects, skillName) => {
    if (!character || !effects || effects.length === 0) return;

    // 收集需要更新描述的效果
    const stateTagEffects = effects.filter(e => e.type === 'stateTag');
    const emotionEffects = effects.filter(e => e.type === 'emotion');
    const expressionEffects = effects.filter(e => e.type === 'expression');
    const captureEffect = effects.find(e => e.type === 'capture');

    // 如果没有需要更新描述的效果，直接返回
    if (stateTagEffects.length === 0 && emotionEffects.length === 0 &&
        expressionEffects.length === 0 && !captureEffect) return;

    try {
      const prompt = `角色信息：
名字：${character.name}
性别：${character.gender}
原有性格描述：${character.personality || '未设定'}
原有外貌描述：${character.appearance || '未设定'}
原有表情：${character.characterStatus?.expression?.currentExpression || '自然'}
原有情绪：${character.characterStatus?.currentEmotion || '平静'}
原有状态标签：${JSON.stringify(character.characterStatus?.stateTags || [])}

技能「${skillName}」对${character.name}产生了以下效果：
${effects.map(e => {
  switch (e.type) {
    case 'stateTag': return `- 赋予状态：${e.value}`;
    case 'emotion': return `- 情绪变化：${e.value}`;
    case 'expression': return `- 表情变化：${e.value}`;
    case 'capture': return `- ${character.name}被主角收服了！`;
    default: return '';
  }
}).filter(Boolean).join('\n')}

请根据以上信息，生成更新后的角色描述。

要求：
1. 如果角色被收服，需要大幅修改性格描述，体现服从和亲近
2. 如果有状态标签（如"被魅惑"、"恐惧"等），需要在性格和表情描述中体现
3. 如果有情绪变化，需要在表情描述中体现
4. 保持角色原有设定的基础特征不变（名字、性别、外貌特征）
5. 只返回纯JSON格式，包含以下字段：
{
  "personality": "更新后的性格描述（50-100字）",
  "appearance": "更新后的外貌描述（50-100字，如果外貌没变化则与原有相同）",
  "currentEmotion": "当前情绪",
  "expression": "当前表情",
  "stateTags": "状态标签数组"
}

请直接返回JSON，不要包含任何其他文字。`;

      const result = await generateWithAI(prompt, aiProvider, {
        maxTokens: MAX_TOKENS.CONTENT,
        jsonResponse: true,
        temperature: 0.7
      });

      if (result && typeof result === 'object') {
        // 构建更新对象
        const updates = {};

        if (result.personality) {
          updates.personality = result.personality;
        }

        if (result.appearance) {
          updates.appearance = result.appearance;
        }

        // 更新 characterStatus
        const characterStatusUpdates = {};
        if (result.currentEmotion) {
          characterStatusUpdates.currentEmotion = result.currentEmotion;
        }
        if (result.expression) {
          characterStatusUpdates.expression = {
            ...(character.characterStatus?.expression || {}),
            currentExpression: result.expression,
            facialDetails: character.characterStatus?.expression?.facialDetails || ''
          };
        }
        if (result.stateTags && Array.isArray(result.stateTags)) {
          // 合并新的状态标签
          const currentTags = character.characterStatus?.stateTags || [];
          const newTags = [...new Set([...currentTags, ...result.stateTags])];
          characterStatusUpdates.stateTags = newTags;
        }

        if (Object.keys(characterStatusUpdates).length > 0) {
          updates.characterStatus = {
            ...character.characterStatus,
            ...characterStatusUpdates
          };
        }

        // 如果是被收服，添加特殊状态
        if (captureEffect) {
          updates.characterStatus = {
            ...(updates.characterStatus || character.characterStatus),
            isCaptured: true,
            followsPlayer: true
          };
        }

        // 更新角色
        dispatch({
          type: 'UPDATE_CHARACTER',
          payload: {
            id: character.id,
            ...updates
          }
        });

        console.log('[技能] 角色描述已更新:', character.name, updates);
      }
    } catch (error) {
      console.error('[技能] 更新角色描述失败:', error);
    }
  };

  // 使用念力技能 - 让用户输入内容，通过AI影响角色
  const handleOpenMindPower = () => {
    if (selectedTalkingCharacters.length === 0) {
      dispatch({
        type: 'ADD_DIALOGUE',
        payload: { speaker: '系统', text: '请先选择一个角色作为念力目标' }
      });
      return;
    }
    const targetChar = selectedTalkingCharacters[0];
    setMindPowerTarget(targetChar);
    setMindPowerInput('');
    setShowMindPowerModal(true);
  };

  // 提交念力效果
  const handleMindPowerSubmit = async () => {
    if (!mindPowerTarget || !mindPowerInput.trim()) return;

    const protagName = protagonist?.name || '主角';
    setIsMindPowerProcessing(true);

    try {
      // 构建提示词
      const prompt = `【念力技能】主角（${protagName}）对角色（${mindPowerTarget.name}）使用了念力技能。

用户输入的念力内容：「${mindPowerInput}」

角色当前信息：
- 名字：${mindPowerTarget.name}
- 性别：${mindPowerTarget.gender || '未设定'}
- 性格描述：${mindPowerTarget.personality || '未设定'}
- 外貌描述：${mindPowerTarget.appearance || '未设定'}
- 当前情绪：${mindPowerTarget.characterStatus?.currentEmotion || '平静'}
- 当前表情：${mindPowerTarget.characterStatus?.expression?.currentExpression || '自然'}
- 状态标签：${JSON.stringify(mindPowerTarget.characterStatus?.stateTags || [])}
- 好感度：${mindPowerTarget.characterStatus?.relationship?.affection || 50}
- 信赖度：${mindPowerTarget.characterStatus?.relationship?.trust || 50}
- 服从度：${mindPowerTarget.characterStatus?.relationship?.obedience || 30}
- 自我意识：${mindPowerTarget.characterStatus?.selfAwareness || 50}
- 精神压力：${mindPowerTarget.characterStatus?.mentalStress || 20}

请根据用户输入的念力内容，分析并返回对角色产生的效果。念力是一种精神力量，可以影响角色的情绪、表情、状态、甚至性格。

请以JSON格式返回：
{
  "analysis": "分析念力对角色造成了什么影响（20-50字）",
  "personality": "如果念力改变了角色性格，输出新的性格描述（50-100字），如果性格没变化则为空字符串",
  "appearance": "如果念力改变了角色外貌，输出新的外貌描述（50-100字），如果外貌没变化则为空字符串",
  "currentEmotion": "念力后的情绪，如：平静、愉悦、困惑、恼怒、恐惧、害羞等，如果没变化则为空字符串",
  "expression": "念力后的表情，如：微笑、严肃、惊讶、害羞、愤怒等，如果没变化则为空字符串",
  "stateTags": "如果念力附加了状态标签，返回标签数组，如：["被魅惑","恐惧"]，如果没有则为空数组",
  "affectionChange": 好感度变化值（-30到+30），正值表示提升，负值表示下降，如果没变化则为0
  "trustChange": 信赖度变化值（-30到+30），正值表示提升，负值表示下降，如果没变化则为0
  "obedienceChange": 服从度变化值（-30到+30），正值表示提升，负值表示下降，如果没变化则为0
  "selfAwarenessChange": 自我意识变化值（-30到+30），正值表示提升，负值表示下降，如果没变化则为0
  "mentalStressChange": 精神压力变化值（-30到+30），负值表示减压，正值表示增压，如果没变化则为0
}

只返回JSON，不要包含任何其他文字。`;

      const result = await generateWithAI(prompt, aiProvider, {
        maxTokens: MAX_TOKENS.CONTENT,
        jsonResponse: true,
        temperature: 0.8
      });

      if (result && typeof result === 'object') {
        // 构建更新对象
        const updates = {};
        const charStatusUpdates = { ...mindPowerTarget.characterStatus };
        const relationshipUpdates = { ...mindPowerTarget.characterStatus?.relationship };
        let hasUpdates = false;

        // 分析文字
        if (result.analysis) {
          dispatch({
            type: 'ADD_DIALOGUE',
            payload: { speaker: '系统', text: `【念力】${result.analysis}` }
          });
        }

        // 性格变化
        if (result.personality && result.personality.trim()) {
          updates.personality = result.personality;
          hasUpdates = true;
        }

        // 外貌变化
        if (result.appearance && result.appearance.trim()) {
          updates.appearance = result.appearance;
          hasUpdates = true;
        }

        // 情绪变化
        if (result.currentEmotion && result.currentEmotion.trim()) {
          charStatusUpdates.currentEmotion = result.currentEmotion;
          hasUpdates = true;
        }

        // 表情变化
        if (result.expression && result.expression.trim()) {
          charStatusUpdates.expression = {
            ...(mindPowerTarget.characterStatus?.expression || {}),
            currentExpression: result.expression
          };
          hasUpdates = true;
        }

        // 状态标签
        if (result.stateTags && Array.isArray(result.stateTags) && result.stateTags.length > 0) {
          const currentTags = mindPowerTarget.characterStatus?.stateTags || [];
          charStatusUpdates.stateTags = [...new Set([...currentTags, ...result.stateTags])];
          hasUpdates = true;
        }

        // 好感度变化
        if (result.affectionChange && result.affectionChange !== 0) {
          const newAffection = Math.max(0, Math.min(100, (mindPowerTarget.characterStatus?.relationship?.affection || 50) + result.affectionChange));
          relationshipUpdates.affection = newAffection;
          hasUpdates = true;
        }

        // 信赖度变化
        if (result.trustChange && result.trustChange !== 0) {
          const newTrust = Math.max(0, Math.min(100, (mindPowerTarget.characterStatus?.relationship?.trust || 50) + result.trustChange));
          relationshipUpdates.trust = newTrust;
          hasUpdates = true;
        }

        // 服从度变化
        if (result.obedienceChange && result.obedienceChange !== 0) {
          const newObedience = Math.max(0, Math.min(100, (mindPowerTarget.characterStatus?.relationship?.obedience || 30) + result.obedienceChange));
          relationshipUpdates.obedience = newObedience;
          hasUpdates = true;
        }

        // 自我意识变化
        if (result.selfAwarenessChange && result.selfAwarenessChange !== 0) {
          const newSelfAwareness = Math.max(0, Math.min(100, (mindPowerTarget.characterStatus?.selfAwareness || 50) + result.selfAwarenessChange));
          charStatusUpdates.selfAwareness = newSelfAwareness;
          hasUpdates = true;
        }

        // 精神压力变化
        if (result.mentalStressChange && result.mentalStressChange !== 0) {
          const newStress = Math.max(0, Math.min(100, (mindPowerTarget.characterStatus?.mentalStress || 20) + result.mentalStressChange));
          charStatusUpdates.mentalStress = newStress;
          hasUpdates = true;
        }

        // 如果有变化，更新角色
        if (hasUpdates) {
          charStatusUpdates.relationship = relationshipUpdates;
          updates.characterStatus = charStatusUpdates;

          dispatch({
            type: 'UPDATE_CHARACTER',
            payload: {
              id: mindPowerTarget.id,
              ...updates
            }
          });

          // 添加到角色记忆
          dispatch({
            type: 'ADD_CHARACTER_CURRENT_DIALOGUE',
            payload: {
              characterId: mindPowerTarget.id,
              dialogue: {
                speaker: protagName,
                text: `对${mindPowerTarget.name}使用了念力：「${mindPowerInput}」`
              }
            }
          });
        } else {
          dispatch({
            type: 'ADD_DIALOGUE',
            payload: { speaker: '系统', text: `【念力】${mindPowerTarget.name}似乎没有受到影响...` }
          });
        }

        console.log('[念力] 技能效果:', result);
      }
    } catch (error) {
      console.error('[念力] 处理失败:', error);
      dispatch({
        type: 'ADD_DIALOGUE',
        payload: { speaker: '系统', text: `【念力】技能使用失败：${error.message}` }
      });
    } finally {
      setIsMindPowerProcessing(false);
      setShowMindPowerModal(false);
      setMindPowerTarget(null);
      setMindPowerInput('');
    }
  };

  // 处理技能释放 - 只填入输入框
  const handleUseSkill = (skill) => {
    if (!skill || !skill.name) return;
    setFreeInputAction(`【${skill.name}】`);
  };

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [state.dialogueHistory]);

  // 清除技能发动提示（动画持续2秒后自动清除）
  useEffect(() => {
    if (skillActivationMessage) {
      const timer = setTimeout(() => {
        setSkillActivationMessage('');
      }, 2200);
      return () => clearTimeout(timer);
    }
  }, [skillActivationMessage]);

  useEffect(() => {
    if (state.dialogueHistory.length > 0) {
      const lastDialogue = state.dialogueHistory[state.dialogueHistory.length - 1];
      const currentDialogueIndex = state.dialogueHistory.length;

      // 只有当最后一条消息不是旁白消息，并且还没有处理过这条对话时，才重新生成选项
      if (lastDialogue.speaker !== '旁白' &&
          currentDialogueIndex !== lastProcessedDialogueIndexRef.current) {
        lastRealDialogueIndexRef.current = currentDialogueIndex;
        lastProcessedDialogueIndexRef.current = currentDialogueIndex;
        // 玩家主动发起对话，不自动生成选项
      }
    }
  }, [state.dialogueHistory.length]);

  // 获取所有选中对话角色的记忆文本（当前对话 + 历史记忆）
  const getCurrentCharacterMemories = () => {
    if (selectedTalkingCharacters.length === 0) return '';

    const allMemories = selectedTalkingCharacters.map(char => {
      const parts = [];

      // 1. 先添加当前对话（未压缩的完整内容）
      const currentDialogues = state.characterCurrentDialogues?.[char.id];
      if (currentDialogues && currentDialogues.length > 0) {
        parts.push(`## 本次对话（${char.name}）：\n${currentDialogues.map(d => `${d.speaker}: ${d.text}`).join('\n')}`);
      }

      // 2. 再添加历史记忆（压缩后的重点）
      const charMemories = state.characterMemories?.[char.id];
      if (charMemories && charMemories.memories && charMemories.memories.length > 0) {
        parts.push(getCharacterMemoriesText(charMemories.memories, char.name, state.gameTime));
      }

      return parts.filter(Boolean).join('\n\n');
    }).filter(Boolean);

    return allMemories.join('\n\n');
  };

  // 压缩当前对话到记忆中（为指定角色）
  const compressAndSaveMemories = async (character) => {
    // 标记该角色正在压缩记忆
    setCompressingCharacters(prev => new Set([...prev, character.id]));

    const currentDialogues = state.characterCurrentDialogues?.[character.id];
    console.log(`[记忆压缩] ${character.name} 开始压缩记忆，当前对话数: ${currentDialogues?.length || 0}`);

    if (!currentDialogues || currentDialogues.length === 0) {
      console.log(`[记忆压缩] ${character.name} 没有对话，跳过`);
      // 完全没有对话，直接清空
      dispatch({
        type: 'CLEAR_CHARACTER_CURRENT_DIALOGUE',
        payload: { characterId: character.id }
      });
      setCompressingCharacters(prev => {
        const newSet = new Set(prev);
        newSet.delete(character.id);
        return newSet;
      });
      return;
    }

    try {
      console.log(`[记忆压缩] ${character.name} 开始提取记忆，对话内容:`, currentDialogues);
      const newMemories = await extractMemoriesFromDialogue(
        currentDialogues,
        character,
        protagonist,
        aiProvider,
        providerConfig
      );

      console.log(`[记忆压缩] ${character.name} 提取到 ${newMemories?.length || 0} 条新记忆`);

      // 获取当前角色的记忆状态
      const currentMemories = state.characterMemories?.[character.id]?.memories || [];

      if (newMemories && newMemories.length > 0) {
        let mergedMemories = mergeMemories(currentMemories, newMemories);
        console.log(`[记忆压缩] ${character.name} 合并后共有 ${mergedMemories.length} 条记忆`);

        // 检查记忆数量，如果超过20条，使用AI进行整理合并成5条
        if (mergedMemories.length > 20) {
          console.log(`[记忆整理] ${character.name}的记忆超过20条(${mergedMemories.length})，开始AI整理...`);
          mergedMemories = await consolidateMemoriesWithAI(
            mergedMemories,
            character,
            protagonist,
            aiProvider,
            providerConfig
          );
          console.log(`[记忆整理] ${character.name}的记忆已整理为${mergedMemories.length}条`);
        }

        // 更新状态
        dispatch({
          type: 'UPDATE_CHARACTER_MEMORIES',
          payload: {
            characterId: character.id,
            memories: mergedMemories
          }
        });

        // 立即保存到数据库
        if (state.world?.id) {
          const updatedMemoriesObj = {
            ...state.characterMemories,
            [character.id]: {
              characterId: character.id,
              memories: mergedMemories,
              lastInteraction: new Date().toISOString()
            }
          };
          await saveMemoriesToDatabase(state.world.id, updatedMemoriesObj);
        }
      }
    } catch (error) {
      console.error(`Failed to compress memories for ${character.name}:`, error);
    } finally {
      // 无论成功与否，都清空当前对话并解除锁定
      dispatch({
        type: 'CLEAR_CHARACTER_CURRENT_DIALOGUE',
        payload: { characterId: character.id }
      });
      setCompressingCharacters(prev => {
        const newSet = new Set(prev);
        newSet.delete(character.id);
        return newSet;
      });
    }
  };

  // 提取并保存当前对话的记忆（为所有选中的角色）- 保留旧接口兼容性
  const extractAndSaveMemories = async () => {
    // 这个函数现在主要用于保存游戏时的备份提取
    // 正常流程使用 compressAndSaveMemories
  };

  const generateAIChoices = async (forceRegenerate = false) => {
    // 防止重复生成
    if (isGeneratingRef.current) {
      return;
    }

    // 检查缓存（支持选中角色和未选中角色两种情况）
    if (!forceRegenerate) {
      const cacheKey = selectedTalkingCharacters.length > 0 ? getCacheKey(selectedTalkingCharacters) : 'no_character_selected';
      const cache = choicesCacheRef.current[cacheKey];
      // 如果缓存存在且对话没有变化，使用缓存
      if (cache && cache.lastDialogueIndex === lastRealDialogueIndexRef.current) {
        setChoices(cache.choices);
        return;
      }
    }

    // 标记正在生成
    isGeneratingRef.current = true;
    setIsGeneratingChoices(true);
    setChoices([]); // 清空选项，显示"正在生成选项..."

    try {
      const lastFewDialogues = state.dialogueHistory.slice(-8).map(d => `${d.speaker}: ${d.text}`).join('\n');
      const selectedNames = selectedTalkingCharacters.map(c => c.name).join('、');
      const hasSelectedCharacters = selectedTalkingCharacters.length > 0;

      // 获取主角性格信息
      const protagPersonality = state.protagonistPersonality;
      const protagTraits = protagPersonality?.personalityTraits || { extroversion: 50, rationality: 50, orderliness: 50, optimism: 50 };

      const prompt = `
游戏设定：
世界观：${state.world.name} - ${state.world.description}
当前场景：${currentScene?.name} - ${currentScene?.description}
主角：${protagonist?.name || '你'}
主角性格描述：${protagPersonality?.personalityDescription || protagonist?.personality || '普通冒险者'}
主角性格指标数值：
- 外向(${protagTraits.extroversion}/100) - 内向(${100-protagTraits.extroversion}/100)
- 理性(${protagTraits.rationality}/100) - 感性(${100-protagTraits.rationality}/100)
- 守序(${protagTraits.orderliness}/100) - 混乱(${100-protagTraits.orderliness}/100)
- 乐观(${protagTraits.optimism}/100) - 悲观(${100-protagTraits.optimism}/100)
主角行为规则（选项必须符合主角性格）：${getPersonalityBehaviorRules(protagTraits)}
主角当前情绪：${protagPersonality?.currentMood || '平静'}

在场角色：${sceneCharacters.map(c => {
            const appearance = getCharacterAppearanceDesc(c);
            const base = `${c.name}: ${c.personality}`;
            return appearance ? `${base}，外貌特征：${appearance}` : base;
          }).join('; ')}
${selectedNames ? `当前选中对话的角色：${selectedNames}` : ''}

最近对话（请根据对话上下文生成连贯的选项）：
${lastFewDialogues}

请生成2-3个主角（${protagonist?.name || '你'}）接下来可以选择的行动或对话选项。

重要规则：
1. 所有选项都必须是主角的动作或对话，不要描述其他角色的反应或动作
2. 选项应该以第一人称或直接描述主角的行为（例如："仔细观察周围"、"询问关于..."、"走向..."等）
${hasSelectedCharacters ? '' : '3. 【重要】当前没有选中任何角色，选项中不要提及任何具体角色的名字！如果要和人说话，用泛称如"某人"、"那边的人"等，或者直接描述动作'}
${hasSelectedCharacters ? '3.' : '4.'} 选项必须符合主角的性格！根据上面的行为规则生成选项
${hasSelectedCharacters ? '4.' : '5.'} 选项要和最近对话的上下文紧密相关，延续对话的话题
${hasSelectedCharacters ? '5.' : '6.'} 每个选项可以同时包含动作和对话，也可以只有其中一个
${hasSelectedCharacters ? '6.' : '7.'} 有趣且推动剧情发展
${hasSelectedCharacters ? '7.' : '8.'} 不要包含任何其他角色的决定或动作，角色有自己的自主性

用JSON格式返回：
{
  "choices": [
    { "action": "动作描述（没有则为空字符串）", "dialogue": "对话内容（没有则为空字符串）" },
    { "action": "动作描述（没有则为空字符串）", "dialogue": "对话内容（没有则为空字符串）" },
    { "action": "动作描述（没有则为空字符串）", "dialogue": "对话内容（没有则为空字符串）" }
  ]
}
注意：action和dialogue至少要有一个有内容。
`;

      const result = await generateWithAI(prompt, aiProvider, { maxTokens: MAX_TOKENS.DIALOGUE, jsonResponse: true });
      let newChoices;
      if (result && result.choices && Array.isArray(result.choices)) {
        // 检查返回的格式是否正确
        if (result.choices[0] && typeof result.choices[0] === 'object' && (result.choices[0].action !== undefined || result.choices[0].dialogue !== undefined)) {
          newChoices = result.choices;
        } else if (result.choices[0] && typeof result.choices[0] === 'object' && result.choices[0].text) {
          // 兼容旧格式
          newChoices = result.choices.map(c => ({
            action: c.type === 'action' ? c.text : '',
            dialogue: c.type === 'dialogue' ? c.text : ''
          }));
        } else {
          // 兼容纯文本格式
          newChoices = result.choices.map((text, i) => ({
            action: i % 2 === 1 ? text : '',
            dialogue: i % 2 === 0 ? text : ''
          }));
        }
      } else {
        newChoices = getDefaultChoices();
      }

      // 限制选项数量最多为3个
      setChoices(newChoices.slice(0, 3));

      // 缓存选项（根据选中的角色组合生成缓存键，或使用no_character_selected）
      const cacheKey = selectedTalkingCharacters.length > 0 ? getCacheKey(selectedTalkingCharacters) : 'no_character_selected';
      choicesCacheRef.current[cacheKey] = {
        lastDialogueIndex: lastRealDialogueIndexRef.current,
        choices: newChoices
      };
    } catch (error) {
      console.error('Failed to generate choices:', error);
      const defaultChoices = getDefaultChoices();
      setChoices(defaultChoices);

      // 即使失败也缓存默认选项
      const cacheKey = selectedTalkingCharacters.length > 0 ? getCacheKey(selectedTalkingCharacters) : 'no_character_selected';
      choicesCacheRef.current[cacheKey] = {
        lastDialogueIndex: lastRealDialogueIndexRef.current,
        choices: defaultChoices
      };
    } finally {
      setIsGeneratingChoices(false);
      isGeneratingRef.current = false;
    }
  };

  const handleSave = async () => {
    // 先压缩当前对话到记忆中
    if (selectedTalkingCharacters.length > 0) {
      for (const char of selectedTalkingCharacters) {
        await compressAndSaveMemories(char);
      }
    }

    saveGame();
    try {
      await saveGameToDatabase(state);
      alert('已保存到本地和数据库！');
    } catch (error) {
      console.error('Database save failed:', error);
      alert('已保存到本地！');
    }
  };

  const handleExport = () => {
    exportSave(state);
  };

  const handleMove = async (sceneId) => {
    // 离开场景前压缩所有选中角色的对话到记忆中
    if (selectedTalkingCharacters.length > 0) {
      for (const char of selectedTalkingCharacters) {
        await compressAndSaveMemories(char);
      }
      setSelectedTalkingCharacters([]);
    }

    // 切换场景，清除所有选项缓存
    choicesCacheRef.current = {};
    // 重置最后处理的对话索引，强制重新生成选项
    lastProcessedDialogueIndexRef.current = -1;
    lastRealDialogueIndexRef.current = 0;

    let scene = state.scenes.find(s => s.id === sceneId);

    // 如果场景不存在，说明是懒加载场景，需要先从 worldMap 生成
    if (!scene && state.world?.worldMap) {
      // 避免重复处理同一个场景的懒加载
      if (lazyLoadingSceneIdRef.current === sceneId || processedLazyLoadsRef.current.has(sceneId)) {
        return;
      }

      lazyLoadingSceneIdRef.current = sceneId;
      setIsProcessing(true);

      try {
        console.log(`[懒加载] 场景 ${sceneId} 不存在，正在从世界地图生成...`);

        const result = await generateScenesFromMap(
          state.world.id,
          { mermaidCode: state.world.worldMap },
          state.currentSceneId, // 以当前场景为中心生成附近场景
          true // 自动生成图片
        );

        if (result && result.scenes && result.scenes.length > 0) {
          // 将生成的场景添加到 state
          for (const sceneData of result.scenes) {
            const newSceneId = sceneData.id || `scene_${Date.now()}_${Math.random()}`;
            const newScene = {
              id: newSceneId,
              name: sceneData.name || '未知场景',
              description: sceneData.description || '',
              isIndoor: sceneData.isIndoor,
              spaceType: sceneData.spaceType || '',
              decorationStyle: sceneData.decorationStyle || '',
              mainFurniture: sceneData.mainFurniture || '',
              colorScheme: sceneData.colorScheme || '',
              lightSource: sceneData.lightSource || '',
              atmosphere: sceneData.atmosphere || '',
              viewAngle: sceneData.viewAngle || '',
              location: sceneData.location || '',
              seasonTime: sceneData.seasonTime || '',
              naturalElements: sceneData.naturalElements || '',
              skyDescription: sceneData.skyDescription || '',
              lightDescription: sceneData.lightDescription || '',
              colorAtmosphere: sceneData.colorAtmosphere || '',
              layout: sceneData.layout || '',
              photographer: sceneData.photographer || '',
              imageUrl: sceneData.image_url || '',
              connectedScenes: sceneData.connectedScenes || [],
              npcs: []
            };
            dispatch({ type: 'ADD_SCENE', payload: newScene });
          }

          // 再次查找目标场景
          scene = state.scenes.find(s => s.id === sceneId) ||
            result.scenes.find(s => s.id === sceneId || s.name === sceneId);

          if (scene) {
            console.log(`[懒加载] 场景 ${scene.name} 生成成功，ID: ${scene.id}`);
          } else {
            console.error(`[懒加载] 场景生成后仍未找到: ${sceneId}`);
            setIsProcessing(false);
            lazyLoadingSceneIdRef.current = null;
            return;
          }
        } else {
          console.error('[懒加载] 场景生成失败');
          setIsProcessing(false);
          lazyLoadingSceneIdRef.current = null;
          return;
        }
      } catch (err) {
        console.error('[懒加载] 生成场景失败:', err);
        setIsProcessing(false);
        lazyLoadingSceneIdRef.current = null;
        return;
      }
    }

    // 记录已处理的懒加载
    if (lazyLoadingSceneIdRef.current === sceneId) {
      processedLazyLoadsRef.current.add(sceneId);
      lazyLoadingSceneIdRef.current = null;
      setIsProcessing(false);
    }

    if (scene) {
      // 找出会跟随的角色（自我意识<10且服从度>=70）
      const followingCharacters = state.characters.filter(char => {
        if (char.isProtagonist) return false;
        const selfAwareness = char.characterStatus?.selfAwareness ?? 50;
        const obedience = char.characterStatus?.relationship?.obedience ?? 30;
        return selfAwareness < 10 && obedience >= 70;
      });

      // 获取当前场景名称（移动前的场景）
      const oldScene = state.currentSceneId ? state.scenes.find(s => s.id === state.currentSceneId) : null;
      const oldSceneName = oldScene?.name || '未知地点';

      dispatch({ type: 'SET_CURRENT_SCENE', payload: sceneId });

      // 同时更新主角的位置并添加移动记忆
      if (protagonist) {
        dispatch({
          type: 'MOVE_CHARACTER',
          payload: { characterId: protagonist.id, sceneId: sceneId }
        });
        // 添加主角的移动记忆（3天后过期）
        dispatch({
          type: 'ADD_CHARACTER_MEMORY',
          payload: {
            characterId: protagonist.id,
            content: `从${oldSceneName}来到了${scene.name}`,
            importance: 3,
            expiresInDays: 3 // 3天后遗忘
          }
        });
      }

      // 移动跟随的角色并添加移动记忆
      followingCharacters.forEach(char => {
        dispatch({
          type: 'MOVE_CHARACTER',
          payload: { characterId: char.id, sceneId: sceneId }
        });
        // 添加角色的移动记忆（3天后过期）
        dispatch({
          type: 'ADD_CHARACTER_MEMORY',
          payload: {
            characterId: char.id,
            content: `跟随主角从${oldSceneName}来到了${scene.name}`,
            importance: 3,
            expiresInDays: 3 // 3天后遗忘
          }
        });
      });

      let moveText = `你来到了${scene.name}。${scene.description}`;
      if (followingCharacters.length > 0) {
        const followingNames = followingCharacters.map(c => c.name).join('、');
        moveText += `\n${followingNames}跟随你来到了这里。`;
      }

      dispatch({
        type: 'ADD_DIALOGUE',
        payload: { speaker: '旁白', text: moveText }
      });

      // 场景切换后，设置默认选项
      setChoices(getDefaultChoices());
    }
  };

  const handleTalkTo = async (character) => {
    // 不能选择主角
    if (character.isProtagonist) return;

    // 如果正在等待确认，不允许切换角色
    if (waitingForConfirm) {
      alert('请先点击"继续"让下一个角色回应');
      return;
    }

    // 检查该角色是否正在压缩记忆
    if (compressingCharacters.has(character.id)) {
      alert(`${character.name} 的记忆正在整理中，请稍候再试...`);
      return;
    }

    // 切换选择状态：如果已选中则取消，未选中则添加
    const isAlreadySelected = selectedTalkingCharacters.some(c => c.id === character.id);

    if (isAlreadySelected) {
      // 取消选择，先压缩当前对话到记忆中
      await compressAndSaveMemories(character);

      // 计算新的选择列表
      const newSelected = selectedTalkingCharacters.filter(c => c.id !== character.id);
      setSelectedTalkingCharacters(newSelected);

      if (newSelected.length > 0) {
        // 还有其他选中的角色，检查新组合的缓存
        const cacheKey = getCacheKey(newSelected);
        const cache = choicesCacheRef.current[cacheKey];
        if (cache && cache.lastDialogueIndex === lastRealDialogueIndexRef.current) {
          setChoices(cache.choices);
        } else {
          // 没有缓存，强制重新生成
          generateAIChoices(true);
        }
      } else {
        // 没有选中的角色了，检查无角色缓存或使用默认选项
        const cache = choicesCacheRef.current['no_character_selected'];
        if (cache && cache.lastDialogueIndex === lastRealDialogueIndexRef.current) {
          setChoices(cache.choices);
        } else {
          setChoices(getDefaultChoices());
        }
      }
    } else {
      // 添加到选择列表
      const newSelected = [...selectedTalkingCharacters, character];
      setSelectedTalkingCharacters(newSelected);
      setDialogueStartIndex(state.dialogueHistory.length);

      // 检查新组合是否有缓存
      const cacheKey = getCacheKey(newSelected);
      const cache = choicesCacheRef.current[cacheKey];

      if (cache && cache.lastDialogueIndex === lastRealDialogueIndexRef.current) {
        // 有缓存，直接使用
        setChoices(cache.choices);
        // 添加旁白消息但不触发重新生成选项
        dispatch({
          type: 'ADD_DIALOGUE',
          payload: { speaker: '旁白', text: `你看向${character.name}...` }
        });
        return;
      }

      // 如果没有缓存，正常添加旁白消息（会触发重新生成）
      dispatch({
        type: 'ADD_DIALOGUE',
        payload: { speaker: '旁白', text: `你看向${character.name}...` }
      });
    }
  };

  // 获取表情对应的 emoji
  const getExpressionEmoji = (expression) => {
    const emojiMap = {
      '微笑': '😊',
      '严肃': '😐',
      '惊讶': '😮',
      '害羞': '☺️',
      '愤怒': '😠',
      '悲伤': '😢',
      '担忧': '😟',
      '自然': '😐'
    };
    return emojiMap[expression] || '😐';
  };

  // 添加状态变化显示
  const addStatusChange = (characterId, label, value, type = 'positive') => {
    const changeId = `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const change = { id: changeId, label, value, type };

    setStatusChanges(prev => ({
      ...prev,
      [characterId]: [...(prev[characterId] || []), change]
    }));

    // 2秒后移除该变化
    setTimeout(() => {
      setStatusChanges(prev => {
        const changes = prev[characterId]?.filter(c => c.id !== changeId) || [];
        return {
          ...prev,
          [characterId]: changes
        };
      });
    }, 2500);
  };

  // 更新角色状态
  const updateCharacterStatus = async (character, playerAction, characterResponse) => {
    try {
      const currentStatus = character.characterStatus || {
        personalityTraits: { extroversion: 50, rationality: 50, orderliness: 50, optimism: 50 },
        selfAwareness: 50,
        mentalStress: 20,
        relationship: { affection: 50, trust: 50, obedience: 30, specialTags: [] },
        currentEmotion: "平静",
        abilities: {},
        stateTags: []
      };

      const oldAffection = currentStatus.relationship?.affection || 50;
      const oldTrust = currentStatus.relationship?.trust || 50;
      const oldObedience = currentStatus.relationship?.obedience || 30;
      const oldMentalStress = currentStatus.mentalStress || 20;

      const currentExpression = currentStatus.expression?.currentExpression || '自然';
      const currentExpressionIntensity = currentStatus.expression?.expressionIntensity || '平静';

      const prompt = `
角色：${character.name}
性格：${character.personality || '未设定'}
背景：${character.background || '未设定'}

当前状态：
- 好感度：${oldAffection}/100
- 信赖度：${oldTrust}/100
- 服从度：${oldObedience}/100
- 精神压力：${oldMentalStress}/100
- 当前情绪：${currentStatus.currentEmotion || '平静'}
- 当前表情：${currentExpression}
- 情绪强度：${currentExpressionIntensity}

最近对话：
主角：${playerAction}
${character.name}：${characterResponse}

请根据以上对话，分析${character.name}的状态变化，返回JSON格式：
{
  "relationship": {
    "affection": 新的好感度0-100,
    "trust": 新的信赖度0-100,
    "obedience": 新的服从度0-100,
    "specialTags": ["标签1", "标签2"] // 或保持原样
  },
  "mentalStress": 新的精神压力0-100,
  "currentEmotion": "平静|愉悦|困惑|恼怒|害羞|悲伤|恐惧",
  "expression": {
    "currentExpression": "自然|微笑|严肃|惊讶|害羞|愤怒|悲伤|担忧",
    "expressionIntensity": "平静|轻微|中等|强烈",
    "facialDetails": "面部细节描述，如'嘴角上扬'、'眉头微皱'等，没有则为空字符串"
  },
  "stateTags": ["状态标签"] // 可选
}

注意：
- 变化要合理，不要剧烈波动
- 好感度、信赖度等每次变化建议在-10到+10之间
- 精神压力会随着对话内容增减
- 情绪和表情要符合对话内容
- 表情会随着对话经常变化
- 只有当对话中发生重要事件时才添加特殊标签或状态标签
`;

      const result = await generateWithAI(prompt, aiProvider, { maxTokens: MAX_TOKENS.DIALOGUE, jsonResponse: true });
      if (result) {
        const newStatus = {
          ...currentStatus,
          relationship: {
            ...currentStatus.relationship,
            ...result.relationship
          },
          mentalStress: result.mentalStress ?? currentStatus.mentalStress,
          currentEmotion: result.currentEmotion || currentStatus.currentEmotion,
          expression: {
            ...currentStatus.expression,
            currentExpression: result.expression?.currentExpression || currentStatus.expression?.currentExpression || '自然',
            expressionIntensity: result.expression?.expressionIntensity || currentStatus.expression?.expressionIntensity || '平静',
            facialDetails: result.expression?.facialDetails ?? currentStatus.expression?.facialDetails ?? ''
          },
          stateTags: result.stateTags || currentStatus.stateTags
        };

        // 计算变化并显示
        const newAffection = newStatus.relationship?.affection || 50;
        const newTrust = newStatus.relationship?.trust || 50;
        const newObedience = newStatus.relationship?.obedience || 30;
        const newMentalStress = newStatus.mentalStress || 20;

        const affectionDiff = newAffection - oldAffection;
        const trustDiff = newTrust - oldTrust;
        const obedienceDiff = newObedience - oldObedience;
        const stressDiff = newMentalStress - oldMentalStress;

        if (affectionDiff !== 0) {
          addStatusChange(character.id, '好感度', affectionDiff, affectionDiff > 0 ? 'positive' : 'negative');
        }
        if (trustDiff !== 0) {
          addStatusChange(character.id, '信赖度', trustDiff, trustDiff > 0 ? 'positive' : 'negative');
        }
        if (obedienceDiff !== 0) {
          addStatusChange(character.id, '服从度', obedienceDiff, obedienceDiff > 0 ? 'positive' : 'negative');
        }
        if (stressDiff !== 0) {
          addStatusChange(character.id, '精神压力', stressDiff, stressDiff < 0 ? 'positive' : 'negative');
        }

        dispatch({
          type: 'UPDATE_CHARACTER',
          payload: {
            id: character.id,
            characterStatus: newStatus
          }
        });
      }
    } catch (error) {
      console.error(`Failed to update status for ${character.name}:`, error);
    }
  };

  // 处理角色移动到新场景
  const handleCharacterMove = (character, targetSceneName) => {
    if (!targetSceneName || !targetSceneName.trim()) return null;

    // 找到目标场景
    const targetScene = connectedScenes.find(s =>
      s.name.toLowerCase() === targetSceneName.toLowerCase().trim()
    );

    if (!targetScene) return null;

    // 从当前场景移除角色
    if (currentScene) {
      dispatch({
        type: 'UPDATE_SCENE',
        payload: {
          id: currentScene.id,
          npcs: (currentScene.npcs || []).filter(id => id !== character.id)
        }
      });
    }

    // 添加到目标场景
    dispatch({
      type: 'UPDATE_SCENE',
      payload: {
        id: targetScene.id,
        npcs: [...(targetScene.npcs || []), character.id]
      }
    });

    // 更新角色的当前场景位置
    dispatch({
      type: 'MOVE_CHARACTER',
      payload: { characterId: character.id, sceneId: targetScene.id }
    });

    return targetScene;
  };

  // 获取角色状态的文本描述，用于影响对话生成
  const getCharacterStatusText = (character) => {
    const status = character.characterStatus;
    if (!status) return '';

    const parts = [];
    parts.push(`${character.name}当前情绪：${status.currentEmotion || '平静'}`);
    parts.push(`对主角好感度：${status.relationship?.affection || 50}/100`);
    parts.push(`对主角信赖度：${status.relationship?.trust || 50}/100`);
    parts.push(`精神压力：${status.mentalStress || 20}/100`);

    if (status.relationship?.specialTags?.length > 0) {
      parts.push(`特殊关系：${status.relationship.specialTags.join('、')}`);
    }
    if (status.stateTags?.length > 0) {
      parts.push(`当前状态：${status.stateTags.join('、')}`);
    }

    return parts.join('；');
  };

  // 获取角色的外貌描述（用于让其他角色"看到"该角色的穿着）
  const getCharacterAppearanceDesc = (character) => {
    const physical = character.physicalAppearance || {};
    const parts = [];

    if (physical.hairStyle) parts.push(physical.hairStyle);
    if (physical.hairColor) parts.push(physical.hairColor);
    if (physical.eyeColor) parts.push(`${physical.eyeColor}眼睛`);
    if (physical.bodyType) parts.push(physical.bodyType);
    if (physical.height) parts.push(`身高${physical.height}`);
    if (physical.clothing) parts.push(`穿着${physical.clothing}`);

    return parts.length > 0 ? parts.join('，') : '';
  };

  // 根据性格指标数值生成详细的行为规则描述
  const getPersonalityBehaviorRules = (traits) => {
    const { extroversion, rationality, orderliness, optimism } = traits;

    let rules = '';

    // 外向性规则（>70外向，<30内向）
    if (extroversion >= 70) {
      rules += '\n- 【极度外向】此角色非常开朗健谈，喜欢主动与人交流，会主动开启新话题，在社交场合表现活跃，喜欢成为焦点；';
    } else if (extroversion >= 55) {
      rules += '\n- 【中度外向】此角色比较开朗，愿意与人交流，会主动回应但不会过于热情；';
    } else if (extroversion >= 45) {
      rules += '\n- 【中性外向】此角色在社交场合表现正常，既不过于主动也不过于被动；';
    } else if (extroversion >= 30) {
      rules += '\n- 【中度内向】此角色比较安静内敛，通常在有话题时才参与对话，不会主动开启新话题；';
    } else {
      rules += '\n- 【极度内向】此角色非常沉默寡言，很少主动说话，只在被直接询问或遇到感兴趣的话题时才开口回应；';
    }

    // 理性规则（>70理性，<30感性）
    if (rationality >= 70) {
      rules += '\n- 【极度理性】此角色在做出决定时会深思熟虑，分析利弊得失，极少被情绪左右，面对问题冷静客观；';
    } else if (rationality >= 55) {
      rules += '\n- 【中度理性】此角色在做决定时会考虑逻辑和事实，但也会适当考虑他人感受；';
    } else if (rationality >= 45) {
      rules += '\n- 【中性理性】此角色在决策时会平衡理性分析和情感因素；';
    } else if (rationality >= 30) {
      rules += '\n- 【中度感性】此角色在决策时更注重情感因素，容易被情绪影响，但仍有基本判断力；';
    } else {
      rules += '\n- 【极度感性】此角色在做出决定时完全被情绪左右，容易冲动行事，很少考虑后果，同理心极强；';
    }

    // 守序性规则（>70守序，<30混乱）
    if (orderliness >= 70) {
      rules += '\n- 【极度守序】此角色非常重视规则和秩序，做事有条理有计划，严格遵守承诺和时间，会坚持完成被分配的任务；';
    } else if (orderliness >= 55) {
      rules += '\n- 【中度守序】此角色比较遵守规则，做事有计划性，会尽量履行承诺；';
    } else if (orderliness >= 45) {
      rules += '\n- 【中性守序】此角色对规则的态度适中，既有原则性也有一定灵活性；';
    } else if (orderliness >= 30) {
      rules += '\n- 【中度混乱】此角色不喜欢被束缚，做事比较随性，不喜欢被限制和规定，但还不会故意违反规则；';
    } else {
      rules += '\n- 【极度混乱】此角色完全不喜欢规则和束缚，随心所欲，做事没有计划性，喜欢打破常规，不在乎社会规范；';
    }

    // 乐观性规则（>70乐观，<30悲观）
    if (optimism >= 70) {
      rules += '\n- 【极度乐观】此角色对事物总是持积极态度，即使遇到困境也能看到希望，相信事情会往好的方向发展；';
    } else if (optimism >= 55) {
      rules += '\n- 【中度乐观】此角色比较乐观，通常能看到事物积极的一面，对未来充满期待；';
    } else if (optimism >= 45) {
      rules += '\n- 【中性乐观】此角色对事物的态度比较平衡，既不过于乐观也不过于悲观；';
    } else if (optimism >= 30) {
      rules += '\n- 【中度悲观】此角色比较容易担忧，对事物持谨慎态度，会考虑可能的负面结果；';
    } else {
      rules += '\n- 【极度悲观】此角色对事物总是持消极态度，即使事情进展顺利也会担心出问题，不相信好事会发生在自己身上；';
    }

    return rules;
  };

  // 让单个角色回应
  const generateSingleCharacterResponse = async (character, playerChoice) => {
    try {
      // 获取该角色的记忆
      const charMemories = state.characterMemories?.[character.id];
      const charCurrentDialogues = state.characterCurrentDialogues?.[character.id] || [];
      let memoryText = '';

      if (charCurrentDialogues.length > 0) {
        memoryText += `## 【${character.name}】看到的对话（仅包含该角色在场时见证的对话）：\n${charCurrentDialogues.map(d => `[${d.speaker}]: ${d.text}`).join('\n')}\n\n`;
      }
      if (charMemories?.memories?.length > 0) {
        memoryText += getCharacterMemoriesText(charMemories.memories, character.name, state.gameTime);
      }

      const statusText = getCharacterStatusText(character);
      const timeInfluencePrompt = getTimeInfluencePrompt(state.gameTime);

      // 获取角色性格指标数值
      const charTraits = character.characterStatus?.personalityTraits || { extroversion: 50, rationality: 50, orderliness: 50, optimism: 50 };
      // 获取角色外貌特征
      const charAppearance = character.characterStatus?.physicalAppearance || {};

      // 获取其他选中角色的信息（该角色能看到的信息）
      const otherCharactersInfo = selectedTalkingCharacters
        .filter(c => c.id !== character.id)
        .map(c => {
          const appearance = getCharacterAppearanceDesc(c);
          const status = getCharacterStatusText(c);
          const info = `${c.name}：${appearance || '外貌普通'}`;
          return status ? `${info}；${status}` : info;
        }).join('\n');

      const prompt = `
游戏设定：
世界观：${state.world.name} - ${state.world.description}
当前场景：${currentScene?.name} - ${currentScene?.description}
主角：${protagonist?.name || '你'}
角色：${character.name}
性格：${character.personality || '未设定'}
背景：${character.background || '未设定'}
外貌特征：
- 发型：${charAppearance.hairStyle || '未设定'}
- 发色：${charAppearance.hairColor || '未设定'}
- 瞳色：${charAppearance.eyeColor || '未设定'}
- 体型：${charAppearance.bodyType || '未设定'}
- 穿着：${charAppearance.clothing || '未设定'}
性格指标（影响角色行为方式）数值：
- 外向(${charTraits.extroversion}/100) - 内向(${100-charTraits.extroversion}/100)
- 理性(${charTraits.rationality}/100) - 感性(${100-charTraits.rationality}/100)
- 守序(${charTraits.orderliness}/100) - 混乱(${100-charTraits.orderliness}/100)
- 乐观(${charTraits.optimism}/100) - 悲观(${100-charTraits.optimism}/100)
性格行为规则（请严格遵循）：${getPersonalityBehaviorRules(charTraits)}

当前场景连接的其他场景：${connectedScenes.map(s => s.name).join('、') || '无'}

${timeInfluencePrompt}

${otherCharactersInfo ? `【重要】当前场景中其他角色的信息（${character.name}能看到的）：\n${otherCharactersInfo}\n\n请注意${character.name}能看到其他角色的外貌和穿着，在对话和动作中要体现出对这些信息的反应。\n` : ''}

${memoryText ? `${memoryText}\n\n重要：以上对话历史中的每一句都标明了说话者【某某】。${character.name}的对话应该延续对话的发展，而不是重复或混淆说话者。请根据以上对话历史和记忆，生成符合角色与主角关系的回复。回复要体现出角色对主角的态度变化，参考历史对话中的互动方式。` : ''}

${statusText ? `角色状态（请根据这些状态调整角色的回应方式）：\n${statusText}\n` : ''}

玩家（主角）刚刚说：${playerChoice}

请决定${character.name}是否要回应。如果回应，请将动作和对话分开。
重要：回复格式要求 - 第一行是动作描述，第二行是对话内容。

重要：角色对主角的态度应该基于历史对话和记忆来决定：
- 如果历史对话中主角对角色很好，角色应该更热情友好
- 如果历史对话中有冲突或不愉快，角色应该保持警惕或冷漠
- 如果角色被主角收服过，应该表现出服从和亲近
- 回复要体现出角色性格和历史关系的延续性
- ${character.name}在回应时要能注意到并反应其他角色的外貌和穿着

重要：如果角色想要离开当前场景去其他地方，必须先在对话中说明离开的原因（比如："我还有事，先走了"、"这里太危险了，我得离开"等），然后再在moveTo字段中填写目标场景名称（必须是上面列出的连接场景中的一个，或者空字符串表示不移动）。

用JSON格式返回：
{
  "shouldRespond": true/false,
  "action": "角色的动作描述（没有则为空字符串）",
  "dialogue": "角色说的话（没有则为空字符串），如果要离开，这里要说明原因",
  "moveTo": "目标场景名称，不移动则为空字符串"
}
注意：action和dialogue至少要有一个有内容。如果shouldRespond为false，则两者都为空。
`;

      const isCaptured = character.characterStatus?.isCaptured;
      const temperature = isCaptured ? 0.6 : 1.2;
      const result = await generateWithAI(prompt, aiProvider, { maxTokens: MAX_TOKENS.DIALOGUE, jsonResponse: true, temperature });
      if (result && typeof result === 'object') {
        const shouldRespond = result.shouldRespond !== false; // 默认回应
        const action = result.action || '';
        const dialogue = result.dialogue || '';
        const moveTo = result.moveTo || '';

        if (shouldRespond && (action || dialogue)) {
          // 构建显示文本：第一行动作，第二行对话
          let displayText = '';
          if (action && action.trim()) {
            displayText += action;
          }
          if (dialogue && dialogue.trim()) {
            if (displayText) displayText += '\n';
            displayText += dialogue;
          }
          if (!displayText) {
            displayText = '……';
          }
          return { speaker: character.name, text: displayText, action, dialogue, moveTo };
        }
        return null; // 不回应
      }
      return { speaker: character.name, text: '……', action: '', dialogue: '', moveTo: '' };
    } catch (error) {
      console.error(`Failed to generate response for ${character.name}:`, error);
      return { speaker: character.name, text: '……', action: '', dialogue: '……' };
    }
  };

  // 多角色回应队列相关状态
  const [multiCharacterQueue, setMultiCharacterQueue] = useState([]); // 待回应的角色队列
  const [currentPlayerChoice, setCurrentPlayerChoice] = useState(''); // 当前的玩家选择

  // 开始多角色回应流程
  const startMultiCharacterResponses = async (playerChoice) => {
    const characters = [...selectedTalkingCharacters];
    setIsMultiCharacterResponding(true);
    setMultiCharacterQueue(characters);
    setCurrentPlayerChoice(playerChoice);
    setRespondingCharacters(characters);

    // 立即处理第一个角色
    await processNextCharacter(playerChoice, characters);
  };

  // 处理下一个角色的回应
  const processNextCharacter = async (playerChoice, queue) => {
    // 如果没有传入 queue，则使用 state 中的队列（用于后续递归调用）
    const currentQueue = queue || multiCharacterQueue;

    if (currentQueue.length === 0) {
      // 所有角色都回应完了
      finishMultiCharacterResponses(playerChoice);
      return;
    }

    const [currentCharacter, ...remainingCharacters] = currentQueue;

    // 生成该角色的回应
    const response = await generateSingleCharacterResponse(currentCharacter, playerChoice);

    if (response) {
      // 先添加角色的对话到历史
      dispatch({
        type: 'ADD_DIALOGUE',
        payload: response
      });

      // 添加到所有选中角色的当前对话中（包括自己）
      // 这样取消选择时才能正确压缩记忆
      for (const char of selectedTalkingCharacters) {
        dispatch({
          type: 'ADD_CHARACTER_CURRENT_DIALOGUE',
          payload: {
            characterId: char.id,
            dialogue: response
          }
        });
      }

      // 检查是否有移动意图
      if (response.moveTo && response.moveTo.trim()) {
        // 保存移动信息，等待玩家确认
        setPendingCharacterMove({
          character: currentCharacter,
          moveTo: response.moveTo,
          targetSceneName: response.moveTo
        });
      } else {
        // 没有移动，直接更新状态
        await updateCharacterStatus(currentCharacter, playerChoice, response.dialogue || response.text);
      }
    }

    // 更新队列
    setMultiCharacterQueue(remainingCharacters);
    setRespondingCharacters(prev => prev.filter(c => c.id !== currentCharacter.id));

    // 如果还有剩余角色，等待确认；否则结束
    if (remainingCharacters.length > 0) {
      setWaitingForConfirm(true);
      setIsProcessing(false);
    } else {
      finishMultiCharacterResponses(playerChoice);
    }
  };

  // 确认继续下一个角色回应
  const handleConfirmNextCharacter = async () => {
    setWaitingForConfirm(false);
    setIsProcessing(true);
    await processNextCharacter(currentPlayerChoice);
  };

  // 确认角色移动
  const handleConfirmCharacterMove = async () => {
    if (!pendingCharacterMove) return;

    const { character, moveTo } = pendingCharacterMove;
    const targetScene = handleCharacterMove(character, moveTo);

    if (targetScene) {
      dispatch({
        type: 'ADD_DIALOGUE',
        payload: {
          speaker: '旁白',
          text: `${character.name}移动到了${targetScene.name}场景。`
        }
      });
    }

    // 更新角色状态
    if (currentPlayerChoice) {
      await updateCharacterStatus(character, currentPlayerChoice, '');
    }

    setPendingCharacterMove(null);

    // 检查是否有多角色队列需要继续处理
    if (multiCharacterQueue.length > 0) {
      // 还有角色需要回应，继续处理
      setIsProcessing(true);
      await processNextCharacter(currentPlayerChoice);
    } else {
      // 所有角色都处理完了
      setIsProcessing(false);
    }
  };

  // 取消角色移动
  const handleCancelCharacterMove = () => {
    setPendingCharacterMove(null);

    // 检查是否有多角色队列需要继续处理
    if (multiCharacterQueue.length > 0) {
      // 取消移动后，继续处理下一个角色
      setIsProcessing(true);
      processNextCharacter(currentPlayerChoice);
    } else {
      // 没有多角色队列，直接结束
      setIsProcessing(false);
    }
  };

  // 旁白判断影响级别并处理记忆
  const processNarratorResponse = async (playerAction, playerDialogue) => {
    const playerText = (playerAction ? playerAction : '') + (playerAction && playerDialogue ? '\n' : '') + (playerDialogue ? playerDialogue : '');

    const prompt = `世界观：${state.world.name || '未设定'}
${state.world.description || ''}

当前场景：${currentScene?.name || '未知场景'}
场景描述：${currentScene?.description || ''}

玩家做了以下动作/说了以下话：
${playerText}

请判断这个动作/说话的影响级别，并给出旁白描述。

影响级别分为三个等级：
1. "无人知晓" - 只有玩家自己知道，没有其他人看到或听到
2. "当前场景" - 只有当前场景内的角色知道
3. "世界知晓" - 这件事会传播到整个世界

重要程度从1-10，1是最不重要，10是最重要。

请用JSON格式返回：
{
  "speaker": "旁白",
  "text": "旁白描述（描述发生了什么事）",
  "impactLevel": "无人知晓" | "当前场景" | "世界知晓",
  "importance": 1-10的数字
}

只返回纯JSON，不要包含任何其他文字说明。`;

    try {
      const result = await generateWithAI(prompt, aiProvider, { maxTokens: MAX_TOKENS.DIALOGUE, jsonResponse: true });
      if (result && typeof result === 'object') {
        return {
          speaker: result.speaker || '旁白',
          text: result.text || '你完成了这个动作。',
          impactLevel: result.impactLevel || '当前场景',
          importance: result.importance || 5
        };
      }
    } catch (error) {
      console.error('Narrator response failed:', error);
    }

    return {
      speaker: '旁白',
      text: '你完成了这个动作。',
      impactLevel: '无人知晓',
      importance: 3
    };
  };

  // 推进游戏时间
  const advanceGameTime = (minutes = 10) => {
    dispatch({
      type: 'ADVANCE_TIME',
      payload: { minutes }
    });
  };

  // 给角色添加记忆
  const addMemoryToCharacters = (content, importance, characterIds) => {
    characterIds.forEach(charId => {
      dispatch({
        type: 'ADD_CHARACTER_MEMORY',
        payload: {
          characterId: charId,
          content: content,
          importance: importance,
          gameTime: state.gameTime
        }
      });

      // 检查该角色的记忆数量，超过30个时自动整理
      const charMemories = state.characterMemories?.[charId]?.memories || [];
      if (charMemories.length >= 30) {
        // 触发记忆整理：去重 + 删除重要性较低的，保留最重要的20条
        const cleanedMemories = cleanupMemories(charMemories, 20);
        dispatch({
          type: 'UPDATE_CHARACTER_MEMORIES',
          payload: {
            characterId: charId,
            memories: cleanedMemories
          }
        });
      }
    });
  };

  // 解析动作指令，改变角色外貌
  const parseAndChangeAppearance = async (actionText, targetCharacters) => {
    // 匹配 【动作】... 格式
    const actionMatch = actionText.match(/【动作】(.+)/);
    if (!actionMatch) return { changed: false };

    const actionContent = actionMatch[1].trim();

    // 尝试提取改变外貌的指令
    // 支持格式: 给XX换YY, 让XX穿YY, XX的发型变成YY, 等
    const changePatterns = [
      /给(.+?)(?:换|穿|改成|变成|梳|剪)(.+)/,
      /让(.+?)(?:换|穿|改成|变成|梳|剪)(.+)/,
      /(.+?)(?:的头发|的发型|的穿着|的衣服)(?:改成|变成|换|穿)(.+)/
    ];

    let targetName = '';
    let changeDesc = '';

    for (const pattern of changePatterns) {
      const match = actionContent.match(pattern);
      if (match) {
        targetName = match[1].trim();
        changeDesc = match[2].trim();
        break;
      }
    }

    // 如果没有明确的目标，使用当前选中的角色
    let targetChar = null;
    if (targetName) {
      targetChar = targetCharacters.find(c => c.name.includes(targetName) || targetName.includes(c.name));
    } else if (targetCharacters.length === 1) {
      targetChar = targetCharacters[0];
    }

    if (!targetChar) {
      return { changed: false, message: '没有找到目标角色' };
    }

    // 检查服从度是否足够
    const obedience = targetChar.characterStatus?.relationship?.obedience ?? 30;
    if (obedience < 80) {
      return { changed: false, message: `${targetChar.name}的服从度不足，无法改变TA的外貌` };
    }

    // 分析改变的内容
    let newHairStyle = targetChar.characterStatus?.physicalAppearance?.hairStyle || '';
    let newHairColor = targetChar.characterStatus?.physicalAppearance?.hairColor || '';
    let newClothing = targetChar.characterStatus?.physicalAppearance?.clothing || '';

    // 简单的关键词匹配来判断改变什么
    const lowerChange = changeDesc.toLowerCase();

    // 检测发型改变
    const hairStyleKeywords = ['长发', '短发', '卷发', '直发', '马尾', '辫子', '波浪', '盘发', 'bob', '丸子头'];
    for (const keyword of hairStyleKeywords) {
      if (lowerChange.includes(keyword.toLowerCase())) {
        newHairStyle = changeDesc;
        break;
      }
    }

    // 检测发色改变
    const hairColorKeywords = ['黑色', '金色', '银色', '棕色', '红色', '蓝色', '绿色', '紫色', '白色', '灰色',
                              'black', 'blonde', 'gold', 'silver', 'brown', 'red', 'blue', 'green', 'purple', 'white', 'gray'];
    for (const keyword of hairColorKeywords) {
      if (lowerChange.includes(keyword.toLowerCase())) {
        newHairColor = changeDesc;
        break;
      }
    }

    // 检测服装改变（默认认为是服装）
    if (newHairStyle === targetChar.characterStatus?.physicalAppearance?.hairStyle &&
        newHairColor === targetChar.characterStatus?.physicalAppearance?.hairColor) {
      newClothing = changeDesc;
    }

    // 更新角色
    const updatedAppearance = {
      ...targetChar.characterStatus?.physicalAppearance,
      hairStyle: newHairStyle,
      hairColor: newHairColor,
      clothing: newClothing
    };

    // 构建新的整体外貌描述
    let newOverallAppearance = targetChar.appearance || '';
    if (newOverallAppearance) {
      // 简单替换或添加新外貌信息
      const appearanceParts = [];
      if (newHairStyle || newHairColor) {
        appearanceParts.push(`发型：${newHairStyle || targetChar.characterStatus?.physicalAppearance?.hairStyle || ''}，发色：${newHairColor || targetChar.characterStatus?.physicalAppearance?.hairColor || ''}`);
      }
      if (newClothing) {
        appearanceParts.push(`穿着：${newClothing}`);
      }
      if (appearanceParts.length > 0) {
        newOverallAppearance = newOverallAppearance.replace(/发型：[^，。\n]*[，。\n]?/g, '').replace(/发色：[^，。\n]*[，。\n]?/g, '').replace(/穿着：[^，。\n]*[，。\n]?/g, '');
        newOverallAppearance = newOverallAppearance.trim();
        if (newOverallAppearance && !newOverallAppearance.endsWith('。') && !newOverallAppearance.endsWith('，')) {
          newOverallAppearance += '，';
        }
        newOverallAppearance += appearanceParts.join('，');
      }
    }

    dispatch({
      type: 'UPDATE_CHARACTER',
      payload: {
        id: targetChar.id,
        appearance: newOverallAppearance,
        characterStatus: {
          ...targetChar.characterStatus,
          physicalAppearance: updatedAppearance
        }
      }
    });

    // 尝试生成新头像（使用与刷新头像相同的逻辑）
    let newImageUrl = null;
    try {
      const physicalAppearance = updatedAppearance;
      // 确保 expression 是对象
      const rawExpression = targetChar.characterStatus?.expression;
      const expression = (rawExpression && typeof rawExpression === 'object' && !Array.isArray(rawExpression))
        ? rawExpression
        : (typeof rawExpression === 'string' ? { currentExpression: rawExpression, expressionIntensity: '平静', facialDetails: '' } : {});

      // 提取年龄
      let ageText = '';
      if (targetChar.age) {
        const ageStr = String(targetChar.age);
        const ageMatch = ageStr.match(/(\d+)/);
        ageText = ageMatch ? ageMatch[1] : '';
      }

      // 构建提示词
      const promptParts = [];
      promptParts.push(`一位${ageText || ''}岁${targetChar.gender || ''}`);

      // 发型描述
      const hairParts = [];
      if (physicalAppearance.hairColor) hairParts.push(physicalAppearance.hairColor);
      if (physicalAppearance.hairStyle) hairParts.push(physicalAppearance.hairStyle);
      if (hairParts.length > 0) {
        promptParts.push(`，${hairParts.join('')}`);
      }

      // 表情描述
      if (expression.currentExpression && expression.currentExpression !== '自然') {
        promptParts.push(`，${expression.currentExpression}的表情`);
      }

      // 服装描述
      promptParts.push(`，穿着${physicalAppearance.clothing || '适合的服装'}`);

      // 姿态描述
      promptParts.push(`，自然站立姿态`);

      // 背景环境
      promptParts.push(`，${state.world.name || '奇幻'}风格背景`);

      // 摄影技术参数
      promptParts.push(`，背景虚化，浅景深`);
      promptParts.push(`，柔和自然光，面部光线柔和均匀`);
      promptParts.push(`，专业人像摄影风格，85mm f/1.8镜头`);
      promptParts.push(`，高清，细节丰富，皮肤质感自然`);

      const prompt = promptParts.join('');
      newImageUrl = await generateImage(prompt, '2:3');

      if (newImageUrl) {
        dispatch({
          type: 'UPDATE_CHARACTER',
          payload: {
            id: targetChar.id,
            imageUrl: newImageUrl
          }
        });
      }
    } catch (err) {
      console.error('Failed to generate new avatar:', err);
    }

    return {
      changed: true,
      character: targetChar,
      newHairStyle,
      newHairColor,
      newClothing,
      newImageUrl
    };
  };

  // 计算压制成功率
  const getSuppressionSuccessRate = (energy) => {
    if (energy < 10) return 100;
    if (energy < 20) return 90;
    if (energy < 30) return 80;
    if (energy >= 30 && energy <= 60) return 40;
    return 20; // 精力超过60时成功率很低
  };

  // 解析并执行压制动作
  const parseAndExecuteSuppression = async (actionText, targetCharacters) => {
    // 检查是否是压制/战斗/攻击动作
    const suppressionKeywords = ['战斗', '攻击', '压制', '推倒', '按住', '制服', '打倒', '擒住', '抓住'];
    const hasSuppressionKeyword = suppressionKeywords.some(keyword => actionText.includes(keyword));

    if (!hasSuppressionKeyword) {
      return { executed: false };
    }

    // 提取目标角色
    let targetChar = null;
    let targetName = '';

    // 尝试从动作文本中提取角色名
    for (const char of targetCharacters) {
      if (actionText.includes(char.name)) {
        targetChar = char;
        targetName = char.name;
        break;
      }
    }

    // 如果没有明确指定但只有一个选中角色，使用该角色
    if (!targetChar && targetCharacters.length === 1) {
      targetChar = targetCharacters[0];
      targetName = targetChar.name;
    }

    if (!targetChar) {
      return { executed: false, message: '需要指定要压制的角色' };
    }

    const energy = targetChar.characterStatus?.physicalState?.energy ?? 65;
    const successRate = getSuppressionSuccessRate(energy);

    // 执行压制判定
    const randomValue = Math.random() * 100;
    const isSuccess = randomValue < successRate;

    if (isSuccess) {
      // 压制成功：大幅提升服从度，大幅降低自主度
      const currentObedience = targetChar.characterStatus?.relationship?.obedience ?? 30;
      const currentSelfAwareness = targetChar.characterStatus?.selfAwareness ?? 50;
      const currentAffection = targetChar.characterStatus?.relationship?.affection ?? 50;
      const currentTrust = targetChar.characterStatus?.relationship?.trust ?? 50;

      // 服从度提升20-35点
      const obedienceIncrease = Math.floor(Math.random() * 16) + 20;
      const newObedience = Math.min(100, currentObedience + obedienceIncrease);

      // 自主度降低15-30点
      const selfAwarenessDecrease = Math.floor(Math.random() * 16) + 15;
      const newSelfAwareness = Math.max(0, currentSelfAwareness - selfAwarenessDecrease);

      // 精力也会降低
      const newEnergy = Math.max(0, energy - Math.floor(Math.random() * 11) - 10);

      // 好感度和信赖度大幅下降
      const affectionDecrease = Math.floor(Math.random() * 16) + 20;
      const trustDecrease = Math.floor(Math.random() * 16) + 20;
      const newAffection = Math.max(0, currentAffection - affectionDecrease);
      const newTrust = Math.max(0, currentTrust - trustDecrease);

      // 更新角色状态
      dispatch({
        type: 'UPDATE_CHARACTER',
        payload: {
          id: targetChar.id,
          characterStatus: {
            ...targetChar.characterStatus,
            selfAwareness: newSelfAwareness,
            physicalState: {
              ...targetChar.characterStatus?.physicalState,
              energy: newEnergy
            },
            relationship: {
              ...targetChar.characterStatus?.relationship,
              obedience: newObedience,
              affection: newAffection,
              trust: newTrust
            }
          }
        }
      });

      // 添加压制记忆（需要好感和信赖>70才能消除）
      dispatch({
        type: 'ADD_CHARACTER_MEMORY',
        payload: {
          characterId: targetChar.id,
          content: `${protagonist?.name || '主角'}用粗暴的方式压制了我，我感到恐惧和屈辱...这种威压让我不得不暂时顺从，但我内心充满了怨恨。`,
          importance: 9,
          isTraumaticMemory: true, // 标记为创伤记忆
          requiresHealing: true, // 需要治愈才能消除
          gameTime: state.gameTime
        }
      });

      let resultText = `压制成功！${targetName}被你制服了！\n`;
      resultText += `压制成功率：${successRate}%\n`;
      resultText += `${targetName}的服从度：${currentObedience} → ${newObedience}\n`;
      resultText += `${targetName}的自我意识：${currentSelfAwareness} → ${newSelfAwareness}\n`;
      resultText += `${targetName}的精力：${energy} → ${newEnergy}\n`;
      resultText += `${targetName}的好感度：${currentAffection} → ${newAffection}\n`;
      resultText += `${targetName}的信赖度：${currentTrust} → ${newTrust}`;

      if (newSelfAwareness < 20) {
        resultText += `\n\n⚠️ ${targetName}陷入了迷茫中，现在是收服的大好时机！`;
      }

      return {
        executed: true,
        success: true,
        character: targetChar,
        message: resultText,
        impactLevel: '当前场景'
      };
    } else {
      // 压制失败：触发场景影响事件
      const currentAffection = targetChar.characterStatus?.relationship?.affection ?? 50;
      const currentTrust = targetChar.characterStatus?.relationship?.trust ?? 50;

      // 好感度和信赖度大幅下降
      const affectionDecrease = Math.floor(Math.random() * 11) + 15;
      const trustDecrease = Math.floor(Math.random() * 11) + 15;
      const newAffection = Math.max(0, currentAffection - affectionDecrease);
      const newTrust = Math.max(0, currentTrust - trustDecrease);

      // 更新角色状态
      dispatch({
        type: 'UPDATE_CHARACTER',
        payload: {
          id: targetChar.id,
          characterStatus: {
            ...targetChar.characterStatus,
            relationship: {
              ...targetChar.characterStatus?.relationship,
              affection: newAffection,
              trust: newTrust
            }
          }
        }
      });

      // 添加压制失败的记忆
      dispatch({
        type: 'ADD_CHARACTER_MEMORY',
        payload: {
          characterId: targetChar.id,
          content: `${protagonist?.name || '主角'}想压制我，还好我挣脱了！这个人太危险了，我要离他/她远点...`,
          importance: 8,
          isTraumaticMemory: true,
          requiresHealing: true,
          gameTime: state.gameTime
        }
      });

      let failMessage = `压制失败！${targetName}挣脱了！\n`;
      failMessage += `压制成功率：${successRate}%，判定结果：${Math.floor(randomValue)}%\n`;
      failMessage += `${targetName}的好感度：${currentAffection} → ${newAffection}\n`;
      failMessage += `${targetName}的信赖度：${currentTrust} → ${newTrust}\n`;
      failMessage += `${targetName}变得警惕起来，这件事可能会传遍整个场景...`;

      return {
        executed: true,
        success: false,
        character: targetChar,
        message: failMessage,
        impactLevel: '当前场景'
      };
    }
  };

  // 计算收服成功率
  const getCaptureSuccessRate = (selfAwareness, obedience) => {
    // 最高优先级：自我意识 ≥ 50 且 服从度 < 40 → 5%（最难收服）
    if (selfAwareness >= 50 && obedience < 40) return 5;

    // 第二优先级：自我意识 < 30（最容易收服）
    if (selfAwareness < 30) {
      if (obedience > 70) return 99;
      if (obedience > 60) return 95;
      if (obedience > 50) return 90;
      return 85; // 自我意识 <30 即使服从度低也相对容易
    }

    // 自我意识 30-39 区间（中等难度）
    if (selfAwareness >= 30 && selfAwareness < 40) {
      if (obedience > 70) return 90;
      if (obedience > 60) return 80;
      if (obedience > 50) return 70;
      if (obedience >= 40) return 55;
      return 45; // 服从度 <40
    }

    // 自我意识 40-49 区间（较高难度）
    if (selfAwareness >= 40 && selfAwareness < 50) {
      if (obedience > 70) return 80;
      if (obedience > 60) return 70;
      if (obedience > 50) return 60;
      if (obedience >= 40) return 45;
      return 30; // 服从度 <40
    }

    // 自我意识 ≥50 区间（高难度，但服从度 >=40 时）
    if (selfAwareness >= 50) {
      if (obedience > 70) return 70;
      if (obedience > 60) return 55;
      if (obedience > 50) return 40;
      if (obedience >= 40) return 25;
    }

    // 兜底
    return 50;
  };

  // 解析并执行收服动作
  const parseAndExecuteCapture = async (actionText, dialogueText, targetCharacters) => {
    // 检查是否是收服动作
    const captureKeywords = ['收服', '收了', '成为我的', '做我的', '跟着我', '跟我走'];
    const fullText = actionText + ' ' + dialogueText;
    const hasCaptureKeyword = captureKeywords.some(keyword => fullText.includes(keyword));

    if (!hasCaptureKeyword) {
      return { executed: false };
    }

    // 提取目标角色
    let targetChar = null;
    let targetName = '';

    // 尝试从动作文本中提取角色名
    for (const char of targetCharacters) {
      if (fullText.includes(char.name)) {
        targetChar = char;
        targetName = char.name;
        break;
      }
    }

    // 如果没有明确指定但只有一个选中角色，使用该角色
    if (!targetChar && targetCharacters.length === 1) {
      targetChar = targetCharacters[0];
      targetName = targetChar.name;
    }

    if (!targetChar) {
      return { executed: false, message: '需要指定要收服的角色' };
    }

    // 检查角色是否已经被收服
    if (targetChar.characterStatus?.isCaptured) {
      return { executed: true, message: `${targetName}已经是你的人了！`, alreadyCaptured: true };
    }

    const selfAwareness = targetChar.characterStatus?.selfAwareness ?? 50;
    const obedience = targetChar.characterStatus?.relationship?.obedience ?? 30;
    const successRate = getCaptureSuccessRate(selfAwareness, obedience);

    // 执行收服判定
    const randomValue = Math.random() * 100;
    const isSuccess = randomValue < successRate;

    if (isSuccess) {
      // 收服成功：好感、信赖、服从度满值，自我意识降到最低
      dispatch({
        type: 'UPDATE_CHARACTER',
        payload: {
          id: targetChar.id,
          characterStatus: {
            ...targetChar.characterStatus,
            isCaptured: true,
            selfAwareness: 10, // 自我意识降到最低
            relationship: {
              ...targetChar.characterStatus?.relationship,
              affection: 100, // 好感度满
              trust: 100, // 信赖度满
              obedience: 100 // 服从度满
            }
          }
        }
      });

      // 添加收服记忆（重要度10，永久保留）
      dispatch({
        type: 'ADD_CHARACTER_MEMORY',
        payload: {
          characterId: targetChar.id,
          content: `我被${protagonist?.name || '主角'}收服了，从此我就是他/她的人了。我应该称呼他/她为...（待设定）`,
          importance: 10,
          gameTime: state.gameTime
        }
      });

      let resultText = `🎉 收服成功！${targetName}愿意跟随你了！\n`;
      resultText += `收服成功率：${successRate}%\n`;
      resultText += `\n${targetName}的好感度、信赖度、服从度已满值，自我意识降到最低，对你言听计从！\n`;
      resultText += `\n现在你可以通过快捷动作来设定${targetName}的称呼、自称和穿着`;

      return {
        executed: true,
        success: true,
        character: targetChar,
        message: resultText,
        impactLevel: '当前场景'
      };
    } else {
      // 收服失败：服从度大幅降低
      const currentObedience = targetChar.characterStatus?.relationship?.obedience ?? 30;
      const obedienceDecrease = Math.floor(Math.random() * 21) + 15; // 降低15-35点
      const newObedience = Math.max(0, currentObedience - obedienceDecrease);

      dispatch({
        type: 'UPDATE_CHARACTER',
        payload: {
          id: targetChar.id,
          characterStatus: {
            ...targetChar.characterStatus,
            relationship: {
              ...targetChar.characterStatus?.relationship,
              obedience: newObedience
            }
          }
        }
      });

      let failMessage = `收服失败！${targetName}拒绝了你的收服！\n`;
      failMessage += `收服成功率：${successRate}%，判定结果：${Math.floor(randomValue)}%\n`;
      failMessage += `${targetName}的服从度：${currentObedience} → ${newObedience}\n`;
      failMessage += `\n${targetName}变得警惕起来，看来需要换个时机再尝试...`;

      return {
        executed: true,
        success: false,
        character: targetChar,
        message: failMessage,
        impactLevel: '当前场景'
      };
    }
  };

  // 解析并执行设定称呼动作
  const parseAndSetTitle = async (actionText, targetCharacters) => {
    // 检查是否是设定称呼的动作
    const titleKeywords = ['叫我', '称呼我', '喊我', '以后叫我', '以后称呼我'];
    const hasTitleKeyword = titleKeywords.some(keyword => actionText.includes(keyword));

    if (!hasTitleKeyword) {
      return { executed: false };
    }

    // 提取目标角色
    let targetChar = null;
    let targetName = '';

    for (const char of targetCharacters) {
      if (actionText.includes(char.name)) {
        targetChar = char;
        targetName = char.name;
        break;
      }
    }

    // 如果没有明确指定但只有一个选中角色，使用该角色
    if (!targetChar && targetCharacters.length === 1) {
      targetChar = targetCharacters[0];
      targetName = targetChar.name;
    }

    if (!targetChar) {
      return { executed: false, message: '需要指定角色' };
    }

    // 检查角色是否已被收服
    if (!targetChar.characterStatus?.isCaptured) {
      return { executed: true, message: `${targetName}还没有被你收服，无法设定称呼。`, notCaptured: true };
    }

    // 提取称呼
    let title = '';
    for (const keyword of titleKeywords) {
      const index = actionText.indexOf(keyword);
      if (index !== -1) {
        title = actionText.substring(index + keyword.length).trim();
        // 清理称呼（去掉标点符号等）
        title = title.replace(/[。！？!?，,、.]+$/, '').trim();
        break;
      }
    }

    if (!title) {
      return { executed: true, message: '请告诉我你希望角色怎么称呼你？（例如：【动作】以后叫我主人）', noTitle: true };
    }

    // 更新角色记忆（添加或更新称呼记忆，重要度10）
    dispatch({
      type: 'ADD_CHARACTER_MEMORY',
      payload: {
        characterId: targetChar.id,
        content: `我对${protagonist?.name || '主角'}的称呼是："${title}"。这是最重要的记忆，永远不会改变。`,
        importance: 10,
        gameTime: state.gameTime
      }
    });

    return {
      executed: true,
      success: true,
      character: targetChar,
      title: title,
      message: `${targetName}记住了！以后就叫你"${title}"！`
    };
  };

  // 结束多角色回应流程
  const finishMultiCharacterResponses = (playerChoice) => {
    // 所有角色回应完后，更新主角性格（用最后一个角色的回应）
    const lastDialogue = state.dialogueHistory[state.dialogueHistory.length - 1];
    if (lastDialogue) {
      updateProtagonistPersonality(playerChoice, lastDialogue.text);
    }

    setIsMultiCharacterResponding(false);
    setRespondingCharacters([]);
    setMultiCharacterQueue([]);
    setCurrentPlayerChoice('');

    // 如果有待确认的移动，保持isProcessing为true，显示确认按钮
    if (!pendingCharacterMove) {
      setIsProcessing(false);
      // 对话完成后自动保存
      saveGame();
    }
  };

  const handleChoice = async (choice) => {
    if (isProcessing || isMultiCharacterResponding || waitingForConfirm) return;

    // 处理choice对象格式
    const choiceAction = typeof choice === 'object' ? (choice.action || '') : '';
    const choiceDialogue = typeof choice === 'object' ? (choice.dialogue || '') : (typeof choice === 'string' ? choice : '');
    const fullText = choiceAction + ' ' + choiceDialogue;

    // 检查是否包含技能名称 - 优先检查，独立于收服动作
    const skillNames = protagonist?.skills?.map(s => s.name) || [];
    const matchedSkillName = skillNames.find(name => choiceAction.includes(name));

    console.log('=== 技能检测调试 ===');
    console.log('choiceAction:', choiceAction);
    console.log('skillNames:', skillNames);
    console.log('matchedSkillName:', matchedSkillName);
    console.log('selectedTalkingCharacters.length:', selectedTalkingCharacters.length);

    if (matchedSkillName && selectedTalkingCharacters.length > 0) {
      const skill = protagonist.skills.find(s => s.name === matchedSkillName);
      console.log('找到技能:', skill);

      if (skill) {
        const targetChar = selectedTalkingCharacters[0];
        const effects = applySkillToCharacter(skill, targetChar);
        console.log('技能效果:', effects);

        if (effects && effects.length > 0) {
          const protagName = protagonist?.name || '主角';

          // 显示技能发动提示（淡入淡出）
          const effectDesc = effects.map(e => {
            switch (e.type) {
              case 'affection': return `好感度${e.value > 0 ? '+' : ''}${e.value}`;
              case 'trust': return `信赖度${e.value > 0 ? '+' : ''}${e.value}`;
              case 'obedience': return `服从度${e.value > 0 ? '+' : ''}${e.value}`;
              case 'mentalStress': return `精神压力${e.value}`;
              case 'selfAwareness': return `自我意识${e.value > 0 ? '+' : ''}${e.value}`;
              case 'capture': return '收服成功';
              case 'health': return e.description;
              case 'stateTag': return `获得「${e.value}」状态`;
              case 'emotion': return `情绪变成「${e.value}」`;
              case 'expression': return `表情变成「${e.value}」`;
              default: return '';
            }
          }).filter(Boolean).join('、');

          setSkillActivationMessage(`${protagName} 发动技能 ${skill.name}，造成效果：${effectDesc}`);

          // 将技能使用记录添加到角色的当前对话中（这样会被记录到记忆中）
          dispatch({
            type: 'ADD_CHARACTER_CURRENT_DIALOGUE',
            payload: {
              characterId: targetChar.id,
              dialogue: {
                speaker: protagName,
                text: `对${targetChar.name}使用了技能【${skill.name}】`
              }
            }
          });

          // 应用技能效果 - 收集所有更新到一次dispatch中
          let effectMessage = `【${skill.name}】对${targetChar.name}产生了效果：\n`;

          // 收集所有需要更新的属性
          const charStatusUpdate = { ...targetChar.characterStatus };
          const relationshipUpdate = { ...targetChar.characterStatus?.relationship };
          let statusTagUpdate = [...(targetChar.characterStatus?.stateTags || [])];
          let expressionUpdate = { ...(targetChar.characterStatus?.expression || {}) };
          let capturedUpdate = charStatusUpdate.isCaptured;

          effects.forEach(effect => {
            if (effect.type === 'affection') {
              effectMessage += `好感度 ${effect.from} → ${effect.to} (${effect.value > 0 ? '+' : ''}${effect.value})\n`;
              relationshipUpdate.affection = effect.to;
            } else if (effect.type === 'trust') {
              effectMessage += `信赖度 ${effect.from} → ${effect.to} (${effect.value > 0 ? '+' : ''}${effect.value})\n`;
              relationshipUpdate.trust = effect.to;
            } else if (effect.type === 'obedience') {
              effectMessage += `服从度 ${effect.from} → ${effect.to} (${effect.value > 0 ? '+' : ''}${effect.value})\n`;
              relationshipUpdate.obedience = effect.to;
            } else if (effect.type === 'mentalStress') {
              effectMessage += `精神压力 ${effect.from} → ${effect.to}\n`;
              charStatusUpdate.mentalStress = effect.to;
            } else if (effect.type === 'selfAwareness') {
              effectMessage += `自我意识 ${effect.from} → ${effect.to} (${effect.value > 0 ? '+' : ''}${effect.value})\n`;
              charStatusUpdate.selfAwareness = effect.to;
            } else if (effect.type === 'capture') {
              effectMessage += `${targetChar.name}被收服了！\n`;
              capturedUpdate = true;
              relationshipUpdate.affection = 80;
              relationshipUpdate.trust = 80;
              relationshipUpdate.obedience = 100;
            } else if (effect.type === 'health') {
              effectMessage += `${effect.description}\n`;
            } else if (effect.type === 'stateTag') {
              effectMessage += `获得状态：${effect.value}\n`;
              if (!statusTagUpdate.includes(effect.value)) {
                statusTagUpdate.push(effect.value);
              }
            } else if (effect.type === 'emotion') {
              effectMessage += `情绪变化：${effect.value}\n`;
              charStatusUpdate.currentEmotion = effect.value;
            } else if (effect.type === 'expression') {
              effectMessage += `表情变化：${effect.value}\n`;
              expressionUpdate.currentExpression = effect.value;
            }
          });

          // 合并所有更新到一次dispatch
          charStatusUpdate.relationship = relationshipUpdate;
          charStatusUpdate.isCaptured = capturedUpdate;
          if (statusTagUpdate.length > 0) {
            charStatusUpdate.stateTags = statusTagUpdate;
          }
          if (Object.keys(expressionUpdate).length > 0) {
            charStatusUpdate.expression = expressionUpdate;
          }

          dispatch({
            type: 'UPDATE_CHARACTER',
            payload: {
              id: targetChar.id,
              characterStatus: charStatusUpdate
            }
          });

          // 使用AI更新角色描述（基于技能效果）
          updateCharacterDescriptionWithAI(targetChar, effects, skill.name);

          // 添加技能效果到对话（在淡出动画之后，这里用setTimeout延迟添加）
          setTimeout(() => {
            dispatch({
              type: 'ADD_DIALOGUE',
              payload: { speaker: '系统', text: effectMessage }
            });
          }, 2200);

          setIsProcessing(false);
          setChoices(getDefaultChoices());
          return;
        } else {
          // 技能被识别但没有可解析的效果
          const protagName = protagonist?.name || '主角';
          setSkillActivationMessage(`${protagName} 发动了技能 ${skill.name}，但技能描述格式无法解析`);

          // 添加技能使用记录到记忆
          dispatch({
            type: 'ADD_CHARACTER_CURRENT_DIALOGUE',
            payload: {
              characterId: targetChar.id,
              dialogue: {
                speaker: protagName,
                text: `对${targetChar.name}使用了技能【${skill.name}】`
              }
            }
          });

          // 添加提示到对话
          setTimeout(() => {
            dispatch({
              type: 'ADD_DIALOGUE',
              payload: { speaker: '系统', text: `【${skill.name}】技能效果：${skill.description || '无描述'}` }
            });
          }, 2200);

          setIsProcessing(false);
          setChoices(getDefaultChoices());
          return;
        }
      }
    }

    // 检查是否是换装动作（仅对已收服的角色）
    const clothingChangeKeywords = ['换衣服', '换装', '改穿', '换上', '换成', '换身衣服'];
    const hasClothingChangeKeyword = clothingChangeKeywords.some(keyword => fullText.includes(keyword));
    if (hasClothingChangeKeyword && selectedTalkingCharacters.length > 0) {
      const targetChar = selectedTalkingCharacters[0];
      // 只有已收服的角色才能换装
      if (targetChar.characterStatus?.isCaptured) {
        // 从动作中提取新服装描述
        const clothingMatch = choiceAction.match(/换(成|上|穿|)(.+?)$/) || choiceDialogue.match(/换(成|上|穿|)(.+?)$/);
        let newClothing = clothingMatch ? clothingMatch[2].trim() : null;

        if (!newClothing || newClothing.length < 2) {
          // 尝试从对话中提取更完整的服装描述
          newClothing = choiceAction + ' ' + choiceDialogue;
          // 去掉关键词部分
          clothingChangeKeywords.forEach(kw => {
            newClothing = newClothing.replace(new RegExp(kw, 'g'), '');
          });
          newClothing = newClothing.trim();
        }

        if (newClothing && newClothing.length >= 2) {
          const charName = targetChar.name;

          // 显示换装提示（一直显示直到图片生成完成）
          setClothingChangeMessage(`${charName} 正在换衣服...`);

          // 阻止玩家操作
          setIsProcessing(true);

          // 更新角色的穿着
          dispatch({
            type: 'UPDATE_CHARACTER',
            payload: {
              id: targetChar.id,
              physicalAppearance: {
                ...targetChar.physicalAppearance,
                clothing: newClothing
              }
            }
          });

          // 生成新的角色图片
          const physical = targetChar.physicalAppearance || {};
          const prompt = `${targetChar.name || '角色'}，人物肖像，${physical.hairStyle || ''}，${physical.hairColor || ''}，${physical.eyeColor || ''}的眼睛，${physical.bodyType || ''}的身材，穿着${newClothing}，${state.world.name || '奇幻'}风格，专业人像摄影，背景虚化，浅景深，柔和自然光，高清，细节丰富`;

          console.log('生成角色图片 prompt:', prompt);

          generateImage(prompt, '2:3').then(newImageUrl => {
            if (newImageUrl) {
              dispatch({
                type: 'UPDATE_CHARACTER',
                payload: {
                  id: targetChar.id,
                  imageUrl: newImageUrl
                }
              });
              console.log('角色图片已更新:', newImageUrl);
              // 同步更新 selectedTalkingCharacters 中的角色引用，确保渲染时能获取最新数据
              setSelectedTalkingCharacters(prev =>
                prev.map(c => c.id === targetChar.id ? { ...c, imageUrl: newImageUrl } : c)
              );
            }

            // 隐藏换装提示
            setClothingChangeMessage('');

            // 显示换装结果到对话
            dispatch({
              type: 'ADD_DIALOGUE',
              payload: { speaker: '旁白', text: `${charName}换上了${newClothing}。` }
            });

            // 恢复玩家操作
            setIsProcessing(false);
            setChoices(getDefaultChoices());
          }).catch(err => {
            console.error('生成角色图片失败:', err);
            // 失败时也要恢复
            setSkillActivationMessage('');
            setIsProcessing(false);
          });

          return;
        }
      }
    }

    // 检查是否是收服动作
    const captureKeywords = ['收服', '收了', '成为我的', '做我的', '跟着我', '跟我走'];
    const hasCaptureKeyword = captureKeywords.some(keyword => fullText.includes(keyword));
    if (hasCaptureKeyword && selectedTalkingCharacters.length > 0) {
      const captureResult = await parseAndExecuteCapture(choiceAction, choiceDialogue, selectedTalkingCharacters);

      if (captureResult.executed) {
        // 添加收服结果对话
        dispatch({
          type: 'ADD_DIALOGUE',
          payload: { speaker: '旁白', text: captureResult.message }
        });

        if (!captureResult.alreadyCaptured) {
          // 记录旁白记忆
          dispatch({
            type: 'ADD_NARRATOR_MEMORY',
            payload: {
              content: (choiceAction || '') + (choiceDialogue || '') + '\n' + captureResult.message,
              impactLevel: captureResult.impactLevel || '当前场景',
              importance: captureResult.success ? 9 : 6,
              sceneId: state.currentSceneId
            }
          });
        }

        setIsProcessing(false);
        setChoices(getDefaultChoices());
        return;
      }
    }

    // 检查是否是压制/战斗动作
    const suppressionKeywords = ['战斗', '攻击', '压制', '推倒', '按住', '制服', '打倒', '擒住', '抓住'];
    const hasSuppressionKeyword = suppressionKeywords.some(keyword => fullText.includes(keyword));
    if (hasSuppressionKeyword && selectedTalkingCharacters.length > 0) {
      const fullActionText = (choiceAction ? choiceAction : '') + (choiceAction && choiceDialogue ? '\n' : '') + (choiceDialogue ? choiceDialogue : '');
      const suppressionResult = await parseAndExecuteSuppression(fullActionText, selectedTalkingCharacters);

      if (suppressionResult.executed) {
        // 添加压制结果对话
        dispatch({
          type: 'ADD_DIALOGUE',
          payload: { speaker: '旁白', text: suppressionResult.message }
        });

        // 记录旁白记忆
        dispatch({
          type: 'ADD_NARRATOR_MEMORY',
          payload: {
            content: fullActionText + '\n' + suppressionResult.message,
            impactLevel: suppressionResult.impactLevel || '当前场景',
            importance: suppressionResult.success ? 8 : 7,
            sceneId: state.currentSceneId
          }
        });

        // 根据影响级别，给相关角色添加记忆
        const memoryContent = `${protagonist?.name || '你'}：${fullActionText}`;
        if (suppressionResult.impactLevel === '当前场景') {
          const sceneCharIds = sceneCharacters.filter(c => !c.isProtagonist).map(c => c.id);
          addMemoryToCharacters(memoryContent, suppressionResult.success ? 8 : 7, sceneCharIds);
        } else if (suppressionResult.impactLevel === '世界知晓') {
          const allCharIds = state.characters.filter(c => !c.isProtagonist).map(c => c.id);
          addMemoryToCharacters(memoryContent, suppressionResult.success ? 8 : 7, allCharIds);
        }

        setIsProcessing(false);
        setChoices(getDefaultChoices());
        return;
      }
    }

    // 检查是否是改变外貌的动作指令
    if ((choiceAction.includes('【动作】') || choiceDialogue.includes('【动作】')) && selectedTalkingCharacters.length > 0) {
      const appearanceResult = await parseAndChangeAppearance(choiceAction || choiceDialogue, selectedTalkingCharacters);
      if (appearanceResult.changed) {
        // 显示外貌改变的结果
        let resultText = `${appearanceResult.character.name}的外貌改变了！`;
        if (appearanceResult.newHairStyle !== appearanceResult.character.characterStatus?.physicalAppearance?.hairStyle) {
          resultText += `\n发型变成了：${appearanceResult.newHairStyle}`;
        }
        if (appearanceResult.newHairColor !== appearanceResult.character.characterStatus?.physicalAppearance?.hairColor) {
          resultText += `\n发色变成了：${appearanceResult.newHairColor}`;
        }
        if (appearanceResult.newClothing !== appearanceResult.character.characterStatus?.physicalAppearance?.clothing) {
          resultText += `\n穿着变成了：${appearanceResult.newClothing}`;
        }
        if (appearanceResult.newImageUrl) {
          resultText += `\n头像已更新！`;
        }

        dispatch({
          type: 'ADD_DIALOGUE',
          payload: { speaker: '旁白', text: resultText }
        });

        setIsProcessing(false);
        setChoices(getDefaultChoices());
        return;
      } else if (appearanceResult.message && !appearanceResult.message.includes('没有找到目标角色')) {
        dispatch({
          type: 'ADD_DIALOGUE',
          payload: { speaker: '旁白', text: appearanceResult.message }
        });
        setIsProcessing(false);
        setChoices(getDefaultChoices());
        return;
      }
    }

    // 检查是否是设定称呼的动作
    if ((choiceAction.includes('【动作】') || choiceAction) && selectedTalkingCharacters.length > 0) {
      const titleResult = await parseAndSetTitle(choiceAction, selectedTalkingCharacters);

      if (titleResult.executed) {
        // 添加设定称呼结果对话
        dispatch({
          type: 'ADD_DIALOGUE',
          payload: { speaker: '旁白', text: titleResult.message }
        });

        setIsProcessing(false);
        setChoices(getDefaultChoices());
        return;
      }
    }

    // 构建玩家选择的显示文本：第一行动作，第二行对话
    let playerDisplayText = '';
    if (choiceAction && choiceAction.trim()) {
      playerDisplayText += choiceAction;
    }
    if (choiceDialogue && choiceDialogue.trim()) {
      if (playerDisplayText) playerDisplayText += '\n';
      playerDisplayText += choiceDialogue;
    }

    // 只有当有内容时才显示玩家对话
    let playerDialogue = null;
    if (playerDisplayText) {
      playerDialogue = {
        speaker: protagonist?.name || '你',
        text: playerDisplayText,
        action: choiceAction,
        dialogue: choiceDialogue
      };
      dispatch({
        type: 'ADD_DIALOGUE',
        payload: playerDialogue
      });

      // 添加到所有当前选中角色的当前对话
      for (const char of selectedTalkingCharacters) {
        dispatch({
          type: 'ADD_CHARACTER_CURRENT_DIALOGUE',
          payload: { characterId: char.id, dialogue: playerDialogue }
        });
      }

      // 玩家对话后推进时间5-15分钟
      advanceGameTime(Math.floor(Math.random() * 11) + 5);
    }

    setIsProcessing(true);

    // 如果没有选中角色，由旁白处理
    if (selectedTalkingCharacters.length === 0) {
      // 获取旁白回应
      const narratorResponse = await processNarratorResponse(choiceAction, choiceDialogue);

      // 添加旁白对话
      dispatch({
        type: 'ADD_DIALOGUE',
        payload: {
          speaker: narratorResponse.speaker,
          text: narratorResponse.text
        }
      });

      // 记录旁白记忆
      const fullPlayerText = (choiceAction ? choiceAction : '') + (choiceAction && choiceDialogue ? '\n' : '') + (choiceDialogue ? choiceDialogue : '');
      dispatch({
        type: 'ADD_NARRATOR_MEMORY',
        payload: {
          content: fullPlayerText + '\n' + narratorResponse.text,
          impactLevel: narratorResponse.impactLevel,
          importance: narratorResponse.importance,
          sceneId: state.currentSceneId
        }
      });

      // 根据影响级别，给相关角色添加记忆
      const memoryContent = `${protagonist?.name || '你'}：${fullPlayerText}`;
      if (narratorResponse.impactLevel === '当前场景') {
        // 当前场景所有角色
        const sceneCharIds = sceneCharacters.filter(c => !c.isProtagonist).map(c => c.id);
        addMemoryToCharacters(memoryContent, narratorResponse.importance, sceneCharIds);
      } else if (narratorResponse.impactLevel === '世界知晓') {
        // 所有角色
        const allCharIds = state.characters.filter(c => !c.isProtagonist).map(c => c.id);
        addMemoryToCharacters(memoryContent, narratorResponse.importance, allCharIds);
      }
      // 无人知晓：不添加到任何角色记忆

      setIsProcessing(false);
      setChoices(getDefaultChoices());
      return;
    }

    // 玩家选择了选项，对话进展，清除所有选中角色的缓存
    for (const char of selectedTalkingCharacters) {
      delete choicesCacheRef.current[char.id];
    }

    // 构建发送给AI的玩家选择文本
    const playerChoiceForAI = [choiceAction, choiceDialogue].filter(Boolean).join('，');

    if (selectedTalkingCharacters.length === 1) {
      // 单个角色，使用原有逻辑
      try {
          const characterMemoriesText = getCurrentCharacterMemories();
          const selectedCharsInfo = selectedTalkingCharacters.map(char => {
            const appearance = getCharacterAppearanceDesc(char);
            const status = getCharacterStatusText(char);
            const base = `${char.name}外貌：${appearance || '普通'}`;
            return status ? `${base}；${status}` : base;
          }).filter(Boolean).join('\n');

          const timeInfluencePrompt = getTimeInfluencePrompt(state.gameTime);
          const prompt = `
游戏设定：
世界观：${state.world.name} - ${state.world.description}
当前场景：${currentScene?.name} - ${currentScene?.description}
在场角色：${sceneCharacters.map(c => {
            const appearance = getCharacterAppearanceDesc(c);
            const base = `${c.name}: ${c.personality}`;
            return appearance ? `${base}，外貌特征：${appearance}` : base;
          }).join('; ')}
主角：${protagonist?.name || '你'}

当前场景连接的其他场景：${connectedScenes.map(s => s.name).join('、') || '无'}

${timeInfluencePrompt}

${characterMemoriesText ? `${characterMemoriesText}\n\n重要：请根据以上对话历史和记忆，生成符合角色与主角关系的回复。回复要体现出角色对主角的态度变化，参考历史对话中的互动方式。` : ''}

${selectedCharsInfo ? `选中对话的角色详细信息（请注意这些角色的外貌特征，他们当前穿的衣服）：\n${selectedCharsInfo}\n` : ''}

玩家（主角）选择了/说了：${playerChoiceForAI}

重要规则：
1. 只能生成其他角色（非主角）的回应，或者旁白描述
2. 绝对不能以主角（${protagonist?.name || '你'}）的身份说话或行动
3. 主角的所有动作和语言都只能由玩家自己输入或选择
4. 如果需要描述主角的反应，只能用第三方视角的旁白描述
5. 角色的回应要符合他们当前的情绪、好感度、精神压力等状态
6. 好感度高的角色会更热情，信赖度高的角色会更坦诚，精神压力高的角色会更烦躁或不安

重要：角色对主角的态度应该基于历史对话和记忆来决定：
- 如果历史对话中主角对角色很好，角色应该更热情友好
- 如果历史对话中有冲突或不愉快，角色应该保持警惕或冷漠
- 如果角色被主角收服过，应该表现出服从和亲近
- 回复要体现出角色性格和历史关系的延续性

重要：如果角色想要离开当前场景去其他地方，必须先在对话中说明离开的原因（比如："我还有事，先走了"、"这里太危险了，我得离开"等），然后再在moveTo字段中填写目标场景名称（必须是上面列出的连接场景中的一个，或者空字符串表示不移动）。

请生成角色的回应，将动作和对话分开。如果是旁白，只需要dialogue部分。
重要：回复格式要求 - 第一行是动作描述，第二行是对话内容。
用JSON格式返回：
{
  "speaker": "角色名或旁白（不能是${protagonist?.name || '你'}）",
  "action": "角色的动作描述（没有则为空字符串）",
  "dialogue": "角色说的话（没有则为空字符串），如果要离开，这里要说明原因",
  "moveTo": "目标场景名称，不移动则为空字符串"
}
注意：action和dialogue至少要有一个有内容。
`;

          const result = await generateWithAI(prompt, aiProvider, { maxTokens: MAX_TOKENS.DIALOGUE, jsonResponse: true });
          if (result && typeof result === 'object') {
            let speaker = result.speaker || '旁白';

            if (protagonist && speaker === protagonist.name) {
              speaker = '旁白';
            }

            // 构建显示文本：第一行动作，第二行对话
            let displayText = '';
            if (result.action && result.action.trim()) {
              displayText += result.action;
            }
            if (result.dialogue && result.dialogue.trim()) {
              if (displayText) displayText += '\n';
              displayText += result.dialogue;
            }
            if (!displayText) {
              displayText = result.text || '...'; // 兼容旧格式
            }

            const characterDialogue = {
              speaker,
              text: displayText,
              action: result.action || '',
              dialogue: result.dialogue || '',
              moveTo: result.moveTo || ''
            };
            dispatch({
              type: 'ADD_DIALOGUE',
              payload: characterDialogue
            });

            // 检查是否有移动意图
            const speakingCharacter = sceneCharacters.find(c => c.name === speaker && !c.isProtagonist);
            if (speakingCharacter && result.moveTo && result.moveTo.trim()) {
              // 保存移动信息，等待玩家确认
              setPendingCharacterMove({
                character: speakingCharacter,
                moveTo: result.moveTo,
                targetSceneName: result.moveTo
              });
            } else {
              // 没有移动，继续处理
              // 将对话添加到所有选中角色的当前对话中（包括自己）
              // 这样取消选择时才能正确压缩记忆
              for (const char of selectedTalkingCharacters) {
                dispatch({
                  type: 'ADD_CHARACTER_CURRENT_DIALOGUE',
                  payload: {
                    characterId: char.id,
                    dialogue: characterDialogue
                  }
                });
              }

              if (speakingCharacter) {
                await updateCharacterStatus(speakingCharacter, playerChoiceForAI, result.dialogue || displayText);
              }

              await updateProtagonistPersonality(playerChoiceForAI, result.dialogue || displayText);

              // 角色回应后推进时间5-15分钟
              advanceGameTime(Math.floor(Math.random() * 11) + 5);
            }
          }
        } catch (error) {
          console.error('AI generation failed:', error);
          dispatch({
            type: 'ADD_DIALOGUE',
            payload: { speaker: '旁白', text: 'AI 回应生成失败，请检查 API 设置。' }
          });
        }
    } else {
      // 多个角色，依次回应
      await startMultiCharacterResponses(playerChoiceForAI);
      return; // startMultiCharacterResponses会处理isProcessing状态
    }

    setIsProcessing(false);
  };

  // 拍照功能
  const handleTakePhoto = async () => {
    if (isTakingPhoto || isProcessing) return;

    setIsTakingPhoto(true);
    setPhotoResult(null);
    setShowTakingPhoto(true);

    // 2秒后关闭"正在拍照"对话框
    setTimeout(() => {
      setShowTakingPhoto(false);
    }, 2000);

    // 构建拍照提示词
    const charactersInPhoto = [];

    // 添加主角 - 使用更详细的外貌描述，明确标注
    let protagonistDesc = '';
    if (protagonist) {
      const protagPhysical = protagonist.physicalAppearance || {};
      const hairStyle = protagPhysical.hairStyle || '';
      const hairColor = protagPhysical.hairColor || '';
      const eyeColor = protagPhysical.eyeColor || '';
      const bodyType = protagPhysical.bodyType || '';
      const height = protagPhysical.height || '';
      const clothing = protagPhysical.clothing || '';
      const gender = protagonist.gender || '';
      const age = protagonist.age || '';

      // 主角描述 - 使用【玩家】标签
      protagonistDesc = `【玩家/主角】${protagonist.name}
- 性别：${gender}
- 年龄：${age}岁
- 身高：${height || '普通'}
- 发型：${hairStyle}
- 发色：${hairColor}
- 眼睛：${eyeColor}
- 体型：${bodyType}
- 穿着：${clothing || '默认服装'}`;
    }

    // 添加选中的角色 - 明确区分已收服和未收服
    const capturedCharsDesc = [];
    const normalCharsDesc = [];

    for (const char of selectedTalkingCharacters) {
      const physical = char.physicalAppearance || {};
      const hairStyle = physical.hairStyle || '';
      const hairColor = physical.hairColor || '';
      const eyeColor = physical.eyeColor || '';
      const bodyType = physical.bodyType || '';
      const height = physical.height || '';
      const clothing = physical.clothing || '';
      const isCaptured = char.characterStatus?.isCaptured;
      const gender = char.gender || '';
      const age = char.age || '';

      const charInfo = `【${isCaptured ? '被收服角色' : '普通角色'}】${char.name}
- 性别：${gender}
- 年龄：${age}岁
- 身高：${height || '普通'}
- 发型：${hairStyle}
- 发色：${hairColor}
- 眼睛：${eyeColor}
- 体型：${bodyType}
- 当前穿着：${clothing || '默认服装'}${isCaptured ? ' ← 这是该角色的当前标志性穿着' : ''}`;

      if (isCaptured) {
        capturedCharsDesc.push(charInfo);
      } else {
        normalCharsDesc.push(charInfo);
      }
    }

    if (!protagonist || selectedTalkingCharacters.length === 0) {
      // 至少需要主角和另一个角色
      setIsTakingPhoto(false);
      alert('请先选择至少一个角色一起拍照');
      return;
    }

    const anglePart = photoAngle ? `，拍摄角度：${photoAngle}` : '';
    const posePart = photoPose ? `，统一姿势：${photoPose}` : '';
    const coopPosePart = photoCoopPose ? `，合作姿势：${photoCoopPose}` : '';
    const moodPart = photoMood ? `，氛围：${photoMood}` : '';
    const customPart = photoCustom ? `，${photoCustom}` : '';

    // 过滤场景描述中的人物描述，只保留风景
    const sceneDesc = currentScene?.description || '';
    const sceneName = currentScene?.name || '';
    // 移除所有人物相关词汇
    const personKeywords = /人物|人|角色|角色们|npc|npc们|居民|商人|老板|行人|游客|行人|们|市民|村民|农夫|猎人|士兵|骑士|法师|道士|国王|皇后|公主|王子|贵族|仆人/g;
    const filteredSceneDesc = sceneDesc.replace(personKeywords, '').replace(/\s+/g, ' ').trim();

    // 构建角色单独姿势描述
    const buildPoseDesc = () => {
      const parts = [];
      // 主角姿势
      if (photoCharacterPoses['protagonist']) {
        parts.push(`【${protagonist.name}】：${photoCharacterPoses['protagonist']}姿`);
      }
      // 每个选中角色的姿势
      selectedTalkingCharacters.forEach(char => {
        if (photoCharacterPoses[char.id]) {
          parts.push(`【${char.name}】：${photoCharacterPoses[char.id]}姿`);
        }
      });
      return parts.length > 0 ? `\n【个人姿势】\n${parts.join('，')}` : '';
    };

    // 构建最终提示词 - 使用清晰的分段结构
    const capturedSection = capturedCharsDesc.length > 0 ? `\n【被收服角色】（当前穿着是显著特征）\n${capturedCharsDesc.join('\n\n')}` : '';
    const normalSection = normalCharsDesc.length > 0 ? `\n【普通角色】\n${normalCharsDesc.join('\n\n')}` : '';
    const individualPoseSection = buildPoseDesc();

    // 计算总人数
    const totalPeople = 1 + selectedTalkingCharacters.length;

    const prompt = `【严格禁止】绝对不能生成以下人员之外的任何其他人物！照片中必须且只能有 exactly ${totalPeople} 个人物！

【人员名单】（共${totalPeople}人）
${protagonistDesc}${capturedSection}${normalSection}

【拍照规则 - 最高优先级】
1. 【人数限制】照片中必须且只能有 exactly ${totalPeople} 个人物！不能多一个，也不能少一个！
2. 每个人物必须严格按照上述描述生成，不能随意更改穿着
3. 【玩家/主角】必须保持其描述的发型、发色、眼睛、体型和穿着
4. 【被收服角色】的当前穿着是标志性特征，必须准确呈现
5. 禁止生成任何其他人物（路人、旁观者、服务员、陌生人均禁止）
6. 场景中只能有上述${totalPeople}人

【拍摄设置】${anglePart || '默认角度'}${posePart || ''}${coopPosePart || ''}${moodPart || '默认氛围'}${customPart || ''}${individualPoseSection}

【场景背景】${sceneName}${filteredSceneDesc ? '，' + filteredSceneDesc : ''}，${state.world.name || '奇幻'}风格

【技术要求】专业人像摄影，背景虚化，柔和自然光，高清，细节丰富，画面和谐自然`;

    console.log('拍照提示词:', prompt);

    try {
      let imageUrl;

      if (photoMode === 'image2image') {
        // 图生图模式：收集所有角色的图片作为参考
        const characterImages = [];

        // 添加主角图片
        if (protagonist?.imageUrl) {
          characterImages.push(protagonist.imageUrl);
        }

        // 添加选中角色的图片
        for (const char of selectedTalkingCharacters) {
          if (char.imageUrl) {
            characterImages.push(char.imageUrl);
          }
        }

        if (characterImages.length === 0) {
          alert('图生图模式需要角色有现有图片，请先为角色生成图片');
          setIsTakingPhoto(false);
          return;
        }

        console.log('图生图模式，使用参考图片:', characterImages);

        // 将本地缓存 URL 转换为图床 URL
        const uploadLocalImage = async (url) => {
          // 如果已经是外部 URL，直接返回
          if (url.startsWith('http://') || url.startsWith('https://')) {
            // 排除本地缓存 URL
            if (!url.includes('/cache-images/') && !url.includes('localhost')) {
              return url;
            }
          }

          // 如果是 data: 或 blob: URL，先下载再上传
          if (url.startsWith('data:') || url.startsWith('blob:')) {
            try {
              const response = await fetch(url);
              const blob = await response.blob();
              const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
              return await uploadImage(base64);
            } catch (err) {
              console.error('上传本地图片失败:', err);
              return null;
            }
          }

          // 如果是本地缓存 URL，需要先下载再上传到图床
          if (url.startsWith('/cache-images/') || url.includes('localhost')) {
            try {
              // 完整 URL
              const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
              const response = await fetch(fullUrl);
              const blob = await response.blob();
              const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
              return await uploadImage(base64);
            } catch (err) {
              console.error('上传本地缓存图片失败:', err);
              return null;
            }
          }

          return url;
        };

        // 上传所有图片到图床
        const uploadedUrls = [];
        for (const imgUrl of characterImages) {
          const uploaded = await uploadLocalImage(imgUrl);
          if (uploaded) {
            uploadedUrls.push(uploaded);
          } else {
            console.error('图片上传失败，跳过:', imgUrl);
          }
        }

        if (uploadedUrls.length === 0) {
          alert('所有图片上传失败，请检查网络连接');
          setIsTakingPhoto(false);
          return;
        }

        console.log('图生图模式，上传后的图片 URL:', uploadedUrls);

        // 构建图生图的提示词
        const imagePrompt = `照片中所有人摆出以下姿势：${photoPose || '随意站立'}${photoCoopPose ? '，合作姿势：' + photoCoopPose : ''}，${photoAngle || '正面'}拍摄角度，${photoMood || '自然'}的氛围${photoCustom ? '，' + photoCustom : ''}。参考提供的角色图片，保持每个人的外貌特征不变，生成一张合影。`;

        // 调用图生图 API（使用带轮询的版本）
        const result = await imageToImageWithProgress({
          prompt: imagePrompt,
          image_urls: uploadedUrls,
          aspect_ratio: '16:9',
          n: 1
        });

        // 处理图生图结果
        if (result?.url) {
          imageUrl = result.url;
        } else if (typeof result === 'string') {
          imageUrl = result;
        } else {
          throw new Error('图生图生成失败');
        }
      } else {
        // 文生图模式：使用现有逻辑
        imageUrl = await generateImage(prompt, '16:9');
      }

      if (imageUrl) {
        // 构建角色列表用于显示
        const allChars = [protagonist.name, ...selectedTalkingCharacters.map(c => c.name)].join('、');
        const newPhoto = {
          url: imageUrl,
          timestamp: new Date().toISOString(),
          characters: allChars,
          gameTime: { ...state.gameTime }
        };
        setPhotoResult(newPhoto);
        setPhotoAlbum(prev => [newPhoto, ...prev]);
        console.log('拍照成功:', imageUrl);

        // 显示"照片已生成"对话框
        setShowPhotoGenerated(true);

        // 保存照片到数据库
        savePhotoToDatabase(newPhoto, state.world?.id);

        // 拍照成功后：增加已收服角色的好感度和服从度，并让所有角色说感言
        const photoDialogues = [];

        // 主角感言
        photoDialogues.push({
          speaker: '旁白',
          text: `${protagonist.name}看着照片，满意地笑了。`
        });

        // 对话中所有已收服的角色感言
        const capturedChars = selectedTalkingCharacters.filter(c => c.characterStatus?.isCaptured);
        capturedChars.forEach(char => {
          // 增加好感度和服从度
          const currentAffection = char.characterStatus?.relationship?.affection || 50;
          const currentObedience = char.characterStatus?.relationship?.obedience || 30;

          dispatch({
            type: 'UPDATE_CHARACTER',
            payload: {
              id: char.id,
              characterStatus: {
                ...char.characterStatus,
                relationship: {
                  ...char.characterStatus.relationship,
                  affection: Math.min(100, currentAffection + 3),
                  obedience: Math.min(100, currentObedience + 2)
                }
              }
            }
          });

          // 角色感言
          const comments = [
            `和${protagonist.name}一起拍照很开心呢！`,
            `这张照片拍得真好看！`,
            `${protagonist.name}，我们可以再拍一张吗？`,
            `这是我最喜欢的照片了！`,
            `有${protagonist.name}在，感觉很安心呢。`
          ];
          const randomComment = comments[Math.floor(Math.random() * comments.length)];
          photoDialogues.push({
            speaker: char.name,
            text: randomComment
          });
        });

        // 未收服的角色感言（如果有的话）
        const normalChars = selectedTalkingCharacters.filter(c => !c.characterStatus?.isCaptured);
        normalChars.forEach(char => {
          const comments = [
            `这张照片拍得不错。`,
            `嗯...还行吧。`,
            `没想到效果还可以。`,
            `有意思的体验。`
          ];
          const randomComment = comments[Math.floor(Math.random() * comments.length)];
          photoDialogues.push({
            speaker: char.name,
            text: randomComment
          });
        });

        // 将感言添加到对话历史
        photoDialogues.forEach(dialogue => {
          dispatch({
            type: 'ADD_DIALOGUE',
            payload: dialogue
          });
        });

      } else {
        alert('拍照失败，请检查图片API配置');
      }
    } catch (err) {
      console.error('拍照失败:', err);
      alert('拍照失败：' + err.message);
    } finally {
      setIsTakingPhoto(false);
      setShowTakingPhoto(false);
      setShowPhotoOptions(false);
      // 清空拍照选项
      setPhotoAngle('');
      setPhotoPose('');
      setPhotoMood('');
      setPhotoCustom('');
      setPhotoCharacterPoses({});
      setPhotoCoopPose('');
    }
  };

  // 确认拍照（从选项对话框触发）
  const confirmTakePhoto = () => {
    if (selectedTalkingCharacters.length === 0) {
      alert('请先选择至少一个角色一起拍照');
      return;
    }
    setShowPhotoOptions(false);
    handleTakePhoto();
  };

  // 主角修改外貌（保存并重新获取）
  const handleProtagonistEdit = async () => {
    if (!protagonistEditValue.trim() || !protagonist) return;

    const newValue = protagonistEditValue.trim();
    const field = protagonistEditField;

    // 构建新的外貌数据
    const newPhysicalAppearance = {
      ...protagonist.physicalAppearance,
      [field]: newValue
    };

    // 先更新本地状态
    dispatch({
      type: 'UPDATE_CHARACTER',
      payload: {
        id: protagonist.id,
        physicalAppearance: newPhysicalAppearance
      }
    });

    // 保存到数据库
    await saveCharacterToDatabase(
      { ...protagonist, physicalAppearance: newPhysicalAppearance },
      state.world?.id
    );

    // 从数据库重新获取角色数据
    try {
      const freshChar = await apiClient.characters.getById(protagonist.id);
      if (freshChar) {
        // 用数据库返回的数据更新状态（确保数据一致性）
        // 注意：UPDATE_CHARACTER 需要 { id, updates: {...} } 格式
        dispatch({
          type: 'UPDATE_CHARACTER',
          payload: {
            id: freshChar.id,
            updates: freshChar
          }
        });
      }
    } catch (err) {
      console.warn('Failed to re-fetch character from database:', err);
    }

    // 标记需要重新生成图片
    setProtagonistNeedsRegen(true);

    setShowProtagonistEdit(false);
    setProtagonistEditField('');
    setProtagonistEditValue('');
  };

  // 重新生成主角图片
  const handleRegenerateProtagonistImage = async () => {
    if (!protagonist || isProcessing) return;

    setIsProcessing(true);
    setProtagonistClothingChange(`${protagonist.name} 正在重新生成角色图...`);

    const physical = protagonist.physicalAppearance || {};
    const prompt = `${protagonist.name || '主角'}，人物肖像，${physical.hairStyle || ''}，${physical.hairColor || ''}，${physical.eyeColor || ''}的眼睛，${physical.bodyType || ''}的身材，穿着${physical.clothing || '服装'}，${state.world.name || '奇幻'}风格，专业人像摄影，背景虚化，浅景深，柔和自然光，高清，细节丰富`;

    console.log('生成主角图片 prompt:', prompt);

    try {
      const newImageUrl = await generateImage(prompt, '2:3');
      if (newImageUrl) {
        const updatedChar = { ...protagonist, imageUrl: newImageUrl };

        // 更新本地状态
        dispatch({
          type: 'UPDATE_CHARACTER',
          payload: {
            id: protagonist.id,
            updates: { imageUrl: newImageUrl }
          }
        });
        console.log('主角图片已更新:', newImageUrl);

        // 保存到数据库
        await saveCharacterToDatabase(updatedChar, state.world?.id);

        // 从数据库重新获取最新数据
        try {
          const freshChar = await apiClient.characters.getById(protagonist.id);
          if (freshChar) {
            dispatch({
              type: 'UPDATE_CHARACTER',
              payload: {
                id: freshChar.id,
                updates: freshChar
              }
            });
          }
        } catch (err) {
          console.warn('Failed to re-fetch protagonist from database:', err);
        }

        // 添加对话记录
        dispatch({
          type: 'ADD_DIALOGUE',
          payload: { speaker: '旁白', text: `${protagonist.name}的外貌已更新。` }
        });

        setProtagonistNeedsRegen(false);
      }
    } catch (err) {
      console.error('生成主角图片失败:', err);
    }

    setProtagonistClothingChange('');
    setIsProcessing(false);
  };

  // 打开角色编辑面板
  const openCharacterEdit = (character) => {
    setEditingCharacter(character);
    setCharacterEditData({
      name: character.name || '',
      gender: character.gender || '',
      age: character.age || '',
      personality: character.personality || '',
      background: character.background || '',
      hairStyle: character.physicalAppearance?.hairStyle || '',
      hairColor: character.physicalAppearance?.hairColor || '',
      eyeColor: character.physicalAppearance?.eyeColor || '',
      bodyType: character.physicalAppearance?.bodyType || '',
      height: character.physicalAppearance?.height || '',
      clothing: character.physicalAppearance?.clothing || ''
    });
    setShowCharacterEdit(true);
  };

  // 更新角色编辑数据
  const updateCharacterEditData = (field, value) => {
    setCharacterEditData(prev => ({ ...prev, [field]: value }));
    if (editingCharacter) {
      setCharacterNeedsRegen(prev => ({ ...prev, [editingCharacter.id]: true }));
    }
  };

  // 保存角色编辑（仅保存，不生成图片）
  const saveCharacterEdit = () => {
    if (!editingCharacter) return;

    dispatch({
      type: 'UPDATE_CHARACTER',
      payload: {
        id: editingCharacter.id,
        name: characterEditData.name,
        gender: characterEditData.gender,
        age: characterEditData.age,
        personality: characterEditData.personality,
        background: characterEditData.background,
        physicalAppearance: {
          hairStyle: characterEditData.hairStyle,
          hairColor: characterEditData.hairColor,
          eyeColor: characterEditData.eyeColor,
          bodyType: characterEditData.bodyType,
          height: characterEditData.height,
          clothing: characterEditData.clothing
        }
      }
    });

    setShowCharacterEdit(false);
    setEditingCharacter(null);
    setCharacterEditData({});
  };

  // 重新生成角色图片
  const handleRegenerateCharacterImage = async (character) => {
    if (!character || characterRegenerating) return;

    setCharacterRegenerating(character.id);

    const physical = character.physicalAppearance || {};
    const charName = character.name || '角色';

    const prompt = `${charName}，人物肖像，${characterEditData.hairStyle || physical.hairStyle || ''}，${characterEditData.hairColor || physical.hairColor || ''}，${characterEditData.eyeColor || physical.eyeColor || ''}的眼睛，${characterEditData.bodyType || physical.bodyType || ''}的身材，${characterEditData.height || physical.height || ''}身高，穿着${characterEditData.clothing || physical.clothing || '服装'}，${state.world.name || '奇幻'}风格，专业人像摄影，背景虚化，浅景深，柔和自然光，高清，细节丰富`;

    console.log('生成角色图片 prompt:', prompt);

    try {
      const newImageUrl = await generateImage(prompt, '2:3');
      if (newImageUrl) {
        // 先更新编辑数据
        dispatch({
          type: 'UPDATE_CHARACTER',
          payload: {
            id: character.id,
            name: characterEditData.name,
            gender: characterEditData.gender,
            age: characterEditData.age,
            personality: characterEditData.personality,
            background: characterEditData.background,
            physicalAppearance: {
              hairStyle: characterEditData.hairStyle,
              hairColor: characterEditData.hairColor,
              eyeColor: characterEditData.eyeColor,
              bodyType: characterEditData.bodyType,
              height: characterEditData.height,
              clothing: characterEditData.clothing
            },
            imageUrl: newImageUrl
          }
        });

        console.log('角色图片已更新:', newImageUrl);
        setCharacterNeedsRegen(prev => ({ ...prev, [character.id]: false }));
      }
    } catch (err) {
      console.error('生成角色图片失败:', err);
    }

    setCharacterRegenerating(null);
  };

  const handleFreeInput = async () => {
    if ((!freeInputAction.trim() && !freeInputDialogue.trim()) || isProcessing || isMultiCharacterResponding || waitingForConfirm) return;

    const inputAction = freeInputAction;
    const inputDialogue = freeInputDialogue;
    setFreeInputAction('');
    setFreeInputDialogue('');
    await handleChoice({ action: inputAction, dialogue: inputDialogue });
  };

  // 更新主角性格
  const updateProtagonistPersonality = async (playerChoice, characterResponse) => {
    try {
      const protagPersonality = state.protagonistPersonality;
      const oldTraits = protagPersonality?.personalityTraits || { extroversion: 50, rationality: 50, orderliness: 50, optimism: 50 };

      const prompt = `
主角设定：
性格描述：${protagPersonality?.personalityDescription || protagonist?.personality || '普通冒险者'}

当前性格指标：
- 外向：${oldTraits.extroversion}/100
- 理性：${oldTraits.rationality}/100
- 守序：${oldTraits.orderliness}/100
- 乐观：${oldTraits.optimism}/100

最近互动：
主角选择/说：${playerChoice}
角色回应：${characterResponse}

请分析主角的言行，判断主角的性格指标是否需要微调。每次变化建议在-5到+5之间。

返回JSON格式：
{
  "personalityTraits": {
    "extroversion": 新的外向值0-100,
    "rationality": 新的理性值0-100,
    "orderliness": 新的守序值0-100,
    "optimism": 新的乐观值0-100
  },
  "currentMood": "平静|愉悦|困惑|恼怒|兴奋|失望"
}
`;

      const result = await generateWithAI(prompt, aiProvider, { maxTokens: MAX_TOKENS.DIALOGUE, jsonResponse: true });
      if (result && result.personalityTraits) {
        dispatch({
          type: 'UPDATE_PROTAGONIST_PERSONALITY',
          payload: {
            personalityTraits: result.personalityTraits,
            currentMood: result.currentMood || protagPersonality?.currentMood || '平静'
          }
        });
      }
    } catch (error) {
      console.error('Failed to update protagonist personality:', error);
    }
  };

  const getDefaultChoices = () => {
    const choices = [];
    choices.push({ action: '观察周围环境', dialogue: '' });
    if (sceneCharacters.length > 0 && selectedTalkingCharacters.length > 0) {
      choices.push({ action: '', dialogue: `和${selectedTalkingCharacters[0].name}交谈` });
    } else if (sceneCharacters.length > 0) {
      choices.push({ action: '', dialogue: '和在场的人交谈' });
    }
    choices.push({ action: '思考接下来的行动', dialogue: '' });
    return choices;
  };

  // 从 worldMap 解析场景信息（用于懒加载场景）
  const parseWorldMapScenes = (mermaidCode) => {
    if (!mermaidCode) return [];

    const scenes = [];
    // 匹配格式: A[文本] --> B[文本] 或 A[文本] -->|条件| B[文本]
    const nodePattern = /([A-Z]+)\[([^\]]+)\]/g;
    const edgePattern = /([A-Z]+)\s*-->(?:\|([^\|]+)\|)?\s*([A-Z]+)/g;

    let match;
    while ((match = nodePattern.exec(mermaidCode)) !== null) {
      const id = match[1];
      const name = match[2].replace(/起点：/g, '').trim();
      const isStart = match[2].includes('起点：');
      // 检查是否已存在于 state.scenes
      const existingScene = state.scenes.find(s => s.id === id || s.name === name);
      if (!existingScene) {
        scenes.push({ id, name, isStart, isLazy: true });
      }
    }

    return scenes;
  };

  // 获取所有连接的 Scenes（包含未生成的懒加载场景）
  const getAllConnectedScenes = () => {
    const result = [];

    // 1. 已生成的场景
    const generatedScenes = (currentScene?.connectedScenes || [])
      .map(id => state.scenes.find(s => s.id === id))
      .filter(Boolean);
    result.push(...generatedScenes);

    // 2. 如果有 worldMap，解析未生成的场景
    if (state.world?.worldMap && currentScene?.connectedScenes) {
      const lazyScenes = parseWorldMapScenes(state.world.worldMap);

      // 添加未生成的懒加载场景（只添加尚未在 result 中的）
      currentScene.connectedScenes.forEach(connId => {
        // 检查是否已添加（无论是通过 generatedScenes 还是 lazyScenes）
        const alreadyAdded = result.some(s => s.id === connId) ||
          lazyScenes.some(s => s.id === connId);

        if (!alreadyAdded) {
          const lazyScene = lazyScenes.find(s => s.id === connId);
          if (lazyScene) {
            result.push(lazyScene);
          }
        }
      });
    }

    return result;
  };

  const connectedScenes = getAllConnectedScenes();

  const lastDialogue = state.dialogueHistory[state.dialogueHistory.length - 1];

  // 初始化时设置当前世界ID
  useEffect(() => {
    if (state.world && state.world.name) {
      // 尝试从state中获取世界ID，如果没有则在保存时生成
      saveCurrentWorldToCache('current', state);
    }
  }, []);

  const handleLoadState = (newState) => {
    dispatch({ type: 'SET_STATE', payload: newState });
    // 加载状态后重置处理索引
    lastProcessedDialogueIndexRef.current = -1;
  };

  // 刷新角色头像
  const handleRefreshAvatar = async (character) => {
    if (refreshingAvatars.has(character.id)) return;

    setRefreshingAvatars(prev => new Set([...prev, character.id]));

    try {
      const physicalAppearance = character.characterStatus?.physicalAppearance || {};
      // 确保 expression 是对象
      const rawExpression = character.characterStatus?.expression;
      const expression = (rawExpression && typeof rawExpression === 'object' && !Array.isArray(rawExpression))
        ? rawExpression
        : (typeof rawExpression === 'string' ? { currentExpression: rawExpression, expressionIntensity: '平静', facialDetails: '' } : {});

      // 提取年龄
      let ageText = '';
      if (character.age) {
        const ageStr = String(character.age);
        const ageMatch = ageStr.match(/(\d+)/);
        ageText = ageMatch ? ageMatch[1] : '';
      }

      // 构建提示词
      const promptParts = [];
      promptParts.push(`一位${ageText || ''}岁${character.gender || ''}`);

      // 发型描述
      const hairParts = [];
      if (physicalAppearance.hairColor) hairParts.push(physicalAppearance.hairColor);
      if (physicalAppearance.hairStyle) hairParts.push(physicalAppearance.hairStyle);
      if (hairParts.length > 0) {
        promptParts.push(`，${hairParts.join('')}`);
      }

      // 表情描述
      if (expression.currentExpression && expression.currentExpression !== '自然') {
        promptParts.push(`，${expression.currentExpression}的表情`);
      }

      // 服装描述
      promptParts.push(`，穿着${physicalAppearance.clothing || '适合的服装'}`);

      // 姿态描述
      promptParts.push(`，自然站立姿态`);

      // 背景环境
      promptParts.push(`，${state.world.name || '奇幻'}风格背景`);

      // 摄影技术参数
      promptParts.push(`，背景虚化，浅景深`);
      promptParts.push(`，柔和自然光，面部光线柔和均匀`);
      promptParts.push(`，专业人像摄影风格，85mm f/1.8镜头`);
      promptParts.push(`，高清，细节丰富，皮肤质感自然`);

      const prompt = promptParts.join('');
      const imageUrl = await generateImage(prompt, '2:3');

      if (imageUrl) {
        dispatch({
          type: 'UPDATE_CHARACTER',
          payload: {
            id: character.id,
            imageUrl
          }
        });
      }
    } catch (err) {
      console.error(`Failed to refresh avatar for ${character.name}:`, err);
      alert('头像刷新失败: ' + err.message);
    } finally {
      setRefreshingAvatars(prev => {
        const newSet = new Set(prev);
        newSet.delete(character.id);
        return newSet;
      });
    }
  };

  // 初始化时不自动生成选项，等待玩家点击刷新按钮

  return (
    <div className="scene-view">
      <div className="game-header">
        <h2>{state.world.name}</h2>
        <GameTimeDisplay />
        <button className="header-btn timeskip" onClick={() => setShowTimeSkip(true)}>⏱️ 跳跃时间</button>
        <div className="header-actions">
          <button className="header-btn camera" onClick={() => { if (selectedTalkingCharacters.length > 0) setShowPhotoOptions(true); else alert('请先选择至少一个角色一起拍照'); }} disabled={isTakingPhoto || isProcessing}>📷 拍照</button>
          <button className="header-btn album" onClick={() => setShowAlbum(true)}>🖼️ 相册 ({photoAlbum.length})</button>
          <button className="header-btn edit" onClick={() => setShowCharacterEdit(true)}>✏️ 角色编辑</button>
          <button className="header-btn save" onClick={handleSave}>保存</button>
          <button className="header-btn export" onClick={handleExport}>导出</button>
          <button className="header-btn narrator" onClick={() => setShowNarratorMemory(!showNarratorMemory)}>📜 旁白记忆</button>
          <button className="header-btn help" onClick={() => setShowHelp(!showHelp)}>❓ 游玩说明</button>
          <button className="header-btn menu" onClick={() => setShowMap(!showMap)}>地图</button>
          <button className="header-btn menu" onClick={() => setShowHistory(!showHistory)}>历史</button>
          <button className="header-btn menu" onClick={() => setShowMenu(!showMenu)}>菜单</button>
        </div>
      </div>

      {/* 游戏菜单弹窗 */}
      {showMenu && (
        <div className="menu-overlay" onClick={() => setShowMenu(false)}>
          <div className="menu-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>游戏菜单</h3>
            <button className="menu-option" onClick={() => setShowMenu(false)}>
              继续游戏
            </button>
            <button className="menu-option" onClick={() => {
              setShowMenu(false);
              onBackToMenu();
            }}>
              退回主桌面
            </button>
            <button className="menu-option" onClick={() => {
              setShowMenu(false);
              handleSave();
            }}>
              保存当前游戏
            </button>
            <button className="menu-option" onClick={() => {
              setShowMenu(false);
              setShowTimeTravel(true);
            }}>
              ⏰ 时间旅行
            </button>
            <button className="menu-option" onClick={() => {
              setShowMenu(false);
              setShowWorldSwitcher(true);
            }}>
              🌍 切换世界
            </button>
          </div>
        </div>
      )}

      {/* 时间跳跃对话框 */}
      {showTimeSkip && (
        <div className="menu-overlay" onClick={() => setShowTimeSkip(false)}>
          <div className="menu-dialog time-skip-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>跳跃时间</h3>
            <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: '1rem' }}>
              当前时间：{state.gameTime.year}年{state.gameTime.month}月{state.gameTime.day}日 {state.gameTime.hour}:{state.gameTime.minute.toString().padStart(2, '0')}
            </p>

            <div className="time-skip-section">
              <h4 style={{ color: '#e94560', marginBottom: '0.5rem' }}>快捷跳跃</h4>
              <div className="time-skip-quick-buttons">
                <button className="time-skip-quick-btn" onClick={() => dispatch({ type: 'SKIP_DAYS', payload: { days: 1 } })}>+1天</button>
                <button className="time-skip-quick-btn" onClick={() => dispatch({ type: 'SKIP_DAYS', payload: { days: 3 } })}>+3天</button>
                <button className="time-skip-quick-btn" onClick={() => dispatch({ type: 'SKIP_DAYS', payload: { days: 7 } })}>+1周</button>
                <button className="time-skip-quick-btn" onClick={() => dispatch({ type: 'SKIP_DAYS', payload: { days: 14 } })}>+2周</button>
                <button className="time-skip-quick-btn" onClick={() => dispatch({ type: 'SKIP_DAYS', payload: { days: 30 } })}>+1月</button>
              </div>
            </div>

            <div className="time-skip-divider">或直接设置时间</div>

            <div className="time-skip-form">
              <div className="time-skip-row">
                <label>年：</label>
                <input
                  type="number"
                  min={state.gameTime.year}
                  max={2099}
                  value={state.gameTime.year}
                  onChange={(e) => dispatch({
                    type: 'SET_GAME_TIME',
                    payload: { ...state.gameTime, year: parseInt(e.target.value) || state.gameTime.year }
                  })}
                />
              </div>
              <div className="time-skip-row">
                <label>月：</label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={state.gameTime.month}
                  onChange={(e) => dispatch({
                    type: 'SET_GAME_TIME',
                    payload: { ...state.gameTime, month: parseInt(e.target.value) || state.gameTime.month }
                  })}
                />
              </div>
              <div className="time-skip-row">
                <label>日：</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={state.gameTime.day}
                  onChange={(e) => dispatch({
                    type: 'SET_GAME_TIME',
                    payload: { ...state.gameTime, day: parseInt(e.target.value) || state.gameTime.day }
                  })}
                />
              </div>
              <div className="time-skip-row">
                <label>时：</label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={state.gameTime.hour}
                  onChange={(e) => dispatch({
                    type: 'SET_GAME_TIME',
                    payload: { ...state.gameTime, hour: parseInt(e.target.value) || state.gameTime.hour }
                  })}
                />
              </div>
              <div className="time-skip-row">
                <label>分：</label>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={state.gameTime.minute}
                  onChange={(e) => dispatch({
                    type: 'SET_GAME_TIME',
                    payload: { ...state.gameTime, minute: parseInt(e.target.value) || state.gameTime.minute }
                  })}
                />
              </div>
            </div>
            <div className="time-skip-buttons">
              <button className="menu-option" onClick={() => setShowTimeSkip(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 拍照选项对话框 */}
      {showPhotoOptions && (
        <div className="photo-options-overlay" onClick={() => setShowPhotoOptions(false)}>
          <div className="photo-options-dialog photo-options-dialog-wide" onClick={(e) => e.stopPropagation()}>
            <h3>📷 拍照设置</h3>
            <p className="photo-options-info">拍照人员：{protagonist?.name} + {selectedTalkingCharacters.map(c => c.name).join('、')}</p>

            {/* 生成模式选择 */}
            <div className="photo-options-section">
              <label>🎨 生成模式</label>
              <div className="photo-options-chips">
                <span className={`photo-chip ${photoMode === 'text' ? 'active' : ''}`} onClick={() => setPhotoMode('text')}>📝 文生图</span>
                <span className={`photo-chip ${photoMode === 'image2image' ? 'active' : ''}`} onClick={() => setPhotoMode('image2image')}>🖼️ 图生图</span>
              </div>
              {photoMode === 'image2image' && (
                <p className="photo-options-hint">将使用角色现有图片作为参考，生成新的合影</p>
              )}
            </div>

            <div className="photo-options-section">
              <label>📐 拍摄角度</label>
              <div className="photo-options-chips">
                <span className={`photo-chip ${photoAngle === '正面' ? 'active' : ''}`} onClick={() => setPhotoAngle('正面')}>正面</span>
                <span className={`photo-chip ${photoAngle === '侧面' ? 'active' : ''}`} onClick={() => setPhotoAngle('侧面')}>侧面</span>
                <span className={`photo-chip ${photoAngle === '俯视' ? 'active' : ''}`} onClick={() => setPhotoAngle('俯视')}>俯视</span>
                <span className={`photo-chip ${photoAngle === '仰视' ? 'active' : ''}`} onClick={() => setPhotoAngle('仰视')}>仰视</span>
                <span className={`photo-chip ${photoAngle === '斜上方' ? 'active' : ''}`} onClick={() => setPhotoAngle('斜上方')}>斜上方</span>
              </div>
            </div>

            {/* 统一姿势选项 */}
            <div className="photo-options-section">
              <label>🤝 统一姿势（所有人相同）</label>
              <div className="photo-options-chips">
                <span className={`photo-chip ${photoPose === '并肩站立' ? 'active' : ''}`} onClick={() => setPhotoPose('并肩站立')}>并肩站立</span>
                <span className={`photo-chip ${photoPose === '围成圈' ? 'active' : ''}`} onClick={() => setPhotoPose('围成圈')}>围成圈</span>
                <span className={`photo-chip ${photoPose === '排成一排' ? 'active' : ''}`} onClick={() => setPhotoPose('排成一排')}>排成一排</span>
                <span className={`photo-chip ${photoPose === '随意站立' ? 'active' : ''}`} onClick={() => setPhotoPose('随意站立')}>随意站立</span>
                <span className={`photo-chip ${photoPose === '坐姿' ? 'active' : ''}`} onClick={() => setPhotoPose('坐姿')}>坐姿</span>
                <span className={`photo-chip ${photoPose === '行礼' ? 'active' : ''}`} onClick={() => setPhotoPose('行礼')}>行礼</span>
              </div>
            </div>

            {/* 合作姿势 */}
            <div className="photo-options-section">
              <label>💑 合作姿势（双人互动）</label>
              <div className="photo-options-chips">
                <span className={`photo-chip ${photoCoopPose === '牵手' ? 'active' : ''}`} onClick={() => setPhotoCoopPose('牵手')}>牵手</span>
                <span className={`photo-chip ${photoCoopPose === '拥抱' ? 'active' : ''}`} onClick={() => setPhotoCoopPose('拥抱')}>拥抱</span>
                <span className={`photo-chip ${photoCoopPose === '并肩' ? 'active' : ''}`} onClick={() => setPhotoCoopPose('并肩')}>并肩</span>
                <span className={`photo-chip ${photoCoopPose === '对视' ? 'active' : ''}`} onClick={() => setPhotoCoopPose('对视')}>对视</span>
                <span className={`photo-chip ${photoCoopPose === '背靠背' ? 'active' : ''}`} onClick={() => setPhotoCoopPose('背靠背')}>背靠背</span>
                <span className={`photo-chip ${photoCoopPose === '依偎' ? 'active' : ''}`} onClick={() => setPhotoCoopPose('依偎')}>依偎</span>
                <span className={`photo-chip ${photoCoopPose === '搭肩' ? 'active' : ''}`} onClick={() => setPhotoCoopPose('搭肩')}>搭肩</span>
                <span className={`photo-chip ${photoCoopPose === '挽手' ? 'active' : ''}`} onClick={() => setPhotoCoopPose('挽手')}>挽手</span>
              </div>
            </div>

            {/* 主角单独姿势 */}
            <div className="photo-options-section">
              <label>👤 {protagonist?.name} 单独姿势</label>
              <div className="photo-options-chips">
                <span className={`photo-chip ${photoCharacterPoses['protagonist'] === '站立' ? 'active' : ''}`} onClick={() => setPhotoCharacterPoses({ ...photoCharacterPoses, protagonist: '站立' })}>站立</span>
                <span className={`photo-chip ${photoCharacterPoses['protagonist'] === '坐下' ? 'active' : ''}`} onClick={() => setPhotoCharacterPoses({ ...photoCharacterPoses, protagonist: '坐下' })}>坐下</span>
                <span className={`photo-chip ${photoCharacterPoses['protagonist'] === '侧身' ? 'active' : ''}`} onClick={() => setPhotoCharacterPoses({ ...photoCharacterPoses, protagonist: '侧身' })}>侧身</span>
                <span className={`photo-chip ${photoCharacterPoses['protagonist'] === '回头' ? 'active' : ''}`} onClick={() => setPhotoCharacterPoses({ ...photoCharacterPoses, protagonist: '回头' })}>回头</span>
                <span className={`photo-chip ${photoCharacterPoses['protagonist'] === '举手' ? 'active' : ''}`} onClick={() => setPhotoCharacterPoses({ ...photoCharacterPoses, protagonist: '举手' })}>举手</span>
                <span className={`photo-chip ${photoCharacterPoses['protagonist'] === '插兜' ? 'active' : ''}`} onClick={() => setPhotoCharacterPoses({ ...photoCharacterPoses, protagonist: '插兜' })}>插兜</span>
              </div>
            </div>

            {/* 每个选中角色的单独姿势 */}
            {selectedTalkingCharacters.map(char => (
              <div key={char.id} className="photo-options-section">
                <label>👤 {char.name} 单独姿势</label>
                <div className="photo-options-chips">
                  <span className={`photo-chip ${photoCharacterPoses[char.id] === '站立' ? 'active' : ''}`} onClick={() => setPhotoCharacterPoses({ ...photoCharacterPoses, [char.id]: '站立' })}>站立</span>
                  <span className={`photo-chip ${photoCharacterPoses[char.id] === '坐下' ? 'active' : ''}`} onClick={() => setPhotoCharacterPoses({ ...photoCharacterPoses, [char.id]: '坐下' })}>坐下</span>
                  <span className={`photo-chip ${photoCharacterPoses[char.id] === '侧身' ? 'active' : ''}`} onClick={() => setPhotoCharacterPoses({ ...photoCharacterPoses, [char.id]: '侧身' })}>侧身</span>
                  <span className={`photo-chip ${photoCharacterPoses[char.id] === '回头' ? 'active' : ''}`} onClick={() => setPhotoCharacterPoses({ ...photoCharacterPoses, [char.id]: '回头' })}>回头</span>
                  <span className={`photo-chip ${photoCharacterPoses[char.id] === '举手' ? 'active' : ''}`} onClick={() => setPhotoCharacterPoses({ ...photoCharacterPoses, [char.id]: '举手' })}>举手</span>
                  <span className={`photo-chip ${photoCharacterPoses[char.id] === '叉腰' ? 'active' : ''}`} onClick={() => setPhotoCharacterPoses({ ...photoCharacterPoses, [char.id]: '叉腰' })}>叉腰</span>
                </div>
              </div>
            ))}

            <div className="photo-options-section">
              <label>🌟 氛围</label>
              <div className="photo-options-chips">
                <span className={`photo-chip ${photoMood === '温馨' ? 'active' : ''}`} onClick={() => setPhotoMood('温馨')}>温馨</span>
                <span className={`photo-chip ${photoMood === '浪漫' ? 'active' : ''}`} onClick={() => setPhotoMood('浪漫')}>浪漫</span>
                <span className={`photo-chip ${photoMood === '活泼' ? 'active' : ''}`} onClick={() => setPhotoMood('活泼')}>活泼</span>
                <span className={`photo-chip ${photoMood === '酷炫' ? 'active' : ''}`} onClick={() => setPhotoMood('酷炫')}>酷炫</span>
                <span className={`photo-chip ${photoMood === '唯美' ? 'active' : ''}`} onClick={() => setPhotoMood('唯美')}>唯美</span>
                <span className={`photo-chip ${photoMood === '搞笑' ? 'active' : ''}`} onClick={() => setPhotoMood('搞笑')}>搞笑</span>
              </div>
            </div>

            <div className="photo-options-section">
              <label>✏️ 自定义描述（可选）</label>
              <input
                type="text"
                className="photo-options-input"
                placeholder="例如：海边黄昏、樱花树下、星空夜景..."
                value={photoCustom}
                onChange={(e) => setPhotoCustom(e.target.value)}
              />
            </div>

            <div className="photo-options-buttons">
              <button className="menu-option cancel" onClick={() => {
                setShowPhotoOptions(false);
                setPhotoCharacterPoses({});
                setPhotoCoopPose('');
                setPhotoMode('text');
              }}>取消</button>
              <button className="menu-option confirm" onClick={confirmTakePhoto}>开始拍照</button>
            </div>
          </div>
        </div>
      )}

      {/* 拍照对话框 - 正在拍照中 */}
      {showTakingPhoto && (
        <div className="photo-overlay">
          <div className="photo-dialog">
            <div className="photo-loading">
              <div className="photo-icon">📷</div>
              <div className="photo-text">正在拍照...</div>
              <div className="photo-spinner"></div>
            </div>
          </div>
        </div>
      )}

      {/* 照片已生成对话框 */}
      {showPhotoGenerated && (
        <div className="photo-overlay" onClick={() => setShowPhotoGenerated(false)}>
          <div className="photo-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="photo-loading">
              <div className="photo-icon" style={{color: '#4CAF50', fontSize: '3rem'}}>✅</div>
              <div className="photo-text">照片已生成</div>
              <p style={{color: '#aaa', marginTop: '10px'}}>请点击相册查看</p>
            </div>
            <div className="photo-result-buttons">
              <button className="menu-option" onClick={() => {
                setShowPhotoGenerated(false);
                setShowAlbum(true);
              }}>查看相册</button>
              <button className="menu-option cancel" onClick={() => setShowPhotoGenerated(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* 拍照结果展示 */}
      {photoResult && (
        <div className="photo-result-overlay" onClick={() => setPhotoResult(null)}>
          <div className="photo-result-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>📷 拍照完成</h3>
            <p className="photo-result-info">{photoResult.characters}</p>
            <div className="photo-result-image" onClick={() => setFullscreenPhoto(photoResult.url)}>
              <img src={photoResult.url} alt="拍照结果" />
              <div className="photo-enlarge-hint">点击放大</div>
            </div>
            <div className="photo-result-buttons">
              <button className="menu-option" onClick={() => setPhotoResult(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* 全屏照片查看 */}
      {fullscreenPhoto && (
        <div className="fullscreen-photo-overlay" onClick={() => setFullscreenPhoto(null)}>
          <button className="fullscreen-close-btn">×</button>
          <img src={fullscreenPhoto} alt="全屏照片" className="fullscreen-photo" />
        </div>
      )}

      {/* 主角外貌编辑对话框 */}
      {showProtagonistEdit && (
        <div className="photo-options-overlay" onClick={() => setShowProtagonistEdit(false)}>
          <div className="photo-options-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>✏️ 修改{protagonistEditField === 'hairStyle' ? '发型' : protagonistEditField === 'hairColor' ? '发色' : protagonistEditField === 'eyeColor' ? '眼睛' : protagonistEditField === 'height' ? '身高' : '穿着'}</h3>
            <p className="photo-options-info">角色：{protagonist?.name}</p>

            <div className="photo-options-section">
              <label>请输入新的{protagonistEditField === 'hairStyle' ? '发型' : protagonistEditField === 'hairColor' ? '发色' : protagonistEditField === 'eyeColor' ? '眼睛颜色' : protagonistEditField === 'height' ? '身高' : '穿着描述'}</label>
              <input
                type="text"
                className="photo-options-input"
                placeholder={protagonistEditField === 'hairStyle' ? '例如：短发、长发、马尾辫...' :
                             protagonistEditField === 'hairColor' ? '例如：黑色、棕色、金色...' :
                             protagonistEditField === 'eyeColor' ? '例如：黑色、蓝色、绿色...' :
                             protagonistEditField === 'height' ? '例如：170cm、180cm...' :
                             '例如：白色衬衫、蓝色连衣裙、西装...'}
                value={protagonistEditValue}
                onChange={(e) => setProtagonistEditValue(e.target.value)}
                autoFocus
              />
            </div>

            {protagonistEditField === 'clothing' && (
              <div className="photo-options-section">
                <label>快速选择</label>
                <div className="photo-options-chips">
                  <span className={`photo-chip ${protagonistEditValue === '白色衬衫' ? 'active' : ''}`} onClick={() => setProtagonistEditValue('白色衬衫')}>白色衬衫</span>
                  <span className={`photo-chip ${protagonistEditValue === '黑色连衣裙' ? 'active' : ''}`} onClick={() => setProtagonistEditValue('黑色连衣裙')}>黑色连衣裙</span>
                  <span className={`photo-chip ${protagonistEditValue === '休闲T恤' ? 'active' : ''}`} onClick={() => setProtagonistEditValue('休闲T恤')}>休闲T恤</span>
                  <span className={`photo-chip ${protagonistEditValue === '西装' ? 'active' : ''}`} onClick={() => setProtagonistEditValue('西装')}>西装</span>
                  <span className={`photo-chip ${protagonistEditValue === '和服' ? 'active' : ''}`} onClick={() => setProtagonistEditValue('和服')}>和服</span>
                  <span className={`photo-chip ${protagonistEditValue === '校服' ? 'active' : ''}`} onClick={() => setProtagonistEditValue('校服')}>校服</span>
                </div>
              </div>
            )}

            {protagonistEditField === 'hairStyle' && (
              <div className="photo-options-section">
                <label>快速选择</label>
                <div className="photo-options-chips">
                  <span className={`photo-chip ${protagonistEditValue === '短发' ? 'active' : ''}`} onClick={() => setProtagonistEditValue('短发')}>短发</span>
                  <span className={`photo-chip ${protagonistEditValue === '长发' ? 'active' : ''}`} onClick={() => setProtagonistEditValue('长发')}>长发</span>
                  <span className={`photo-chip ${protagonistEditValue === '马尾辫' ? 'active' : ''}`} onClick={() => setProtagonistEditValue('马尾辫')}>马尾辫</span>
                  <span className={`photo-chip ${protagonistEditValue === '波浪卷' ? 'active' : ''}`} onClick={() => setProtagonistEditValue('波浪卷')}>波浪卷</span>
                  <span className={`photo-chip ${protagonistEditValue === '双马尾' ? 'active' : ''}`} onClick={() => setProtagonistEditValue('双马尾')}>双马尾</span>
                  <span className={`photo-chip ${protagonistEditValue === '平刘海' ? 'active' : ''}`} onClick={() => setProtagonistEditValue('平刘海')}>平刘海</span>
                </div>
              </div>
            )}

            {protagonistEditField === 'hairColor' && (
              <div className="photo-options-section">
                <label>快速选择</label>
                <div className="photo-options-chips">
                  <span className={`photo-chip ${protagonistEditValue === '黑色' ? 'active' : ''}`} onClick={() => setProtagonistEditValue('黑色')}>黑色</span>
                  <span className={`photo-chip ${protagonistEditValue === '棕色' ? 'active' : ''}`} onClick={() => setProtagonistEditValue('棕色')}>棕色</span>
                  <span className={`photo-chip ${protagonistEditValue === '金色' ? 'active' : ''}`} onClick={() => setProtagonistEditValue('金色')}>金色</span>
                  <span className={`photo-chip ${protagonistEditValue === '银白色' ? 'active' : ''}`} onClick={() => setProtagonistEditValue('银白色')}>银白色</span>
                  <span className={`photo-chip ${protagonistEditValue === '粉色' ? 'active' : ''}`} onClick={() => setProtagonistEditValue('粉色')}>粉色</span>
                  <span className={`photo-chip ${protagonistEditValue === '蓝色' ? 'active' : ''}`} onClick={() => setProtagonistEditValue('蓝色')}>蓝色</span>
                </div>
              </div>
            )}

            {protagonistEditField === 'eyeColor' && (
              <div className="photo-options-section">
                <label>快速选择</label>
                <div className="photo-options-chips">
                  <span className={`photo-chip ${protagonistEditValue === '黑色' ? 'active' : ''}`} onClick={() => setProtagonistEditValue('黑色')}>黑色</span>
                  <span className={`photo-chip ${protagonistEditValue === '蓝色' ? 'active' : ''}`} onClick={() => setProtagonistEditValue('蓝色')}>蓝色</span>
                  <span className={`photo-chip ${protagonistEditValue === '绿色' ? 'active' : ''}`} onClick={() => setProtagonistEditValue('绿色')}>绿色</span>
                  <span className={`photo-chip ${protagonistEditValue === '棕色' ? 'active' : ''}`} onClick={() => setProtagonistEditValue('棕色')}>棕色</span>
                  <span className={`photo-chip ${protagonistEditValue === '紫色' ? 'active' : ''}`} onClick={() => setProtagonistEditValue('紫色')}>紫色</span>
                  <span className={`photo-chip ${protagonistEditValue === '红色' ? 'active' : ''}`} onClick={() => setProtagonistEditValue('红色')}>红色</span>
                </div>
              </div>
            )}

            {protagonistEditField === 'height' && (
              <div className="photo-options-section">
                <label>快速选择</label>
                <div className="photo-options-chips">
                  <span className={`photo-chip ${protagonistEditValue === '160cm' ? 'active' : ''}`} onClick={() => setProtagonistEditValue('160cm')}>160cm</span>
                  <span className={`photo-chip ${protagonistEditValue === '165cm' ? 'active' : ''}`} onClick={() => setProtagonistEditValue('165cm')}>165cm</span>
                  <span className={`photo-chip ${protagonistEditValue === '170cm' ? 'active' : ''}`} onClick={() => setProtagonistEditValue('170cm')}>170cm</span>
                  <span className={`photo-chip ${protagonistEditValue === '175cm' ? 'active' : ''}`} onClick={() => setProtagonistEditValue('175cm')}>175cm</span>
                  <span className={`photo-chip ${protagonistEditValue === '180cm' ? 'active' : ''}`} onClick={() => setProtagonistEditValue('180cm')}>180cm</span>
                  <span className={`photo-chip ${protagonistEditValue === '185cm' ? 'active' : ''}`} onClick={() => setProtagonistEditValue('185cm')}>185cm</span>
                </div>
              </div>
            )}

            <div className="photo-options-buttons">
              <button className="menu-option cancel" onClick={() => setShowProtagonistEdit(false)}>取消</button>
              <button className="menu-option confirm" onClick={handleProtagonistEdit}>确认修改</button>
            </div>
          </div>
        </div>
      )}

      {/* 角色编辑面板 */}
      {showCharacterEdit && (
        <div className="character-edit-overlay" onClick={() => setShowCharacterEdit(false)}>
          <div className="character-edit-panel" onClick={(e) => e.stopPropagation()}>
            <div className="character-edit-header">
              <h3>✏️ 角色编辑</h3>
              <button className="close-btn" onClick={() => setShowCharacterEdit(false)}>×</button>
            </div>

            <div className="character-edit-content">
              {/* 角色选择列表 */}
              <div className="character-edit-tabs">
                <h4>选择角色</h4>
                <div className="character-list">
                  {/* 主角 */}
                  <div
                    className={`character-list-item ${editingCharacter?.id === protagonist?.id ? 'active' : ''}`}
                    onClick={() => openCharacterEdit(protagonist)}
                  >
                    <div className="character-avatar-small">
                      {protagonist?.imageUrl ? (
                        <img src={protagonist.imageUrl} alt={protagonist?.name} />
                      ) : (
                        <div className="avatar-placeholder">👤</div>
                      )}
                    </div>
                    <span>{protagonist?.name || '主角'}</span>
                    <span className="character-tag">主角</span>
                  </div>
                  {/* 其他角色 */}
                  {state.characters.filter(c => c.id !== protagonist?.id).map(char => (
                    <div
                      key={char.id}
                      className={`character-list-item ${editingCharacter?.id === char.id ? 'active' : ''}`}
                      onClick={() => openCharacterEdit(char)}
                    >
                      <div className="character-avatar-small">
                        {char.imageUrl ? (
                          <img src={char.imageUrl} alt={char.name} />
                        ) : (
                          <div className="avatar-placeholder">👤</div>
                        )}
                      </div>
                      <span>{char.name}</span>
                      {char.characterStatus?.isCaptured && <span className="character-tag captured">已收服</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* 角色编辑表单 */}
              {editingCharacter && (
                <div className="character-edit-form">
                  <h4>编辑 {editingCharacter.name}</h4>

                  <div className="edit-form-section">
                    <label>基础信息</label>
                    <div className="edit-form-row">
                      <span>姓名：</span>
                      <input
                        type="text"
                        value={characterEditData.name || ''}
                        onChange={(e) => updateCharacterEditData('name', e.target.value)}
                      />
                    </div>
                    <div className="edit-form-row">
                      <span>性别：</span>
                      <input
                        type="text"
                        value={characterEditData.gender || ''}
                        onChange={(e) => updateCharacterEditData('gender', e.target.value)}
                      />
                    </div>
                    <div className="edit-form-row">
                      <span>年龄：</span>
                      <input
                        type="text"
                        value={characterEditData.age || ''}
                        onChange={(e) => updateCharacterEditData('age', e.target.value)}
                      />
                    </div>
                    <div className="edit-form-row">
                      <span>性格：</span>
                      <input
                        type="text"
                        value={characterEditData.personality || ''}
                        onChange={(e) => updateCharacterEditData('personality', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="edit-form-section">
                    <label>外貌特征</label>
                    <div className="edit-form-row">
                      <span>发型：</span>
                      <input
                        type="text"
                        value={characterEditData.hairStyle || ''}
                        onChange={(e) => updateCharacterEditData('hairStyle', e.target.value)}
                        placeholder="如：短发、长发、马尾辫..."
                      />
                    </div>
                    <div className="edit-form-row">
                      <span>发色：</span>
                      <input
                        type="text"
                        value={characterEditData.hairColor || ''}
                        onChange={(e) => updateCharacterEditData('hairColor', e.target.value)}
                        placeholder="如：黑色、棕色、金色..."
                      />
                    </div>
                    <div className="edit-form-row">
                      <span>眼睛：</span>
                      <input
                        type="text"
                        value={characterEditData.eyeColor || ''}
                        onChange={(e) => updateCharacterEditData('eyeColor', e.target.value)}
                        placeholder="如：黑色、蓝色、绿色..."
                      />
                    </div>
                    <div className="edit-form-row">
                      <span>体型：</span>
                      <input
                        type="text"
                        value={characterEditData.bodyType || ''}
                        onChange={(e) => updateCharacterEditData('bodyType', e.target.value)}
                        placeholder="如：高大、矮小、匀称..."
                      />
                    </div>
                    <div className="edit-form-row">
                      <span>身高：</span>
                      <input
                        type="text"
                        value={characterEditData.height || ''}
                        onChange={(e) => updateCharacterEditData('height', e.target.value)}
                        placeholder="如：170cm、180cm、160cm..."
                      />
                    </div>
                    <div className="edit-form-row">
                      <span>穿着：</span>
                      <input
                        type="text"
                        value={characterEditData.clothing || ''}
                        onChange={(e) => updateCharacterEditData('clothing', e.target.value)}
                        placeholder="如：白色衬衫、蓝色连衣裙..."
                      />
                    </div>
                  </div>

                  <div className="edit-form-section">
                    <label>背景</label>
                    <textarea
                      value={characterEditData.background || ''}
                      onChange={(e) => updateCharacterEditData('background', e.target.value)}
                      placeholder="角色背景描述..."
                      rows={3}
                    />
                  </div>

                  <div className="edit-form-buttons">
                    <button
                      className="menu-option cancel"
                      onClick={() => setShowCharacterEdit(false)}
                    >
                      取消
                    </button>
                    <button
                      className="menu-option"
                      onClick={saveCharacterEdit}
                    >
                      保存修改
                    </button>
                    {characterNeedsRegen[editingCharacter.id] && (
                      <button
                        className="menu-option confirm"
                        onClick={() => handleRegenerateCharacterImage(editingCharacter)}
                        disabled={characterRegenerating === editingCharacter.id}
                      >
                        {characterRegenerating === editingCharacter.id ? '生成中...' : '🔄 重新生成角色图'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {!editingCharacter && (
                <div className="character-edit-empty">
                  <p>请从左侧列表选择一个角色进行编辑</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 相册 */}
      {showAlbum && (
        <div className="album-overlay" onClick={() => setShowAlbum(false)}>
          <div className="album-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="album-header">
              <h3>📷 相册 ({photoAlbum.length}张照片)</h3>
              <button className="close-btn" onClick={() => setShowAlbum(false)}>×</button>
            </div>
            <div className="album-content">
              {photoAlbum.length === 0 ? (
                <div className="album-empty">还没有拍过照片</div>
              ) : (
                <div className="album-grid">
                  {photoAlbum.map((photo, index) => (
                    <div
                      key={index}
                      className="album-item"
                      onClick={() => setFullscreenPhoto(photo.url)}
                    >
                      <img src={photo.url} alt={`照片${index + 1}`} />
                      <div className="album-item-info">
                        <span>{photo.gameTime?.year}年{photo.gameTime?.month}月{photo.gameTime?.day}日</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 换衣弹窗 */}
      {showClothingChangeModal && (
        <ClothingChangeModal
          character={clothingChangeCharacter}
          protagonist={protagonist}
          onClose={() => {
            setShowClothingChangeModal(false);
            setClothingChangeCharacter(null);
          }}
          onStartChanging={(charName) => {
            setClothingChangeMessage(`${charName} 正在换装……`);
          }}
          onSuccess={async (newImageUrl) => {
            console.log('[换衣成功] 回调被调用, URL:', newImageUrl);
            console.log('[换衣成功] 当前 clothingChangeCharacter:', clothingChangeCharacter);
            setClothingChangeMessage(''); // 清除提示
            // 更新角色的图片
            console.log('[换衣] 新图片URL:', newImageUrl);
            console.log('[换衣] 角色ID:', clothingChangeCharacter?.id);
            console.log('[换衣] 角色对象:', clothingChangeCharacter);
            if (clothingChangeCharacter && newImageUrl) {
              console.log('[换衣] 正在更新角色图片...');

              // 先构建更新后的角色对象
              const updatedChar = {
                ...clothingChangeCharacter,
                imageUrl: newImageUrl
              };

              // 更新本地状态
              dispatch({
                type: 'UPDATE_CHARACTER',
                payload: {
                  id: clothingChangeCharacter.id,
                  updates: { imageUrl: newImageUrl }
                }
              });

              // 保存到数据库
              await saveCharacterToDatabase(updatedChar, state.world?.id);

              // 从数据库重新获取最新数据
              try {
                const freshChar = await apiClient.characters.getById(clothingChangeCharacter.id);
                if (freshChar) {
                  dispatch({
                    type: 'UPDATE_CHARACTER',
                    payload: {
                      id: freshChar.id,
                      updates: freshChar
                    }
                  });
                  // 同时更新 selectedTalkingCharacters 中的引用
                  setSelectedTalkingCharacters(prev =>
                    prev.map(c => c.id === freshChar.id ? { ...c, ...freshChar } : c)
                  );
                }
              } catch (err) {
                console.warn('Failed to re-fetch character from database:', err);
              }

              console.log('[换衣] dispatch 已调用，更新后的角色应该:', updatedChar);
              setCharacterNeedsRegen(prev => ({ ...prev, [clothingChangeCharacter.id]: true }));
            } else {
              console.log('[换衣] 未执行更新！clothingChangeCharacter:', clothingChangeCharacter, 'newImageUrl:', newImageUrl);
            }
            setShowClothingChangeModal(false);
            setClothingChangeCharacter(null);
          }}
        />
      )}

      {/* 念力弹窗 */}
      {showMindPowerModal && mindPowerTarget && (
        <div className="modal-overlay" onClick={() => !isMindPowerProcessing && setShowMindPowerModal(false)}>
          <div className="mind-power-modal" onClick={e => e.stopPropagation()}>
            <div className="mind-power-header">
              <h3>🔮 念力技能</h3>
              <button
                className="close-btn"
                onClick={() => !isMindPowerProcessing && setShowMindPowerModal(false)}
                disabled={isMindPowerProcessing}
              >
                ×
              </button>
            </div>
            <div className="mind-power-content">
              <div className="mind-power-target">
                <span className="label">目标：</span>
                <span className="value">{mindPowerTarget.name}</span>
              </div>
              <div className="mind-power-instructions">
                <p>输入你想要对目标施加的念力内容，Deepseek会分析并产生相应的效果。</p>
                <p>例如：「让她感到害怕」「让她忘记刚才发生的事」「让她对我产生好感」「用魅惑术影响她」</p>
              </div>
              <textarea
                className="mind-power-input"
                value={mindPowerInput}
                onChange={(e) => setMindPowerInput(e.target.value)}
                placeholder="输入念力内容..."
                disabled={isMindPowerProcessing}
                rows={4}
              />
              <div className="mind-power-hint">
                <span>💡 提示：念力可以影响目标的情绪、表情、性格、状态等属性</span>
              </div>
            </div>
            <div className="mind-power-footer">
              <button
                className="cancel-btn"
                onClick={() => !isMindPowerProcessing && setShowMindPowerModal(false)}
                disabled={isMindPowerProcessing}
              >
                取消
              </button>
              <button
                className="confirm-btn"
                onClick={handleMindPowerSubmit}
                disabled={isMindPowerProcessing || !mindPowerInput.trim()}
              >
                {isMindPowerProcessing ? '处理中...' : '使用念力'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 主游戏区域 - 左侧场景 + 右侧状态栏 */}
      <div className="game-main-area">
        {/* 左侧场景区域 */}
        <div className="game-scene-area">
          {currentScene ? (
            <div className="scene-display">
              <div
                className="scene-background"
                style={{
                  backgroundImage: (getSceneImageByTime(currentScene, state.gameTime) || currentScene.imageUrl)
                    ? `url(${getSceneImageByTime(currentScene, state.gameTime) || currentScene.imageUrl})`
                    : 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)'
                }}
              >
                <div className="scene-info-overlay">
                  <h1 className="scene-name">{currentScene.name}</h1>
                  <p className="scene-description">{currentScene.description}</p>
                </div>
                {sceneCharacters.length > 0 && (
                  <div className="characters-display">
                    {sceneCharacters
                      .filter(char => !char.isProtagonist) // 过滤掉主角
                      .filter((char, index, self) => self.findIndex(c => c.id === char.id) === index) // 去重
                      .map(char => {
                        const hasMemories = state.characterMemories?.[char.id]?.memories?.length > 0;
                        const isSelected = selectedTalkingCharacters.some(c => c.id === char.id);
                        const charStatusChanges = statusChanges[char.id] || [];
                        return (
                          <div
                            key={char.id}
                            className={`character-display ${isSelected ? 'talking selected' : ''} ${!isSelected && selectedTalkingCharacters.length > 0 ? 'dimmed' : ''}`}
                          >
                            {/* 状态变化显示区域 */}
                            <div className="status-changes-container">
                              {charStatusChanges.map((change, index) => (
                                <div
                                  key={change.id}
                                  className={`status-change ${change.type}`}
                                  style={{ animationDelay: `${index * 0.15}s` }}
                                >
                                  {change.label} {change.value > 0 ? '+' : ''}{change.value}
                                </div>
                              ))}
                            </div>
                            {char.imageUrl ? (
                              <img
                                src={char.imageUrl}
                                alt={char.name}
                                className={`character-portrait ${lastDialogue?.speaker === char.name ? 'speaking' : ''}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTalkTo(char);
                                }}
                              />
                            ) : (
                              <div
                                className={`character-portrait ${lastDialogue?.speaker === char.name ? 'speaking' : ''}`}
                                onClick={() => handleTalkTo(char)}
                              />
                            )}
                            <div className="character-name-tag">
                              <span onClick={() => handleTalkTo(char)} style={{cursor: 'pointer'}}>
                                {char.name}
                                {char.characterStatus?.isCaptured && <span className="captured-tag" title="已收服">【已收服】</span>}
                                {respondingCharacters.some(c => c.id === char.id) && <span className="memory-indicator" title="正在回应...">💬</span>}
                                {compressingCharacters.has(char.id) && <span className="memory-indicator" title="正在整理记忆...">⏳</span>}
                                {hasMemories && !compressingCharacters.has(char.id) && !respondingCharacters.some(c => c.id === char.id) && <span className="memory-indicator" title="有过往记忆">💭</span>}
                                {isSelected && <span className="selected-indicator" title="已选中">✓</span>}
                              </span>
                              <div className="character-expression-info">
                                {(() => {
                                  const expr = char.characterStatus?.expression;
                                  const exprObj = (expr && typeof expr === 'object' && !Array.isArray(expr))
                                    ? expr
                                    : (typeof expr === 'string' ? { currentExpression: expr, expressionIntensity: '平静', facialDetails: '' } : null);
                                  if (!exprObj || typeof exprObj.currentExpression !== 'string' || exprObj.currentExpression === '自然') return null;
                                  return (
                                    <span className="expression-badge" title={`表情：${exprObj.currentExpression}`}>
                                      {getExpressionEmoji(exprObj.currentExpression)} {exprObj.currentExpression}
                                    </span>
                                  );
                                })()}
                                {(() => {
                                  const expr = char.characterStatus?.expression;
                                  const exprObj = (expr && typeof expr === 'object' && !Array.isArray(expr))
                                    ? expr
                                    : (typeof expr === 'string' ? { currentExpression: expr, expressionIntensity: '平静', facialDetails: '' } : null);
                                  if (!exprObj || typeof exprObj.expressionIntensity !== 'string' || exprObj.expressionIntensity === '平静') return null;
                                  return (
                                    <span className="intensity-badge" title={`情绪强度：${exprObj.expressionIntensity}`}>
                                      {exprObj.expressionIntensity}
                                    </span>
                                  );
                                })()}
                              </div>
                              {(() => {
                                const expr = char.characterStatus?.expression;
                                const exprObj = (expr && typeof expr === 'object' && !Array.isArray(expr))
                                  ? expr
                                  : (typeof expr === 'string' ? { currentExpression: expr, expressionIntensity: '平静', facialDetails: '' } : null);
                                if (!exprObj || typeof exprObj.facialDetails !== 'string' || !exprObj.facialDetails) return null;
                                return (
                                  <div className="facial-details" title={exprObj.facialDetails}>
                                    {exprObj.facialDetails}
                                  </div>
                                );
                              })()}
                              <button
                                className="status-btn memory-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowCharacterMemory(showCharacterMemory?.id === char.id ? null : char);
                                }}
                                title="查看对话历史和记忆"
                              >
                                📜
                              </button>
                              <button
                                className="status-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowCharacterStatus(showCharacterStatus?.id === char.id ? null : char);
                                }}
                                title="查看角色详情"
                              >
                                📊
                              </button>
                              <button
                                className={`refresh-avatar-btn ${refreshingAvatars.has(char.id) ? 'loading' : ''}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRefreshAvatar(char);
                                }}
                                disabled={refreshingAvatars.has(char.id)}
                                title="刷新头像"
                              >
                                {refreshingAvatars.has(char.id) ? '🔄' : '🎨'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              <div className="dialogue-area">
                {/* 技能发动提示（淡入淡出） */}
                {skillActivationMessage && (
                  <div className="skill-activation-overlay">
                    <div className="skill-activation-text">{skillActivationMessage}</div>
                  </div>
                )}
                {/* 换装提示（持续显示直到图片生成） */}
                {clothingChangeMessage && (
                  <div className="clothing-change-overlay">
                    <div className="clothing-change-text">{clothingChangeMessage}</div>
                  </div>
                )}
                {/* 主角换装提示 */}
                {protagonistClothingChange && (
                  <div className="protagonist-clothing-overlay">
                    <div className="protagonist-clothing-text">{protagonistClothingChange}</div>
                  </div>
                )}
                <div className="dialogue-container">
                  {lastDialogue ? (
                    <>
                      <div className="speaker-name">{lastDialogue.speaker}</div>
                      <div className="dialogue-text">{lastDialogue.text}</div>
                    </>
                  ) : (
                    <div className="dialogue-text">
                      欢迎来到{state.world.name}！你现在在{currentScene?.name}。试着输入你想做的事，或者和场景中的角色交谈。
                    </div>
                  )}

                  <div className="movement-and-actions-area">
                    {connectedScenes.length > 0 && (
                      <div className="movement-area">
                        <div className="movement-label">可前往的地点：</div>
                        <div className="movement-buttons">
                          {connectedScenes.map(scene => (
                            <button
                              key={scene.id}
                              className={`move-btn ${scene.isLazy ? 'lazy-scene' : ''}`}
                              onClick={() => handleMove(scene.id)}
                              disabled={isProcessing && !scene.isLazy}
                              title={scene.isLazy ? '该场景将首次生成，需要加载时间' : ''}
                            >
                              {scene.isLazy && lazyLoadingSceneIdRef.current === scene.id ? '⏳ ' : (scene.isLazy ? '✨ ' : '→ ')}
                              {scene.name}
                              {scene.isLazy && lazyLoadingSceneIdRef.current !== scene.id && ' [待探索]'}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 主角技能快捷动作 */}
                    <div className="quick-actions-area">
                      <div className="quick-actions-label">技能：</div>
                      <div className="quick-action-buttons">
                        {/* 念力技能 - 始终显示 */}
                        <button
                          className="quick-action-btn skill mind-power"
                          onClick={handleOpenMindPower}
                          disabled={isProcessing || isMultiCharacterResponding || waitingForConfirm || selectedTalkingCharacters.length === 0}
                          title="对目标使用念力，用意念影响对方"
                        >
                          🔮 念力
                        </button>
                        {/* 其他自定义技能 */}
                        {protagonist?.skills?.filter(s => s.name).map((skill, index) => (
                          <button
                            key={index}
                            className="quick-action-btn skill"
                            onClick={() => handleUseSkill(skill)}
                            disabled={isProcessing || isMultiCharacterResponding || waitingForConfirm}
                            onMouseEnter={(e) => {
                              setHoveredSkill(skill);
                              setSkillTooltipPos({ x: e.clientX, y: e.clientY });
                            }}
                            onMouseLeave={() => setHoveredSkill(null)}
                          >
                            ⚔️ {skill.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 完成对话按钮 - 提取记忆 */}
                    {selectedTalkingCharacters.length > 0 && (
                      <div className="quick-actions-area">
                        <div className="quick-actions-label">会话：</div>
                        <div className="quick-action-buttons">
                          <button
                            className="quick-action-btn complete-session"
                            onClick={async () => {
                              for (const char of selectedTalkingCharacters) {
                                await compressAndSaveMemories(char);
                              }
                              dispatch({
                                type: 'ADD_DIALOGUE',
                                payload: { speaker: '系统', text: '已将会话内容整理为记忆保存' }
                              });
                            }}
                            disabled={isProcessing || isMultiCharacterResponding || compressingCharacters.size > 0}
                            title="完成当前对话，将对话内容整理为角色记忆"
                          >
                            💾 完成对话
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 角色交互快捷动作 */}
                    {selectedTalkingCharacters.length > 0 && (() => {
                      const char = selectedTalkingCharacters[0];
                      const isCaptured = char.characterStatus?.isCaptured;
                      return (
                        <div className="quick-actions-area">
                          <div className="quick-actions-label">动作：</div>
                          <div className="quick-action-buttons">
                            {isCaptured ? (
                              // 已收服的角色的快捷动作
                              <>
                                <button
                                  className="quick-action-btn title"
                                  onClick={() => setFreeInputAction('[改称呼] ')}
                                  disabled={isProcessing || isMultiCharacterResponding || waitingForConfirm}
                                  title="设定角色对你的称呼"
                                >
                                  📛 改称呼
                                </button>
                                <button
                                  className="quick-action-btn selfref"
                                  onClick={() => setFreeInputAction('[改自称] ')}
                                  disabled={isProcessing || isMultiCharacterResponding || waitingForConfirm}
                                  title="设定角色的自称"
                                >
                                  🗣️ 改自称
                                </button>
                                <button
                                  className="quick-action-btn appearance"
                                  onClick={() => setFreeInputAction('[改穿着] ')}
                                  disabled={isProcessing || isMultiCharacterResponding || waitingForConfirm}
                                  title="修改角色的穿着外貌"
                                >
                                  👔 改穿着
                                </button>
                                <button
                                  className="quick-action-btn clothing-change"
                                  onClick={() => {
                                    setClothingChangeCharacter(char);
                                    setShowClothingChangeModal(true);
                                  }}
                                  disabled={isProcessing || isMultiCharacterResponding || waitingForConfirm}
                                  title="上传衣服图片为角色换装"
                                >
                                  👗 换衣
                                </button>
                              </>
                            ) : (
                              // 未收服的角色
                              <>
                                {isAdmin && (
                                  <button
                                    className="quick-action-btn capture"
                                    onClick={() => setFreeInputAction('[收服] ' + char.name)}
                                    disabled={isProcessing || isMultiCharacterResponding || waitingForConfirm}
                                    title="尝试收服角色（仅管理员）"
                                  >
                                    🔗 收服
                                  </button>
                                )}
                                {isAdmin && (
                                  <button
                                    className="quick-action-btn suppress"
                                    onClick={() => setFreeInputAction('[压制] ' + char.name)}
                                    disabled={isProcessing || isMultiCharacterResponding || waitingForConfirm}
                                    title="压制角色（仅管理员）"
                                  >
                                    💪 压制
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="free-input-area">
                    <div className="free-input-form combined">
                      <div className="free-input-fields">
                        <input
                          type="text"
                          className="free-input free-input-action"
                          value={freeInputAction}
                          onChange={(e) => setFreeInputAction(e.target.value)}
                          placeholder="输入动作（可选）..."
                          onKeyDown={(e) => e.key === 'Enter' && handleFreeInput()}
                          disabled={isProcessing || isMultiCharacterResponding || waitingForConfirm}
                        />
                        <input
                          type="text"
                          className="free-input free-input-dialogue"
                          value={freeInputDialogue}
                          onChange={(e) => setFreeInputDialogue(e.target.value)}
                          placeholder="输入对话（可选）..."
                          onKeyDown={(e) => e.key === 'Enter' && handleFreeInput()}
                          disabled={isProcessing || isMultiCharacterResponding || waitingForConfirm}
                        />
                      </div>
                      <button
                        className="free-input-btn"
                        onClick={handleFreeInput}
                        disabled={isProcessing || isMultiCharacterResponding || waitingForConfirm || (!freeInputAction.trim() && !freeInputDialogue.trim())}
                      >
                        {isProcessing || isMultiCharacterResponding || waitingForConfirm ? '...' : '发送'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* 右侧状态栏区域 */}
        <div className="game-sidebar">
          <ProtagonistInfo
            protagonist={protagonist}
            onEdit={(field, value) => {
              setProtagonistEditField(field);
              setProtagonistEditValue(value);
              setShowProtagonistEdit(true);
            }}
            onRegenerate={handleRegenerateProtagonistImage}
            needsRegen={protagonistNeedsRegen}
          />
          <PlayerStatusBar />

          {/* 技能效果显示区域 - 移除，改用固定定位悬浮提示 */}
        </div>
      </div>

      {showMap && (
        <WorldMapModal
          scenes={state.scenes}
          characters={state.characters}
          currentSceneId={state.currentSceneId}
          onClose={() => setShowMap(false)}
          onSceneClick={(scene) => {
            handleMove(scene.id);
            setShowMap(false);
          }}
        />
      )}

      {showNarratorMemory && (
        <NarratorMemoryPanel
          memories={state.narratorMemories || []}
          scenes={state.scenes || []}
          onClose={() => setShowNarratorMemory(false)}
        />
      )}

      <div className={`history-panel ${showHistory ? 'open' : ''}`}>
        <div className="history-header">
          <h3>对话历史</h3>
          <button className="close-btn" onClick={() => setShowHistory(false)}>×</button>
        </div>
        <div className="history-content">
          {state.dialogueHistory.slice(-50).map((entry, i) => (
            <div key={i} className="history-entry">
              <div className="history-speaker">{entry.speaker}</div>
              <div className="history-text">{entry.text}</div>
            </div>
          ))}
          <div ref={historyEndRef} />
        </div>
      </div>

      <ImageModal
        imageUrl={modalImage?.url}
        alt={modalImage?.alt}
        onClose={() => setModalImage(null)}
      />

      {showTimeTravel && (
        <TimeTravelPanel
          onClose={() => setShowTimeTravel(false)}
          onLoadState={handleLoadState}
          currentGameState={state}
        />
      )}

      {showWorldSwitcher && (
        <WorldSwitcher
          onClose={() => setShowWorldSwitcher(false)}
          onLoadWorld={handleLoadState}
          currentGameState={state}
        />
      )}

      {/* 角色详细状态栏 */}
      {showCharacterStatus && (
        <CharacterStatusPanel
          character={showCharacterStatus}
          onClose={() => setShowCharacterStatus(null)}
        />
      )}

      {/* 角色记忆和对话历史面板 */}
      {showCharacterMemory && (
        <div className="memory-panel">
          <div className="memory-header">
            <h3>📜 {showCharacterMemory.name} - 对话历史与记忆</h3>
            <button className="close-btn" onClick={() => setShowCharacterMemory(null)}>×</button>
          </div>
          <div className="memory-content">
            {/* 本次对话（未压缩） */}
            <div className="memory-section">
              <h4>💬 本次对话</h4>
              {state.characterCurrentDialogues?.[showCharacterMemory.id]?.length > 0 ? (
                <div className="dialogue-history-list">
                  {state.characterCurrentDialogues[showCharacterMemory.id].map((entry, i) => (
                    <div key={i} className={`dialogue-history-item ${
                      entry.speaker === showCharacterMemory.name ? 'char-dialogue' :
                      entry.speaker === protagonist?.name || entry.speaker === '你' ? 'protagonist-dialogue' :
                      'system-dialogue'
                    }`}>
                      <div className="dialogue-history-speaker">{entry.speaker}</div>
                      <div className="dialogue-history-text">{entry.text}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-memory">暂无本次对话记录</p>
              )}
            </div>

            {/* 历史记忆重点 */}
            <div className="memory-section">
              <h4>💡 历史记忆重点</h4>
              {state.characterMemories?.[showCharacterMemory.id]?.memories?.length > 0 ? (
                <div className="memory-list">
                  {[...state.characterMemories[showCharacterMemory.id].memories]
                    .sort((a, b) => b.importance - a.importance)
                    .map((memory, i) => (
                      <div key={i} className="memory-item">
                        <div className="memory-importance">
                          <span className="importance-badge" style={{
                            background: memory.importance >= 8 ? 'rgba(231, 76, 60, 0.3)' :
                                       memory.importance >= 5 ? 'rgba(243, 156, 18, 0.3)' :
                                       'rgba(52, 152, 219, 0.3)',
                            border: memory.importance >= 8 ? '1px solid #e74c3c' :
                                    memory.importance >= 5 ? '1px solid #f39c12' :
                                    '1px solid #3498db',
                            color: memory.importance >= 8 ? '#e74c3c' :
                                   memory.importance >= 5 ? '#f39c12' :
                                   '#3498db'
                          }}>
                            重要度: {memory.importance}/10
                          </span>
                        </div>
                        <div className="memory-text">{typeof memory.content === 'string' ? memory.content : JSON.stringify(memory.content)}</div>
                        {memory.timestamp && (
                          <div className="memory-time">
                            {new Date(memory.timestamp).toLocaleString('zh-CN')}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              ) : (
                <p className="no-memory">暂无历史记忆</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 游玩说明弹窗 */}
      {showHelp && (
        <div className="help-panel">
          <div className="help-header">
            <h3>📖 游玩说明</h3>
            <button className="close-btn" onClick={() => setShowHelp(false)}>×</button>
          </div>
          <div className="help-content">
            <div className="help-section">
              <h4>🎯 基本操作</h4>
              <ul>
                <li><strong>选择角色</strong>：点击角色头像选中要对话的角色（可多选）</li>
                <li><strong>选择行动</strong>：点击选项按钮执行行动或对话</li>
                <li><strong>自由输入</strong>：在输入框中输入自定义的动作或对话</li>
                <li><strong>切换场景</strong>：点击"可前往的地点"中的按钮移动到其他场景</li>
                <li><strong>时间跳转</strong>：点击右上角时间显示可跳转到未来几天</li>
              </ul>
            </div>

            <div className="help-section">
              <h4>📜 旁白系统</h4>
              <ul>
                <li>所有"系统"消息已统一为"旁白"</li>
                <li>未选择角色时，由旁白回应你的行动</li>
                <li>旁白会判断影响级别：<span className="tag-impact">无人知晓</span>、<span className="tag-scene">当前场景</span>、<span className="tag-world">世界知晓</span></li>
                <li>点击右上角"📜 旁白记忆"查看所有旁白记录</li>
              </ul>
            </div>

            <div className="help-section">
              <h4>💭 选项生成规则</h4>
              <ul>
                <li>未选择角色时，选项不会包含任何角色名字</li>
                <li>切换场景后会自动重新生成选项</li>
                <li>点击"🔄 刷新"按钮可以手动刷新当前选项</li>
              </ul>
            </div>

            <div className="help-section">
              <h4>⚔️ 技能系统</h4>
              <ul>
                <li>点击技能按钮或直接输入【技能名】使用技能</li>
                <li>技能效果会解析并应用到目标角色身上</li>
                <li>可影响：好感度、信赖度、服从度、精神压力、自我意识等属性</li>
                <li>部分技能可能触发收服效果</li>
              </ul>
            </div>

            <div className="help-section">
              <h4>💪 压制系统</h4>
              <ul>
                <li>通过【动作】发起战斗/攻击/压制（如：<code>【动作】压制小红</code>）</li>
                <li><strong>压制成功率</strong>：
                  <ul>
                    <li>精力 &lt; 10 → 100%</li>
                    <li>精力 &lt; 20 → 90%</li>
                    <li>精力 &lt; 30 → 80%</li>
                    <li>精力 30-60 → 40%</li>
                    <li>精力 &gt; 60 → 20%</li>
                  </ul>
                </li>
                <li><strong>压制成功效果</strong>：
                  <ul>
                    <li>服从度大幅上升（+20~35）</li>
                    <li>自我意识下降（-15~30）</li>
                    <li>好感度下降（-20~35）</li>
                    <li>信赖度下降（-20~35）</li>
                    <li>精力下降（-10~20）</li>
                    <li>产生创伤记忆（需要治愈才能消除）</li>
                  </ul>
                </li>
                <li><strong>压制失败</strong>：触发场景影响事件，旁白会加以说明</li>
              </ul>
            </div>

            <div className="help-section">
              <h4>🎭 收服与跟随</h4>
              <ul>
                <li>角色<span className="tag-warning">自我意识 &lt; 20</span>时会陷入迷茫，是收服的大好时机</li>
                <li><span className="tag-success">自我意识 &lt; 10 且 服从度 ≥ 70</span>：角色会无条件跟随你到任何场景</li>
                <li><span className="tag-warning">自我意识 &lt; 20 且 服从度 &gt; 70</span>：角色会主动表达想被收服的意愿</li>
              </ul>
            </div>

            <div className="help-section">
              <h4>🔗 收服系统</h4>
              <ul>
                <li><strong>收服方式</strong>：通过【动作】+ 收服相关语言尝试收服角色</li>
                <li>示例：<code>【动作】收服小红</code> 或 <code>【动作】做我的人吧</code></li>
                <li><strong>收服成功率</strong>：
                  <ul>
                    <li>自我意识 &lt; 30，服从度 &gt; 70 → 99%</li>
                    <li>自我意识 &lt; 30，服从度 &gt; 60 → 95%</li>
                    <li>自我意识 &lt; 30，服从度 &gt; 50 → 90%</li>
                    <li>自我意识 &lt; 30 → 85%</li>
                    <li>自我意识 30-39，服从度 &gt; 70 → 90%</li>
                    <li>自我意识 30-39，服从度 &gt; 50 → 70%</li>
                    <li>自我意识 ≥ 50，服从度 &gt; 70 → 70%</li>
                    <li>自我意识 ≥ 50，服从度 &lt; 40 → 5%</li>
                  </ul>
                </li>
                <li><strong>收服成功</strong>：角色被你收服，好感度、信赖度、服从度大幅提升，自我意识降至最低</li>
                <li><strong>收服失败</strong>：角色服从度降低（-15~35），需要换个时机</li>
              </ul>
            </div>

            <div className="help-section">
              <h4>🏷️ 设定称呼</h4>
              <ul>
                <li>收服角色后，可以通过【动作】设定角色对你的称呼</li>
                <li>示例：<code>【动作】以后叫我主人</code></li>
                <li>示例：<code>【动作】叫我哥哥吧</code></li>
                <li>称呼会保存在角色记忆的最高优先级（重要度10），永远不会被改变</li>
              </ul>
            </div>

            <div className="help-section">
              <h4>👗 角色外貌改变</h4>
              <ul>
                <li><span className="tag-special">已收服角色</span>可以通过【动作】改变穿着、发型等</li>
                <li>示例：<code>【动作】给小红换一件蓝色的裙子</code></li>
                <li>示例：<code>【动作】让小明把头发剪成短发</code></li>
                <li>改变后角色头像也会自动更新（需要配置图片API）</li>
                <li>换装时其他角色能看到角色外貌的变化</li>
              </ul>
            </div>

            <div className="help-section">
              <h4>📊 角色状态说明</h4>
              <ul>
                <li><strong>自我意识</strong>：角色的独立思考能力，越低越容易受影响
                  <ul>
                    <li>90-100：极度有主见，绝不妥协</li>
                    <li>70-89：高，有主见，不轻易妥协</li>
                    <li>30-69：中等，有一定主见</li>
                    <li>10-29：低，容易随波逐流</li>
                    <li>0-9：极度迷茫，可能无条件服从</li>
                  </ul>
                </li>
                <li><strong>服从度</strong>：角色对你的服从程度，越高越听话
                  <ul>
                    <li>80-100：完全服从，会执行你的命令</li>
                    <li>60-79：积极配合</li>
                    <li>40-59：基本配合</li>
                    <li>20-39：轻度不配合</li>
                    <li>0-19：抗拒，不配合</li>
                  </ul>
                </li>
                <li><strong>精力</strong>：影响压制成功率，越低越容易被压制
                  <ul>
                    <li>80-100：精力充沛，不易被压制</li>
                    <li>60-79：精力较好</li>
                    <li>40-59：有些疲惫</li>
                    <li>20-39：疲惫，压制成功率较高</li>
                    <li>0-19：精疲力尽，几乎必定被压制</li>
                  </ul>
                </li>
                <li><strong>健康度</strong>：角色的身体健康状态
                  <ul>
                    <li>80-100：健康状态良好</li>
                    <li>60-79：身体良好</li>
                    <li>40-59：身体一般</li>
                    <li>20-39：身体不适</li>
                    <li>0-19：极度虚弱</li>
                  </ul>
                </li>
                <li><strong>精神压力</strong>：角色的心理压力水平
                  <ul>
                    <li>80-100：压力极大，可能崩溃</li>
                    <li>60-79：压力较大</li>
                    <li>40-59：压力中等</li>
                    <li>20-39：压力较小</li>
                    <li>0-19：轻松自在</li>
                  </ul>
                </li>
                <li><strong>好感度</strong>：角色对你的情感亲近程度
                  <ul>
                    <li>80-100：完全信赖，深爱</li>
                    <li>60-79：有好感</li>
                    <li>40-59：在意你</li>
                    <li>20-39：注意到你</li>
                    <li>0-19：冷漠</li>
                  </ul>
                </li>
                <li><strong>信赖度</strong>：角色对你的信任程度
                  <ul>
                    <li>80-100：完全信赖</li>
                    <li>60-79：信任</li>
                    <li>40-59：基本信任</li>
                    <li>20-39：谨慎</li>
                    <li>0-19：不信任</li>
                  </ul>
                </li>
                <li>点击角色卡片上的"📊"查看详细状态</li>
              </ul>
            </div>

            <div className="help-section">
              <h4>🎭 性格与心理指标</h4>
              <ul>
                <li><strong>外向性</strong>：影响角色是否主动说话
                  <ul>
                    <li>≥70：非常健谈，主动社交，喜欢成为焦点</li>
                    <li>55-69：比较开朗，愿意交流</li>
                    <li>45-54：表现正常</li>
                    <li>30-44：安静内敛，只在有话题时参与</li>
                    <li>&lt;30：极度沉默，很少主动说话</li>
                  </ul>
                </li>
                <li><strong>理性</strong>：影响角色决策方式
                  <ul>
                    <li>≥70：极度理性，深思熟虑，极少被情绪左右</li>
                    <li>55-69：比较理性，会考虑情感因素</li>
                    <li>45-54：平衡理性和情感</li>
                    <li>30-44：比较感性，容易被情绪影响</li>
                    <li>&lt;30：极度感性，冲动行事</li>
                  </ul>
                </li>
                <li><strong>守序性</strong>：影响角色对规则的态度
                  <ul>
                    <li>≥70：极度守序，做事有条理，严格遵守承诺</li>
                    <li>55-69：比较遵守规则</li>
                    <li>45-54：有原则也有灵活性</li>
                    <li>30-44：不喜欢被束缚</li>
                    <li>&lt;30：极度混乱，随心所欲</li>
                  </ul>
                </li>
                <li><strong>乐观性</strong>：影响角色对事物的态度
                  <ul>
                    <li>≥70：极度乐观，总能看到希望</li>
                    <li>55-69：比较乐观</li>
                    <li>45-54：态度平衡</li>
                    <li>30-44：比较悲观，容易担忧</li>
                    <li>&lt;30：极度悲观，不相信好事</li>
                  </ul>
                </li>
              </ul>
            </div>

            <div className="help-section">
              <h4>💡 游玩小贴士</h4>
              <ul>
                <li><strong>如何降低自我意识</strong>：
                  <ul>
                    <li>通过压制动作成功压制角色</li>
                    <li>使用降低自我意识的技能</li>
                    <li>让角色经历多次失败或挫折</li>
                    <li>持续做出让角色信服的决策</li>
                  </ul>
                </li>
                <li><strong>如何提高服从度</strong>：
                  <ul>
                    <li>成功压制角色后服从度会大幅上升</li>
                    <li>通过对话和选项获得角色好感</li>
                    <li>在角色困难时伸出援手</li>
                    <li>使用提升服从度的技能</li>
                  </ul>
                </li>
                <li><strong>服从度与好感度的关系</strong>：
                  <ul>
                    <li>好感度是情感上的亲近，服从度是行为上的顺从</li>
                    <li>好感度高的角色更容易接受你的建议</li>
                    <li>服从度高的角色会直接执行你的命令</li>
                    <li>两者可以独立变化，也可以相互影响</li>
                  </ul>
                </li>
                <li><strong>如何削弱角色精力</strong>：
                  <ul>
                    <li>通过连续的压制动作消耗角色精力</li>
                    <li>让角色进行长时间的活动或跋涉</li>
                    <li>在对话中让角色反复思考或纠结</li>
                    <li>注意：精力越低，压制成功率越高！</li>
                  </ul>
                </li>
                <li><strong>多角色对话</strong>：
                  <ul>
                    <li>选中多个角色时，每个角色有独立的对话上下文</li>
                    <li>发言的角色能"看到"其他角色的外貌和穿着</li>
                    <li>角色会根据其他角色的状态调整自己的反应</li>
                  </ul>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* 技能提示悬浮框 - 固定定位，不受布局影响 */}
      {hoveredSkill && (
        <div
          className="skill-tooltip-fixed"
          style={{
            position: 'fixed',
            left: Math.min(skillTooltipPos.x + 15, window.innerWidth - 280),
            top: Math.min(skillTooltipPos.y + 15, window.innerHeight - 120),
            background: '#1a1a2e',
            border: '2px solid #f6ad55',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            zIndex: 9999,
            maxWidth: '260px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)'
          }}
        >
          <h4 style={{ margin: 0, color: '#f6ad55', fontSize: '0.95rem' }}>
            ⚔️ {hoveredSkill.name}
          </h4>
          <p style={{ margin: '0.5rem 0 0 0', color: '#e2e8f0', fontSize: '0.85rem', lineHeight: 1.4 }}>
            {hoveredSkill.description || '暂无描述'}
          </p>
        </div>
      )}
    </div>
  );
};

export default SceneView;
