import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from '../database.js';
import { authMiddleware } from '../middleware/auth.js';
import { generateWithAI, MAX_TOKENS } from '../services/aiService.js';
import { getFullProviderConfig, getDefaultProvider, getImageConfig } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// 所有路由都需要认证
router.use(authMiddleware);

// 文件上传配置
const uploadsDir = path.join(__dirname, '..', 'uploads', 'novels');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/plain' || file.originalname.endsWith('.txt')) {
      cb(null, true);
    } else {
      cb(new Error('Only .txt files are allowed'), false);
    }
  }
});

// 检测文件编码
const detectEncoding = (buffer) => {
  // 检查 BOM
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return 'utf-8';
  }
  if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return 'utf-16le';
  }
  if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
    return 'utf-16be';
  }
  // 简单检测：检查是否包含GBK特征字节
  let hasGBK = false;
  for (let i = 0; i < Math.min(buffer.length, 1000); i++) {
    if (buffer[i] > 0x7F) {
      hasGBK = true;
      break;
    }
  }
  return hasGBK ? 'gbk' : 'utf-8';
};

// 章节分割
const segmentChapters = (content) => {
  const chapters = [];

  // 按自然段落分割（双换行或单换行）
  const paragraphs = content.split(/\n\s*\n|\r\n\s*\r\n/);

  // 检测章节标题模式
  const chapterPattern = /^(第[一二三四五六七八九十百千\d]+[章节部篇])|^(第[一二三四五六七八九十百千\d]+回?)/i;
  const sectionPattern = /^(楔子|序|尾声|后记|前言)/i;

  let currentChapter = null;
  let currentContent = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // 检查是否是章节标题
    const lines = trimmed.split('\n');
    const firstLine = lines[0].trim();

    if (chapterPattern.test(firstLine) || sectionPattern.test(firstLine)) {
      // 保存之前的章节
      if (currentChapter && currentContent.length > 0) {
        chapters.push({
          title: currentChapter,
          content: currentContent.join('\n\n')
        });
      }

      // 开始新章节
      currentChapter = firstLine;
      currentContent = lines.slice(1).join('\n').trim() ? [lines.slice(1).join('\n').trim()] : [];
    } else if (currentChapter) {
      currentContent.push(trimmed);
    } else {
      // 第一个章节前的内容作为序章
      currentChapter = '序章';
      currentContent.push(trimmed);
    }
  }

  // 保存最后一个章节
  if (currentChapter && currentContent.length > 0) {
    chapters.push({
      title: currentChapter,
      content: currentContent.join('\n\n')
    });
  }

  return chapters;
};

// 轮询图片生成任务
const pollImageTask = async (taskId, apiKey, baseUrl, maxAttempts = 60) => {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${baseUrl}/v1/tasks/${taskId}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      if (!response.ok) {
        console.error(`[pollImageTask] HTTP error: ${response.status}`);
        return null;
      }

      const data = await response.json();

      if (data.status === 'completed' && data.results && data.results.length > 0) {
        return data.results[0].url;
      } else if (data.status === 'failed') {
        console.error('[pollImageTask] Image generation failed:', data.error);
        return null;
      }

      // 等待2秒后重试
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      console.error('[pollImageTask] Error:', e.message);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  console.error('[pollImageTask] Max attempts reached');
  return null;
};

// 生成角色立绘图片
const generateCharacterPortrait = async (character, novelType) => {
  const imgConfig = getImageConfig();
  if (!imgConfig?.apiKey) {
    console.log('[generateCharacterPortrait] Image API not configured');
    return null;
  }

  const baseUrl = imgConfig.baseUrl.replace(/\/$/, '');

  // 构建prompt - 根据小说类型调整风格
  const styleHint = getStyleHintForType(novelType);
  const prompt = `半身像，无背景，动漫风格，${styleHint}。${character.name}，${character.appearance || character.personality || ''}`;

  try {
    const response = await fetch(`${baseUrl}/v1/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${imgConfig.apiKey}`
      },
      body: JSON.stringify({
        model: imgConfig.model || 'z-image-turbo',
        prompt,
        size: '3:4'
      })
    });

    if (!response.ok) {
      console.error(`[generateCharacterPortrait] Failed for ${character.name}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    let imageUrl = null;

    if (data.status === 'completed' && data.results && data.results.length > 0) {
      imageUrl = data.results[0].url;
    } else if (data.id) {
      imageUrl = await pollImageTask(data.id, imgConfig.apiKey, baseUrl);
    }

    return imageUrl;
  } catch (e) {
    console.error(`[generateCharacterPortrait] Error for ${character.name}:`, e.message);
    return null;
  }
};

// 生成角色卡片大图
const generateCharacterCard = async (character, novelType) => {
  const imgConfig = getImageConfig();
  if (!imgConfig?.apiKey) {
    console.log('[generateCharacterCard] Image API not configured');
    return null;
  }

  const baseUrl = imgConfig.baseUrl.replace(/\/$/, '');

  // 构建prompt - 角色全身立绘
  const styleHint = getStyleHintForType(novelType);
  const prompt = `全身立绘，${styleHint}。${character.name}，${character.appearance || character.personality || ''}，详细描述`;

  try {
    const response = await fetch(`${baseUrl}/v1/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${imgConfig.apiKey}`
      },
      body: JSON.stringify({
        model: imgConfig.model || 'z-image-turbo',
        prompt,
        size: '2:3'
      })
    });

    if (!response.ok) {
      console.error(`[generateCharacterCard] Failed for ${character.name}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    let imageUrl = null;

    if (data.status === 'completed' && data.results && data.results.length > 0) {
      imageUrl = data.results[0].url;
    } else if (data.id) {
      imageUrl = await pollImageTask(data.id, imgConfig.apiKey, baseUrl);
    }

    return imageUrl;
  } catch (e) {
    console.error(`[generateCharacterCard] Error for ${character.name}:`, e.message);
    return null;
  }
};

