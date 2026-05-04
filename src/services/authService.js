// Auth Service - 管理用户认证状态
const API_BASE = import.meta.env.VITE_API_URL || '/api';
const AUTH_TOKEN_KEY = 'auth_token';
const AUTH_USER_KEY = 'auth_user';

// 获取 token
export const getToken = () => {
  return localStorage.getItem(AUTH_TOKEN_KEY);
};

// 获取用户信息
export const getUser = () => {
  const userStr = localStorage.getItem(AUTH_USER_KEY);
  if (userStr) {
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }
  return null;
};

// 检查是否已登录
export const isLoggedIn = () => {
  return !!getToken() && !!getUser();
};

// 登录
export const login = async (username, password) => {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, password })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Login failed' }));
    throw new Error(error.error || 'Login failed');
  }

  const data = await response.json();

  // 保存 token 和用户信息
  localStorage.setItem(AUTH_TOKEN_KEY, data.token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));

  return data;
};

// 登出
export const logout = () => {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
};

// 验证 token
export const verifyToken = async () => {
  const token = getToken();
  if (!token) {
    return false;
  }

  try {
    const response = await fetch(`${API_BASE}/auth/verify`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return response.ok;
  } catch {
    return false;
  }
};

export default {
  getToken,
  getUser,
  isLoggedIn,
  login,
  logout,
  verifyToken
};
