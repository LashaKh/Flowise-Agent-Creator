# Research Brief: PersonaHub Desktop 3D Avatar Phase

*Generated: 2026-04-10 | Agents: 6 | Angles: codebase, architecture, ui-ux, performance, library-integration, electron-security*
*Inputs merged: `research/.parts/01-codebase.md` (752 lines), `02-architecture.md` (1238), `03-ui-ux.md` (1034), `04-performance.md` (660), `05-integration.md` (1005), `06-security.md` (756)*
*Feature source doc: `specs/ai-avatar-research-2026.md`*

---

## Executive Summary

Adding a local-first 3D avatar (TalkingHead + HeadTTS Kokoro + whisper + VAD) to PersonaHub Desktop is **technically viable and architecturally clean**, but three findings from this research substantially reshape the plan in the original handoff brief:

1. **The existing app is missing security baselines this feature makes load-bearing.** No CSP exists anywhere. `NSMicrophoneUsageDescription` is not set on macOS (the build would hard-crash with SIGABRT the first time `getUserMedia` runs under hardened runtime). Electron 35.0.0 is vulnerable to **CVE-2026-34777** in the exact `setPermissionRequestHandler` API we need for mic, and 35.x is already end-of-support. These are all fixable in ~1 day but they are blockers — not polish — and must land **before** mic code is reachable.

2. **The 400–600 ms first-audio latency target is not achievable on the low-spec hardware this product explicitly targets.** That number was lifted from cloud GPU competitors (Tavus, Simli). On the WASM fallback path that integrated-Intel laptops will actually run, realistic first-audio is **1.5–3.5 seconds**. WebGPU on Intel UHD 620/630 is *not* a safe assumption — Chromium's blocklist silently drops a meaningful fraction of that hardware to WASM. The feature should still ship, but framed as **"premium voice" — opt-in, not default on low-spec** — with text + Web Speech API as the free-tier TTS for users who can't afford the CPU cost.

3. **The rest of the original plan holds up, and several pieces are simpler than expected.** No schema migration is needed — `PersonaSettings` is already a JSON blob in SQLite, so `avatarPreset` / `voiceId` flow through for free. The TTS trigger is literally one line in `useChat.ts:74`. HeadTTS's output object plugs directly into TalkingHead's `speakAudio()` with **zero adapter code** — they're designed as a pair. Two independent agents converged on **using `@huggingface/transformers` for both Kokoro and whisper** instead of whisper.cpp WASM direct, because HeadTTS already pulls transformers.js in, making whisper "free" on bundle size and unifying the ONNX runtime.

The recommended implementation order therefore becomes: **Phase 0 (platform hygiene) → Phase 1 (static head render) → Phase 2 (TTS + lip sync) → Phase 3 (voice input) → Phase 4 (per-persona avatars) → Phase 5 (low-spec polish + opt-in framing)**. Phase 0 did not exist in the original brief; it is now the ship-blocker.

---

## Decisions Requiring User Input (Before Spec Writing)

Load-bearing decisions that this research cannot make for you. Each has a **recommendation** but needs your sign-off because it reshapes scope, UX, or risk.

| # | Decision | Recommendation | Impact if different |
|---|---|---|---|
| **D1** | **Upgrade Electron 35 → ≥38.8.6 as part of Phase 0?** | **Yes, blocking.** CVE-2026-34777 affects the permission handler we need. 35.x is EOL. | Ship vulnerable mic handling, face churn on next upgrade. |
| **D2** | **Use `@huggingface/transformers` for whisper STT instead of whisper.cpp WASM direct?** | **Yes.** HeadTTS already pulls transformers.js v4; whisper becomes free marginal cost, unifies ONNX runtime, gives WebGPU STT too. | Two WASM runtimes in bundle, extra build toolchain (Emscripten/CMake in CI). |
| **D3** | **Is voice+avatar opt-in or default-on for low-spec users?** | **Opt-in on low-spec.** Default low-spec experience = text + Web Speech API TTS (~0ms latency, zero download, lower quality). Kokoro + avatar = premium toggle. | Ship with Kokoro on by default → 8 GB laptops thrash, fans spin, first-impression is "slow". |
| **D4** | **AEC (echo cancellation) strategy for v1?** | **Pause VAD while avatar is speaking.** Ships in days. User can't interrupt mid-sentence, but that's fine — matches Siri push-to-talk behavior. | Fork TalkingHead or do RTCPeerConnection loopback hack → +5–10 days, more complexity. |
| **D5** | **Download models lazily on first voice use, or bundle inside installer?** | **Split: bundle the 20 MB ort-web WASM + 6 RPM GLBs inside `app.asar`; lazy-download Kokoro (86 MB q8f16) and whisper-tiny q5_1 (31 MB) on first use.** | Bigger installer, or first-use stall. |
| **D6** | **Ready Player Me shutdown (Jan 31, 2026, 10 weeks ago).** Confirm no runtime RPM URLs, all GLBs pre-bundled? | **Yes, bundle 6–8 preset GLBs. No "upload your own" in v1.** | Broken avatars the moment anyone tries to fetch at runtime. |
| **D7** | **Layout: avatar as sidebar, stacked above messages, or floating PIP?** | **Stacked above messages (Option C)** + collapse chevron. Matches existing `ChatWindow` skeleton, Zoom/FaceTime muscle memory, TalkingHead's wide "head" camera framing. | Sidebar variant (Option B) steals horizontal space from chat. |
| **D8** | **Voice input default: push-to-talk or hands-free VAD?** | **PTT default. Hands-free opt-in.** Matches Claude Code / Codex convergence; lower CPU cost; no mistriggers in shared spaces. | Hands-free default eats CPU continuously and misfires in open offices. |
| **D9** | **SOUL.md inclusion of voice/appearance info?** | **No.** Keep presentation out of the LLM system prompt. The persona doesn't need to "know" it has a female voice unless the feature explicitly wants that. | Persona starts self-referencing its appearance in awkward ways. |
| **D10** | **Voice picker language scope: English-only for v1?** | **Yes.** HeadTTS's Kokoro ONNX-timestamped build is English-only (26 voices: 11 AF, 9 AM, 4 BF, 4 BM). Multilingual requires swapping to a different ONNX export + re-validating phoneme dictionaries. | Scope creep; none of the ka/ru personas sound right in v1. |

---

## 1. Existing Codebase Patterns

*Source: agent 1 — `research/.parts/01-codebase.md`*

### The single most important plug-in point

**File: `personahub-desktop/src/hooks/useChat.ts`, line 74.**

The `if (chunk.done)` branch (lines 65–85) is the only place in the app where "an assistant message just became final" is known. A single call after `setIsStreaming(false)`:

```ts
ttsClient.speak(personaId, finalContent);
```

…is the cleanest possible TTS trigger. No refactoring required. For lower perceived latency, a sentence-level streaming TTS can tap into the per-delta branch (lines 86–96) instead — but that's an optimization, not a prerequisite.

### The data-model insight that saves a migration

`PersonaSettings` (`src/types/index.ts:31-37`) is already serialized as JSON into the `settings` column (`local-db.ts:295`). **Zero schema change is needed.** Just add to the TypeScript interface:

```ts
export interface PersonaSettings {
  temperature?: number;
  modelName?: string;
  customInstructions?: string;
  avatar?: string;              // existing: emoji/letter for sidebar
  pinned?: boolean;
  // Avatar phase additions — all optional, all flow through rowToPersona automatically
  avatarPreset?: string;        // e.g. 'ready-player-me-ada'
  voiceId?: string;             // Kokoro voice id, e.g. 'af_bella'
  voiceSpeed?: number;          // 0.5–2.0, default 1.0
  lipSyncEnabled?: boolean;     // default true
  avatarBackground?: string;    // hex or 'transparent'
}
```

`rowToPersona` at `db/local-db.ts:65` already does `JSON.parse(row.settings)`, so new fields flow through automatically. **Critical: the existing emoji `avatar` field is overloaded — do NOT repurpose it.** Use `avatarPreset` for the 3D GLB reference; keep `avatar` for the sidebar emoji thumbnail.

### The architectural constraint that steers the whole design

`main.ts:62-75` sets `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. This forces:
- TTS + STT + avatar all run in the **renderer** (onnxruntime-web, WASM, WebGL). Not in main.
- Asset delivery via `public/` folder (served at `/avatar.glb`) or a custom protocol — *not* arbitrary `file://` reads.
- `onnxruntime-node` won't work — anyone suggesting it should be steered to onnxruntime-web.

### Exact layout slot table

| New capability | File | Line | Exact change |
|---|---|---|---|
| TTS trigger on finalized assistant message | `src/hooks/useChat.ts` | 74 | After `setIsStreaming(false)`, call TTS |
| AvatarHead component slot | `src/components/ChatWindow.tsx` | 215–218 | Insert `<AvatarHead>` between header div and `<ChatMessages>` |
| Mic button | `src/components/ChatInput.tsx` | 50–52 | Insert `<MicButton onTranscript={...} />` in the flex row; reuses existing `setText` |
| Persona voice/avatar settings UI | `src/components/PersonaSettingsPanel.tsx` | 212–257 | New "3D Avatar" + "Voice" sections after emoji avatar block |
| Creation modal fields | `src/components/ChatSidebar.tsx` | 416 | Add avatar + voice pickers between Description and Advanced disclosure |
| Persona settings type | `src/types/index.ts` | 31–37 | Extend `PersonaSettings` (no migration) |
| SOUL.md embodiment (optional) | `openclaw/config-factory.ts` | 122 | **Do not add** unless persona self-references (D9) |
| New IPC channels | `electron/main.ts` | 467 | Add `avatar:*`, `models:*` handlers |
| Preload bridge | `electron/preload.ts` | 102 | Add `avatar: {...}`, `models: {...}` groups |
| Asset packaging | `electron-builder.config.js` | 12–16 | Add `extraResources` for GLBs + ORT WASM |
| Vite asset handling | `vite.config.ts` | 54 | Add `vite-plugin-static-copy` for vad/ort files |
| Info.plist (macOS mic) | `electron-builder.config.js` | `mac.extendInfo` | Add `NSMicrophoneUsageDescription` |
| mac entitlements | `build/entitlements.mac.plist` | (append) | `com.apple.security.device.microphone` + `audio-input` |

### IPC streaming template to copy

The `agent:response` flow is the only existing main→renderer streaming pattern, and **it has a latent bug**: `preload.ts:64-66` calls `ipcRenderer.on(...)` without returning a cleanup function, which forces the cast `as unknown as () => void` at `useChat.ts:99`. Any new event channels (`tts:audio-chunk`, `stt:partial`, `avatar:model-progress`) **must** return proper unsubscribe functions — otherwise `<AvatarHead>` will leak ghost listeners every time the user switches personas. **Fix the preload unsub pattern at the same time you add new channels.**

### Tests

- Vitest is the runner. Existing tests mock `node:*` modules directly.
- `openclaw/__tests__/config-factory.test.ts` mocks fs and asserts SOUL.md content — update if D9 changes.
- **No React Testing Library setup**, no component tests, no Playwright in the desktop folder. Stick to pure-function unit tests with mocked fs/http. Any integration testing will be manual run-through during dev.

