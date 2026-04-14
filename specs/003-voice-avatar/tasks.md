# Tasks: Voice & Avatar Phase — Production-Ready

## User Story → Phase Mapping

| Story | Name | Phase | Priority |
|---|---|---|---|
| US1 | First voice moment | Phase 3 (Week 1) | P1 |
| US9 | Text-only preference | Phase 3 (Week 1) | P1 |
| US11 | Mid-conversation interruption | Phase 3 (Week 1) | P1 |
| US5 | Offline traveler | Phase 3 (Week 1) | P1 |
| US7 | Power user with API keys | Phase 4 (Week 1) | P1 |
| US8 | Low-spec laptop user | Phase 3 (Week 1) | P1 |
| US12 | Microphone denial | Phase 5 (Week 2) | P2 |
| US2 | Hands-free conversation | Phase 5 (Week 2) | P2 |
| US4 | Privacy-first user | Phase 5 (Week 2) | P2 |
| US6 | Accessible use | Phase 6 (Week 2) | P2 |
| US3 | Distinct personas | Phase 7 (Week 3) | P3 |
| US10 | Custom persona creation | Phase 7 (Week 3) | P3 |
| US13 | Shared machine | Phase 7 (Week 3) | P3 |
| US14 | Undo accidental voice change | Phase 7 (Week 3) | P3 |
| US15 | Replay last spoken reply | Phase 7 (Week 3) | P3 |

---

## Phase 1: Setup

**Goal**: Project initialized, dependencies installed, prerequisites verified, test infrastructure ready.

- [x] T001 Upgrade `openclaw` from `2026.3.2` to `>=2026.4.7` in `personahub-desktop/package.json` and run `pnpm install`
- [x] T002 Verify existing chat features (sendMessage, generatePrompt, gateway startup) still work after OpenClaw upgrade
- [x] T003 Verify `asarUnpack` glob in `personahub-desktop/electron-builder.config.js` line 18 matches new OpenClaw package layout
- [x] T004 Refactor `personahub-desktop/electron/preload.ts` — make all 7 `ipcRenderer.on()` calls (lines 19, 42, 64, 67, 83, 86, 122) return cleanup functions: `() => ipcRenderer.removeListener(channel, handler)`
- [x] T005 Update `personahub-desktop/src/hooks/useChat.ts` line 99 to use real cleanup from the fixed preload pattern instead of `as unknown as () => void` cast
- [x] T006 Install React test deps: `pnpm add -D @testing-library/react @testing-library/jest-dom jsdom`
- [x] T007 Update `personahub-desktop/vitest.config.ts` — add `environment: 'jsdom'` for component/hook tests
- [x] T008 Write and run a trivial React hook test to verify jsdom environment works
- [x] T009 Install accessibility audit: `pnpm add -D @axe-core/cli` and add `"test:a11y"` script to `personahub-desktop/package.json`
- [x] T010 Create directory `personahub-desktop/src/lib/speech/`
- [x] T011 Create directory `personahub-desktop/src/lib/speech/__tests__/`
- [x] T012 Capture current cold-start baseline time, installer size, and renderer memory baseline (record in a `BASELINES.md` file at `specs/003-voice-avatar/BASELINES.md`)
- [x] T013 Confirm `window.speechSynthesis` works in Electron 35 dev environment (quick devtools console test, document result)

---

## Phase 2: Foundational (blocking prerequisites for all user stories)

**Goal**: Core voice infrastructure that every user story depends on — TTS router, Web Speech fallback, text normalizer, voice event log, IPC channels.

