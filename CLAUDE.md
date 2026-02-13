# Flowise Agent Builder - Project Documentation

## Project Overview

An AI persona builder with **two platforms**:

1. **Web App** — Create and manage AI personas powered by Google Gemini + Flowise. Hosted on Netlify (`magic-bots.netlify.app`).
2. **Desktop App (PersonaHub Desktop)** — Electron app with local AI via OpenClaw gateway. Each persona gets an AI-generated personality and its own OpenClaw agent with a unique SOUL.md.

## Technology Stack

### Web App
- **React 19** + TypeScript + **Vite 7** + **Tailwind CSS 4**
- **Supabase** (PostgreSQL + Auth + Edge Functions)
- **Flowise** (`https://flowise-2-0.onrender.com`) + **Google Gemini 2.5 Pro**
- **Upstash Redis** for chat memory
- **PerplexityWideSearch** custom tool for web search
- Deployed on **Netlify** at `magic-bots.netlify.app`

### Desktop App (PersonaHub Desktop)
- **Electron 33** + React 19 + TypeScript + Vite 7 + Tailwind CSS
- **OpenClaw** — local AI gateway on port 18789 (supports Anthropic Claude + Google Gemini)
- **better-sqlite3** for local database
- **Node.js 22** runtime auto-downloaded to `~/.personahub/runtime/`
- Location: `personahub-desktop/` directory

## Architecture

### Database Schema (Supabase)
```sql
personas table:
- id: uuid (primary key)
- user_id: uuid (foreign key to auth.users)
- name: text
- chatflow_id: text (Flowise chatflow ID)
- system_prompt: text (generated AI prompt)
- api_endpoint: text (Flowise prediction endpoint)
- status: text (creating/active/failed/deleted)
- error_message: text (optional)
- settings: jsonb (temperature, model, etc.)
- created_at: timestamp
- updated_at: timestamp
```

### Edge Functions

#### `/personas` - Main CRUD + Prompt Generation (Single Function)
- **GET**: List all active personas for authenticated user
- **GET /:id**: Get single persona details
- **POST**: Create new persona (generates prompt via embedded Gemini call, creates Flowise chatflow)
- **PATCH /:id**: Update persona settings/system prompt
- **DELETE /:id**: Soft delete persona (marks as deleted, removes Flowise chatflow)

**Current Version**: v21

**Key Features**:
- Authentication required (JWT token via Authorization header)
- **Prompt generation embedded directly** (calls Gemini API using `GEMINI_API_KEY` env variable)
- Creates complete Flowise chatflow with:
  - Upstash Redis memory node
  - ChatGoogleGenerativeAI model node (gemini-2.5-flash)
  - Custom Tool node (PerplexityWideSearch)
  - Tool Agent node with system message
- Returns camelCase JSON (transforms from snake_case database fields)

**Environment Variables Used**:
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for admin operations
- `GEMINI_API_KEY` - Google Gemini API key for prompt generation
- `FLOWISE_BASE_URL` - Flowise API URL (defaults to `https://flowise-2-0.onrender.com`)
- `FLOWISE_API_KEY` - Flowise API key

**Note**: The `generate-prompt` function is deprecated and can be safely deleted. All prompt generation is now embedded in the `personas` function.

### Flowise Integration

#### Chatflow Structure
Each persona gets a dedicated Flowise chatflow with 4 nodes:

1. **Upstash Redis Memory** (`upstashRedisBackedChatMemory_0`)
   - Stores conversation history
   - Base URL: `https://obliging-zebra-56633.upstash.io`
   - Credential ID: `b88f589c-e0fd-4a2e-a353-0db6b491ac8e`

2. **ChatGoogleGenerativeAI** (`chatGoogleGenerativeAI_0`)
   - Model: `gemini-2.5-flash`
   - Temperature: `0.7` (configurable per persona)
   - Streaming: enabled
   - Credential ID: `f4e4f034-d71a-4039-b339-8dea1429fa06`

3. **Custom Tool** (`customTool_0`)
   - Tool: PerplexityWideSearch (ID: `f4e953b6-8f59-4969-820d-946d00c3456d`)
   - Webhook: `https://hook.eu2.make.com/ndg51e64dziugrklc4xag3a55niyv570`
   - Provides web search capability to personas

4. **Tool Agent** (`toolAgent_0`)
   - System message: Generated persona prompt
   - Connects all nodes together
   - Handles tool calling via function calling

#### Flowise API Endpoints
- Create: `POST /api/v1/chatflows`
- Update: `PUT /api/v1/chatflows/:id`
- Delete: `DELETE /api/v1/chatflows/:id`
- Predict: `POST /api/v1/prediction/:chatflowId`

