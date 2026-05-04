import apiClient, { worldsApi, savesApi, imagesApi, charactersApi, timestampsApi, checkBackendStatus } from './apiClient.js';

// 检查后端是否可用
let backendAvailable = null;
let lastBackendCheck = 0;
const BACKEND_CHECK_CACHE_MS = 30000; // 30秒缓存

export const checkBackend = async () => {
  const now = Date.now();

  // 如果缓存有效且后端不可用，直接返回false，不再检查
  if (backendAvailable === false && (now - lastBackendCheck) < BACKEND_CHECK_CACHE_MS) {
    return false;
  }

  // 如果没有缓存或缓存过期，进行检查
  if (backendAvailable === null || (now - lastBackendCheck) >= BACKEND_CHECK_CACHE_MS) {
    try {
      backendAvailable = await checkBackendStatus();
    } catch {
      backendAvailable = false;
    }
    lastBackendCheck = now;
  }

  return backendAvailable;
};

// 保存世界观到数据库
export const saveWorldToDatabase = async (world) => {
  try {
    const available = await checkBackend();
    if (!available) {
      console.warn('Backend not available, skipping database save');
      return null;
    }

    const worldData = {
      name: world.name || '',
      description: world.description || '',
      image_url: world.imageUrl || ''
    };

    const worldId = await worldsApi.save(worldData);

    // 同时保存世界观图片
    if (world.imageUrl && worldId) {
      await imagesApi.save({
        world_id: worldId.id || worldId,
        image_type: 'world',
        image_url: world.imageUrl
      });
    }

    return worldId.id || worldId;
  } catch (error) {
    console.warn('Failed to save world to database (continuing without database):', error.message);
    return null;
  }
};

// 保存角色到数据库
export const saveCharacterToDatabase = async (character, worldId) => {
  try {
    const available = await checkBackend();
    if (!available) return;

    // 只发送定义了的字段，避免发送 undefined
    const charData = {
      id: character.id,
      world_id: worldId,
      name: character.name || '',
      personality: character.personality || '',
      appearance: character.appearance || '',
      physical_appearance: character.physicalAppearance || {},
      background: character.background || '',
      image_url: character.imageUrl || '',
      isProtagonist: Boolean(character.isProtagonist)
    };

    await charactersApi.save(charData);

    // 同时保存角色图片
    if (character.imageUrl) {
      await imagesApi.save({
        world_id: worldId,
        character_id: character.id,
        image_type: 'character',
        image_url: character.imageUrl
      });
    }
  } catch (error) {
    console.warn('Failed to save character to database (continuing without database):', error.message);
  }
};

// 保存场景图片到数据库
export const saveSceneImageToDatabase = async (scene, worldId) => {
  if (!scene.imageUrl) return;

  try {
    const available = await checkBackend();
    if (!available) return;

    await imagesApi.save({
      world_id: worldId,
      scene_id: scene.id,
      image_type: 'scene',
      image_url: scene.imageUrl
    });
  } catch (error) {
    console.error('Failed to save scene image to database:', error);
  }
};

// 保存照片到数据库
export const savePhotoToDatabase = async (photo, worldId) => {
  if (!photo.url) return;

  try {
    const available = await checkBackend();
    if (!available) return;

    await imagesApi.save({
      world_id: worldId,
      image_type: 'photo',
      image_url: photo.url,
      prompt: photo.characters || ''
    });
  } catch (error) {
    console.error('Failed to save photo to database:', error);
  }
};

// 从数据库加载照片
export const loadPhotosFromDatabase = async (worldId) => {
  try {
    const available = await checkBackend();
    if (!available) return [];

    const photos = await imagesApi.getByType('photo', worldId);
    return photos.map(photo => ({
      id: photo.id,
      url: photo.image_url,
      characters: photo.prompt || '',
      gameTime: null,
      timestamp: photo.created_at
    }));
  } catch (error) {
    console.warn('Failed to load photos from database:', error);
    return [];
  }
};

export const exportSave = (gameState) => {
  const saveData = {
    ...gameState,
    updatedAt: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(saveData, null, 2)], {
    type: 'application/json'
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const fileName = `save_${gameState.world.name || 'unnamed'}_${Date.now()}.json`;
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const importSave = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const saveData = JSON.parse(e.target.result);
        if (!saveData.version || !saveData.world) {
          reject(new Error('无效的存档文件格式'));
          return;
        }
        resolve(saveData);
      } catch (error) {
        reject(new Error('解析存档文件失败: ' + error.message));
      }
    };
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsText(file);
  });
};

export const saveToLocalStorage = (gameState) => {
  try {
    localStorage.setItem('game_save', JSON.stringify(gameState));
    return true;
  } catch (error) {
    console.error('保存到本地存储失败:', error);
    return false;
  }
};