- [x] T014 Add `generateSpeech(text, voiceId, provider)` to `personahub-desktop/electron/openclaw-client.ts` — model after existing `generatePrompt()` at lines 409-482 but handle binary response (do NOT use `res.setEncoding('utf-8')`, collect as `Buffer[]`, convert to `ArrayBuffer`)
- [x] T015 Register IPC channel `tts:synthesize` in `personahub-desktop/electron/main.ts` before `setupIPC()` closing brace (line 468) — validate sender frame, validate text ≤ 2000 chars, call `generateSpeech`, return ArrayBuffer
- [x] T016 Create `personahub-desktop/electron/ipc-validation.ts` — `validateSender(event)` helper verifying `senderFrame` matches main window, reusable across all new channels
- [x] T017 Expose `window.electronAPI.tts.synthesize()` in `personahub-desktop/electron/preload.ts` with proper cleanup return function
- [x] T018 Add `tts` group to `ElectronAPI` interface in `personahub-desktop/src/types/index.ts`
- [x] T019 Extend `PersonaSettings` interface in `personahub-desktop/src/types/index.ts` with `voiceEnabled?`, `voiceProvider?`, `voiceId?`, `voiceSpeed?`, `avatarEnabled?`, `avatarStyleId?`, `avatarAccentHue?`
- [x] T020 [P] Create `personahub-desktop/src/lib/speech/useSpeechSynthesis.ts` — Web Speech API hook: handle `voiceschanged` race, filter `localService === true`, per-persona rate/pitch via hash, expose `speak(text)`, `cancel()`, `isSpeaking`, `currentWord` from boundary events
- [x] T021 [P] Create `personahub-desktop/src/lib/speech/textNormalizer.ts` — strip Markdown, replace URLs with "link", code fences with "code block", skip empty/whitespace-only, cap at 2000 chars
- [x] T022 [P] Create `personahub-desktop/src/lib/speech/voiceEventLog.ts` — append-only local log, 7-day retention, auto-prune on start, no PII/audio/keys/text, structured events per data-model.md
- [x] T023 Create `personahub-desktop/src/lib/speech/ttsRouter.ts` — cloud-first fallback chain: try cloud via IPC `tts:synthesize` → retry with exponential backoff (3 attempts) → fall back to `useSpeechSynthesis` → silent with caption-only. Session flap guard (max 5 transitions). Common interface: `speak(text, personaId)`, `cancel()`, `onStart`, `onBoundary`, `onEnd`
- [x] T024 Extend `useChat` hook at `personahub-desktop/src/hooks/useChat.ts` — add optional `onAssistantDone?: (content: string, personaId: string) => void` callback parameter, called at line 67 inside `chunk.done` branch
- [x] T025 [P] Create `personahub-desktop/src/lib/speech/__tests__/mocks.ts` — `mockSpeechSynthesis()`, `mockElectronTTS()`, `mockMediaDevices()`, `mockUseMicVAD()` following existing `vi.mock()` pattern
- [x] T026 [P] Create `personahub-desktop/src/lib/speech/__tests__/worker-mock.ts` — mock Worker class intercepting `postMessage`/`onmessage`, `vi.stubGlobal('Worker', MockWorker)`

---

## Phase 3: Voice Output + Face (US1, US9, US11, US5, US8 — Week 1 core)

**Goal**: Personas speak their replies aloud with a 2D animated face. Text-only users unaffected. Interruption works. Offline falls back. Low-spec is fine.

**Independent test criteria**: Send a message → persona speaks the reply → face animates → caption shows. Can be tested without mic/STT/per-persona pickers.

### Avatar Face

- [x] T027 [P] [US1] Create `personahub-desktop/src/components/AvatarFace.tsx` — SVG face with forwardRef, states (idle/thinking/speaking/listening/error/initializing), amplitude-driven mouth, CSS blink + breathing, `prefers-reduced-motion` support, `aria-label`, responsive min-height 240px, dark-palette hex colors extracted as constants
- [x] T028 [P] [US1] Implement 6 face style variants in `AvatarFace.tsx` via `styleId` prop: face-warm, face-cool, face-playful, face-serious, face-gentle, face-bold (varied proportions/features per data-model.md)
- [x] T029 [P] [US1] Add state transition CSS: 200ms `transition` on ring color, ring opacity, mouth ry, eye position; instant (0ms) under `prefers-reduced-motion`

### Voice Output Hook

- [x] T030 [US1] Create `personahub-desktop/src/hooks/useVoiceOutput.ts` — instantiate ttsRouter, receive `onAssistantDone` from useChat, call `ttsRouter.speak(normalizedText, personaId)`, expose `isSpeaking`, `currentAmplitude`, `currentWord`, `cancel()`. Handle persona switch → cancel. Handle persona delete/edit mid-speech → immediate stop.

