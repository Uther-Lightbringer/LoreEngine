import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 确保数据目录存在
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'novel.db');
const db = new Database(dbPath);

// 启用 WAL 模式提高性能
db.pragma('journal_mode = WAL');

// 检查表是否存在
const tableExists = (tableName) => {
  const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(tableName);
  return !!result;
};

// 检查列是否存在
const columnExists = (tableName, columnName) => {
  const info = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return info.some(col => col.name === columnName);
};

// 数据库迁移
const migrateDatabase = () => {
  console.log('Checking database state...');

  // 检查是否需要迁移（添加 user_id 列）
  if (tableExists('worlds') && !columnExists('worlds', 'user_id')) {
    console.log('Migrating database to add user isolation...');

    // 检查是否已有 admin 用户
    let adminUserId;
    const existingAdmin = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');

    if (existingAdmin) {
      adminUserId = existingAdmin.id;
      console.log('Using existing admin user ID:', adminUserId);
    } else {
      // 创建 admin 用户
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
      const result = db.prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)')
        .run('admin', adminPassword);
      adminUserId = result.lastInsertRowid;
      console.log('✓ Admin user created during migration, ID:', adminUserId);
    }

    // 迁移 worlds 表
    db.exec(`ALTER TABLE worlds ADD COLUMN user_id INTEGER NOT NULL DEFAULT ${adminUserId}`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_worlds_user_id ON worlds (user_id)');

    // 迁移 saves 表
    db.exec(`ALTER TABLE saves ADD COLUMN user_id INTEGER NOT NULL DEFAULT ${adminUserId}`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_saves_user_id ON saves (user_id)');

    // 迁移 timestamps 表
    db.exec(`ALTER TABLE timestamps ADD COLUMN user_id INTEGER NOT NULL DEFAULT ${adminUserId}`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_timestamps_user_id ON timestamps (user_id)');

    // 迁移 images 表
    db.exec(`ALTER TABLE images ADD COLUMN user_id INTEGER NOT NULL DEFAULT ${adminUserId}`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_images_user_id ON images (user_id)');

    // 迁移 characters 表
    db.exec(`ALTER TABLE characters ADD COLUMN user_id INTEGER NOT NULL DEFAULT ${adminUserId}`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_characters_user_id ON characters (user_id)');

    console.log('✓ Database migration completed');
    return true;
  }

  return false;
};

// 执行迁移（如需要）
migrateDatabase();

// 创建数据表
const initTables = () => {
  // 用户表
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // 世界观表
  db.exec(`
    CREATE TABLE IF NOT EXISTS worlds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  // 存档表
  db.exec(`
    CREATE TABLE IF NOT EXISTS saves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      world_id INTEGER,
      name TEXT NOT NULL,
      game_state TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (world_id) REFERENCES worlds (id) ON DELETE CASCADE
    )
  `);

  // 时间点表
  db.exec(`
    CREATE TABLE IF NOT EXISTS timestamps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      world_id INTEGER,
      save_id INTEGER,
      step_number INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      game_state TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (world_id) REFERENCES worlds (id) ON DELETE CASCADE,
      FOREIGN KEY (save_id) REFERENCES saves (id) ON DELETE CASCADE
    )
  `);

  // 图片表
  db.exec(`
    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      world_id INTEGER,
      character_id TEXT,
      scene_id TEXT,
      image_type TEXT NOT NULL,
      image_url TEXT,
      image_data BLOB,
      prompt TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (world_id) REFERENCES worlds (id) ON DELETE CASCADE
    )
  `);

  // 角色表
  db.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      world_id INTEGER,
      name TEXT NOT NULL,
      personality TEXT,
      appearance TEXT,
      physical_appearance TEXT,
      background TEXT,
      image_url TEXT,
      is_protagonist INTEGER DEFAULT 0,
      is_lazy INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (world_id) REFERENCES worlds (id) ON DELETE CASCADE
    )
  `);

  // 如果 physical_appearance 列不存在，添加它（兼容旧数据库）
  try {
    db.exec("ALTER TABLE characters ADD COLUMN physical_appearance TEXT");
  } catch (e) {
    // 列可能已存在，忽略错误
  }

  // 如果 is_lazy 列不存在，添加它（兼容旧数据库）
  try {
    db.exec("ALTER TABLE characters ADD COLUMN is_lazy INTEGER DEFAULT 0");
  } catch (e) {
    // 列可能已存在，忽略错误
  }

  // 如果 save_type 列不存在，添加它（兼容旧数据库）
  try {
    db.exec("ALTER TABLE saves ADD COLUMN save_type TEXT NOT NULL DEFAULT 'save'");
  } catch (e) {
    // 列可能已存在，忽略错误
  }

  // 创建索引
  db.exec('CREATE INDEX IF NOT EXISTS idx_worlds_user_id ON worlds (user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_worlds_updated_at ON worlds (updated_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_saves_user_id ON saves (user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_saves_world_id ON saves (world_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_saves_updated_at ON saves (updated_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_saves_save_type ON saves (save_type, user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_timestamps_user_id ON timestamps (user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_timestamps_world_id ON timestamps (world_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_timestamps_save_id ON timestamps (save_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_timestamps_created_at ON timestamps (created_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_images_user_id ON images (user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_images_world_id ON images (world_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_images_type ON images (image_type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_characters_user_id ON characters (user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_characters_world_id ON characters (world_id)');

  // 角色记忆表
  db.exec(`
    CREATE TABLE IF NOT EXISTS character_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      world_id INTEGER NOT NULL,
      character_id TEXT NOT NULL,
      memories TEXT NOT NULL,
      last_interaction TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (world_id) REFERENCES worlds (id) ON DELETE CASCADE
    )
  `);

  // 角色记忆索引
  db.exec('CREATE INDEX IF NOT EXISTS idx_memories_user_id ON character_memories (user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_memories_world_id ON character_memories (world_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_memories_character_id ON character_memories (character_id)');

  // ==================== 小说相关表 ====================

  // 小说表
  db.exec(`
    CREATE TABLE IF NOT EXISTS novels (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT DEFAULT '其他',
      type_confidence REAL DEFAULT 0,
      world_setting TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  // 章节表
  db.exec(`
    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY,
      novel_id TEXT NOT NULL,
      title TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      characters TEXT,
      scenes TEXT,
      is_parsed INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (novel_id) REFERENCES novels (id) ON DELETE CASCADE
    )
  `);

  // 选择点表
  db.exec(`
    CREATE TABLE IF NOT EXISTS choice_points (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      location TEXT,
      original_action TEXT,
      situation TEXT,
      character_name TEXT,
      is_exclusive INTEGER DEFAULT 0,
      importance REAL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (chapter_id) REFERENCES chapters (id) ON DELETE CASCADE
    )
  `);

  // 备选分支表
  db.exec(`
    CREATE TABLE IF NOT EXISTS alternatives (
      id TEXT PRIMARY KEY,
      choice_point_id TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      trigger_condition TEXT,
      trigger_characters TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (choice_point_id) REFERENCES choice_points (id) ON DELETE CASCADE
    )
  `);

  // 软章节结束点表
  db.exec(`
    CREATE TABLE IF NOT EXISTS soft_end_points (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      paragraph_index INTEGER,
      location TEXT,
      reason TEXT,
      end_type TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (chapter_id) REFERENCES chapters (id) ON DELETE CASCADE
    )
  `);

  // 用户进度表
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_progress (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      novel_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      character_name TEXT NOT NULL,
      current_position INTEGER DEFAULT 0,
      choices TEXT,
      completed_branches TEXT,
      unlocked_characters TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (novel_id) REFERENCES novels (id) ON DELETE CASCADE,
      FOREIGN KEY (chapter_id) REFERENCES chapters (id) ON DELETE CASCADE
    )
  `);

  // 叙事状态快照表
  db.exec(`
    CREATE TABLE IF NOT EXISTS narrative_snapshots (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      novel_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      snapshot_data TEXT NOT NULL,
      adaptation_level TEXT DEFAULT 'light',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (novel_id) REFERENCES novels (id) ON DELETE CASCADE,
      FOREIGN KEY (chapter_id) REFERENCES chapters (id) ON DELETE CASCADE
    )
  `);

  // 小说相关索引
  db.exec('CREATE INDEX IF NOT EXISTS idx_novels_user_id ON novels (user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_chapters_novel_id ON chapters (novel_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_chapters_order ON chapters (novel_id, order_index)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_choice_points_chapter_id ON choice_points (chapter_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_alternatives_choice_point_id ON alternatives (choice_point_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_progress_user_novel ON user_progress (user_id, novel_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_progress_user_chapter ON user_progress (user_id, chapter_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_narrative_snapshots_user_novel ON narrative_snapshots (user_id, novel_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_soft_end_points_chapter_id ON soft_end_points (chapter_id)');
};

// 初始化超管用户
const initAdminUser = () => {
  const existing = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
  if (!existing) {
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    db.prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)')
      .run('admin', adminPassword);
    console.log('✓ Admin user created (username: admin, password: set via ADMIN_PASSWORD env or default)');
  }
};

// 初始化数据表
initTables();

// 初始化 admin 用户
initAdminUser();

export default db;
