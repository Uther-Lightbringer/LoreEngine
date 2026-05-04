import React, { createContext, useContext, useReducer } from 'react';
import { initialGameState } from '../data/templates.js';
import { saveKeyStateToLocalStorage } from '../services/saveService.js';

const GameStateContext = createContext();

const gameReducer = (state, action) => {
  switch (action.type) {
    case 'SET_STATE':
      // 确保新状态有所有必需的字段，特别是 narratorMemories 和 narratorContext
      return {
        ...initialGameState,
        ...action.payload,
        // 确保数组字段存在且是数组
        narratorMemories: Array.isArray(action.payload.narratorMemories) ? action.payload.narratorMemories : [],
        narratorContext: Array.isArray(action.payload.narratorContext) ? action.payload.narratorContext : [],
        characterMemories: action.payload.characterMemories || {},
        characterCurrentDialogues: action.payload.characterCurrentDialogues || {}
      };
    case 'RESET_STATE':
      return {
        ...initialGameState,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    case 'UPDATE_WORLD':
      return {
        ...state,
        world: { ...state.world, ...action.payload },
        updatedAt: new Date().toISOString()
      };
    case 'SET_GAME_MODE':
      return {
        ...state,
        gameMode: action.payload,
        updatedAt: new Date().toISOString()
      };
    case 'ADD_CHARACTER':
      return {
        ...state,
        characters: [...state.characters, { ...action.payload, id: action.payload.id || `char_${Date.now()}` }],
        updatedAt: new Date().toISOString()
      };
    case 'UPDATE_CHARACTER':
      // 支持两种格式：
      // 1. { id, updates: { field1, field2 } }
      // 2. { id, field1, field2 } (直接把字段放在 payload)
      const updates = action.payload.updates || action.payload;
      const updateId = action.payload.id;
      return {
        ...state,
        characters: state.characters.map(char =>
          char.id === updateId ? { ...char, ...updates } : char
        ),
        updatedAt: new Date().toISOString()
      };
    case 'DELETE_CHARACTER':
      return {
        ...state,
        characters: state.characters.filter(char => char.id !== action.payload),
        updatedAt: new Date().toISOString()
      };
    case 'MOVE_CHARACTER':
      return {
        ...state,
        characters: state.characters.map(char =>
          char.id === action.payload.characterId
            ? { ...char, currentSceneId: action.payload.sceneId }
            : char
        ),
        updatedAt: new Date().toISOString()
      };
    case 'ADD_SCENE':
      return {
        ...state,
        scenes: [...state.scenes, { ...action.payload, id: action.payload.id || `scene_${Date.now()}` }],
        updatedAt: new Date().toISOString()
      };
    case 'UPDATE_SCENE':
      return {
        ...state,
        scenes: state.scenes.map(scene =>
          scene.id === action.payload.id ? { ...scene, ...action.payload } : scene
        ),
        updatedAt: new Date().toISOString()
      };
    case 'DELETE_SCENE':
      return {
        ...state,
        scenes: state.scenes.filter(scene => scene.id !== action.payload),
        // 同时清除场景关联
        characters: state.characters.map(char =>
          char.currentSceneId === action.payload
            ? { ...char, currentSceneId: null }
            : char
        ),
        updatedAt: new Date().toISOString()
      };
    case 'SET_CURRENT_SCENE':
      return {
        ...state,
        currentSceneId: action.payload,
        updatedAt: new Date().toISOString()
      };
    case 'ADD_DIALOGUE':
      return {
        ...state,
        dialogueHistory: [...state.dialogueHistory, action.payload],
        updatedAt: new Date().toISOString()
      };
    case 'CLEAR_DIALOGUE':
      return {
        ...state,
        dialogueHistory: [],
        updatedAt: new Date().toISOString()
      };
    case 'ADD_CHARACTER_MEMORY':
      return {
        ...state,
        characterMemories: {
          ...state.characterMemories,
          [action.payload.characterId]: {
            memories: [
              ...(state.characterMemories[action.payload.characterId]?.memories || []),
              {
                id: `memory_${Date.now()}`,
                content: action.payload.content,
                timestamp: new Date().toISOString(),
                importance: action.payload.importance || 5,
                gameTime: action.payload.gameTime || (state.gameTime ? {
                  year: state.gameTime.year,
                  month: state.gameTime.month,
                  day: state.gameTime.day,
                  hour: state.gameTime.hour,
                  minute: state.gameTime.minute,
                  dayOfWeek: state.gameTime.dayOfWeek
                } : null),
                isTraumaticMemory: action.payload.isTraumaticMemory || false,
                requiresHealing: action.payload.requiresHealing || false,
                expiresInDays: action.payload.expiresInDays || null // 临时记忆的过期天数，null表示永久记忆
              }
            ],
            lastInteraction: new Date().toISOString()
          }
        },
        updatedAt: new Date().toISOString()
      };
    case 'UPDATE_CHARACTER_MEMORIES':
      return {
        ...state,
        characterMemories: {
          ...state.characterMemories,
          [action.payload.characterId]: {
            ...state.characterMemories[action.payload.characterId],
            memories: action.payload.memories,
            lastInteraction: new Date().toISOString()
          }
        },
        updatedAt: new Date().toISOString()
      };
    case 'CLEAR_CHARACTER_MEMORY':
      const newMemories = { ...state.characterMemories };
      delete newMemories[action.payload.characterId];
      return {
        ...state,
        characterMemories: newMemories,
        updatedAt: new Date().toISOString()
      };
    case 'UPDATE_PLAYER_STATUS':
      return {
        ...state,
        playerStatus: { ...state.playerStatus, ...action.payload },
        updatedAt: new Date().toISOString()
      };
    case 'SET_PLAYER_HP':
      return {
        ...state,
        playerStatus: {
          ...state.playerStatus,
          hp: Math.max(0, Math.min(state.playerStatus.maxHp, action.payload))
        },
        updatedAt: new Date().toISOString()
      };
    case 'SET_PLAYER_MP':
      return {
        ...state,
        playerStatus: {
          ...state.playerStatus,
          mp: Math.max(0, Math.min(state.playerStatus.maxMp, action.payload))
        },
        updatedAt: new Date().toISOString()
      };
    case 'INIT_PROTAGONIST_PERSONALITY':
      return {
        ...state,
        protagonistPersonality: {
          ...state.protagonistPersonality,
          personalityDescription: action.payload.description || "",
          personalityTraits: action.payload.traits || state.protagonistPersonality.personalityTraits
        },
        updatedAt: new Date().toISOString()
      };
    case 'UPDATE_PROTAGONIST_PERSONALITY':
      return {
        ...state,
        protagonistPersonality: {
          ...state.protagonistPersonality,
          ...action.payload
        },
        updatedAt: new Date().toISOString()
      };
    case 'ADD_CHARACTER_CURRENT_DIALOGUE':
      return {
        ...state,
        characterCurrentDialogues: {
          ...state.characterCurrentDialogues,
          [action.payload.characterId]: [
            ...(state.characterCurrentDialogues[action.payload.characterId] || []),
            action.payload.dialogue
          ]
        },
        updatedAt: new Date().toISOString()
      };
    case 'CLEAR_CHARACTER_CURRENT_DIALOGUE':
      const newCurrentDialogues = { ...state.characterCurrentDialogues };
      delete newCurrentDialogues[action.payload.characterId];
      return {
        ...state,
        characterCurrentDialogues: newCurrentDialogues,
        updatedAt: new Date().toISOString()
      };
    case 'ADD_NARRATOR_MEMORY':
      // 跳过"无人知晓"级别的记忆
      if (action.payload.impactLevel === '无人知晓') {
        return state;
      }
      return {
        ...state,
        narratorMemories: [
          ...(Array.isArray(state.narratorMemories) ? state.narratorMemories : []),
          {
            id: `narrator_memory_${Date.now()}`,
            content: action.payload.content,
            impactLevel: action.payload.impactLevel || '当前场景',
            importance: action.payload.importance || 5,
            timestamp: new Date().toISOString(),
            sceneId: action.payload.sceneId || state.currentSceneId
          }
        ],
        narratorContext: [
          ...(Array.isArray(state.narratorContext) ? state.narratorContext : []).slice(-19),
          {
            type: action.payload.type || 'action',
            content: action.payload.content,
            timestamp: new Date().toISOString()
          }
        ],
        updatedAt: new Date().toISOString()
      };
    case 'CLEAR_NARRATOR_CONTEXT':
      return {
        ...state,
        narratorContext: [],
        updatedAt: new Date().toISOString()
      };
    case 'CLEAR_NARRATOR_MEMORIES':
      return {
        ...state,
        narratorMemories: [],
        narratorContext: [],
        updatedAt: new Date().toISOString()
      };
    case 'ADVANCE_TIME':
      // 推进时间（分钟）
      const minutesToAdvance = action.payload.minutes || 10;
      const newTime = { ...state.gameTime };

      // 增加分钟
      newTime.minute += minutesToAdvance;

      // 处理进位
      while (newTime.minute >= 60) {
        newTime.minute -= 60;
        newTime.hour += 1;
      }

      while (newTime.hour >= 24) {
        newTime.hour -= 24;
        newTime.day += 1;
        newTime.dayOfWeek = newTime.dayOfWeek >= 7 ? 1 : newTime.dayOfWeek + 1;
      }

      // 简单处理月份（假设每个月30天）
      while (newTime.day > 30) {
        newTime.day -= 30;
        newTime.month += 1;
      }

      while (newTime.month > 12) {
        newTime.month -= 12;
        newTime.year += 1;
      }

      return {
        ...state,
        gameTime: newTime,
        updatedAt: new Date().toISOString()
      };
    case 'SET_GAME_TIME':
      return {
        ...state,
        gameTime: { ...action.payload },
        updatedAt: new Date().toISOString()
      };
    case 'SKIP_DAYS':
      // 跳跃指定天数
      const daysToSkip = action.payload.days || 0;
      if (daysToSkip <= 0) return state;

      const skipTime = { ...state.gameTime };
      skipTime.day += daysToSkip;
      skipTime.hour = 8; // 跳转到早上8点
      skipTime.minute = 0;

      // 处理日期溢出
      while (skipTime.day > 30) {
        skipTime.day -= 30;
        skipTime.month += 1;
      }
      while (skipTime.month > 12) {
        skipTime.month -= 12;
        skipTime.year += 1;
      }

      // 更新星期（假设每月30天，每周7天）
      const daysOfWeekShift = ((daysToSkip % 7) + 7) % 7;
      skipTime.dayOfWeek = ((skipTime.dayOfWeek - 1 + daysOfWeekShift) % 7) + 1;

      return {
        ...state,
        gameTime: skipTime,
        updatedAt: new Date().toISOString()
      };
    default:
      return state;
  }
};

export const GameStateProvider = ({ children }) => {
  const [state, dispatch] = useReducer(gameReducer, {
    ...initialGameState,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // 手动保存函数（只在角色回复时调用）
  const saveGame = () => {
    if (state.world && state.world.name) {
      saveKeyStateToLocalStorage(state);
    }
  };

  return (
    <GameStateContext.Provider value={{ state, dispatch, saveGame }}>
      {children}
    </GameStateContext.Provider>
  );
};

export const useGameState = () => {
  const context = useContext(GameStateContext);
  if (!context) {
    throw new Error('useGameState must be used within a GameStateProvider');
  }
  return context;
};
