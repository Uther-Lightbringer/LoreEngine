# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**LoreEngine** — self-hosted AI-driven interactive visual novel engine. Users create worlds and characters; AI generates narrative, dialogue, choices, and illustrations.

- **Frontend**: React 19, Vite 8, JavaScript (JSX), no TypeScript
- **Backend**: Express.js (ESM), better-sqlite3, multer for uploads
- **AI Text**: DeepSeek / OpenAI / Anthropic / Custom OpenAI-compatible APIs
- **AI Image**: Evolink / MiniMax / Custom image generation APIs
- **Deploy**: Docker + docker-compose (dev & prod configs)

## Commands

```bash
# Install both frontend and backend
npm run install:all

# Dev mode — frontend :3000, backend :29999 (concurrently)
npm run dev

# Dev frontend only
npm run dev:frontend

# Dev backend only
npm run dev:backend

# Production build + serve
npm run build && npm run start:prod

# Docker
npm run docker:build && npm run docker:up
```

No test runner is configured. There is a manual test script at `server/test-novel-flow.js`.

## Architecture

### Full-Stack Flow

Frontend does **not** call AI providers directly. All AI/image requests go through the backend proxy:

```
Browser → Vite proxy (/api) → Express backend → AI provider APIs
```

Vite dev server proxies `/api`, `/uploads`, `/cache-images` to `http://localhost:29999` (see `vite.config.js`).

### Backend (server/)

- `index.js` — Express app setup, route mounting, static file serving
- `routes/` — API endpoints: `ai.js` (84K, the largest file — AI generation logic), `novels.js`, `characters.js`, `memories.js`, `images.js`, `saves.js`, `worlds.js`, `timestamps.js`, `auth.js`, `users.js`
- `services/aiService.js` — Server-side AI provider integration
- `middleware/auth.js` — JWT auth middleware
- `database.js` — SQLite schema and queries (better-sqlite3)
- `config.js` — Runtime configuration management
- `data/` — SQLite database files (runtime)
- `uploads/` — User-uploaded images
- Env config via `server/.env` (copy from `server/.env.example`)

### Frontend State Management

React Context + `useReducer` in `src/store/gameState.jsx`. The reducer handles ~25 action types covering:

- World/character/scene CRUD
- Dialogue history
- **Character memory** — per-character memory arrays with importance, trauma, expiry; separate `characterCurrentDialogues` for uncompressed recent dialogue
- **Narrator memory** — `narratorMemories` (persistent) + `narratorContext` (rolling 20-item window); "无人知晓" impact level is filtered out
- **Player status** — HP/MP with clamping, gold, level, exp
- **Protagonist personality** — trait sliders (extroversion, rationality, orderliness, optimism) + mood
- **Game time** — `ADVANCE_TIME` (minutes), `SET_GAME_TIME`, `SKIP_DAYS`; custom 30-day months, 7-day weeks

### Frontend Services

| Service | Role |
|---------|------|
| `apiService.js` | HTTP client to backend `/api/ai/*` — all AI and image generation calls |
| `aiService.js` | Wrapper around apiService + `extractJSON()` utility + token limit constants |
| `authService.js` | Login/logout, JWT token storage in localStorage |
| `characterMemoryService.js` | Character memory CRUD via backend API with localStorage fallback |
| `imageService.js` | Image generation with polling |
| `saveService.js` | Game state save/load (localStorage + JSON export/import) |
| `novelService.js` | Novel/chapter management API calls |

### App Flow (App.jsx)

```
Login → MainMenu → { WorldCreation → ProtagonistCreation → CharacterCreation → SceneCreation → SceneView }
                  → { StoryModeSetup → SceneView }
                  → { UserManagement (admin only) }
```

Two game modes: **story** (narrative-driven with novel upload) and **free** (open-ended).

### Key Data Shapes

Character (`defaultCharacter` in `templates.js`) is deeply nested — `characterStatus` contains `personalityTraits`, `relationship` (affection/trust/obedience/specialTags), `physicalAppearance`, `physicalState`, `expression`, capture/follow state, and player title/self-reference fields.

Scene has time-of-day image slots: `sceneImages: { morning, noon, evening, night }`.

Game state includes `gameMode`, `gameTime`, `protagonistPersonality`, `playerStatus`, `narratorMemories`, `narratorContext`, `characterMemories`, `characterCurrentDialogues`.

## Configuration

### Backend (.env)

Primary config is `server/.env` — API keys, provider settings, admin password. Copied from `server/.env.example`. First launch auto-creates admin account with `ADMIN_PASSWORD` (default: `admin123`).

### Frontend (config.js)

Optional pre-config at `src/config.js` (copy from `src/config.example.js`). Git-ignored. Lower priority than server .env — mostly a legacy path; real AI calls now go through backend.

### Config Priority

1. Server `.env` (effective config for API calls)
2. Frontend `config.js` (fallback, rarely used since proxy migration)
3. `localStorage` UI settings (for provider selection, image config)

## Permissions

Admin users can manage users and subdue/capture characters. Regular users can create and play stories. Auth is JWT-based with tokens in localStorage.
