# PersonaHub — Project Documentation

## Project Overview

An AI persona builder on **two platforms**:

1. **Web App** — Create/manage AI personas via Google Gemini + Flowise. Live at `magic-bots.netlify.app`.
2. **Desktop App (PersonaHub Desktop v0.2.1)** — Electron app with local AI via OpenClaw gateway. Each persona gets an AI-generated personality (SOUL.md), a 2D animated face, and voice I/O.

## Technology Stack

### Web App
- React 19 + TypeScript + Vite 7 + Tailwind CSS 4
- Supabase (PostgreSQL + Auth + Edge Functions)
- Flowise (`https://flowise-2-0.onrender.com`) + Google Gemini 2.5 Flash
- Upstash Redis for chat memory
- PerplexityWideSearch custom tool for web search
- Deployed on Netlify

### Desktop App (`personahub-desktop/`)
- Electron 35 + React 19 + TypeScript + Vite 7 + Tailwind CSS 4
- OpenClaw v2026.4.7 — bundled as `node_modules/openclaw/openclaw.mjs`, runs on port 18789 (Anthropic Claude + Google Gemini + TTS routing)
- better-sqlite3 for local database
- Electron's bundled Node executes the gateway via `process.execPath` + `ELECTRON_RUN_AS_NODE=1`. Nothing is downloaded at runtime; install is offline-capable except for the user's chosen LLM provider.
- Web Speech API (TTS fallback + STT via SpeechRecognition)

## Architecture

### Supabase Schema
```
personas: id (uuid PK), user_id, name, chatflow_id, system_prompt, api_endpoint,
          status (creating/active/failed/deleted), error_message, settings (jsonb),
          enabled_tools, allowed_paths, confirmation_level, dangerous_tools_enabled,
          activity_logging, undo_enabled, sandbox_enabled, created_at, updated_at
```

### Edge Functions

**`/personas`** (v21) — Single function for all CRUD + prompt generation:
- GET (list), GET /:id, POST (create + Gemini prompt gen + Flowise chatflow), PATCH /:id, DELETE /:id
- Auth required (JWT). Returns camelCase JSON.
- `generate-prompt` function is called by `personas/index.ts` during POST — it is NOT deprecated.