### Assets / download pattern — important finding

There is **no existing HTTP download + progress UI pattern in the codebase anymore**. `electron/openclaw-manager.ts:253-263` only has `cleanupOldRuntime()` — OpenClaw is now bundled as an npm dep (`package.json:31`) and unpacked via `asarUnpack`. The team deliberately moved away from runtime downloads.

Implication: the Kokoro + whisper download flow will be **built from scratch**. Mirror the old openclaw-manager pattern shape (sentinel files, atomic rename, streaming progress via IPC). Or bundle everything in `extraResources` to avoid the work entirely. See D5.

---

## 2. Technical Architecture

*Source: agent 2 — `research/.parts/02-architecture.md`*

### System diagram

```
┌─────────────────── ELECTRON MAIN ──────────────────────┐
│  main.ts                                                │
│   • New IPC: models:download / avatar:loadGlb /         │
│              assets:getStatus (custom protocol only)    │
│   • session.webRequest.onHeadersReceived → strict CSP   │
│   • protocol.handle('personahub-asset', ...) for GLB    │
│   • setPermissionRequestHandler (media only)            │
│  electron/avatar-assets.ts  (NEW)                       │
│   • https streaming + SHA-256 verify + progress events  │
└───────────┬────────────────────────────────────────────┘
            │
            │ IPC / preload bridge
            ▼
┌─────────────────── ELECTRON RENDERER ──────────────────┐
│                                                         │
│  ChatWindow.tsx                                         │
│   ├─ AvatarHead.tsx (NEW, forwardRef + useImperativeHandle)
│   ├─ ChatMessages.tsx (existing)                        │
│   └─ ChatInput.tsx  ──  <MicButton/> (NEW)              │
│         │                    │                          │
│         ▼                    ▼                          │
│    useChat.ts ──── useAvatarTTS.ts (NEW)                │
│                         │                               │
│                         ▼ refs, no re-renders           │
│              sentence-chunker → TTS queue → avatarRef.speak()
│                                          │              │
│                                          ▼              │
│    ┌──────────── Web Worker ────────────┐               │
│    │  kokoro.worker.ts / HeadTTS        │               │
│    │   • @huggingface/transformers v4   │               │
│    │   • Kokoro-82M ONNX (WebGPU/WASM)  │               │
│    │   • audio + visemes out            │               │
│    └────────────────────┬───────────────┘               │
│                         │ { audio, visemes, vtimes }    │
│                         ▼                               │
│    TalkingHead (vendored src/vendor/talkinghead/)       │
│    • Three.js 0.180.0 pinned exact                      │
│    • speakAudio(payload) — zero adapter                 │
│                                                         │
│  useVoiceInput.ts  (NEW)                                │
│    │                                                    │
│    ├── @ricky0123/vad-react (Silero VAD)                │
│    └── whisper.worker.ts (@huggingface/transformers)    │
│         → text → chatInput.setText(text)                │
└─────────────────────────────────────────────────────────┘

                (userData)/
                ├── personahub.db                (existing)
                ├── models/                      (downloaded)
                │   ├── kokoro/model_q8f16.onnx  (86 MB)
                │   └── whisper/                  (~31 MB)
                └── avatars/{personaId}.glb       (per-persona copies)
                app.asar/
                └── public/
                    ├── avatars/*.glb             (6–8 bundled RPM presets)
                    ├── ort/*.wasm                (ONNX Runtime Web, ~19.5 MB)
                    └── vad/*                     (silero_vad_v5.onnx + worklet)
```

### TalkingHead integration

- Distributed as an **ES module class** (`modules/talkinghead.mjs`, ~220 KB source → ~55–70 KB gzipped). Not on npm in a usable way — **vendor it** to `src/vendor/talkinghead/` at a pinned tag (v1.7.0 at time of research).
- Constructor takes a DOM `<div>` and an options bag of ~70 fields. Pins `three@^0.180.0` in its `package.json` — our project **must** pin the exact same version to avoid dual-Three bundles.
- Key methods: `showAvatar({url, body})`, `speakAudio({audio, visemes, vtimes, vdurations, ...})`, `stopSpeaking()`, `setMood()`. The `streamStart/streamAudio/streamStop` API exists for lower-latency chunked audio, but for v1 `speakAudio` per sentence is simpler and sentence-level latency is already fine (<200 ms total after warm).
- **No documented `dispose()` method.** Open question Q6. Without explicit Three.js teardown, persona-switching and React StrictMode double-mount will leak GL contexts. Walk the scene graph on unmount and dispose geometries/materials/textures manually.
- **React integration pattern**: `forwardRef` + `useImperativeHandle` exposing `speak()`/`stop()`/`setMood()`. `useRef` for the container `<div>` and the instance. One `useEffect([])` for init/cleanup. Separate `useEffect([avatarUrl])` that calls `showAvatar()` without rebuilding the scene.

### HeadTTS integration (zero adapter)

HeadTTS and TalkingHead are by the same author (met4citizen), and HeadTTS's audio message shape is **exactly** what `speakAudio()` expects:

```js
{
  words, wtimes, wdurations,
  visemes, vtimes, vdurations,
  phonemes,
  audioEncoding: 'wav',
  audio: ArrayBuffer  // 16-bit LE PCM WAV at 24 kHz
}
```

Integration is literally:
```js
headtts.onmessage = (msg) => {
  if (msg.type === 'audio') head.speakAudio(msg.data);
};
```

**No phoneme→viseme mapping layer. No timing reconstruction. This is the key reason to stick with the TalkingHead+HeadTTS pair vs. rolling our own with `kokoro-js`.**

- Loads Kokoro weights via `@huggingface/transformers` v4, cached in IndexedDB on first run.
- Recommended dtype: **`q8f16` (86 MB)** for WASM fallback (smaller + faster on integrated); **`fp16` (163 MB)** for WebGPU. HeadTTS defaults to `q4` WASM / `fp32` WebGPU — can override.
- Endpoints list: `['webgpu', 'wasm']` priority order. Automatic fallback.
- Spawns its own internal Web Worker (`headtts-worker.mjs`). Vite compatibility: pass our own worker URL via `workerModule` constructor option, using `new URL('../vendor/headtts/headtts-worker.mjs', import.meta.url)`.

### State flow — LLM stream to spoken audio

```
LLM delta chunks → sentence-chunker (stateful buffer) → TTS queue → Kokoro synth → avatarRef.speak()
```

**Sentence-level chunking, not word-level.** Rationale: Kokoro is prosody-sensitive; word-level gives robotic machine-gun delivery. Regex splitter on `[.!?]` + closing quotes, with 200-char ceiling for runaway paragraphs. Flush on stream end.

**Interruption**: on new user message, increment a cancel-generation counter → drain TTS queue → `headtts.abort()` → `avatarRef.current.stop()`. ~100 ms cost.

**Backpressure**: LLM emits ~100 tok/s, Kokoro WebGPU ~15× realtime, WASM ~3× realtime. Queue is small in practice (~4 sentences typical reply). Unbounded ref is fine; it drains naturally.

### Vite + Electron build concerns

| Concern | Fix |
|---|---|
| Worker loading | Use `new Worker(new URL('./foo.worker.ts', import.meta.url), { type: 'module' })` exactly inline — Vite's AST scanner requires this shape |
| WASM loading | Copy `onnxruntime-web/dist/*.wasm` to `public/ort/`; set `env.wasm.wasmPaths = '/ort/'` at runtime |
| GLB handling | Put bundled avatars in `public/avatars/` → URLs like `/avatars/default_f.glb` work in dev and prod |
| Three.js de-dup | Vite auto-resolves `from 'three'` inside vendored code to our single `node_modules/three`. Only risk: wrong version. Pin exact. |
| VAD assets | Use `vite-plugin-static-copy` to copy `@ricky0123/vad-web/dist/*.onnx` + worklet to `public/vad/` |
| `tsconfig.json` quirks | `noUncheckedIndexedAccess: true` will fight TalkingHead example code — expect ~1–2 hours of adding `?`/`!` operators when vendoring |
| electron-builder packaging | Add `extraResources` for the 20 MB `ort-wasm-simd-threaded.jsep.wasm`. Bundled RPM GLBs come in via `public/**/*` already |
| **Electron 35 EOL + CVE** | **Upgrade to ≥38.8.6 in the same PR (D1)** |

### Audio output routing — the Chromium AEC bug

**Chromium bug #687574** (still open as of 2026): the browser's native echo cancellation only applies to audio played through `<audio>`/`<video>` DOM elements. Audio played via `AudioContext.destination` does NOT get cancelled. TalkingHead plays through its own internal `AudioContext`, so **the mic picks up the avatar's voice as user speech** — catastrophic feedback loop.

Three options, ranked by effort:

| Option | Effort | Pros | Cons |
|---|---|---|---|
| **C — pause VAD during speech** | Trivial | Ships fast. Matches Siri PTT behavior. | No mid-sentence interruption. |
| B — RTCPeerConnection loopback hack | Medium | Keeps AudioContext. Allows interruption. | +100 ms latency, more CPU, obscure pattern. |
| A — Patch vendored TalkingHead to play via `<audio>` | Medium | Cleanest behavior. | Diverges from upstream. |

**Recommendation: Option C for v1 (D4). Revisit based on feedback.**

### Error handling matrix

| Failure | Fallback | User message |
|---|---|---|
| No WebGL/WebGL2 | Hide avatar; text-only mode | "3D avatar unavailable on this device. Continuing in text mode." |
| No WebGPU | Auto-fall-through to WASM (silent) | none |
| Kokoro download fails | Keep text chat; "Retry" button | "Couldn't download voice model. Check your connection." |
| Whisper download fails | Voice input disabled; text OK | "Voice input unavailable." |
| Mic permission denied | Hide voice button; settings hint | "Microphone permission denied. Enable in System Settings." |
| TTS synthesis error (one sentence) | Skip; continue queue | silent |
| GLB load fails | Load default GLB | "Avatar file couldn't load. Using default." |
| Software rendering (SwiftShader) | Disable avatar entirely | "Graphics acceleration required. Running in text mode." |

**Overall philosophy**: the avatar is a progressive enhancement on top of text chat. Every failure gracefully degrades to text. Text chat must remain functional under all avatar failure modes.

### State management recommendation

**Local React state + `useImperativeHandle` refs. No Zustand, no Context.** Matches existing codebase conventions. `useAvatarTTS` owns the TTS queue in `useRef` (never state — no re-renders on deltas). Only `isLoading`, `isSpeaking`, `errorMessage` are React state.

---

## 3. UI/UX Design Direction

*Source: agent 3 — `research/.parts/03-ui-ux.md`*

### Competitor landscape (highlights)

