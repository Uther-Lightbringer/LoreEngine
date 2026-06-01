# LoreEngine

AI-driven interactive visual novel engine / AI 驱动的互动视觉小说引擎

Create worlds, summon characters, and let AI weave your story.
构建世界，召唤角色，让 AI 编织你的故事。

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57?logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

---

## What is LoreEngine? / 什么是 LoreEngine？

**EN** — LoreEngine is a self-hosted visual novel platform where AI generates the narrative. You define the world and its inhabitants, and the engine takes care of the rest — dialogue, scene descriptions, branching choices, and even illustrations.

**CN** — LoreEngine 是一个可自部署的视觉小说平台，由 AI 驱动叙事。你只需定义世界和角色，引擎负责其余一切——对话、场景描写、分支选择，甚至插画生成。

### Key Features / 核心特性

| | Feature | 特性 |
|---|---------|------|
| 🌍 | **World Building** — Define settings, lore, and atmosphere | **世界构建** — 定义背景设定、世界观与氛围 |
| 🧙 | **AI Characters** — Create characters with personalities; AI brings them to life | **AI 角色** — 创建有性格的角色，AI 赋予其生命 |
| 🔀 | **Branching Narrative** — Make choices that shape the story in real time | **分支叙事** — 你的选择实时影响故事走向 |
| 🎨 | **AI Illustrations** — Text-to-image and image-to-image generation | **AI 插画** — 文生图与图生图自动生成场景和角色 |
| 🧠 | **Character Memory** — Characters remember past interactions and evolve | **角色记忆** — 角色记住过往交互并不断演进 |
| ⏳ | **Timeline & Time Travel** — Scroll back and revisit key moments | **时间线与时间旅行** — 回溯历史，重温关键时刻 |
| 🌐 | **Multi-World** — Switch between independent story worlds | **多世界** — 在独立的故事世界间自由切换 |
| 🔐 | **User Auth** — Admin and regular user roles with access control | **用户认证** — 管理员与普通用户权限分离 |

## Tech Stack / 技术栈

| Layer / 层 | Technology / 技术 |
|------------|-------------------|
| Frontend / 前端 | React 19, Vite 8, JavaScript (JSX) |
| Backend / 后端 | Express.js (ESM), better-sqlite3, multer |
| Database / 数据库 | SQLite (better-sqlite3) |
| AI Text / AI 文本 | DeepSeek / OpenAI / Anthropic / Custom / 自定义 |
| AI Image / AI 图像 | Evolink / MiniMax / Custom / 自定义 |
| Deploy / 部署 | Docker + docker-compose |

## Getting Started / 快速开始

### Prerequisites / 前置条件

- Node.js 18+
- npm

### 方式一：桌面启动器（推荐）/ Desktop Launcher (Recommended)

双击 `launcher-app/dist/LoreEngine-Launcher/LoreEngine Launcher.exe` 即可启动。

Double-click the launcher exe to start — no terminal needed.

- 首次运行自动检测项目路径，或手动选择目录 / Auto-detects project path on first run
- 一键启动前端 + 后端 / One-click start for both frontend and backend
- 实时查看前端/后端日志 / Real-time log viewer for both services
- 关闭窗口自动停止所有服务 / Closing the window stops all services

![Launcher](img/launcher.png)

### 方式二：命令行 / Command Line

#### Install / 安装

```bash
npm run install:all
```

#### Configure / 配置

1. 复制环境变量示例文件 / Copy the example env files:

```bash
cp server/.env.example server/.env
```

2. 编辑 `server/.env`，至少配置一个 AI 提供商 / Edit `server/.env` — at minimum, set one AI provider:

```env
DEEPSEEK_API_KEY=your_api_key_here
ADMIN_PASSWORD=your_secure_password
```

> 完整配置项见 / See [server/.env.example](server/.env.example) for all options.

3. （可选）预配置前端 API 密钥 / (Optional) Pre-configure frontend API keys:

```bash
cp src/config.example.js src/config.js
```

#### Run / 运行

```bash
# 一键启动（自动检查配置和依赖）/ One-click start (auto-checks config & deps)
npm run start:dev

# 或使用 concurrently / Or use concurrently
npm run dev

# 生产构建 / Production build
npm run build
npm run start:prod
```

首次启动时自动创建管理员账号，密码由 `ADMIN_PASSWORD` 环境变量设定（默认: `admin123`）。

