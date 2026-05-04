import express from 'express';
import db from '../database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.use(authMiddleware);

// 获取某个存档的所有时间点
router.get('/save/:saveId', (req, res) => {
  try {
    // 先验证存档属于当前用户
    const save = db.prepare('SELECT id FROM saves WHERE id = ? AND user_id = ?').get(req.params.saveId, req.user.id);
    if (!save) {
      return res.status(404).json({ error: 'Save not found' });
    }

    const timestamps = db.prepare(`
      SELECT * FROM timestamps
      WHERE save_id = ? AND user_id = ?
      ORDER BY created_at ASC
    `).all(req.params.saveId, req.user.id);

    const timestampsWithParsedState = timestamps.map(ts => ({
      ...ts,
      game_state: JSON.parse(ts.game_state)
    }));

    res.json(timestampsWithParsedState);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取某个世界观的所有时间点（当前存档）
router.get('/world/:worldId', (req, res) => {
  try {
    // 先找到该世界最新的存档（属于当前用户）
    const latestSave = db.prepare(`
      SELECT id FROM saves
      WHERE world_id = ? AND user_id = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(req.params.worldId, req.user.id);

    if (!latestSave) {
      return res.json([]);
    }

    const timestamps = db.prepare(`
      SELECT * FROM timestamps
      WHERE save_id = ? AND user_id = ?
      ORDER BY created_at ASC
    `).all(latestSave.id, req.user.id);

    const timestampsWithParsedState = timestamps.map(ts => ({
      ...ts,
      game_state: JSON.parse(ts.game_state)
    }));

    res.json(timestampsWithParsedState);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 根据ID获取时间点
router.get('/:id', (req, res) => {
  try {
    const timestamp = db.prepare('SELECT * FROM timestamps WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!timestamp) {
      return res.status(404).json({ error: 'Timestamp not found' });
    }
    timestamp.game_state = JSON.parse(timestamp.game_state);
    res.json(timestamp);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 创建新时间点
router.post('/', (req, res) => {
  try {
    const { world_id, save_id, step_number, description, game_state } = req.body;

    if (!game_state) {
      return res.status(400).json({ error: 'game_state is required' });
    }

    // 验证 save_id 属于当前用户
    if (save_id) {
      const save = db.prepare('SELECT id FROM saves WHERE id = ? AND user_id = ?').get(save_id, req.user.id);
      if (!save) {
        return res.status(403).json({ error: 'Save not found or access denied' });
      }
    }

    const stmt = db.prepare(`
      INSERT INTO timestamps (user_id, world_id, save_id, step_number, description, game_state)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      req.user.id,
      world_id || null,
      save_id || null,
      step_number || 0,
      description || '',
      JSON.stringify(game_state)
    );

    res.status(201).json({
      id: result.lastInsertRowid,
      world_id,
      save_id,
      step_number: step_number || 0,
      description: description || '',
      game_state
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 批量创建时间点（用于从某个时间点分叉）
router.post('/batch', (req, res) => {
  try {
    const { timestamps } = req.body;

    if (!timestamps || !Array.isArray(timestamps)) {
      return res.status(400).json({ error: 'timestamps array is required' });
    }

    const stmt = db.prepare(`
      INSERT INTO timestamps (user_id, world_id, save_id, step_number, description, game_state)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertedIds = [];
    for (const ts of timestamps) {
      const result = stmt.run(
        req.user.id,
        ts.world_id || null,
        ts.save_id || null,
        ts.step_number || 0,
        ts.description || '',
        JSON.stringify(ts.game_state)
      );
      insertedIds.push(result.lastInsertRowid);
    }

    res.status(201).json({ insertedIds });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除时间点
router.delete('/:id', (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM timestamps WHERE id = ? AND user_id = ?');
    const result = stmt.run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Timestamp not found' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除某个存档的所有时间点（保留最近N个）
router.delete('/save/:saveId/keep-last', (req, res) => {
  try {
    // 验证存档属于当前用户
    const save = db.prepare('SELECT id FROM saves WHERE id = ? AND user_id = ?').get(req.params.saveId, req.user.id);
    if (!save) {
      return res.status(404).json({ error: 'Save not found' });
    }

    const keepCount = parseInt(req.query.keep) || 50;

    // 获取要保留的时间点ID
    const keepIds = db.prepare(`
      SELECT id FROM timestamps
      WHERE save_id = ? AND user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(req.params.saveId, req.user.id, keepCount);

    const keepIdsStr = keepIds.map(k => k.id).join(',') || '0';

    // 删除不在保留列表中的时间点
    const stmt = db.prepare(`
      DELETE FROM timestamps
      WHERE save_id = ? AND user_id = ? AND id NOT IN (${keepIdsStr})
    `);
    const result = stmt.run(req.params.saveId, req.user.id);

    res.json({ success: true, deletedCount: result.changes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
