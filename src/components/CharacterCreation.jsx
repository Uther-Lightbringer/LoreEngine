import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameState } from '../store/gameState.jsx';
import { generateWithAI, MAX_TOKENS } from '../services/aiService.js';
import { generateImage } from '../services/imageService.js';
import { batchGenerateCharacters, expandCharacter } from '../services/apiService.js';
import { defaultCharacter } from '../data/templates.js';
import ImageModal from './ImageModal.jsx';
import './CharacterCreation.css';
import './WorldCreation.css';

const CharacterCreation = ({ onOpenApiSettings }) => {
  const navigate = useNavigate();
  const { state, dispatch } = useGameState();
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [editingCharacter, setEditingCharacter] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [bulkAiPrompt, setBulkAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [expandingCharacterId, setExpandingCharacterId] = useState(null);

  const [imagePrompt, setImagePrompt] = useState('');
  const [imageSize, setImageSize] = useState('2:3');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  const [numCharacters, setNumCharacters] = useState(3);
  const [isGeneratingBulk, setIsGeneratingBulk] = useState(false);
  const [autoGenerateImages, setAutoGenerateImages] = useState(true);
  const [imageGenerateProgress, setImageGenerateProgress] = useState(0);
  const [modalImage, setModalImage] = useState(null);
  // 异步图片生成状态：{ characterId: { status: 'generating'|'done', imageUrl: string|null } }
  const [asyncImageGen, setAsyncImageGen] = useState({});

  const startAdd = () => {
    setEditingCharacter({ ...defaultCharacter, id: `char_${Date.now()}` });
    setIsAdding(true);
    setSelectedCharacter(null);
  };

  const startEdit = (character) => {
    setEditingCharacter({ ...character });
    setIsAdding(false);
  };

  const cancelEdit = () => {
    setEditingCharacter(null);
    setIsAdding(false);
    setError('');
  };

  const saveCharacter = () => {
    if (!editingCharacter.name.trim()) {
      setError('请输入角色姓名');
      return;
    }

    if (isAdding) {
      dispatch({ type: 'ADD_CHARACTER', payload: editingCharacter });
    } else {
      dispatch({ type: 'UPDATE_CHARACTER', payload: editingCharacter });
    }

    setEditingCharacter(null);
    setIsAdding(false);
    setError('');
  };

  const deleteCharacter = (id) => {
    if (confirm('确定要删除这个角色吗？')) {
      dispatch({ type: 'DELETE_CHARACTER', payload: id });
      if (selectedCharacter?.id === id) {
        setSelectedCharacter(null);
      }
    }
  };

  // 尝试从整体外观描述中提取详细属性
  const extractFromAppearance = (appearance, fieldType) => {
    if (!appearance) return '';
    const lower = appearance.toLowerCase();

    // 发色提取
    if (fieldType === 'hairColor') {
      const colors = ['黑色', '金色', '银色', '棕色', '红色', '蓝色', '绿色', '紫色', '白色', '灰色',
                      'black', 'blonde', 'gold', 'silver', 'brown', 'red', 'blue', 'green', 'purple', 'white', 'gray'];
      for (const color of colors) {
        if (lower.includes(color)) return color;
      }
    }

    // 发型提取
    if (fieldType === 'hairStyle') {
      const styles = ['长发', '短发', '卷发', '直发', '马尾', '辫子', '波浪',
                      'long hair', 'short hair', 'curly', 'straight', 'ponytail', 'braid', 'wavy'];
      for (const style of styles) {
        if (lower.includes(style)) return style;
      }
    }

    // 瞳色提取
    if (fieldType === 'eyeColor') {
      const colors = ['蓝色', '琥珀色', '紫色', '绿色', '棕色', '黑色', '灰色', '红色',
                      'blue', 'amber', 'purple', 'green', 'brown', 'black', 'gray', 'red'];
      for (const color of colors) {
        if (lower.includes(color)) return color;
      }
    }

    // 体型提取
    if (fieldType === 'bodyType') {
      const types = ['高挑', '娇小', '匀称', '强壮', '苗条', '丰满',
                     'tall', 'petite', 'slim', 'strong', 'slender', 'curvy'];
      for (const type of types) {
        if (lower.includes(type)) return type;
      }
    }

    // 服装提取
    if (fieldType === 'clothing') {
      // 简单返回整个appearance的一部分作为服装参考
      if (appearance.length > 50) {
        return appearance.substring(0, 100);
      }
    }

    return '';
  };

  // 智能解析角色数据，支持多种JSON格式
  const parseCharacterData = (result, baseCharacter) => {
    console.log('Raw AI result:', result);

    // 递归搜索嵌套对象
    const searchNested = (obj, keys) => {
      if (!obj || typeof obj !== 'object') return null;
      for (const key of keys) {
        if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
          return obj[key];
        }
      }
      return null;
    };

    // 获取所有可能的嵌套容器
    const getContainers = () => {
      const containers = [result];
      const nestedNames = ['characterStatus', 'data', 'info', 'details', 'attributes', 'props', 'character', 'role'];
      for (const name of nestedNames) {
        if (result[name] && typeof result[name] === 'object') {
          containers.push(result[name]);
        }
      }
      return containers;
    };

    // 从结果中提取数据，支持嵌套结构
    const getValue = (keys) => {
      // 先直接从根对象查找
      const directValue = searchNested(result, keys);
      if (directValue) return directValue;

      // 从所有容器中查找
      for (const container of getContainers()) {
        const value = searchNested(container, keys);
        if (value) return value;
      }
      return '';
    };

    // 获取嵌套对象
    const getNestedObject = (keys) => {
      // 先直接从根对象查找
      for (const key of keys) {
        if (result[key] && typeof result[key] === 'object') {
          return result[key];
        }
      }
      // 从所有容器中查找
      for (const container of getContainers()) {
        for (const key of keys) {
          if (container[key] && typeof container[key] === 'object') {
            return container[key];
          }
        }
      }
      return null;
    };

    // 获取 physicalAppearance 相关字段
    const getPhysicalValue = (keys, physicalKeys) => {
      // 从所有容器中查找 physicalAppearance 对象
      for (const container of getContainers()) {
        if (container.physicalAppearance && typeof container.physicalAppearance === 'object') {
          for (const key of physicalKeys) {
            if (container.physicalAppearance[key] !== undefined && container.physicalAppearance[key] !== null && container.physicalAppearance[key] !== '') {
              return container.physicalAppearance[key];
            }
          }
        }
        // 也检查 appearanceDetails
        if (container.appearanceDetails && typeof container.appearanceDetails === 'object') {
          for (const key of physicalKeys) {
            if (container.appearanceDetails[key] !== undefined && container.appearanceDetails[key] !== null && container.appearanceDetails[key] !== '') {
              return container.appearanceDetails[key];
            }
          }
        }
      }
      // 直接从根对象查找
      return getValue(keys);
    };

    // 获取表达式相关字段（增强版，支持更多嵌套位置）
    const getExpressionValue = (keys) => {
      // 直接从根对象查找
      const directValue = searchNested(result, keys);
      if (directValue) return directValue;

      // 从所有容器中查找 expression 对象
      for (const container of getContainers()) {
        // 检查 expression
        if (container.expression && typeof container.expression === 'object') {
          for (const key of keys) {
            if (container.expression[key] !== undefined && container.expression[key] !== null && container.expression[key] !== '') {
              return container.expression[key];
            }
          }
          // 如果 expression 是字符串
          if (typeof container.expression === 'string' && container.expression) {
            return container.expression;
          }
        }
        // 检查 mood
        if (container.mood && typeof container.mood === 'string') {
          for (const key of keys) {
            if (key === 'currentExpression' || key === 'expression') {
              return container.mood;
            }
          }
        }
      }
      return '';
    };

    // 获取所有基础字段
    let name = getValue(['name', 'characterName', '角色名', '姓名', 'character_name']);
    let age = getValue(['age', '年龄']);
    let gender = getValue(['gender', 'sex', '性别']);
    let personality = getValue(['personality', 'personalityTraits', '性格', '性格特点', 'traits', 'character']);
    let appearance = getValue(['appearance', 'look', '外貌', '外表', '描述', 'description', 'looks']);

    // 如果某些字段没有，尝试从其他地方获取
    if (!personality && result.description) {
      // 尝试从 description 中获取
      personality = result.description;
    }

    // 如果连 appearance 都没有，把所有能找到的描述性文字拼起来
    if (!appearance) {
      const parts = [];
      if (result.describe) parts.push(result.describe);
      if (result.info) parts.push(typeof result.info === 'string' ? result.info : JSON.stringify(result.info));
      if (result.about) parts.push(result.about);
      appearance = parts.join(' ');
    }

    // 获取 physicalAppearance 的字段
    let hairStyle = getPhysicalValue(['hairStyle', '发型', 'hairstyle', 'hair'], ['hairStyle', 'hairstyle', 'hair']);
    let hairColor = getPhysicalValue(['hairColor', '发色', 'hairColor', 'hair_color'], ['hairColor', 'hairColor', 'hairColor']);
    let eyeColor = getPhysicalValue(['eyeColor', '瞳色', 'eyeColor', 'eye_color', 'eyes'], ['eyeColor', 'eyeColor', 'eyes']);
    let bodyType = getPhysicalValue(['bodyType', '体型', 'build', 'body'], ['bodyType', 'build', 'body']);
    let height = getPhysicalValue(['height', '身高'], ['height']);
    let clothing = getPhysicalValue(['clothing', '穿着', 'outfit', 'clothes', 'wear'], ['clothing', 'outfit', 'clothes']);

    // 如果 detailed 字段缺失，尝试从整体 appearance 中提取
    if (appearance && !hairStyle) hairStyle = extractFromAppearance(appearance, 'hairStyle');
    if (appearance && !hairColor) hairColor = extractFromAppearance(appearance, 'hairColor');
    if (appearance && !eyeColor) eyeColor = extractFromAppearance(appearance, 'eyeColor');
    if (appearance && !bodyType) bodyType = extractFromAppearance(appearance, 'bodyType');
    if (appearance && !clothing) clothing = extractFromAppearance(appearance, 'clothing');

    // 获取 expression 字段
    let currentExpression = getExpressionValue(['currentExpression', '表情', 'expression', 'mood']);
    let expressionIntensity = getExpressionValue(['expressionIntensity', '情绪强度', 'intensity']);
    let facialDetails = getExpressionValue(['facialDetails', '面部细节', 'details']);

    // 获取性格指标
    let personalityTraits = getNestedObject(['personalityTraits', 'personality_traits', '性格指标']);
    let selfAwareness = getValue(['selfAwareness', 'self_awareness', '自我意识']);

    // 设置默认值
    if (!currentExpression) currentExpression = '自然';
    if (!expressionIntensity) expressionIntensity = '平静';
    if (!facialDetails) facialDetails = '';

    // 确保性格指标有默认值
    const defaultTraits = baseCharacter.characterStatus?.personalityTraits || { extroversion: 50, rationality: 50, orderliness: 50, optimism: 50 };
    personalityTraits = personalityTraits ? { ...defaultTraits, ...personalityTraits } : defaultTraits;

    // 确保自我意识在合理范围内
    if (typeof selfAwareness !== 'number') {
      selfAwareness = baseCharacter.characterStatus?.selfAwareness || 50;
    }
    selfAwareness = Math.max(0, Math.min(100, selfAwareness));

    console.log('Final parsed values:', { name, age, gender, personality, appearance, hairStyle, hairColor, eyeColor, bodyType, clothing, personalityTraits, selfAwareness });

    return {
      name: name || '',
      age: age || '',
      gender: gender || '',
      personality: personality || '',
      appearance: appearance || '',
      characterStatus: {
        ...baseCharacter.characterStatus,
        personalityTraits: personalityTraits,
        selfAwareness: selfAwareness,
        physicalAppearance: {
          hairStyle: hairStyle || baseCharacter.characterStatus?.physicalAppearance?.hairStyle || '',
          hairColor: hairColor || baseCharacter.characterStatus?.physicalAppearance?.hairColor || '',
          eyeColor: eyeColor || baseCharacter.characterStatus?.physicalAppearance?.eyeColor || '',
          bodyType: bodyType || baseCharacter.characterStatus?.physicalAppearance?.bodyType || '',
          height: height || baseCharacter.characterStatus?.physicalAppearance?.height || '',
          clothing: clothing || baseCharacter.characterStatus?.physicalAppearance?.clothing || ''
        },
        expression: {
          currentExpression: currentExpression,
          expressionIntensity: expressionIntensity,
          facialDetails: facialDetails
        }
      }
    };
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError('');

    try {
      // 如果用户输入了自定义提示词，使用用户的；否则使用默认模板
      const prompt = aiPrompt.trim() ? aiPrompt : buildSingleCharacterPrompt();
      const result = await generateWithAI(prompt, 'deepseek', { maxTokens: MAX_TOKENS.CONTENT, jsonResponse: true });

      console.log('AI returned:', result);

      if (result && typeof result === 'object') {
        const newCharacterData = parseCharacterData(result, editingCharacter);

        console.log('Parsed character data:', newCharacterData);

        setEditingCharacter(prev => ({
          ...prev,
          ...newCharacterData,
          characterStatus: {
            ...prev.characterStatus,
            ...newCharacterData.characterStatus
          }
        }));

        // 如果启用了自动生成图片，异步生成头像（不阻塞）
        if (autoGenerateImages) {
          const charId = newCharacterData.id;
          // 立即标记为生成中，不阻塞 UI
          setAsyncImageGen(prev => ({ ...prev, [charId]: { status: 'generating', imageUrl: null } }));
          // 后台异步生成
          generateCharacterImageAsync(newCharacterData, charId);
        }
      } else {
        setError('AI返回的数据格式不正确，请检查提示词是否要求返回JSON格式');
      }
    } catch (err) {
      setError('生成失败: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const buildSingleCharacterPrompt = () => {
    let prompt = `世界观：${state.world.name || '未设定'}
${state.world.description || ''}

请根据以上世界观生成一个角色设定，严格按照下方的JSON模板返回结果。

【重要要求】
1. 必须严格按照下方JSON模板格式返回，不要添加或删除任何字段
2. 所有字段都必须填写，不能省略任何字段
3. personalityTraits 的四个数值必须在 0-100 之间，根据角色性格合理设定
4. selfAwareness 数值必须在 0-100 之间
5. physicalAppearance 的所有子字段（hairStyle、hairColor、eyeColor、bodyType、height、clothing）都必须填写具体内容
6. expression 的所有子字段都必须填写
7. 只返回纯JSON，不要包含任何其他文字说明、markdown代码块标记或解释
8. JSON必须能直接被 JSON.parse() 解析

【JSON返回模板 - 必须严格遵守此结构】
{
  "name": "角色名（2-4个字）",
  "age": "年龄（如：25岁、17岁）",
  "gender": "性别（男、女、其他）",
  "personality": "性格描述（100-150字，详细描述角色的性格特点、行为方式、处事原则等）",
  "appearance": "外貌整体描述（150-200字，详细描述角色的容貌、气质、给人的整体印象等）",
  "personalityTraits": {
    "extroversion": 50,
    "rationality": 50,
    "orderliness": 50,
    "optimism": 50
  },
  "selfAwareness": 50,
  "physicalAppearance": {
    "hairStyle": "发型（如：长直发、短卷发、马尾、波浪卷、丸子头）",
    "hairColor": "发色（如：黑色、金色、银色、棕色、蓝色、紫色）",
    "eyeColor": "瞳色（如：蓝色、琥珀色、绿色、紫色、黑色）",
    "bodyType": "体型（如：高挑、娇小、匀称、强壮、苗条）",
    "height": "身高（如：170cm、180cm、160cm）",
    "clothing": "穿着描述（详细描述角色的服装风格、具体服饰等）"
  },
  "expression": {
    "currentExpression": "自然",
    "expressionIntensity": "平静",
    "facialDetails": ""
  }
}

【字段说明】
- personalityTraits（性格指标）：
  * extroversion: 外向程度（0=极度内向，100=极度外向）
  * rationality: 理性程度（0=极度感性，100=极度理性）
  * orderliness: 守序程度（0=极度混乱，100=极度守序）
  * optimism: 乐观程度（0=极度悲观，100=极度乐观）
- selfAwareness（自我意识）：独立强势角色60-80，温和顺从角色30-50，普通角色45-55
- expression.currentExpression（表情）：只能是以下值之一：自然、微笑、严肃、惊讶、害羞、愤怒、悲伤、担忧、困惑
- expression.expressionIntensity（情绪强度）：只能是以下值之一：平静、轻微、中等、强烈
- expression.facialDetails（面部细节）：如"眉头微皱"、"嘴角上扬"、"眼神温柔"等，没有则为空字符串

【示例】
{
  "name": "林小雨",
  "age": "19岁",
  "gender": "女",
  "personality": "温柔善良，待人真诚，总是为他人着想。有些内向害羞，不擅长与人争执，但在关键时刻会表现出坚强的一面。做事细心认真，有责任感。",
  "appearance": "身材娇小，皮肤白皙，有着一双温柔的棕色眼眸。黑色长直发披肩，平时喜欢穿简约清新的衣服。笑容甜美，给人一种邻家女孩的亲切感觉。",
  "personalityTraits": {
    "extroversion": 35,
    "rationality": 60,
    "orderliness": 75,
    "optimism": 65
  },
  "selfAwareness": 45,
  "physicalAppearance": {
    "hairStyle": "长直发",
    "hairColor": "黑色",
    "eyeColor": "棕色",
    "bodyType": "娇小",
    "clothing": "简约清新的连衣裙，搭配白色袜子和小皮鞋"
  },
  "expression": {
    "currentExpression": "微笑",
    "expressionIntensity": "轻微",
    "facialDetails": "嘴角上扬，眼神温柔"
  }
}

请直接返回JSON，不要添加任何其他文字。`;
    return prompt;
  };

  const buildBulkCharacterPrompt = (count) => {
    let prompt = `世界观：${state.world.name || '未设定'}
${state.world.description || ''}

请根据以上世界观生成${count}个配角设定，严格按照下方的JSON模板返回结果。主角已经单独创建了，所有生成的角色isProtagonist都设为false。

【重要要求】
1. 必须严格按照JSON模板格式返回，不要添加或删除任何字段
2. 所有字段都必须填写，不能省略任何字段，不能有空字符串
3. personalityTraits 的四个数值必须在 0-100 之间
4. selfAwareness 数值必须在 0-100 之间
5. physicalAppearance 的所有子字段都必须填写具体内容
6. expression 的所有子字段都必须填写
7. 只返回纯JSON数组，不要包含任何其他文字说明、markdown代码块标记
8. 每个角色都要有不同的性格、外貌和表情设定

【单个角色的JSON模板】
{
  "name": "角色名（2-4个字）",
  "age": "年龄（如：25岁、17岁）",
  "gender": "性别（男、女、其他）",
  "personality": "性格描述（100-150字，详细描述角色的性格特点、行为方式、处事原则等）",
  "appearance": "外貌整体描述（150-200字，详细描述角色的容貌、气质、给人的整体印象等）",
  "personalityTraits": {
    "extroversion": 50,
    "rationality": 50,
    "orderliness": 50,
    "optimism": 50
  },
  "selfAwareness": 50,
  "physicalAppearance": {
    "hairStyle": "发型（如：长直发、短卷发、马尾、波浪卷、丸子头）",
    "hairColor": "发色（如：黑色、金色、银色、棕色、蓝色、紫色）",
    "eyeColor": "瞳色（如：蓝色、琥珀色、绿色、紫色、黑色）",
    "bodyType": "体型（如：高挑、娇小、匀称、强壮、苗条）",
    "height": "身高（如：170cm、180cm、160cm）",
    "clothing": "穿着描述（详细描述角色的服装风格、具体服饰等）"
  },
  "expression": {
    "currentExpression": "自然",
    "expressionIntensity": "平静",
    "facialDetails": ""
  },
  "isProtagonist": false
}

【字段说明】
- personalityTraits（性格指标）：
  * extroversion: 外向程度（0=极度内向，100=极度外向）
  * rationality: 理性程度（0=极度感性，100=极度理性）
  * orderliness: 守序程度（0=极度混乱，100=极度守序）
  * optimism: 乐观程度（0=极度悲观，100=极度乐观）
- selfAwareness（自我意识）：独立强势角色60-80，温和顺从角色30-50，普通角色45-55
- expression.currentExpression（表情）：只能是以下值之一：自然、微笑、严肃、惊讶、害羞、愤怒、悲伤、担忧、困惑
- expression.expressionIntensity（情绪强度）：只能是以下值之一：平静、轻微、中等、强烈
- expression.facialDetails（面部细节）：如"眉头微皱"、"嘴角上扬"、"眼神温柔"等，没有则为空字符串

【返回格式】
请返回一个包含${count}个角色的JSON数组，格式如下：
[
  {
    "name": "角色1",
    "age": "19岁",
    "gender": "女",
    "personality": "...",
    "appearance": "...",
    "personalityTraits": {...},
    "selfAwareness": 50,
    "physicalAppearance": {...},
    "expression": {...},
    "isProtagonist": false
  },
  {
    "name": "角色2",
    "age": "25岁",
    "gender": "男",
    "personality": "...",
    "appearance": "...",
    "personalityTraits": {...},
    "selfAwareness": 60,
    "physicalAppearance": {...},
    "expression": {...},
    "isProtagonist": false
  }
]

请直接返回JSON数组，不要添加任何其他文字。`;
    return prompt;
  };

  // 智能解析批量角色数据
  const parseBulkCharacterData = (char, index) => {
    console.log('Raw bulk character data:', char);

    // 从结果中提取数据，支持多种字段名
    const getValue = (keys) => {
      for (const key of keys) {
        if (char[key] !== undefined && char[key] !== null && char[key] !== '') {
          return char[key];
        }
        // 尝试从嵌套对象中查找
        for (const nested of ['characterStatus', 'data', 'info', 'details', 'attributes', 'props']) {
          if (char[nested] && typeof char[nested] === 'object') {
            if (char[nested][key] !== undefined && char[nested][key] !== null && char[nested][key] !== '') {
              return char[nested][key];
            }
          }
        }
      }
      return '';
    };

    // 获取嵌套对象
    const getNestedObject = (keys) => {
      for (const key of keys) {
        if (char[key] && typeof char[key] === 'object') {
          return char[key];
        }
        for (const nested of ['characterStatus', 'data', 'info', 'details', 'attributes', 'props']) {
          if (char[nested] && typeof char[nested] === 'object' && char[nested][key] && typeof char[nested][key] === 'object') {
            return char[nested][key];
          }
        }
      }
      return null;
    };

    // 获取 physicalAppearance 相关字段
    const getPhysicalValue = (keys, physicalKeys) => {
      const physical = char.physicalAppearance || char.characterStatus?.physicalAppearance || char.appearanceDetails;
      if (physical && typeof physical === 'object') {
        for (const key of physicalKeys) {
          if (physical[key] !== undefined && physical[key] !== null && physical[key] !== '') {
            return physical[key];
          }
        }
      }
      return getValue(keys);
    };

    // 获取表达式相关字段（增强版，支持更多嵌套位置）
    const getExpressionValue = (keys) => {
      // 直接从根对象查找
      for (const key of keys) {
        if (char[key] !== undefined && char[key] !== null && char[key] !== '') {
          return char[key];
        }
      }
      // 从 expression 对象查找
      const expr = char.expression || char.characterStatus?.expression || char.mood || char.currentExpression;
      if (expr && typeof expr === 'object') {
        for (const key of keys) {
          if (expr[key] !== undefined && expr[key] !== null && expr[key] !== '') {
            return expr[key];
          }
        }
      }
      // 如果 expression 是字符串（直接是表情名称），返回它
      if (typeof expr === 'string' && expr) {
        return expr;
      }
      return '';
    };

    // 获取所有基础字段
    let name = getValue(['name', 'characterName', '角色名', '姓名', 'character_name']);
    let age = getValue(['age', '年龄']);
    let gender = getValue(['gender', 'sex', '性别']);
    let personality = getValue(['personality', 'personalityTraits', '性格', '性格特点', 'traits', 'character']);
    let appearance = getValue(['appearance', 'look', '外貌', '外表', '描述', 'description', 'looks']);

    // 如果某些字段没有，尝试从其他地方获取
    if (!personality && char.description) {
      personality = char.description;
    }

    // 如果连 appearance 都没有，把所有能找到的描述性文字拼起来
    if (!appearance) {
      const parts = [];
      if (char.describe) parts.push(char.describe);
      if (char.info) parts.push(typeof char.info === 'string' ? char.info : JSON.stringify(char.info));
      if (char.about) parts.push(char.about);
      appearance = parts.join(' ');
    }

    // 获取 physicalAppearance 的字段
    let hairStyle = getPhysicalValue(['hairStyle', '发型', 'hairstyle', 'hair'], ['hairStyle', 'hairstyle', 'hair']);
    let hairColor = getPhysicalValue(['hairColor', '发色', 'hairColor', 'hair_color'], ['hairColor', 'hairColor', 'hairColor']);
    let eyeColor = getPhysicalValue(['eyeColor', '瞳色', 'eyeColor', 'eye_color', 'eyes'], ['eyeColor', 'eyeColor', 'eyes']);
    let bodyType = getPhysicalValue(['bodyType', '体型', 'build', 'body'], ['bodyType', 'build', 'body']);
    let height = getPhysicalValue(['height', '身高'], ['height']);
    let clothing = getPhysicalValue(['clothing', '穿着', 'outfit', 'clothes', 'wear'], ['clothing', 'outfit', 'clothes']);

    // 如果 detailed 字段缺失，尝试从整体 appearance 中提取
    if (appearance && !hairStyle) hairStyle = extractFromAppearance(appearance, 'hairStyle');
    if (appearance && !hairColor) hairColor = extractFromAppearance(appearance, 'hairColor');
    if (appearance && !eyeColor) eyeColor = extractFromAppearance(appearance, 'eyeColor');
    if (appearance && !bodyType) bodyType = extractFromAppearance(appearance, 'bodyType');
    if (appearance && !clothing) clothing = extractFromAppearance(appearance, 'clothing');

    // 获取 expression 字段
    let currentExpression = getExpressionValue(['currentExpression', '表情', 'expression', 'mood']);
    let expressionIntensity = getExpressionValue(['expressionIntensity', '情绪强度', 'intensity']);
    let facialDetails = getExpressionValue(['facialDetails', '面部细节', 'details']);

    // 获取性格指标
    let personalityTraits = getNestedObject(['personalityTraits', 'personality_traits', '性格指标']);
    let selfAwareness = getValue(['selfAwareness', 'self_awareness', '自我意识']);

    // 设置默认值
    if (!name) name = `角色${index + 1}`;
    if (!currentExpression) currentExpression = '自然';
    if (!expressionIntensity) expressionIntensity = '平静';
    if (!facialDetails) facialDetails = '';

    // 确保性格指标有默认值
    const defaultTraits = { extroversion: 50, rationality: 50, orderliness: 50, optimism: 50 };
    personalityTraits = personalityTraits ? { ...defaultTraits, ...personalityTraits } : defaultTraits;

    // 确保自我意识在合理范围内
    if (typeof selfAwareness !== 'number') {
      selfAwareness = 50;
    }
    selfAwareness = Math.max(0, Math.min(100, selfAwareness));

    console.log('Final parsed bulk character:', { name, age, gender, personality, appearance, hairStyle, hairColor, eyeColor, bodyType, clothing, personalityTraits, selfAwareness });

    return {
      name: name,
      age: age || '',
      gender: gender || '',
      personality: personality || '',
      appearance: appearance || '',
      personalityTraits: personalityTraits,
      selfAwareness: selfAwareness,
      physicalAppearance: {
        hairStyle: hairStyle || '',
        hairColor: hairColor || '',
        eyeColor: eyeColor || '',
        bodyType: bodyType || '',
        height: height || '',
        clothing: clothing || ''
      },
      expression: {
        currentExpression: currentExpression,
        expressionIntensity: expressionIntensity,
        facialDetails: facialDetails
      }
    };
  };

  const handleGenerateBulk = async () => {
    if (!state.world.name && !state.world.description) {
      setError('请先创建世界观');
      return;
    }

    setIsGeneratingBulk(true);
    setImageGenerateProgress(0);
    setError('');

    try {
      // 如果用户输入了自定义提示词，使用用户的；否则使用默认模板
      const prompt = bulkAiPrompt.trim() ? bulkAiPrompt : buildBulkCharacterPrompt(numCharacters);
      const result = await generateWithAI(prompt, 'deepseek', { maxTokens: MAX_TOKENS.CONTENT, jsonResponse: true });

      console.log('AI returned:', result);

      let characters = [];
      if (result && Array.isArray(result)) {
        characters = result;
      } else if (result && typeof result === 'object') {
        // 尝试从不同的字段中获取数组
        if (Array.isArray(result.characters)) {
          characters = result.characters;
        } else if (Array.isArray(result.list)) {
          characters = result.list;
        } else if (Array.isArray(result.data)) {
          characters = result.data;
        } else if (Array.isArray(result.scenes)) {
          characters = result.scenes;
        } else {
          // 如果有多个键，尝试找到第一个数组
          for (const key of Object.keys(result)) {
            if (Array.isArray(result[key])) {
              characters = result[key];
              break;
            }
          }
        }
      }

      if (!characters || characters.length === 0) {
        setError(`生成格式错误，请重试。返回类型: ${typeof result}, 是否数组: ${Array.isArray(result)}。请确保提示词要求返回JSON数组格式。`);
        setIsGeneratingBulk(false);
        return;
      }

      // 先创建所有角色（都是配角）
      const createdCharacters = [];
      characters.forEach((char, index) => {
        const parsedData = parseBulkCharacterData(char, index);

        const newChar = {
          ...defaultCharacter,
          id: `char_${Date.now()}_${index}`,
          name: parsedData.name,
          age: parsedData.age,
          gender: parsedData.gender,
          personality: parsedData.personality,
          appearance: parsedData.appearance,
          isProtagonist: false, // 确保都是配角
          characterStatus: {
            ...defaultCharacter.characterStatus,
            personalityTraits: parsedData.personalityTraits,
            selfAwareness: parsedData.selfAwareness,
            physicalAppearance: parsedData.physicalAppearance,
            expression: parsedData.expression
          }
        };
        createdCharacters.push(newChar);
        dispatch({ type: 'ADD_CHARACTER', payload: newChar });
      });

      setError(`成功生成 ${createdCharacters.length} 个角色！${autoGenerateImages ? ' 正在生成头像...' : ''}`);

      // 如果启用了自动生成图片，则为每个角色生成头像
      if (autoGenerateImages) {
        for (let i = 0; i < createdCharacters.length; i++) {
          const char = createdCharacters[i];
          setImageGenerateProgress(Math.round(((i + 1) / createdCharacters.length) * 100));

          const imageUrl = await generateCharacterImage(char);
          if (imageUrl) {
            const updatedChar = { ...char, imageUrl };
            dispatch({ type: 'UPDATE_CHARACTER', payload: updatedChar });
          }
        }
        setError(`成功生成 ${createdCharacters.length} 个角色和头像！`);
      }
    } catch (err) {
      setError('生成失败: ' + err.message);
    } finally {
      setIsGeneratingBulk(false);
      setImageGenerateProgress(0);
    }
  };

  // 后端批量生成角色（异步）
  const handleBackendGenerateBulk = async () => {
    if (!state.world?.id) {
      setError('请先保存世界观到服务器');
      return;
    }

    setIsGeneratingBulk(true);
    setImageGenerateProgress(0);
    setError('正在调用后端批量生成，请稍候...');

    try {
      const result = await batchGenerateCharacters(
        state.world.id,
        numCharacters,
        bulkAiPrompt.trim() || null,
        autoGenerateImages
      );

      console.log('Backend batch generation result:', result);

      if (!result.characters || result.characters.length === 0) {
        setError('后端返回数据为空');
        return;
      }

      // 将生成的角色添加到前端状态
      const createdCharacters = [];
      result.characters.forEach((charData, index) => {
        const newChar = {
          ...defaultCharacter,
          id: charData.id || `char_${Date.now()}_${index}`,
          name: charData.name || `角色${index + 1}`,
          age: charData.age || '',
          gender: charData.gender || '',
          personality: charData.personality || '',
          appearance: charData.appearance || '',
          isProtagonist: charData.isProtagonist || false,
          imageUrl: charData.imageUrl || '',
          characterStatus: {
            ...defaultCharacter.characterStatus,
            personalityTraits: charData.personalityTraits || {
              extroversion: 50,
              rationality: 50,
              orderliness: 50,
              optimism: 50
            },
            selfAwareness: charData.selfAwareness || 50,
            physicalAppearance: charData.physicalAppearance || {},
            expression: charData.expression || {
              currentExpression: '自然',
              expressionIntensity: '平静',
              facialDetails: ''
            }
          }
        };
        createdCharacters.push(newChar);
        dispatch({ type: 'ADD_CHARACTER', payload: newChar });
      });

      const lazyCount = result.lazyCount || 0;
      const message = lazyCount > 0
        ? `后端成功生成 ${createdCharacters.length} 个角色（含${lazyCount}个待补充角色）！${autoGenerateImages ? '图片已在后台生成。' : ''}`
        : `后端成功生成 ${createdCharacters.length} 个角色！${autoGenerateImages ? '图片已在后台生成。' : ''}`;
      setError(message);
    } catch (err) {
      console.error('Backend batch generation error:', err);
      setError('后端批量生成失败: ' + err.message);
    } finally {
      setIsGeneratingBulk(false);
      setImageGenerateProgress(0);
    }
  };

  // 补充懒加载角色详情
  const handleExpandCharacter = async (character) => {
    if (!character.isLazy) return;

    setExpandingCharacterId(character.id);
    setError('正在补充角色详情...');

    try {
      const result = await expandCharacter(character.id);
      console.log('Expand character result:', result);

      // 更新角色信息
      const updatedChar = {
        ...character,
        age: result.age || '',
        gender: result.gender || character.gender,
        personality: result.personality || '',
        appearance: result.appearance || '',
        imageUrl: result.imageUrl || character.imageUrl,
        isLazy: false,
        characterStatus: {
          ...character.characterStatus,
          personalityTraits: result.personalityTraits || character.characterStatus?.personalityTraits,
          selfAwareness: result.selfAwareness || character.characterStatus?.selfAwareness || 50,
          physicalAppearance: result.physicalAppearance || {},
          expression: result.expression || { currentExpression: '自然', expressionIntensity: '平静', facialDetails: '' }
        }
      };

      dispatch({ type: 'UPDATE_CHARACTER', payload: updatedChar });
      setError('角色详情已补充！');
    } catch (err) {
      console.error('Expand character error:', err);
      setError('补充角色详情失败: ' + err.message);
    } finally {
      setExpandingCharacterId(null);
    }
  };

  // 为单个角色生成头像
  const generateCharacterImage = async (character) => {
    try {
      const physicalAppearance = character.characterStatus?.physicalAppearance || {};
      const expression = character.characterStatus?.expression || {};

      console.log('Generating image for character:', character);

      // 提取年龄
      let ageText = '';
      if (character.age) {
        const ageStr = String(character.age);
        const ageMatch = ageStr.match(/(\d+)/);
        ageText = ageMatch ? ageMatch[1] : '';
      }

      // 构建提示词 - 更灵活的构建方式
      const promptParts = [];

      // 基础人物描述
      if (character.name || character.appearance) {
        // 如果有外貌描述，优先使用
        if (character.appearance) {
          promptParts.push(character.appearance);
        } else {
          // 否则组合各个字段
          const genderText = character.gender === '男' ? '男性' : character.gender === '女' ? '女性' : '人物';
          promptParts.push(`一位${ageText ? ageText + '岁的' : ''}${genderText}`);

          // 发型描述（如果有）
          const hairParts = [];
          if (physicalAppearance.hairColor) hairParts.push(physicalAppearance.hairColor);
          if (physicalAppearance.hairStyle) hairParts.push(physicalAppearance.hairStyle);
          if (hairParts.length > 0) {
            promptParts.push(`，${hairParts.join('')}`);
          }

          // 瞳色（如果有）
          if (physicalAppearance.eyeColor) {
            promptParts.push(`，${physicalAppearance.eyeColor}的眼睛`);
          }

          // 体型（如果有）
          if (physicalAppearance.bodyType) {
            promptParts.push(`，${physicalAppearance.bodyType}的身材`);
          }

          // 表情描述
          if (expression.currentExpression && expression.currentExpression !== '自然') {
            promptParts.push(`，${expression.currentExpression}的表情`);
          }

          // 服装描述
          if (physicalAppearance.clothing) {
            promptParts.push(`，穿着${physicalAppearance.clothing}`);
          } else {
            promptParts.push(`，穿着适合的服装`);
          }
        }
      } else {
        // 兜底：用角色名
        promptParts.push(`${character.name || '角色'}的人物肖像`);
      }

      // 摄影技术参数
      promptParts.push(`，${state.world.name || '奇幻'}风格`);
      promptParts.push(`，专业人像摄影`);
      promptParts.push(`，背景虚化，浅景深`);
      promptParts.push(`，柔和自然光`);
      promptParts.push(`，高清，细节丰富`);

      const prompt = promptParts.join('');
      console.log('Image generation prompt:', prompt);

      const imageUrl = await generateImage(prompt, '2:3');
      return imageUrl;
    } catch (err) {
      console.error(`Failed to generate image for ${character.name || 'character'}:`, err);
      // 尝试用更简单的提示词
      try {
        const fallbackPrompt = `${character.name || '角色'}，人物肖像，${state.world.name || '奇幻'}风格，高清`;
        console.log('Trying fallback prompt:', fallbackPrompt);
        const imageUrl = await generateImage(fallbackPrompt, '2:3');
        return imageUrl;
      } catch (fallbackErr) {
        console.error('Fallback also failed:', fallbackErr);
        return null;
      }
    }
  };

  // 异步生成角色头像（不阻塞 UI）
  const generateCharacterImageAsync = async (character, charId) => {
    try {
      const imageUrl = await generateCharacterImage(character);
      if (imageUrl) {
        // 生成成功后更新到 editingCharacter
        setEditingCharacter(prev => {
          if (prev && prev.id === charId) {
            return { ...prev, imageUrl };
          }
          return prev;
        });
        // 同时更新异步状态
        setAsyncImageGen(prev => ({
          ...prev,
          [charId]: { status: 'done', imageUrl }
        }));
      } else {
        setAsyncImageGen(prev => ({
          ...prev,
          [charId]: { status: 'done', imageUrl: null }
        }));
      }
    } catch (imgErr) {
      console.error('Async image generation failed:', imgErr);
      setAsyncImageGen(prev => ({
        ...prev,
        [charId]: { status: 'done', imageUrl: null }
      }));
    }
  };

  const handleGenerateImage = async () => {
    if (!imagePrompt.trim() && !editingCharacter?.name && !editingCharacter?.appearance) {
      setError('请输入图片生成提示词');
      return;
    }

    setIsGeneratingImage(true);
    setError('');

    try {
      const prompt = imagePrompt.trim() || `${editingCharacter?.name || '角色'}, ${editingCharacter?.appearance || 'character portrait'}, fantasy art`;
      const imageUrl = await generateImage(prompt, imageSize);
      setEditingCharacter(prev => ({ ...prev, imageUrl }));
    } catch (err) {
      setError('图片生成失败: ' + err.message);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  return (
    <div className="character-creation">
      <div className="creation-container">
        <div className="progress-steps">
          <div className="step" style={{ cursor: 'pointer' }}>
            <span className="step-number">1</span>
            <span>世界观</span>
          </div>
          <div className="step" onClick={() => navigate('/create/protagonist')} style={{ cursor: 'pointer' }}>
            <span className="step-number">2</span>
            <span>主角设定</span>
          </div>
          <div className="step active">
            <span className="step-number">3</span>
            <span>角色</span>
          </div>
          <div className="step">
            <span className="step-number">4</span>
            <span>场景</span>
          </div>
        </div>

        <div className="creation-header">
          <h2>创建其他角色</h2>
          <div className="nav-buttons">
            <button className="nav-btn back" onClick={() => navigate('/create/protagonist')}>上一步</button>
            <button className="nav-btn next" onClick={() => navigate('/create/scene')}>下一步: 场景</button>
          </div>
        </div>

        <div className="creation-content-row">
          {/* 左侧列：一键生成角色和角色列表 */}
          <div className="creation-col-left">
            <div className="scrollable-content">
              <div className="ai-section">
                <h3>一键生成角色</h3>
                <div className="editor-grid">
                  <div className="form-group">
                    <label>生成角色数量</label>
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={numCharacters}
                      onChange={(e) => setNumCharacters(Math.max(1, Math.min(50, Number(e.target.value))))}
                      style={{ width: '100%', padding: '0.45rem', border: '2px solid #2d3748', borderRadius: '5px', background: '#1a1a2e', color: '#eee', fontSize: '0.9rem' }}
                    />
                  </div>
                  <div className="form-group checkbox" style={{ display: 'flex', alignItems: 'center', paddingTop: '0.5rem' }}>
                    <input
                      type="checkbox"
                      id="autoGenerateImages"
                      checked={autoGenerateImages}
                      onChange={(e) => setAutoGenerateImages(e.target.checked)}
                    />
                    <label htmlFor="autoGenerateImages" style={{ margin: 0 }}>自动生成角色头像</label>
                  </div>
                  <div className="form-group" style={{ marginTop: '0.75rem' }}>
                    <textarea
                      value={bulkAiPrompt}
                      onChange={(e) => setBulkAiPrompt(e.target.value)}
                      placeholder="输入AI生成提示词（留空则根据世界观生成）。请要求AI返回JSON数组格式，每个角色包含：name, age, gender, personality, appearance, physicalAppearance{hairStyle,hairColor,eyeColor,bodyType,height,clothing}, expression{currentExpression,expressionIntensity,facialDetails}"
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '0.6rem',
                        border: '2px solid #2d3748',
                        borderRadius: '6px',
                        background: '#1a1a2e',
                        color: '#eee',
                        fontSize: '0.85rem',
                        minHeight: '80px',
                        resize: 'vertical'
                      }}
                    />
                  </div>
                </div>
                <div className="form-group" style={{ marginTop: '0.5rem' }}>
                  {imageGenerateProgress > 0 && (
                    <div style={{ marginBottom: '0.5rem' }}>
                      <div style={{
                        background: '#1a1a2e',
                        borderRadius: '5px',
                        height: '16px',
                        overflow: 'hidden',
                        border: '2px solid #2d3748'
                      }}>
                        <div style={{
                          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                          height: '100%',
                          width: `${imageGenerateProgress}%`,
                          transition: 'width 0.3s ease'
                        }} />
                      </div>
                      <p style={{ textAlign: 'center', marginTop: '0.25rem', color: '#a0aec0', fontSize: '0.8rem' }}>
                        头像生成进度: {imageGenerateProgress}%
                      </p>
                    </div>
                  )}
                  <button
                    className="ai-btn generate"
                    onClick={handleGenerateBulk}
                    disabled={isGeneratingBulk}
                    style={{ width: '100%' }}
                  >
                    {isGeneratingBulk ? (imageGenerateProgress > 0 ? `生成头像中... ${imageGenerateProgress}%` : '生成角色中...') : '根据世界观生成角色'}
                  </button>
                  <button
                    className="ai-btn"
                    onClick={handleBackendGenerateBulk}
                    disabled={isGeneratingBulk}
                    style={{ width: '100%', marginTop: '0.5rem', background: '#4c1d95' }}
                  >
                    {isGeneratingBulk ? '后端生成中...' : '后端批量生成（异步）'}
                  </button>
                </div>

                <div className="api-config">
                  <div className="api-config-row">
                    <button className="ai-btn" onClick={onOpenApiSettings}>API 设置</button>
                  </div>
                </div>

                {error && <p className="error-message">{error}</p>}
              </div>

              <div className="character-list">
                {state.characters.map(char => (
                  <div
                    key={char.id}
                    className={`character-card ${selectedCharacter?.id === char.id ? 'selected' : ''}`}
                    onClick={() => setSelectedCharacter(char)}
                  >
                    {char.imageUrl ? (
                      <img
                        src={char.imageUrl}
                        alt={char.name}
                        className="character-avatar"
                        onClick={(e) => {
                          e.stopPropagation();
                          setModalImage({ url: char.imageUrl, alt: char.name });
                        }}
                      />
                    ) : (
                      <div className="character-avatar" />
                    )}
                    <div className="character-info">
                      <h4>
                        {char.name}
                        {char.isProtagonist && (
                          <span className="protagonist-badge">主角</span>
                        )}
                        {char.isLazy && (
                          <span className="protagonist-badge" style={{ background: '#9333ea', marginLeft: '0.5rem' }}>待补充</span>
                        )}
                      </h4>
                      <p><strong>性格:</strong> {char.personality || '未设置'}</p>
                      <p><strong>外貌:</strong> {char.appearance || '未设置'}</p>
                    </div>
                    <div className="character-actions">
                      {char.isLazy && (
                        <button
                          className="small-btn"
                          onClick={(e) => { e.stopPropagation(); handleExpandCharacter(char); }}
                          disabled={expandingCharacterId === char.id}
                          style={{ background: '#7c3aed' }}
                        >
                          {expandingCharacterId === char.id ? '补充中...' : '补充详情'}
                        </button>
                      )}
                      <button
                        className="small-btn edit"
                        onClick={(e) => { e.stopPropagation(); startEdit(char); }}
                      >
                        编辑
                      </button>
                      <button
                        className="small-btn delete"
                        onClick={(e) => { e.stopPropagation(); deleteCharacter(char.id); }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}

                <button className="add-character-btn" onClick={startAdd}>
                  + 添加新角色
                </button>
              </div>
            </div>
          </div>

          {/* 右侧列：角色编辑器 */}
          <div className="creation-col-right">
            <div className="scrollable-content">
              {editingCharacter ? (
                <div className="character-editor">
                  <h3>{isAdding ? '添加新角色' : '编辑角色'}</h3>

                  <div className="editor-grid">
                    <div className="form-group">
                      <label>角色姓名</label>
                      <input
                        type="text"
                        value={editingCharacter.name}
                        onChange={(e) => setEditingCharacter(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="输入角色姓名"
                      />
                    </div>

                    <div className="form-group">
                      <label>年龄</label>
                      <input
                        type="text"
                        value={editingCharacter.age || ''}
                        onChange={(e) => setEditingCharacter(prev => ({ ...prev, age: e.target.value }))}
                        placeholder="例如：25岁、17岁、未知"
                      />
                    </div>

                    <div className="form-group">
                      <label>性别</label>
                      <select
                        value={editingCharacter.gender || ''}
                        onChange={(e) => setEditingCharacter(prev => ({ ...prev, gender: e.target.value }))}
                      >
                        <option value="">请选择...</option>
                        <option value="男">男</option>
                        <option value="女">女</option>
                        <option value="其他">其他</option>
                        <option value="未知">未知</option>
                      </select>
                    </div>

                    <div className="form-group checkbox">
                      <input
                        type="checkbox"
                        id="isProtagonist"
                        checked={editingCharacter.isProtagonist}
                        onChange={(e) => setEditingCharacter(prev => ({ ...prev, isProtagonist: e.target.checked }))}
                      />
                      <label htmlFor="isProtagonist">设为主角</label>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>性格特点</label>
                    <textarea
                      value={editingCharacter.personality}
                      onChange={(e) => setEditingCharacter(prev => ({ ...prev, personality: e.target.value }))}
                      placeholder="描述角色的性格特点..."
                    />
                  </div>

                  <div className="form-group">
                    <label>外貌描述</label>
                    <textarea
                      value={editingCharacter.appearance}
                      onChange={(e) => setEditingCharacter(prev => ({ ...prev, appearance: e.target.value }))}
                      placeholder="描述角色的外貌..."
                    />
                  </div>

                  <div className="editor-grid">
                    <div className="form-group">
                      <label>发型</label>
                      <input
                        type="text"
                        value={editingCharacter.characterStatus?.physicalAppearance?.hairStyle || ''}
                        onChange={(e) => setEditingCharacter(prev => ({
                          ...prev,
                          characterStatus: {
                            ...prev.characterStatus,
                            physicalAppearance: {
                              ...prev.characterStatus?.physicalAppearance,
                              hairStyle: e.target.value
                            }
                          }
                        }))}
                        placeholder="例如：长直发、短卷发、马尾"
                      />
                    </div>
                    <div className="form-group">
                      <label>发色</label>
                      <input
                        type="text"
                        value={editingCharacter.characterStatus?.physicalAppearance?.hairColor || ''}
                        onChange={(e) => setEditingCharacter(prev => ({
                          ...prev,
                          characterStatus: {
                            ...prev.characterStatus,
                            physicalAppearance: {
                              ...prev.characterStatus?.physicalAppearance,
                              hairColor: e.target.value
                            }
                          }
                        }))}
                        placeholder="例如：黑色、金色、银色"
                      />
                    </div>
                    <div className="form-group">
                      <label>瞳色</label>
                      <input
                        type="text"
                        value={editingCharacter.characterStatus?.physicalAppearance?.eyeColor || ''}
                        onChange={(e) => setEditingCharacter(prev => ({
                          ...prev,
                          characterStatus: {
                            ...prev.characterStatus,
                            physicalAppearance: {
                              ...prev.characterStatus?.physicalAppearance,
                              eyeColor: e.target.value
                            }
                          }
                        }))}
                        placeholder="例如：蓝色、琥珀色、紫色"
                      />
                    </div>
                    <div className="form-group">
                      <label>体型</label>
                      <input
                        type="text"
                        value={editingCharacter.characterStatus?.physicalAppearance?.bodyType || ''}
                        onChange={(e) => setEditingCharacter(prev => ({
                          ...prev,
                          characterStatus: {
                            ...prev.characterStatus,
                            physicalAppearance: {
                              ...prev.characterStatus?.physicalAppearance,
                              bodyType: e.target.value
                            }
                          }
                        }))}
                        placeholder="例如：高挑、娇小、匀称"
                      />
                    </div>
                    <div className="form-group">
                      <label>穿着</label>
                      <input
                        type="text"
                        value={editingCharacter.characterStatus?.physicalAppearance?.clothing || ''}
                        onChange={(e) => setEditingCharacter(prev => ({
                          ...prev,
                          characterStatus: {
                            ...prev.characterStatus,
                            physicalAppearance: {
                              ...prev.characterStatus?.physicalAppearance,
                              clothing: e.target.value
                            }
                          }
                        }))}
                        placeholder="例如：法师长袍、便装、骑士铠甲"
                      />
                    </div>
                  </div>

                  <div className="editor-grid">
                    <div className="form-group">
                      <label>当前表情</label>
                      <select
                        value={editingCharacter.characterStatus?.expression?.currentExpression || '自然'}
                        onChange={(e) => setEditingCharacter(prev => ({
                          ...prev,
                          characterStatus: {
                            ...prev.characterStatus,
                            expression: {
                              ...prev.characterStatus?.expression,
                              currentExpression: e.target.value
                            }
                          }
                        }))}
                      >
                        <option value="自然">自然</option>
                        <option value="微笑">微笑</option>
                        <option value="严肃">严肃</option>
                        <option value="惊讶">惊讶</option>
                        <option value="害羞">害羞</option>
                        <option value="愤怒">愤怒</option>
                        <option value="悲伤">悲伤</option>
                        <option value="担忧">担忧</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>情绪强度</label>
                      <select
                        value={editingCharacter.characterStatus?.expression?.expressionIntensity || '平静'}
                        onChange={(e) => setEditingCharacter(prev => ({
                          ...prev,
                          characterStatus: {
                            ...prev.characterStatus,
                            expression: {
                              ...prev.characterStatus?.expression,
                              expressionIntensity: e.target.value
                            }
                          }
                        }))}
                      >
                        <option value="平静">平静</option>
                        <option value="轻微">轻微</option>
                        <option value="中等">中等</option>
                        <option value="强烈">强烈</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>面部细节</label>
                    <input
                      type="text"
                      value={editingCharacter.characterStatus?.expression?.facialDetails || ''}
                      onChange={(e) => setEditingCharacter(prev => ({
                        ...prev,
                        characterStatus: {
                          ...prev.characterStatus,
                          expression: {
                            ...prev.characterStatus?.expression,
                            facialDetails: e.target.value
                          }
                        }
                      }))}
                      placeholder="例如：嘴角上扬、眉头微皱"
                    />
                  </div>

                  <div className="editor-grid">
                    <div className="form-group">
                      <label>外向-内向 ({editingCharacter.characterStatus?.personalityTraits?.extroversion || 50}/100)</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={editingCharacter.characterStatus?.personalityTraits?.extroversion || 50}
                        onChange={(e) => setEditingCharacter(prev => ({
                          ...prev,
                          characterStatus: {
                            ...prev.characterStatus,
                            personalityTraits: {
                              ...prev.characterStatus?.personalityTraits,
                              extroversion: Number(e.target.value)
                            }
                          }
                        }))}
                      />
                    </div>
                    <div className="form-group">
                      <label>理性-感性 ({editingCharacter.characterStatus?.personalityTraits?.rationality || 50}/100)</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={editingCharacter.characterStatus?.personalityTraits?.rationality || 50}
                        onChange={(e) => setEditingCharacter(prev => ({
                          ...prev,
                          characterStatus: {
                            ...prev.characterStatus,
                            personalityTraits: {
                              ...prev.characterStatus?.personalityTraits,
                              rationality: Number(e.target.value)
                            }
                          }
                        }))}
                      />
                    </div>
                    <div className="form-group">
                      <label>守序-混乱 ({editingCharacter.characterStatus?.personalityTraits?.orderliness || 50}/100)</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={editingCharacter.characterStatus?.personalityTraits?.orderliness || 50}
                        onChange={(e) => setEditingCharacter(prev => ({
                          ...prev,
                          characterStatus: {
                            ...prev.characterStatus,
                            personalityTraits: {
                              ...prev.characterStatus?.personalityTraits,
                              orderliness: Number(e.target.value)
                            }
                          }
                        }))}
                      />
                    </div>
                    <div className="form-group">
                      <label>乐观-悲观 ({editingCharacter.characterStatus?.personalityTraits?.optimism || 50}/100)</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={editingCharacter.characterStatus?.personalityTraits?.optimism || 50}
                        onChange={(e) => setEditingCharacter(prev => ({
                          ...prev,
                          characterStatus: {
                            ...prev.characterStatus,
                            personalityTraits: {
                              ...prev.characterStatus?.personalityTraits,
                              optimism: Number(e.target.value)
                            }
                          }
                        }))}
                      />
                    </div>
                    <div className="form-group">
                      <label>自我意识 ({editingCharacter.characterStatus?.selfAwareness || 50}/100)</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={editingCharacter.characterStatus?.selfAwareness || 50}
                        onChange={(e) => setEditingCharacter(prev => ({
                          ...prev,
                          characterStatus: {
                            ...prev.characterStatus,
                            selfAwareness: Number(e.target.value)
                          }
                        }))}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>角色头像 URL（可选）</label>
                    <input
                      type="text"
                      value={editingCharacter.imageUrl}
                      onChange={(e) => setEditingCharacter(prev => ({ ...prev, imageUrl: e.target.value }))}
                      placeholder="https://example.com/avatar.jpg"
                    />
                  </div>

                  {asyncImageGen[editingCharacter?.id]?.status === 'generating' && (
                    <div className="preview-section">
                      <h3>头像预览</h3>
                      <div className="generating-indicator">
                        <span className="spinner">⏳</span>
                        <span>AI 正在生成头像...</span>
                      </div>
                    </div>
                  )}

                  {editingCharacter.imageUrl && asyncImageGen[editingCharacter?.id]?.status !== 'generating' && (
                    <div className="preview-section">
                      <h3>头像预览</h3>
                      <img
                        src={editingCharacter.imageUrl}
                        alt="头像预览"
                        className="preview-image"
                        onClick={() => setModalImage({ url: editingCharacter.imageUrl, alt: editingCharacter.name || '头像预览' })}
                      />
                    </div>
                  )}

                  <div className="ai-section">
                    <h3>AI 生成角色</h3>
                    <div className="ai-prompt-area">
                      <textarea
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        placeholder="输入AI生成提示词（留空则根据世界观生成）。请要求AI返回JSON格式，包含：name, age, gender, personality, appearance, physicalAppearance{hairStyle,hairColor,eyeColor,bodyType,height,clothing}, expression{currentExpression,expressionIntensity,facialDetails}"
                      />
                      <div className="form-group checkbox" style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          id="autoGenerateImagesSingle"
                          checked={autoGenerateImages}
                          onChange={(e) => setAutoGenerateImages(e.target.checked)}
                        />
                        <label htmlFor="autoGenerateImagesSingle" style={{ margin: 0 }}>同时自动生成头像</label>
                      </div>
                      <div className="ai-buttons">
                        <button
                          className="ai-btn generate"
                          onClick={handleGenerate}
                          disabled={isGenerating}
                        >
                          {isGenerating ? '生成中...' : 'AI 生成角色'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="ai-section">
                    <h3>图片生成</h3>
                    <div className="ai-prompt-area">
                      <div className="api-config-row">
                        <input
                          type="text"
                          value={imagePrompt}
                          onChange={(e) => setImagePrompt(e.target.value)}
                          placeholder="图片提示词，例如：一个年轻的魔法师角色肖像..."
                        />
                        <select
                          value={imageSize}
                          onChange={(e) => setImageSize(e.target.value)}
                          style={{ flex: '0 0 110px', padding: '0.4rem', border: '2px solid #2d3748', borderRadius: '5px', background: '#1a1a2e', color: '#eee', fontSize: '0.85rem' }}
                        >
                          <option value="2:3">2:3 (肖像)</option>
                          <option value="3:2">3:2</option>
                          <option value="1:1">1:1</option>
                          <option value="3:4">3:4</option>
                          <option value="4:3">4:3</option>
                        </select>
                      </div>
                      <div className="ai-buttons">
                        <button
                          className="ai-btn generate"
                          onClick={handleGenerateImage}
                          disabled={isGeneratingImage}
                        >
                          {isGeneratingImage ? '图片生成中...' : 'AI 生成头像'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="editor-actions">
                    <button className="nav-btn cancel" onClick={cancelEdit}>取消</button>
                    <button className="nav-btn save" onClick={saveCharacter}>保存</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#666', fontSize: '0.9rem' }}>
                  请选择一个角色或添加新角色进行编辑
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 图片全屏查看弹窗 */}
      <ImageModal
        imageUrl={modalImage?.url}
        alt={modalImage?.alt}
        onClose={() => setModalImage(null)}
      />
    </div>
  );
};

export default CharacterCreation;