On first launch, an admin account is created automatically. The password is set via the `ADMIN_PASSWORD` environment variable (default: `admin123`).

### Docker

```bash
docker-compose up -d
```

访问 / Access at `http://localhost:8080`，然后配置 API 密钥 / Then configure API keys:

```bash
docker exec -it lore-engine sh
vi /app/server/.env
docker restart lore-engine
```

## Architecture / 架构总览

前端不直接调用 AI 提供商，所有 AI/图像请求经过后端代理：

The frontend does NOT call AI providers directly. All AI/image requests go through the backend proxy:

```
浏览器 → Vite proxy (/api) → Express 后端 → AI 提供商 API
Browser → Vite proxy (/api) → Express backend → AI provider APIs
```

### Frontend Routes / 前端路由

| Path / 路径 | Page / 页面 |
|---|---|
| `/login` | 登录 / Login |
| `/` | 主菜单 / Main Menu |
| `/create/world` | 创建世界观 / World Creation |
| `/create/protagonist` | 创建主角 / Protagonist Creation |
| `/create/character` | 创建角色 / Character Creation |
| `/create/scene` | 创建场景 / Scene Creation |
| `/play` | 游戏主界面 / Gameplay |
| `/story` | 剧情模式设置 / Story Mode Setup |
| `/admin` | 用户管理（仅管理员）/ User Management (admin only) |

### Frontend State / 前端状态管理

React Context + `useReducer`（`src/store/gameState.jsx`），管理约 25 种 action 类型：

- 世界观/角色/场景 CRUD
- 对话历史
- 角色记忆（`characterMemories` + `characterCurrentDialogues`）
- 叙述者记忆（`narratorMemories` + `narratorContext`）
- 玩家状态（HP/MP/金币/等级/经验）
- 主角性格特征（外向/理性/秩序/乐观 + 心情）
- 游戏时间系统（自定义 30 天月份、7 天周）

---

## Memory System / 记忆系统

LoreEngine 的记忆系统分为**角色记忆**和**叙述者记忆**两个子系统，让 AI 在生成对话时能够参考角色过去的经历和关系变化。

The memory system has two subsystems: **Character Memory** and **Narrator Memory**, enabling AI to reference past experiences and relationship changes during dialogue generation.

### Character Memory / 角色记忆

#### Data Structure / 数据结构

每个角色维护两个存储 / Each character maintains two stores:

- **`characterCurrentDialogues[charId]`** — 当前对话会话的原始记录（未压缩）/ Raw dialogue of the current session (uncompressed)
- **`characterMemories[charId].memories`** — 经过 AI 压缩的长期记忆 / AI-compressed long-term memories

每条记忆对象 / Each memory object:

| Field / 字段 | Type / 类型 | Description / 说明 |
|---|---|---|
| `id` | string | 唯一标识 / Unique ID |
| `content` | string | 记忆内容 / Memory content |
| `timestamp` | ISO string | 创建时间 / Creation time |
| `importance` | 1-10 | 重要度，影响保留优先级和 AI 提示词选择 / Priority for retention and prompt selection |
| `gameTime` | object | 游戏内时间 `{ year, month, day, hour, minute }` / In-game time |
| `isTraumaticMemory` | boolean | 是否为创伤记忆（如暴力压制）/ Trauma flag (e.g., from violent suppression) |
| `requiresHealing` | boolean | 是否需要关系修复才能消除 / Needs relationship healing to remove |
| `expiresInDays` | number/null | 过期天数（null = 永久），用于临时移动记忆 / Game-days until expiry (null = permanent) |

#### Memory Lifecycle / 记忆生命周期

```
对话发生 / Dialogue occurs
  │
  ▼
ADD_CHARACTER_CURRENT_DIALOGUE  →  characterCurrentDialogues[charId]（原始未压缩 / raw）
  │
  ▼ （切换角色 / 会话结束时 / when session ends）
compressAndSaveMemories()
  │
  ├─→ extractMemoriesFromDialogue()  →  AI 提取 / AI extracts [{ content, importance }]
  │       │
  │       ▼ （AI 不可用时 / if AI unavailable）
  │    extractMemoriesHeuristically()  →  关键词匹配 / Keyword-based extraction
  │
  ├─→ mergeMemories(old, new)  →  去重合并，保留 top 20 / Dedup & merge, keep top 20
  │       │
  │       ▼ （合并后 > 20 条 / if > 20 after merge）
  │    consolidateMemoriesWithAI()  →  AI 合并为 ~5 条核心记忆 / AI merges into ~5 core memories
  │
  ├─→ dispatch UPDATE_CHARACTER_MEMORIES  →  characterMemories[charId].memories
  │
  ├─→ saveMemoriesToDatabase()  →  POST /api/memories/batch
  │       │
  │       ▼ （数据库不可用时 / if DB unavailable）
  │    saveMemoriesToStorage()  →  localStorage 备份 / localStorage fallback
  │
  └─→ dispatch CLEAR_CHARACTER_CURRENT_DIALOGUE  →  清除原始会话 / Clear raw session
```

