import express from 'express';
import db from '../database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.use(authMiddleware);

// 获取所有角色（用户隔离）
router.get('/', (req, res) => {
  try {
    const characters = db.prepare('SELECT * FROM characters WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    const formattedCharacters = characters.map(char => ({
      ...char,
      isProtagonist: char.is_protagonist === 1
    }));
    res.json(formattedCharacters);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 根据ID获取角色
router.get('/:id', (req, res) => {
  try {
    const character = db.prepare('SELECT * FROM characters WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }
    // 转换字段名
    character.isProtagonist = character.is_protagonist === 1;
    delete character.is_protagonist;
    // 解析 physical_appearance JSON
    if (character.physical_appearance) {
      try {
        character.physicalAppearance = JSON.parse(character.physical_appearance);
      } catch (e) {
        character.physicalAppearance = {};
      }
      delete character.physical_appearance;
    }
    res.json(character);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取某个世界观的所有角色
router.get('/world/:worldId', (req, res) => {
  try {
    const characters = db.prepare('SELECT * FROM characters WHERE world_id = ? AND user_id = ? ORDER BY created_at DESC')
      .all(req.params.worldId, req.user.id);
    const formattedCharacters = characters.map(char => {
      // 转换字段名
      const formatted = {
        ...char,
        isProtagonist: char.is_protagonist === 1
      };
      delete formatted.is_protagonist;
      // 解析 physical_appearance JSON
      if (formatted.physical_appearance) {
        try {
          formatted.physicalAppearance = JSON.parse(formatted.physical_appearance);
        } catch (e) {
          formatted.physicalAppearance = {};
        }
        delete formatted.physical_appearance;
      }
      return formatted;
    });
    res.json(formattedCharacters);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 保存角色
router.post('/', (req, res) => {
  try {
    const { id, world_id, name, personality, appearance, physical_appearance, background, image_url, isProtagonist } = req.body;

    if (!id || !name) {
      return res.status(400).json({ error: 'id and name are required' });
    }

    // 确保 world_id 是有效整数或 null
    let validWorldId = null;
    if (world_id !== undefined && world_id !== null && world_id !== '') {
      const numId = Number(world_id);
      if (!isNaN(numId) && Number.isInteger(numId)) {
        validWorldId = numId;
      }
    }

    // 验证 world_id 属于当前用户
    if (validWorldId) {
      const world = db.prepare('SELECT id FROM worlds WHERE id = ? AND user_id = ?').get(validWorldId, req.user.id);
      if (!world) {
        return res.status(403).json({ error: 'World not found or access denied' });
      }
    }

    // 将 physical_appearance 对象转为 JSON 字符串
    const physicalAppearanceStr = physical_appearance ? JSON.stringify(physical_appearance) : null;

    // 检查是否已存在
    const existing = db.prepare('SELECT * FROM characters WHERE id = ? AND user_id = ?').get(id, req.user.id);

    if (existing) {
      // 更新现有角色
      const stmt = db.prepare(`
        UPDATE characters
        SET name = ?, personality = ?, appearance = ?, physical_appearance = ?, background = ?,
            image_url = ?, is_protagonist = ?, updated_at = datetime('now')
        WHERE id = ?
      `);
      stmt.run(
        name,
        personality || null,
        appearance || null,
        physicalAppearanceStr,
        background || null,
        image_url || null,
        isProtagonist ? 1 : 0,
        id
      );
      res.json({ id, name, personality, appearance, physical_appearance, background, image_url, isProtagonist });
    } else {
      // 创建新角色
      const stmt = db.prepare(`
        INSERT INTO characters (id, user_id, world_id, name, personality, appearance, physical_appearance, background, image_url, is_protagonist)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        id,
        req.user.id,
        validWorldId,
        name,
        personality || null,
        appearance || null,
        physicalAppearanceStr,
        background || null,
        image_url || null,
        isProtagonist ? 1 : 0
      );
      res.status(201).json({ id, world_id: validWorldId, name, personality, appearance, physical_appearance, background, image_url, isProtagonist });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除角色
router.delete('/:id', (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM characters WHERE id = ? AND user_id = ?');
    const result = stmt.run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Character not found' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
