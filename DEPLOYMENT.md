# 项目部署指南

## 项目概述

这是一个 AI 驱动的视觉小说游戏，使用 React + Vite 前端，Express 后端。

## 技术栈

- **前端**: React 18.3, Vite 5.4
- **后端**: Express.js
- **容器化**: Docker + Docker Compose
- **Web 服务器**: Nginx

---

## 方案一：使用 Docker 部署（推荐）

### 1. 环境要求

- 云服务器（推荐配置：2核4G以上）
- 操作系统：Ubuntu 20.04+ / Debian 11+ / CentOS 8+
- Docker 和 Docker Compose

### 2. 在云服务器上安装 Docker

#### Ubuntu/Debian 系统
```bash
# 更新系统
sudo apt-get update && sudo apt-get upgrade -y

# 安装依赖
sudo apt-get install -y apt-transport-https ca-certificates curl software-properties-common

# 添加 Docker 官方 GPG 密钥
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 启动 Docker
sudo systemctl start docker
sudo systemctl enable docker

# 验证安装
docker --version
```

#### 安装 Docker Compose
```bash
# Ubuntu/Debian
sudo apt-get install docker-compose-plugin -y

# 验证安装
docker compose version
```

### 3. 上传项目文件到服务器

#### 方式 A：使用 Git 克隆（推荐）
```bash
# 在服务器上
cd /opt
sudo git clone <your-repository-url> visual-novel
cd visual-novel
```

#### 方式 B：使用 SCP 上传
```bash
# 在本地执行
scp -r /path/to/local/project user@your-server-ip:/opt/visual-novel
```

### 4. 配置环境变量

```bash
# 进入项目目录
cd /opt/visual-novel

# 复制环境变量示例文件
cp .env.example .env

# 编辑环境变量（根据需要修改）
nano .env
```

#### 环境变量说明
```env
# API 后端地址
VITE_API_URL=http://localhost:3001/api
```

### 5. 构建并启动容器

```bash
# 1. 构建镜像
docker-compose build

# 2. 后台启动服务
docker-compose up -d

# 3. 查看服务状态
docker-compose ps

# 4. 查看日志（可选）
docker-compose logs -f

# 查看特定服务的日志
docker-compose logs -f frontend
docker-compose logs -f backend
```

### 6. 验证部署

在浏览器中访问：
- `http://your-server-ip:3000` - 前端应用
- `http://your-server-ip:3001/api` - 后端 API（如果需要）

### 7. 常用 Docker 命令

```bash
# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 重新构建并启动
docker-compose up -d --build

# 查看资源使用情况
docker stats

# 进入容器
docker-compose exec frontend sh
docker-compose exec backend sh
```

---

## 方案二：手动部署（不使用 Docker）

### 1. 环境要求

- Node.js 18+
- npm 或 yarn
- Nginx（推荐用于生产环境）
- PM2（用于进程管理）

### 2. 安装 Node.js

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node --version
npm --version
```

### 3. 部署前端

```bash
# 1. 进入项目目录
cd /opt/visual-novel

# 2. 安装依赖
npm install

# 3. 构建前端
npm run build

