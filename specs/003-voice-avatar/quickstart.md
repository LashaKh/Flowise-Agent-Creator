# Quickstart: Voice & Avatar Development

*Get up and running with voice & avatar feature development in PersonaHub Desktop.*

---

## Prerequisites

- Node.js 22+ (matches the OpenClaw runtime)
- `pnpm` package manager
- macOS 13+, Windows 10+, or recent Linux with PulseAudio/PipeWire
- A microphone (for testing voice input — can be any USB/built-in mic)
- An OpenAI API key (for testing cloud TTS — $5 trial credit is enough for development)

## Setup

```bash
# 1. Clone and enter the desktop app directory
cd personahub-desktop

# 2. Install dependencies
pnpm install

# 3. Kill any stale Electron processes (important — stale SingletonLock causes white screen)
pkill -f Electron; pkill -f "personahub-desktop"
rm -f ~/Library/Application\ Support/Electron/SingletonLock

# 4. Start dev mode
pnpm dev
```

The app opens in dev mode. Menu bar shows "Electron" — this is normal for dev.

## Key Files to Read First

Before writing code, read these in order:

1. **The spec** — `specs/003-voice-avatar/spec.md` (666 lines). This is the "what." Read the FR groups relevant to your current week.
2. **The research decisions** — `specs/003-voice-avatar/research.md`. This is the "why each tech was picked."
3. **The data model** — `specs/003-voice-avatar/data-model.md`. State machines, entity relationships, validation rules.
4. **The plan** — `specs/003-voice-avatar/plan.md`. This is the "when and how." Follow it day by day.
5. **The IPC contracts** — `specs/003-voice-avatar/contracts/ipc-channels.md`. Every new IPC channel, its shape, and security rules.
6. **Round 1 codebase research** — `research/avatar-phase-research-brief.md`. Exact file paths and line numbers for every plug-in point.

## Architecture at a Glance

```
                    ┌─── Cloud TTS via OpenClaw ───┐
                    │   127.0.0.1:18789             │
                    │   POST /v1/audio/speech       │
                    └────────────┬──────────────────┘
                                 │ ArrayBuffer (audio)
┌─────── MAIN PROCESS ──────────┤
│  main.ts:                     │
│   • IPC: tts:synthesize       │
│   • IPC: voice:storeKey/get/delete
│   • CSP via webRequest        │
│   • Permission handler        │
│   • Global mic kill shortcut  │
│   • powerMonitor → mic stop   │
└────────────────────┬──────────┘
                     │ IPC
┌─────── RENDERER ───┤
│                    │
│  useVoiceOutput.ts ─── ttsRouter.ts ─── cloud (via IPC)
│       │                     │               ↓ fallback
│       │                     └─── useSpeechSynthesis.ts (browser-native)
│       │
│       ▼
│  ChatWindow.tsx
│   ├── AvatarFace.tsx (SVG, amplitude-driven mouth)
│   ├── Caption strip (aria-live)
│   ├── ChatMessages.tsx (existing)
│   └── ChatInput.tsx
│        └── MicButton.tsx ─── useVoiceInput.ts
│                                    ├── @ricky0123/vad-react (Silero VAD)
│                                    └── sttMoonshine.ts → moonshine.worker.ts
│                                                           (Moonshine-base ONNX)
│
│  Settings.tsx → Voice & Avatar section
│  PersonaSettingsPanel.tsx → per-persona voice/face
│  ChatSidebar.tsx → creation modal voice/face pickers
└─────────────────────────────────────────────────────┘
```

## Development Workflow by Week

### Week 1 (Voice Output + Face) — Start Here

No new dependencies beyond the standard dev environment. No Electron upgrade needed. No mic permissions.

```bash
# Quick verification that speechSynthesis works in your Electron:
# In devtools console (Cmd+Opt+I):
speechSynthesis.getVoices().length  # Should be > 0 after voiceschanged fires
```

