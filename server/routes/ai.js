import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import config, { getAllProviderStatus, getFullProviderConfig, getImageConfig, getImageToImageConfig, getDefaultProvider, updateEnvConfig } from '../config.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import db from '../database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// 图片缓存目录配置
console.log('[ai.js] __dirname:', __dirname);
const getCacheDir = () => {
  // Docker 环境
  if (process.env.NODE_ENV === 'production') {
    return '/app/server/CacheImages';
  }
  // 本地环境：统一使用 E:\WorkSpace\rpgTmp\CacheImages
  // __dirname = E:\WorkSpace\rpgTmp\rpgTmp\server\routes，需要往上3级
  const result = path.resolve(__dirname, '..', '..', '..', 'CacheImages');
  console.log('[ai.js] getCacheDir result:', result);
  return result;
};

// 确保缓存目录存在
const ensureCacheDir = () => {
  const cacheDir = getCacheDir();
  console.log(`[缓存目录] 缓存目录路径: ${cacheDir}`);
  console.log(`[缓存目录] 目录是否存在: ${fs.existsSync(cacheDir)}`);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    console.log(`[缓存目录] 目录已创建`);
  }
  return cacheDir;
};

// 下载并缓存图片，返回本地URL和原始URL
const cacheImageFromUrl = async (imageUrl) => {
  const cacheDir = ensureCacheDir();

  // 从URL中提取文件扩展名
  let ext = '.png';
  try {
    const urlObj = new URL(imageUrl);
    const pathname = urlObj.pathname;
    const match = pathname.match(/\.(png|jpg|jpeg|webp|gif|bmp)$/i);
    if (match) {
      ext = match[0].toLowerCase();
    }
  } catch (e) {
    // URL解析失败，使用默认扩展名
    const match = imageUrl.match(/\.(png|jpg|jpeg|webp|gif|bmp)$/i);
    if (match) {
      ext = match[0].toLowerCase();
    }
  }

  const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`;
  const filePath = path.join(cacheDir, filename);

  console.log(`[缓存] 提取的文件扩展名: ${ext}`);
  console.log(`[缓存] 生成的文件名: ${filename}`);
  console.log(`[缓存] 完整的保存路径: ${filePath}`);

  console.log(`[缓存] 缓存目录: ${cacheDir}`);
  console.log(`[缓存] 保存文件路径: ${filePath}`);
  console.log(`[缓存] 开始下载图片: ${imageUrl}`);

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(buffer));

    console.log(`[缓存] 图片已保存: ${filePath}`);
    console.log(`[缓存] 文件大小: ${fs.statSync(filePath).size} bytes`);

    // 返回本地缓存 URL（相对路径）和原始URL
    return {
      localUrl: `/cache-images/${filename}`,
      originalUrl: imageUrl
    };
  } catch (err) {
    console.error(`[缓存] 下载失败: ${err.message}`);
    // 如果缓存失败，返回原始URL而不是抛出异常
    return {
      localUrl: imageUrl,
      originalUrl: imageUrl
    };
  }
};

// 上传图片到图床
const IMAGE_BED_URL = process.env.IMAGE_BED_URL || '';

const uploadToImageBed = async (fileBuffer, filename, mimeType) => {
  const formData = new FormData();
  const blob = new Blob([fileBuffer], { type: mimeType });
  formData.append('file', blob, filename);

  console.log(`[上传] 开始上传图片到图床: ${IMAGE_BED_URL}`);

  const response = await fetch(`${IMAGE_BED_URL}/upload`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Failed to upload to image bed: ${response.status}`);
  }

  const data = await response.json();
  console.log(`[上传] 图床返回:`, data);

  // 确保返回的是字符串 URL
  let returnUrl;
  if (typeof data.url === 'string' && data.url.length > 0) {
    returnUrl = data.url;
  } else if (typeof data.url === 'object' && data.url !== null) {
    // 如果是对象，尝试提取 URL
    console.log(`[上传] 图床返回的 url 是对象:`, data.url);
    returnUrl = `${IMAGE_BED_URL}/uploads/${filename}`;
  } else {
    returnUrl = `${IMAGE_BED_URL}/uploads/${filename}`;
  }
  console.log(`[上传] 返回URL: ${returnUrl}`);

  return returnUrl;
};