## Frontend Components

### Main Components
- **App.tsx**: Main application container, handles auth state, persona CRUD, tab navigation (Create/My Personas/Chat)
- **Auth.tsx**: Google OAuth authentication
- **PersonaForm.tsx**: Form to create new personas
- **PersonaList.tsx**: Grid display of persona cards
- **PersonaCard.tsx**: Individual persona card with status badge and actions
- **SettingsPanel.tsx**: Edit persona settings and system prompt
- **ApiEndpointDisplay.tsx**: Shows API endpoint with copy functionality
- **DeleteConfirmation.tsx**: Modal for delete confirmation

### Chat Components (New)
- **ChatWindow.tsx**: Main chat interface combining persona selection, message display, and input
- **ChatMessage.tsx**: Individual chat message bubble (user/assistant)
- **ChatInput.tsx**: Text input with send button for chat
- **PersonaSelector.tsx**: Dropdown to select which persona to chat with

### Custom Hooks
- **usePersonas.ts**: Fetches all personas for current user (transforms date strings to Date objects)
- **useCreatePersona.ts**: Creates new persona (transforms date strings to Date objects)
- **useUpdatePersona.ts**: Updates persona settings/prompt (transforms date strings to Date objects)
- **useDeletePersona.ts**: Handles persona deletion (uses direct fetch for proper DELETE URL construction)
- **useChat.ts**: Manages chat state, streaming messages, auto-retry with exponential backoff

### Chat Library
- **lib/flowise-chat.ts**: Flowise chat client with streaming support, error handling, and SSE parsing

## Environment Variables

### Supabase Edge Function Secrets (set in Supabase Dashboard)
```bash
GEMINI_API_KEY=<your-gemini-api-key>  # Required for prompt generation
FLOWISE_API_KEY=<your-flowise-api-key>  # Required for Flowise operations
FLOWISE_BASE_URL=https://flowise-2-0.onrender.com  # Optional, has default
```

