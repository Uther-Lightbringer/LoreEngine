import express from 'express';
import db from '../database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// 所有路由都需要认证
router.use(authMiddleware);

// 获取所有世界观（用户隔离）
router.get('/', (req, res) => {
  try {
    const worlds = db.prepare('SELECT * FROM worlds WHERE user_id = ? ORDER BY updated_at DESC').all(req.user.id);
    res.json(worlds);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 根据ID获取世界观
router.get('/:id', (req, res) => {
  try {
    const world = db.prepare('SELECT * FROM worlds WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!world) {
      return res.status(404).json({ error: 'World not found' });
    }
    res.json(world);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 根据名称获取世界观
router.get('/name/:name', (req, res) => {
  try {
    const world = db.prepare('SELECT * FROM worlds WHERE name = ? AND user_id = ?').get(req.params.name, req.user.id);
    res.json(world || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 创建或更新世界观
router.post('/', (req, res) => {
  try {
    const { name, description, image_url } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // 检查是否已存在同名世界观（同一用户）
    const existing = db.prepare('SELECT * FROM worlds WHERE name = ? AND user_id = ?').get(name, req.user.id);

    if (existing) {
      // 更新现有世界观
      const stmt = db.prepare(`
        UPDATE worlds
        SET name = ?, description = ?, image_url = ?, updated_at = datetime('now')
        WHERE id = ?
      `);
      stmt.run(name, description || null, image_url || null, existing.id);
      res.json({ id: existing.id, ...req.body });
    } else {
      // 创建新世界观
      const stmt = db.prepare(`
        INSERT INTO worlds (user_id, name, description, image_url)
        VALUES (?, ?, ?, ?)
      `);
      const result = stmt.run(req.user.id, name, description || null, image_url || null);
      res.status(201).json({ id: result.lastInsertRowid, name, description, image_url });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除世界观
router.delete('/:id', (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM worlds WHERE id = ? AND user_id = ?');
    const result = stmt.run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'World not found' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