#### AI Memory Extraction / AI 记忆提取

`extractMemoriesFromDialogue()` 将最近 20 条对话发送给 AI，提取 11 类信息：

Sends the last 20 dialogue entries to AI, extracting 11 categories:

1. 个人信息 / Personal info
2. 喜好 / Likes & dislikes
3. 重要事件 / Important experiences
4. 目标 / Goals
5. 秘密 / Secrets
6. 关系变化 / Relationship changes
7. 承诺 / Promises
8. 共同经历 / Shared experiences
9. 主角重要发言 / Important protagonist statements
10. 角色重要发言 / Important character statements
11. 特殊技能使用 / Special skill usage

AI 不可用时使用关键词匹配的启发式提取（`extractMemoriesHeuristically()`）。

When AI is unavailable, a heuristic keyword-matching fallback is used.

#### Memory Dedup & Merge / 记忆去重与合并

- **相似度计算**：Jaccard 词重叠 + 前 20 字符精确匹配 / Jaccard word overlap + first-20-char exact match
- **合并策略**：新记忆优先，相似记忆保留重要度更高的，排序后保留 top 20 / New memories first, keep higher importance for similar ones, cap at 20
- **AI 压缩**：20+ 条记忆触发 AI 合并为 5 条核心记忆，失败时回退到按重要度取 top 5 / 20+ memories triggers AI consolidation into 5 core; falls back to top-5 by importance

#### Direct Memory Writes / 直接记忆写入

以下游戏事件直接通过 `ADD_CHARACTER_MEMORY` 写入，不经提取流程：

These game events bypass the extraction flow and write memories directly:

| Event / 事件 | Importance / 重要度 | Special / 特殊标记 |
|---|---|---|
| 场景移动 / Scene movement | 3 | `expiresInDays: 3`（临时 / temporary） |
| 跟随移动 / Following movement | 3 | `expiresInDays: 3`（临时 / temporary） |
| 暴力压制 / Violent suppression | 9 | `isTraumaticMemory, requiresHealing` |
| 压制未遂 / Failed suppression | 8 | `isTraumaticMemory, requiresHealing` |
| 被捕获 / Captured | 10 | — |
| 称号设定 / Title setting | 10 | — |

#### Database Persistence / 数据库持久化

`character_memories` 表存储整个记忆数组为 JSON 字符串：

The `character_memories` table stores the entire memory array as a JSON string:

