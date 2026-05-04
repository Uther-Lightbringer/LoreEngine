import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// 加载环境变量
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 尝试多个可能的 .env 路径
const possibleEnvPaths = [
  path.join(__dirname, '.env'),
  path.join(process.cwd(), '.env'),
  '/app/server/.env'
];

let envPath = null;
for (const p of possibleEnvPaths) {
  try {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      envPath = p;
      break;
    }
  } catch (e) {
    // continue
  }
}

// 如果都没找到，使用第一个路径（兼容旧逻辑）
if (!envPath) {
  envPath = possibleEnvPaths[0];
}

dotenv.config({ path: envPath });

// 获取正确的 .env 路径
const getEnvPath = () => {
  const possibleEnvPaths = [
    path.join(__dirname, '.env'),
    path.join(process.cwd(), '.env'),
    '/app/server/.env'
  ];

  for (const p of possibleEnvPaths) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        return p;
      }
    } catch (e) {
      // continue
    }
  }
  return possibleEnvPaths[0];
};

// Provider configurations
const PROVIDERS = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.OPENAI_MODEL || 'gpt-4'
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat'
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1',
    model: process.env.ANTHROPIC_MODEL || 'claude-3-opus-20240229'
  },
  minimax: {
    apiKey: process.env.MINIMAX_API_KEY || '',
    baseUrl: process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com',
    model: process.env.MINIMAX_MODEL || 'M2-her'
  },
  custom: {
    apiKey: process.env.CUSTOM_API_KEY || '',
    baseUrl: process.env.CUSTOM_BASE_URL || '',
    model: process.env.CUSTOM_MODEL || ''
  }
};

const imageConfig = {
  apiKey: process.env.IMAGE_API_KEY || '',
  baseUrl: process.env.IMAGE_BASE_URL || 'https://api.evolink.ai',
  model: process.env.IMAGE_MODEL || 'z-image-turbo'
};

const imageToImageConfig = {
  apiKey: process.env.EVOLINKITOI_API_KEY || '',
  baseUrl: process.env.EVOLINKITOI_BASE_URL || 'https://api.evolink.ai',
  model: process.env.EVOLINKITOI_MODEL || 'doubao-seedream-5.0-lite'
};

const defaultProvider = process.env.DEFAULT_PROVIDER || 'deepseek';

// 获取 provider 配置（不含密钥）
export const getProviderConfigStatus = (provider) => {
  const config = PROVIDERS[provider];
  if (!config) return null;
  return {
    configured: !!config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model
  };
};

// 获取所有 provider 配置状态
export const getAllProviderStatus = () => {
  const status = {};
  for (const [key, config] of Object.entries(PROVIDERS)) {
    status[key] = {
      configured: !!config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model
    };
  }
  return status;
};

// 获取完整配置（包含密钥）- 仅供内部路由使用
export const getFullProviderConfig = (provider) => {
  return PROVIDERS[provider] || null;
};

// 获取图像配置
export const getImageConfig = () => {
  return { ...imageConfig };
};

// 获取图生图配置
export const getImageToImageConfig = () => {
  return { ...imageToImageConfig };
};

// 获取默认 provider - 每次都从 process.env 读取，确保返回最新值
export const getDefaultProvider = () => process.env.DEFAULT_PROVIDER || 'deepseek';

// 更新 .env 配置
export const updateEnvConfig = (updates) => {
  try {
    const currentEnvPath = getEnvPath();
    let envContent = '';
    // 确保 .env 是文件而不是目录
    if (fs.existsSync(currentEnvPath) && fs.statSync(currentEnvPath).isFile()) {
      envContent = fs.readFileSync(currentEnvPath, 'utf-8');
    }

    const lines = envContent.split('\n');
    const envMap = {};

    // 解析现有配置
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const idx = trimmed.indexOf('=');
        if (idx > 0) {
          const key = trimmed.substring(0, idx).trim();
          const value = trimmed.substring(idx + 1).trim();
          envMap[key] = value;
        }
      }
    }

    // 应用更新
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && value !== null && value !== '') {
        envMap[key] = value;
      }
    }

    // 生成新的 env 内容
    const newLines = [];
    for (const [key, value] of Object.entries(envMap)) {
      newLines.push(`${key}=${value}`);
    }

    fs.writeFileSync(currentEnvPath, newLines.join('\n') + '\n', 'utf-8');

    // 重新加载配置
    dotenv.config({ path: currentEnvPath, override: true });

    // 更新内存中的配置
    for (const [key, value] of Object.entries(envMap)) {
      if (key.startsWith('OPENAI_')) {
        const p = key.replace('OPENAI_', '').toLowerCase();
        const propMap = { api_key: 'apiKey', base_url: 'baseUrl', model: 'model' };
        if (propMap[p] && PROVIDERS.openai[propMap[p]]) PROVIDERS.openai[propMap[p]] = value;
      } else if (key.startsWith('DEEPSEEK_')) {
        const p = key.replace('DEEPSEEK_', '').toLowerCase();
        const propMap = { api_key: 'apiKey', base_url: 'baseUrl', model: 'model' };
        if (propMap[p] && PROVIDERS.deepseek[propMap[p]]) PROVIDERS.deepseek[propMap[p]] = value;
      } else if (key.startsWith('ANTHROPIC_')) {
        const p = key.replace('ANTHROPIC_', '').toLowerCase();
        const propMap = { api_key: 'apiKey', base_url: 'baseUrl', model: 'model' };
        if (propMap[p] && PROVIDERS.anthropic[propMap[p]]) PROVIDERS.anthropic[propMap[p]] = value;
      } else if (key.startsWith('MINIMAX_')) {
        const p = key.replace('MINIMAX_', '').toLowerCase();
        const propMap = { api_key: 'apiKey', base_url: 'baseUrl', model: 'model' };
        if (propMap[p] && PROVIDERS.minimax[propMap[p]]) PROVIDERS.minimax[propMap[p]] = value;
      } else if (key.startsWith('CUSTOM_')) {
        const p = key.replace('CUSTOM_', '').toLowerCase();
        const propMap = { api_key: 'apiKey', base_url: 'baseUrl', model: 'model' };
        if (propMap[p] && PROVIDERS.custom[propMap[p]]) PROVIDERS.custom[propMap[p]] = value;
      } else if (key === 'IMAGE_API_KEY') {
        imageConfig.apiKey = value;
      } else if (key === 'IMAGE_BASE_URL') {
        imageConfig.baseUrl = value;
      } else if (key === 'IMAGE_MODEL') {
        imageConfig.model = value;
      } else if (key === 'EVOLINKITOI_API_KEY') {
        imageToImageConfig.apiKey = value;
      } else if (key === 'EVOLINKITOI_BASE_URL') {
        imageToImageConfig.baseUrl = value;
      } else if (key === 'EVOLINKITOI_MODEL') {
        imageToImageConfig.model = value;
      } else if (key === 'DEFAULT_PROVIDER') {
        process.env.DEFAULT_PROVIDER = value;
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating env config:', error);
    return { success: false, error: error.message };
  }
};

export default {
  getProviderConfigStatus,
  getAllProviderStatus,
  getFullProviderConfig,
  getImageConfig,
  getImageToImageConfig,
  getDefaultProvider,
  updateEnvConfig
};