// 从 URL 下载图片并上传到图床
const uploadToImageBedFromUrl = async (localUrl, filename) => {
  // 构造完整的下载 URL
  const SERVER_HOST = process.env.NODE_ENV === 'production'
    ? 'http://localhost'
    : 'http://localhost:29999';

  const fullUrl = localUrl.startsWith('http') ? localUrl : `${SERVER_HOST}${localUrl}`;

  console.log(`[图床] 从 URL 下载图片: ${fullUrl}`);

  const response = await fetch(fullUrl);
  if (!response.ok) {
    throw new Error(`下载图片失败: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();

  // 确定 MIME 类型
  let mimeType = 'image/png';
  if (localUrl.includes('.webp')) mimeType = 'image/webp';
  else if (localUrl.includes('.jpg') || localUrl.includes('.jpeg')) mimeType = 'image/jpeg';

  // 上传到图床
  return await uploadToImageBed(Buffer.from(buffer), filename, mimeType);
};

// 获取配置状态（不含密钥）
router.get('/config', (req, res) => {
  try {
    const status = getAllProviderStatus();
    const imageStatus = {
      configured: !!getImageConfig().apiKey,
      baseUrl: getImageConfig().baseUrl,
      model: getImageConfig().model
    };
    const imageToImageStatus = {
      configured: !!getImageToImageConfig().apiKey,
      baseUrl: getImageToImageConfig().baseUrl,
      model: getImageToImageConfig().model
    };
    res.json({
      ...status,
      image: imageStatus,
      imageToImage: imageToImageStatus,
      defaultProvider: getDefaultProvider()
    });
  } catch (error) {
    console.error('Error getting config:', error);
    res.status(500).json({ error: 'Failed to get config' });
  }
});

// 上传图片并返回 URL（用于图生图）- 上传到图床
router.post('/upload-image', async (req, res) => {
  try {
    const { image_data } = req.body;

    if (!image_data) {
      return res.status(400).json({ error: 'image_data is required' });
    }

    // 解析 base64 数据
    const matches = image_data.match(/^data:(.+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ error: 'Invalid base64 format' });
    }

    const mimeType = matches[1];
    const base64Data = matches[2];

    // 验证图片格式
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/gif'];
    if (!allowedTypes.includes(mimeType)) {
      return res.status(400).json({ error: 'Unsupported image format' });
    }

    // 生成唯一文件名
    const ext = mimeType.split('/')[1] === 'jpeg' ? 'jpg' : mimeType.split('/')[1];
    const uniqueFilename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

    // 上传到图床
    const imageUrl = await uploadToImageBed(Buffer.from(base64Data, 'base64'), uniqueFilename, mimeType);

    res.json({ url: imageUrl, filename: uniqueFilename });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: error.message || 'Failed to upload image' });
  }
});

// 更新配置（管理员）
router.post('/config', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { updates } = req.body;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Invalid updates object' });
    }
    const result = updateEnvConfig(updates);
    if (result.success) {
      res.json({ success: true, message: 'Configuration updated' });
    } else {
      res.status(500).json({ error: result.error || 'Failed to update config' });
    }
  } catch (error) {
    console.error('Error updating config:', error);
    res.status(500).json({ error: 'Failed to update config' });
  }
});

// 文生文 API
router.post('/generate', async (req, res) => {
  try {
    const { prompt, provider, options = {} } = req.body;
    const { maxTokens = null, jsonResponse = false, temperature = 0.8 } = options;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // 确定使用的 provider：优先使用请求的，如果没配置则使用默认 provider
    let effectiveProvider = provider || getDefaultProvider();
    let providerConfig = getFullProviderConfig(effectiveProvider);

    // 如果请求的 provider 没有配置 key，尝试使用默认 provider
    if (!providerConfig?.apiKey && effectiveProvider !== getDefaultProvider()) {
      effectiveProvider = getDefaultProvider();
      providerConfig = getFullProviderConfig(effectiveProvider);
    }

    if (!providerConfig) {
      return res.status(400).json({ error: 'Unknown provider' });
    }

    if (!providerConfig.apiKey) {
      return res.status(400).json({ error: `${effectiveProvider} API key not configured` });
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
        return res.status(response.status).json({ error: `Anthropic API error: ${errorText}` });
      }

      const data = await response.json();
      return res.json({ result: data.content[0].text });
    } else if (effectiveProvider === 'minimax') {
      // MiniMax API
      console.log('[MiniMax] Request:', { baseUrl, model: providerConfig.model });
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
        return res.status(response.status).json({ error: `MiniMax API error: ${errorText}` });
      }

      const data = await response.json();
      console.log('[MiniMax] Response:', JSON.stringify(data));

      // MiniMax API 响应格式检查
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        console.error('[MiniMax] Unexpected response format:', data);
        return res.status(500).json({ error: `MiniMax API 响应格式异常: ${JSON.stringify(data)}` });
      }

      return res.json({ result: data.choices[0].message.content });
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
        return res.status(response.status).json({ error: `API error: ${errorText}` });
      }

      const data = await response.json();
      return res.json({ result: data.choices[0].message.content });
    }
  } catch (error) {
    console.error('Error in /generate:', error);
    res.status(500).json({ error: error.message || 'Generation failed' });
  }
});

// ===== 批量生成角色 API（懒加载）=====
router.post('/batch-generate-characters', async (req, res) => {
  try {
    const { world_id, count = 3, prompt, auto_generate_images = true } = req.body;

    if (!world_id) {
      return res.status(400).json({ error: 'world_id is required' });
    }

    // 获取世界观信息
    const world = db.prepare('SELECT * FROM worlds WHERE id = ?').get(world_id);
    if (!world) {
      return res.status(404).json({ error: 'World not found' });
    }

    // 获取 AI 配置
    const providerConfig = getFullProviderConfig('deepseek');
    if (!providerConfig?.apiKey) {
      return res.status(400).json({ error: 'Deepseek API key not configured' });
    }

    const baseUrl = providerConfig.baseUrl.replace(/\/$/, '');

    // 懒加载策略：超过5个角色时，5个完整生成，其余只生成名字和性别
    const FULL_COUNT = 5;
    const isLazy = count > FULL_COUNT;
    const fullCount = isLazy ? FULL_COUNT : count;
    const lazyCount = count - fullCount;

    console.log(`[批量生成角色] 总数: ${count}, 完整生成: ${fullCount}, 懒加载: ${lazyCount}`);

    // ========== 第一步：一次性生成所有角色的名字、性别和面部特征 ==========
    const namesAndOverviewsPrompt = `世界观：${world.name || '未设定'}
${world.description || ''}

请生成 ${count} 个独特的角色名字、性别和面部特征。

【要求】
1. 每个角色需要有：name（名字）、gender（性别：男或女）、faceFeature（面部特征描述，10-20字）
2. 名字要符合世界观风格，2-4个汉字
3. 面部特征要独特且具体，如"左眉上方有颗痣"、"笑起来有酒窝"等
4. 性别比例尽量均衡

请直接返回JSON数组格式，不要包含任何其他文字：
[
  { "name": "角色名", "gender": "男/女", "faceFeature": "面部特征描述" },
  ...
]`;

    console.log(`[批量生成角色] 第一步：生成 ${count} 个角色的名字和面部特征`);
    const namesResponse = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${providerConfig.apiKey}`
      },
      body: JSON.stringify({
        model: providerConfig.model,
        messages: [
          {
            role: 'system',
            content: '你是一个创意写作助手，擅长生成独特的角色设定。请严格按照用户要求的JSON格式返回内容。'
          },
          { role: 'user', content: namesAndOverviewsPrompt }
        ],
        temperature: 0.9,
        max_tokens: 3000
      })
    });

    if (!namesResponse.ok) {
      const errorText = await namesResponse.text();
      throw new Error(`Deepseek API error: ${errorText}`);
    }

    const namesData = await namesResponse.json();
    let namesContent = namesData.choices[0].message.content;
    let namesJsonStr = namesContent.trim();
    if (namesJsonStr.startsWith('```')) {
      namesJsonStr = namesJsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    }

    let namesAndFeatures = JSON.parse(namesJsonStr);
    if (!Array.isArray(namesAndFeatures)) {
      namesAndFeatures = [];
    }

    // 确保有足够的名字
    while (namesAndFeatures.length < count) {
      namesAndFeatures.push({
        name: `角色${namesAndFeatures.length + 1}`,
        gender: namesAndFeatures.length % 2 === 0 ? '女' : '男',
        faceFeature: '面容普通'
      });
    }
    console.log(`[批量生成角色] 已生成 ${namesAndFeatures.length} 个角色名字和面部特征`);

    // ========== 第二步：并行生成完整角色详情 ==========
    const buildFullPromptWithName = (charInfo, index) => {
      return `世界观：${world.name || '未设定'}
${world.description || ''}

角色名字：${charInfo.name}
性别：${charInfo.gender}
独特面部特征：${charInfo.faceFeature}

请根据以上信息生成第 ${index + 1} 个角色的完整设定，严格按照下方的JSON模板返回结果。

【重要要求】
1. 必须严格按照下方JSON模板格式返回，不要添加或删除任何字段
2. 所有字段都必须填写，不能省略任何字段，不能有空字符串
3. personalityTraits 的四个数值必须在 0-100 之间
4. selfAwareness 数值必须在 0-100 之间
5. physicalAppearance 的所有子字段都必须填写具体内容
6. expression 的所有子字段都必须填写
7. facialDetails 必须包含上述独特面部特征
8. 只返回纯JSON，不要包含任何其他文字说明

【单个角色的JSON模板】
{
  "name": "${charInfo.name}",
  "age": "年龄（如：25岁、17岁）",
  "gender": "${charInfo.gender}",
  "personality": "性格描述（100-150字）",
  "appearance": "外貌整体描述（150-200字），包含独特面部特征",
  "personalityTraits": {
    "extroversion": 50,
    "rationality": 50,
    "orderliness": 50,
    "optimism": 50
  },
  "selfAwareness": 50,
  "physicalAppearance": {
    "hairStyle": "发型（如：长直发、短卷发、马尾）",
    "hairColor": "发色（如：黑色、金色、银色）",
    "eyeColor": "瞳色（如：蓝色、琥珀色、绿色）",
    "bodyType": "体型（如：高挑、娇小、匀称）",
    "clothing": "穿着描述"
  },
  "expression": {
    "currentExpression": "自然",
    "expressionIntensity": "平静",
    "facialDetails": "${charInfo.faceFeature}"
  }
}

请直接返回JSON，不要添加任何其他文字。`;
    };

    // 并行生成完整角色
    console.log(`[批量生成角色] 第二步：并行生成 ${fullCount} 个完整角色详情`);
    const fullPromises = namesAndFeatures.slice(0, fullCount).map((charInfo, i) => {
      return (async () => {
        const body = {
          model: providerConfig.model,
          messages: [
            {
              role: 'system',
              content: '你是一个创意写作助手，擅长生成世界观、角色和场景设定。请按照用户要求的JSON格式返回内容。'
            },
            { role: 'user', content: buildFullPromptWithName(charInfo, i) }
          ],
          temperature: 0.8,
          max_tokens: 4000
        };

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
          throw new Error(`Deepseek API error: ${errorText}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;

        let jsonStr = content.trim();
        if (jsonStr.startsWith('```')) {
          jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        }

        const result = JSON.parse(jsonStr);
        // 确保名字和面部特征不被覆盖
        result.name = charInfo.name;
        result.gender = charInfo.gender;
        if (result.expression) {
          result.expression.facialDetails = charInfo.faceFeature;
        }
        return result;
      })();
    });

    // 并行生成懒加载角色（只名字和性别）
    const lazyPromises = namesAndFeatures.slice(fullCount, fullCount + lazyCount).map((charInfo, i) => {
      return (async () => {
        return {
          name: charInfo.name,
          gender: charInfo.gender,
          faceFeature: charInfo.faceFeature
        };
      })();
    });

    // 等待所有生成完成
    const [fullCharactersData, lazyCharactersData] = await Promise.all([
      Promise.all(fullPromises),
      Promise.all(lazyPromises)
    ]);

    console.log(`[批量生成角色] 完整角色: ${fullCharactersData.length}, 懒加载角色: ${lazyCharactersData.length}`);

    // 合并结果
    const allCharactersData = [...fullCharactersData, ...lazyCharactersData];

    // 为每个角色准备数据库记录
    const now = new Date().toISOString();
    const createdCharacters = allCharactersData.map((charData, index) => {
      const charId = `char_${Date.now()}_${index}`;
      const isFullCharacter = index < fullCount;

      // 懒加载角色只有 name 和 gender
      if (!isFullCharacter) {
        return {
          id: charId,
          world_id: world_id,
          name: charData.name || `角色${index + 1}`,
          personality: '',
          appearance: '',
          physical_appearance: JSON.stringify({}),
          background: '',
          image_url: '',
          is_protagonist: 0,
          is_lazy: 1,
          created_at: now,
          updated_at: now
        };
      }

      return {
        id: charId,
        world_id: world_id,
        name: charData.name || `角色${index + 1}`,
        age: charData.age || '',
        gender: charData.gender || '',
        personality: charData.personality || '',
        appearance: charData.appearance || '',
        physical_appearance: JSON.stringify(charData.physicalAppearance || {}),
        background: charData.background || '',
        image_url: '',
        is_protagonist: 0,
        is_lazy: 0,
        created_at: now,
        updated_at: now
      };
    });

    // 批量插入角色到数据库
    const insertStmt = db.prepare(`
      INSERT INTO characters (id, user_id, world_id, name, personality, appearance, physical_appearance, background, image_url, is_protagonist, is_lazy, created_at, updated_at)
      VALUES (?, (SELECT user_id FROM worlds WHERE id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const char of createdCharacters) {
      insertStmt.run(
        char.id, char.world_id, char.world_id,
        char.name, char.personality, char.appearance, char.physical_appearance,
        char.background, char.image_url, char.is_protagonist, char.is_lazy, char.created_at, char.updated_at
      );
    }
    console.log(`[批量生成角色] 已保存 ${createdCharacters.length} 个角色到数据库`);

    // 为完整角色生成图片
    const generatedImages = {}; // 存储生成的图片 { charId: imageUrl }
    if (auto_generate_images) {
      console.log(`[批量生成角色] 开始为 ${fullCount} 个完整角色生成图片`);

      const imgConfig = getImageConfig();
      if (imgConfig?.apiKey) {
        const imagePromises = createdCharacters.slice(0, fullCount).map((char, index) => {
          return (async () => {
            try {
              const charData = fullCharactersData[index];
              const physical = charData.physicalAppearance || {};
              const expression = charData.expression || {};

              const promptParts = [];
              const genderText = charData.gender === '男' ? '男性' : charData.gender === '女' ? '女性' : '人物';
              promptParts.push(`一位${charData.age || ''}岁的${genderText}全身人像`);
              promptParts.push(`，${charData.age || '年轻'}的${genderText}`);

              if (expression.facialDetails) {
                promptParts.push(`，${expression.facialDetails}`);
              }
              if (physical.hairColor) promptParts.push(`，${physical.hairColor}`);
              if (physical.hairStyle) promptParts.push(`${physical.hairStyle}`);
              if (physical.eyeColor) promptParts.push(`，${physical.eyeColor}的眼睛`);
              if (physical.bodyType) promptParts.push(`，${physical.bodyType}的身材`);
              if (expression.currentExpression && expression.currentExpression !== '自然') {
                promptParts.push(`，${expression.currentExpression}的表情`);
              }
              if (physical.clothing) {
                promptParts.push(`，穿着${physical.clothing}`);
              } else {
                promptParts.push(`，穿着适合的服装`);
              }
              promptParts.push(`，${world.name || '奇幻'}风格`);
              promptParts.push(`，全身人像摄影`);
              promptParts.push(`，从头到脚完整构图`);
              promptParts.push(`，专业人像摄影`);
              promptParts.push(`，背景虚化，浅景深`);
              promptParts.push(`，柔和自然光`);
              promptParts.push(`，高清，细节丰富`);

              const imgPrompt = promptParts.join('');

              const imgResponse = await fetch(`${imgConfig.baseUrl.replace(/\/$/, '')}/v1/images/generations`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${imgConfig.apiKey}`
                },
                body: JSON.stringify({
                  model: imgConfig.model || 'z-image-turbo',
                  prompt: imgPrompt,
                  size: '3:4'
                })
              });

              if (!imgResponse.ok) {
                console.error(`[批量生成角色] 图片生成失败 for ${char.name}: ${imgResponse.status}`);
                return null;
              }

              const imgData = await imgResponse.json();
              let imageUrl = null;

              if (imgData.status === 'completed' && imgData.results && imgData.results.length > 0) {
                imageUrl = imgData.results[0].url;
              } else if (imgData.id) {
                imageUrl = await pollImageTask(imgData.id, imgConfig.apiKey, imgConfig.baseUrl.replace(/\/$/, ''));
                if (typeof imageUrl === 'object') {
                  imageUrl = imageUrl.url;
                }
              }

              if (imageUrl) {
                db.prepare('UPDATE characters SET image_url = ?, updated_at = ? WHERE id = ?')
                  .run(imageUrl, new Date().toISOString(), char.id);

                db.prepare(`
                  INSERT INTO images (user_id, world_id, character_id, image_type, image_url, created_at)
                  VALUES ((SELECT user_id FROM worlds WHERE id = ?), ?, ?, 'character', ?, ?)
                `).run(world_id, world_id, char.id, imageUrl, new Date().toISOString());

                // 保存到 generatedImages
                generatedImages[char.id] = imageUrl;

                console.log(`[批量生成角色] 图片生成成功 for ${char.name}: ${imageUrl}`);
                return { charId: char.id, imageUrl };
              }
            } catch (err) {
              console.error(`[批量生成角色] 图片生成异常 for ${char.name}:`, err.message);
            }
            return null;
          })();
        });

        await Promise.all(imagePromises);
        console.log(`[批量生成角色] 图片生成完成`);
      }
    }

    // 返回生成的角色列表
    const result = createdCharacters.map((char, index) => {
      const isFullCharacter = index < fullCount;
      const charData = isFullCharacter ? fullCharactersData[index] : lazyCharactersData[index - fullCount];

      return {
        id: char.id,
        name: char.name,
        age: charData?.age || (isFullCharacter ? charData?.age : ''),
        gender: charData?.gender || '',
        personality: char.personality,
        appearance: char.appearance,
        physicalAppearance: isFullCharacter ? (charData?.physicalAppearance || {}) : {},
        expression: isFullCharacter ? (charData?.expression || {}) : { currentExpression: '自然', expressionIntensity: '平静', facialDetails: '' },
        personalityTraits: isFullCharacter ? (charData?.personalityTraits || {}) : { extroversion: 50, rationality: 50, orderliness: 50, optimism: 50 },
        selfAwareness: isFullCharacter ? (charData?.selfAwareness || 50) : 50,
        isProtagonist: false,
        imageUrl: generatedImages[char.id] || char.image_url || '',
        isLazy: !isFullCharacter
      };
    });

    res.json({ characters: result, count: result.length, lazyCount, fullCount });
  } catch (error) {
    console.error('[批量生成角色] 错误:', error);
    res.status(500).json({ error: error.message || 'Batch generation failed' });
  }
});