### Chat Window Wiring

- [x] T031 [US1] Redesign persona header in `personahub-desktop/src/components/ChatWindow.tsx` lines 208-215 as two-part flex row: left = avatar+name+state badge, right = provider indicator + CC toggle + collapse chevron + stop button
- [x] T032 [US1] Insert collapsible `<AvatarFace>` band between redesigned header and `<ChatMessages>` in `ChatWindow.tsx` (between line 215 and 218). Default collapsed on first use. Auto-collapse when window height < 600px. Ensure ChatMessages always has ≥200px visible.
- [x] T033 [US1] Add caption strip below face band in `ChatWindow.tsx` — 32px, `text-sm text-gray-300`, centered, `truncate`, `aria-live="polite"`, fade-in `transition-opacity duration-200`, 2-second clear delay after speech ends, hidden when face collapsed
- [x] T034 [US11] Wire interruption in `personahub-desktop/src/components/ChatInput.tsx` — on `handleSend()`: call `voiceOutput.cancel()` AND `window.electronAPI.agent.stopGeneration(personaId)` to cancel both TTS and in-flight LLM stream
- [x] T035 [US1] Add Stop Voice button in ChatWindow header — visible when `isSpeaking`, silences within 200ms, does NOT send any message

### Error Handling & Fallback

- [x] T036 [US5] Implement cloud → Web Speech fallback in `ttsRouter.ts` — detect network failure / gateway unavailable within 2 seconds, show small health indicator, auto-retry gateway in background
- [x] T037 [US8] Implement text normalization in `ttsRouter.speak()` — call `textNormalizer` before any provider. Captions show normalized text, chat transcript shows original.
- [x] T038 [US5] Handle `speechSynthesis.getVoices()` returning empty — retry/poll for `voiceschanged` event before declaring unavailable
- [x] T039 [US1] Handle all-tiers-unavailable (no key, no OS voices, no mic) — auto-enable captions, show single-screen explanation with recovery actions per provider

### First-Run Experience

- [x] T040 [US1] Detect first launch with voice feature → show `react-hot-toast` notification: "Voice is now available! Configure in Settings → Voice & Avatar"
- [x] T041 [US1] Add macOS Siri Enhanced voice hint in toast or Settings: "For higher-quality voices on macOS, install Siri Enhanced voices in System Settings → Accessibility → Spoken Content"

### Testing (Week 1)

- [x] T042 [P] Write unit tests for `ttsRouter` in `personahub-desktop/src/lib/speech/__tests__/ttsRouter.test.ts` — mock cloud IPC + Web Speech, test fallback chain, cancel, retry policy, session flap guard, rate limiting
- [x] T043 [P] Write unit tests for `textNormalizer` in `personahub-desktop/src/lib/speech/__tests__/textNormalizer.test.ts` — empty, whitespace, URL, code, Markdown, emoji, 50KB input, 2000-char cap
- [x] T044 [P] Write unit tests for `voiceEventLog` in `personahub-desktop/src/lib/speech/__tests__/voiceEventLog.test.ts` — append, prune, redaction
- [x] T045 [P] Write unit tests for `useSpeechSynthesis` in `personahub-desktop/src/lib/speech/__tests__/useSpeechSynthesis.test.ts` — voiceschanged race (before/after/never), localService filter, per-persona variation deterministic, cancel, boundary events
- [x] T046 [P] Write unit tests for `useVoiceOutput` state machine in `personahub-desktop/src/hooks/__tests__/useVoiceOutput.test.ts` — each transition in VoiceSession diagram, interrupt clears audio within 200ms mock
- [x] T047 Write unit test for `PersonaSettings` extension — new fields serialize/deserialize through `rowToPersona` at `personahub-desktop/db/local-db.ts`
- [x] T048 Manual test matrix Week 1: macOS no-key, macOS with OpenAI key, Windows 11 no-key, offline fallback, persona switch mid-speech, rapid-fire 5 messages, face collapsed, reduced-motion, keyboard-only navigation
- [x] T049 Measure cold-start, installer size, memory, CPU against baselines recorded in T012

