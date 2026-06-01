import { cpSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const OUT = join(DIST, 'LoreEngine-Launcher');
const ELECTRON_DIST = join(ROOT, 'node_modules', 'electron', 'dist');

console.log('正在打包 LoreEngine Launcher...');

// 清理输出目录
if (existsSync(OUT)) {
  rmSync(OUT, { recursive: true });
}
mkdirSync(OUT, { recursive: true });

// 复制 Electron 运行时
console.log('  复制 Electron 运行时...');
cpSync(ELECTRON_DIST, OUT, { recursive: true });

// 重命名 exe
const exeSrc = join(OUT, 'electron.exe');
const exeDst = join(OUT, 'LoreEngine Launcher.exe');
if (existsSync(exeSrc)) {
  const { renameSync } = await import('fs');
  renameSync(exeSrc, exeDst);
}

// 创建 app 目录
const appDir = join(OUT, 'resources', 'app');
mkdirSync(appDir, { recursive: true });

// 复制应用代码
console.log('  复制应用代码...');
cpSync(join(ROOT, 'main.js'), join(appDir, 'main.js'));
cpSync(join(ROOT, 'preload.js'), join(appDir, 'preload.js'));
cpSync(join(ROOT, 'renderer'), join(appDir, 'renderer'), { recursive: true });

// 创建 package.json
writeFileSync(join(appDir, 'package.json'), JSON.stringify({
  name: 'lore-engine-launcher',
  version: '1.0.0',
  main: 'main.js',
  type: 'module',
}, null, 2));

// 创建启动脚本
writeFileSync(join(OUT, '启动LoreEngine.bat'), '@echo off\r\ncd /d "%~dp0"\r\nstart "" "LoreEngine Launcher.exe"\r\n');

console.log(`  打包完成: ${OUT}`);
console.log('  双击 "启动LoreEngine.bat" 或 "LoreEngine Launcher.exe" 启动');
