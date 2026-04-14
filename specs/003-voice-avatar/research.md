# Research Decisions: Voice & Avatar Phase

*Consolidated from two research rounds (12 parallel agents, 8,755 lines of raw research).*
*Canonical source: `research/avatar-phase-final-stack-decision.md`*
*Round 1 context: `research/avatar-phase-research-brief.md`*

---

## Decision 1: Voice Output — Cloud TTS via OpenClaw (primary)

**Decision**: Use cloud TTS routed through the existing OpenClaw local gateway as the primary voice output, with `window.speechSynthesis` (browser-native) as the fallback.

**Rationale**:
- OpenClaw v2026.4.7 already supports TTS routing to OpenAI, ElevenLabs, Edge, and MiniMax — no new infrastructure needed
- Cloud TTS quality is dramatically better than the local Kokoro-82M option, which reviewers called "emotionally flat — a narrator reading the script, not performing it"
- Cost is negligible: $0/month on Google Cloud WaveNet free tier (1M chars/month permanent), $1.69/month on OpenAI for typical usage
- Latency is ~500ms (network-bound) vs 1.5–3.5 seconds (Kokoro WASM on low-spec), making cloud faster for the majority of users
- No 86MB model download, no 300MB RAM overhead, no fan-spinning on Intel UHD 620
- Text already leaves the device for the LLM call — sending it to TTS is no new trust boundary

**Alternatives considered**:
- **Kokoro-82M via HeadTTS** (round 1 pick): rejected as default due to high latency on WASM, large download, RAM cost, and "emotionally flat" quality. Preserved as a future downloadable "privacy pack" for offline/privacy-max users
- **Piper TTS**: 3–7× faster than Kokoro on CPU, 22MB model, but no viseme/phoneme timestamps and thin browser documentation. Noted as Plan B if Kokoro is ever needed on low-spec
- **Web Speech API alone**: works but default macOS voice (Samantha) is 2005-era quality, Siri Enhanced voices require manual user install, Windows Aria/Jenny are decent but not controllable. Used as fallback, not primary
- **Bark, XTTS v2, Orpheus, Chatterbox, Moshi, Sesame CSM**: all 500M–8B parameters, no browser/WASM build, not viable for Electron renderer

---

## Decision 2: Voice Output Fallback — Web Speech API (browser-native)

**Decision**: `window.speechSynthesis` serves as the free, zero-download, works-offline fallback when no cloud API key is configured or when the network is unavailable.

**Rationale**:
- Zero bundle size, zero first-run download, instant (~50ms) first audio
- Works on every supported OS: Windows 11 (Aria/Jenny/Guy ship by default), macOS (Samantha default, Siri Enhanced installable), Linux (eSpeak)
- Verified working in Electron 35 renderer after the `voiceschanged` event fires
- AEC (echo cancellation) bug from Chromium #687574 does NOT apply to `speechSynthesis` output because it plays through the OS audio graph, not through Web Audio API

**Alternatives considered**:
- Making Web Speech API the only provider: rejected because quality varies too much across platforms (Linux eSpeak is genuinely bad)

**Critical implementation note**: Filter voices by `localService === true` to avoid accidentally using "Microsoft Aria Online (Natural)" which routes text to Azure despite appearing local in the voice list.

---

## Decision 3: Voice Input STT — Moonshine via @huggingface/transformers

**Decision**: Use `onnx-community/moonshine-base-ONNX` (q8 quantization, ~63MB) via `@huggingface/transformers` for local speech-to-text. Fallback to `moonshine-tiny-ONNX` (q8, ~28MB) on low-spec. Route to `Xenova/whisper-base` multilingual (~74MB) when persona locale is non-English.

