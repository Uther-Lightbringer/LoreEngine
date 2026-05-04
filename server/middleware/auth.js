import db from '../database.js';

// 验证 token 中间件
export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.substring(7);

  try {
    // 简单实现：token 格式为 "userId:timestamp"
    // 实际生产中应该使用 JWT 或 session
    const parts = token.split(':');
    if (parts.length !== 2) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token format' });
    }

    const userId = parseInt(parts[0], 10);
    const timestamp = parseInt(parts[1], 10);

    // 检查用户是否存在
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: User not found' });
    }

    // 将用户信息附加到请求对象
    req.user = {
      id: user.id,
      username: user.username,
      isAdmin: !!user.is_admin
    };

    next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

// 验证管理员权限中间件
export const adminMiddleware = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }
  next();
};
