const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn, execSync } = require('child_process');
const { existsSync, copyFileSync, readFileSync, writeFileSync, mkdirSync } = require('fs');
const { join } = require('path');

// --- 配置文件路径 ---
const CONFIG_DIR = join(app.getPath('userData'), 'lore-engine-launcher');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveConfig(config) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

let config = loadConfig();
let ROOT = config.projectPath || '';
let SERVER_DIR = ROOT ? join(ROOT, 'server') : '';

let mainWindow = null;
const children = { frontend: null, backend: null };

// --- 自动检测项目路径 ---
function autoDetectProject() {
  // 开发模式下，launcher-app 在项目内部
  const devPath = join(__dirname, '..');
  if (existsSync(join(devPath, 'server', 'index.js')) && existsSync(join(devPath, 'package.json'))) {
    return devPath;
  }

  // 常见位置猜测
  const guesses = [
    'E:\\WorkSpace\\LoreEngine',
    join(process.env.USERPROFILE || '', 'LoreEngine'),
    join(process.env.USERPROFILE || '', 'Desktop', 'LoreEngine'),
    join(process.env.USERPROFILE || '', 'Documents', 'LoreEngine'),
  ];

  for (const p of guesses) {
    if (existsSync(join(p, 'server', 'index.js')) && existsSync(join(p, 'package.json'))) {
      return p;
    }
  }

  return null;
}

// 初始化项目路径
if (!ROOT || !existsSync(join(ROOT, 'server', 'index.js'))) {
  ROOT = autoDetectProject() || '';
  SERVER_DIR = ROOT ? join(ROOT, 'server') : '';
  if (ROOT) {
    config.projectPath = ROOT;
    saveConfig(config);
  }
}

let ENV_FILE = SERVER_DIR ? join(SERVER_DIR, '.env') : '';
let ENV_EXAMPLE = SERVER_DIR ? join(SERVER_DIR, '.env.example') : '';

function updatePaths(projectPath) {
  ROOT = projectPath;
  SERVER_DIR = join(ROOT, 'server');
  ENV_FILE = join(SERVER_DIR, '.env');
  ENV_EXAMPLE = join(SERVER_DIR, '.env.example');
  config.projectPath = ROOT;
  saveConfig(config);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 920,
    height: 660,
    minWidth: 720,
    minHeight: 520,
    resizable: true,
    frame: false,
    transparent: false,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(join(__dirname, 'renderer', 'index.html'));
}

// --- 环境检查 ---
function checkEnv() {
  if (!ROOT) return { status: 'no_project', message: '未设置项目路径' };
  if (!existsSync(ENV_FILE)) {
    if (existsSync(ENV_EXAMPLE)) {
      copyFileSync(ENV_EXAMPLE, ENV_FILE);
      return { status: 'created', message: 'server/.env 已从 .env.example 复制' };
    }
    return { status: 'error', message: 'server/.env 和 .env.example 都不存在' };
  }
  return { status: 'ok', message: 'server/.env 已存在' };
}

// --- 检查依赖 ---
function ensureDeps(dir) {
  if (!existsSync(join(dir, 'node_modules'))) {
    try {
      execSync('npm install', { cwd: dir, stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }
  return true;
}

// --- 启动进程 ---
function startProcess(name, cmd, args, cwd) {
  if (children[name]) return { status: 'already_running' };

  const child = spawn(cmd, args, {
    cwd,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter((l) => l.trim());
    for (const line of lines) {
      mainWindow?.webContents.send('log', { source: name, text: line, type: 'stdout' });
    }
  });

  child.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter((l) => l.trim());
    for (const line of lines) {
      mainWindow?.webContents.send('log', { source: name, text: line, type: 'stderr' });
    }
  });

  child.on('exit', (code, signal) => {
    children[name] = null;
    mainWindow?.webContents.send('process-exit', { name, code, signal });
  });

  child.on('error', (err) => {
    children[name] = null;
    mainWindow?.webContents.send('log', { source: name, text: `启动失败: ${err.message}`, type: 'error' });
    mainWindow?.webContents.send('process-exit', { name, code: -1, signal: null });
  });

  children[name] = child;
  return { status: 'started', pid: child.pid };
}

// --- 停止进程 ---
function stopProcess(name) {
  const child = children[name];
  if (!child || child.killed) {
    children[name] = null;
    return { status: 'not_running' };
  }

  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
    } catch {
      child.kill('SIGTERM');
    }
  } else {
    child.kill('SIGTERM');
  }

  children[name] = null;
  return { status: 'stopped' };
}

// --- IPC 处理 ---
ipcMain.handle('get-project-path', () => ROOT);

ipcMain.handle('select-project', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 LoreEngine 项目目录',
    properties: ['openDirectory'],
    defaultPath: ROOT || app.getPath('home'),
  });

  if (result.canceled || !result.filePaths[0]) return { canceled: true };

  const selected = result.filePaths[0];
  if (!existsSync(join(selected, 'server', 'index.js'))) {
    return { error: true, message: '该目录不是有效的 LoreEngine 项目（缺少 server/index.js）' };
  }

  updatePaths(selected);
  return { path: selected };
});

ipcMain.handle('check-env', () => checkEnv());

ipcMain.handle('check-deps', () => {
  if (!ROOT) return { frontend: false, backend: false };
  const feOk = ensureDeps(ROOT);
  const beOk = ensureDeps(SERVER_DIR);
  return { frontend: feOk, backend: beOk };
});

ipcMain.handle('start-frontend', () => {
  if (!ROOT) return { status: 'no_project' };
  return startProcess('frontend', 'npx', ['vite', '--port', '3000'], ROOT);
});

ipcMain.handle('start-backend', () => {
  if (!ROOT) return { status: 'no_project' };
  return startProcess('backend', 'node', ['index.js'], SERVER_DIR);
});

ipcMain.handle('stop-frontend', () => stopProcess('frontend'));
ipcMain.handle('stop-backend', () => stopProcess('backend'));

ipcMain.handle('get-status', () => ({
  frontend: children.frontend ? 'running' : 'stopped',
  backend: children.backend ? 'running' : 'stopped',
}));

ipcMain.handle('window-minimize', () => mainWindow?.minimize());
ipcMain.handle('window-close', () => mainWindow?.close());

// --- App 生命周期 ---
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  stopProcess('frontend');
  stopProcess('backend');
  app.quit();
});

app.on('before-quit', () => {
  stopProcess('frontend');
  stopProcess('backend');
});
