const API_BASE = import.meta.env.VITE_API_URL || '/api';
const AUTH_TOKEN_KEY = 'auth_token';

// 通用请求函数
const request = async (endpoint, options = {}) => {
  try {
    const url = `${API_BASE}${endpoint}`;
    const token = localStorage.getItem(AUTH_TOKEN_KEY);

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      headers,
      ...options,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    // API请求失败时静默处理，不显示控制台错误
    // 游戏完全可以在没有后端数据库的情况下运行
    throw error;
  }
};

// 检查后端是否可用
const checkBackendStatus = async () => {
  try {
    const response = await fetch(`${API_BASE}/health`);
    return response.ok;
  } catch {
    return false;
  }
};

// ===== 世界观 API =====
const worldsApi = {
  // 获取所有世界观
  getAll: async () => request('/worlds'),

  // 根据ID获取世界观
  getById: async (id) => request(`/worlds/${id}`),

  // 根据名称获取世界观
  getByName: async (name) => request(`/worlds/name/${encodeURIComponent(name)}`),

  // 创建或更新世界观
  save: async (world) => request('/worlds', {
    method: 'POST',
    body: JSON.stringify(world),
  }),

  // 按ID更新世界观（不走 Upsert by name）
  update: async (id, data) => request(`/worlds/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),

  // 删除世界观
  delete: async (id) => request(`/worlds/${id}`, {
    method: 'DELETE',
  }),
};

// ===== 存档 API =====
const savesApi = {
  // 获取所有存档
  getAll: async () => request('/saves'),

  // 获取当前用户的草稿列表
  getDrafts: async () => request('/saves/drafts'),

  // 根据ID获取存档
  getById: async (id) => request(`/saves/${id}`),

  // 获取某个世界观的所有存档
  getByWorldId: async (worldId) => request(`/saves/world/${worldId}`),

  // 创建新存档
  create: async (saveData) => request('/saves', {
    method: 'POST',
    body: JSON.stringify(saveData),
  }),

  // 更新存档
  update: async (id, gameState) => request(`/saves/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ game_state: gameState }),
  }),

  // 更新存档（同时更新 save_type）
  updateWithSaveType: async (id, gameState, saveType) => request(`/saves/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ game_state: gameState, save_type: saveType }),
  }),

  // 删除存档
  delete: async (id) => request(`/saves/${id}`, {
    method: 'DELETE',
  }),
};

// ===== 图片 API =====
const imagesApi = {
  // 获取所有图片
  getAll: async () => request('/images'),

  // 根据ID获取图片
  getById: async (id) => request(`/images/${id}`),

  // 获取某个世界观的所有图片
  getByWorldId: async (worldId) => request(`/images/world/${worldId}`),

  // 根据类型获取图片
  getByType: async (imageType, worldId = null) => {
    const query = worldId ? `?worldId=${worldId}` : '';
    return request(`/images/type/${imageType}${query}`);
  },

  // 保存图片
  save: async (imageData) => request('/images', {
    method: 'POST',
    body: JSON.stringify(imageData),
  }),

  // 删除图片
  delete: async (id) => request(`/images/${id}`, {
    method: 'DELETE',
  }),
};

// ===== 角色 API =====
const charactersApi = {
  // 获取所有角色
  getAll: async () => request('/characters'),

  // 根据ID获取角色
  getById: async (id) => request(`/characters/${id}`),

  // 获取某个世界观的所有角色
  getByWorldId: async (worldId) => request(`/characters/world/${worldId}`),

  // 保存角色
  save: async (character) => request('/characters', {
    method: 'POST',
    body: JSON.stringify(character),
  }),

  // 删除角色
  delete: async (id) => request(`/characters/${id}`, {
    method: 'DELETE',
  }),
};

// ===== 时间点 API =====
const timestampsApi = {
  // 获取某个存档的所有时间点
  getBySaveId: async (saveId) => request(`/timestamps/save/${saveId}`),

  // 获取某个世界观的所有时间点
  getByWorldId: async (worldId) => request(`/timestamps/world/${worldId}`),

  // 根据ID获取时间点
  getById: async (id) => request(`/timestamps/${id}`),

  // 创建新时间点
  create: async (timestampData) => request('/timestamps', {
    method: 'POST',
    body: JSON.stringify(timestampData),
  }),

  // 批量创建时间点
  createBatch: async (timestamps) => request('/timestamps/batch', {
    method: 'POST',
    body: JSON.stringify({ timestamps }),
  }),

  // 删除时间点
  delete: async (id) => request(`/timestamps/${id}`, {
    method: 'DELETE',
  }),

  // 删除某个存档的旧时间点（保留最近N个）
  cleanupOld: async (saveId, keepCount = 50) =>
    request(`/timestamps/save/${saveId}/keep-last?keep=${keepCount}`, {
      method: 'DELETE',
    }),
};

// 导出所有 API
export {
  checkBackendStatus,
  worldsApi,
  savesApi,
  imagesApi,
  charactersApi,
  timestampsApi,
};

export default {
  checkBackendStatus,
  worlds: worldsApi,
  saves: savesApi,
  images: imagesApi,
  characters: charactersApi,
  timestamps: timestampsApi,
};
