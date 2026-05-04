import express from 'express';
import db from '../database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// 所有路由都需要认证
router.use(authMiddleware);

// 获取指定世界观下所有角色的记忆
router.get('/world/:worldId', (req, res) => {
  try {
    const { worldId } = req.params;
    const userId = req.user?.id;

    if (!worldId) {
      return res.status(400).json({ error: 'world_id is required' });
    }

    // 如果是公开访问（未登录），返回空
    if (!userId) {
      return res.json({});
    }

    const rows = db.prepare(`
      SELECT character_id, memories, last_interaction
      FROM character_memories
      WHERE world_id = ? AND user_id = ?
    `).all(worldId, userId);

    const result = {};
    rows.forEach(row => {
      result[row.character_id] = {
        characterId: row.character_id,
        memories: JSON.parse(row.memories || '[]'),
        lastInteraction: row.last_interaction
      };
    });

    res.json(result);
  } catch (error) {
    console.error('Error loading memories:', error);
    res.status(500).json({ error: 'Failed to load memories' });
  }
});

// 保存角色的记忆
router.post('/character/:characterId', (req, res) => {
  try {
    const { characterId } = req.params;
    const { world_id, memories } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!world_id) {
      return res.status(400).json({ error: 'world_id is required' });
    }

    if (!memories || !Array.isArray(memories)) {
      return res.status(400).json({ error: 'memories must be an array' });
    }

    const now = new Date().toISOString();
    const memoriesJson = JSON.stringify(memories);

    // 检查是否已存在
    const existing = db.prepare(`
      SELECT id FROM character_memories
      WHERE user_id = ? AND world_id = ? AND character_id = ?
    `).get(userId, world_id, characterId);

    if (existing) {
      // 更新
      db.prepare(`
        UPDATE character_memories
        SET memories = ?, last_interaction = ?, updated_at = ?
        WHERE id = ?
      `).run(memoriesJson, now, now, existing.id);
    } else {
      // 插入
      db.prepare(`
        INSERT INTO character_memories (user_id, world_id, character_id, memories, last_interaction, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(userId, world_id, characterId, memoriesJson, now, now, now);
    }

    res.json({ success: true, characterId, count: memories.length });
  } catch (error) {
    console.error('Error saving memories:', error);
    res.status(500).json({ error: 'Failed to save memories' });
  }
});

// 批量保存多个角色的记忆
router.post('/batch', (req, res) => {
  try {
    const { world_id, memories } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!world_id) {
      return res.status(400).json({ error: 'world_id is required' });
    }

    if (!memories || typeof memories !== 'object') {
      return res.status(400).json({ error: 'memories must be an object' });
    }

    const now = new Date().toISOString();

    const insertMany = db.transaction((memoriesObj) => {
      for (const [characterId, data] of Object.entries(memoriesObj)) {
        if (data && data.memories && Array.isArray(data.memories)) {
          const memoriesJson = JSON.stringify(data.memories);

          // 检查是否已存在
          const existing = db.prepare(`
            SELECT id FROM character_memories
            WHERE user_id = ? AND world_id = ? AND character_id = ?
          `).get(userId, world_id, characterId);

          if (existing) {
            // 更新
            db.prepare(`
              UPDATE character_memories
              SET memories = ?, last_interaction = ?, updated_at = ?
              WHERE id = ?
            `).run(memoriesJson, data.lastInteraction || now, now, existing.id);
          } else {
            // 插入
            db.prepare(`
              INSERT INTO character_memories (user_id, world_id, character_id, memories, last_interaction, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(userId, world_id, characterId, memoriesJson, data.lastInteraction || now, now, now);
          }
        }
      }
    });

    insertMany(memories);

    res.json({ success: true, count: Object.keys(memories).length });
  } catch (error) {
    console.error('Error batch saving memories:', error);
    res.status(500).json({ error: 'Failed to batch save memories' });
  }
});

// 删除指定角色的记忆
router.delete('/character/:characterId', (req, res) => {
  try {
    const { characterId } = req.params;
    const { world_id } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!world_id) {
      return res.status(400).json({ error: 'world_id is required' });
    }

    db.prepare(`
      DELETE FROM character_memories
      WHERE user_id = ? AND world_id = ? AND character_id = ?
    `).run(userId, world_id, characterId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting memories:', error);
    res.status(500).json({ error: 'Failed to delete memories' });
  }
});

export default router;
