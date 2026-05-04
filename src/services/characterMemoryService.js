import { generateWithAI, MAX_TOKENS } from './aiService.js';

const AUTH_TOKEN_KEY = 'auth_token';

// 获取认证token
const getAuthHeaders = () => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

// 从 localStorage 加载角色记忆（备用）
const STORAGE_KEY = 'character_memories';

export const loadMemoriesFromStorage = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.error('Failed to load memories from storage:', error);
  }
  return {};
};

// 保存角色记忆到 localStorage（备用）
export const saveMemoriesToStorage = (memories) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memories));
  } catch (error) {
    console.error('Failed to save memories to storage:', error);
  }
};

// 从数据库加载角色记忆
export const loadMemoriesFromDatabase = async (worldId) => {
  try {
    const response = await fetch(`/api/memories/world/${worldId}`, {
      headers: getAuthHeaders(),
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to load memories from database');
    }

    const data = await response.json();
    console.log('[记忆] 从数据库加载记忆:', data);
    return data;
  } catch (error) {
    console.error('[记忆] 从数据库加载失败:', error);
    // 尝试从 localStorage 加载作为备用
    const localMemories = loadMemoriesFromStorage();
    if (Object.keys(localMemories).length > 0) {
      console.log('[记忆] 回退到 localStorage');
      return localMemories;
    }
    return {};
  }
};

// 保存角色记忆到数据库
export const saveMemoriesToDatabase = async (worldId, memories) => {
  try {
    const response = await fetch(`/api/memories/batch`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        world_id: worldId,
        memories: memories
      })
    });

    if (!response.ok) {
      throw new Error('Failed to save memories to database');
    }

    const result = await response.json();
    console.log('[记忆] 保存到数据库成功:', result);

    // 同时保存到 localStorage 作为本地缓存
    saveMemoriesToStorage(memories);

    return result;
  } catch (error) {
    console.error('[记忆] 保存到数据库失败:', error);
    // 保存到 localStorage 作为本地备份
    saveMemoriesToStorage(memories);
    return { success: false, error: error.message };
  }
};