---

## Phase 4: Settings UI + Provider Config (US7 — Week 1 continued)

**Goal**: Users can configure cloud TTS providers with API keys, preview voices, manage cost.

**Independent test criteria**: Open Settings → Voice & Avatar → enter API key → preview plays → cost estimate shown.

- [x] T050 [US7] Create `personahub-desktop/electron/voice-key-store.ts` — per-provider encrypted files (`voice-key-{providerId}.enc`) using `safeStorage.encryptString`/`decryptString`. Model after existing `secure-store.ts` lines 18-64.
- [x] T051 [US7] Register IPC channels `voice:storeKey`, `voice:getKey`, `voice:deleteKey` in `personahub-desktop/electron/main.ts` with sender validation and rate limiting
- [x] T052 [US7] Implement GlobalVoicePrefs persistence as JSON file at `userData/voice-prefs.json`. Create IPC channels `voice:getPrefs` / `voice:setPrefs` in `personahub-desktop/electron/main.ts`
- [x] T053 [US7] Extend `Settings.tsx` `Section` component (line 206) with optional `collapsible` + `defaultOpen` props, localStorage-persisted state
- [x] T054 [US7] Create Voice & Avatar section in `personahub-desktop/src/components/Settings.tsx` — subsections: Output (enable toggle, provider dropdown, voice dropdown, speed slider 0.5-2.0, preview button), Face (enable toggle, default style picker grid), Providers & Keys (API key fields per provider, test button, cost estimate), Privacy (local-only toggle, privacy statement text), Captions toggle, reduced-motion override, auto-stop-on-blur toggle, monthly spending ceiling per provider
- [x] T055 [US7] Implement Run Diagnostics button in Settings — check secure store, gateway, cloud provider auth, OS voices per `contracts/ipc-channels.md` `voice:diagnostics` contract
- [x] T056 [US7] Implement cost governance in `ttsRouter.ts` — monthly ceiling + daily cap per provider, auto-fallback to OS-native on cap hit, 80% warning via `react-hot-toast`
- [x] T057 [P] Write unit tests for `voice-key-store` in `personahub-desktop/electron/__tests__/voice-key-store.test.ts` — store, get, delete, unavailable store
- [x] T058 [P] Write unit tests for cost governance — monthly ceiling, daily cap, 80% warning, stuck-loop simulation, counter reset

---

## Phase 5: Voice Input + Security (US2, US4, US12 — Week 2)

**Goal**: Users can talk to personas via push-to-talk. Full mic permission handling. Security hardened.

**Independent test criteria**: Hold mic button → speak → release → transcribed text in input → user sends → persona replies with voice.

### Electron Upgrade + Security

- [x] T059 Upgrade `electron` from `^35.0.0` to `^38.8.6` in `personahub-desktop/package.json`, run `pnpm install`, verify existing app builds and runs
- [x] T060 Add `session.defaultSession.setPermissionRequestHandler` in `personahub-desktop/electron/main.ts` — accept `media` from our origin only
- [x] T061 Add `session.defaultSession.setPermissionCheckHandler` in `personahub-desktop/electron/main.ts`
- [x] T062 Install CSP via `session.defaultSession.webRequest.onHeadersReceived` in `personahub-desktop/electron/main.ts` — strict policy per spec FR-8 #82 (with dev-mode Vite HMR exception)
- [x] T063 Add mic entitlements to `personahub-desktop/build/entitlements.mac.plist` — `com.apple.security.device.microphone` + `audio-input`
- [x] T064 Add `NSMicrophoneUsageDescription` to `personahub-desktop/electron-builder.config.js` under `mac.extendInfo`
- [x] T065 Add `entitlements` and `entitlementsInherit` fields to `mac` section of `electron-builder.config.js` (after line 26)
- [x] T066 Add `setWindowOpenHandler(() => ({ action: 'deny' }))` and `will-navigate` guard in `personahub-desktop/electron/main.ts`
- [x] T067 Verify CSP violations = 0 in devtools console after all changes