# 4. 将构建产物复制到 Web 目录
sudo mkdir -p /var/www/visual-novel
sudo cp -r dist/* /var/www/visual-novel/
```

### 4. 部署后端

```bash
# 1. 进入后端目录
cd /opt/visual-novel/server

# 2. 安装后端依赖
npm install

# 3. 安装 PM2（进程管理器）
sudo npm install -g pm2

# 4. 使用 PM2 启动后端
pm2 start index.js --name "visual-novel-backend"

# 5. 设置 PM2 开机自启
pm2 startup
pm2 save

# 6. 查看状态
pm2 status
pm2 logs visual-novel-backend
```

### 5. 配置 Nginx

#### 安装 Nginx
```bash
sudo apt-get install nginx -y
```

#### 创建 Nginx 配置文件
```bash
sudo nano /etc/nginx/sites-available/visual-novel
```

#### 配置内容
```nginx
server {
    listen 80;
    server_name your-domain.com your-server-ip;

    # 前端静态文件
    location / {
        root /var/www/visual-novel;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # API 代理到后端
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # 上传文件大小限制
    client_max_body_size 20M;
}
```

#### 启用配置
```bash
# 创建软链接
sudo ln -s /etc/nginx/sites-available/visual-novel /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx

# 设置开机自启
sudo systemctl enable nginx
```

---

## 方案三：使用 Vite Preview（仅用于测试，不推荐生产）

```bash
# 1. 构建项目
npm run build

# 2. 启动预览服务器
npm run preview
```

---

## 配置 HTTPS（推荐生产环境使用）

### 使用 Let's Encrypt 免费证书

```bash
# 1. 安装 Certbot
sudo apt-get install certbot python3-certbot-nginx -y

# 2. 获取并安装证书
sudo certbot --nginx -d your-domain.com

# 3. 证书自动续期（Certbot 会自动配置）
sudo certbot renew --dry-run
```

Certbot 会自动更新 Nginx 配置以支持 HTTPS。

---

## 防火墙配置

### Ubuntu UFW 防火墙
```bash
# 允许 SSH
sudo ufw allow 22/tcp

# 允许 HTTP
sudo ufw allow 80/tcp

# 允许 HTTPS
sudo ufw allow 443/tcp

# 如果直接访问 Docker 端口
sudo ufw allow 3000/tcp
sudo ufw allow 3001/tcp

# 启用防火墙
sudo ufw enable

# 查看状态
sudo ufw status
```

### 云服务器安全组
如果使用阿里云、腾讯云、AWS等云服务器，还需要在控制台配置安全组规则：
- 入站规则：允许 `22` (SSH)、`80` (HTTP)、`443` (HTTPS) 端口
- 入站规则：如果需要直接访问，允许 `3000`、`3001` 端口

---

## 数据持久化

### Docker 方式
数据会自动保存在 Docker volume 中：
- 后端数据：`./server/data` 目录会挂载到容器

### 手动部署方式
确保以下目录有正确的权限：
```bash
# 创建数据目录
sudo mkdir -p /opt/visual-novel/server/data
sudo chown -R www-data:www-data /opt/visual-novel/server/data
```

---

## 备份和恢复

### 备份数据
```bash
# Docker 方式
docker-compose exec backend tar -czf /app/data/backup_$(date +%Y%m%d).tar.gz /app/data

# 手动方式
tar -czf backup_$(date +%Y%m%d).tar.gz /opt/visual-novel/server/data
```

### 备份整个项目
```bash
cd /opt
tar -czf visual-novel_backup_$(date +%Y%m%d).tar.gz visual-novel/
```

---

## 监控和日志

### 查看应用日志
```bash
# Docker 方式
docker-compose logs -f

# PM2 方式
pm2 logs visual-novel-backend

# Nginx 日志
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### 系统资源监控
```bash
# 查看系统资源
htop

# Docker 资源使用
docker stats

# PM2 监控
pm2 monit
```

---

## 故障排查

### 常见问题

#### 1. 容器无法启动
```bash
# 查看日志
docker-compose logs

# 检查端口占用
sudo netstat -tlnp | grep -E ':(3000|3001)'
```

#### 2. 前端无法访问后端 API
- 检查防火墙设置
- 确认后端服务正常运行
- 检查 `VITE_API_URL` 配置是否正确

#### 3. Nginx 502 Bad Gateway
- 确认后端服务正在运行
- 检查 Nginx 配置中的 proxy_pass 地址
- 查看 Nginx 错误日志

#### 4. 权限问题
```bash
# 修复目录权限
sudo chown -R $USER:$USER /opt/visual-novel
sudo chmod -R 755 /opt/visual-novel
```

---

## 更新部署

### Docker 方式更新
```bash
# 1. 拉取最新代码
git pull

# 2. 重新构建并启动
docker-compose up -d --build

# 3. 清理旧镜像（可选）
docker image prune -a
```

### 手动方式更新
```bash
# 1. 拉取最新代码
git pull

# 2. 重新构建前端
npm install
npm run build
sudo cp -r dist/* /var/www/visual-novel/

# 3. 重启后端
cd server
npm install
pm2 restart visual-novel-backend
```

---

## 安全建议

1. **定期更新系统和软件包**
   ```bash
   sudo apt-get update && sudo apt-get upgrade -y
   ```

2. **使用强密码和 SSH 密钥登录**
   - 禁用密码登录，使用 SSH 密钥
   - 修改默认 SSH 端口

3. **配置防火墙**
   - 只开放必要的端口
   - 限制 IP 访问（如需要）

4. **定期备份数据**
   - 设置自动备份脚本
   - 将备份存储到其他位置

5. **使用 HTTPS**
   - 加密传输数据
   - 提高安全性

---

## 联系和支持

如有问题，请查看项目 README 或提交 Issue。

---

## 附录：目录结构

```
visual-novel/
├── src/                    # 前端源代码
├── server/                 # 后端代码
│   ├── routes/            # API 路由
│   ├── data/              # 数据存储目录
│   └── index.js           # 后端入口
├── dist/                  # 前端构建输出（build后生成）
├── docker-compose.yml     # Docker Compose 配置
├── Dockerfile.frontend    # 前端 Dockerfile
├── Dockerfile.backend     # 后端 Dockerfile
├── nginx.conf            # Nginx 配置
├── vite.config.js        # Vite 配置
├── package.json          # 项目依赖
├── .env.example          # 环境变量示例
└── DEPLOYMENT.md         # 本文档
```