// 只保存关键状态（排除对话历史等临时数据）
export const saveKeyStateToLocalStorage = (state) => {
  const keyState = {
    version: state.version,
    world: state.world,
    characters: state.characters,
    scenes: state.scenes,
    currentSceneId: state.currentSceneId,
    characterMemories: state.characterMemories,
    gameTime: state.gameTime,
    playerStatus: state.playerStatus,
    protagonistPersonality: state.protagonistPersonality,
    createdAt: state.createdAt,
    updatedAt: new Date().toISOString()
  };
  try {
    localStorage.setItem('game_save', JSON.stringify(keyState));
    return true;
  } catch (error) {
    console.error('保存关键状态失败:', error);
    return false;
  }
};

export const loadFromLocalStorage = () => {
  try {
    const saved = localStorage.getItem('game_save');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.error('从本地存储加载失败:', error);
  }
  return null;
};

export const clearLocalStorageSave = () => {
  localStorage.removeItem('game_save');
};

// 当前世界ID缓存
let currentWorldId = null;

export const setCurrentWorldId = (id) => {
  currentWorldId = id;
};

export const getCurrentWorldId = () => currentWorldId;

// 保存完整游戏状态到数据库
export const saveGameToDatabase = async (gameState, saveName = null) => {
  try {
    const available = await checkBackend();
    if (!available) {
      console.warn('Backend not available, skipping database save');
      return null;
    }

    // 1. 先保存世界观
    let worldId = currentWorldId;
    if (gameState.world && gameState.world.name) {
      const savedWorld = await worldsApi.save({
        name: gameState.world.name || '',
        description: gameState.world.description || '',
        image_url: gameState.world.imageUrl || ''
      });
      worldId = savedWorld.id || savedWorld;
      currentWorldId = worldId;

      // 保存世界观图片
      if (gameState.world.imageUrl) {
        await imagesApi.save({
          world_id: worldId,
          image_type: 'world',
          image_url: gameState.world.imageUrl
        });
      }
    }

    // 2. 保存所有角色
    if (gameState.characters && gameState.characters.length > 0) {
      for (const char of gameState.characters) {
        await charactersApi.save({
          id: char.id,
          world_id: worldId,
          name: char.name || '',
          personality: char.personality || '',
          appearance: char.appearance || '',
          background: char.background || '',
          image_url: char.imageUrl || '',
          isProtagonist: Boolean(char.isProtagonist)
        });

        // 保存角色图片
        if (char.imageUrl) {
          await imagesApi.save({
            world_id: worldId,
            character_id: char.id,
            image_type: 'character',
            image_url: char.imageUrl
          });
        }
      }
    }

    // 3. 保存场景图片
    if (gameState.scenes && gameState.scenes.length > 0) {
      for (const scene of gameState.scenes) {
        if (scene.imageUrl) {
          await imagesApi.save({
            world_id: worldId,
            scene_id: scene.id,
            image_type: 'scene',
            image_url: scene.imageUrl
          });
        }
      }
    }

    // 4. 保存游戏存档
    const name = saveName || `${gameState.world.name || '存档'}_${new Date().toLocaleDateString('zh-CN')}`;
    const saveResult = await savesApi.create({
      world_id: worldId,
      name: name,
      game_state: gameState
    });

    return saveResult.id;
  } catch (error) {
    console.warn('Failed to save game to database (continuing without database):', error.message);
    return null;
  }
};

// ===== 时间点（时间旅行）功能 =====

// 当前步数计数器
let stepCounter = 0;
// 当前存档ID
let currentSaveId = null;

export const setCurrentSaveId = (id) => {
  currentSaveId = id;
};

export const getCurrentSaveId = () => currentSaveId;

export const setStepCounter = (step) => {
  stepCounter = step;
};

// 保存时间点（每步操作后调用）
export const saveTimestamp = async (gameState, description = '') => {
  try {
    const available = await checkBackend();
    if (!available) {
      // 后端不可用时静默跳过，不显示警告
      return null;
    }

    // 如果没有当前存档ID，先创建一个存档
    if (!currentSaveId) {
      const saveName = `${gameState.world.name || '游戏'}_进度`;
      const saveResult = await saveGameToDatabase(gameState, saveName);
      if (saveResult) {
        currentSaveId = saveResult;
      } else {
        return null;
      }
    }

    stepCounter++;

    const timestampData = {
      world_id: currentWorldId,
      save_id: currentSaveId,
      step_number: stepCounter,
      description: description || `第${stepCounter}步`,
      game_state: gameState
    };

    const result = await timestampsApi.create(timestampData);

    // 定期清理旧时间点（保留最近100个）
    if (stepCounter % 20 === 0) {
      try {
        await timestampsApi.cleanupOld(currentSaveId, 100);
      } catch (e) {
        // 静默失败
      }
    }

    return result.id;
  } catch (error) {
    // 数据库保存失败时静默跳过，不干扰游戏进行
    return null;
  }
};

