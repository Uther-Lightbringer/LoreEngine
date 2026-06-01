import express from 'express';
import db from '../database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.use(authMiddleware);

// 获取当前用户的草稿列表
router.get('/drafts', (req, res) => {
  try {
    const drafts = db.prepare('SELECT * FROM saves WHERE user_id = ? AND save_type = ? ORDER BY updated_at DESC')
      .all(req.user.id, 'draft');
    const draftsWithParsedState = drafts.map(save => ({
      ...save,
      game_state: JSON.parse(save.game_state)
    }));
    res.json(draftsWithParsedState);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取所有存档（用户隔离）
router.get('/', (req, res) => {
  try {
    const saves = db.prepare('SELECT * FROM saves WHERE user_id = ? ORDER BY updated_at DESC').all(req.user.id);
    const savesWithParsedState = saves.map(save => ({
      ...save,
      game_state: JSON.parse(save.game_state)
    }));
    res.json(savesWithParsedState);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 根据ID获取存档
router.get('/:id', (req, res) => {
  try {
    const save = db.prepare('SELECT * FROM saves WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!save) {
      return res.status(404).json({ error: 'Save not found' });
    }
    save.game_state = JSON.parse(save.game_state);
    res.json(save);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取某个世界观的所有存档
router.get('/world/:worldId', (req, res) => {
  try {
    const saves = db.prepare('SELECT * FROM saves WHERE world_id = ? AND user_id = ? ORDER BY updated_at DESC')
      .all(req.params.worldId, req.user.id);
    const savesWithParsedState = saves.map(save => ({
      ...save,
      game_state: JSON.parse(save.game_state)
    }));
    res.json(savesWithParsedState);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 创建新存档
router.post('/', (req, res) => {
  try {
    const { world_id, name, game_state, save_type } = req.body;

    if (!name || !game_state) {
      return res.status(400).json({ error: 'Name and game_state are required' });
    }

    // 验证 world_id 属于当前用户
    if (world_id) {
      const world = db.prepare('SELECT id FROM worlds WHERE id = ? AND user_id = ?').get(world_id, req.user.id);
      if (!world) {
        return res.status(403).json({ error: 'World not found or access denied' });
      }
    }

    const type = (save_type === 'draft') ? 'draft' : 'save';

    const stmt = db.prepare(`
      INSERT INTO saves (user_id, world_id, name, game_state, save_type)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      req.user.id,
      world_id || null,
      name,
      JSON.stringify(game_state),
      type
    );

    res.status(201).json({
      id: result.lastInsertRowid,
      world_id,
      name,
      game_state,
      save_type: type
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 更新存档
router.put('/:id', (req, res) => {
  try {
    const { game_state, save_type } = req.body;

    if (!game_state) {
      return res.status(400).json({ error: 'game_state is required' });
    }

    const type = (save_type === 'draft' || save_type === 'save') ? save_type : null;

    let stmt;
    if (type) {
      stmt = db.prepare(`
        UPDATE saves
        SET game_state = ?, save_type = ?, updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `);
    } else {
      stmt = db.prepare(`
        UPDATE saves
        SET game_state = ?, updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `);
    }

    const result = type
      ? stmt.run(JSON.stringify(game_state), type, req.params.id, req.user.id)
      : stmt.run(JSON.stringify(game_state), req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Save not found' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除存档
router.delete('/:id', (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM saves WHERE id = ? AND user_id = ?');
    const result = stmt.run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Save not found' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
