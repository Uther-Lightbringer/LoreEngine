import config, { getFullProviderConfig, getDefaultProvider } from '../config.js';

// Token 限制常量
export const MAX_TOKENS = {
  DIALOGUE: 4096,
  CONTENT: 8192
};

// 生成文本的通用函数
export const generateWithAI = async (prompt, provider = 'deepseek', options = {}) => {
  const { maxTokens = null, jsonResponse = false, temperature = 0.8 } = options;

  let effectiveProvider = provider || getDefaultProvider();
  let providerConfig = getFullProviderConfig(effectiveProvider);

  // 如果请求的 provider 没有配置 key，尝试使用默认 provider
  if (!providerConfig?.apiKey && effectiveProvider !== getDefaultProvider()) {
    effectiveProvider = getDefaultProvider();
    providerConfig = getFullProviderConfig(effectiveProvider);
  }

  if (!providerConfig) {
    throw new Error('Unknown provider');
  }

  if (!providerConfig.apiKey) {
    throw new Error(`${effectiveProvider} API key not configured`);
  }

  const baseUrl = providerConfig.baseUrl.replace(/\/$/, '');

  if (effectiveProvider === 'anthropic') {
    // Anthropic API
    const body = {
      model: providerConfig.model,
      max_tokens: maxTokens || 1024,
      system: '你是一个创意写作助手，擅长生成世界观、角色和场景设定。请按照用户要求的JSON格式返回内容。',
      messages: [{ role: 'user', content: prompt }],
      temperature
    };

    const response = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': providerConfig.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${errorText}`);
    }

    const data = await response.json();
    return data.content[0].text;
  } else if (effectiveProvider === 'minimax') {
    // MiniMax API
    const body = {
      model: providerConfig.model,
      messages: [
        {
          role: 'system',
          name: 'MiniMax AI',
          content: '你是一个创意写作助手，擅长生成世界观、角色和场景设定。请按照用户要求的JSON格式返回内容。'
        },
        { role: 'user', name: '用户', content: prompt }
      ],
      temperature
    };

    if (maxTokens) {
      // MiniMax M2-her 模型最大支持 2048 tokens
      body.max_completion_tokens = Math.min(maxTokens, 2048);
    }

    const response = await fetch(`${baseUrl}/v1/text/chatcompletion_v2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${providerConfig.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MiniMax API error: ${errorText}`);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error(`MiniMax API 响应格式异常`);
    }

    return data.choices[0].message.content;
  } else {
    // OpenAI-compatible API (DeepSeek, OpenAI, Custom)
    const body = {
      model: providerConfig.model,
      messages: [
        {
          role: 'system',
          content: '你是一个创意写作助手，擅长生成世界观、角色和场景设定。请按照用户要求的JSON格式返回内容。'
        },
        { role: 'user', content: prompt }
      ],
      temperature
    };

    if (jsonResponse) {
      body.response_format = { type: 'json_object' };
    }

    if (maxTokens) {
      body.max_tokens = maxTokens;
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${providerConfig.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }
};

// 提取JSON的辅助函数
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

export default {
  generateWithAI,
  extractJSON,
  MAX_TOKENS
};
