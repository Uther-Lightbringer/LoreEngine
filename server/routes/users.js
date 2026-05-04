import express from 'express';
import db from '../database.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';

const router = express.Router();

// 所有用户管理接口都需要管理员权限
router.use(authMiddleware, adminMiddleware);

// 获取所有用户
router.get('/', (req, res) => {
  try {
    const users = db.prepare('SELECT id, username, is_admin, created_at FROM users ORDER BY created_at DESC').all();
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// 创建用户
router.post('/', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // 检查用户名是否已存在
    const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // 不能创建管理员用户
    const stmt = db.prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 0)');
    const result = stmt.run(username, password);

    res.status(201).json({
      id: result.lastInsertRowid,
      username,
      isAdmin: false
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// 更新用户密码
router.put('/:id/password', (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    // 不能修改 admin 用户密码（通过 API）
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.username === 'admin') {
      return res.status(403).json({ error: 'Cannot modify admin password via API' });
    }

    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(password, userId);

    res.json({ success: true });
  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

// 删除用户
router.delete('/:id', (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.username === 'admin') {
      return res.status(403).json({ error: 'Cannot delete admin user' });
    }

    // 删除该用户的所有数据（级联删除）
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