### Frontend Environment Variables (.env)
```bash
# Flowise (for direct chat from frontend)
VITE_FLOWISE_API_URL=https://flowise-2-0.onrender.com
VITE_FLOWISE_API_KEY=ijD+kfSjYMcqEyBHNCHyEaymDzrD7br4BW4/DRe/eYI=

# Supabase
VITE_SUPABASE_URL=https://wlvfilxtvqjzwqjhfcdk.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

## Key Implementation Details

### 1. Web App — Persona Creation Flow
1. User enters persona name in Create tab
2. Frontend calls `/personas` POST endpoint
3. Edge function generates system prompt via embedded Gemini call (2.5 Pro, temp 0.1)
4. Creates Flowise chatflow with generated prompt + Upstash memory + PerplexityWideSearch tool
5. Returns complete persona (snake_case → camelCase transformation)

### 2. Desktop App — Persona Creation Flow (AI-Powered)
1. User clicks "+" → modal opens with name + description fields + optional advanced settings
2. `persona:create` IPC handler calls `generatePrompt(name, description)` via OpenClaw gateway
3. AI generates a rich 300-500 word system prompt (identity, communication style, expertise, guidelines)
4. Persona inserted into local SQLite with the generated prompt
5. `startAgent()` writes SOUL.md + AGENTS.md + IDENTITY.md to `~/.openclaw/agents/{id}/`
6. Agent registered in `~/.openclaw/openclaw.json` for gateway routing
7. Modal closes, persona auto-selected, ready to chat

### 3. Desktop App — Chat Flow
1. User selects persona in sidebar → `useChat` hook loads messages from SQLite
2. User sends message → saved to DB → placeholder assistant message created
3. `agent:send` IPC → `agentBridge.sendMessage()` → `openclawClient.sendMessage()`
4. System prompt prepended as `{ role: 'system' }` message so AI knows its personality
5. `x-openclaw-agent-id` header routes to persona's agent
6. SSE streaming: gateway sends deltas → `useChat` accumulates into buffer → UI updates live
7. On `[DONE]`: final message saved to SQLite, streaming flag cleared

### 4. Response Transformation Pattern
- **Web**: Edge function transforms snake_case DB → camelCase JSON → Date objects in hooks
- **Desktop**: `local-db.ts` has `rowToPersona()` converter (snake_case rows → camelCase types)

### 5. Chat Streaming (Desktop)
- `openclaw-client.ts` sends HTTP request to local gateway (`127.0.0.1:18789`)
- SSE parsing: splits on `\n\n`, extracts `data:` lines, parses JSON for `delta.content`
- Sends **deltas** (not accumulated text) to avoid duplicate text bug
- `[DONE]` event sends full accumulated text
- 60-second timeout per request

### 6. Prompt Generation (both platforms)
- **Web**: Gemini 2.5 Pro with Einstein example template, 5000 max tokens
- **Desktop**: Local AI via OpenClaw gateway, meta-prompt asks for 5-section personality (Identity & Style, Communication Style, Knowledge & Expertise, Interaction Guidelines, Constraints)

## Recent Fixes & Improvements

### Session 5 — Desktop Persona Pipeline (2026-02-13)
1. **AI-powered persona creation**: Click "+" → modal with name + description → AI generates rich personality
2. **Fixed duplicate text bug**: `openclaw-client.ts` was sending accumulated text on each chunk, but `useChat` also accumulates — now sends deltas only
3. **Agent routing**: Added `x-openclaw-agent-id` header so each persona routes to its own OpenClaw agent
4. **System prompt injection**: Persona's system prompt now sent as `{ role: 'system' }` message in every chat request — this is what makes each persona behave differently
5. **Creation modal UI**: Replaced inline name-only text field with modal (name + description + collapsible advanced: temperature slider, confirmation level dropdown)
6. **Dev mode fix**: `vite.config.ts` was missing `onstart({ args.startup() })` for main entry — Electron never launched. Also `main.ts` now uses `process.env.VITE_DEV_SERVER_URL` instead of `NODE_ENV` for dev detection
7. **Singleton lock fix**: Force-killing the app leaves stale `SingletonLock` in `~/Library/Application Support/Electron/` — must delete before dev mode works

### Session 4 — OpenClaw Integration (2026-02)
1. OpenClaw gateway integration (port 18789, local AI)
2. Setup wizard for API key (Anthropic/Google)
3. Auto-download Node.js 22 + openclaw runtime
4. WebSocket approval channel for tool calls

### Session 3 (2025-12-01)
1. Fixed Gemini API key leak — moved to Supabase secrets
2. Consolidated to single edge function (personas v21)
3. `generate-prompt` function deprecated

### Session 2 (2025-11-24)
1. Fixed prompt generation, response transformation, date parsing

### Session 1 (2025-11-24)
1. Fixed DELETE endpoint, Custom Tool fields, prompt template

## Chat Feature Types

```typescript
// Chat message in conversation
interface ChatMessage {
  id: string;                    // UUID for React key
  role: 'user' | 'assistant';   // Message sender
  content: string;              // Message text
  timestamp: Date;              // When message was sent/received
  isStreaming?: boolean;        // True while assistant response is streaming
  error?: string;               // Error message if send failed
}

// Chat state (managed by useChat hook)
interface ChatState {
  selectedPersonaId: string | null;
  messages: ChatMessage[];
  isLoading: boolean;
  retryCount: number;
  lastFailedMessage?: string;
}
```

## API Endpoints Summary

### Frontend → Supabase Edge Functions
- `POST /functions/v1/personas` - Create persona
- `GET /functions/v1/personas` - List personas
- `GET /functions/v1/personas/:id` - Get persona
- `PATCH /functions/v1/personas/:id` - Update persona
- `DELETE /functions/v1/personas/:id` - Delete persona

### Frontend → Flowise (Direct Chat)
- `POST /api/v1/prediction/:chatflowId` - Send chat message (streaming)

### Edge Functions → External Services
- Gemini API: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent`
- Flowise API: `https://flowise-2-0.onrender.com/api/v1/*`

## Development Commands

```bash
# ─── Web App ───────────────────────────────
pnpm install              # Install dependencies
pnpm dev                  # Run Vite dev server (web only)
pnpm build                # Production build

# ─── Desktop App (from personahub-desktop/) ─
pnpm dev                  # Dev mode — hot reload, auto-restart Electron
                          # (uses vite-plugin-electron, shows as "Electron" in menu bar)
pnpm electron:build:mac   # Production build → release/mac-arm64/PersonaHub Desktop.app
                          # Then sign: codesign --force --deep --sign - "release/mac-arm64/PersonaHub Desktop.app"

# ─── Edge Functions (via MCP) ──────────────
# Use mcp__supabase_flowise__deploy_edge_function tool
```

### IMPORTANT: Restarting Desktop App After Code Changes

Electron + Vite hot-reload often leaves a zombie process that holds the SingletonLock. This causes the white/blank screen. **After every code change session, always do a clean restart:**