// 保存单个角色的记忆到数据库
export const saveCharacterMemoriesToDatabase = async (worldId, characterId, memories) => {
  try {
    const response = await fetch(`/api/memories/character/${characterId}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        world_id: worldId,
        memories: memories
      })
    });

    if (!response.ok) {
      throw new Error('Failed to save character memories');
    }

    const result = await response.json();
    console.log('[记忆] 保存角色记忆成功:', characterId, memories.length);
    return result;
  } catch (error) {
    console.error('[记忆] 保存角色记忆失败:', error);
    return { success: false, error: error.message };
  }
};

// 计算游戏天数（从某年开始计算）
const calculateGameDays = (gameTime) => {
  // 假设每年12个月，每月30天
  return (gameTime.year - 1) * 360 + (gameTime.month - 1) * 30 + (gameTime.day - 1);
};

// 检查记忆是否过期
const isMemoryExpired = (memory, currentGameTime) => {
  if (!memory.expiresInDays || !memory.gameTime || !currentGameTime) {
    return false; // 永久记忆不会过期
  }
  const memoryDay = calculateGameDays(memory.gameTime);
  const currentDay = calculateGameDays(currentGameTime);
  return (currentDay - memoryDay) >= memory.expiresInDays;
};

// 获取角色记忆的格式化字符串
export const getCharacterMemoriesText = (memories, characterName, currentGameTime = null) => {
  if (!memories || memories.length === 0) {
    return '';
  }

  // 过滤掉过期的临时记忆
  const validMemories = memories.filter(memory => !isMemoryExpired(memory, currentGameTime));

  // 按重要性排序，只取最重要的10条记忆
  const sortedMemories = [...validMemories]
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 10);

  if (sortedMemories.length === 0) {
    return '';
  }

  let memoryText = `关于你和${characterName}的过往交流：\n`;
  sortedMemories.forEach((memory, index) => {
    // 优先使用游戏时间，如果没有则使用真实时间
    let dateStr;
    if (memory.gameTime) {
      dateStr = `${memory.gameTime.year}年${memory.gameTime.month}月${memory.gameTime.day}日 ${memory.gameTime.hour}:${memory.gameTime.minute.toString().padStart(2, '0')}`;
    } else {
      dateStr = new Date(memory.timestamp).toLocaleDateString('zh-CN');
    }
    const expireTag = memory.expiresInDays ? '⏳' : '';
    memoryText += `${index + 1}. [${dateStr}]${expireTag} ${memory.content}\n`;
  });

  return memoryText;
};

// 分析对话并提取重要记忆
export const extractMemoriesFromDialogue = async (
  dialogueHistory,
  character,
  protagonist,
  aiProvider,
  providerConfig
) => {
  try {
    const recentDialogues = dialogueHistory.slice(-20); // 取最近20条对话
    const dialogueText = recentDialogues
      .map(d => `${d.speaker}: ${d.text}`)
      .join('\n');

    const prompt = `
请分析以下对话，提取与${character.name}和主角（${protagonist?.name || '你'}）相关的重要信息，作为"记忆"保存下来。

对话内容：
${dialogueText}

请提取以下类型的信息（包括主角和${character.name}双方的内容）：
1. 个人信息（姓名、年龄、身份等）
2. 喜好和厌恶
3. 重要的经历或事件
4. 目标和愿望
5. 秘密或隐私
6. 关系变化
7. 承诺或约定
8. 特殊的共同经历
9. 主角说过的重要话
10. ${character.name}说过的重要话
11. 主角对${character.name}使用过的特殊技能（如魅惑术、读心术等让${character.name}感到羞耻或不安的技能）

重要：如果主角使用了让${character.name}感到羞耻的技能（如魅惑、暗示、读心等），${character.name}会感到不安和羞耻，这种记忆要标记为高重要性。

只返回JSON数组格式，每条记忆包含：
{
  "memories": [
    {
      "content": "记忆内容（简洁描述，50字以内）",
      "importance": 重要程度(1-10，10最重要，涉及羞耻/隐私的记忆重要性要8以上)
    }
  ]
}

如果没有重要信息，返回空数组。
`;

    const result = await generateWithAI(prompt, aiProvider, { maxTokens: MAX_TOKENS.DIALOGUE, jsonResponse: true });

    if (result && result.memories && Array.isArray(result.memories)) {
      return result.memories;
    }

    return [];
  } catch (error) {
    console.error('Failed to extract memories with AI:', error);
    // AI提取失败时，使用启发式方法作为备用
    return extractMemoriesHeuristically(dialogueHistory, character, protagonist);
  }
};

// 启发式提取记忆（无 API 时的备用方案）
const extractMemoriesHeuristically = (dialogueHistory, character, protagonist) => {
  const memories = [];
  const protagName = protagonist?.name || '你';

  const keywords = [
    { pattern: /我叫|我的名字是|我是/, type: '名字', importance: 10 },
    { pattern: /我喜欢|我爱|我最讨厌|我不喜欢/, type: '喜好', importance: 8 },
    { pattern: /记得|还记得|你答应|约定|承诺/, type: '约定', importance: 9 },
    { pattern: /秘密|不要告诉|别让别人知道/, type: '秘密', importance: 10 },
    { pattern: /谢谢你|感谢|多亏了你/, type: '感激', importance: 7 },
    { pattern: /第一次|那一次|那天|当时/, type: '经历', importance: 8 },
  ];

  // 提取角色的对话
  const characterDialogues = dialogueHistory.filter(d => d.speaker === character.name);
  characterDialogues.forEach(dialogue => {
    keywords.forEach(({ pattern, type, importance }) => {
      if (pattern.test(dialogue.text)) {
        const match = dialogue.text.match(pattern);
        if (match) {
          const index = match.index;
          const start = Math.max(0, index - 10);
          const end = Math.min(dialogue.text.length, index + 30);
          const content = dialogue.text.slice(start, end);
          memories.push({
            content: `${character.name}${type}: ${content}...`,
            importance
          });
        }
      }
    });
  });

  // 提取主角的对话（与该角色相关的）
  const protagDialogues = dialogueHistory.filter(d =>
    d.speaker === protagName || d.speaker === '你'
  );
  protagDialogues.forEach(dialogue => {
    keywords.forEach(({ pattern, type, importance }) => {
      if (pattern.test(dialogue.text)) {
        const match = dialogue.text.match(pattern);
        if (match) {
          const index = match.index;
          const start = Math.max(0, index - 10);
          const end = Math.min(dialogue.text.length, index + 30);
          const content = dialogue.text.slice(start, end);
          memories.push({
            content: `主角${type}: ${content}...`,
            importance: importance - 1 // 主角的记忆重要性稍低
          });
        }
      }
    });
  });

  // 去重并返回
  return memories.filter((m, i, arr) =>
    i === arr.findIndex(t => t.content === m.content)
  );
};

// 计算两个字符串的相似度（简单版本：计算共同词的比例）
const calculateSimilarity = (str1, str2) => {
  if (!str1 || !str2) return 0;
  const words1 = new Set(str1.replace(/[，。！？、；：""''（）\s]/g, ' ').split(' ').filter(w => w.length > 1));
  const words2 = new Set(str2.replace(/[，。！？、；：""''（）\s]/g, ' ').split(' ').filter(w => w.length > 1));

  if (words1.size === 0 || words2.size === 0) return 0;

  let intersection = 0;
  words1.forEach(word => {
    if (words2.has(word)) intersection++;
  });

  const union = words1.size + words2.size - intersection;
  return intersection / union;
};

// 检查两条记忆是否相似
const areMemoriesSimilar = (m1, m2) => {
  // 完全相同直接返回
  if (m1.content === m2.content) return true;

  // 检查前20个字符是否相同
  if (m1.content.slice(0, 20) === m2.content.slice(0, 20)) return true;

  // 计算相似度，超过0.5认为相似
  if (calculateSimilarity(m1.content, m2.content) > 0.5) return true;

  return false;
};

// 合并新记忆和旧记忆，去重并按重要性排序
export const mergeMemories = (oldMemories = [], newMemories = []) => {
  // 将新记忆放在前面，这样在去重时会保留新的
  const allMemories = [...newMemories, ...oldMemories];

  // 去重（内容相似的，以最新的记忆覆盖旧有的）
  const uniqueMemories = [];

  allMemories.forEach(memory => {
    // 检查是否已经存在相似的记忆
    const similarIndex = uniqueMemories.findIndex(m => areMemoriesSimilar(m, memory));
    if (similarIndex === -1) {
      // 没有相似的，添加新的
      uniqueMemories.push(memory);
    } else {
      // 有相似的，保留重要性更高的那个；如果重要性相同，保留新的（已经在前面了）
      const existing = uniqueMemories[similarIndex];
      if (memory.importance > existing.importance) {
        uniqueMemories[similarIndex] = memory;
      }
    }
  });

  // 按重要性排序，保留最重要的20条
  return uniqueMemories
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 20);
};

// 整理记忆：去重并删除重要性较低的记忆，保留最重要的记忆
// maxToKeep: 最多保留多少条记忆，默认保留20条
export const cleanupMemories = (memories, maxToKeep = 20) => {
  if (!memories || memories.length <= 0) return [];

  // 去重
  const uniqueMemories = [];
  memories.forEach(memory => {
    const similarIndex = uniqueMemories.findIndex(m => areMemoriesSimilar(m, memory));
    if (similarIndex === -1) {
      uniqueMemories.push(memory);
    } else {
      // 保留重要性更高的
      const existing = uniqueMemories[similarIndex];
      if (memory.importance > existing.importance) {
        uniqueMemories[similarIndex] = memory;
      }
    }
  });

  // 按重要性排序，保留最重要的
  return uniqueMemories
    .sort((a, b) => b.importance - a.importance)
    .slice(0, maxToKeep);
};

// 使用AI整理大量记忆，将多条记忆合并成更少的精炼记忆
// 当记忆超过20条时调用，合并成5条
export const consolidateMemoriesWithAI = async (
  memories,
  character,
  protagonist,
  aiProvider,
  providerConfig
) => {
  if (!memories || memories.length < 20) {
    return memories; // 记忆少于20条不需要整理
  }

  try {
    // 构建记忆列表文本
    const memoriesText = memories
      .sort((a, b) => b.importance - a.importance)
      .map((m, i) => `${i + 1}. [重要性${m.importance}] ${m.content}`)
      .join('\n');

    const prompt = `
角色信息：
角色名：${character?.name || '未知'}
主角名：${protagonist?.name || '你'}

当前有${memories.length}条记忆，请将这些记忆整理合并成5条最核心的记忆。

记忆列表：
${memoriesText}

请根据以下原则整理：
1. 保留最重要、最有意义的记忆
2. 相似的记忆要合并
3. 关于主角使用特殊技能（让角色感到羞耻不安）的记忆要保留
4. 关系变化、承诺约定等重要记忆要保留
5. 最终只返回5条记忆（如果确实没有那么多重要内容，可以少于5条）

返回JSON格式：
{
  "consolidatedMemories": [
    {
      "content": "合并后的记忆内容（30字以内）",
      "importance": 保留的重要性分数(1-10)
    }
  ]
}

请直接返回JSON，不要包含任何其他文字。
`;

    const result = await generateWithAI(prompt, aiProvider, {
      maxTokens: MAX_TOKENS.DIALOGUE,
      jsonResponse: true,
      temperature: 0.5
    });

    if (result && result.consolidatedMemories && Array.isArray(result.consolidatedMemories)) {
      console.log('[记忆整理] AI整理后的记忆:', result.consolidatedMemories);
      return result.consolidatedMemories;
    }

    // 如果AI返回格式不对，使用简单清理
    return cleanupMemories(memories, 5);
  } catch (error) {
    console.error('[记忆整理] AI整理失败:', error);
    // 出错时使用简单的清理方法
    return cleanupMemories(memories, 5);
  }
};

// 导出默认对象
export default {
  loadMemoriesFromStorage,
  saveMemoriesToStorage,
  loadMemoriesFromDatabase,
  saveMemoriesToDatabase,
  saveCharacterMemoriesToDatabase,
  getCharacterMemoriesText,
  extractMemoriesFromDialogue,
  mergeMemories,
  cleanupMemories,
  consolidateMemoriesWithAI
};