**Rationale**:
- Moonshine was designed specifically for short push-to-talk utterances (2–10 seconds) on edge devices — exactly PersonaHub's use case
- ~5× faster than Whisper on short clips due to RoPE position embeddings (Whisper zero-pads every clip to 30 seconds)
- Moonshine-tiny (28MB) is 28% smaller AND slightly more accurate than whisper-tiny.en (39MB) at WER 12.66% vs 12.81%
- Official `@huggingface/transformers` v3.2+ support — same ONNX Runtime Web already needed if Kokoro is ever loaded
- Audio never leaves the device — microphone recordings stay fully local

**Alternatives considered**:
- **Whisper-tiny.en via transformers.js** (round 1 pick): superseded by Moonshine on every metric for short clips
- **whisper.cpp WASM direct**: rejected — requires manual Emscripten build, no TypeScript types, adds a second WASM runtime
- **Web Speech Recognition API**: confirmed broken in Electron 35 via issue #46143 — `SpeechRecognition` fails with "network error" even offline
- **Vosk**: `vosk-browser` package last published ~2022, effectively abandoned
- **Picovoice Leopard**: proprietary, requires per-device AccessKey, can't bundle for distributed users
- **Nvidia Parakeet/Canary**: 600MB–3GB, non-commercial license on Canary

**Critical gotchas**:
- Moonshine repeats tokens on clips <1 second — enforce `minSpeechDuration ≥ 1000ms` in VAD
- Enforce `max_length = audio_seconds × 6.5` to prevent hallucinated runaway decoding
- English-only — multilingual falls back to Whisper base
- Moonshine v2 (Feb 2026) is much better but has no ONNX port yet — plan for a clean swap path

---

## Decision 4: Voice Activity Detection — @ricky0123/vad-react

**Decision**: Use `@ricky0123/vad-react` (Silero VAD v5 model, ~2MB ONNX) for microphone voice activity detection.

**Rationale**:
- Universal convergence across every reference app audited: Open-LLM-VTuber, AIRI, Amica, Neuro all use exactly this package
- Silero VAD v5 is 3× faster than v4, 2MB model, MIT licensed
- Output is Float32Array at 16kHz mono — the exact format Moonshine expects, zero resampling needed
- React hook API (`useMicVAD`) handles cleanup on unmount automatically

**Alternatives considered**: None viable — this is the de facto standard.

**Critical implementation note**: Vendor the ONNX runtime WASM files and Silero model to `public/vad/` and pass explicit `baseAssetPath` + `onnxWASMBasePath` — the defaults pull from jsdelivr CDN which would require expanding the renderer CSP.

---

## Decision 5: Avatar — 2D SVG/CSS face (v1), @pixiv/three-vrm upgrade path (v2+)

**Decision**: Ship a hand-written SVG face component with CSS animations in v1. Reserve `@pixiv/three-vrm` as the 3D upgrade path for v2 or later.

**Rationale for 2D in v1**:
- AIRI (37.6k stars, 23 contributors) marks "talking head with lip sync" as INCOMPLETE on their v0.9 roadmap — if they haven't cracked it, a solo dev in one sprint is unrealistic
- Open-LLM-VTuber (6.8k stars) gave up on 3D entirely and went with Live2D (2D)
- Character.AI (massive user base) uses static 2D portraits — emotional connection comes from voice, not 3D rendering
- Duolingo's Duo uses Rive (2D) — users love it
- 2D has zero GPU dependency, zero performance tiers, zero WebGPU gambling
- SVG iteration is instant (change one number → see the result) vs 3D (re-export avatar)

**Rationale for three-vrm as the v2 3D path** (not TalkingHead):
- Pixiv-backed (bus factor 6) vs TalkingHead (bus factor 1)
- Smaller bundle: 36KB gz vs 55–70KB gz
- Native viseme presets: `VRMExpressionPresetName.Aa/Ih/Ou/Ee/Oh` on `VRMExpressionManager`
- R3F-native (idiomatic React) — TalkingHead owns its own canvas and cannot coexist with React Three Fiber
- VRoid Hub ecosystem is alive with thousands of free-commercial-use VRM models — Ready Player Me shut down Jan 31, 2026
- Production references: AIRI, DavinciDreams/3dchat, anjaydo/vroid-ai-companion

