// API 配置示例文件
// 复制此文件为 config.js 并填入你的 API keys
// config.js 会被 git 忽略，不会提交到仓库

export const AI_CONFIG = {
  // OpenAI 配置
  openai: {
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4'
  },

  // DeepSeek 配置
  deepseek: {
    apiKey: '',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat'
  },

  // Anthropic 配置
  anthropic: {
    apiKey: '',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-3-opus-20240229'
  },

  // 自定义 API 配置
  custom: {
    apiKey: '',
    baseUrl: '',
    model: ''
  }
};

// 图片生成 API 配置
export const IMAGE_CONFIG = {
  apiKey: '',
  baseUrl: 'https://api.evolink.ai',
  model: 'z-image-turbo'
};

// 默认使用的 AI 提供商
export const DEFAULT_PROVIDER = 'deepseek';