### STT + VAD Integration

- [x] T068 [US2] Install deps: `pnpm add @huggingface/transformers @ricky0123/vad-react @ricky0123/vad-web vite-plugin-static-copy`
- [x] T069 [US2] Add `vite-plugin-static-copy` config to `personahub-desktop/vite.config.ts` — copy ORT WASM files to `public/ort/`, VAD assets to `public/vad/`
- [x] T070 [P] [US2] Create `personahub-desktop/src/workers/moonshine.worker.ts` — load `onnx-community/moonshine-base-ONNX` (q8) via transformers pipeline, enforce `max_length = audio_seconds × 6.5`, WebGPU→WASM fallback
- [x] T071 [P] [US2] Create `personahub-desktop/src/lib/speech/sttMoonshine.ts` — wraps worker, lazy init, model download progress events, 5-minute idle → `worker.terminate()`
- [x] T072 [US2] Create model download progress modal component using `react-hot-toast` or inline — "Setting up voice input... 42% (~63 MB, one-time download)", retry on failure, disk-space check

### Mic Button + Voice Input Hook

- [x] T073 [US2] Create `personahub-desktop/src/hooks/useVoiceInput.ts` — wraps `useMicVAD` with `startOnLoad: false`, `minSpeechMs: 1000`, explicit asset paths `/vad/` + `/ort/`. On `onSpeechEnd`: call `sttMoonshine.transcribe()`. Auto-stop on blur/lock/suspend/60s cap/10-min no-speech.
- [x] T074 [US2] Create `personahub-desktop/src/components/MicButton.tsx` — 40×40, positioned left of textarea, hold-to-record (click + Space when textarea empty), Escape cancels, `aria-pressed`, first-ever press shows explanation card then OS permission dialog, denied → disable with tooltip + System Settings link
- [x] T075 [US2] Wire `<MicButton>` into `ChatInput.tsx` before the textarea element (before line 42). Transcribed text inserted via `setText(prev => prev + text)` — does NOT auto-send. Add Space-hold PTT guard: only when textarea empty + `e.key === ' '` + `e.preventDefault()`.
- [x] T076 [US12] Handle mic permission revocation after grant — detect on next attempt, disable button, show recovery guidance with System Settings link, re-check on window focus

### Hot-Mic Safety

- [x] T077 [US4] Wire `powerMonitor.on('lock-screen')` and `powerMonitor.on('suspend')` in `personahub-desktop/electron/main.ts` → IPC to renderer → `useVoiceInput.stop()`
- [x] T078 [US4] Wire `window.addEventListener('blur')` → stop mic within 200ms in `useVoiceInput.ts`
- [x] T079 [US4] Add privacy statement text in Settings → Voice & Avatar → Privacy subsection per spec FR-7 #75
- [x] T080 [US4] Ensure transcribed text is visually distinguishable in input field (italic or small mic icon prefix) and treated with same trust/length limits as typed text
- [x] T081 [US4] On app launch, verify no residual mic session from previous run at `useVoiceInput.ts` init
- [x] T082 [US2] Implement AEC workaround: pause VAD while avatar is speaking (resume after `onEnd`) per spec FR-14 #155
- [x] T083 [US2] Add global mic kill shortcut inside existing `personahub-desktop/electron/shortcuts.ts` `registerShortcuts()` function — `CmdOrCtrl+Shift+M`, make configurable in Settings, check for conflicts

### IPC Security Hardening

- [x] T084 Apply `validateSender` from `ipc-validation.ts` to ALL new voice IPC channels
- [x] T085 Add rate limiting on `tts:synthesize` — max 1 request per 500ms per window
- [x] T086 Implement redaction in error handlers — mask API key patterns in crash reports, error messages, console output, voice event log. Add redaction to `voice-key-store.ts` error paths.
- [x] T087 Add CI grep guards to `personahub-desktop/package.json` test script: fail if `unsafe-eval` (without wasm-), `sandbox: false`, `nodeIntegration: true`, or `webSecurity: false` in `electron/` or `dist-electron/`

### Sidebar Activity Indicators

