# AI 视觉小说 - 后端服务器

这是 AI 视觉小说应用的后端服务器，使用 Node.js + Express + SQLite 构建。

## 功能特性

- 世界观管理（创建、读取、更新、删除）
- 游戏存档管理
- 图片存储（世界观、角色、场景图片）
- 角色数据管理
- RESTful API 接口
- CORS 跨域支持

## 安装和启动

### 1. 安装依赖

```bash
cd server
npm install
```

### 2. 启动服务器

```bash
# 开发模式（自动重启）
npm run dev

# 生产模式
npm start
```

服务器默认运行在 `http://localhost:3001`

## API 接口文档

### 健康检查

```
GET /api/health
```

### 世界观 API

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/worlds` | 获取所有世界观 |
| GET | `/api/worlds/:id` | 根据ID获取世界观 |
| GET | `/api/worlds/name/:name` | 根据名称获取世界观 |
| POST | `/api/worlds` | 创建或更新世界观 |
| DELETE | `/api/worlds/:id` | 删除世界观 |

### 存档 API

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/saves` | 获取所有存档 |
| GET | `/api/saves/:id` | 根据ID获取存档 |
| GET | `/api/saves/world/:worldId` | 获取某个世界观的所有存档 |
| POST | `/api/saves` | 创建新存档 |
| PUT | `/api/saves/:id` | 更新存档 |
| DELETE | `/api/saves/:id` | 删除存档 |

### 图片 API

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/images` | 获取所有图片 |
| GET | `/api/images/:id` | 根据ID获取图片 |
| GET | `/api/images/world/:worldId` | 获取某个世界观的所有图片 |
| GET | `/api/images/type/:imageType` | 根据类型获取图片 |
| POST | `/api/images` | 保存图片 |
| DELETE | `/api/images/:id` | 删除图片 |

### 角色 API

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/characters` | 获取所有角色 |
| GET | `/api/characters/:id` | 根据ID获取角色 |
| GET | `/api/characters/world/:worldId` | 获取某个世界观的所有角色 |
| POST | `/api/characters` | 保存角色 |
| DELETE | `/api/characters/:id` | 删除角色 |

## 数据库结构

数据库文件位于 `server/data/novel.db`

### 数据表

- **worlds** - 世界观表
- **saves** - 存档表
- **images** - 图片表
- **characters** - 角色表

## 前端配置

在前端项目根目录创建 `.env` 文件：

```env
VITE_API_URL=http://localhost:3001/api
```

## 使用流程

1. 先启动后端服务器
2. 再启动前端开发服务器
3. 在前端创建的内容会自动保存到后端数据库
4. 可以通过主菜单的"数据库管理"查看和管理所有数据

## 注意事项

- 数据库文件会自动创建在 `server/data/` 目录下
- 确保端口 3001 没有被其他程序占用
- 如果需要修改端口，可以设置环境变量 `PORT`