Key files you'll create:
- `src/lib/speech/ttsRouter.ts`
- `src/lib/speech/useSpeechSynthesis.ts`
- `src/lib/speech/textNormalizer.ts`
- `src/components/AvatarFace.tsx`
- `src/hooks/useVoiceOutput.ts`

Key files you'll modify:
- `electron/openclaw-client.ts` (add `generateSpeech`)
- `electron/main.ts` (add `tts:synthesize` IPC)
- `electron/preload.ts` (add `tts` group)
- `src/types/index.ts` (extend `PersonaSettings` + `ElectronAPI`)
- `src/components/ChatWindow.tsx` (mount face + caption)
- `src/components/ChatInput.tsx` (add interruption on send)
- `src/components/Settings.tsx` (add Voice & Avatar section)

### Week 2 (Voice Input + Security) — Needs Dependencies

```bash
# New dependencies for Week 2:
pnpm add @huggingface/transformers @ricky0123/vad-react @ricky0123/vad-web vite-plugin-static-copy

# Electron upgrade:
pnpm add -D electron@^38.8.6

# After upgrade — always do a clean restart:
pkill -f Electron; pkill -f "personahub-desktop"
rm -f ~/Library/Application\ Support/Electron/SingletonLock
pnpm dev
```

### Week 3 (Customization) — No new dependencies

### Week 4 (Testing + Ship) — No new dependencies

```bash
# Run tests:
pnpm test

# Build for macOS:
pnpm electron:build:mac
# Then sign:
codesign --force --deep --sign - "release/mac-arm64/PersonaHub Desktop.app"
# Verify entitlements:
codesign -d --entitlements :- "release/mac-arm64/PersonaHub Desktop.app"
```

## Critical Gotchas

1. **`speechSynthesis.getVoices()` returns empty on first call.** Wait for the `voiceschanged` event or poll with retries. This is a well-known Chromium quirk, not a bug in your code.

2. **Filter OS voices by `localService === true`.** "Microsoft Aria Online (Natural)" looks local but sends text to Azure. Privacy leak.

3. **OpenClaw SSRF regression (issue #63132)** blocks local-IP STT providers. Call Moonshine directly from the renderer worker, NOT through OpenClaw.

4. **Moonshine repeats tokens on clips <1 second.** Enforce `minSpeechMs ≥ 1000` in the VAD config.

5. **After every code change to `electron/*.ts` files, do a clean restart** (the standard PersonaHub dev workflow):
   ```bash
   pkill -f Electron; pkill -f "personahub-desktop"
   rm -f ~/Library/Application\ Support/Electron/SingletonLock
   pnpm dev
   ```

6. **Never log API keys, reply text, or transcription text.** The redaction test (FR-12 #135) will catch violations.

7. **Never write voice audio to disk.** The audit test (SC-04) will catch violations.

## Testing

```bash
# Run all tests:
pnpm test

# Run tests in watch mode:
pnpm test:watch

# Run a specific test file:
pnpm test -- --testPathPattern="ttsRouter"
```

Tests live alongside the code in `__tests__/` directories, following the existing project convention (see `openclaw/__tests__/config-factory.test.ts` for the pattern).

## Troubleshooting

| Problem | Solution |
|---|---|
| White screen on launch | Kill stale processes + remove SingletonLock (see Setup step 3) |
| `speechSynthesis.getVoices()` returns [] | Wait 500ms and retry — voices load asynchronously in Chromium |
| Cloud TTS returns 401 | Check API key in Settings → Voice & Avatar → Providers & Keys |
| Mic button doesn't work on macOS | Check System Settings → Privacy → Microphone → PersonaHub Desktop is enabled |
| CSP violation in devtools | The CSP in dev mode needs `ws://localhost:<port>` for Vite HMR — verify the dev CSP branch in `main.ts` |
| Moonshine model download stalls | Check internet connection. The model is ~63MB from HuggingFace, cached in IndexedDB after first download |
| Face doesn't animate | Check `prefers-reduced-motion` isn't set. Check `avatarEnabled` in persona settings |