- [x] T088 [US2] Extend `SidebarPersona` type in `ChatWindow.tsx` with `isSpeaking?` and `isRecording?` fields, derive from `useVoiceOutput`/`useVoiceInput` state mapped to active persona
- [x] T089 [US2] Render small speaker/mic icons in `ChatSidebar.tsx` `renderPersonaItem()` next to active persona

### Testing (Week 2)

- [x] T090 [P] Write unit tests for `sttMoonshine` in `personahub-desktop/src/lib/speech/__tests__/sttMoonshine.test.ts` — mock worker, test transcribe/timeout/error/worker-lifecycle
- [x] T091 [P] Write unit tests for `useVoiceInput` in `personahub-desktop/src/hooks/__tests__/useVoiceInput.test.ts` — mock VAD, test record/cancel/timeout/permission flow
- [x] T092 [P] Write unit tests for IPC validation in `personahub-desktop/electron/__tests__/ipc-validation.test.ts` — accept main-window sender, reject about:blank, rate limiter, text length cap
- [x] T093 [P] Write unit test for redaction — inject known API key into every error path, verify never in output
- [x] T094 Manual test matrix Week 2: macOS mic grant/deny/revoked, Windows mic, Linux PipeWire, offline STT, Space PTT, Escape cancel, mid-speech mic press, global `Cmd+Shift+M`, 60s cap, powerMonitor lock, rapid persona switch during recording, Bluetooth unplug

---

## Phase 6: Accessibility Hardening (US6 — Week 2 continued)

**Goal**: WCAG 2.2 AA compliance. Screen reader pass. Keyboard-only flow. Contrast. Reduced motion.

- [x] T095 [US6] Verify all new elements have `aria-label`, visible focus indicators (2px indigo-500 outline), and logical focus order
- [x] T096 [US6] Verify caption strip `aria-live="polite"`, errors `aria-live="assertive"`, state badge announced on change
- [x] T097 [US6] Verify `prefers-reduced-motion` disables breathing/sway but keeps blink + mouth + state transitions at 0ms
- [x] T098 [US6] Verify `prefers-contrast: more` doesn't break face/caption rendering
- [x] T099 [US6] Verify all new text meets WCAG 2.2 AA contrast ratio 4.5:1
- [x] T100 [US6] Document keyboard focus flow: MicButton → stays on button during recording → textarea on end. Stop Voice → textarea. Face collapse → stays on toggle. First-mic card → focus trapped, returns to MicButton on Continue.
- [x] T101 [US6] Run `pnpm test:a11y` automated audit → fix all errors
- [x] T102 [US6] Manual VoiceOver pass (macOS) on all new screens
- [x] T103 [US6] Manual NVDA pass (Windows) on all new screens
- [x] T104 [US6] Verify no new keyboard shortcut conflicts with VoiceOver/NVDA/Orca/OS shortcuts

---

## Phase 7: Per-Persona Customization (US3, US10, US13, US14, US15 — Week 3)

**Goal**: Each persona gets its own voice and face. Pickers with preview. Undo. Replay. Shared-machine safety.

**Independent test criteria**: Create persona with specific voice + face → switch between personas → each sounds/looks different.

### Voice Picker

- [x] T105 [US3] Create voice picker component in `personahub-desktop/src/components/VoicePicker.tsx` — grouped radio list (Female/Male), inline preview "Hi, I'm {name}!", one preview at a time, spinner on cold cache
- [x] T106 [US10] Wire voice picker into `PersonaSettingsPanel.tsx` after line 212 (after emoji avatar section) inside a collapsible "Voice & Avatar" disclosure
- [x] T107 [US10] Wire voice picker into `ChatSidebar.tsx` creation modal after line 416 (description helper text), before Advanced toggle at line 419
- [x] T108 [US3] Implement deterministic default voice: hash persona name → pick from available voices so each new persona sounds different

### Face Picker