// ===== 补充懒加载角色详情 API =====
router.post('/expand-character', async (req, res) => {
  try {
    const { character_id } = req.body;

    if (!character_id) {
      return res.status(400).json({ error: 'character_id is required' });
    }

    // 获取角色信息
    const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(character_id);
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // 检查是否是懒加载角色
    if (!character.is_lazy) {
      return res.status(400).json({ error: 'Character is already expanded' });
    }

    // 获取世界观信息
    const world = db.prepare('SELECT * FROM worlds WHERE id = ?').get(character.world_id);
    if (!world) {
      return res.status(404).json({ error: 'World not found' });
    }

    // 获取 AI 配置
    const providerConfig = getFullProviderConfig('deepseek');
    if (!providerConfig?.apiKey) {
      return res.status(400).json({ error: 'Deepseek API key not configured' });
    }

    const baseUrl = providerConfig.baseUrl.replace(/\/$/, '');

    // 生成完整角色信息
    const prompt = `世界观：${world.name || '未设定'}
${world.description || ''}

已有角色信息：
- 名字：${character.name}
- 性别：${character.gender}

请根据以上信息，为这个角色生成完整的设定信息，严格按照下方的JSON模板返回结果。

【重要要求】
1. 所有字段都必须填写，不能省略任何字段，不能有空字符串
2. personalityTraits 的四个数值必须在 0-100 之间
3. selfAwareness 数值必须在 0-100 之间
4. physicalAppearance 的所有子字段都必须填写具体内容
5. expression 的所有子字段都必须填写
6. 只返回纯JSON，不要包含任何其他文字说明、markdown代码块标记

【单个角色的JSON模板】
{
  "name": "${character.name}",
  "age": "年龄（如：25岁、17岁）",
  "gender": "${character.gender}",
  "personality": "性格描述（100-150字）",
  "appearance": "外貌整体描述（150-200字）",
  "personalityTraits": {
    "extroversion": 50,
    "rationality": 50,
    "orderliness": 50,
    "optimism": 50
  },
  "selfAwareness": 50,
  "physicalAppearance": {
    "hairStyle": "发型",
    "hairColor": "发色",
    "eyeColor": "瞳色",
    "bodyType": "体型",
    "clothing": "穿着描述"
  },
  "expression": {
    "currentExpression": "自然",
    "expressionIntensity": "平静",
    "facialDetails": ""
  }
}

请直接返回JSON，不要添加任何其他文字。`;

    const body = {
      model: providerConfig.model,
      messages: [
        {
          role: 'system',
          content: '你是一个创意写作助手，擅长生成世界观、角色和场景设定。请按照用户要求的JSON格式返回内容。'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.8,
      max_tokens: 4000
    };

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
      throw new Error(`Deepseek API error: ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    }

    const charData = JSON.parse(jsonStr);

    // 更新数据库
    const physicalAppearanceStr = JSON.stringify(charData.physicalAppearance || {});
    db.prepare(`
      UPDATE characters SET
        age = ?,
        personality = ?,
        appearance = ?,
        physical_appearance = ?,
        background = ?,
        is_lazy = 0,
        updated_at = ?
      WHERE id = ?
    `).run(
      charData.age || '',
      charData.personality || '',
      charData.appearance || '',
      physicalAppearanceStr,
      charData.background || '',
      new Date().toISOString(),
      character_id
    );

    // 返回更新后的角色
    res.json({
      id: character_id,
      name: character.name,
      age: charData.age || '',
      gender: character.gender,
      personality: charData.personality || '',
      appearance: charData.appearance || '',
      physicalAppearance: charData.physicalAppearance || {},
      expression: charData.expression || { currentExpression: '自然', expressionIntensity: '平静', facialDetails: '' },
      personalityTraits: charData.personalityTraits || { extroversion: 50, rationality: 50, orderliness: 50, optimism: 50 },
      selfAwareness: charData.selfAwareness || 50,
      isProtagonist: character.is_protagonist === 1,
      imageUrl: character.image_url || '',
      isLazy: false
    });
  } catch (error) {
    console.error('[补充角色详情] 错误:', error);
    res.status(500).json({ error: error.message || 'Expand character failed' });
  }
});

// ===== 批量生成场景 API =====
router.post('/batch-generate-scenes', async (req, res) => {
  try {
    const { world_id, count = 3, prompt, auto_generate_images = true } = req.body;

    if (!world_id) {
      return res.status(400).json({ error: 'world_id is required' });
    }

    // 获取世界观信息
    const world = db.prepare('SELECT * FROM worlds WHERE id = ?').get(world_id);
    if (!world) {
      return res.status(404).json({ error: 'World not found' });
    }

    // 获取 AI 配置
    const providerConfig = getFullProviderConfig('deepseek');
    if (!providerConfig?.apiKey) {
      return res.status(400).json({ error: 'Deepseek API key not configured' });
    }

    const baseUrl = providerConfig.baseUrl.replace(/\/$/, '');

    // 构建批量场景生成提示词
    const buildPrompt = () => {
      return `世界观：${world.name || '未设定'}
${world.description || ''}

请生成${count}个相互连接的场景设定。

重要要求：
1. 场景名称必须是地点名称，不能包含任何人名或角色名
2. 场景只是一个地方，比如：森林入口、神秘洞穴、城镇广场、山顶等
3. 每个场景都必须至少有一个可以进入和离开的连接场景
4. 场景之间应该有逻辑上的连接关系
5. 第一个场景应该有通往第二个场景的出口
6. 最后一个场景应该有通往倒数第二个场景的入口
7. 中间的场景应该既有入口也有出口

每个场景都需要标注是室内还是室外（isIndoor字段），并根据室内/室外提供相应的详细信息：
- 室内场景需要：spaceType、decorationStyle、mainFurniture、colorScheme、lightSource、atmosphere、viewAngle
- 室外场景需要：location、seasonTime、naturalElements、skyDescription、lightDescription、colorAtmosphere、layout、photographer

请为每个场景安排合理的地图位置（mapX和mapY），范围在100-800之间。

只返回纯JSON数组，不要包含任何其他文字说明。格式如下：
[
  {
    "name": "场景名称",
    "description": "场景描述",
    "isIndoor": true/false,
    "spaceType": "空间类型",
    "decorationStyle": "装修风格",
    "mainFurniture": "主要家具陈设",
    "colorScheme": "色彩搭配",
    "lightSource": "光线来源",
    "atmosphere": "氛围描述",
    "viewAngle": "视角描述",
    "location": "地理位置/地形",
    "seasonTime": "季节/时间",
    "naturalElements": "主要自然元素",
    "skyDescription": "天空描述",
    "lightDescription": "光线描述",
    "colorAtmosphere": "色彩氛围",
    "layout": "前景/中景/远景布局",
    "photographer": "参考摄影师风格",
    "mapX": 150,
    "mapY": 150
  }
]`;
    };

    // 生成场景数据
    console.log(`[批量生成场景] 开始生成 ${count} 个场景`);
    const p = prompt || buildPrompt();
    const body = {
      model: providerConfig.model,
      messages: [
        {
          role: 'system',
          content: '你是一个创意写作助手，擅长生成世界观、角色和场景设定。请按照用户要求的JSON格式返回内容。'
        },
        { role: 'user', content: p }
      ],
      temperature: 0.8,
      max_tokens: 8000
    };

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
      throw new Error(`Deepseek API error: ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // 提取 JSON
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    }

    let scenesData = JSON.parse(jsonStr);
    if (!Array.isArray(scenesData)) {
      scenesData = [scenesData];
    }
    console.log(`[批量生成场景] 成功生成 ${scenesData.length} 个场景文本`);

    // 为每个场景准备数据库记录
    const now = new Date().toISOString();
    const createdScenes = scenesData.slice(0, count).map((sceneData, index) => {
      const sceneId = `scene_${Date.now()}_${index}`;
      return {
        id: sceneId,
        world_id: world_id,
        name: sceneData.name || `场景${index + 1}`,
        description: sceneData.description || '',
        isIndoor: sceneData.isIndoor,
        spaceType: sceneData.spaceType || '',
        decorationStyle: sceneData.decorationStyle || '',
        mainFurniture: sceneData.mainFurniture || '',
        colorScheme: sceneData.colorScheme || '',
        lightSource: sceneData.lightSource || '',
        atmosphere: sceneData.atmosphere || '',
        viewAngle: sceneData.viewAngle || '',
        location: sceneData.location || '',
        seasonTime: sceneData.seasonTime || '',
        naturalElements: sceneData.naturalElements || '',
        skyDescription: sceneData.skyDescription || '',
        lightDescription: sceneData.lightDescription || '',
        colorAtmosphere: sceneData.colorAtmosphere || '',
        layout: sceneData.layout || '',
        photographer: sceneData.photographer || '',
        mapX: sceneData.mapX || 150 + index * 200,
        mapY: sceneData.mapY || 150,
        image_url: '',
        created_at: now,
        updated_at: now
      };
    });

    // 批量插入场景到数据库（场景暂时不保存在数据库，因为前端有更复杂的场景管理）
    // 只返回给前端，让前端决定如何处理
    console.log(`[批量生成场景] 准备返回 ${createdScenes.length} 个场景给前端`);

    // 如果需要自动生成图片
    if (auto_generate_images) {
      console.log(`[批量生成场景] 开始生成 ${createdScenes.length} 个场景图片`);

      const imgConfig = getImageConfig();
      if (imgConfig?.apiKey) {
        const imagePromises = createdScenes.map((scene, index) => {
          return (async () => {
            try {
              const sceneData = scenesData[index];
              let imgPrompt = '';

              // 根据室内/室外构建提示词
              if (scene.isIndoor === true) {
                const spaceType = sceneData.spaceType || '室内空间';
                const decorationStyle = sceneData.decorationStyle || '奇幻风格';
                const mainFurniture = sceneData.mainFurniture || '家具陈设';
                const colorScheme = sceneData.colorScheme || '暖色调';
                const atmosphere = sceneData.atmosphere || '温馨舒适';
                const viewAngle = sceneData.viewAngle || '平视视角';

                imgPrompt = `${spaceType}，${decorationStyle}，${mainFurniture}，${colorScheme}，${atmosphere}，${viewAngle}，室内设计效果图风格，建筑可视化，高清，专业建筑渲染水准，细节丰富`;
              } else if (scene.isIndoor === false) {
                const location = sceneData.location || '自然风光';
                const naturalElements = sceneData.naturalElements || '绿树成荫';
                const layout = sceneData.layout || '层次分明';
                const photographer = sceneData.photographer || 'National Geographic';

                imgPrompt = `${location}，${naturalElements}，${layout}，${photographer}风格，广角镜头，16-35mm，高清，国家地理杂志水准，细节丰富`;
              } else {
                imgPrompt = `Scene: ${scene.name}, ${scene.description || 'fantasy landscape'}, fantasy style, detailed scenery`;
              }

              // 调用图片生成 API
              const imgResponse = await fetch(`${imgConfig.baseUrl.replace(/\/$/, '')}/v1/images/generations`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${imgConfig.apiKey}`
                },
                body: JSON.stringify({
                  model: imgConfig.model || 'z-image-turbo',
                  prompt: imgPrompt,
                  size: '16:9'
                })
              });

              if (!imgResponse.ok) {
                console.error(`[批量生成场景] 图片生成失败 for ${scene.name}: ${imgResponse.status}`);
                return { sceneId: scene.id, imageUrl: null };
              }

              const imgData = await imgResponse.json();
              let imageUrl = null;

              if (imgData.status === 'completed' && imgData.results && imgData.results.length > 0) {
                imageUrl = imgData.results[0].url;
              } else if (imgData.id) {
                imageUrl = await pollImageTask(imgData.id, imgConfig.apiKey, imgConfig.baseUrl.replace(/\/$/, ''));
                if (typeof imageUrl === 'object') {
                  imageUrl = imageUrl.url;
                }
              }

              console.log(`[批量生成场景] 图片生成 ${imageUrl ? '成功' : '失败'} for ${scene.name}`);
              return { sceneId: scene.id, imageUrl };
            } catch (err) {
              console.error(`[批量生成场景] 图片生成异常 for ${scene.name}:`, err.message);
              return { sceneId: scene.id, imageUrl: null };
            }
          })();
        });

        const imageResults = await Promise.all(imagePromises);

        // 更新场景图片URL
        for (const result of imageResults) {
          if (result.imageUrl) {
            const scene = createdScenes.find(s => s.id === result.sceneId);
            if (scene) {
              scene.image_url = result.imageUrl;
            }
          }
        }
        console.log(`[批量生成场景] 图片生成完成`);
      }
    }

    // 返回生成的场景列表
    res.json({ scenes: createdScenes, count: createdScenes.length });
  } catch (error) {
    console.error('[批量生成场景] 错误:', error);
    res.status(500).json({ error: error.message || 'Batch scene generation failed' });
  }
});

// ===== 生成世界地图（Mermaid流程图）=====
router.post('/generate-world-map', async (req, res) => {
  try {
    const { world_id, prompt } = req.body;

    if (!world_id) {
      return res.status(400).json({ error: 'world_id is required' });
    }

    // 获取世界观信息
    const world = db.prepare('SELECT * FROM worlds WHERE id = ?').get(world_id);
    if (!world) {
      return res.status(404).json({ error: 'World not found' });
    }

    // 获取 AI 配置
    const providerConfig = getFullProviderConfig('deepseek');
    if (!providerConfig?.apiKey) {
      return res.status(400).json({ error: 'Deepseek API key not configured' });
    }

    const baseUrl = providerConfig.baseUrl.replace(/\/$/, '');

    // 构建世界地图生成提示词
    const mapPrompt = prompt || `世界观：${world.name || '未设定'}
${world.description || ''}

请为这个世界观设计一个场景地图规划，包含以下内容：

1. **场景节点列表**：设计8-15个场景节点
   - 每个场景有唯一ID和名称
   - 每个场景需要标注是起点（主角开始的地方）还是普通场景

2. **连接关系**：定义场景之间的连接（双向或单向）
   - 使用 --> 表示双向可通行
   - 使用 -->|条件| 表示单向通行或有条件限制

3. **分支条件**：标注重要的分支选择点
   - 例如：|选择向左或向右|、|需要钥匙|、|时间限制|

4. **重要事件**：标注某些场景中的重要事件或遭遇

请使用以下Mermaid流程图语法返回（graph TD表示横向流程图，LR表示纵向）：

\`\`\`mermaid
graph TD
    %% 节点定义
    A[起点：场景名称] --> B[场景名称]
    B --> C[场景名称]
    C -->|条件| D[场景名称]
    D --> E[场景名称]

    %% 或者使用横向布局
    graph LR
    A[起点] --> B[场景]
\`\`\`

【重要要求】
1. 第一个场景必须是起点，用 "起点：" 前缀标注
2. 每个场景名称用中文，简洁明了（2-6个字）
3. 连接线上可以标注分支条件
4. 只返回Mermaid代码块，不要添加任何其他解释

请直接返回Mermaid代码。`;

    console.log(`[世界地图] 开始生成世界地图`);

    const body = {
      model: providerConfig.model,
      messages: [
        {
          role: 'system',
          content: '你是一个游戏世界观设计师，擅长设计开放世界的场景地图和分支路径。请只返回用户要求的Mermaid流程图代码，不要添加任何解释。'
        },
        { role: 'user', content: mapPrompt }
      ],
      temperature: 0.7,
      max_tokens: 4000
    };

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
      throw new Error(`Deepseek API error: ${errorText}`);
    }

    const data = await response.json();
    let mermaidCode = data.choices[0].message.content;

    // 提取 Mermaid 代码
    let jsonStr = mermaidCode.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```mermaid\n?/g, '').replace(/```\n?/g, '').trim();
    }

    console.log(`[世界地图] 生成成功`);
    console.log(`[世界地图] Mermaid代码:\n${jsonStr}`);

    // 返回Mermaid代码供前端渲染确认
    res.json({
      mermaidCode: jsonStr,
      world_id: world_id,
      worldName: world.name
    });
  } catch (error) {
    console.error('[世界地图] 错误:', error);
    res.status(500).json({ error: error.message || 'World map generation failed' });
  }
});

// ===== 根据世界地图生成场景（懒加载）=====
router.post('/generate-scenes-from-map', async (req, res) => {
  try {
    const { world_id, world_map, center_scene_id, auto_generate_images = true } = req.body;

    if (!world_id) {
      return res.status(400).json({ error: 'world_id is required' });
    }

    if (!world_map || !world_map.mermaidCode) {
      return res.status(400).json({ error: 'world_map with mermaidCode is required' });
    }

    // 获取世界观信息
    const world = db.prepare('SELECT * FROM worlds WHERE id = ?').get(world_id);
    if (!world) {
      return res.status(404).json({ error: 'World not found' });
    }

    // 获取 AI 配置
    const providerConfig = getFullProviderConfig('deepseek');
    if (!providerConfig?.apiKey) {
      return res.status(400).json({ error: 'Deepseek API key not configured' });
    }

    const baseUrl = providerConfig.baseUrl.replace(/\/$/, '');

    // 从Mermaid代码中解析场景信息，并计算布局位置
    const parseMermaidToScenes = (mermaidCode) => {
      const scenes = [];
      const connections = [];

      // 简单的Mermaid解析
      // 匹配格式: A[文本] --> B[文本] 或 A[文本] -->|条件| B[文本]
      const nodePattern = /([A-Z]+)\[([^\]]+)\]/g;
      const edgePattern = /([A-Z]+)\s*-->(?:\|([^\|]+)\|)?\s*([A-Z]+)/g;

      let match;
      while ((match = nodePattern.exec(mermaidCode)) !== null) {
        const id = match[1];
        const name = match[2].replace(/起点：/g, '').trim();
        const isStart = match[2].includes('起点：');
        scenes.push({ id, name, isStart });
      }

      while ((match = edgePattern.exec(mermaidCode)) !== null) {
        connections.push({
          from: match[1],
          to: match[3],
          condition: match[2] || null
        });
      }

      // 计算场景布局位置（基于BFS层次遍历）
      const calculateLayout = (scenes, connections) => {
        // 构建邻接表
        const adjacency = {};
        scenes.forEach(s => { adjacency[s.id] = []; });
        connections.forEach(c => {
          if (adjacency[c.from]) adjacency[c.from].push(c.to);
          if (adjacency[c.to]) adjacency[c.to].push(c.from);
        });

        // 找到起点
        const startScene = scenes.find(s => s.isStart) || scenes[0];
        if (!startScene) return;

        // BFS 遍历确定层次
        const levels = {}; // { sceneId: level }
        const queue = [startScene.id];
        const visited = new Set();
        visited.add(startScene.id);
        levels[startScene.id] = 0;

        while (queue.length > 0) {
          const current = queue.shift();
          const currentLevel = levels[current];

          adjacency[current].forEach(neighbor => {
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              levels[neighbor] = currentLevel + 1;
              queue.push(neighbor);
            }
          });
        }

        // 处理未连接的节点（放在最后一层）
        scenes.forEach(s => {
          if (levels[s.id] === undefined) {
            levels[s.id] = 99; // 未连接的场景放最右边
          }
        });

        // 根据层次计算 x, y 坐标
        const levelGroups = {}; // { level: [sceneId, ...] }
        Object.entries(levels).forEach(([id, level]) => {
          if (!levelGroups[level]) levelGroups[level] = [];
          levelGroups[level].push(id);
        });

        const baseX = 150;
        const baseY = 150;
        const xSpacing = 250;
        const ySpacing = 150;

        Object.entries(levelGroups).forEach(([level, ids]) => {
          const x = baseX + parseInt(level) * xSpacing;
          ids.forEach((id, index) => {
            const scene = scenes.find(s => s.id === id);
            if (scene) {
              // 如果场景没有自己的 mapX/mapY，使用计算的
              scene.mapX = scene.mapX || x;
              scene.mapY = scene.mapY || (baseY + index * ySpacing);
            }
          });
        });

        return startScene.id;
      };

      const startSceneId = calculateLayout(scenes, connections);

      return { scenes, connections, startSceneId };
    };

    const { scenes: mapScenes, connections, startSceneId: parsedStartSceneId } = parseMermaidToScenes(world_map.mermaidCode);

    console.log(`[场景生成] 解析到 ${mapScenes.length} 个场景，${connections.length} 个连接`);

    // 找到起始场景
    const startScene = mapScenes.find(s => s.isStart) || mapScenes[0];
    const centerId = center_scene_id || startScene?.id;

    // 计算以centerId为中心的5个场景（包括中心场景及其相邻场景）
    const getNearbyScenes = (centerId, maxCount = 5) => {
      const result = [];
      const visited = new Set();
      const queue = [centerId];

      while (queue.length > 0 && result.length < maxCount) {
        const currentId = queue.shift();
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        const scene = mapScenes.find(s => s.id === currentId);
        if (scene) {
          result.push(scene);
        }

        // 找到相邻场景加入队列
        connections.forEach(conn => {
          if (conn.from === currentId && !visited.has(conn.to)) {
            queue.push(conn.to);
          }
          if (conn.to === currentId && !visited.has(conn.from)) {
            queue.push(conn.from);
          }
        });
      }

      return result;
    };

    const scenesToGenerate = getNearbyScenes(centerId, 5);
    console.log(`[场景生成] 准备生成 ${scenesToGenerate.length} 个场景:`, scenesToGenerate.map(s => s.name));

    // 生成这些场景的详细信息
    const sceneDetailsPrompt = `世界观：${world.name || '未设定'}
${world.description || ''}

场景地图信息：
${world_map.mermaidCode}

请为以下场景生成详细信息，返回JSON数组：
${scenesToGenerate.map((s, i) => `${i + 1}. ${s.name}${s.isStart ? '（起点）' : ''}`).join('\n')}

每个场景需要提供：
- name: 场景名称
- description: 场景描述（50-100字）
- isIndoor: true/false（室内还是室外）
- 室内场景需要：spaceType、decorationStyle、mainFurniture、colorScheme、lightSource、atmosphere、viewAngle
- 室外场景需要：location、seasonTime、naturalElements、skyDescription、lightDescription、colorAtmosphere、layout、photographer
- mapX, mapY: 地图坐标（根据场景在地图上的位置合理安排）

返回纯JSON数组，格式如下：
[
  {
    "mapId": "A",
    "name": "场景名称",
    "description": "场景描述",
    "isIndoor": true/false,
    "mapX": 150,
    "mapY": 150,
    ...其他字段
  }
]

请直接返回JSON，不要添加任何其他文字。`;

    const body = {
      model: providerConfig.model,
      messages: [
        {
          role: 'system',
          content: '你是一个创意写作助手，擅长生成场景设定。请严格按照用户要求的JSON格式返回内容。'
        },
        { role: 'user', content: sceneDetailsPrompt }
      ],
      temperature: 0.8,
      max_tokens: 8000
    };

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
      throw new Error(`Deepseek API error: ${errorText}`);
    }

    const data = await response.json();
    let content = data.choices[0].message.content;

    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    }

    let scenesData = JSON.parse(jsonStr);
    if (!Array.isArray(scenesData)) {
      scenesData = [scenesData];
    }

    console.log(`[场景生成] 成功生成 ${scenesData.length} 个场景详情`);

    // 为每个场景准备数据库记录
    const now = new Date().toISOString();
    const createdScenes = scenesData.map((sceneData, index) => {
      const sceneId = `scene_${Date.now()}_${index}`;
      const mapScene = mapScenes.find(s => s.mapId === sceneData.mapId || s.name === sceneData.name);

      // 优先使用 AI 返回的坐标，其次使用从 Mermaid 计算的坐标，最后使用默认
      const calculatedMapX = mapScene?.mapX || 150 + index * 200;
      const calculatedMapY = mapScene?.mapY || 150;

      return {
        id: sceneId,
        world_id: world_id,
        mapId: sceneData.mapId || mapScene?.id || `scene_${index}`,
        name: sceneData.name || `场景${index + 1}`,
        description: sceneData.description || '',
        isIndoor: sceneData.isIndoor,
        spaceType: sceneData.spaceType || '',
        decorationStyle: sceneData.decorationStyle || '',
        mainFurniture: sceneData.mainFurniture || '',
        colorScheme: sceneData.colorScheme || '',
        lightSource: sceneData.lightSource || '',
        atmosphere: sceneData.atmosphere || '',
        viewAngle: sceneData.viewAngle || '',
        location: sceneData.location || '',
        seasonTime: sceneData.seasonTime || '',
        naturalElements: sceneData.naturalElements || '',
        skyDescription: sceneData.skyDescription || '',
        lightDescription: sceneData.lightDescription || '',
        colorAtmosphere: sceneData.colorAtmosphere || '',
        layout: sceneData.layout || '',
        photographer: sceneData.photographer || '',
        mapX: sceneData.mapX || calculatedMapX,
        mapY: sceneData.mapY || calculatedMapY,
        image_url: '',
        connectedScenes: [],
        npcs: [],
        is_lazy: 0,
        created_at: now,
        updated_at: now
      };
    });

    // 处理连接关系
    createdScenes.forEach(scene => {
      const mapScene = mapScenes.find(s => s.id === scene.mapId);
      if (mapScene) {
        const sceneConnections = connections.filter(c => c.from === mapScene.id || c.to === mapScene.id);
        scene.connectedScenes = sceneConnections.map(conn => {
          const connectedMapId = conn.from === mapScene.id ? conn.to : conn.from;
          const connectedScene = createdScenes.find(cs => cs.mapId === connectedMapId);
          return connectedScene?.id || null;
        }).filter(Boolean);
      }
    });

    console.log(`[场景生成] 准备生成图片`);

    // 生成场景图片
    if (auto_generate_images) {
      const imgConfig = getImageConfig();
      if (imgConfig?.apiKey) {
        const imagePromises = createdScenes.map((scene, index) => {
          return (async () => {
            try {
              const sceneData = scenesData[index];
              let imgPrompt = '';

              if (scene.isIndoor === true) {
                imgPrompt = `${sceneData.spaceType || '室内空间'}，${sceneData.decorationStyle || '奇幻风格'}，${sceneData.mainFurniture || '家具陈设'}，${sceneData.colorScheme || '暖色调'}，${sceneData.atmosphere || '温馨舒适'}，${sceneData.viewAngle || '平视视角'}，室内设计效果图风格，建筑可视化，高清，专业建筑渲染水准，细节丰富`;
              } else if (scene.isIndoor === false) {
                imgPrompt = `${sceneData.location || '自然风光'}，${sceneData.naturalElements || '绿树成荫'}，${sceneData.layout || '层次分明'}，${sceneData.photographer || 'National Geographic'}风格，广角镜头，16-35mm，高清，国家地理杂志水准，细节丰富`;
              } else {
                imgPrompt = `场景：${scene.name}，${scene.description || 'fantasy landscape'}，fantasy style，detailed scenery`;
              }

              const imgResponse = await fetch(`${imgConfig.baseUrl.replace(/\/$/, '')}/v1/images/generations`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${imgConfig.apiKey}`
                },
                body: JSON.stringify({
                  model: imgConfig.model || 'z-image-turbo',
                  prompt: imgPrompt,
                  size: '16:9'
                })
              });

              if (!imgResponse.ok) {
                console.error(`[场景生成] 图片生成失败 for ${scene.name}: ${imgResponse.status}`);
                return { sceneId: scene.id, imageUrl: null };
              }

              const imgData = await imgResponse.json();
              let imageUrl = null;

              if (imgData.status === 'completed' && imgData.results && imgData.results.length > 0) {
                imageUrl = imgData.results[0].url;
              } else if (imgData.id) {
                imageUrl = await pollImageTask(imgData.id, imgConfig.apiKey, imgConfig.baseUrl.replace(/\/$/, ''));
                if (typeof imageUrl === 'object') {
                  imageUrl = imageUrl.url;
                }
              }

              console.log(`[场景生成] 图片生成 ${imageUrl ? '成功' : '失败'} for ${scene.name}`);
              return { sceneId: scene.id, imageUrl };
            } catch (err) {
              console.error(`[场景生成] 图片生成异常 for ${scene.name}:`, err.message);
              return { sceneId: scene.id, imageUrl: null };
            }
          })();
        });

        const imageResults = await Promise.all(imagePromises);

        for (const result of imageResults) {
          if (result.imageUrl) {
            const scene = createdScenes.find(s => s.id === result.sceneId);
            if (scene) {
              scene.image_url = result.imageUrl;
            }
          }
        }
      }
    }

    // 返回生成的场景
    res.json({
      scenes: createdScenes,
      count: createdScenes.length,
      worldMap: world_map,
      startSceneId: createdScenes.find(s => s.mapId === startScene?.id)?.id || createdScenes[0]?.id
    });
  } catch (error) {
    console.error('[场景生成] 错误:', error);
    res.status(500).json({ error: error.message || 'Scene generation failed' });
  }
});

// 文生图 API
router.post('/image', async (req, res) => {
  try {
    const { prompt, size = '1:1' } = req.body;

    console.log('\n========================================');
    console.log('[文生图] 开始处理请求');
    console.log('========================================');
    console.log('[文生图] 输入参数:');
    console.log('  - prompt:', prompt);
    console.log('  - size:', size);

    if (!prompt) {
      console.log('[文生图] 错误: Prompt is required');
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const imgConfig = getImageConfig();
    console.log('[文生图] API配置:', {
      baseUrl: imgConfig.baseUrl,
      model: imgConfig.model
    });

    if (!imgConfig.apiKey) {
      console.log('[文生图] 错误: Image API key not configured');
      return res.status(400).json({ error: 'Image API key not configured' });
    }

    const baseUrl = imgConfig.baseUrl.replace(/\/$/, '');

    console.log('[文生图] 发送请求到Evolink API...');

    // 发起生成请求
    const response = await fetch(`${baseUrl}/v1/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${imgConfig.apiKey}`
      },
      body: JSON.stringify({
        model: imgConfig.model || 'z-image-turbo',
        prompt: prompt,
        size: size
      })
    });

    console.log('[文生图] API响应状态:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.log('[文生图] API错误:', errorData);
      return res.status(response.status).json({ error: errorData.error?.message || `Image API error: ${response.status}` });
    }

    const data = await response.json();
    console.log('[文生图] API响应数据:', JSON.stringify(data, null, 2));

    let imageUrl;

    // 如果直接返回结果
    if (data.status === 'completed' && data.results && data.results.length > 0) {
      imageUrl = data.results[0].url;
      console.log('[文生图] 直接返回结果:', imageUrl);
    } else if (data.status === 'completed' && data.data && data.data.image_urls && data.data.image_urls.length > 0) {
      // 兼容其他格式
      imageUrl = data.data.image_urls[0];
      console.log('[文生图] 兼容格式返回结果:', imageUrl);
    }
    // 如果返回 task ID，需要轮询
    else if (data.id) {
      console.log(`[文生图] 收到任务ID: ${data.id}，开始轮询...`);
      imageUrl = await pollImageTask(data.id, imgConfig.apiKey, baseUrl);
      if (typeof imageUrl === 'object') {
        imageUrl = imageUrl.url;
      }
      console.log('[文生图] 轮询完成，图片URL:', imageUrl);
    } else {
      console.log('[文生图] 错误: Unexpected response format from image API');
      return res.status(500).json({ error: 'Unexpected response format from image API' });
    }

    // 缓存图片并返回本地 URL
    console.log('[文生图] 开始缓存图片...');
    const cached = await cacheImageFromUrl(imageUrl);
    console.log('[文生图] 缓存完成:');
    console.log('  - 本地URL:', cached.localUrl);
    console.log('  - 原始URL:', cached.originalUrl);
    console.log('========================================\n');

    return res.json({ result: { url: cached.localUrl, originalUrl: cached.originalUrl } });
  } catch (error) {
    console.error('[文生图] 错误:', error);
    res.status(500).json({ error: error.message || 'Image generation failed' });
  }
});

// 图生图 API - 返回 task ID 供前端轮询
router.post('/image-to-image', async (req, res) => {
  try {
    const { prompt, image_urls, n = 1, aspect_ratio = '1:1' } = req.body;

    console.log('\n========================================');
    console.log('[图生图] 开始处理请求');
    console.log('========================================');
    console.log('[图生图] 输入参数:');
    console.log('  - prompt:', prompt);
    console.log('  - image_urls:', image_urls);
    console.log('  - n:', n);
    console.log('  - aspect_ratio:', aspect_ratio);

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!image_urls || image_urls.length === 0) {
      return res.status(400).json({ error: 'image_urls is required' });
    }

    const imgConfig = getImageToImageConfig();

    if (!imgConfig.apiKey) {
      return res.status(400).json({ error: 'Image-to-image API key not configured' });
    }

    const baseUrl = imgConfig.baseUrl.replace(/\/$/, '');

    // 服务器主机配置
    const SERVER_HOST = process.env.NODE_ENV === 'production'
      ? 'http://localhost'
      : 'http://localhost:29999';

    // 处理图片URL - 将本地图片上传到图床
    const processedUrls = [];
    for (const url of image_urls) {
      const needsUpload = url.startsWith('/') ||
                         url.startsWith('http://localhost') ||
                         url.startsWith('http://127.0.0.1');

      console.log(`[图生图] 处理URL: ${url}, needsUpload: ${needsUpload}`);

      if (needsUpload) {
        try {
          const fullUrl = url.startsWith('http') ? url : `${SERVER_HOST}${url}`;
          console.log(`[图生图] 下载图片: ${fullUrl}`);

          const downloadResponse = await fetch(fullUrl);
          console.log(`[图生图] 下载响应状态: ${downloadResponse.status}`);

          if (!downloadResponse.ok) {
            throw new Error(`下载失败: ${downloadResponse.status}`);
          }

          const buffer = await downloadResponse.arrayBuffer();
          console.log(`[图生图] 下载成功，buffer大小: ${buffer.byteLength}`);

          let ext = 'jpg';
          if (url.includes('.png')) ext = 'png';
          else if (url.includes('.webp')) ext = 'webp';

          const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
          const imageUrl = await uploadToImageBed(Buffer.from(buffer), filename, `image/${ext}`);
          console.log(`[图生图] 上传到图床成功: ${imageUrl}`);
          processedUrls.push(imageUrl);
        } catch (err) {
          console.error(`[图生图] 图片处理失败: ${err.message}`);
          console.log(`[图生图] 失败fallback，使用原始URL: ${url}`);
          processedUrls.push(url);
        }
      } else {
        console.log(`[图生图] 直接使用外部URL: ${url}`);
        processedUrls.push(url);
      }
    }

    console.log('[图生图] 处理后的图片URL:', processedUrls);

    // 发起生成请求
    const requestBody = {
      model: imgConfig.model || 'doubao-seedream-5.0-lite',
      prompt,
      image_urls: processedUrls,
      response_format: 'url',
      n: n,
      aspect_ratio: aspect_ratio
    };

    console.log('[图生图] 发送请求到Evolink API...');

    const response = await fetch(`${baseUrl}/v1/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${imgConfig.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[图生图] API错误:', errorText);
      return res.status(response.status).json({ error: errorText || `API error: ${response.status}` });
    }

    const data = await response.json();
    console.log('[图生图] API响应:', data);

    // 返回 task ID 给前端用于轮询
    if (data.id) {
      console.log(`[图生图] 任务ID: ${data.id}`);
      return res.json({
        taskId: data.id,
        status: 'pending',
        message: '任务已提交，请轮询获取结果'
      });
    }

    // 如果直接返回结果
    if (data.results && data.results.length > 0) {
      const imageUrl = data.results[0].url;
      const cached = await cacheImageFromUrl(imageUrl);
      return res.json({
        status: 'completed',
        result: { url: cached.localUrl, originalUrl: cached.originalUrl }
      });
    }

    return res.status(500).json({ error: 'Unexpected response format' });
  } catch (error) {
    console.error('[图生图] 错误:', error);
    res.status(500).json({ error: error.message || 'Image generation failed' });
  }
});

// 图生图任务状态查询（轮询）
router.get('/image-to-image/poll/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!taskId) {
      return res.status(400).json({ error: 'taskId is required' });
    }

    const imgConfig = getImageToImageConfig();
    const baseUrl = imgConfig.baseUrl.replace(/\/$/, '');

    console.log(`[图生图-轮询] 查询任务 ${taskId} 状态`);

    const response = await fetch(`${baseUrl}/v1/tasks/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${imgConfig.apiKey}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[图生图-轮询] 查询失败: ${errorText}`);
      return res.status(response.status).json({ error: errorText || `API error: ${response.status}` });
    }

    const data = await response.json();
    console.log(`[图生图-轮询] 任务状态:`, data.status, '进度:', data.progress);
    console.log(`[图生图-轮询] 完整响应:`, JSON.stringify(data, null, 2));

    // 如果完成，缓存图片
    // 处理不同的返回格式
    let imageUrl = null;
    if (data.results && data.results.length > 0) {
      imageUrl = data.results[0].url || data.results[0];
    } else if (data.data && data.data.image_urls && data.data.image_urls.length > 0) {
      imageUrl = data.data.image_urls[0];
    } else if (data.output && data.output.url) {
      imageUrl = data.output.url;
    } else if (typeof data.result === 'string') {
      imageUrl = data.result;
    }

    if (data.status === 'completed' && imageUrl) {
      console.log(`[图生图-轮询] 生成的图片URL: ${imageUrl}`);

      // 缓存图片到本地
      const cached = await cacheImageFromUrl(imageUrl);
      console.log(`[图生图-轮询] 本地缓存完成: ${cached.localUrl}`);

      // 上传到图床
      try {
        const filename = `generated-${Date.now()}.png`;
        const imageBedUrl = await uploadToImageBedFromUrl(cached.localUrl, filename);
        console.log(`[图生图-轮询] 图床上传完成: ${imageBedUrl}`);

        return res.json({
          status: 'completed',
          progress: 100,
          result: { url: cached.localUrl, originalUrl: cached.originalUrl, imageBedUrl: imageBedUrl }
        });
      } catch (err) {
        console.error(`[图生图-轮询] 图床上传失败: ${err.message}`);
        // 图床上传失败也返回结果，只是没有 imageBedUrl
        return res.json({
          status: 'completed',
          progress: 100,
          result: { url: cached.localUrl, originalUrl: cached.originalUrl }
        });
      }
    }

    // 如果失败
    if (data.status === 'failed') {
      return res.json({
        status: 'failed',
        error: data.error?.message || data.error || 'Generation failed'
      });
    }

    // 进行中
    return res.json({
      status: data.status || 'processing',
      progress: data.progress || 0
    });
  } catch (error) {
    console.error('[图生图-轮询] 错误:', error);
    res.status(500).json({ error: error.message || 'Poll failed' });
  }
});

// 图生图 API - SSE 进度版本（已废弃，使用 /image-to-image + /image-to-image/poll/:taskId）
router.post('/image-to-image-stream', async (req, res) => {
  try {
    const { prompt, image_urls, n = 1 } = req.body;

    // 设置 SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const sendProgress = (progress, message) => {
      res.write(`data: ${JSON.stringify({ progress, message })}\n\n`);
    };

    const sendError = (message) => {
      res.write(`data: ${JSON.stringify({ error: true, message })}\n\n`);
      res.end();
    };

    console.log('\n========================================');
    console.log('[图生图-SSE] 开始处理请求');
    console.log('========================================');
    console.log('[图生图-SSE] 输入参数:');
    console.log('  - prompt:', prompt);
    console.log('  - image_urls:', image_urls);
    console.log('  - n:', n);

    if (!prompt) {
      sendError('Prompt is required');
      return;
    }

    if (!image_urls || image_urls.length === 0) {
      sendError('image_urls is required');
      return;
    }

    sendProgress(0, '开始处理...');

    const imgConfig = getImageToImageConfig();
    console.log('[图生图-SSE] API配置:', {
      baseUrl: imgConfig.baseUrl,
      model: imgConfig.model
    });

    if (!imgConfig.apiKey) {
      sendError('Image-to-image API key not configured');
      return;
    }

    const baseUrl = imgConfig.baseUrl.replace(/\/$/, '');

    sendProgress(10, '正在上传图片到图床...');

    // 服务器端口和主机配置
    const SERVER_HOST = process.env.NODE_ENV === 'production'
      ? 'http://localhost'
      : 'http://localhost:29999';

    // 准备上传图片到图床获取URL
    const processedUrls = [];
    for (let i = 0; i < image_urls.length; i++) {
      const url = image_urls[i];
      console.log(`[图生图-SSE] 处理第 ${i + 1} 个图片: ${url}`);

      // 判断是否需要上传到图床
      const needsUpload = url.startsWith('/') ||
                         url.startsWith('http://localhost') ||
                         url.startsWith('http://127.0.0.1');

      if (needsUpload) {
        try {
          // 构造完整的下载URL
          const fullUrl = url.startsWith('http') ? url : `${SERVER_HOST}${url}`;
          console.log(`[图生图-SSE] 下载图片: ${fullUrl}`);

          // 下载图片
          const response = await fetch(fullUrl);
          if (!response.ok) {
            throw new Error(`下载失败: ${response.status}`);
          }
          const buffer = await response.arrayBuffer();

          // 根据URL或content-type确定扩展名
          let ext = 'jpg';
          if (url.includes('.png')) ext = 'png';
          else if (url.includes('.webp')) ext = 'webp';
          else if (url.includes('.jpg') || url.includes('.jpeg')) ext = 'jpg';

          const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
          const mimeType = `image/${ext}`;

          // 上传到图床
          const imageUrl = await uploadToImageBed(Buffer.from(buffer), filename, mimeType);
          console.log(`[图生图-SSE] 上传到图床成功: ${imageUrl}`);
          processedUrls.push(imageUrl);
        } catch (err) {
          console.error(`[图生图-SSE] 图片处理失败: ${err.message}`);
          // 如果处理失败，保留原URL（可能外部可以访问）
          processedUrls.push(url);
        }
      } else {
        console.log(`[图生图-SSE] 直接使用外部URL: ${url}`);
        processedUrls.push(url);
      }
    }
    console.log(`[图生图-SSE] 所有处理的URL:`, processedUrls);

    sendProgress(20, '正在发送生成请求...');

    // 发起生成请求
    const requestBody = {
      model: imgConfig.model || 'doubao-seedream-5.0-lite',
      prompt,
      image_urls: processedUrls,
      response_format: 'url',
      n: n,
      aspect_ratio: req.body.aspect_ratio || '1:1'
    };

    console.log('[图生图-SSE] 请求体:', JSON.stringify(requestBody, null, 2));

    console.log('[图生图-SSE] 发送请求到Evolink API...');

    const response = await fetch(`${baseUrl}/v1/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${imgConfig.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    console.log('[图生图-SSE] Evolink API响应状态:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('[图生图-SSE] Evolink API错误:', errorText);
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      sendError(errorData.error || `Image-to-image API error: ${response.status}`);
      return;
    }

    const data = await response.json();
    console.log('[图生图-SSE] API响应:', JSON.stringify(data, null, 2));

    let imageUrl;

    // Evolink API 返回格式: { id: "task_id" }
    if (data.id) {
      console.log(`[图生图-SSE] 收到任务ID: ${data.id}，开始轮询...`);
      sendProgress(30, '正在生成图片...');

      // 轮询任务状态（带进度回调）
      const result = await pollEvolinkTaskWithProgress(data.id, imgConfig.apiKey, baseUrl, (progress) => {
        sendProgress(30 + Math.floor(progress * 0.5), `生成进度: ${progress}%`);
      });
      imageUrl = result.url || result;
    }
    // 如果直接返回结果
    else if (data.results && data.results.length > 0) {
      imageUrl = data.results[0].url;
    } else {
      sendError('Unexpected response format from image API');
      return;
    }

    sendProgress(80, '正在缓存图片...');

    // 缓存图片
    const cached = await cacheImageFromUrl(imageUrl);

    sendProgress(95, '处理完成！');

    // 返回最终结果
    res.write(`data: ${JSON.stringify({
      progress: 100,
      message: '完成',
      result: { url: cached.localUrl, originalUrl: cached.originalUrl }
    })}\n\n`);

    res.end();
    console.log('[图生图-SSE] 完成');
    console.log('========================================\n');

  } catch (error) {
    console.error('[图生图-SSE] 错误:', error);
    res.write(`data: ${JSON.stringify({ error: true, message: error.message })}\n\n`);
    res.end();
  }
});

// 带进度的轮询函数
async function pollEvolinkTaskWithProgress(taskId, apiKey, baseUrl, onProgress) {
  const maxRetries = 60;
  const pollInterval = 2000;

  console.log(`[轮询-SSE] 开始轮询任务 ${taskId}，最大重试 ${maxRetries} 次`);

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${baseUrl}/v1/tasks/${taskId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      console.log(`[轮询-SSE] 第 ${i + 1} 次轮询，状态码: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[轮询-SSE] 轮询失败: ${response.status} - ${errorText}`);
        throw new Error(`Failed to check task status: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log(`[轮询-SSE] 响应数据:`, JSON.stringify(data, null, 2));

      const progress = data.progress || 0;

      if (onProgress) {
        onProgress(progress);
      }

      if (data.status === 'completed') {
        console.log('[轮询-SSE] 任务完成!');
        if (data.results && data.results.length > 0) {
          console.log('[轮询-SSE] 生成图片数量:', data.results.length);
          return { url: data.results[0].url, urls: data.results.map(r => r.url) };
        }
        throw new Error('Task completed but no image URL found');
      } else if (data.status === 'failed') {
        console.error('[轮询-SSE] 任务失败:', data.error);
        throw new Error(data.error?.message || 'Image generation failed');
      }
    } catch (err) {
      console.error(`[轮询-SSE] 轮询出错: ${err.message}`);
      throw err;
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Task timeout - please try again');
}

// 轮询 Evolink 图生图任务状态
async function pollEvolinkTask(taskId, apiKey, baseUrl) {
  const maxRetries = 30;
  const pollInterval = 2000;

  console.log(`[轮询] 开始轮询任务 ${taskId}，最大重试 ${maxRetries} 次`);

  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(`${baseUrl}/v1/tasks/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to check task status: ${response.status}`);
    }

    const data = await response.json();
    console.log(`[轮询] 第 ${i + 1} 次轮询，状态: ${data.status}，进度: ${data.progress || 0}%`);

    if (data.status === 'completed') {
      console.log('[轮询] 任务完成!');
      if (data.results && data.results.length > 0) {
        console.log('[轮询] 生成图片数量:', data.results.length);
        console.log('[轮询] 图片URL:', data.results[0].url);
        return { url: data.results[0].url, urls: data.results.map(r => r.url) };
      }
      throw new Error('Task completed but no image URL found');
    } else if (data.status === 'failed') {
      console.error('[轮询] 任务失败:', data.error);
      throw new Error(data.error?.message || 'Image generation failed');
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Task timeout - please try again');
}

// 轮询图像生成任务状态
async function pollImageTask(taskId, apiKey, baseUrl) {
  const maxRetries = 30;
  const pollInterval = 2000;

  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(`${baseUrl}/v1/tasks/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to check task status: ${response.status}`);
    }

    const data = await response.json();

    if (data.status === 'completed') {
      if (data.results && data.results.length > 0) {
        return data.results[0];
      }
      throw new Error('Task completed but no image URL found');
    } else if (data.status === 'failed') {
      throw new Error(data.error?.message || 'Image generation failed');
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Task timeout - please try again');
}

export default router;
