import express from 'express';
import db from '../database.js';

const router = express.Router();

// 登录
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ? AND password_hash = ?')
      .get(username, password);

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // 生成简单 token：userId:timestamp
    const token = `${user.id}:${Date.now()}`;

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        isAdmin: !!user.is_admin
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// 验证 token
router.get('/verify', (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const parts = token.split(':');

    if (parts.length !== 2) {
      return res.status(401).json({ error: 'Invalid token format' });
    }

    const userId = parseInt(parts[0], 10);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        isAdmin: !!user.is_admin
      }
    });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ error: 'Verify failed' });
  }
});

export default router;
