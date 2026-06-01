export const defaultWorld = {
  name: "",
  description: "",
  imageUrl: "",
  worldMap: null // Mermaid 世界地图代码
};

export const defaultCharacter = {
  id: "",
  name: "",
  age: "",
  gender: "",
  personality: "",
  appearance: "",
  imageUrl: "",
  isProtagonist: false,
  currentSceneId: null,
  background: "",
  // 角色技能列表 - 主角专用
  skills: [], // 技能数组，格式：[{ name: "技能名", description: "技能解释" }, ...]
  // 角色状态属性
  hp: 100,
  maxHp: 100,
  mp: 50,
  maxMp: 50,
  status: "", // 状态效果：中毒、麻痹等
  // 角色详细状态 - 新增
  characterStatus: {
    // 性格与心理指标（生成角色时确定）
    personalityTraits: {
      extroversion: 50, // 外向-内向 (0-100)
      rationality: 50, // 理性-感性 (0-100)
      orderliness: 50, // 守序-混乱 (0-100)
      optimism: 50 // 乐观-悲观 (0-100)
    },
    selfAwareness: 50, // 自我意识 (0-100) - 根据性格设置，以50为基准：高自我意识更注重自我形象和隐私
    mentalStress: 20, // 精神压力 (0-100)
    // 关系与互动指标
    relationship: {
      affection: 50, // 对主角好感度 (0-100)
      trust: 50, // 对主角信赖度 (0-100)
      obedience: 30, // 对主角服从度 (0-100)
      specialTags: [] // 特殊关系标签，如 ["欠你一次人情"]
    },
    // 外貌与身体状态
    physicalAppearance: {
      hairStyle: "", // 发型，如 "长直发"、"短卷发"
      hairColor: "", // 发色，如 "黑色"、"金色"
      eyeColor: "", // 瞳色，如 "蓝色"、"琥珀色"
      bodyType: "", // 体型，如 "高挑"、"娇小"、"匀称"
      height: "", // 身高，如 "170cm"、"180cm"
      clothing: "" // 当前穿着，如 "法师长袍"、"便装"
    },
    // 身体状态（动态变化）- 初始值在50-70之间
    physicalState: {
      health: 60, // 健康度 0-100
      energy: 65 // 精力/疲劳度 0-100
    },
    // 表情与情绪
    expression: {
      currentExpression: "自然", // 当前表情：自然、微笑、严肃、惊讶、害羞、愤怒、悲伤、担忧
      expressionIntensity: "平静", // 情绪强度：平静、轻微、中等、强烈
      facialDetails: "" // 面部细节描述，如 "嘴角上扬"、"眉头微皱"
    },
    // 状态与能力
    currentEmotion: "平静", // 当前情绪：平静、愉悦、困惑、恼怒等
    abilities: {}, // 能力，如 { "学业能力": "优等生" }
    stateTags: [], // 状态标签
    // 收服与跟随状态
    isCaptured: false, // 是否被主角收服
    followsPlayer: false, // 是否跟随主角移动
    // 收服后的称呼设定
    playerTitle: '', // 角色对玩家的称呼（如：主人、老大、哥哥等）
    playerSelfReference: '', // 角色对自己的称呼（如：属下、奴家、我等）
  }
};

export const defaultScene = {
  id: "",
  name: "",
  description: "",
  imageUrl: "",
  // 四个时间段的场景图片：早晨、中午、傍晚、晚上
  sceneImages: {
    morning: "", // 早晨 (6:00-10:00)
    noon: "",    // 中午 (10:00-14:00)
    evening: "", // 傍晚 (14:00-18:00)
    night: ""    // 晚上 (18:00-6:00)
  },
  connectedScenes: [],
  npcs: [],
  isIndoor: null // true=室内, false=室外, null=未设置
};