// 获取某个存档的所有时间点
export const getTimestampsBySaveId = async (saveId) => {
  try {
    const available = await checkBackend();
    if (!available) return [];

    return await timestampsApi.getBySaveId(saveId);
  } catch (error) {
    console.error('Failed to get timestamps:', error);
    return [];
  }
};

// 获取当前世界的所有时间点
export const getCurrentWorldTimestamps = async () => {
  try {
    const available = await checkBackend();
    if (!available || !currentWorldId) return [];

    return await timestampsApi.getByWorldId(currentWorldId);
  } catch (error) {
    console.error('Failed to get current world timestamps:', error);
    return [];
  }
};

// 加载某个时间点
export const loadTimestamp = async (timestampId) => {
  try {
    const available = await checkBackend();
    if (!available) {
      throw new Error('后端不可用');
    }

    const timestamp = await timestampsApi.getById(timestampId);
    if (timestamp && timestamp.game_state) {
      return timestamp.game_state;
    }
    throw new Error('时间点数据无效');
  } catch (error) {
    console.error('Failed to load timestamp:', error);
    throw error;
  }
};

// 从某个时间点分叉（创建新存档）
export const forkFromTimestamp = async (timestampId, newSaveName) => {
  try {
    const available = await checkBackend();
    if (!available) {
      throw new Error('后端不可用');
    }

    const timestamp = await timestampsApi.getById(timestampId);
    if (!timestamp || !timestamp.game_state) {
      throw new Error('时间点数据无效');
    }

    // 保存为新存档
    const newSaveId = await saveGameToDatabase(timestamp.game_state, newSaveName);
    if (!newSaveId) {
      throw new Error('创建新存档失败');
    }

    // 复制该时间点之前的所有时间点到新存档
    const allTimestamps = await timestampsApi.getBySaveId(timestamp.save_id);
    const timestampsToCopy = allTimestamps.filter(t => t.id <= timestampId);

    if (timestampsToCopy.length > 0) {
      const newTimestamps = timestampsToCopy.map(t => ({
        ...t,
        save_id: newSaveId,
        id: undefined // 让数据库自动生成新ID
      }));
      await timestampsApi.createBatch(newTimestamps);
    }

    // 更新当前存档ID和步数
    currentSaveId = newSaveId;
    stepCounter = timestampsToCopy.length;

    return {
      saveId: newSaveId,
      gameState: timestamp.game_state
    };
  } catch (error) {
    console.error('Failed to fork from timestamp:', error);
    throw error;
  }
};

// ===== 多世界切换功能 =====

// 当前世界状态缓存
const worldStateCache = new Map();

// 保存当前世界状态到缓存
export const saveCurrentWorldToCache = (worldId, gameState) => {
  if (worldId) {
    worldStateCache.set(worldId, {
      gameState,
      savedAt: Date.now()
    });
  }
};

// 从缓存获取世界状态
export const getWorldFromCache = (worldId) => {
  const cached = worldStateCache.get(worldId);
  if (cached) {
    return cached.gameState;
  }
  return null;
};

// 切换到另一个世界
export const switchToWorld = async (worldId) => {
  try {
    const available = await checkBackend();
    if (!available) {
      throw new Error('后端不可用');
    }

    // 先从缓存查找
    let gameState = getWorldFromCache(worldId);
    if (gameState) {
      setCurrentWorldId(worldId);
      // 查找该世界的最新存档以获取saveId
      const saves = await savesApi.getByWorldId(worldId);
      if (saves.length > 0) {
        currentSaveId = saves[0].id;
        // 获取时间点数据
        const timestamps = await getTimestampsBySaveId(currentSaveId);
        if (timestamps.length > 0) {
          stepCounter = timestamps[timestamps.length - 1].step_number || 0;
        }
      }
      return gameState;
    }

    // 从数据库获取该世界的最新存档
    const saves = await savesApi.getByWorldId(worldId);
    if (saves.length === 0) {
      throw new Error('该世界没有存档');
    }

    const latestSave = saves[0];
    gameState = latestSave.game_state;

    // 更新当前状态
    setCurrentWorldId(worldId);
    currentSaveId = latestSave.id;

    // 获取时间点数据更新步数
    const timestamps = await getTimestampsBySaveId(currentSaveId);
    if (timestamps.length > 0) {
      stepCounter = timestamps[timestamps.length - 1].step_number || 0;
    }

    // 缓存该世界状态
    saveCurrentWorldToCache(worldId, gameState);

    return gameState;
  } catch (error) {
    console.error('Failed to switch world:', error);
    throw error;
  }
};

// 获取所有可用世界列表
export const getAllWorlds = async () => {
  try {
    const available = await checkBackend();
    if (!available) return [];

    return await worldsApi.getAll();
  } catch (error) {
    console.error('Failed to get worlds:', error);
    return [];
  }
};

