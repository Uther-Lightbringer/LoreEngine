#!/usr/bin/env node

import { spawn, execSync } from 'child_process';
import { existsSync, copyFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = __dirname;
const SERVER_DIR = join(ROOT, 'server');
const ENV_FILE = join(SERVER_DIR, '.env');
const ENV_EXAMPLE = join(SERVER_DIR, '.env.example');

// --- 颜色输出 ---
const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
};

function log(tag, color, msg) {
  console.log(`${color}[${tag}]${c.reset} ${msg}`);
}

// --- 1. 检查 .env ---
if (!existsSync(ENV_FILE)) {
  if (existsSync(ENV_EXAMPLE)) {
    copyFileSync(ENV_EXAMPLE, ENV_FILE);
    log('SETUP', c.yellow, '未找到 server/.env，已从 .env.example 复制，请按需修改 API Key');
  } else {
    log('SETUP', c.red, 'server/.env 和 .env.example 都不存在，请手动创建 server/.env');
    process.exit(1);
  }
} else {
  log('SETUP', c.green, 'server/.env 已存在');
}

// --- 2. 检查依赖 ---
function ensureDeps(dir, name) {
  if (!existsSync(join(dir, 'node_modules'))) {
    log('DEPS', c.yellow, `正在安装 ${name} 依赖...`);
    execSync('npm install', { cwd: dir, stdio: 'inherit' });
    log('DEPS', c.green, `${name} 依赖安装完成`);
  } else {
    log('DEPS', c.green, `${name} 依赖已就绪`);
  }
}

ensureDeps(ROOT, '前端');
ensureDeps(SERVER_DIR, '后端');

// --- 3. 启动子进程 ---
const children = [];

function startProcess(name, color, cmd, args, cwd) {
  const child = spawn(cmd, args, {
    cwd,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const prefix = `${color}[${name}]${c.reset} `;

  child.stdout.on('data', (data) => {
    data.toString().split('\n').forEach((line) => {
      if (line.trim()) console.log(prefix + line);
    });
  });

  child.stderr.on('data', (data) => {
    data.toString().split('\n').forEach((line) => {
      if (line.trim()) console.log(prefix + line);
    });
  });

  child.on('exit', (code, signal) => {
    log(name, color, `进程退出 (code=${code}, signal=${signal})`);
  });

  children.push(child);
  return child;
}

console.log('');
console.log(`${c.cyan}========================================${c.reset}`);
console.log(`${c.cyan}       LoreEngine 启动器${c.reset}`);
console.log(`${c.cyan}========================================${c.reset}`);
console.log(`${c.dim}  前端: http://localhost:3000${c.reset}`);
console.log(`${c.dim}  后端: http://localhost:29999${c.reset}`);
console.log(`${c.dim}  按 Ctrl+C 停止所有服务${c.reset}`);
console.log(`${c.cyan}========================================${c.reset}`);
console.log('');

startProcess('后端', c.green, 'node', ['index.js'], SERVER_DIR);
startProcess('前端', c.cyan, 'npx', ['vite', '--port', '3000'], ROOT);

// --- 4. 优雅关闭 ---
function shutdown() {
  console.log('');
  log('LAUNCHER', c.yellow, '正在停止所有服务...');

  for (const child of children) {
    if (!child.killed) {
      // Windows 上需要使用 taskkill 杀掉子进程树
      if (process.platform === 'win32') {
        try {
          execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
        } catch {
          child.kill('SIGTERM');
        }
      } else {
        child.kill('SIGTERM');
      }
    }
  }

  // 等待子进程退出，超时则强制退出
  setTimeout(() => {
    log('LAUNCHER', c.red, '强制退出');
    process.exit(1);
  }, 5000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
