// API Service - Frontend calls backend proxy
// Backend URL - use relative path in production
const API_BASE = import.meta.env.VITE_API_URL || '';

export const getApiConfig = async () => {
  const response = await fetch(`${API_BASE}/api/ai/config`);
  if (!response.ok) {
    throw new Error('Failed to get API config');
  }
  return response.json();
};

export const updateApiConfig = async (updates) => {
  const response = await fetch(`${API_BASE}/api/ai/config`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ updates })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
};

export const generateWithAI = async (prompt, provider, options = {}) => {
  const response = await fetch(`${API_BASE}/api/ai/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prompt, provider, options })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  const data = await response.json();
  return data.result;
};

export const generateImage = async (prompt, size = '1:1') => {
  const response = await fetch(`${API_BASE}/api/ai/image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prompt, size })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  const data = await response.json();
  // 返回 URL 字符串而非对象
  return data.result?.url || data.result;
};

export const imageToImage = async (options) => {
  const {
    prompt,
    image_urls,
    aspect_ratio = '1:1',
    n = 1
  } = options;

  if (!prompt) {
    throw new Error('Prompt is required');
  }

  if (!image_urls || image_urls.length === 0) {
    throw new Error('image_urls is required');
  }

  const response = await fetch(`${API_BASE}/api/ai/image-to-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt,
      image_urls,
      aspect_ratio,
      n
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  const data = await response.json();
  // 返回 URL 字符串而非对象
  return data.result?.url || data.result;
};

// 上传图片到图床（通过后端）
export const uploadImage = async (imageData) => {
  const response = await fetch(`${API_BASE}/api/ai/upload-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ image_data: imageData })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || `Upload error: ${response.status}`);
  }

  const data = await response.json();
  return data.url;
};

// 批量生成角色（后端异步处理）
export const batchGenerateCharacters = async (worldId, count, prompt, autoGenerateImages) => {
  const response = await fetch(`${API_BASE}/api/ai/batch-generate-characters`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      world_id: worldId,
      count,
      prompt,
      auto_generate_images: autoGenerateImages
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Batch generation failed' }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
};

// 批量生成场景（后端异步处理）
export const batchGenerateScenes = async (worldId, count, prompt, autoGenerateImages) => {
  const response = await fetch(`${API_BASE}/api/ai/batch-generate-scenes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      world_id: worldId,
      count,
      prompt,
      auto_generate_images: autoGenerateImages
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Batch generation failed' }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
};

// 补充懒加载角色详情
export const expandCharacter = async (characterId) => {
  const response = await fetch(`${API_BASE}/api/ai/expand-character`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ character_id: characterId })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Expand failed' }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
};

// 生成世界地图（Mermaid流程图）
export const generateWorldMap = async (worldId, prompt) => {
  const response = await fetch(`${API_BASE}/api/ai/generate-world-map`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      world_id: worldId,
      prompt
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Generate world map failed' }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
};

// 根据世界地图生成场景（懒加载）
export const generateScenesFromMap = async (worldId, worldMap, centerSceneId, autoGenerateImages) => {
  const response = await fetch(`${API_BASE}/api/ai/generate-scenes-from-map`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      world_id: worldId,
      world_map: worldMap,
      center_scene_id: centerSceneId,
      auto_generate_images: autoGenerateImages
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Generate scenes failed' }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
};

export default {
  getApiConfig,
  updateApiConfig,
  generateWithAI,
  generateImage,
  imageToImage,
  uploadImage,
  batchGenerateCharacters,
  batchGenerateScenes,
  expandCharacter,
  generateWorldMap,
  generateScenesFromMap
};
