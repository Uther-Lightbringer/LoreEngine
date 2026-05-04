import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { GameStateProvider, useGameState } from './store/gameState.jsx';
import { loadFromLocalStorage, clearLocalStorageSave } from './services/saveService.js';
import { isLoggedIn, logout, getUser } from './services/authService.js';
import Login from './components/Login.jsx';
import MainMenu from './components/MainMenu.jsx';
import WorldCreation from './components/WorldCreation.jsx';
import ProtagonistCreation from './components/ProtagonistCreation.jsx';
import CharacterCreation from './components/CharacterCreation.jsx';
import SceneCreation from './components/SceneCreation.jsx';
import SceneView from './components/SceneView.jsx';
import UserManagement from './components/UserManagement.jsx';
import ApiSettings from './components/ApiSettings.jsx';
import StoryModeSetup from './components/StoryModeSetup.jsx';
import './App.css';

// 受保护路由：未登录重定向到 /login
const ProtectedRoute = ({ children, adminOnly = false }) => {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />;
  }
  if (adminOnly && !getUser()?.isAdmin) {
    return <Navigate to="/" replace />;
  }
  return children;
};

const AppContent = () => {
  const { state: gameState, dispatch } = useGameState();
  const navigate = useNavigate();
  const location = useLocation();
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [user, setUser] = useState(loggedIn ? getUser() : null);
  const [showApiSettings, setShowApiSettings] = useState(false);

  // 监听登录状态变化
  useEffect(() => {
    const authed = isLoggedIn();
    setLoggedIn(authed);
    if (authed) {
      setUser(getUser());
    } else {
      setUser(null);
    }
  }, [location.pathname]);

  const handleLoginSuccess = () => {
    setLoggedIn(true);
    setUser(getUser());
    // 登录后检查是否有存档
    const savedGame = loadFromLocalStorage();
    if (savedGame && savedGame.world && savedGame.world.name) {
      dispatch({ type: 'SET_STATE', payload: savedGame });
      navigate('/play', { replace: true });
    } else {
      navigate('/', { replace: true });
    }
  };

  const handleLogout = () => {
    logout();
    clearLocalStorageSave();
    setLoggedIn(false);
    setUser(null);
    navigate('/login', { replace: true });
  };

  const openApiSettings = () => setShowApiSettings(true);

  return (
    <div className="app">
      {/* 顶部栏 — 仅在已登录时显示 */}
      {loggedIn && (
        <div className="top-bar">
          <span className="user-info">
            欢迎, {user?.username}
            {user?.isAdmin && <span className="admin-badge">管理员</span>}
          </span>
          <div className="top-bar-actions">
            {user?.isAdmin && location.pathname === '/' && (
              <button className="top-bar-btn" onClick={() => navigate('/admin')}>
                用户管理
              </button>
            )}
            {user?.isAdmin && location.pathname === '/' && (
              <button className="top-bar-btn" onClick={openApiSettings}>
                API设置
              </button>
            )}
            <button className="top-bar-btn" onClick={handleLogout}>
              登出
            </button>
          </div>
        </div>
      )}

      <Routes>
        {/* 登录页 */}
        <Route
          path="/login"
          element={
            loggedIn ? <Navigate to="/" replace /> : <Login onLoginSuccess={handleLoginSuccess} />
          }
        />

        {/* 主菜单 */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainMenu />
            </ProtectedRoute>
          }
        />

        {/* 创建流程 */}
        <Route
          path="/create/world"
          element={
            <ProtectedRoute>
              <WorldCreation onOpenApiSettings={openApiSettings} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/create/protagonist"
          element={
            <ProtectedRoute>
              <ProtagonistCreation onOpenApiSettings={openApiSettings} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/create/character"
          element={
            <ProtectedRoute>
              <CharacterCreation onOpenApiSettings={openApiSettings} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/create/scene"
          element={
            <ProtectedRoute>
              <SceneCreation onOpenApiSettings={openApiSettings} />
            </ProtectedRoute>
          }
        />

        {/* 游戏中 */}
        <Route
          path="/play"
          element={
            <ProtectedRoute>
              <SceneView />
            </ProtectedRoute>
          }
        />

        {/* 剧情模式 */}
        <Route
          path="/story"
          element={
            <ProtectedRoute>
              <StoryModeSetup onOpenApiSettings={openApiSettings} />
            </ProtectedRoute>
          }
        />

        {/* 管理员 */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute adminOnly>
              <UserManagement />
            </ProtectedRoute>
          }
        />

        {/* 未匹配路由重定向到首页 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* API 设置弹窗 */}
      {showApiSettings && (
        <ApiSettings onClose={() => setShowApiSettings(false)} />
      )}
    </div>
  );
};

const App = () => {
  return (
    <GameStateProvider>
      <AppContent />
    </GameStateProvider>
  );
};

export default App;