```bash
# 1. Kill ALL old Electron/node processes (the stale ones cause white screen)
pkill -f Electron; pkill -f "personahub-desktop"

# 2. Remove the SingletonLock (prevents "app already running" block)
rm -f ~/Library/Application\ Support/Electron/SingletonLock

# 3. Start fresh from the personahub-desktop directory
cd personahub-desktop && pnpm dev
```

**Claude: You MUST run steps 1-3 above every time you finish editing desktop app files, before telling the user to test.** Do not rely on Vite hot-reload for main process changes — it does not cleanly restart Electron.

### Dev Mode Notes
- `pnpm dev` in `personahub-desktop/` is the preferred way to develop — changes hot-reload for renderer only
- Main process changes (electron/*.ts, openclaw/*.ts, db/*.ts) require a full restart (steps above)
- Dev mode uses `~/Library/Application Support/Electron/` for data (separate from production)
- Production build uses `~/Library/Application Support/personahub-desktop/`
- Menu bar shows "Electron" in dev mode — this is normal

## Project Structure

```
flowise-agent-builder/
├── src/                            # Web app source
│   ├── components/                 # React components (Auth, PersonaForm, Chat*, etc.)
│   ├── hooks/                      # usePersonas, useCreatePersona, useChat, etc.
│   ├── lib/                        # supabase.ts, flowise-chat.ts
│   ├── types/index.ts              # Shared types (also used by desktop)
│   └── App.tsx
├── personahub-desktop/             # Desktop app (Electron)
│   ├── electron/
│   │   ├── main.ts                 # App entry, IPC handlers, lifecycle
│   │   ├── preload.ts              # Security bridge (window.electronAPI)
│   │   ├── openclaw-manager.ts     # Download/install/start OpenClaw gateway
│   │   ├── openclaw-client.ts      # HTTP streaming + WS approvals + generatePrompt()
│   │   ├── auth.ts, tray.ts, shortcuts.ts, updater.ts, secure-store.ts
│   │   └── vite.config.ts
│   ├── openclaw/
│   │   ├── config-factory.ts       # Generates SOUL.md + AGENTS.md + IDENTITY.md per persona
│   │   └── agent-bridge.ts         # Routes messages through ActionGuard → OpenClaw
│   ├── db/
│   │   ├── schema.sql              # 7 tables (persona_configs, chat_sessions, etc.)
│   │   ├── local-db.ts             # Typed CRUD with snake_case → camelCase converters
│   │   └── init.ts                 # DB init + IPC registration
│   ├── security/                   # ActionGuard, path-validator, permission-memory, etc.
│   ├── sync/                       # platform-sync.ts (web ↔ desktop)
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatSidebar.tsx     # Persona list + creation modal
│   │   │   ├── ChatWindow.tsx      # Main chat interface
│   │   │   └── SetupWizard.tsx     # API key setup
│   │   ├── hooks/useChat.ts        # Chat state, streaming, DB persistence
│   │   └── types/index.ts          # All desktop types + ElectronAPI interface
│   └── release/                    # Build output (mac-arm64/)
├── supabase/functions/personas/    # Edge function (CRUD + prompt generation, v21)
└── specs/                          # Feature specs
```

## Troubleshooting

### Web App Issues

1. **"API key was reported as leaked"** → New Gemini key at aistudio.google.com, set in Supabase secrets
2. **"Invalid JWT" on creation** → Fixed in personas v21 (embedded prompt generation)
3. **Chat not working** → Check Flowise server, chatflowId, CORS

### Desktop App Issues

1. **Dev mode won't start (exits silently)** → Delete stale lock: `rm ~/Library/Application\ Support/Electron/SingletonLock`
2. **Persona doesn't know who it is** → System prompt must be passed as `{ role: 'system' }` in messages array (fixed in Session 5)
3. **Duplicate text in responses** → `openclaw-client.ts` must send deltas, not accumulated text (fixed in Session 5)
4. **Old Desktop app vs new build** → The `.app` on Desktop is a copy — it goes stale after rebuilds. Use `pnpm dev` during development instead
5. **"Electron" in menu bar** → Normal in dev mode. Production build shows "PersonaHub Desktop"
6. **Gateway won't start** → Check `~/.openclaw/openclaw.json` has valid API key and model config

### Debugging Tools
- Supabase Edge Function logs: `mcp__supabase_flowise__get_logs`
- Database queries: `mcp__supabase_flowise__execute_sql`
- Desktop DB: `~/Library/Application Support/Electron/personahub.db` (dev) or `~/Library/Application Support/personahub-desktop/personahub.db` (prod)
- OpenClaw agents: `~/.openclaw/agents/{personaId}/SOUL.md`
- OpenClaw config: `~/.openclaw/openclaw.json`
