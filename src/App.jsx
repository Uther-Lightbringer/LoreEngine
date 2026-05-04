import React, { useState, useEffect } from 'react';
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

const AppContent = () => {
  const { state: gameState, dispatch } = useGameState();
  const [screen, setScreen] = useState('menu'); // menu, world, protagonist, character, scene, playing, admin, story-mode
  const [loggedIn, setLoggedIn] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [user, setUser] = useState(null);
  const [showApiSettings, setShowApiSettings] = useState(false);

  // 检查认证状态
  useEffect(() => {
    const checkAuth = () => {
      const authed = isLoggedIn();
      setLoggedIn(authed);
      if (authed) {
        setUser(getUser());
      }
      setCheckingAuth(false);
    };
    checkAuth();
  }, []);

  // 启动时检查是否有保存的游戏状态
  useEffect(() => {
    if (!loggedIn) return;

    const savedGame = loadFromLocalStorage();
    if (savedGame && savedGame.world && savedGame.world.name) {
      dispatch({ type: 'SET_STATE', payload: savedGame });
      setScreen('playing');
    }
  }, [loggedIn, dispatch]);

  const handleLoginSuccess = () => {
    clearLocalStorageSave(); // 清除旧的游戏状态
    setLoggedIn(true);
    setUser(getUser());
  };

  const handleLogout = () => {
    logout();
    clearLocalStorageSave(); // 清除游戏状态
    setLoggedIn(false);
    setUser(null);
    setScreen('menu');
  };

  const handleStartGame = (mode) => {
    if (mode === 'story') {
      setScreen('story-mode');
    } else {
      setScreen('world');
    }
  };

  const handleContinueGame = () => {
    setScreen('playing');
  };

  const handleBackToMenu = () => {
    setScreen('menu');
  };

  const handleNextFromWorld = () => {
    setScreen('protagonist');
  };

  const handleBackFromWorld = () => {
    setScreen('menu');
  };

  const handleNextFromProtagonist = () => {
    setScreen('character');
  };

  const handleBackFromProtagonist = () => {
    setScreen('world');
  };

  const handleNextFromCharacter = () => {
    setScreen('scene');
  };

  const handleBackFromCharacter = () => {
    setScreen('protagonist');
  };

  const handleStartPlaying = () => {
    setScreen('playing');
  };

  const handleBackFromScene = () => {
    setScreen('character');
  };

  const handleOpenAdmin = () => {
    setScreen('admin');
  };

  const handleBackFromAdmin = () => {
    setScreen('menu');
  };

  const handleNextFromStoryMode = () => {
    // StoryModeSetup 已经设置好了世界、主角、角色和场景
    // 直接进入游戏
    setScreen('playing');
  };

  const handleBackFromStoryMode = () => {
    setScreen('menu');
  };

  // 加载中状态
  if (checkingAuth) {
    return (
      <div className="loading-container">
        <p>加载中...</p>
      </div>
    );
  }

  // 未登录状态
  if (!loggedIn) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="app">
      {/* 顶部栏 */}
      <div className="top-bar">
        <span className="user-info">
          欢迎, {user?.username}
          {user?.isAdmin && <span className="admin-badge">管理员</span>}
        </span>
        <div className="top-bar-actions">
          {user?.isAdmin && screen === 'menu' && (
            <button className="top-bar-btn" onClick={handleOpenAdmin}>
              用户管理
            </button>
          )}
          {user?.isAdmin && screen === 'menu' && (
            <button className="top-bar-btn" onClick={() => setShowApiSettings(true)}>
              API设置
            </button>
          )}
          <button className="top-bar-btn" onClick={handleLogout}>
            登出
          </button>
        </div>
      </div>

      {screen === 'menu' && (
        <MainMenu
          onStartGame={handleStartGame}
          onContinueGame={handleContinueGame}
        />
      )}
      {screen === 'world' && (
        <WorldCreation
          onNext={handleNextFromWorld}
          onBack={handleBackFromWorld}
          onOpenApiSettings={() => setShowApiSettings(true)}
        />
      )}
      {screen === 'protagonist' && (
        <ProtagonistCreation
          onNext={handleNextFromProtagonist}
          onBack={handleBackFromProtagonist}
          onOpenApiSettings={() => setShowApiSettings(true)}
        />
      )}
      {screen === 'character' && (
        <CharacterCreation
          onNext={handleNextFromCharacter}
          onBack={handleBackFromCharacter}
          onOpenApiSettings={() => setShowApiSettings(true)}
        />
      )}
      {screen === 'scene' && (
        <SceneCreation
          onStartPlaying={handleStartPlaying}
          onBack={handleBackFromScene}
          onOpenApiSettings={() => setShowApiSettings(true)}
        />
      )}
      {screen === 'playing' && (
        <SceneView
          onBackToMenu={handleBackToMenu}
        />
      )}
      {screen === 'story-mode' && (
        <StoryModeSetup
          onNext={handleNextFromStoryMode}
          onBack={handleBackFromStoryMode}
          onOpenApiSettings={() => setShowApiSettings(true)}
        />
      )}
      {screen === 'admin' && (
        <UserManagement
          onBack={handleBackFromAdmin}
        />
      )}
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