```sql
CREATE TABLE character_memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  world_id INTEGER NOT NULL,
  character_id TEXT NOT NULL,
  memories TEXT NOT NULL,           -- JSON 序列化的记忆数组
  last_interaction TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

前端通过 `useEffect` 监听 `characterMemories` 变化，1 秒防抖后自动同步到后端。

The frontend auto-syncs to the backend via a `useEffect` with 1-second debounce.

---

### Narrator Memory / 叙述者记忆

#### Data Structure / 数据结构

两个独立数组 / Two independent arrays:

- **`narratorMemories`** — 持久化重大事件日志，包含影响等级和重要度 / Persistent log of significant events with impact level and importance
- **`narratorContext`** — 最近 20 条上下文的滑动窗口 / Sliding window of the last 20 context entries

每条叙述者记忆 / Each narrator memory:

| Field / 字段 | Type / 类型 | Description / 说明 |
|---|---|---|
| `id` | string | 唯一标识 / Unique ID |
| `content` | string | 事件内容（玩家行为 + 叙述者回应）/ Event content (player action + narrator response) |
| `impactLevel` | string | 影响等级 / Impact level |
| `importance` | 1-10 | 重要度 / Importance |
| `timestamp` | ISO string | 时间戳 / Timestamp |
| `sceneId` | string | 发生场景 / Scene ID |

#### Impact Level System / 影响等级系统

叙述者 AI 为每个玩家行为判定影响等级，控制事件的传播范围：

The narrator AI assigns an impact level to each player action, controlling how far the event propagates:

| Level / 等级 | Meaning / 含义 | Memory Behavior / 记忆行为 |
|---|---|---|
| `无人知晓` | Only the player knows / 只有玩家知道 | **完全丢弃** — 不写入任何记忆 / **Discarded entirely** — no memory saved |
| `当前场景` | Characters in the scene know / 场景内角色知道 | 写入叙述者记忆 + 分发给场景内角色 / Saved + distributed to scene characters |
| `世界知晓` | Everyone in the world knows / 世界上所有人都知道 | 写入叙述者记忆 + 分发给所有角色 / Saved + distributed to all characters |

`无人知晓` 等级在 reducer 中被直接过滤（`ADD_NARRATOR_MEMORY` action 返回原 state），是最小隐私保护——私下行为不会成为任何角色的记忆。

The `无人知晓` (nobody knows) level is filtered at the reducer level — the action returns the original state unchanged. This is a privacy gate: private actions never become any character's memory.

#### Narrator Memory Flow / 叙述者记忆生成流程

```
玩家行动（无选中角色时）/ Player action (no selected character)
  │
  ▼
processNarratorResponse()  →  AI 返回 / returns { text, impactLevel, importance }
  │
  ▼
dispatch ADD_NARRATOR_MEMORY
  │
  ├─→ impactLevel === '无人知晓':  不执行任何操作 / No-op
  │
  ├─→ else: 写入 narratorMemories[] + narratorContext[]（滑动窗口 20 条 / sliding window of 20）
  │
  └─→ 基于影响等级分发给角色 / Distribute to characters based on impact:
       - '当前场景': addMemoryToCharacters() → 场景内角色 / scene characters
       - '世界知晓': addMemoryToCharacters() → 所有角色 / all characters
```

叙述者记忆没有独立的数据库表，通过完整游戏状态存档（`saves` 表的 `game_state` JSON 字段）持久化。

Narrator memories have no dedicated DB table — they are persisted as part of the full game state save (`saves.game_state` JSON column).

---

## AI Agent System / AI Agent 系统

### Supported Providers / 支持的提供商

#### Text Generation / 文本生成

| Provider / 提供商 | Default Base URL | Default Model / 默认模型 | Auth / 认证方式 |
|---|---|---|---|
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` | Bearer Token |
| OpenAI | `https://api.openai.com/v1` | `gpt-4` | Bearer Token |
| Anthropic | `https://api.anthropic.com/v1` | `claude-3-opus-20240229` | `x-api-key` Header |
| MiniMax | `https://api.minimaxi.com` | `M2-her` | Bearer Token |
| Custom / 自定义 | User-configured / 用户配置 | User-configured / 用户配置 | Bearer Token |

#### Image Generation / 图像生成

- **Evolink** — 文生图（`z-image-turbo`）和图生图（`doubao-seedream-5.0-lite`）/ Text-to-image and image-to-image
- **MiniMax** — 备选图像提供商 / Alternative image provider

提供商回退：若请求的提供商未配置 API Key，自动回退到 `DEFAULT_PROVIDER`（默认 `deepseek`）。

Provider fallback: if the requested provider has no API key, the system falls back to `DEFAULT_PROVIDER` (default: `deepseek`).

### Game Loop / 游戏主循环

```
玩家做出选择 / Player makes a choice (handleChoice / handleFreeInput)
  │
  ├─→ 前置检测 / Pre-checks：技能激活 / skill, 换装 / clothing, 捕获 / capture, 压制 / suppress, 称号 / title
  │
  ├─→ 玩家行为加入对话历史 / Add player action to dialogue
  │
  ├─→ 游戏时间推进 5-15 分钟 / Game time advances 5-15 min
  │
  ├─→ AI 生成回应 / AI generates response：
  │     ├─ 无选中角色 / No selected char → processNarratorResponse() → 叙述者回应 + 影响等级
  │     ├─ 单个角色 / Single char → generateSingleCharacterResponse() → 行为 + 对话 + 场景移动
  │     └─ 多个角色 / Multi char → startMultiCharacterResponses() → 逐个处理 / sequential
  │
  ├─→ 后处理 / Post-processing：
  │     ├─ updateCharacterStatus() → 关系数值 ±10 + 情绪 + 表情 / relationship ±10, emotion, expression
  │     ├─ updateProtagonistPersonality() → 主角性格特征 ±5 / personality drift ±5
  │     └─ 游戏时间再推进 5-15 分钟 / Time advances another 5-15 min
  │
  ├─→ 记忆处理 / Memory processing：
  │     ├─ 基于影响等级向角色分发记忆 / Distribute memories based on impact level
  │     ├─ 30+ 条记忆自动清理至 20 条 / Auto-cleanup at 30+ to 20
  │     └─ 取消选中角色时压缩对话为记忆 / Compress dialogues on character deselect
  │
  └─→ generateChoices() → 生成 2-3 个下一步选择 / Generate 2-3 next choices
```

