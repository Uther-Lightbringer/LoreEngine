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
| Frontend / 前端 | React 19, Vite |
| Backend / 后端 | Express.js |
| Database / 数据库 | SQLite (better-sqlite3) |
| AI Text / AI 文本 | OpenAI / DeepSeek / Anthropic / Custom / 自定义 |
| AI Image / AI 图像 | Evolink / MiniMax / Custom / 自定义 |
| Deploy / 部署 | Docker + Nginx |

## Getting Started / 快速开始

### Prerequisites / 前置条件

- Node.js 18+
- npm

### Install / 安装

```bash
npm run install:all
```

### Configure / 配置

1. 复制环境变量示例文件 / Copy the example env files:

```bash
cp .env.example .env
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

### Run / 运行

```bash
# 开发模式 (前端 :3000, 后端 :29999) / Development
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
│   ├── store/                #   状态管理 (useReducer)
│   └── data/                 #   模板与常量
├── server/                   # Backend / 后端
│   ├── routes/               #   Express API 路由
│   ├── services/             #   服务端服务
│   ├── middleware/            #   认证中间件
│   └── data/                 #   SQLite 数据库 (运行时)
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
