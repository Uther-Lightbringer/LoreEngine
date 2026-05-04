import express from 'express';
import db from '../database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.use(authMiddleware);

// 获取所有图片（用户隔离）
router.get('/', (req, res) => {
  try {
    const images = db.prepare('SELECT * FROM images WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json(images);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 根据ID获取图片
router.get('/:id', (req, res) => {
  try {
    const image = db.prepare('SELECT * FROM images WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }
    res.json(image);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取某个世界观的所有图片
router.get('/world/:worldId', (req, res) => {
  try {
    const images = db.prepare('SELECT * FROM images WHERE world_id = ? AND user_id = ? ORDER BY created_at DESC')
      .all(req.params.worldId, req.user.id);
    res.json(images);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 根据类型获取图片
router.get('/type/:imageType', (req, res) => {
  try {
    const { worldId } = req.query;
    let images;

    if (worldId) {
      images = db.prepare('SELECT * FROM images WHERE image_type = ? AND world_id = ? AND user_id = ? ORDER BY created_at DESC')
        .all(req.params.imageType, worldId, req.user.id);
    } else {
      images = db.prepare('SELECT * FROM images WHERE image_type = ? AND user_id = ? ORDER BY created_at DESC')
        .all(req.params.imageType, req.user.id);
    }

    res.json(images);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 保存图片
router.post('/', (req, res) => {
  try {
    const { world_id, character_id, scene_id, image_type, image_url, image_data, prompt } = req.body;

    if (!image_type) {
      return res.status(400).json({ error: 'image_type is required' });
    }

    // 验证 world_id 属于当前用户
    if (world_id) {
      const world = db.prepare('SELECT id FROM worlds WHERE id = ? AND user_id = ?').get(world_id, req.user.id);
      if (!world) {
        return res.status(403).json({ error: 'World not found or access denied' });
      }
    }

    const stmt = db.prepare(`
      INSERT INTO images (user_id, world_id, character_id, scene_id, image_type, image_url, image_data, prompt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      req.user.id,
      world_id || null,
      character_id || null,
      scene_id || null,
      image_type,
      image_url || null,
      image_data || null,
      prompt || null
    );

    res.status(201).json({
      id: result.lastInsertRowid,
      world_id,
      character_id,
      scene_id,
      image_type,
      image_url,
      prompt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除图片
router.delete('/:id', (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM images WHERE id = ? AND user_id = ?');
    const result = stmt.run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