### AI Prompt Construction / AI 提示词构建

所有游戏内 AI 提示词在 `src/components/SceneView.jsx` 中构建 / All in-game prompts built in `SceneView.jsx`:

| Scenario / 场景 | Context Injected / 注入上下文 | Output / 输出格式 |
|---|---|---|
| **选择生成 / Choice gen** | 世界 + 场景 + 主角性格/特征值/情绪 + 角色信息 + 最近 8 条对话 | `{ choices: [{ action, dialogue }] }` |
| **角色回应 / Character response** | 世界 + 场景 + 主角 + 角色详情/外貌/性格值 + 连接场景 + 时间影响 + 角色记忆 + 角色状态 + 玩家选择 | `{ shouldRespond, action, dialogue, moveTo }` |
| **叙述者回应 / Narrator** | 世界 + 场景 + 玩家行为 | `{ text, impactLevel, importance }` |
| **角色状态更新 / Status update** | 角色性格/背景 + 当前关系/情绪/表情 + 近期对话 | 关系数值 ±10、情绪、表情 |
| **主角性格更新 / Protagonist update** | 当前特征值 + 近期互动 | 特征值 ±5、当前情绪 |
| **记忆提取 / Memory extraction** | 最近 20 条对话 + 角色名 + 主角名 | `{ memories: [{ content, importance }] }` |
| **记忆压缩 / Memory consolidation** | 全部记忆（按重要度排序） | `{ consolidatedMemories: [{ content, importance }] }` |
| **技能/心法 / Mind power** | 主角 + 目标角色完整状态 + 用户输入 | 分析 + 性格/外貌/情绪/关系变化 |

### Image Prompt Styles / 图像提示词风格

**场景图 / Scene images**:
- 室内 / Indoor — 空间类型 + 装饰风格 + 家具 + 色彩 + 氛围 + 视角 + 建筑渲染风格
- 室外 / Outdoor — 地点 + 自然元素 + 布局 + 摄影风格 + 广角镜头 + 国家地理品质

**角色头像 / Character portraits**: 年龄 + 性别 + 面部细节 + 发色/发型 + 瞳色 + 体型 + 表情 + 服装 + 世界风格 + 专业人像摄影术语

### Story Mode AI / 剧情模式 AI

剧情模式（`StoryModeSetup.jsx` + `ImmersiveStoryRenderer.jsx`）提供三种入口 / Three entry paths:

1. **AI 生成故事 / AI-generated story** — 输入提示词，AI 依次生成世界观 → 主角 → 初始场景 → 配角
2. **小说上传 / Novel upload** — 上传 .txt 文件，AI 解析章节、提取角色/场景/选择点
3. **章节模式 / Chapter mode** — 基于已有世界观在章节框架内游玩

#### Novel Parsing Flow / 小说解析流程

```
上传 .txt / Upload novel
  │
  ├─→ detectNovelType()     →  AI 分类小说类型（言情/悬疑/奇幻/历史/都市/军事/科幻）
  │
  ├─→ extractWorldSetting()  →  从前 8000 字提取世界观/角色/设定
  │
  └─→ parse chapter / 解析章节：
       ├─→ 角色识别 / Character recognition
       ├─→ 场景识别 / Scene recognition
       ├─→ 软终止点检测 / Soft end-point detection（叙事停顿/转折）
       └─→ 选择点识别 / Choice point identification（意图分歧/命运转折/对话沉默/剧情分叉）
```

#### Branch Generation & Consistency / 分支生成与一致性检查

