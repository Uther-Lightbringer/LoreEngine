// Novel Service - Frontend calls backend for novel operations

const AUTH_TOKEN_KEY = 'auth_token';

// 获取认证 headers
const getAuthHeaders = () => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

// 上传小说
export const uploadNovel = async (file) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`/api/novels/upload`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders()
    },
    body: formData
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || 'Upload failed');
  }

  return response.json();
};

// 获取用户的所有小说
export const getNovels = async () => {
  const response = await fetch(`/api/novels`, {
    headers: { ...getAuthHeaders() }
  });
  if (!response.ok) {
    throw new Error('Failed to get novels');
  }
  return response.json();
};

// 获取单个小说详情
export const getNovel = async (novelId) => {
  const response = await fetch(`/api/novels/${novelId}`, {
    headers: { ...getAuthHeaders() }
  });
  if (!response.ok) {
    throw new Error('Failed to get novel');
  }
  return response.json();
};

// 获取章节详情
export const getChapter = async (novelId, chapterId) => {
  const response = await fetch(`/api/novels/${novelId}/chapter/${chapterId}`, {
    headers: { ...getAuthHeaders() }
  });
  if (!response.ok) {
    throw new Error('Failed to get chapter');
  }
  return response.json();
};

// 解析章节（触发AI解析）
export const parseChapter = async (novelId, chapterId) => {
  const response = await fetch(`/api/novels/${novelId}/chapter/${chapterId}/parse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({})
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Parse failed' }));
    throw new Error(error.error || 'Parse failed');
  }
  return response.json();
};

// AI续写分支
export const generateBranch = async (choicePointId, alternativeId, pathHistory, characterName) => {
  const response = await fetch(`/api/novels/generate-branch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({
      choicePointId,
      alternativeId,
      pathHistory,
      characterName
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Generation failed' }));
    throw new Error(error.error || 'Generation failed');
  }
  return response.json();
};

// 更新进度
export const updateProgress = async (novelId, chapterId, characterName, currentPosition, choices, completedBranches, unlockedCharacters) => {
  const response = await fetch(`/api/novels/progress`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({
      novelId,
      chapterId,
      characterName,
      currentPosition,
      choices,
      completedBranches,
      unlockedCharacters
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Update failed' }));
    throw new Error(error.error || 'Update failed');
  }
  return response.json();
};

// 获取进度
export const getProgress = async (novelId) => {
  const response = await fetch(`/api/novels/${novelId}/progress`, {
    headers: { ...getAuthHeaders() }
  });
  if (!response.ok) {
    throw new Error('Failed to get progress');
  }
  return response.json();
};

// 删除小说
export const deleteNovel = async (novelId) => {
  const response = await fetch(`/api/novels/${novelId}`, {
    method: 'DELETE',
    headers: { ...getAuthHeaders() }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Delete failed' }));
    throw new Error(error.error || 'Delete failed');
  }
  return response.json();
};

// 获取叙事状态
export const getNarrativeState = async (novelId) => {
  const response = await fetch(`/api/novels/narrative-state/${novelId}`, {
    headers: { ...getAuthHeaders() }
  });
  if (!response.ok) {
    throw new Error('Failed to get narrative state');
  }
  return response.json();
};

// 保存叙事快照
export const saveNarrativeSnapshot = async (novelId, chapterId, snapshotData, adaptationLevel = 'light') => {
  const response = await fetch(`/api/novels/narrative-snapshot`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({
      novelId,
      chapterId,
      snapshotData,
      adaptationLevel
    })
  });
  if (!response.ok) {
    throw new Error('Failed to save narrative snapshot');
  }
  return response.json();
};

// 获取所有叙事快照
export const getNarrativeSnapshots = async (novelId) => {
  const response = await fetch(`/api/novels/narrative-snapshots/${novelId}`, {
    headers: { ...getAuthHeaders() }
  });
  if (!response.ok) {
    throw new Error('Failed to get narrative snapshots');
  }
  return response.json();
};

// 改编章节内容
export const adaptChapter = async (novelId, chapterId, characterName, adaptationLevel) => {
  const response = await fetch(`/api/novels/adapt-chapter`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({
      novelId,
      chapterId,
      characterName,
      adaptationLevel
    })
  });
  if (!response.ok) {
    throw new Error('Failed to adapt chapter');
  }
  return response.json();
};

export default {
  uploadNovel,
  getNovels,
  getNovel,
  getChapter,
  parseChapter,
  generateBranch,
  updateProgress,
  getProgress,
  deleteNovel,
  getNarrativeState,
  saveNarrativeSnapshot,
  getNarrativeSnapshots,
  adaptChapter
};