**Env vars** (Supabase Dashboard): `GEMINI_API_KEY`, `FLOWISE_API_KEY`, `FLOWISE_BASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

### Flowise Chatflow (per persona)
4 nodes: Upstash Redis Memory → ChatGoogleGenerativeAI (gemini-2.5-flash) → PerplexityWideSearch Tool → Tool Agent (with system prompt)

### Desktop — Voice & Avatar Architecture

The voice system turns text-only personas into characters you can hear and see. It's purely additive — text-only users experience zero changes.

**Voice output pipeline:**
```
LLM reply done → onAssistantDone callback → textNormalizer (strip markdown/URLs/code) →
ttsRouter (cloud via OpenClaw → OS-native Web Speech → silent with captions) →
AudioContext playback → AvatarFace mouth animation via amplitude
```

**Voice input pipeline:**
```
MicButton press/hold → browser SpeechRecognition (local, never leaves device) →
transcribed text in input field (NOT auto-sent) → user reviews and sends
```

**TTS fallback chain:** Cloud provider (OpenAI/ElevenLabs/Google via OpenClaw) → OS-native Web Speech API → silent with captions. Session flap guard (max 5 transitions). Cost governance with monthly/daily caps per provider.

**Avatar:** SVG face with 6 style presets (`face-warm`, `face-cool`, `face-playful`, `face-serious`, `face-gentle`, `face-bold`). Amplitude-driven mouth, CSS blink + breathing, per-persona accent hue. Respects `prefers-reduced-motion`.

**Key design decisions (from `research/avatar-phase-final-stack-decision.md`):**
- Cloud TTS via OpenClaw (not local Kokoro) — gateway already routes TTS, ~$0-1.69/mo typical cost
- 2D SVG face (not 3D) — simpler, works everywhere, no uncanny valley
- Voice settings stored in `PersonaSettings` JSON blob — no DB migration needed
- API keys in OS secure store (`safeStorage`) via `voice-key-store.ts`
- Voice prefs persisted as `userData/voice-prefs.json`

### Desktop — IPC Channels

| Channel | Purpose |
|---|---|
| `agent:send`, `agent:response`, `agent:create`, etc. | Persona CRUD + chat |
| `tts:synthesize` | Cloud TTS via OpenClaw (returns ArrayBuffer) |
| `voice:storeKey`, `voice:getKey`, `voice:hasKey`, `voice:deleteKey` | Encrypted API key storage |
| `voice:getPrefs`, `voice:setPrefs` | Global voice preferences |
| `voice:diagnostics` | Health check (secure store, gateway, providers, OS voices, mic, STT) |
| `perf:memory` | Dev-only memory usage via `process.memoryUsage()` |

All voice IPC channels use `validateSender()` from `ipc-validation.ts` and rate limiting.

## Key Implementation Details

### Web App — Persona Creation
1. User enters name → POST `/personas` → Gemini generates prompt → Flowise chatflow created → camelCase response

### Desktop — Persona Creation
1. Click "+" → modal (name + description + advanced settings) → OpenClaw generates 300-500 word prompt → SQLite insert → SOUL.md + AGENTS.md + IDENTITY.md written to `~/.openclaw/agents/{id}/`

### Desktop — Chat Flow
1. Select persona → `useChat` loads messages from SQLite
2. Send message → `agentBridge.sendMessage()` → OpenClaw gateway (SSE streaming)
3. System prompt prepended as `{ role: 'system' }` for personality
4. Deltas streamed to UI → on `[DONE]`: saved to SQLite, `onAssistantDone` fires voice output

### Desktop — Voice Output Flow
1. `useChat` calls `onAssistantDone(content, personaId)` when reply completes
2. `useVoiceOutput` normalizes text → sends through `ttsRouter.speak()`
3. `ttsRouter` tries cloud IPC → falls back to Web Speech → falls back to silent
4. Audio plays → amplitude drives `AvatarFace` mouth → caption strip shows text
5. Interruption: new message or Stop button cancels within 200ms

### Response Transformation Pattern
- **Web**: Edge function: snake_case DB → camelCase JSON. Hooks: date strings → Date objects.
- **Desktop**: `local-db.ts` `rowToPersona()`: snake_case rows → camelCase types.

## Frontend Components

### Web App (`src/components/`)
Auth, PersonaForm, PersonaList, PersonaCard, SettingsPanel, ApiEndpointDisplay, DeleteConfirmation, ChatWindow, ChatMessage, ChatInput, PersonaSelector, DownloadApp, CopyButton, ErrorBoundary, PermissionConfig

### Web App Hooks (`src/hooks/`)
usePersonas, useCreatePersona, useUpdatePersona, useDeletePersona, useChat

### Desktop App (`personahub-desktop/src/components/`)
ChatWindow, ChatSidebar, ChatInput, ChatMessages, Settings, SetupWizard, PersonaSettingsPanel, ConfirmDialog, PermissionEscalation, ActivityLog, Modal, AvatarFace, FacePicker, VoicePicker, MicButton

### Desktop App Hooks (`personahub-desktop/src/hooks/`)
useChat (chat state + streaming + DB + `onAssistantDone` callback), useVoiceOutput (TTS + avatar state), useVoiceInput (mic + SpeechRecognition)

### Desktop Speech Library (`personahub-desktop/src/lib/speech/`)
ttsRouter (cloud→OS→silent fallback + cost governance), textNormalizer (strip markdown/URLs/code, cap 2000 chars), useSpeechSynthesis (Web Speech API wrapper), voiceEventLog (local append-only, 7-day retention, no PII)

## Key Types (Desktop)

```typescript
type VoiceProvider = 'auto' | 'cloud-openai' | 'cloud-elevenlabs' | 'cloud-google' | 'os-native' | 'local-only';
type AvatarStyleId = 'face-warm' | 'face-cool' | 'face-playful' | 'face-serious' | 'face-gentle' | 'face-bold';
type AvatarState = 'idle' | 'thinking' | 'speaking' | 'listening' | 'error' | 'initializing';
type VoiceSessionState = 'idle' | 'queued' | 'synthesizing' | 'playing' | 'interrupted' | 'completed' | 'error';

