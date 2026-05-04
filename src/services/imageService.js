// Image Service - Now calls backend proxy via apiService
import apiService from './apiService.js';

export const setImageConfig = (config) => {
  // 不再存储到 localStorage，配置由后端 .env 管理
  console.log('Image config updated (managed by backend)');
};

export const getImageConfigExport = () => {
  // 返回基本配置信息，不包含密钥
  return {
    apiKey: '',
    baseUrl: '',
    model: ''
  };
};

export const generateImage = async (prompt, size = '1:1') => {
  return apiService.generateImage(prompt, size);
};

export const imageToImage = async (options) => {
  return apiService.imageToImage(options);
};

export const uploadImage = async (imageData) => {
  return apiService.uploadImage(imageData);
};

// 轮询获取任务状态
const pollTaskStatus = async (taskId, onProgress, maxRetries = 60) => {
  const pollInterval = 2000;

  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(`/api/ai/image-to-image/poll/${taskId}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Poll failed' }));
      throw new Error(error.error || `Poll error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`[轮询] 第 ${i + 1} 次，状态:`, data.status, '进度:', data.progress);

    if (onProgress && data.progress !== undefined) {
      onProgress(data.progress, data.message || '');
    }

    if (data.status === 'completed') {
      console.log('[轮询] 任务完成!');
      console.log('[轮询] 返回结果:', JSON.stringify(data.result));
      return data.result;
    }

    if (data.status === 'failed') {
      throw new Error(data.error || 'Generation failed');
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Task timeout - please try again');
};

// 图生图 - 轮询版本
export const imageToImageWithProgress = async (options, onProgress) => {
  const { prompt, image_urls, aspect_ratio = '1:1', n = 1 } = options;

  if (!prompt) {
    throw new Error('Prompt is required');
  }

  if (!image_urls || image_urls.length === 0) {
    throw new Error('image_urls is required');
  }

  // 1. 提交任务获取 taskId
  const response = await fetch('/api/ai/image-to-image', {
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
  console.log('[图生图] 提交结果:', data);

  // 如果直接完成（同步模式）
  if (data.status === 'completed') {
    if (onProgress) onProgress(100, '完成');
    return data.result;
  }

  // 如果失败
  if (data.status === 'failed') {
    throw new Error(data.error || 'Generation failed');
  }

  // 2. 轮询获取结果
  if (data.taskId) {
    if (onProgress) onProgress(10, '任务已提交，开始生成...');
    return await pollTaskStatus(data.taskId, onProgress);
  }

  throw new Error('No taskId returned');
};