// 生成场景背景图
const generateSceneBackground = async (scene, novelType) => {
  const imgConfig = getImageConfig();
  if (!imgConfig?.apiKey) {
    console.log('[generateSceneBackground] Image API not configured');
    return null;
  }

  const baseUrl = imgConfig.baseUrl.replace(/\/$/, '');

  // 构建prompt - 根据小说类型调整风格
  const styleHint = getStyleHintForType(novelType);
  const prompt = `${styleHint}，${scene.description || scene.name || '古风场景'}`;

  try {
    const response = await fetch(`${baseUrl}/v1/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${imgConfig.apiKey}`
      },
      body: JSON.stringify({
        model: imgConfig.model || 'z-image-turbo',
        prompt,
        size: '16:9'
      })
    });

    if (!response.ok) {
      console.error(`[generateSceneBackground] Failed for ${scene.name}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    let imageUrl = null;

    if (data.status === 'completed' && data.results && data.results.length > 0) {
      imageUrl = data.results[0].url;
    } else if (data.id) {
      imageUrl = await pollImageTask(data.id, imgConfig.apiKey, baseUrl);
    }

    return imageUrl;
  } catch (e) {
    console.error(`[generateSceneBackground] Error for ${scene.name}:`, e.message);
    return null;
  }
};

// 根据小说类型获取风格提示
const getStyleHintForType = (type) => {
  const styleMap = {
    '言情': '古风言情，柔和色调，细腻笔触',
    '悬疑': '暗黑风格，电影感，紧张氛围',
    '奇幻': '奇幻风格，魔法元素，神秘氛围',
    '历史': '古风历史，水墨画风格，典雅色调',
    '都市': '现代都市，写实风格，都市色彩',
    '军事': '写实风格，军事题材，沉稳色调',
    '科幻': '科幻风格，未来感，科技色彩',
    '其他': '动漫风格，插画质感'
  };
  return styleMap[type] || styleMap['其他'];
};

// 更新章节解析进度
const updateParseProgress = (chapterId, progress, step) => {
  db.prepare('UPDATE chapters SET parse_progress = ?, parse_step = ? WHERE id = ?')
    .run(progress, step, chapterId);
};

// 批量生成角色图片
const generateCharacterImages = async (characters, novelType) => {
  const results = [];

  for (const char of characters) {
    const portraitUrl = await generateCharacterPortrait(char, novelType);
    const cardUrl = await generateCharacterCard(char, novelType);

    results.push({
      ...char,
      portrait_url: portraitUrl,
      card_url: cardUrl
    });
  }

  return results;
};

// 批量生成场景图片
const generateSceneImages = async (scenes, novelType) => {
  const results = [];

  for (const scene of scenes) {
    const backgroundUrl = await generateSceneBackground(scene, novelType);

    results.push({
      ...scene,
      background_url: backgroundUrl
    });
  }

  return results;
};

// 检测小说类型
const detectNovelType = async (content) => {
  const sample = content.substring(0, 5000);

  const prompt = `分析以下小说内容，判断其类型。

类型选项：言情、悬疑、奇幻、历史、都市、军事、科幻、其他

判断标准：
- 言情：主要围绕爱情展开，情感描写细腻
- 悬疑：情节紧张，充满谜团和推理元素
- 奇幻：包含魔法、超自然元素
- 历史：以历史时期为背景
- 都市：现代城市生活为背景
- 军事：战争、军事行动为题材
- 科幻：科学技术为核心元素

请以JSON格式返回：
{
  "type": "类型",
  "confidence": 置信度(0-1)
}

小说内容：
${sample}`;

  try {
    const result = await generateWithAI(prompt, 'deepseek', {
      maxTokens: MAX_TOKENS.DIALOGUE,
      temperature: 0.3
    });

    // 尝试解析JSON
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      return {
        type: data.type || '其他',
        confidence: data.confidence || 0.5
      };
    }
  } catch (error) {
    console.error('Type detection error:', error);
  }

  return { type: '其他', confidence: 0 };
};

// 提取世界观设定
const extractWorldSetting = async (content, novelType) => {
  const sample = content.substring(0, 8000);

  const typeSpecificInstructions = {
    '言情': '重点关注人物关系、情感纠葛',
    '悬疑': '重点关注案件线索、人物秘密',
    '奇幻': '重点关注世界观设定、魔法体系',
    '历史': '重点关注时代背景、社会风貌',
    '都市': '重点关注社会环境、人际关系',
    '其他': '关注故事背景和人物设定'
  };

  const prompt = `分析以下小说，提取世界观和人物关系设定。

【类型】${novelType}
【重点】${typeSpecificInstructions[novelType] || '关注故事背景和人物设定'}

请以JSON格式返回：
{
  "worldName": "世界/故事名称",
  "description": "世界观详细描述（300字以内）",
  "characters": [
    {
      "name": "角色名",
      "role": "角色定位（如：主角、配角、反派等）",
      "personality": "性格特点",
      "relationships": ["与角色A的关系", "与角色B的关系"]
    }
  ],
  "setting": "背景设定细节"
}

小说内容：
${sample}`;

  try {
    const result = await generateWithAI(prompt, 'deepseek', {
      maxTokens: MAX_TOKENS.CONTENT,
      jsonResponse: true
    });

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('World setting extraction error:', error);
  }

  return null;
};

// 上传小说
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = req.file;
    const buffer = fs.readFileSync(file.path);

    // 检测编码
    const encoding = detectEncoding(buffer);
    let content;

    try {
      content = buffer.toString(encoding === 'gbk' ? 'gbk' : 'utf-8');
    } catch (decodeError) {
      content = buffer.toString('utf-8');
    }

    // 验证内容
    if (!content || content.trim().length < 100) {
      fs.unlinkSync(file.path);
      return res.status(400).json({ error: 'File content is too short or empty' });
    }

    // 生成小说ID
    const novelId = `novel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fileName = file.originalname.replace(/\.txt$/i, '');

    // 检测小说类型
    const typeInfo = await detectNovelType(content);

    // 提取世界观设定
    const worldSetting = await extractWorldSetting(content, typeInfo.type);

    // 分割章节
    const chapters = segmentChapters(content);

    // 存储小说
    const stmt = db.prepare(`
      INSERT INTO novels (id, user_id, name, content, type, type_confidence, world_setting)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(novelId, req.user.id, fileName, content, typeInfo.type, typeInfo.confidence,
      worldSetting ? JSON.stringify(worldSetting) : null);

    // 存储章节
    const chapterStmt = db.prepare(`
      INSERT INTO chapters (id, novel_id, title, order_index, content)
      VALUES (?, ?, ?, ?, ?)
    `);

    const chapterIds = [];
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      const chapterId = `chapter_${novelId}_${i}`;
      chapterIds.push(chapterId);
      chapterStmt.run(chapterId, novelId, chapter.title, i, chapter.content);
    }

    // 删除上传的临时文件
    fs.unlinkSync(file.path);

    res.status(201).json({
      novelId,
      name: fileName,
      chapterCount: chapters.length,
      type: typeInfo.type,
      chapters: chapters.map((ch, i) => ({
        id: chapterIds[i],
        title: ch.title,
        order: i
      }))
    });
  } catch (error) {
    console.error('Novel upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取用户的所有小说
router.get('/', (req, res) => {
  try {
    const novels = db.prepare(`
      SELECT id, name, type, type_confidence, world_setting, created_at, updated_at,
             (SELECT COUNT(*) FROM chapters WHERE novel_id = novels.id) as chapter_count
      FROM novels WHERE user_id = ? ORDER BY updated_at DESC
    `).all(req.user.id);

    res.json(novels.map(n => ({
      ...n,
      world_setting: n.world_setting ? JSON.parse(n.world_setting) : null
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取单个小说详情
router.get('/:id', (req, res) => {
  try {
    const novel = db.prepare('SELECT * FROM novels WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!novel) {
      return res.status(404).json({ error: 'Novel not found' });
    }

    // 获取章节列表
    const chapters = db.prepare(`
      SELECT id, title, order_index, characters, scenes, is_parsed
      FROM chapters WHERE novel_id = ? ORDER BY order_index
    `).all(req.params.id);

    // 解析JSON字段
    const chaptersWithParsed = chapters.map(ch => ({
      ...ch,
      characters: ch.characters ? JSON.parse(ch.characters) : [],
      scenes: ch.scenes ? JSON.parse(ch.scenes) : []
    }));

    res.json({
      ...novel,
      world_setting: novel.world_setting ? JSON.parse(novel.world_setting) : null,
      chapters: chaptersWithParsed
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取章节详情
router.get('/:novelId/chapter/:chapterId', async (req, res) => {
  try {
    const { novelId, chapterId } = req.params;

    // 验证小说所有权
    const novel = db.prepare('SELECT * FROM novels WHERE id = ? AND user_id = ?')
      .get(novelId, req.user.id);

    if (!novel) {
      return res.status(404).json({ error: 'Novel not found' });
    }

    // 获取章节
    const chapter = db.prepare('SELECT * FROM chapters WHERE id = ? AND novel_id = ?')
      .get(chapterId, novelId);

    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    // 检查是否需要解析
    if (!chapter.is_parsed) {
      // 触发解析（后续会实现）
      // 这里先返回未解析状态
      return res.json({
        ...chapter,
        characters: chapter.characters ? JSON.parse(chapter.characters) : [],
        scenes: chapter.scenes ? JSON.parse(chapter.scenes) : [],
        is_parsed: false,
        choice_points: [],
        world_setting: novel.world_setting ? JSON.parse(novel.world_setting) : null,
        novel_name: novel.name,
        novel_type: novel.type
      });
    }

    // 获取选择点
    const choicePoints = db.prepare(`
      SELECT * FROM choice_points WHERE chapter_id = ? ORDER BY order_index
    `).all(chapterId);

    // 获取每个选择点的备选分支
    const choicePointsWithAlternatives = choicePoints.map(cp => {
      const alternatives = db.prepare(`
        SELECT * FROM alternatives WHERE choice_point_id = ?
      `).all(cp.id);

      return {
        ...cp,
        is_exclusive: !!cp.is_exclusive,
        location: cp.location ? JSON.parse(cp.location) : null,
        alternatives: alternatives.map(alt => ({
          ...alt,
          trigger_characters: alt.trigger_characters ? JSON.parse(alt.trigger_characters) : []
        }))
      };
    });

    // 获取软章节结束点
    const softEndPoints = db.prepare(`
      SELECT * FROM soft_end_points WHERE chapter_id = ? ORDER BY order_index
    `).all(chapterId);

    res.json({
      ...chapter,
      characters: chapter.characters ? JSON.parse(chapter.characters) : [],
      scenes: chapter.scenes ? JSON.parse(chapter.scenes) : [],
      is_parsed: true,
      choice_points: choicePointsWithAlternatives,
      soft_end_points: softEndPoints.map(sep => ({
        id: sep.id,
        paragraphIndex: sep.paragraph_index,
        location: sep.location,
        reason: sep.reason,
        endType: sep.end_type
      })),
      world_setting: novel.world_setting ? JSON.parse(novel.world_setting) : null,
      novel_name: novel.name,
      novel_type: novel.type
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 解析章节（识别角色、场景、选择点）
router.post('/:novelId/chapter/:chapterId/parse', async (req, res) => {
  try {
    const { novelId, chapterId } = req.params;
    const { generateImages = false } = req.body;

    // 验证所有权
    const novel = db.prepare('SELECT * FROM novels WHERE id = ? AND user_id = ?')
      .get(novelId, req.user.id);

    if (!novel) {
      return res.status(404).json({ error: 'Novel not found' });
    }

    const chapter = db.prepare('SELECT * FROM chapters WHERE id = ? AND novel_id = ?')
      .get(chapterId, novelId);

    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    if (chapter.is_parsed) {
      return res.json({ message: 'Chapter already parsed', chapterId, status: 'completed' });
    }

    // 如果正在解析中，返回当前状态
    if (chapter.parse_status === 'parsing') {
      return res.json({ message: 'Chapter is being parsed', chapterId, status: 'parsing' });
    }

    // 标记为解析中，初始化进度
    db.prepare('UPDATE chapters SET parse_status = ?, parse_progress = 0, parse_step = ? WHERE id = ?')
      .run('parsing', '准备解析', chapterId);

    // 立即返回，后台执行解析
    res.json({ message: 'Parse started', chapterId, status: 'parsing' });

    // 后台异步执行解析
    (async () => {
      try {

    const worldSetting = novel.world_setting ? JSON.parse(novel.world_setting) : null;
    const novelType = novel.type || '其他';

    // 不生成图片时4步各25%，生成图片时文本4步各12.5%+图片阶段50%
    const textStep = generateImages ? 12.5 : 25;
    let currentProgress = 0;

    // 识别角色
    const charactersPrompt = `分析以下小说章节，识别出场角色。

【世界观】
${worldSetting ? JSON.stringify(worldSetting, null, 2) : '无详细世界观设定'}

【章节内容】
${chapter.content.substring(0, 5000)}

请以JSON格式返回角色列表：
{
  "characters": [
    {
      "name": "角色名",
      "role": "主角/配角/反派等",
      "firstAppearance": true/false（是否首次出场）
    }
  ]
}`;

    let characters = [];
    try {
      const charResult = await generateWithAI(charactersPrompt, 'deepseek', {
        maxTokens: MAX_TOKENS.DIALOGUE,
        jsonResponse: true
      });
      const jsonMatch = charResult.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        characters = data.characters || [];
      }
    } catch (e) {
      console.error('Character recognition error:', e);
    }
    currentProgress += textStep;
    updateParseProgress(chapterId, currentProgress, '识别场景中');
    const scenesPrompt = `分析以下小说章节，识别场景切换。

【章节内容】
${chapter.content.substring(0, 5000)}

请以JSON格式返回场景列表：
{
  "scenes": [
    {
      "name": "场景名",
      "location": "地点",
      "timePeriod": "时间（早晨/中午/傍晚/晚上等）"
    }
  ]
}`;

    let scenes = [];
    try {
      const sceneResult = await generateWithAI(scenesPrompt, 'deepseek', {
        maxTokens: MAX_TOKENS.DIALOGUE,
        jsonResponse: true
      });
      const jsonMatch = sceneResult.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        scenes = data.scenes || [];
      }
    } catch (e) {
      console.error('Scene recognition error:', e);
    }
    currentProgress += textStep;
    updateParseProgress(chapterId, currentProgress, '检测软结局点中');
    const typeSpecificInstructions = {
      '言情': '重点识别情感冲突、表白、误会、和好等关键时刻的选择',
      '悬疑': '重点识别调查方向、信任谁、是否面对危险等选择',
      '奇幻': '重点识别使用能力、结盟、探索未知等选择',
      '历史': '重点识别政治立场、忠诚、战争决策等选择',
      '都市': '重点识别职业选择、人际关系处理等选择',
      '其他': '识别影响剧情走向的关键选择'
    };

    // 软章节结束点检测
    const softEndPointsPrompt = `分析以下小说章节，识别"软章节结束点"。

【软章节结束点定义】
软章节结束点是章节中暗示即将结束的位置，包括：
1. 叙事节奏明显放缓，情节告一段落
2. 出现章节过渡语（如"却说..."、"且说..."、"话分两头"等）
3. 场景或氛围发生明显转换
4. 重要事件完成后的收尾段落
5. 选择点后的分支剧情结束处
6. 人物离开或到达新地点

【章节内容】
${chapter.content}

请以JSON格式返回软章节结束点列表：
{
  "softEndPoints": [
    {
      "location": "位置描述",
      "paragraph": 段落索引号,
      "reason": "判定为结束点的原因",
      "type": "过渡语/场景转换/节奏放缓/分支结束/其他"
    }
  ]
}`;

    let softEndPoints = [];
    try {
      const sepResult = await generateWithAI(softEndPointsPrompt, 'deepseek', {
        maxTokens: MAX_TOKENS.DIALOGUE,
        jsonResponse: true
      });
      const jsonMatch = sepResult.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        softEndPoints = data.softEndPoints || [];
      }
    } catch (e) {
      console.error('Soft end point detection error:', e);
    }
    currentProgress += textStep;
    updateParseProgress(chapterId, currentProgress, '识别选择点中');

    const choicePointPrompt = `分析以下小说章节，识别所有潜在选择点。

【小说类型】${novelType}
【识别重点】${typeSpecificInstructions[novelType] || '识别影响剧情走向的关键选择'}

【选择点类型定义】
1. 意图-行动分离型：角色想做A但最终做B（如"想去找他，但..."）
2. 命运转折暗示型：叙事暗示"如果当初...就会..."（如"若不是..."、"差点..."）
3. 对话沉默型：对话中有未说出口的选项（如沉默、欲言又止）
4. 情节岔路型：角色面临多个选项但只执行了一个（如"选择了..."、"决定..."）

【世界观】
${worldSetting ? JSON.stringify(worldSetting, null, 2) : '无详细世界观设定'}

【章节内容】
${chapter.content}

请以JSON格式返回选择点列表（只返回importance >= 0.6的重要选择点）：
{
  "choicePoints": [
    {
      "location": "位置描述",
      "originalAction": "原著中的实际动作/选择",
      "situation": "当时情境描述",
      "character": "做选择的角色名",
      "isExclusive": false,
      "importance": 0.8,
      "alternatives": [
        {
          "type": "行动类/对话类/情感类/观察类/沉默类",
          "description": "替代选项描述",
          "triggerCondition": "触发条件描述",
          "triggerCharacters": ["角色A", "角色B"]
        }
      ]
    }
  ]
}`;

    let choicePoints = [];
    try {
      const cpResult = await generateWithAI(choicePointPrompt, 'deepseek', {
        maxTokens: MAX_TOKENS.CONTENT,
        jsonResponse: true
      });
      const jsonMatch = cpResult.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        choicePoints = data.choicePoints || [];
      }
    } catch (e) {
      console.error('Choice point recognition error:', e);
    }
    currentProgress += textStep;
    updateParseProgress(chapterId, currentProgress, generateImages ? '保存解析结果中' : '保存结果中');

    // 生成角色图片（立绘和卡片）— 逐个更新进度
    if (generateImages && characters.length > 0) {
      console.log(`[parseChapter] Generating images for ${characters.length} characters...`);
      const imageTotal = characters.length + scenes.length;
      const charWeight = characters.length / imageTotal * 50;
      const charStep = charWeight / characters.length;
      const novelType = novel.type || '其他';
      const charResults = [];
      for (let i = 0; i < characters.length; i++) {
        const portraitUrl = await generateCharacterPortrait(characters[i], novelType);
        const cardUrl = await generateCharacterCard(characters[i], novelType);
        charResults.push({ ...characters[i], portrait_url: portraitUrl, card_url: cardUrl });
        currentProgress += charStep;
        updateParseProgress(chapterId, Math.round(currentProgress), `生成角色图片 ${i + 1}/${characters.length}`);
      }
      characters = charResults;
    }

    // 生成场景背景图 — 逐个更新进度
    if (generateImages && scenes.length > 0) {
      console.log(`[parseChapter] Generating backgrounds for ${scenes.length} scenes...`);
      const imageTotal = characters.length + scenes.length;
      const sceneWeight = scenes.length / imageTotal * 50;
      const sceneStep = sceneWeight / scenes.length;
      const novelType = novel.type || '其他';
      const sceneResults = [];
      for (let i = 0; i < scenes.length; i++) {
        const backgroundUrl = await generateSceneBackground(scenes[i], novelType);
        sceneResults.push({ ...scenes[i], background_url: backgroundUrl });
        currentProgress += sceneStep;
        updateParseProgress(chapterId, Math.round(currentProgress), `生成场景图片 ${i + 1}/${scenes.length}`);
      }
      scenes = sceneResults;
    }

    // 更新章节的角色和场景（包含图片URL）
    db.prepare('UPDATE chapters SET characters = ?, scenes = ? WHERE id = ?')
      .run(JSON.stringify(characters), JSON.stringify(scenes), chapterId);

    // 存储选择点和备选分支
    const cpStmt = db.prepare(`
      INSERT INTO choice_points (id, chapter_id, order_index, location, original_action, situation, character_name, is_exclusive, importance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const altStmt = db.prepare(`
      INSERT INTO alternatives (id, choice_point_id, type, description, trigger_condition, trigger_characters)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < choicePoints.length; i++) {
      const cp = choicePoints[i];
      const cpId = `cp_${chapterId}_${i}`;

      cpStmt.run(
        cpId,
        chapterId,
        i,
        JSON.stringify({ paragraph: i, text: cp.location || '' }),
        cp.originalAction || '',
        cp.situation || '',
        cp.character || '',
        cp.isExclusive ? 1 : 0,
        cp.importance || 0.5
      );

      // 存储备选分支
      if (cp.alternatives && cp.alternatives.length > 0) {
        for (let j = 0; j < cp.alternatives.length; j++) {
          const alt = cp.alternatives[j];
          const altId = `alt_${cpId}_${j}`;

          altStmt.run(
            altId,
            cpId,
            alt.type || '行动类',
            alt.description || '',
            alt.triggerCondition || '',
            JSON.stringify(alt.triggerCharacters || [])
          );
        }
      }
    }

    // 存储软章节结束点
    if (softEndPoints.length > 0) {
      const sepStmt = db.prepare(`
        INSERT INTO soft_end_points (id, chapter_id, order_index, paragraph_index, location, reason, end_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < softEndPoints.length; i++) {
        const sep = softEndPoints[i];
        const sepId = `sep_${chapterId}_${i}`;

        sepStmt.run(
          sepId,
          chapterId,
          i,
          sep.paragraph || null,
          sep.location || '',
          sep.reason || '',
          sep.type || '其他'
        );
      }
    }

    // 标记章节已解析
    db.prepare('UPDATE chapters SET is_parsed = 1, parse_status = ?, parse_progress = 100, parse_step = ? WHERE id = ?').run('completed', '解析完成', chapterId);

    console.log(`[parseChapter] Chapter ${chapterId} parsed successfully`);
      } catch (error) {
        console.error('Chapter parse error:', error);
        db.prepare('UPDATE chapters SET parse_status = ?, parse_error = ? WHERE id = ?')
          .run('error', error.message, chapterId);
      }
    })();
  } catch (error) {
    console.error('Chapter parse error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 查询章节解析状态
router.get('/:novelId/chapter/:chapterId/parse-status', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const { novelId, chapterId } = req.params;

    const novel = db.prepare('SELECT id FROM novels WHERE id = ? AND user_id = ?')
      .get(novelId, req.user.id);
    if (!novel) {
      return res.status(404).json({ error: 'Novel not found' });
    }

    const chapter = db.prepare('SELECT is_parsed, parse_status, parse_error, parse_progress, parse_step FROM chapters WHERE id = ? AND novel_id = ?')
      .get(chapterId, novelId);
    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    res.json({
      chapterId,
      status: chapter.is_parsed ? 'completed' : (chapter.parse_status || 'pending'),
      progress: chapter.parse_progress || 0,
      step: chapter.parse_step || '',
      error: chapter.parse_error || null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// AI续写分支
router.post('/generate-branch', async (req, res) => {
  try {
    const { choicePointId, alternativeId, pathHistory, characterName } = req.body;

    if (!choicePointId || !alternativeId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // 获取选择点信息
    const choicePoint = db.prepare('SELECT * FROM choice_points WHERE id = ?').get(choicePointId);
    if (!choicePoint) {
      return res.status(404).json({ error: 'Choice point not found' });
    }

    // 获取备选分支
    const alternative = db.prepare('SELECT * FROM alternatives WHERE id = ?').get(alternativeId);
    if (!alternative) {
      return res.status(404).json({ error: 'Alternative not found' });
    }

    // 获取章节和小说信息
    const chapter = db.prepare('SELECT * FROM chapters WHERE id = ?').get(choicePoint.chapter_id);
    const novel = db.prepare('SELECT * FROM novels WHERE id = ?').get(chapter.novel_id);

    if (!novel || !chapter) {
      return res.status(404).json({ error: 'Novel or chapter not found' });
    }

    const worldSetting = novel.world_setting ? JSON.parse(novel.world_setting) : null;
    const location = choicePoint.location ? JSON.parse(choicePoint.location) : {};

    // 构建上下文
    const systemPrompt = `你是一个中国古典小说写作助手。用户正在体验小说《${novel.name}》的分支剧情。

【写作要求】
1. 续写150-300字
2. 必须以 ${characterName || choicePoint.character_name} 的视角叙述
3. 保持角色性格特征
4. 不得直接写其他角色的心理活动，只能通过外在行为推测
5. 保持原著的叙述风格（古风白话）
6. 不得使用现代词汇
7. 不透露后续章节的重要情节`;

    let userPrompt = `【当前情境】
${choicePoint.situation || '无详细情境描述'}

【原著原始选择】
${choicePoint.original_action || '无描述'}

【玩家选择的分支】
类型：${alternative.type}
描述：${alternative.description}
触发条件：${alternative.trigger_condition || '无'}

【路径历史】
${pathHistory ? JSON.stringify(pathHistory, null, 2) : '（无历史路径）'}

请续写这个分支的剧情，承接上文，自然发展到下一个段落或选择点。`;

    if (worldSetting) {
      userPrompt = `【世界观设定】
角色：${worldSetting.characters ? worldSetting.characters.map(c => `${c.name}(${c.role})`).join(', ') : '无'}
关系：${worldSetting.characters ? worldSetting.characters.flatMap(c => c.relationships || []).join(', ') || '无' : '无'}
背景：${worldSetting.description || worldSetting.setting || '无'}\n\n` + userPrompt;
    }

    // 调用AI生成
    let retries = 0;
    const maxRetries = 3;
    let generatedText = '';

    while (retries < maxRetries) {
      try {
        const result = await generateWithAI(
          `System: ${systemPrompt}\n\nUser: ${userPrompt}`,
          'deepseek',
          { maxTokens: 1024, temperature: 0.7 }
        );
        generatedText = result;
        break;
      } catch (e) {
        retries++;
        if (retries >= maxRetries) {
          throw new Error('AI generation failed after 3 attempts');
        }
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    res.json({
      generatedText,
      choicePointId,
      alternativeId,
      characterName: characterName || choicePoint.character_name
    });
  } catch (error) {
    console.error('Branch generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 更新进度
router.post('/progress', (req, res) => {
  try {
    const { novelId, chapterId, characterName, currentPosition, choices, completedBranches, unlockedCharacters } = req.body;

    if (!novelId || !chapterId || !characterName) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // 检查是否已存在进度
    const existingProgress = db.prepare(`
      SELECT * FROM user_progress
      WHERE user_id = ? AND novel_id = ? AND chapter_id = ? AND character_name = ?
    `).get(req.user.id, novelId, chapterId, characterName);

    if (existingProgress) {
      // 更新进度
      db.prepare(`
        UPDATE user_progress
        SET current_position = ?, choices = ?, completed_branches = ?, unlocked_characters = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        currentPosition || 0,
        choices ? JSON.stringify(choices) : existingProgress.choices,
        completedBranches ? JSON.stringify(completedBranches) : existingProgress.completed_branches,
        unlockedCharacters ? JSON.stringify(unlockedCharacters) : existingProgress.unlocked_characters,
        existingProgress.id
      );
    } else {
      // 创建新进度
      const progressId = `progress_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      db.prepare(`
        INSERT INTO user_progress (id, user_id, novel_id, chapter_id, character_name, current_position, choices, completed_branches, unlocked_characters)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        progressId,
        req.user.id,
        novelId,
        chapterId,
        characterName,
        currentPosition || 0,
        choices ? JSON.stringify(choices) : '[]',
        completedBranches ? JSON.stringify(completedBranches) : '[]',
        unlockedCharacters ? JSON.stringify(unlockedCharacters) : '[]'
      );
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取进度
router.get('/:novelId/progress', (req, res) => {
  try {
    const { novelId } = req.params;

    // 获取该小说的所有进度
    const progress = db.prepare(`
      SELECT * FROM user_progress WHERE user_id = ? AND novel_id = ?
    `).all(req.user.id, novelId);

    // 按章节分组
    const chapterProgress = {};
    for (const p of progress) {
      if (!chapterProgress[p.chapter_id]) {
        chapterProgress[p.chapter_id] = [];
      }
      chapterProgress[p.chapter_id].push({
        characterName: p.character_name,
        currentPosition: p.current_position,
        choices: p.choices ? JSON.parse(p.choices) : [],
        completedBranches: p.completed_branches ? JSON.parse(p.completed_branches) : [],
        unlockedCharacters: p.unlocked_characters ? JSON.parse(p.unlocked_characters) : []
      });
    }

    // 获取章节完成度
    const chapters = db.prepare('SELECT id, is_parsed FROM chapters WHERE novel_id = ?').all(novelId);
    const chaptersWithProgress = chapters.map(ch => {
      const progressList = chapterProgress[ch.id] || [];
      const totalChoices = progressList.reduce((sum, p) => sum + (p.choices?.length || 0), 0);
      return {
        chapterId: ch.id,
        isParsed: !!ch.is_parsed,
        charactersExplored: [...new Set(progressList.map(p => p.characterName))],
        progressList
      };
    });

    res.json({
      novelId,
      chapters: chaptersWithProgress
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除小说
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM novels WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Novel not found' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取小说的当前叙事状态
router.get('/narrative-state/:novelId', (req, res) => {
  try {
    const { novelId } = req.params;

    // 获取该小说最新的叙事快照
    const latestSnapshot = db.prepare(`
      SELECT * FROM narrative_snapshots
      WHERE user_id = ? AND novel_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(req.user.id, novelId);

    if (!latestSnapshot) {
      return res.json({
        novelId,
        hasSnapshot: false,
        snapshot: null
      });
    }

    res.json({
      novelId,
      hasSnapshot: true,
      snapshot: {
        id: latestSnapshot.id,
        chapterId: latestSnapshot.chapter_id,
        adaptationLevel: latestSnapshot.adaptation_level,
        createdAt: latestSnapshot.created_at,
        data: JSON.parse(latestSnapshot.snapshot_data)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 保存叙事快照
router.post('/narrative-snapshot', (req, res) => {
  try {
    const { novelId, chapterId, snapshotData, adaptationLevel } = req.body;

    if (!novelId || !chapterId || !snapshotData) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // 获取最新的快照（不限定章节）用于合并
    const latestSnapshot = db.prepare(`
      SELECT * FROM narrative_snapshots
      WHERE user_id = ? AND novel_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(req.user.id, novelId);

    // 合并快照数据
    let mergedData = {
      keyChoices: [],
      characterRelationshipChanges: [],
      locationChanges: [],
      inventoryChanges: [],
      narrativeSummary: ''
    };

    if (latestSnapshot) {
      const existingData = JSON.parse(latestSnapshot.snapshot_data);
      mergedData = {
        keyChoices: [...(existingData.keyChoices || [])],
        characterRelationshipChanges: [...(existingData.characterRelationshipChanges || [])],
        locationChanges: [...(existingData.locationChanges || [])],
        inventoryChanges: [...(existingData.inventoryChanges || [])],
        narrativeSummary: existingData.narrativeSummary || ''
      };
    }

    // 添加新的选择到关键选择
    if (snapshotData.keyChoices && snapshotData.keyChoices.length > 0) {
      mergedData.keyChoices.push(...snapshotData.keyChoices);
    }

    // 合并角色关系变化
    if (snapshotData.characterRelationshipChanges && snapshotData.characterRelationshipChanges.length > 0) {
      mergedData.characterRelationshipChanges.push(...snapshotData.characterRelationshipChanges);
    }

    // 合并地点变化
    if (snapshotData.locationChanges && snapshotData.locationChanges.length > 0) {
      mergedData.locationChanges.push(...snapshotData.locationChanges);
    }

    // 合并物品变化
    if (snapshotData.inventoryChanges && snapshotData.inventoryChanges.length > 0) {
      mergedData.inventoryChanges.push(...snapshotData.inventoryChanges);
    }

    // 更新叙事摘要
    if (snapshotData.narrativeSummary) {
      mergedData.narrativeSummary = snapshotData.narrativeSummary;
    }

    const snapshotId = latestSnapshot?.id || `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    if (latestSnapshot) {
      // 更新现有快照（使用同一个ID，不创建新的）
      db.prepare(`
        UPDATE narrative_snapshots
        SET chapter_id = ?, snapshot_data = ?, adaptation_level = ?, created_at = datetime('now')
        WHERE id = ?
      `).run(
        chapterId,
        JSON.stringify(mergedData),
        adaptationLevel || latestSnapshot.adaptation_level || 'light',
        latestSnapshot.id
      );
    } else {
      // 创建新快照
      db.prepare(`
        INSERT INTO narrative_snapshots (id, user_id, novel_id, chapter_id, snapshot_data, adaptation_level)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        snapshotId,
        req.user.id,
        novelId,
        chapterId,
        JSON.stringify(mergedData),
        adaptationLevel || 'light'
      );
    }

    res.json({ success: true, snapshotId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取所有叙事快照（用于分支历史可视化）
router.get('/narrative-snapshots/:novelId', (req, res) => {
  try {
    const { novelId } = req.params;

    const snapshots = db.prepare(`
      SELECT * FROM narrative_snapshots
      WHERE user_id = ? AND novel_id = ?
      ORDER BY created_at ASC
    `).all(req.user.id, novelId);

    res.json({
      novelId,
      snapshots: snapshots.map(s => ({
        id: s.id,
        chapterId: s.chapter_id,
        adaptationLevel: s.adaptation_level,
        createdAt: s.created_at,
        data: JSON.parse(s.snapshot_data)
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// AI章节内容改编
router.post('/adapt-chapter', async (req, res) => {
  try {
    const { novelId, chapterId, characterName, adaptationLevel } = req.body;

    if (!novelId || !chapterId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // 获取章节内容
    const chapter = db.prepare('SELECT * FROM chapters WHERE id = ?').get(chapterId);
    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    // 获取小说信息
    const novel = db.prepare('SELECT * FROM novels WHERE id = ?').get(novelId);
    if (!novel) {
      return res.status(404).json({ error: 'Novel not found' });
    }

    // 获取最新的叙事快照
    const latestSnapshot = db.prepare(`
      SELECT snapshot_data FROM narrative_snapshots
      WHERE user_id = ? AND novel_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(req.user.id, novelId);

    const level = adaptationLevel || latestSnapshot?.adaptation_level || 'light';
    const snapshotData = latestSnapshot ? JSON.parse(latestSnapshot.snapshot_data) : null;

    // 构建改编prompt
    const worldSetting = novel.world_setting ? JSON.parse(novel.world_setting) : null;

    let adaptationContext = '';
    if (snapshotData) {
      const ctx = buildNarrativeContext(snapshotData, level);
      adaptationContext = ctx;
    }

    const systemPrompt = `你是一个中国古典小说改编助手。玩家正在体验小说《${novel.name}》。

【改编级别】：${level === 'full' ? '完全改编' : '轻度改编'}
${level === 'full'
  ? '你可以大幅修改原著内容，确保故事符合玩家选择的叙事状态。'
  : '你只能进行微调，保留原著主线剧情，仅在必要时调整细节。'}

【写作要求】：
1. 改编字数控制在原著的80%-120%之间
2. 必须以 ${characterName || '主角'} 的视角叙述
3. 保持角色性格特征
4. 不得直接写其他角色的心理活动，只能通过外在行为推测
5. 保持原著的叙述风格（古风白话）
6. 不透露后续章节的重要情节
7. 关键叙事状态必须遵守（如已发生的角色关系变化、已做出的选择等）`;

    let userPrompt = `【原著章节内容】
${chapter.content}

${adaptationContext}

请根据上述叙事状态，对原著章节进行改编，使其符合玩家当前的选择历史和叙事状态。`;

    if (worldSetting) {
      userPrompt = `【世界观设定】
角色：${worldSetting.characters ? worldSetting.characters.map(c => `${c.name}(${c.role})`).join(', ') : '无'}
关系：${worldSetting.characters ? worldSetting.characters.flatMap(c => c.relationships || []).join(', ') || '无' : '无'}
背景：${worldSetting.description || worldSetting.setting || '无'}\n\n` + userPrompt;
    }

    // 调用AI生成
    const result = await generateWithAI(
      `System: ${systemPrompt}\n\nUser: ${userPrompt}`,
      'deepseek',
      { temperature: level === 'full' ? 0.8 : 0.5 }
    );

    // 一致性检查：如果有叙事状态，进行验证
    let consistencyCheck = null;
    if (snapshotData && snapshotData.keyChoices && snapshotData.keyChoices.length > 0) {
      consistencyCheck = await performConsistencyCheck(
        result.text,
        snapshotData,
        characterName || '主角',
        novel.name
      );
    }

    res.json({
      originalContent: chapter.content,
      adaptedContent: result.text,
      adaptationLevel: level,
      hasAdaptation: !!snapshotData,
      consistencyCheck
    });
  } catch (error) {
    console.error('Chapter adaptation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 构建叙事上下文
function buildNarrativeContext(snapshotData, level) {
  if (!snapshotData) return '';

  const contextParts = [];

  // 关键选择
  if (snapshotData.keyChoices && snapshotData.keyChoices.length > 0) {
    const choicesSummary = snapshotData.keyChoices.map(c =>
      `- ${c.description || c.alternativeDescription || '未知选择'}`
    ).join('\n');
    contextParts.push(`【玩家已做出的关键选择】\n${choicesSummary}`);
  }

  // 角色关系变化
  if (snapshotData.characterRelationshipChanges && snapshotData.characterRelationshipChanges.length > 0) {
    const relationships = snapshotData.characterRelationshipChanges.map(r =>
      `- ${r.character1} 与 ${r.character2}：${r.change}（${r.description || ''}）`
    ).join('\n');
    contextParts.push(`【角色关系变化】\n${relationships}`);
  }

  // 地点变化
  if (snapshotData.locationChanges && snapshotData.locationChanges.length > 0) {
    const locations = snapshotData.locationChanges.map(l =>
      `- 从 ${l.from} 到 ${l.to}（${l.reason || ''}）`
    ).join('\n');
    contextParts.push(`【地点变化】\n${locations}`);
  }

  // 物品变化
  if (snapshotData.inventoryChanges && snapshotData.inventoryChanges.length > 0) {
    const items = snapshotData.inventoryChanges.map(i =>
      `- ${i.item}：${i.action === 'gained' ? '获得' : '失去'}（${i.description || ''}）`
    ).join('\n');
    contextParts.push(`【物品变化】\n${items}`);
  }

  // 轻度改编只显示摘要
  if (level === 'light' && contextParts.length > 0) {
    return `【叙事状态摘要】\n玩家在此前的选择中产生了一些叙事变化，请确保改编内容符合这些变化。\n`;
  }

  return contextParts.join('\n\n');
}

// 一致性检查：验证改编内容是否符合叙事状态
async function performConsistencyCheck(adaptedContent, snapshotData, characterName, novelName) {
  const keyChoices = snapshotData.keyChoices || [];
  const relationships = snapshotData.characterRelationshipChanges || [];

  if (keyChoices.length === 0 && relationships.length === 0) {
    return { passed: true, issues: [] };
  }

  const checkPrompt = `【一致性检查任务】
你是一个小说质量检查员。请检查以下改编后的内容是否违反了既定的叙事状态。

【小说名称】：《${novelName}》
【主角视角】：${characterName}

【改编后内容】
${adaptedContent.substring(0, 2000)}

【需要检查的叙事状态】`;

  let issues = [];

  if (keyChoices.length > 0) {
    issues.push(...keyChoices.slice(-3).map(c =>
      `关键选择：${c.description || '未知选择'}（类型：${c.type || '未指定'}）`
    ));
  }

  if (relationships.length > 0) {
    issues.push(...relationships.slice(-3).map(r =>
      `角色关系：${r.character1} 与 ${r.character2} - ${r.change}`
    ));
  }

  const fullCheckPrompt = checkPrompt + '\n\n' + issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n') + `

请检查改编内容是否存在以下问题：
1. 角色关系与上述既定状态矛盾
2. 地点/场景与既定的变化矛盾
3. 物品获取/失去状态矛盾
4. 关键选择的后果未体现

请以JSON格式返回检查结果：
{
  "passed": true/false,
  "issues": ["问题1描述", "问题2描述"],
  "warnings": ["警告1描述"]
}`;

  try {
    const result = await generateWithAI(
      `System: 你是一个严格的质量检查员。请仔细检查内容一致性。\n\nUser: ${fullCheckPrompt}`,
      'deepseek',
      { temperature: 0.3 }
    );

    // 尝试解析JSON结果
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          passed: parsed.passed !== false,
          issues: parsed.issues || [],
          warnings: parsed.warnings || []
        };
      } catch (e) {
        // JSON解析失败，返回原始文本检查
        return {
          passed: !result.text.includes('矛盾') && !result.text.includes('违反'),
          issues: [],
          warnings: [result.text.substring(0, 200)]
        };
      }
    }

    return {
      passed: !result.text.includes('矛盾') && !result.text.includes('违反'),
      issues: [],
      warnings: [result.text.substring(0, 200)]
    };
  } catch (error) {
    console.error('Consistency check error:', error);
    return { passed: true, issues: [], warnings: ['一致性检查执行失败'] };
  }
}

export default router;