- **分支生成 / Branch generation** — 玩家选择不同路线时，AI 生成 150-300 字续写，保持原小说风格
- **章节适配 / Chapter adaptation** — 轻度适配（微调保持主线）或完整适配（大幅修改与玩家选择对齐）
- **一致性检查 / Consistency check** — 适配后二次 AI 校验，确保不与已建立的叙事状态矛盾
- **叙事快照 / Narrative snapshots** — 跨章节累积关键选择、关系变化、位置变化、物品变化

---

## AI Providers / AI 提供商

| Provider / 提供商 | Env Key / 环境变量 | Default Model / 默认模型 |
|-------------------|-------------------|------------------------|
| DeepSeek | `DEEPSEEK_API_KEY` | deepseek-chat |
| OpenAI | `OPENAI_API_KEY` | gpt-4 |
| Anthropic | `ANTHROPIC_API_KEY` | claude-3-opus-20240229 |
| MiniMax | `MINIMAX_API_KEY` | M2-her |
| Custom / 自定义 | `CUSTOM_API_KEY` + `CUSTOM_BASE_URL` + `CUSTOM_MODEL` | — |

设置 `DEFAULT_PROVIDER` 选择默认使用的 AI 提供商。/ Set `DEFAULT_PROVIDER` to choose which provider the engine uses by default.

## Project Structure / 项目结构

```
├── src/                      # Frontend / 前端
│   ├── components/           #   React UI 组件
│   ├── services/             #   API 客户端服务
│   │   ├── aiService.js      #     AI 生成代理
│   │   ├── apiService.js     #     HTTP API 客户端
│   │   ├── imageService.js   #     图像生成 + 轮询
│   │   ├── characterMemoryService.js  #  角色记忆提取/合并/压缩/持久化
│   │   ├── saveService.js    #     存档管理
│   │   └── authService.js    #     JWT 认证
│   ├── store/                #   状态管理 (useReducer)
│   │   └── gameState.jsx     #     全局游戏状态 + ~25 种 action
│   ├── utils/                #   工具函数
│   │   └── gameTime.js       #     游戏时间系统
│   └── data/                 #   模板与常量
│       └── templates.js      #     默认角色/场景/世界观 schema
├── server/                   # Backend / 后端
│   ├── routes/               #   Express API 路由
│   │   ├── ai.js             #     AI 生成核心（文本/图像/批量，2369 行）
│   │   ├── novels.js         #     小说 AI 解析与分支生成
│   │   ├── memories.js       #     角色记忆持久化 API
│   │   ├── worlds.js         #     世界观 CRUD
│   │   ├── characters.js     #     角色 CRUD
│   │   ├── saves.js          #     存档 CRUD
│   │   ├── images.js         #     图片管理
│   │   ├── auth.js           #     认证路由
│   │   └── users.js          #     用户管理路由
│   ├── services/             #   服务端服务
│   │   └── aiService.js      #     AI 提供商集成（Anthropic/MiniMax/OpenAI-compatible）
│   ├── middleware/            #   认证中间件
│   ├── database.js           #   SQLite 数据库模式与查询
│   ├── config.js             #   运行时配置管理（.env 动态更新）
│   └── data/                 #   SQLite 数据库 (运行时)
├── launcher-app/             # Electron 桌面启动器 / Desktop launcher
│   ├── main.js               #   主进程（子进程管理）/ Main process
│   ├── preload.js            #   IPC 桥接 / IPC bridge
│   ├── renderer/             #   GUI 界面 / GUI
│   └── dist/                 #   打包输出 / Build output
├── launcher.mjs              # 命令行启动器 / CLI launcher
├── Dockerfile                # 生产环境 Docker 镜像
├── docker-compose.yml        # 开发环境 Compose 配置
└── docker-compose.prod.yml   # 生产环境 Compose 配置
```

## Permissions / 权限说明

| Feature / 功能 | Admin / 管理员 | User / 普通用户 |
|---------------|---------------|----------------|
| User management / 用户管理 | Yes / 是 | No / 否 |
| Character subdue/capture / 角色收服与压制 | Yes / 是 | No / 否 |
| Create & play stories / 创建与游玩 | Yes / 是 | Yes / 是 |

## Contributing / 参与贡献

Issues and pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

欢迎提交 Issue 和 Pull Request。重大改动请先开 Issue 讨论。

## License / 许可证

[MIT](LICENSE)