| Product | Layout approach | Voice UX | Lessons |
|---|---|---|---|
| **Open-LLM-VTuber** | Window mode: avatar dominant, chat under. Desktop Pet mode: transparent overlay. | Hands-free VAD, interruptible | Closest reference. Draggable subtitles pattern worth stealing. |
| **Character.AI** | Tiny static portrait in chat header | Tap-to-talk "Calls" mode | Emotional investment via early avatar customization. |
| **Replika** | Two tabs: classic chat OR fullscreen 3D room | Hold mic to talk; voice is premium | Upfront ownership during onboarding. |
| **Pi (Inflection)** | None — voice-only orb, minimalist | Tap or continuous | "Texting a friend" minimalism is underrated. |
| **ChatGPT Voice (2026)** | Integrated inline; orb + live transcript | Continuous VAD with kill-switch | OpenAI explicitly reverted the "separate voice mode" in 2026 — keep chat visible. |
| **Claude Voice Mode** | Text UI with voice overlay | Hands-free default, PTT fallback for noisy rooms | Explicit UX note: PTT is more reliable in noisy environments → flip default for low-spec/shared-office reality. |
| **HeyGen Interactive** | Avatar is the whole frame | Word-level lip sync | "Idling state with neutral demeanor and occasional nods" — aliveness pattern. |
| **AIRI (moeru-ai)** | VRM avatar central, Neuro-sama-inspired | Client-side ASR + VAD | Closest stack: WebGPU + Three.js + VRM. |

### Recommended layout — Option C (stacked) + Option E (collapsible)

**3D head lives in a fixed 360-px-tall panel above `<ChatMessages>`, inside the existing right-side chat area.** A small collapse chevron in the persona header toggles it. This matches the existing header-messages-input skeleton, the Zoom/FaceTime mental model, and TalkingHead's wide "head" camera framing. Degrades to the current text-only experience when collapsed.

```
+----------------------------------------------------------------+
|  (sidebar)  |  [*]Lex               [-][CC][gear]              |
|   Lex       +------------------------------------------------- |
|   Maria     |        +----------------------------+           |
|   Ada       |        |                            |           |
|             |        |   (3D avatar: chest-up,    |           |
|             |        |    radial gradient bg,     |           |
|             |        |    idle blink + breathe)   |           |
|             |        +----------------------------+           |
|             |   "Hi! I'm Lex. Ask me anything." (caption)     |
|             +----------------------------------------------- |
|             |  user: What's the weather like?                 |
|             |  Lex:  I don't have access to live weather...   |
|             +----------------------------------------------- |
|             |  [mic] Message Lex...                  [send]   |
+----------------------------------------------------------------+
```

Size budget at 1280×800:
- Sidebar: 256 px (unchanged)
- Chat header: 48 px (unchanged, adds collapse/CC/settings icons)
- **Avatar stage: 360 px tall** × full chat width (head renders at ~320×320 centered on a radial gradient background)
- Caption strip: 32 px (toggleable)
- Messages area: ~280 px visible (scrollable; fills remaining)
- Input: 72 px

Total: 48 + 360 + 32 + 280 + 72 = **792 px** (fits 800 px window).

Below 1024 px wide → drop to 300 px avatar; below 900 px → auto-collapse.

### Avatar presentation

- **Framing**: TalkingHead `head` camera view (chest-up). Upgradeable to `upper` for full VRM bodies.
- **Background**: **soft radial gradient** matching the dark theme (gray-800 → gray-950 with faint indigo tint). Never pure transparent in window mode — reads as "broken rendering". Never a busy scene.
- **Idle behavior** (when not speaking): blink every 3–7 s; breathing at 14 bpm; micro head sway ±1.5° yaw / ±0.5° pitch; eye saccades every 1–3 s; optional gaze follow cursor; occasional slow nod on message arrival. **All disabled under `prefers-reduced-motion` except blinking.**
- **Wake on focus**: small forward lean + slow blink when window gains focus.

### State indicators (every state needs ≥2 modality cues for WCAG)

| State | Avatar | Ring (Siri orb-style) | Text cue |
|---|---|---|---|
| Thinking | slight upward gaze, slower blink | indigo-400 slow pulse | `...` ellipsis |
| Speaking | lip sync (the whole point) | indigo-500 pulses with TTS amplitude | live caption under avatar |
| Listening | forward tilt, raised brows | emerald-500 reacts to mic FFT | "Listening..." + waveform bars |
| Idle | subtle ambient animation | 5% opacity faint | none |
| Error | neutral + downward gaze | dim rose-500 static | banner + retry button |

Ring implementation: external 1–2 px aura around the viewport. Static gradient when `prefers-reduced-motion`.

### Voice input UX

- **PTT default**, hands-free opt-in (D8). Rationale: 2026 convergence (Claude Code, Codex), lower CPU, fewer mistriggers in shared spaces, keyboard-native (hold Space in textarea).
- **Mic button** 40×40 on the LEFT of the textarea (Discord/Telegram/WhatsApp muscle memory). Emerald-500 + pulse when active.
- **Mic level**: 5 vertical equalizer bars inline next to the button. Mirror to the avatar's aura ring.
- **Hotkey**: hold Space in textarea = PTT. Escape = cancel. `Cmd/Ctrl+Shift+M` = global mic toggle. `Cmd/Ctrl+Shift+A` = toggle avatar. `Cmd/Ctrl+Shift+C` = toggle captions.
- **Audio feedback**: quiet 80 ms start/stop chirps, default on, toggleable. Visual-only fallback via the ring color transition.

### Avatar picker & voice picker

**Avatar picker** (in creation modal between Description and Advanced):
- 4-col grid × 2 rows = 8 presets as 80×80 rounded thumbnails. Selected = indigo-500 ring + checkmark.
- **8 curated Ready Player Me presets** covering diverse gender presentation + Fitzpatrick 1–6 (Ada, Marcus, Yuki, Leo, Priya, Kai, Zara, Alex). Each ~3–5 MB. **All bundled in `app.asar`** (D6 — RPM CDN is dead).
- Modal width grows 420 → 480 px to fit the grid.
- **No custom upload in v1** — deferred to v2. RPM's shutdown means no "create your own" external link either.