interface GlobalVoicePrefs {
  voiceOutputEnabled, voiceInputEnabled, defaultProvider, defaultVoiceId?,
  defaultAvatarStyle, captionsEnabled, reducedMotionOverride, localOnlyMode,
  autoStopOnBlur, monthlySpendCeiling, featureFlag, defaultSpeed?
}

interface PersonaSettings {
  temperature?, modelName?, customInstructions?, avatar?, pinned?,
  voiceEnabled?, voiceProvider?, voiceId?, voiceSpeed?,
  avatarEnabled?, avatarStyleId?, avatarAccentHue?
}
```

## Environment Variables

### Frontend (.env)
```bash
VITE_FLOWISE_API_URL=https://flowise-2-0.onrender.com
VITE_FLOWISE_API_KEY=<key>
VITE_SUPABASE_URL=https://wlvfilxtvqjzwqjhfcdk.supabase.co
VITE_SUPABASE_ANON_KEY=<key>
```

## Development Commands

```bash
# ─── Web App ──────────────────────────────────
pnpm install && pnpm dev          # Dev server
pnpm build                        # Production build

# ─── Desktop App (from personahub-desktop/) ───
pnpm dev                          # Dev mode (hot reload renderer, "Electron" in menu bar)
pnpm test                         # Run vitest
pnpm electron:build:mac           # Build .app → sign: codesign --force --deep --sign - "release/..."

# ─── Edge Functions ───────────────────────────
# Deploy via mcp__supabase_flowise__deploy_edge_function
```

### IMPORTANT: Restarting Desktop App After Code Changes

Electron + Vite hot-reload leaves zombie processes. **After every code change session, use scoped kills — NEVER use broad `pkill -f Electron` or `pkill -f personahub-desktop`** (they will also kill VS Code, Slack, Cursor, and any unrelated app running on this machine, including the user's port-3000 app whose shell was opened in this directory).

```bash
# Kill only processes listening on THIS app's dev ports
lsof -ti:5173 | xargs kill -9 2>/dev/null   # Vite renderer
lsof -ti:18789 | xargs kill -9 2>/dev/null  # OpenClaw gateway

# Kill only the Electron binary from THIS project's node_modules (scoped path)
pkill -f "personahub-desktop/node_modules/.*electron" 2>/dev/null

