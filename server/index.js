import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import worldsRouter from './routes/worlds.js';
import savesRouter from './routes/saves.js';
import imagesRouter from './routes/images.js';
import charactersRouter from './routes/characters.js';
import timestampsRouter from './routes/timestamps.js';
import aiRouter from './routes/ai.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import memoriesRouter from './routes/memories.js';
import novelsRouter from './routes/novels.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 确保 uploads 目录存在
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// 图片缓存目录 - 统一使用 E:\WorkSpace\rpgTmp\CacheImages
console.log('[index.js] __dirname:', __dirname);
const cacheImagesDir = process.env.NODE_ENV === 'production'
  ? '/app/server/CacheImages'
  : path.resolve(__dirname, '..', '..', 'CacheImages');
if (!fs.existsSync(cacheImagesDir)) {
  fs.mkdirSync(cacheImagesDir, { recursive: true });
}
console.log('Cache images directory:', cacheImagesDir);

const app = express();
const PORT = process.env.PORT || 29999;

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 静态文件服务 - 上传的图片
app.use('/uploads', express.static(uploadsDir));

// 静态文件服务 - 缓存图片
app.use('/cache-images', express.static(cacheImagesDir));

// API 路由（必须在静态文件服务之前，否则 /api/* 会被 * 捕获）
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/worlds', worldsRouter);
app.use('/api/saves', savesRouter);
app.use('/api/images', imagesRouter);
app.use('/api/characters', charactersRouter);
app.use('/api/timestamps', timestampsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/memories', memoriesRouter);
app.use('/api/novels', novelsRouter);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'AI Visual Novel Server is running!' });
});

// 静态文件服务 - 前端构建文件（用于去掉 Nginx 的部署方式）
// 必须放在 API 路由之后，这样 /api/* 不会被这个 * 捕获
const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  // SPA 路由支持 - 所有未匹配的路由返回 index.html
  app.get('*', (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// 根路径
app.get('/', (req, res) => {
  res.json({
    name: 'AI Visual Novel Server',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users (admin only)',
      worlds: '/api/worlds',
      saves: '/api/saves',
      images: '/api/images',
      characters: '/api/characters',
      timestamps: '/api/timestamps',
      ai: '/api/ai',
      health: '/api/health'
    }
  });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 处理
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🎮 AI Visual Novel Server                               ║
║                                                            ║
║   Server running at: http://localhost:${PORT}              ║
║                                                            ║
║   API Endpoints:                                           ║
║   - POST   /api/auth/login    - User login                ║
║   - GET    /api/auth/verify   - Verify token             ║
║   - GET    /api/users         - List users (admin)        ║
║   - POST   /api/users         - Create user (admin)      ║
║   - PUT    /api/users/:id/pwd - Change password (admin)  ║
║   - DELETE /api/users/:id     - Delete user (admin)      ║
║   - GET    /api/worlds       - Get all worlds            ║
║   - POST   /api/worlds       - Create/Update world       ║
║   - GET    /api/saves        - Get all saves             ║
║   - POST   /api/saves        - Create save               ║
║   - GET    /api/images       - Get all images            ║
║   - POST   /api/images       - Save image                ║
║   - GET    /api/characters   - Get all characters        ║
║   - POST   /api/characters   - Save character            ║
║   - GET    /api/ai/config    - Get AI config status      ║
║   - POST   /api/ai/generate  - Text generation           ║
║   - POST   /api/ai/image     - Image generation          ║
║                                                            ║
║   Default Admin: username=admin, password=see ADMIN_PASSWORD║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
});