**Lip sync in v1**: Amplitude-driven mouth movement (synthetic envelope modulated by word `boundary` events from Web Speech API, or cheap FFT from cloud TTS audio buffer). Good enough for stylized 2D.

**Lip sync upgrade path for v2 3D**: `wlipsync` v1.3.0 (MFCC-based WASM, what AIRI ships in production) + Kokoro phoneme timestamps if HeadTTS is loaded.

**Alternatives considered**:
- **TalkingHead + Ready Player Me GLBs** (round 1 pick): rejected — RPM shut down, bus factor 1, can't use with R3F
- **Live2D Cubism Web SDK**: free for small devs but proprietary Cubism Core JS dependency, no universal viseme contract
- **Rive**: "LipSync feature" doesn't actually exist as a built-in (it's a community pattern), runtime is 1.8MB WASM — 10× heavier than needed
- **Lottie**: never designed for real-time lip sync
- **Spine**: $379 paid editor license up front

---

## Decision 6: Electron Version — Stay on 35 for v1, upgrade to ≥38.8.6 for v2 (mic)

**Decision**: Do not upgrade Electron for v1 (voice output only). Upgrade to ≥38.8.6 as part of v2 when microphone features ship.

**Rationale**:
- v1 has no microphone code — CVE-2026-34777 (iframe origin leak in `setPermissionRequestHandler`) is not reachable
- The upgrade is still good hygiene and is budgeted for Week 2 when mic ships
- Avoids introducing regression risk in the v1 release

---

## Decision 7: Content Security Policy — Light in v1, strict in v2

**Decision**: Add a basic CSP via `session.webRequest.onHeadersReceived` in v1 (no WASM, no workers, just the existing renderer needs). Tighten to include `wasm-unsafe-eval`, `worker-src blob:`, etc. in v2 when STT models load.

**Rationale**: v1 doesn't load WASM or spawn Web Workers for voice — it calls cloud TTS through the gateway and uses browser-native `speechSynthesis`. The strict CSP directives (`wasm-unsafe-eval`, `worker-src blob:`) are only needed when Moonshine loads in v2.

---

## Decision 8: macOS Mic Entitlements — Not in v1, required for v2

**Decision**: Add `NSMicrophoneUsageDescription` and mic entitlements to `build/entitlements.mac.plist` only when mic code is about to ship (v2). Without them, calling `getUserMedia` under hardened runtime crashes the app with SIGABRT.

---

## Decision 9: Echo Cancellation — Pause VAD during speech (v2)

**Decision**: When mic is added in v2, pause VAD while the avatar is speaking to avoid the Chromium AEC bug (#687574). This means users cannot interrupt mid-sentence in v2 — add interruption support in v3 if users request it.

**Rationale**: The loopback hack (RTCPeerConnection) adds 100ms latency and complexity. Patching TalkingHead to play via `<audio>` element requires forking. Pausing VAD ships in hours and matches Siri push-to-talk behavior.

---

## Decision 10: Push-to-Talk default (v2)

**Decision**: Default voice input to push-to-talk (hold Space or mic button). Hands-free VAD as opt-in advanced setting.

**Rationale**: 2025–2026 convergence (Claude Code, Codex, ChatGPT Voice all use PTT as default or primary). PTT is lower CPU, fewer mistriggers in shared spaces, and keyboard-native for PersonaHub users.

---

## Decision 11: Per-persona customization — Deferred to Week 3

**Decision**: v1 ships with one face template (tinted per persona via hash) and per-persona voice variation via pitch/rate offsets. Full voice picker (26 Kokoro voices + cloud voices) and face picker (6+ presets) ship in Week 3.

**Rationale**: Users going from text-only to voice+face don't miss per-persona customization because they have nothing to compare it to. Pickers add ~2 days of UI work that can be overlapped with testing.