rm -f ~/Library/Application\ Support/Electron/SingletonLock
cd personahub-desktop && pnpm dev
```

**Forbidden commands** (they nuke unrelated apps):
- `pkill -f Electron` — matches every Electron-based app (VS Code, Slack, Discord, Cursor, Obsidian…)
- `pkill -f personahub-desktop` — matches any process whose cwd/args include this path, including the user's port-3000 dev server

**Claude: You MUST run the scoped steps above every time you finish editing desktop app files, before telling the user to test.** Hot reload only works for renderer (`src/`). Main process changes (`electron/`, `openclaw/`, `db/`) always need full restart.

### Dev Mode Notes
- Dev data: `~/Library/Application Support/Electron/`
- Prod data: `~/Library/Application Support/personahub-desktop/`
- Menu bar shows "Electron" in dev mode — normal

## Project Structure

```
flowise-agent-builder/
├── src/                                # Web app
│   ├── components/                     # 15 React components
│   ├── hooks/                          # 5 hooks (usePersonas, useChat, etc.)
│   ├── lib/                            # supabase.ts, flowise-chat.ts, env.ts
│   └── types/index.ts                  # Web types + transformPersonaRow()
├── personahub-desktop/                 # Desktop app (Electron)
│   ├── electron/
│   │   ├── main.ts                     # App entry, IPC handlers, lifecycle (~887 lines)
│   │   ├── preload.ts                  # Security bridge (window.electronAPI)
│   │   ├── openclaw-manager.ts         # Download/install/start OpenClaw gateway
│   │   ├── openclaw-client.ts          # HTTP streaming + generatePrompt() + generateSpeech()
│   │   ├── voice-key-store.ts          # Per-provider encrypted API key files (safeStorage)
│   │   ├── ipc-validation.ts           # validateSender() + rate limiting
│   │   ├── secure-store.ts             # Auth token encryption (single key)
│   │   └── auth.ts, tray.ts, shortcuts.ts, updater.ts
│   ├── openclaw/
│   │   ├── agent-bridge.ts             # Routes messages through ActionGuard → OpenClaw
│   │   ├── config-factory.ts           # Generates SOUL.md + AGENTS.md + IDENTITY.md
│   │   └── document-converter.ts       # PDF/DOCX → text for knowledge base
│   ├── db/
│   │   ├── local-db.ts                 # Typed CRUD + rowToPersona() converter
│   │   └── init.ts                     # DB init + IPC registration (schema inline)
│   ├── security/                       # action-guard, path-validator, permission-memory, backup-manager, blocked-paths
│   ├── sync/                           # platform-sync.ts, kb-sync.ts
│   ├── src/
│   │   ├── components/                 # 15 components (ChatWindow, AvatarFace, VoicePicker, etc.)
│   │   ├── hooks/                      # useChat, useVoiceOutput, useVoiceInput
│   │   ├── lib/speech/                 # ttsRouter, textNormalizer, useSpeechSynthesis, voiceEventLog
│   │   └── types/index.ts              # All desktop types + ElectronAPI interface
│   └── release/                        # Build output
├── supabase/functions/
│   ├── personas/index.ts               # Main CRUD edge function (v21)
│   ├── generate-prompt/index.ts        # Gemini prompt generation (called by personas/)
│   └── _shared/                        # CORS + Flowise helpers
├── specs/
│   ├── 001-ai-persona-builder/         # Web app spec
│   ├── 002-personahub-desktop/         # Desktop app spec
│   └── 003-voice-avatar/              # Voice & avatar spec (current feature branch)
└── research/                           # Stack decision docs for voice/avatar
```

## Troubleshooting

### Web App
- **Chat not working** → Check Flowise server status, chatflowId, CORS
- **"Invalid JWT"** → Fixed in personas v21

### Desktop App
- **Dev mode won't start** → Delete stale lock: `rm ~/Library/Application\ Support/Electron/SingletonLock`
- **Persona doesn't know who it is** → System prompt must be `{ role: 'system' }` in messages
- **Duplicate text** → `openclaw-client.ts` must send deltas, not accumulated text
- **Gateway won't start** → Check `~/.openclaw/openclaw.json` for valid API key + model
- **No voice output** → Run Diagnostics in Settings → Voice & Avatar. Check provider key, gateway status, OS voices
- **Mic not working** → Check OS permission (System Settings → Privacy → Microphone), CSP headers

### Debugging Tools
- Supabase logs: `mcp__supabase_flowise__get_logs`
- Supabase SQL: `mcp__supabase_flowise__execute_sql`
- Desktop DB (dev): `~/Library/Application Support/Electron/personahub.db`
- Desktop DB (prod): `~/Library/Application Support/personahub-desktop/personahub.db`
- OpenClaw agents: `~/.openclaw/agents/{personaId}/SOUL.md`
- OpenClaw config: `~/.openclaw/openclaw.json`
- Voice prefs: `~/Library/Application Support/Electron/voice-prefs.json` (dev)
- Voice keys: `~/Library/Application Support/Electron/voice-key-{provider}.enc` (dev)

## Git Branch Strategy

The repo has NO `main` branch. `1-ai-persona-builder` is the GitHub default branch and the production release line — CI's `desktop-v*` tag trigger publishes installers from this branch directly.

| Branch | Purpose | Status |
|---|---|---|
| `1-ai-persona-builder` | Production / release line | Active. Tag `desktop-vX.Y.Z` to ship a new installer. |
| `003-voice-avatar` | Voice & avatar feature | Merged via PR #1 |
| `2-personahub-desktop` | Earlier desktop work | Merged |

## GitHub Release
- Repo: `LashaKh/Flowise-Agent-Creator`
- Installers: macOS .dmg, Windows .exe (auto-published via CI)