**Voice picker**:
- Radio list grouped by gender (Female / Male), not a grid.
- 6 curated voices shown by default, "Show more voices…" reveals the full 26.
- Inline **preview button** per row → plays `"Hi, I'm {personaName}!"` (dynamically synthesized using the persona's current name field). Only one preview at a time. Shows spinner during cold-cache synthesis.
- **Default voice** picked deterministically from persona name hash to avoid all personas sounding the same.

### Onboarding

**Lazy permissions, not eager.** Do NOT add a mic step to the existing 2-step SetupWizard. Instead:
- Optional third "Voice & Avatar" step in SetupWizard as a preview of features, with "Skip for now" / "Enable" buttons.
- Mic permission requested at the **moment of first mic button press** — not during setup.
- Custom Electron dialog wraps the OS prompt, explaining rationale first: *"PersonaHub uses your mic so you can speak to your personas. Audio is transcribed on-device and never leaves your computer."*
- Model download happens **on first voice use**, with friendly progress modal: `"First-time setup — Downloading voice engine... 42% (~86 MB)"`.
- **Background pre-fetch** during setup if the user chose "Enable voice" in step 2.

### Accessibility

- **Captions default ON** under the avatar. Toggleable via `CC` button in header. `aria-live="polite"`.
- **`prefers-reduced-motion`**: disable idle animations (keep blinking + lip sync); static ring (no pulse, color change only).
- **Screen reader**: `aria-label="Animated 3D avatar of {personaName}"`; mic button `aria-pressed`; state announcements via visually-hidden `aria-live` region.
- **Full keyboard navigation**: tab order sidebar → header → avatar (focusable) → CC → messages → mic → textarea → send. Focus rings 2px indigo-500.
- **Chat messages stored as normal text** in `chat_messages.content` — screen readers and copy-paste work exactly as before.

### Performance toggles (global, not per-persona)

In a new **Settings > Graphics** section:
- **Quality**: Low / Medium / High / Custom. Auto-detect on first launch via a 60-frame render benchmark. One-time toast: *"Graphics quality set to Medium based on your hardware."*
- **"Enable 3D avatars" master toggle** — off = static 2D thumbnail + voice still works.
- **"Enable voice features" master toggle** — off = pre-avatar v1 experience.
- **CPU usage pill** — live readout via `process.getCPUUsage()`.
- **Low-battery auto-pause** — banner when `charging=false && level<0.2`.
- **Background-tab throttle** — freeze Three.js rAF loop when window hidden.

---

## 4. Performance on Low-Spec PCs

*Source: agent 4 — `research/.parts/04-performance.md`*

### TL;DR

**CONDITIONAL YES.** Technically viable on 8 GB / UHD 620, but **not at the latency target the original brief advertised**, and **not as the default experience**. The entire point of rejecting local LLaMA was to serve low-spec users — if the avatar pipeline also requires 16 GB + discrete GPU, we've reintroduced the exact problem we were avoiding.

**Ship framing**: premium feature, opt-in, with a graceful text + Web Speech API fallback for the users who can't afford the CPU cost.

### Target hardware profile

- **CPU**: Intel i5-7200U / Ryzen 3 2200U class — 4 threads, AVX2 (non-negotiable for WASM SIMD), ~2.5 GHz
- **RAM**: 8 GB minimum (16 GB strongly recommended)
- **GPU**: any DX12-capable; Intel UHD 620/630 is the bar
- **Storage**: 500 MB free for models

### Bundle size & downloads

| | Current | After (lazy) | After (eager worst case) |
|---|---|---|---|
| Main entry JS gz | ~150 KB | **~150 KB unchanged** if chunks split | ~1.2–1.5 MB |
| Lazy avatar chunk (Three + TalkingHead) | — | ~250 KB gz | (included) |
| Lazy TTS chunk (Kokoro + transformers + ort-web JS) | — | ~400–600 KB gz | (included) |
| Lazy STT chunk (VAD-web + whisper wrapper) | — | ~100 KB gz | (included) |
| **WASM binaries (separate files)** | 0 | **~20 MB** (`ort-wasm-simd-threaded.jsep.wasm`) + 2 MB (whisper) | 22 MB |

**The 19.5 MB `ort-wasm-simd-threaded.jsep.wasm` is the 10× problem — bigger than the entire current PersonaHub bundle. Never fetch this from CDN at runtime. Bundle it inside `app.asar` so it ships once with the installer.**

Downloaded model sizes (first voice use, lazy):
| Asset | Size | Notes |
|---|---|---|
| **Kokoro q8f16** | **86 MB** | recommended default; quality close to fp32 |
| Kokoro q4f16 | 154 MB | too big for default; use only if q8f16 too slow |
| **whisper-tiny q5_1** | **31 MB** | low-spec default |
| whisper-base q5_1 | 57 MB | mid-spec upgrade |
| Silero VAD v5 | 2 MB | bundled with vad-web assets |
| RPM GLBs × 6–8 | 18–30 MB | bundled in `app.asar` |

**First-run total download** when user clicks mic for the first time: ~119 MB ≈ **95 seconds on 10 Mbps** (assuming ort-web is bundled in `app.asar`, not downloaded).

**Installer size**: current ~170 MB → after = **~207 MB** (+ ort-web WASM + RPM GLBs). Acceptable for a desktop AI installer.

### Memory footprint

| Component | Estimate |
|---|---|
| Electron baseline (Chromium 134 + V8 + GPU) | 200–300 MB |
| React app | 50–80 MB |
| Main process + SQLite | 60–100 MB |
| **Text-only idle** | **310–480 MB** |
| + Three.js + GLB + TalkingHead | +80–150 MB |
| **Avatar visible** | **390–630 MB** |
| + Kokoro q8 in ort-web | +200–300 MB |
| + whisper-tiny loaded | +~273 MB (documented whisper.cpp memory table) |
| + audio buffers + VAD session | +30–60 MB |
| **Full pipeline active** | **~900–1260 MB renderer RSS** |
| + main process + OpenClaw | +200–400 MB |
| **Grand total** | **~1.1–1.7 GB** |

**Fits in 8 GB RAM**: ~2.2 GB free after Windows 11 + OpenClaw + background services. Enough for one browser tab open, not five. Will page-fault to swap under multitasking. **Soft-warn users with `navigator.deviceMemory <= 8`.**

### CPU on i5-7200U / UHD 620 (baseline low-spec target)

| Task | % of one core |
|---|---|
| Idle scene (TalkingHead at 30 fps) | **8–18%** + 25–40% iGPU usage |
| Kokoro q8 WASM synthesis | **40–70%** for 0.8–1.5 s per sentence |
| whisper-tiny q5_1 | **25–45%** continuous while listening |
| Three.js 30 fps + viseme updates | 10–20% main thread |
| React re-renders | 5–10% |
| Silero VAD | 2–5% |

**Peak combined (worst case concurrency)**: 85–130% of one logical core, ~25–35% of package on a 4-thread i5. **Fans will spin during the first 2 seconds of each turn.** Mitigation: VAD gatekeeps whisper (only run when VAD detects speech) — cuts idle listening CPU from ~30% to ~5%.

### Latency budget reality check

**Target from original brief: 400–600 ms first audio.**

| Stage | WebGPU path (mid/high-spec) | **WASM path (low-spec reality)** |
|---|---|---|
| LLM TTFT | 200–500 ms | 200–500 ms |
| Sentence accumulator | 50–300 ms | 50–300 ms |
| Kokoro first-chunk synth | 80–200 ms | **400–2500 ms** |
| Cold-start model load | 0 (warm) | +500–2000 ms first time |
| Audio output buffer | 20–50 ms | 20–50 ms |
| **Total (warm)** | **350–1050 ms** | **670–3350 ms** |
| **Total (cold first sentence)** | 350–1050 ms | **1170 ms – ~5 s** |

**Honest verdict**: 400–600 ms is only achievable on WebGPU-capable hardware in the best case. On the low-spec WASM path, realistic first-audio is **1.2–3.5 s** warm, up to 5 s on first-ever synthesis.

**Mitigations**:
1. Pre-synthesize the first sentence while the LLM is still streaming. Don't wait for full response.
2. Show a "speaking…" indicator with subtle animation so the user knows something is happening.
3. Offer **Web Speech API TTS** as an "Instant voice, lower quality" toggle for low-spec users (D3). Ship as default on low-spec.
4. Warm Kokoro in the background when voice mode is first enabled — amortize the 500–2000 ms cold start to once per session.

### WebGPU availability — critical caveat

| GPU class | WebGPU in Chromium 134? |
|---|---|
| Iris Xe (11th gen+) | Yes, enabled by default |
| **UHD 620/630 (Kaby Lake → Comet Lake, 7th–10th gen)** | **Inconsistent — often blocklisted** by driver version. `chrome://flags/#enable-unsafe-webgpu` exists exactly because of this. |
| HD 4000/520/530 (pre-Skylake) | No |

**Don't assume WebGPU on low-spec. Treat WASM fallback as the default path.** Do NOT enable `--enable-unsafe-webgpu` to force it — stability risk is real. Let the Chromium blocklist do its job and degrade gracefully.

### Ready Player Me — 5× better than assumed

Original brief assumed 30K triangle avatars. **Actual RPM avatars are ~6K triangles** per RPM docs, with `meshLod=2` cutting another 50%. This is a significant perf win on iGPU — the bottleneck becomes skin shader fillrate, not polygon count.

### Quality tiers

| Tier | GPU | RAM | Default experience | Kokoro | Whisper | First-audio target |
|---|---|---|---|---|---|---|
| **Ultra** | RTX 3060+ / M2+ | 16 GB+ | High | fp16 WebGPU | base fp16 | 400–700 ms |
| **Balanced** | GTX 1050 / Iris Xe / M1 | 8–16 GB | Medium | q8f16 WebGPU | base q5_1 | 700 ms – 1.2 s |
| **Low-spec** | Intel UHD 620/630, no WebGPU | 8 GB | **Text-only by default; avatar+voice opt-in** | q4f16 WASM | tiny q5_1 | 1.5–3.5 s |
| **Unsupported** | pre-UHD, software rendering, <8 GB | — | Text + Web Speech API TTS only | — | — | — |

### Lazy loading strategy (critical)

Every heavy piece must be behind a dynamic `import()`:

```ts
// vite.config.ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'avatar-three': ['three', './src/lib/avatar/talkinghead-wrapper'],
        'voice-tts':   ['kokoro-js', '@huggingface/transformers', 'onnxruntime-web'],
        'voice-stt':   ['@ricky0123/vad-web', '@ricky0123/vad-react'],
      },
    },
  },
  chunkSizeWarningLimit: 600,
}
```

React Suspense + `lazy()` for `<AvatarScene>` and `<VoiceMode>`. **CI guard**: fail build if the main chunk gzipped > 500 KB, or if main chunk files contain the strings `three`, `kokoro`, `onnxruntime`. It's extremely easy to accidentally kill code splitting with a stray top-level import.

### Cleanup checklist (leak prevention)

Every one of these has a documented post-mortem somewhere:

- `renderer.dispose()` + walk scene graph, `.dispose()` every Geometry/Material/Texture
- Cancel pending `requestAnimationFrame` handles
- `URL.revokeObjectURL()` for loaded GLBs
- `audioContext.close()`
- `kokoroWorker.terminate()` — frees ~300 MB immediately
- `whisperWorker.terminate()` — frees ~200 MB
- `vadInstance.destroy()`
- `mediaStream.getTracks().forEach(t => t.stop())` — critical for mic indicator
- Trigger all of the above on persona switch, component unmount, and `window.beforeunload`

### Performance budget (CI-enforced)

| Metric | Budget |
|---|---|
| Main bundle gz (without voice/avatar chunks) | **< 500 KB** |
| Lazy avatar chunk gz | < 350 KB |
| Lazy voice-TTS chunk gz | < 800 KB |
| Lazy voice-STT chunk gz | < 200 KB |
| `app.asar` total (with vendored WASM + GLBs) | < 300 MB |
| Cold start → chat ready | **< 2 s** on i5-7200U |
| Avatar scene init (click → first frame) | < 1 s |
| First TTS audio warm (any spec) | < 1 s; **< 600 ms on WebGPU** |
| First TTS audio cold (first-ever synth) | < 5 s |
| Idle avatar CPU | < 15% single-core on i5-7200U |
| Active conversation peak CPU | < 70% package |
| Active renderer RSS | < 1.8 GB |

---

## 5. Library Integration Deep-Dive

*Source: agent 5 — `research/.parts/05-integration.md`*

### Library map at-a-glance

| Library | Purpose | License | Last commit | Install |
|---|---|---|---|---|
| TalkingHead v1.7.0 | 3D avatar + lip sync | **MIT** | 2026-04-08 | **Vendor clone** to `src/vendor/talkinghead/` |
| HeadTTS v1.3.0 | Kokoro wrapper w/ viseme timestamps | **MIT** | 2026-04-03 | **Vendor clone** to `src/vendor/headtts/` |
| `@ricky0123/vad-react` | Silero VAD React hook | **ISC** (model: MIT) | 2026-01-30 | `pnpm add` |
| `@huggingface/transformers` v4+ | Unified ONNX runtime (Kokoro + whisper) | **Apache-2.0** | active | `pnpm add` — already a HeadTTS dep |
| `three@0.180.0` | 3D rendering (pin exact!) | MIT | active | `pnpm add three@0.180.0` |
| Ready Player Me GLBs | Face + body rig assets | RPM TOS | — | Pre-download before shutdown + bundle in `app.asar` |

**All licenses are commercial-friendly.** Attribution (retain copyright notices) is the only requirement for MIT/ISC.

### TalkingHead — actual API

Constructor is `new TalkingHead(containerDiv, options)` — container is a `<div>`, library creates its own canvas child. Constructor options (~70 fields); the ones to touch:

```js
new TalkingHead(container, {
  // Force-disable built-in TTS (we drive audio manually via HeadTTS)
  ttsEndpoint: '',

  // Lip-sync language modules (bundled in vendored copy)
  lipsyncModules: ['en'],
  lipsyncLang: 'en',

  // Rendering
  modelFPS: 30,                       // throttle for battery
  cameraView: 'upper',                // 'full' | 'mid' | 'upper' | 'head'
  avatarMood: 'neutral',

  // CRITICAL: strip Three.js background/skybox so avatar layers over our HTML
  avatarOnly: true,

  // Idle behavior — tune to match UX spec
  avatarIdleEyeContact: 0.26,
  avatarIdleHeadMove: 0.5,
  avatarSpeakingEyeContact: 0.5,
  avatarSpeakingHeadMove: 0.5,

  // Audio mixer
  mixerGainSpeech: 1.0,
  mixerGainBackground: 0.5,

  // Three.js addons
  dracoEnabled: false,                // true only if Draco-compressed GLBs used
});
```

Key methods:
- `showAvatar({url, body: 'M'|'F', lipsyncLang: 'en'})` → returns Promise
- `speakAudio(payload)` → the hot path; payload matches HeadTTS output exactly
- `speakText(text)` → uses built-in TTS; **we don't use this**
- `stopSpeaking()` / `setMood(mood)` / `playGesture(name)`
- `streamStart() / streamAudio(chunk) / streamStop()` → streaming mode for chunked audio; defer to v2
- **No `dispose()`** — open issue. Manual scene-graph disposal required on unmount.

### HeadTTS — actual API & output format

```js
import { HeadTTS } from './vendor/headtts/modules/headtts.mjs';

const headtts = new HeadTTS({
  endpoints: ['webgpu', 'wasm'],
  languages: ['en-us'],
  voices: ['af_bella', 'am_fenrir'],   // pre-load voice embeddings
});

await headtts.connect();               // fetches + caches model to IndexedDB

headtts.setup({
  voice: 'af_bella',
  language: 'en-us',
  speed: 1.0,
  audioEncoding: 'wav',
});

headtts.onmessage = (msg) => {
  if (msg.type === 'audio') {
    head.speakAudio(msg.data);         // ZERO adapter code
  } else if (msg.type === 'error') {
    console.error(msg.data.error);
  }
};

headtts.synthesize({ input: 'Hello world.' });
```

Output `msg.data` shape (confirmed from README):

```js
{
  words: ['This ', 'is '],
  wtimes: [440, 656],
  wdurations: [236, 240],
  visemes: ['TH', 'I', 'SS', ...],            // Oculus LipSync 15-code set
  vtimes: [440, 472, 562, ...],               // ms from audio start
  vdurations: [52, 110, 74, ...],
  phonemes: ['ð', 'ɪ', 's', ...],             // IPA, informational
  audioEncoding: 'wav',
  audio: ArrayBuffer                          // 16-bit LE PCM WAV, 24 kHz
}
```

**The 15 Oculus visemes are the exact set TalkingHead expects, with no mapping needed:**
`aa, E, I, O, U, PP, SS, TH, CH, FF, kk, nn, RR, DD, sil`

### Kokoro voices (English only — 26 total)

- **American female (11)**: `af_heart, af_alloy, af_aoede, af_bella, af_jessica, af_kore, af_nicole, af_nova, af_river, af_sarah, af_sky`
- **American male (9)**: `am_adam, am_echo, am_eric, am_fenrir, am_liam, am_michael, am_onyx, am_puck, am_santa`
- **British female (4)**: `bf_alice, bf_emma, bf_isabella, bf_lily`
- **British male (4)**: `bm_daniel, bm_fable, bm_george, bm_lewis`

(Upstream Kokoro-82M supports 48+ voices across 8 languages but the ONNX-timestamped fork HeadTTS uses is English-only.)

### @ricky0123/vad React API

```tsx
const vad = useMicVAD({
  onSpeechStart: () => {...},
  onSpeechEnd: (audio: Float32Array) => {...},   // 16 kHz mono — EXACT format whisper expects
  positiveSpeechThreshold: 0.3,
  negativeSpeechThreshold: 0.25,
  redemptionMs: 1400,
  preSpeechPadMs: 800,
  minSpeechMs: 400,
  model: 'v5',
  startOnLoad: false,
  processorType: 'auto',
  // CRITICAL: explicit paths to vendored assets — don't use jsdelivr default
  baseAssetPath: '/vad/',
  onnxWASMBasePath: '/ort/',
});
```

Returns `{ listening, userSpeaking, loading, errored, pause(), start(), toggle() }`.

**Model files it needs**: `silero_vad_v5.onnx` (~2 MB) + `vad.worklet.bundle.min.js` + onnxruntime-web WASM files. Default config pulls these from jsdelivr; **vendor them to `public/vad/` and `public/ort/` to keep CSP strict** (D1 and security section).

### Whisper — recommendation is `@huggingface/transformers` (D2)

| Criterion | whisper.cpp WASM direct | transformers.js Whisper |
|---|---|---|
| Install | Manual Emscripten + CMake build | `pnpm add @huggingface/transformers` (already HeadTTS dep) |
| Bundle cost | +2 MB separate WASM | **zero marginal** — shares HeadTTS runtime |
| Model size (tiny.en) | 75 MB ggml | **40 MB q8 ONNX** |
| Speed | Fastest native | ~1.5× slower on WASM; WebGPU narrows gap |
| Streaming | No | Chunked via `chunk_length_s` |
| Input format | Requires resample | **Float32Array 16 kHz mono — exactly what VAD outputs** |
| TypeScript types | None | Built in |
| Unified runtime with Kokoro | No | **Yes — one ONNX Runtime Web instance** |

**Winner: transformers.js.** Call pattern:

```ts
import { pipeline } from '@huggingface/transformers';

const asr = await pipeline(
  'automatic-speech-recognition',
  'onnx-community/whisper-tiny.en',
  { device: 'webgpu', dtype: 'q8' }    // falls back to 'wasm' automatically
);

export async function transcribe(audio: Float32Array): Promise<string> {
  const out = await asr(audio, { language: 'english' });
  return (out as { text: string }).text.trim();
}
```

### Vendoring strategy

| Library | How | Why |
|---|---|---|
| TalkingHead | Clone `modules/` to `src/vendor/talkinghead/` at tag `v1.7.0` | Not on npm. Bus factor 1. Need to patch Vite worker URLs + add dispose(). |
| HeadTTS | Clone `modules/` to `src/vendor/headtts/` at tag `v1.3.0` | Same reasoning. Same author. |
| whisper.cpp WASM | **Skip** — use transformers.js instead | D2 |
| vad-web ONNX + worklet | `vite-plugin-static-copy` from `node_modules/@ricky0123/vad-web/dist/` to `public/vad/` | Avoid jsdelivr default; CSP-strict |
| ORT WASM | `vite-plugin-static-copy` from `node_modules/onnxruntime-web/dist/*.wasm` to `public/ort/` | Avoid CDN; SHA-256 verify vendored binaries in CI |

### Ready Player Me morph target URL

Critical detail verified in RPM forums: **one GLB can carry BOTH ARKit and Oculus visemes simultaneously**. URL pattern when pre-downloading the preset library:

```
https://models.readyplayer.me/{avatarId}.glb?morphTargets=ARKit,Oculus Visemes
```

This means the same preset GLBs drive TalkingHead's Oculus-viseme lip sync now AND could drive ARKit expressions later (v2 emotion). Worth preserving in the spec.

### Maintenance risk matrix

| Library | Last commit | Bus factor | Risk | If abandoned |
|---|---|---|---|---|
| TalkingHead | 2026-04-08 | 1 (Mika Suominen) | Med-High | Fork; maintain vendored copy ourselves |
| HeadTTS | 2026-04-03 | 1 (same author) | Med-High | Same |
| @ricky0123/vad | 2026-01-30 | Small team | Low | Silero VAD model is the hard part; JS wrapper is replaceable |
| @huggingface/transformers | daily | Corporate-backed | Low | Not at risk |
| three | daily | Huge community | Nil | Not at risk |

**Mitigation**: vendor all critical libs; pin commit SHAs; audit upstream before each version bump.

---

## 6. Electron Security & Permissions

*Source: agent 6 — `research/.parts/06-security.md`*

### Executive summary — three blockers

The feature is safe to ship, but the existing app is missing security baselines that this feature makes load-bearing. All three are ~1 day of work but must land **before** the feature is reachable.

1. **No Content-Security-Policy exists anywhere today.** No meta tag in `index.html`, no `session.webRequest.onHeadersReceived`. Every new capability the avatar phase introduces (WASM, workers, blob audio, TTS output) is CSP-unguarded by default.
2. **Electron 35.0.0 is vulnerable to CVE-2026-34777** — iframe origin leak in `setPermissionRequestHandler`, the exact API needed for mic. Electron 35.x is also EOL. Upgrade to **≥38.8.6** required (D1).
3. **Missing macOS mic entitlements + `NSMicrophoneUsageDescription`**. Under hardened runtime, calling `getUserMedia` without these **hard-crashes the app** (SIGABRT from TCC). Four lines in `electron-builder.config.js` + 2 entries in `build/entitlements.mac.plist`.

### Current security posture (verified)

`electron/main.ts:62-75`:
```ts
webPreferences: {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,    // ✓
  nodeIntegration: false,    // ✓
  sandbox: true,             // ✓
}
```

The three critical fuses are correct. **Missing**: `setPermissionRequestHandler`, `setPermissionCheckHandler`, `webRequest.onHeadersReceived` (CSP), `setWindowOpenHandler`, `will-navigate` guard, IPC `senderFrame` validation. All need to land as part of Phase 0.

### Electron security checklist — what's missing

| # | Rule | Today | After avatar phase | Action |
|---|---|---|---|---|
| 5 | Session permission request handler | **None** | Required for mic | **MUST FIX** |
| 7 | Define CSP | **None** | Required for WASM/Workers/blob audio | **MUST FIX** |
| 13 | Limit navigation | None | Required | FIX recommended |
| 14 | Limit new window creation | None | Required | FIX recommended |
| 16 | Current Electron version | **35.0.0 (EOL + CVE)** | **≥38.8.6 required** | **MUST FIX** |
| 17 | Validate IPC sender | None | Required for all new channels | FIX for new channels |
| 18 | Custom protocol over `file://` | Not an issue yet; `file://` flagged in arch doc | Use `personahub-asset://` custom protocol | **Correct architecture doc** |

### Recommended CSP (production)

```
default-src 'self' personahub-asset:;
script-src 'self' 'wasm-unsafe-eval';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: personahub-asset:;
media-src 'self' blob: personahub-asset:;
worker-src 'self' blob:;
connect-src 'self' http://127.0.0.1:18789 ws://127.0.0.1:18789;
font-src 'self' data:;
object-src 'none';
base-uri 'self';
frame-ancestors 'none';
```

**Key choices**:
- `'wasm-unsafe-eval'` (NOT `'unsafe-eval'`) — narrow CSP keyword that permits `WebAssembly.instantiate()` but not arbitrary JS `eval()`. Chrome/Firefox/Safari all support it.
- `worker-src 'self' blob:` — Kokoro + whisper workers may be bundled as blob URLs by Vite.
- `media-src 'self' blob:` — TTS audio arrives as Blob → `URL.createObjectURL` → `<audio>` element.
- `connect-src` — **only** OpenClaw on loopback. **Critically: `huggingface.co` is NOT in the renderer CSP.** Model downloads happen in the main process (no CSP), then assets are served via custom protocol.
- Set via `session.webRequest.onHeadersReceived` in `main.ts` (NOT via meta tag) — Electron docs call HTTP header delivery "CSP's preferred delivery mechanism".

### Local GLB loading — use a custom protocol, not `file://`

The architecture doc proposed `file://` URLs for GLB/ONNX assets. **Overridden by security research** — Electron rule #18 says "avoid `file://`, use custom protocols". Replacement: register `personahub-asset://` via `protocol.handle()`:

```ts
// main.ts — TOP of file, before app.whenReady()
protocol.registerSchemesAsPrivileged([{
  scheme: 'personahub-asset',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
}]);

// Inside app.whenReady()
const ASSET_ROOTS = {
  avatars: path.join(app.getPath('userData'), 'avatars'),
  models:  path.join(app.getPath('userData'), 'models'),
};

protocol.handle('personahub-asset', async (request) => {
  const url = new URL(request.url);
  const root = ASSET_ROOTS[url.hostname];
  if (!root) return new Response('Unknown root', { status: 404 });

  const name = url.pathname.slice(1);
  if (!/^[a-f0-9-]{36}\.(glb|bin|onnx|ort)$/.test(name)) {
    return new Response('Invalid filename', { status: 400 });
  }

  const resolved = path.resolve(root, name);
  if (!resolved.startsWith(root + path.sep)) {
    return new Response('Path traversal', { status: 403 });
  }

  return net.fetch(pathToFileURL(resolved).toString());
});
```

Renderer loads GLBs via URLs like `personahub-asset://avatars/{uuid}.glb`. Strict regex + `path.resolve` re-check blocks every path-traversal pattern known.

### Remote model downloads (HuggingFace)

**Must happen in the main process, never the renderer.** This keeps `connect-src` at `'self' + loopback` only — a huge defense-in-depth win.

```ts
// electron/avatar-assets.ts
export const MODELS = {
  'kokoro-82m-q8f16': {
    url: 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/<PIN_SHA>/model_q8f16.onnx',
    sha256: '<filled_before_shipping>',
    maxSize: 95_000_000,
  },
  'kokoro-voices': { ... },
  'whisper-tiny-en-q5': { ... },
  'silero-vad-v5': { ... },
} as const;
```

Flow:
1. Renderer: `window.electronAPI.models.download('kokoro-82m-q8f16')` (whitelisted string, no URL).
2. Main: whitelist lookup; reject unknown names.
3. Main: `https.get` stream → SHA-256 hash as we write to temp file.
4. On success: atomic rename to final path. On mismatch: unlink + retry 3x exponential backoff → throw.
5. Progress events: `models:downloadProgress` IPC every 256 KB.
6. Renderer opens `personahub-asset://models/<name>.onnx`.

**Size cap**: reject any response > 200 MB. Pin URLs to commit SHAs (not `main`) to prevent silent upstream swaps.

### IPC channel surface (new)

| Channel | Input | Validation | Risk | Mitigation |
|---|---|---|---|---|
| `avatar:loadGlb` | `{personaId: UUID}` | v4 regex + `path.resolve` re-check + 50 MB size cap | Traversal, DoS | All three |
| `tts:synthesize` | `{text, voiceId}` | `text.length ≤ 2000` + voiceId whitelist | DoS | Length cap |
| `stt:transcribe` | `{audioBuffer, sampleRate}` | buffer ≤ 16 MB, sampleRate ∈ {8k,16k,22k,44k,48k} | DoS/CPU | Length cap + rate limit 1/500 ms |
| `models:download` | `{modelName}` | Hardcoded whitelist | Arbitrary URL | Whitelist |
| `models:getStatus` | — | — | Info leak (low) | none |
| `models:cancelDownload` | `{modelName}` | Whitelist | — | Whitelist |
| `mic:getState` | — | — | Low | none |

**Every handler also validates `event.senderFrame`** (rule #17). Share a `validateSender` helper.

### macOS mic entitlements

`build/entitlements.mac.plist` — add:
```xml
<key>com.apple.security.device.microphone</key><true/>
<key>com.apple.security.device.audio-input</key><true/>
```

`electron-builder.config.js` — add under `mac`:
```js
mac: {
  ...existing,
  extendInfo: {
    NSMicrophoneUsageDescription:
      'PersonaHub uses your microphone so you can speak with your AI personas. Audio is transcribed on-device and never leaves your computer.',
  },
}
```

Without these, any `getUserMedia` call on a hardened-runtime build is an immediate SIGABRT from TCC. **Not a graceful error — a hard crash.**

### Privacy statement

> **Your voice never leaves your device.** PersonaHub transcribes your speech, generates replies, and speaks them — all on your computer. The only text that is sent to the AI provider is the transcript of what you said, which is what would be sent anyway if you typed it.

Display verbatim in mic onboarding dialog + Settings → Privacy. This is the **headline trust win** from the local-first architecture.

**Do not persist voice audio to disk under any circumstances.** VAD returns `Float32Array` segments in memory → whisper reads them → garbage collected. No temp files. No debug recordings. **Do not cache TTS audio either** — re-synthesize every time (cheap on WebGPU, privacy-respecting everywhere).

### Hot-mic hygiene

- Persistent visual indicator: red dot on avatar + status-bar text + **tray icon badge**. All three go green together when mic stops. If any indicator is out of sync, fail loud.
- `window.addEventListener('blur', stopMic)` + main-side `powerMonitor.on('lock-screen'/'suspend', stopMic)`.
- Global hotkey `CmdOrCtrl+Shift+M` — force-stop mic from anywhere via `globalShortcut`.
- Default to PTT, not hands-free (D8).
- 10-minute VAD-silence auto-shutoff for hands-free mode.

### CVE audit of dependencies

| Component | Version | Known CVEs (2026-04-10) | Action |
|---|---|---|---|
| `electron` | **35.0.0** | **CVE-2026-34777** (permission handler iframe origin leak — affects <38.8.6) | **MUST upgrade** |
| `electron` | 35.0.0 | CVE-2026-34780 (contextBridge VideoFrame bypass) | Fixed by upgrade |
| `electron` | 35.0.0 | CVE-2026-34781 (`clipboard.readImage()` DoS) | Fixed by upgrade |
| `electron` | 35.0.0 | CVE-2026-34770 (PowerMonitor UAF) | **Relevant — Section 13 uses powerMonitor** |
| `three` latest | — | No open high-severity; GLTFLoader doesn't execute code | Monitor; pin version |
| `@ricky0123/vad-web` | latest | No known vulnerabilities | Vendor ONNX assets |
| `@huggingface/transformers` | v4+ | Apache 2.0 | Monitor |
| `onnxruntime-web` | latest | Monitor Chromium advisories (shares V8 JIT attack surface) | Keep updated |

**Decision: upgrade to Electron ≥38.8.6 in the same PR as the avatar feature (D1). Non-negotiable.** Shipping mic on a known-vulnerable permission handler is reckless.

---

## Cross-Cutting Insights

*Synthesized from multiple agents — this is where the value of parallel research shows up.*

### Reinforcing findings (high confidence — multiple agents independently agreed)

1. **Use `@huggingface/transformers` for whisper STT, not whisper.cpp WASM direct.** (Architecture + Integration agents both independently arrived at this conclusion.) Reason: HeadTTS already pulls `@huggingface/transformers` v4 for Kokoro, so whisper becomes free marginal cost, unifies ONNX runtime, gives WebGPU STT too. Accepted → D2.

2. **Pin `three@0.180.0` exactly.** (Architecture + Integration + Performance.) TalkingHead's `package.json` declares `^0.180.0`; mismatch produces "multiple instances of Three.js" warnings and GLTFLoader subpath incompatibilities. Do not let `pnpm update` move it.

3. **Vendor TalkingHead + HeadTTS, do not npm install.** (Architecture + Integration + Security.) Reasons compound: (a) TalkingHead is only published as an ES module import, (b) bus factor 1, so need to control updates, (c) need to patch Vite worker URLs, (d) need to add missing `dispose()`, (e) CSP demands vendored WASM assets not CDN defaults.

4. **HeadTTS output → TalkingHead `speakAudio()` with zero adapter code.** (Architecture + Integration.) Viseme codes identical (Oculus 15-code set). Word/viseme time arrays parallel. Single audio Blob shape. This is the single biggest reason to stick with the met4citizen pair vs. rolling our own.

5. **Lazy loading is non-negotiable.** (Performance + Architecture + Codebase.) Main bundle must stay under 500 KB gz. Three.js, TalkingHead, Kokoro, whisper, VAD all behind dynamic `import()`. React Suspense for fallbacks. CI guard against accidental top-level imports killing code-splitting.

6. **PTT default, hands-free opt-in.** (UI/UX + Performance + Security.) UI/UX cites 2026 industry convergence; Performance cites CPU cost of continuous VAD; Security cites hot-mic risk. All three point the same direction → D8.

7. **Every failure degrades gracefully to text chat.** (Architecture + UI/UX + Performance.) Error handling matrix in arch; quality tier fallback in performance; text-only master toggle in UI/UX. The avatar phase is a progressive enhancement, not a rewrite.

### Conflicts & trade-offs (where agents disagreed and you must decide)

| Conflict | Agent A says | Agent B says | Resolution |
|---|---|---|---|
| Asset loading protocol | Architecture: `file://` URLs are fine for bundled + custom protocol for downloaded | Security: Electron rule #18 says avoid `file://` entirely; use custom protocol for BOTH | **Security wins → use `personahub-asset://` for everything. Architecture doc should be corrected.** |
| First-audio latency target | Spec says 400–600 ms | Performance says 1.5–3.5 s realistic on low-spec WASM | **Performance wins. Target was a category error (cloud GPU competitors). Reframe as "premium voice" for low-spec (D3).** |
| Transformers.js cache location | Architecture: override `env.cacheDir` to our `userData/models/` for visibility | Let IndexedDB handle it (default) for zero effort | **Override for production — gives users a "Clear models" button and predictable disk layout. Prototype with default first.** |

### Unexpected connections

- **Emoji `avatar` field is overloaded** — existing `PersonaSettings.avatar` stores an emoji for the sidebar. The 3D GLB reference must use a new field (`avatarPreset`), not repurpose the existing one. Caught by codebase research; would have been a silent data-loss bug if missed.
- **The preload has a latent ghost-listener bug** (`preload.ts:64` doesn't return unsubscribers) — unrelated to this feature but would bite new streaming channels for TTS/STT. Fix it **at the same time** as adding avatar channels, not later. Opportunistic cleanup.
- **SOUL.md is rewritten on every persona update** (`main.ts:243`). If voice/avatar info is added to SOUL.md, it gets overwritten every edit. **Don't put presentation in the LLM prompt (D9)** unless that's a product requirement, in which case treat the added section as generated-not-editable.
- **Ready Player Me shutdown was 10 weeks ago** — original brief mentioned it but didn't absorb the implications. The GLB library is now a fixed set forever. No "upload your own RPM URL" in v1 or v2. Bundle 6–8 curated presets and lock them.
- **Electron 35 CVE + EOL + powerMonitor usage compound**: security section 13 recommends `powerMonitor.on('lock-screen')` for auto-mic-disable, and that exact API has a use-after-free CVE (CVE-2026-34770) in Electron 35. Upgrading Electron fixes permission handler CVE, powerMonitor CVE, CSP architecture, and positions us for future Chromium bumps — one decision solves four problems.
- **RPM avatars are 6K polys, not 30K.** The original brief's performance concerns were overstated by 5×. TalkingHead on integrated graphics is probably fine; the real bottlenecks are Kokoro WASM latency and memory footprint, not Three.js rendering.
- **The preload CSP restriction flows through to library defaults.** `@ricky0123/vad-web` pulls its ONNX runtime from jsdelivr by default — would require expanding `connect-src` to include CDN. Fix: vendor the assets to `public/vad/` + `public/ort/` and pass explicit base paths at init. Small change, big defense-in-depth win.

---

## Risks & Mitigations (Merged, Sorted by Severity)

| # | Risk | Source | Severity | Likelihood | Mitigation |
|---|---|---|---|---|---|
| 1 | Mic crashes app on macOS due to missing `NSMicrophoneUsageDescription` (SIGABRT) | Security | **Critical** | **Certain on first build** | Add entitlements + `extendInfo` in Phase 0 |
| 2 | Electron 35 CVE-2026-34777 in the exact permission handler we need | Security | **Critical** | Medium | Upgrade to ≥38.8.6 in same PR (D1) |
| 3 | No CSP → any XSS is full data exfiltration | Security | **Critical** | Low (renderer only loads our bundle) | Install strict CSP via `webRequest.onHeadersReceived` |
| 4 | Hot mic records without user knowledge | Security + UI/UX | **High** | Low (with indicators) | Persistent indicator + auto-disable on blur/lock + PTT default + hard timeout + `CmdOrCtrl+Shift+M` kill hotkey |
| 5 | 400–600 ms latency target unachievable on low-spec WASM | Performance | **High** | Certain | Reframe as premium voice (D3); default low-spec to text + Web Speech API; pre-synth first sentence; warm Kokoro eagerly |
| 6 | RPM CDN is dead — runtime GLB fetches fail | Performance | **High** | Certain | Bundle 6–8 preset GLBs inside `app.asar` (D6); no "upload your own" in v1 |
| 7 | Memory pressure on 8 GB machines (~1.1–1.7 GB active RSS) | Performance | **High** | Medium | Unload idle models after 5 min; soft-warn `deviceMemory <= 8`; per-worker thread caps |
| 8 | Path traversal via `personaId` IPC inputs | Security | **High** | Low | UUID v4 regex + `path.resolve` re-check |
| 9 | Model download MITM or HF account compromise | Security | **High** | Very low | Pin URLs to commit SHA + hardcoded SHA-256 verification |
| 10 | WebGPU not available on Intel UHD 620/630 (inconsistent blocklist) | Performance | **Medium** | Medium | Treat WASM as default path. Don't force `enable-unsafe-webgpu`. |
| 11 | ort-web WASM binary is 19.5 MB (10× current bundle) | Performance | **Medium** | Certain | Bundle inside `app.asar`, never fetch from CDN |
| 12 | TalkingHead has no `dispose()` — GL context leaks on persona switch | Architecture + Integration | **Medium** | Medium | Manual scene-graph walk + geometry/material/texture dispose on unmount; verify with memory monitor in dev |
| 13 | Concurrent TTS+STT+Three.js oversubscribes CPU threads on 4-thread laptops | Performance | **Medium** | Medium | Explicit `numThreads` caps: Kokoro=2, whisper=1, main thread free |
| 14 | Chromium AEC bug causes avatar audio feedback into mic | Architecture | **Medium** | High during hands-free | Pause VAD while speaking in v1 (D4); loopback hack or TalkingHead fork for v2 |
| 15 | TTS slower than LLM → queue overflow | Architecture | **Medium** | Low | Unbounded ref queue (drains naturally); cancel on interruption |
| 16 | Malicious oversized GLB → GPU OOM crash | Security | **Medium** | Low | 50 MB cap in `avatar:loadGlb` IPC handler |
| 17 | IPC flooding via rapid `tts:synthesize` | Security | **Medium** | Low | Rate limit 1 per 500 ms per window |
| 18 | `db.query` preload surface allows raw SQL from renderer | Security | **Medium** | Low | **Pre-existing; out of scope, flagged for follow-up** |
| 19 | Preload `onResponse` returns no unsubscriber → ghost listeners | Codebase | **Medium** | Medium | Fix at same time as new avatar channels (opportunistic) |
| 20 | Bundle splitting defeated by stray top-level import | Performance | **Medium** | Medium | CI grep: main chunk > 500 KB gz OR contains "three"/"kokoro"/"onnxruntime" → fail |
| 21 | Electron StrictMode double-mount leaks WebGL contexts | Architecture | **Low** | Medium | Guard init with `initialised` ref; test in StrictMode dev mode |
| 22 | CSP regression — someone adds `unsafe-eval` | Security | **Low** | Medium | CI grep `dist/` for `unsafe-eval`; fail build |
| 23 | `sandbox: false` accidentally introduced | Security | **Low** | Low | CI grep fail on `sandbox: false`, `nodeIntegration: true`, `webSecurity: false` |
| 24 | `noUncheckedIndexedAccess: true` fights TalkingHead example code | Codebase | **Low** | Certain (1–2 hours) | Budget time to add `?`/`!` operators when vendoring |
| 25 | Installer size jump (~170 MB → ~207 MB) | Performance | **Low** | Certain | Release-note it; not a blocker |

---

## Open Questions

Things where the research couldn't give a definitive answer — needs user judgment, upstream source reading, or real-hardware validation.

### Needs user decision (from D1–D10 above)
Every item in the "Decisions Requiring User Input" section at the top. Not repeating here.

### Needs upstream verification (source reading or small spike)

1. **Does TalkingHead have a `dispose()` method or cleanup flow?** Architecture + Integration both flagged this. README doesn't document one. Action: grep the actual `modules/talkinghead.mjs` for `dispose`, `destroy`, `stop`, `cleanup`. If missing, either PR upstream or add cleanup to the vendored copy.

2. **HeadTTS worker instantiation format — does it need a Vite patch?** HeadTTS spawns `headtts-worker.mjs` internally. If it uses `new Worker(url, {type:'module'})` with a string path, Vite's AST scanner won't fingerprint the worker file. Needs source inspection before spec writing. May need to patch vendored copy or use the `workerModule` constructor option.

3. **Transformers.js cache location in Electron.** The v3 `env.cacheDir` override is documented for Node environments; browser/renderer cache location is less clear. Needs a 30-minute prototype to confirm we can point it at `userData/assets/models/` in Electron renderer context, or whether we have to accept IndexedDB default.

4. **React StrictMode double-mount behavior with TalkingHead.** Need to verify whether the `forwardRef + useImperativeHandle` pattern handles double-invocation cleanly or leaks a GL context. A 15-minute dev test during Phase 1.

### Needs real-hardware validation

5. **WebGPU enablement on Intel UHD 620/630 in Chromium 134 (Electron 35/38).** Chromium's blocklist is opaque. Only reliable check is `chrome://gpu` on actual hardware. If we commit to the "low-spec opt-in voice" framing, we need to know empirically what percentage of our target users actually get WebGPU vs. forced WASM fallback. One afternoon on 2–3 real UHD 620 laptops.

6. **Kokoro WASM latency on Intel i5-7200U.** Published numbers are extrapolations from Pixel 6a and M-series Macs. The HN thread's worst case was RTF ~7.5 on mobile ARM. We should bench a q8f16 cold-start sentence synthesis on real low-spec hardware before committing to the 1.5–3.5 s estimate.

7. **Whisper-tiny accent accuracy.** Research used published benchmarks. For actual PersonaHub users (including non-native English speakers), we should run a 10-sample benchmark across accented English before committing to `whisper-tiny.en`. If accuracy is too low, `whisper-base.en` (57 MB q5_1) is the fallback — at ~2× the download cost.

8. **TalkingHead actual FPS on UHD 620 with 6K-poly RPM avatar.** Performance section estimates 24–30 fps. The three.js forum has one anecdote of "extremely low fps" with Draco GLB on UHD 620, but TalkingHead's case is simpler (static camera, single avatar, no physics). Need to verify empirically before claiming it works.

---

## Recommended Implementation Order

Reshaped from the original 5-phase plan to add Phase 0 and reframe Phase 5.

### Phase 0 — Platform Hygiene (NEW, blocker — ~1 day)

**Goal**: fix the security baselines this feature makes load-bearing. None of the Phase 1+ work should be attempted on top of an Electron version with a permission-handler CVE, no CSP, and no mic entitlements.

- Upgrade Electron 35.0.0 → ≥38.8.6 (D1)
- Install strict CSP via `session.webRequest.onHeadersReceived` in `main.ts`
- Add `NSMicrophoneUsageDescription` to `electron-builder.config.js`
- Add mic entitlements to `build/entitlements.mac.plist`
- Add `setPermissionRequestHandler` + `setPermissionCheckHandler` (deny everything except `media` from our origin)
- Add `setWindowOpenHandler` + `will-navigate` guards
- Register `personahub-asset://` custom protocol scheme (even before it's used)
- Fix the `preload.ts:64` ghost-listener bug (opportunistic, related)
- CI guards: fail on `unsafe-eval`, `sandbox: false`, `nodeIntegration: true`, `webSecurity: false`

**Ship gate**: Electron version bumped, CSP violations = 0 in dev mode, mac build runs without crash, `chrome://gpu` (via devtools) shows expected renderer.

### Phase 1 — Static 3D Head (1–2 days)

**Goal**: confirm Three.js renders a GLB inside Electron at reasonable fps. De-risks the entire downstream pipeline.

- `pnpm add three@0.180.0` (pinned exact)
- Clone TalkingHead to `src/vendor/talkinghead/` at v1.7.0
- Add TypeScript declaration file for the vendored module
- Download 2–3 Ready Player Me test GLBs with `?morphTargets=ARKit,Oculus Visemes`, commit to `public/avatars/`
- Create `src/components/AvatarHead.tsx` with the forwardRef + useRef + useImperativeHandle pattern
- Wire into `ChatWindow.tsx:215` between header and `<ChatMessages>`
- Collapse chevron toggle in header
- `prefers-reduced-motion` support from day 1
- Verify: avatar visible, idle animations play, ~30 fps, no console errors, no WebGL context leaks on persona switch (manual memory check with DevTools)

**Ship gate**: can see a 3D head rendering in the chat window at 30 fps on an M1 dev machine. Avatar switches cleanly between personas. `<AvatarHead>` cleanup passes manual leak check.

### Phase 2 — TTS + Lip Sync (2–3 days)

**Goal**: persona responses speak aloud with lip sync.

- `pnpm add @huggingface/transformers` (D2)
- Clone HeadTTS to `src/vendor/headtts/`
- Create `src/lib/tts-kokoro.ts` wrapping HeadTTS client
- Create `src/lib/sentence-chunker.ts` (regex-based stateful buffer)
- Create `src/hooks/useAvatarTTS.ts` owning the queue + cancel counter in refs
- Wire TTS trigger at `useChat.ts:74` (the single one-line plug-in point)
- Implement `electron/avatar-assets.ts` for Kokoro model download (main process, with SHA-256 verification, whitelist)
- Bundle ort-web WASM in `public/ort/` via `vite-plugin-static-copy`
- Audio output routing via plain `<audio>` element where possible (AEC mitigation preparation)
- `AssetDownloadModal` React component for first-run progress
- Persona `voiceId` setting + picker in `PersonaSettingsPanel.tsx`

**Ship gate**: assistant messages speak aloud through Kokoro voice with visible lip sync; first-run download flow works; UI gracefully shows download progress and failure retry.

### Phase 3 — Voice Input (2–3 days)

**Goal**: user can hold the mic button or use hands-free VAD to speak to the persona.

- `pnpm add @ricky0123/vad-react @ricky0123/vad-web`
- Vendor VAD + Silero ONNX assets to `public/vad/` (NOT jsdelivr default)
- Create `src/hooks/useVoiceInput.ts` wrapping `useMicVAD`
- Create `src/lib/stt-whisper.ts` using `@huggingface/transformers` whisper-tiny.en
- Create `whisper.worker.ts` for off-main-thread transcription
- `VoiceButton` component integrated into `ChatInput.tsx:50-52`
- Space-hold PTT in textarea; `CmdOrCtrl+Shift+M` global hotkey
- **Hot-mic hygiene**: persistent red indicator + `powerMonitor` listeners + auto-disable on blur + 10-min auto-shutoff
- **AEC workaround**: pause VAD while avatar is speaking (D4)
- Custom permission dialog wrapping OS prompt
- Privacy copy in Settings → Privacy

**Ship gate**: user can hold mic button, speak, release, see transcribed text auto-send; voice conversation works end-to-end without echo feedback loop; mic indicator is always in sync.

### Phase 4 — Per-Persona Avatars & Voices (1–2 days)

**Goal**: each persona has its own face and voice.

- Add `avatarPreset`, `voiceId`, `voiceSpeed`, `lipSyncEnabled` to `PersonaSettings` (zero migration)
- Avatar picker grid (8 curated RPM presets) in `ChatSidebar.tsx` creation modal + `PersonaSettingsPanel.tsx` edit
- Voice picker radio list (grouped by gender, inline preview) in same locations
- Deterministic default voice picker based on persona name hash
- Load correct GLB + voice when persona is selected
- Per-persona GLB files stored in `~/Library/Application Support/personahub-desktop/avatars/{personaId}.glb` served via `personahub-asset://`

**Ship gate**: every persona has a unique face and voice; switching personas swaps both seamlessly; deletion cleans up the GLB file.

### Phase 5 — Low-Spec Framing & Polish (2–3 days)

**Goal**: runs acceptably on Intel UHD 620 + 8 GB, with honest product framing about what "acceptable" means.

- Global `Settings → Graphics` section
- Quality presets (Low/Medium/High/Custom) with one-time hardware benchmark on first launch
- "Enable 3D avatars" + "Enable voice features" master toggles (text-only escape hatch)
- **Web Speech API TTS** as instant-latency alternative for low-spec users (D3)
- `navigator.deviceMemory <= 8` soft warning banner
- Battery-aware auto-pause (`navigator.getBattery`)
- Background-tab throttle (freeze Three.js rAF when hidden)
- CPU usage pill in Settings
- Unload idle models after 5 min inactivity
- Real-hardware benchmark on 2–3 low-spec Windows PCs
- CI performance budget enforcement (main chunk < 500 KB gz; grep for accidental top-level imports)

**Ship gate**: works on an Intel UHD 620 + 8 GB Windows laptop; fans don't melt; low-spec users can still chat in text-only mode without friction; honest product copy about what "voice mode" means on their hardware.

**Total estimate (revised)**: **9–14 days** (was 8–13 in the original brief — +1 day for Phase 0 platform hygiene).

---

## Sources

### Codebase files referenced

- `personahub-desktop/src/hooks/useChat.ts` (critical: line 74 TTS trigger)
- `personahub-desktop/src/components/ChatWindow.tsx` (line 215–218 avatar slot)
- `personahub-desktop/src/components/ChatInput.tsx` (line 50–52 mic button slot)
- `personahub-desktop/src/components/ChatMessages.tsx`
- `personahub-desktop/src/components/ChatSidebar.tsx` (lines 371–502 creation modal)
- `personahub-desktop/src/components/PersonaSettingsPanel.tsx` (lines 160–459 edit panel pattern)
- `personahub-desktop/src/components/SetupWizard.tsx`
- `personahub-desktop/src/types/index.ts` (line 31–37 `PersonaSettings`)
- `personahub-desktop/electron/main.ts` (line 62–75 BrowserWindow config; 181–376 IPC handlers; 512 renderer-bound streaming)
- `personahub-desktop/electron/preload.ts` (line 64–66 ghost-listener bug)
- `personahub-desktop/electron/openclaw-client.ts` (line 172–267 SSE streaming)
- `personahub-desktop/electron/openclaw-manager.ts` (line 253–263 cleanup — no download pattern exists)
- `personahub-desktop/electron-builder.config.js` (line 12–21 packaging, missing mic entitlements)
- `personahub-desktop/build/entitlements.mac.plist` (missing mic entries)
- `personahub-desktop/vite.config.ts` (plugin-electron config)
- `personahub-desktop/tsconfig.json` (`noUncheckedIndexedAccess: true`)
- `personahub-desktop/db/schema.sql` (persona_configs — no migration needed)
- `personahub-desktop/db/local-db.ts` (line 47–70 rowToPersona; 243–300 upsertPersona)
- `personahub-desktop/openclaw/config-factory.ts` (line 75–126 buildSoulMd)
- `personahub-desktop/openclaw/agent-bridge.ts` (line 32–35 response accumulator)
- `personahub-desktop/security/path-validator.ts` (existing — not directly reusable for assets)
- `personahub-desktop/index.html` (no CSP meta tag confirmed)

### External sources

**Libraries**:
- [met4citizen/TalkingHead](https://github.com/met4citizen/TalkingHead) — main avatar library
- [met4citizen/TalkingHead modules](https://github.com/met4citizen/TalkingHead/tree/main/modules)
- [met4citizen/HeadTTS](https://github.com/met4citizen/HeadTTS) — Kokoro wrapper
- [onnx-community/Kokoro-82M-v1.0-ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX)
- [onnx-community/Kokoro-82M-v1.0-ONNX-timestamped](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX-timestamped)
- [hexgrad/Kokoro-82M VOICES.md](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md)
- [ricky0123/vad](https://github.com/ricky0123/vad) + [vad docs](https://docs.vad.ricky0123.com/)
- [ricky0123/vad issue #128 (Vite config)](https://github.com/ricky0123/vad/issues/128)
- [ggml-org/whisper.cpp](https://github.com/ggml-org/whisper.cpp) + [WASM example](https://github.com/ggml-org/whisper.cpp/tree/master/examples/whisper.wasm)
- [ggerganov/whisper.cpp HF](https://huggingface.co/ggerganov/whisper.cpp/tree/main)
- [xenova/whisper-web](https://github.com/xenova/whisper-web)
- [@huggingface/transformers docs](https://huggingface.co/docs/transformers.js) + [v3 blog](https://huggingface.co/blog/transformersjs-v3)
- [kokoro-js npm](https://www.npmjs.com/package/kokoro-js)
- [snakers4/silero-vad releases](https://github.com/snakers4/silero-vad/releases)
- [Ready Player Me morph targets](https://docs.readyplayer.me/ready-player-me/api-reference/avatars/morph-targets/oculus-ovr-libsync)
- [Ready Player Me optimize docs](https://docs.readyplayer.me/ready-player-me/integration-guides/web-and-native-integration/optimize)
- [RPM ARKit + Oculus visemes forum](https://forum.readyplayer.me/t/downloading-an-avatar-glb-with-arkit-and-oculus/3665)

**Competitors / references**:
- [Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber) + [docs](http://docs.llmvtuber.com/en/docs/user-guide/frontend/electron/)
- [moeru-ai/airi](https://github.com/moeru-ai/airi)
- [Character.AI voice FAQ](https://support.character.ai/hc/en-us/articles/23957274129691)
- [Replika showcase](https://screensdesign.com/showcase/replika-ai-friend)
- [Pi (Inflection AI)](https://pi.ai/)
- [ChatGPT voice features](https://chatgpt.com/features/voice/)
- [Claude voice help](https://support.claude.com/en/articles/11101966-using-voice-mode)
- [HeyGen Interactive Avatar guide](https://atlas-kb.com/atlas-4cwembs21w/articles/931521-interactive-avatar-101-your-ultimate-guide)
- [a16z on AI avatars](https://a16z.com/ai-avatars/)
- [SmoothUI Siri Orb](https://smoothui.dev/docs/components/siri-orb)
- [Neuro-sama wiki](https://neurosama.fandom.com/wiki/Neuro-sama)

**Electron security**:
- [Electron Security Tutorial](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron session API](https://www.electronjs.org/docs/latest/api/session)
- [Electron protocol API](https://www.electronjs.org/docs/latest/api/protocol)
- [Electron 35 release](https://www.electronjs.org/blog/electron-35-0) / [v35.0.0 release notes](https://releases.electronjs.org/release/v35.0.0)
- [Electron powerMonitor](https://www.electronjs.org/docs/latest/api/power-monitor)
- [Electron globalShortcut](https://www.electronjs.org/docs/latest/api/global-shortcut)
- [CVE-2026-34777](https://advisories.gitlab.com/pkg/npm/electron/CVE-2026-34777/) / [-34780](https://advisories.gitlab.com/pkg/npm/electron/CVE-2026-34780/) / [-34781](https://advisories.gitlab.com/pkg/npm/electron/CVE-2026-34781/) / [-34770](https://advisories.gitlab.com/pkg/npm/electron/CVE-2026-34770/) / [-34765](https://advisories.gitlab.com/pkg/npm/electron/CVE-2026-34765/)
- [BigBinary: Electron mic permission](https://www.bigbinary.com/blog/request-camera-micophone-permission-electron)
- [electron-builder issue #7514](https://github.com/electron-userland/electron-builder/issues/7514)

**Web platform / CSP / WebGPU**:
- [MDN CSP script-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/script-src)
- [MDN CSP worker-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/worker-src)
- [WebAssembly CSP proposal](https://github.com/WebAssembly/content-security-policy/blob/main/proposals/CSP.md)
- [MDN AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
- [Chromium WebGPU troubleshooting](https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips)
- [caniuse WebGPU](https://caniuse.com/webgpu)
- [Chromium bug 687574 (AEC + Web Audio)](https://bugs.chromium.org/p/chromium/issues/detail?id=687574)
- [focused.io AEC workaround](https://focused.io/lab/echo-cancellation-with-web-audio-api-and-chromium)
- [Electron issue 47043 (echoCancellation)](https://github.com/electron/electron/issues/47043)
- [Three.js multiple instances warning](https://discourse.threejs.org/t/warning-multiple-instances-of-three-js-being-imported/24191)
- [Three.js UHD 620 perf thread](https://discourse.threejs.org/t/three-js-performance-on-intel-uhd-620-graphics/24676)
- [onnxruntime-web discussion #24161 (19.5 MB WASM)](https://github.com/microsoft/onnxruntime/discussions/24161)
- [Kokoro WebGPU HN thread](https://news.ycombinator.com/item?id=42973769)
- [DigiAlps Kokoro WebGPU benchmark](https://digialps.com/kokoro-webgpu-real-time-text-to-speech-running-100-locally-in-your-browser/)
- [whisper.cpp issue #89 benchmarks](https://github.com/ggml-org/whisper.cpp/issues/89)
- [Phoronix whisper.cpp 1.8.3](https://www.phoronix.com/news/Whisper-cpp-1.8.3-12x-Perf)
- [Dzianis Vashchuk whisper.cpp benchmark](https://medium.com/@dzianisv/new-to-ai-whisper-cpp-benchmarking-on-my-hardware-3fdf1c967516)
- [Vite features — workers + WebAssembly](https://vite.dev/guide/features.html)
- [Bundlephobia three](https://bundlephobia.com/api/size?package=three)

**Internal references**:
- `specs/ai-avatar-research-2026.md` — original 636-line handoff brief this research builds on

---

*End of unified research brief. Ready for spec creation.*