- [x] T109 [P] [US3] Create face picker component in `personahub-desktop/src/components/FacePicker.tsx` — 4×2 grid of 80×80 thumbnails, selected = indigo ring + checkmark, accent hue slider
- [x] T110 [US3] Generate SVG thumbnail previews for each of 6 avatar styles
- [x] T111 [US10] Wire face picker into `PersonaSettingsPanel.tsx` and `ChatSidebar.tsx` creation modal alongside voice picker

### Cross-Feature Integration

- [x] T112 [US3] Persona duplicate: clone voice + face settings exactly in `personahub-desktop/electron/main.ts` persona duplicate handler
- [x] T113 [US3] Persona export: include voice + face settings, exclude API keys, show visible notice
- [x] T114 [US3] Persona import: if imported provider has no local key, default to OS-native + show notice
- [x] T115 [US11] Clear chat history while speaking: stop voice, discard utterance
- [x] T116 Tray minimize: stop voice + mic within 200ms in existing window hide handler
- [x] T117 Auto-updater: postpone restart prompt 5s after last voice activity, never during active recording
- [x] T118 [US9] Implement feature flag in GlobalVoicePrefs: global toggle disabling entire voice+avatar feature → pre-feature experience restored

### Undo + Replay

- [x] T119 [US14] After saving voice/face changes in `PersonaSettingsPanel.tsx`, show 10-second `react-hot-toast` with Undo button that atomically reverts voice + face fields
- [x] T120 [US15] Add "Replay last reply" button next to most recent assistant message in `ChatMessages.tsx` — re-plays last spoken audio without re-triggering LLM

### Shared Machine

- [x] T121 [US13] Verify all voice credentials and preferences live within the current OS user profile (scoped to `app.getPath('userData')` which is per-OS-user)
- [x] T122 [US13] Document in Settings → Privacy: voice settings are per-user, not shared across OS accounts

### Testing (Week 3)

- [x] T123 [P] Test per-persona voice: create 3 personas with different voices, verify each sounds correct
- [x] T124 [P] Test face picker: create persona with each of 6 styles, verify renders correctly
- [x] T125 Test export/import round-trip with voice settings (confirm no key leakage)
- [x] T126 Test duplicate persona with voice settings
- [x] T127 Test feature flag on → off → on cycle — verify pre-feature experience fully restored, no console errors, persona data intact
- [x] T128 Test 50 personas in sidebar: smooth scrolling, sub-100ms selection
- [x] T129 Write rollback verification test: feature flag off → no voice UI → persona data intact → downgrade simulation

---

## Phase 8: Final Testing + Ship (Week 4)

**Goal**: Production-ready. All acceptance criteria verified. Ship.

### Automated Test Completion

- [x] T130 Write comprehensive unit tests covering any remaining gaps for all voice code paths
- [x] T131 Write Vitest integration test: mock useChat → emit finalized message → verify useVoiceOutput calls ttsRouter.speak() → verify AvatarFace receives amplitude updates
- [x] T132 Write automated keyboard-only navigation test — complete a full voice conversation without mouse
- [x] T133 Write automated Local-Only mode test — capture network calls, assert zero cloud TTS requests
- [x] T134 Write automated rapid-fire test — 5 messages in 5 seconds, assert no audio overlap, no orphaned sessions, no memory growth
- [x] T135 Write automated redaction test — inject known key into every error path, verify key never in any output
- [x] T136 Write automated cross-feature test — export/import/duplicate/clear-history during speech
- [x] T137 Write tests for 8 untested FR-14 edge cases: #150 SSML injection, #153 empty voice list, #156 max length, #157 all-tiers-unavailable, #158 stale provider, #160 clean-state-after-crash (manual), #162 retry controls, #163 mid-utterance provider switch

### Performance + Soak

- [x] T138 Create `personahub-desktop/src/lib/perf/fpsCounter.ts` — dev-only FPS sampler overlay
- [x] T139 Create `personahub-desktop/electron/perf-ipc.ts` — expose `process.memoryUsage()` via IPC `perf:memory` (dev-mode only)
- [x] T140 Create `personahub-desktop/scripts/soak-test.ts` — launches app, sends messages at 30s intervals, samples memory every 60s, logs CSV, accepts `--duration` and `--mode` flags
- [x] T141 Run 24-hour voice-output-only soak test — verify renderer memory growth < 100MB
- [x] T142 Run 72-hour full voice I/O soak test — verify renderer + main process memory growth below documented ceilings
- [x] T143 Measure cold-start regression vs baseline (must be <10%)
- [x] T144 Measure installer size growth (must be <15MB)
- [x] T145 Measure face animation FPS on reference low-spec hardware (must be ≥24 FPS)

