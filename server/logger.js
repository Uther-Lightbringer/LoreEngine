import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_DIR = path.join(__dirname, '..', 'log');

// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 日志级别: error > warn > info > debug
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LEVELS.info;

// 获取当天日志文件路径
function getLogFilePath() {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `${date}.log`);
}

// 写入日志文件
function writeToFile(line) {
  try {
    fs.appendFileSync(getLogFilePath(), line + '\n', 'utf-8');
  } catch (e) {
    // 文件写入失败不影响主流程
  }
}

// 格式化参数为单行字符串（用于文件写入）
function argsToString(...args) {
  return args.map(a => {
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a); }
    catch { return String(a); }
  }).join(' ');
}

function formatMsg(level, tag, ...args) {
  if (LEVELS[level] > currentLevel) return;

  const now = new Date();
  const ts = now.toISOString().slice(11, 19);
  const prefix = `[${ts}][${level.toUpperCase()}]${tag ? '[' + tag + ']' : ''}`;

  // 控制台：保持可读的多行格式
  if (args.length === 1 && typeof args[0] === 'string') {
    console.log(`${prefix} ${args[0]}`);
  } else {
    console.log(prefix);
    for (const a of args) {
      if (typeof a === 'string') {
        console.log(a);
      } else {
        console.log(JSON.stringify(a, null, 2));
      }
    }
  }

  // 文件：每条日志一行，带完整时间戳
  const fullTs = now.toISOString();
  const fileLine = `[${fullTs}][${level.toUpperCase()}]${tag ? '[' + tag + ']' : ''} ${argsToString(...args)}`;
  writeToFile(fileLine);
}

const logger = {
  error: (...args) => formatMsg('error', '', ...args),
  warn: (...args) => formatMsg('warn', '', ...args),
  info: (...args) => formatMsg('info', '', ...args),
  debug: (...args) => formatMsg('debug', '', ...args),
  tag: (tag) => ({
    error: (...args) => formatMsg('error', tag, ...args),
    warn: (...args) => formatMsg('warn', tag, ...args),
    info: (...args) => formatMsg('info', tag, ...args),
    debug: (...args) => formatMsg('debug', tag, ...args),
  })
};

export default logger;
