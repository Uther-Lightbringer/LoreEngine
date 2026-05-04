# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an **AI-driven visual novel** application built with React + Vite. It allows users to create and play interactive stories with AI-generated content.

- **Tech Stack**: React 18.3, Vite 5.4, JavaScript (JSX)
- **AI Integration**: Supports OpenAI-compatible APIs (OpenAI, DeepSeek, custom), Anthropic API
- **Image Generation**: Custom image API integration

## Common Commands

```bash
# Install dependencies
npm install

# Start development server (port 3000)
npm run dev

# Build for production
npm run build

# Run ESLint
npm run lint

# Preview production build
npm run preview
```

## Architecture

### State Management
Uses React Context + useReducer pattern in `src/store/gameState.jsx`

**Key Actions**:
- `SET_STATE` - Replace entire state
- `RESET_STATE` - Reset to initial state
- `UPDATE_WORLD` - Update world settings
- `ADD_CHARACTER` / `UPDATE_CHARACTER` / `DELETE_CHARACTER` - Character CRUD
- `ADD_SCENE` / `UPDATE_SCENE` / `DELETE_SCENE` - Scene CRUD
- `SET_CURRENT_SCENE` - Navigate to scene
- `ADD_DIALOGUE` / `CLEAR_DIALOGUE` - Dialogue history

### App Flow (App.jsx)
```
MainMenu → WorldCreation → CharacterCreation → SceneCreation → SceneView (playing)
```

### Key Services

| File | Purpose |
|------|---------|
| `src/services/aiService.js` | AI API calls (OpenAI/DeepSeek/Anthropic), config storage, JSON extraction |
| `src/services/imageService.js` | Image generation API with polling |
| `src/services/saveService.js` | Save/load game (localStorage + JSON file export/import) |
| `src/data/templates.js` | Default state templates and AI prompt templates |

### Component Structure

- `MainMenu` - New game, continue, import save
- `WorldCreation` - World setup
- `CharacterCreation` - Character management
- `SceneCreation` - Scene setup
- `SceneView` - Gameplay screen with dialogue, choices, AI settings

## Data Structure

```javascript
{
  version: "1.0",
  world: { name, description, imageUrl },
  characters: [{ id, name, personality, appearance, imageUrl, isProtagonist }],
  scenes: [{ id, name, description, imageUrl, connectedScenes, npcs }],
  currentSceneId: null,
  dialogueHistory: [{ speaker, text }],
  createdAt, updatedAt
}
```

## AI Configuration

### Config File (Recommended)
You can pre-configure API keys in `src/config.js` (copy from `src/config.example.js`):

```bash
# 1. Copy the example config
cp src/config.example.js src/config.js

# 2. Edit src/config.js and add your API keys
```

`src/config.js` is git-ignored and won't be committed.

### Configuration Priority
1. **localStorage** - Settings saved via the UI (highest priority)
2. **config.js** - Pre-configured keys in the config file
3. **Defaults** - Fallback default values

### Storage Keys
- `{provider}_config` (openai, deepseek, anthropic, custom)
- `image_config` - Image generation API settings
- `last_provider` - Last used AI provider