export const initialGameState = {
  version: "1.0",
  world: { ...defaultWorld },
  characters: [],
  scenes: [],
  currentSceneId: null,
  dialogueHistory: [],
  gameMode: null, // 游戏模式：'story' 剧情模式, 'free' 自由模式
  characterMemories: {}, // 角色对话记忆：{ characterId: { memories: [], lastInteraction: null } }
  characterCurrentDialogues: {}, // 角色当前对话（未压缩）：{ characterId: [{ speaker, text }, ...] }
  // 旁白记忆和上下文
  narratorMemories: [], // 旁白记忆：[{ id, content, impactLevel, importance, timestamp, sceneId }]
  narratorContext: [], // 旁白上下文（最近的对话/动作）
  // 玩家状态栏
  playerStatus: {
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    status: "",
    gold: 0,
    level: 1,
    exp: 0
  },
  // 主角性格状态 - 随对话变化
  protagonistPersonality: {
    personalityTraits: {
      extroversion: 50, // 外向-内向 (0-100)
      rationality: 50, // 理性-感性 (0-100)
      orderliness: 50, // 守序-混乱 (0-100)
      optimism: 50 // 乐观-悲观 (0-100)
    },
    currentMood: "平静", // 当前情绪
    personalityDescription: "" // 性格描述，从主角设定同步
  },
  // 游戏时间系统
  gameTime: {
    year: 2017,
    month: 9,
    day: 1,
    hour: 8, // 默认早上8点开始
    minute: 0,
    dayOfWeek: 5 // 2017年9月1日是周五，1=周一，7=周日
  },
  createdAt: null,
  updatedAt: null,
  // 草稿创建进度
  isDraft: false,
  creationStep: null, // 'world' | 'protagonist' | 'character' | 'scene' | null
  draftSaveId: null,  // 后端 saves 表中的草稿 ID
  draftWorldId: null  // 后端 worlds 表中的占位世界观 ID
};

export const sampleWorldPrompt = `生成一个奇幻世界观设定，包含：
1. 世界名称
2. 简要描述（200字以内）
3. 核心特色

请用JSON格式返回：
{
  "name": "世界名称",
  "description": "世界描述"
}`;

export const sampleCharacterPrompt = `生成一个角色设定，包含：
1. 角色姓名
2. 性格特点（详细描述）
3. 外貌描述
4. 根据性格分析，生成性格指标（0-100）：
   - extroversion: 外向程度（0=非常内向，100=非常外向）
   - rationality: 理性程度（0=非常感性，100=非常理性）
   - orderliness: 守序程度（0=非常混乱，100=非常守序）
   - optimism: 乐观程度（0=非常悲观，100=非常乐观）
5. 根据性格计算自我意识（以50为基准，根据性格特点调整）：
   - 独立、强势、有主见的角色：自我意识较高（60-80）
   - 温和、顺从、缺乏主见的角色：自我意识较低（30-50）
   - 普通角色：自我意识在45-55之间

请用JSON格式返回：
{
  "name": "角色名",
  "personality": "性格描述",
  "appearance": "外貌描述",
  "personalityTraits": {
    "extroversion": 0-100,
    "rationality": 0-100,
    "orderliness": 0-100,
    "optimism": 0-100
  },
  "selfAwareness": 0-100
}`;

export const sampleScenePrompt = `生成一个场景设定，包含：
1. 场景名称（必须是地点名称，不能包含任何人名或角色名，比如：森林入口、神秘洞穴、城镇广场等）
2. 场景描述
3. isIndoor：是否为室内场景（true=室内，false=室外）
4. 如果是室内场景，还需要提取或补充：
   - spaceType: 空间类型（如"客厅"、"卧室"、"酒馆大厅"、"洞穴内部"等）
   - decorationStyle: 装修风格（如"中世纪欧式"、"现代简约"、"奇幻风格"、"原始洞穴"等）
   - mainFurniture: 主要家具陈设
   - colorScheme: 色彩搭配
   - lightSource: 光线来源
   - atmosphere: 氛围描述
   - viewAngle: 视角描述
5. 如果是室外场景，还需要提取或补充：
   - location: 地理位置/地形（如"山谷"、"山顶"、"森林"、"海岸"等）
   - seasonTime: 季节/时间（如"秋日黄昏"、"春日清晨"等）
   - naturalElements: 主要自然元素（如山、树、河流、岩石等）
   - skyDescription: 天空描述
   - lightDescription: 光线描述
   - colorAtmosphere: 色彩氛围
   - layout: 前景/中景/远景布局
   - photographer: 参考摄影师风格（如"Ansel Adams"、"National Geographic"等）

请用JSON格式返回：
{
  "name": "场景名",
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
  "photographer": "参考摄影师风格"
}`;
