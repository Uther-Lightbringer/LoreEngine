// AI Service - Now calls backend proxy via apiService
import apiService from './apiService.js';

export const extractJSON = (text) => {
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch (e) {
      console.error('Failed to parse JSON object:', e);
    }
  }

  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]);
    } catch (e) {
      console.error('Failed to parse JSON array:', e);
    }
  }

  return null;
};

// Token 限制常量
export const MAX_TOKENS = {
  DIALOGUE: 4096,
  CONTENT: 8192
};

export const setProviderConfig = (provider, config) => {
  // 不再存储到 localStorage，配置由后端 .env 管理
  console.log(`Provider ${provider} config updated (managed by backend)`);
};

export const getProviderConfigExport = (provider) => {
  // 返回基本配置信息，不包含密钥
  return {
    apiKey: '',
    baseUrl: '',
    model: ''
  };
};

export const generateWithAI = async (prompt, provider = 'deepseek', options = {}) => {
  // options: { maxTokens?: number, jsonResponse?: boolean, temperature?: number }
  if (typeof options === 'number') {
    options = { maxTokens: options };
  }
  const { maxTokens = null, jsonResponse = false, temperature = 0.8 } = options;

  try {
    const response = await apiService.generateWithAI(prompt, provider, {
      maxTokens,
      jsonResponse,
      temperature
    });
    return extractJSON(response) || response;
  } catch (error) {
    console.error('AI generation failed:', error);
    throw error;
  }
};

export const callOpenAICompatible = async (prompt, provider = 'deepseek', options = {}) => {
  // 直接调用 generateWithAI
  return generateWithAI(prompt, provider, options);
};

export const callAnthropic = async (prompt, options = {}) => {
  // 直接调用 generateWithAI
  return generateWithAI(prompt, 'anthropic', options);
};