### Cross-Platform + Accessibility

- [x] T146 Full manual test matrix on macOS 13+ (Intel + Apple Silicon if available)
- [x] T147 Full manual test matrix on Windows 10+
- [x] T148 Full manual test matrix on Linux (Ubuntu 24.04 with PipeWire)
- [x] T149 Manual Orca screen reader pass (Linux)
- [x] T150 Final WCAG 2.2 AA automated audit — must pass with zero errors

### Ship

- [x] T151 Update `personahub-desktop/CLAUDE.md` with voice architecture section
- [x] T152 Write end-user documentation: setup guide, supported providers, troubleshooting, privacy guarantees
- [x] T153 Review all spec acceptance criteria — check each one off
- [x] T154 Tag release, build installers for macOS + Windows + Linux
- [x] T155 Sign macOS build: `codesign --force --deep --sign -` then verify entitlements: `codesign -d --entitlements :-`
- [x] T156 Ship

---

## Dependencies

```
Phase 1 (Setup)
  ↓
Phase 2 (Foundational)
  ↓
Phase 3 (Voice Output + Face) ←── can begin as soon as Phase 2 T023 (ttsRouter) is done
  ↓
Phase 4 (Settings) ←── depends on Phase 3 for integration testing
  ↓ (Week 1 ships here)
Phase 5 (Voice Input + Security) ←── depends on Phase 4 for API key infrastructure
  ↓
Phase 6 (Accessibility) ←── depends on Phase 5 for all UI being present
  ↓ (Week 2 ships here)
Phase 7 (Per-Persona) ←── depends on Phase 5 for mic integration
  ↓ (Week 3 ships here)
Phase 8 (Testing + Ship) ←── depends on all previous phases
```

## Parallel Execution Opportunities

Within each phase, tasks marked `[P]` can run concurrently (they touch different files with no dependencies on incomplete tasks in the same phase).

| Phase | Parallelizable tasks | Estimated time savings |
|---|---|---|
| Phase 2 | T020, T021, T022 (3 independent lib files) + T025, T026 (test mocks) | ~3 hours |
| Phase 3 | T027, T028, T029 (face variants) + T042-T046 (test files) | ~4 hours |
| Phase 5 | T070, T071 (STT worker + wrapper) + T090-T093 (tests) | ~3 hours |
| Phase 7 | T109 (face picker), T123, T124 (tests) | ~2 hours |

---

## Implementation Strategy

### MVP (ship after Phase 4 = Week 1)

Voice output + 2D face + Settings UI. **This alone is a complete, shippable product increment.** Users hear personas speak, see faces animate, configure cloud providers with API keys, and can disable voice entirely. No mic, no STT, no Electron upgrade, no security hardening.

### Incremental delivery

- **Week 1** (Phases 1-4): MVP voice output
- **Week 2** (Phases 5-6): Voice input + security + accessibility  
- **Week 3** (Phase 7): Per-persona customization
- **Week 4** (Phase 8): Testing, hardening, ship

Each week's output is independently shippable and fully tested.

---

## Summary

| Metric | Count |
|---|---|
| **Total tasks** | **156** |
| Phase 1 (Setup) | 13 |
| Phase 2 (Foundational) | 13 |
| Phase 3 (Voice Output + Face) | 23 |
| Phase 4 (Settings + Providers) | 9 |
| Phase 5 (Voice Input + Security) | 37 |
| Phase 6 (Accessibility) | 10 |
| Phase 7 (Per-Persona) | 25 |
| Phase 8 (Testing + Ship) | 26 |
| **Parallelizable tasks** | **31** (20%) |
| **User stories covered** | **15/15** |
| **FR-14 edge cases with tests** | **23/23** |
