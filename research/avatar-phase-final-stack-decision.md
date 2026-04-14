# Final Stack Decision: PersonaHub Desktop Voice & Avatar Phase

*Generated: 2026-04-10 | Two full research rounds, 12 parallel agents, 8,755 total lines of research condensed into this decision.*

This document supersedes `research/avatar-phase-research-brief.md` (round 1) where the two conflict. Round 1's file-path research, data-model trick, and IPC notes still apply — but the stack choices and phase plan below are the canonical ones.

---

## Executive Summary in Plain Language

You wanted to turn PersonaHub's text-only personas into characters you can **see** and **hear**. Two rounds of research later, the honest answer is: **you can ship the "hear" part beautifully in 4–6 days**, and the "see" part should start small (2D face in v1) with a path to upgrade to 3D later if users ask.

**The single most important finding** came from checking OpenClaw's current version: your local gateway **already knows how to route text to cloud TTS providers** (OpenAI, ElevenLabs, Edge, MiniMax) as of v2026.4.7. That means you don't need to build a TTS pipeline at all — you need to build a thin settings UI + a one-line call through your existing gateway. This is the hidden infrastructure win that reframes the entire project.

**The second most important finding**: cloud TTS prices collapsed in 2025–2026. OpenAI's `gpt-4o-mini-tts` is **$1.69/month for a typical user**, and Google Cloud WaveNet gives **1 million characters/month permanently free** — that's ~9 hours of speech monthly at zero cost. Round 1's "cloud TTS is too expensive" rejection was using pricing from cloud *avatar* providers (Tavus, Simli, HeyGen — all still $79–$397/month) and wrongly applied to TTS. TTS has commoditized.

**The third finding**: round 1 chose local Kokoro for TTS and local Whisper for STT, assuming "local = the only path that respects privacy and costs nothing." But PersonaHub already sends every user message to Anthropic/Gemini via OpenClaw for the LLM call — the text already leaves the device. Sending that text to a TTS API afterwards is strictly *no worse* on the trust boundary. The privacy argument is weaker than it looks for *output* audio. (It's still strong for *input* audio — see the STT decision below.)

**The result of all three findings combined**: a dramatically simpler plan.

---

## The Final Stack

| Layer | Round 1 picked | **Final pick** | Why it changed |
|---|---|---|---|
| **Shell** | Electron 35 → 38.8.6 | **Electron 35 stays in v1. Upgrade to 38.8.6 in v2 when we add mic.** | No mic in v1 = no `setPermissionRequestHandler` = no CVE-2026-34777 blocker. Upgrade is still good hygiene but no longer ship-blocking. |
| **Avatar** | TalkingHead + Ready Player Me GLBs | **v1: simple 2D face (Rive or CSS/SVG). v2: `@pixiv/three-vrm` as opt-in upgrade.** | Round 2 reference-app audit: nobody at scale (AIRI at 37.6k stars, Open-LLM-VTuber at 6.8k stars) has cracked 3D talking head with lip sync — even AIRI lists it as "incomplete" on their v0.9 roadmap. 2D feels more alive on less effort. When we eventually add 3D, VRM is better than TalkingHead (Pixiv-backed vs bus-factor-1, smaller bundle, R3F-native, replaces dead RPM ecosystem with live VRoid Hub). |
| **Lip sync** | TalkingHead's built-in Oculus visemes driven by Kokoro phoneme timestamps | **v1: audio-amplitude-driven mouth (cheap, works everywhere). v2: `wlipsync` MFCC-WASM (what AIRI ships in production).** | Amplitude-driven looks fine on stylized 2D faces. The phoneme-accurate path requires Kokoro or similar, which we're not shipping in v1. |
| **TTS default** | Kokoro-82M via HeadTTS WASM | **Cloud TTS via OpenClaw — default OpenAI `gpt-4o-mini-tts`, fall back to Web Speech API if no API key.** | OpenClaw v2026.4.7 already routes to OpenAI/ElevenLabs/Edge/MiniMax. $1.69/month typical cost. Google Cloud WaveNet free tier is permanent 1M chars/month. Latency is 300–500ms via network vs 1.5–3.5s Kokoro on WASM. No 86MB download. No 300MB RAM. No fan-spinning. No WebGPU gambling on Intel UHD 620. |
| **TTS fallback** | Web Speech API (as "low-spec escape hatch") | **Web Speech API stays as the "no API key / offline / privacy max" fallback.** Filtered to `localService === true` only, to avoid Microsoft Aria Online accidentally phoning home. | Works when user has no API key. Zero cost. OS-provided voices: Windows 11 Aria/Jenny/Guy are decent and ship by default; macOS default Samantha is 2005-era but user can install Siri Enhanced voices (one-time system setting). Linux eSpeak is acceptable. |
| **TTS premium** | (not in round 1) | **ElevenLabs Flash v2.5 as opt-in "bring your own key" option.** | Users who want the best quality can add an ElevenLabs key. Must be framed as "Use ElevenLabs (requires your own API key)" — NOT re-branded. ElevenLabs ToS prohibits embedding. |
| **TTS offline-only mode** | — | **Kokoro via HeadTTS as a downloadable v2 "privacy pack"** | For users who explicitly want zero cloud calls. Deferred to v2 because v1 already has a working fallback chain. When we ship it, the research in round 1 is the blueprint. |
| **STT** | `@huggingface/transformers` whisper-tiny.en | **Not shipped in v1 at all. In v2: `@huggingface/transformers` with `moonshine-base` (primary) + `whisper-base` multilingual (fallback).** | Voice *input* has all the security complexity (mic entitlements, CVE fix, CSP tightening, hot-mic hygiene, AEC feedback loop) AND is the less impressive half of voice AI. Watching a persona *speak to you* is the wow moment; *talking to it* is table stakes. Ship voice output first. When we do add STT in v2: Moonshine-base is 5× faster than Whisper on short clips, 28% smaller, same WER, same ONNX runtime. Use Whisper multilingual only when persona locale ≠ English. |
| **VAD** | `@ricky0123/vad-react` | **Not in v1. `@ricky0123/vad-react` in v2 when STT ships.** | Universal convergence across reference apps — the only rock-solid pick in the space. When we add it: Silero VAD v5 model, `positiveSpeechThreshold: 0.3`, enforce `minSpeechDuration ≥ 1000 ms` (Moonshine requirement). |
| **Database schema** | Add columns to `persona_configs` | **Unchanged from round 1: no migration — use the JSON `settings` blob.** Add `voiceProvider`, `voiceId`, `avatarStyle` as optional fields in `PersonaSettings`. | This trick from round 1 is still the right answer. Zero migration risk. |
| **Plug-in point for TTS trigger** | `src/hooks/useChat.ts:74` | **Unchanged — same one-line hook point.** | Round 1's codebase research was correct on this. |
| **CSP** | Strict CSP via `webRequest.onHeadersReceived` | **Light CSP in v1.1 follow-up. Not a v1 ship blocker.** | Without `getUserMedia` or WASM model downloads, the attack surface round 1 worried about doesn't exist yet. Still a good hygiene item. |
| **mac entitlements** | `NSMicrophoneUsageDescription` + device entitlements | **Not needed in v1. Add in v2 when mic ships.** | No mic = no TCC crash = no Info.plist change. |
| **Custom protocol (`personahub-asset://`)** | Register in main, use for GLB loading | **Not needed in v1.** Bundled assets in `public/` work fine. **Register in v2 when three-vrm + local model files are loaded.** | No local model files in v1. |

---

## Why This Plan Won (Plain Language, Decision by Decision)

### Why defer 3D to v2

Two reference projects that have been working on this exact problem for years — **Open-LLM-VTuber (6.8k stars)** and **AIRI (37.6k stars)** — are a cautionary tale, not a template.

- AIRI picked VRM (the 3D format) and explicitly marks "talking head with lip sync" as **INCOMPLETE** on their public v0.9 roadmap. 37.6k stars, 23 contributors, multi-year effort, still not cracked.
- Open-LLM-VTuber gave up on 3D entirely and went with Live2D (2D) via the official Cubism Web SDK. They ripped out `pixi-live2d-display` in v1.2.0 after it caused migration pain.
- **Only one shipping app** in the world uses PersonaHub's round-1 exact stack (TalkingHead + Ready Player Me GLBs + Kokoro visemes): a commercial site called EdgeSpeaker, plus a handful of academic demos.

If the 37.6k-star team hasn't cracked 3D lip sync, **a solo indie developer shipping this in 9–14 days is unrealistic**. 2D faces — like what Duolingo's Duo uses via Rive, what every VTuber in the world uses via Live2D, what Character.AI's massive user base uses (static 2D portraits) — feel **more** alive on dramatically less effort.

When you *do* want 3D in v2, **use `@pixiv/three-vrm`, not TalkingHead**. Pixiv is a giant corporate maintainer, it's R3F-native (clean React integration), it's smaller in the bundle (36KB gz vs 55–70KB), and most importantly it connects to the VRoid Hub ecosystem which is still alive — unlike Ready Player Me which shut down January 31, 2026.

### Why cloud TTS instead of local Kokoro

Three data points make this one-directional:

1. **OpenClaw already routes TTS.** Your local gateway supports OpenAI, ElevenLabs, Edge, and MiniMax TTS out of the box as of v2026.4.7. This is ~1–2 days of UI wiring, not a new architectural chapter. Verified at `docs.openclaw.ai/tools/tts`.

2. **Cloud TTS pricing is ridiculously cheap in April 2026**:

| Provider | Model | Typical user cost (112k chars/mo) | Free tier |
|---|---|---|---|
| **Google Cloud TTS** | WaveNet | **$0** | 1,000,000 chars/month **permanent** |
| **OpenAI** | `gpt-4o-mini-tts` | **$1.69/mo** | $5 trial credit |
| **OpenAI** | `tts-1` | **$1.69/mo** | $5 trial credit |
| AWS Polly (Neural) | any | **$0** year 1 | 1M chars/mo for first 12 months |
| Azure Neural TTS | any | **$0** for typical user | 500k chars/mo |
| ElevenLabs Flash v2.5 | Creator | $22/mo | 10k chars/mo (non-commercial) |

A median user (5 minutes of voice/day) costs **zero** on Google WaveNet, **$0.68** on OpenAI. Even a heavy user (30 min/day) costs **$10/month worst case**. Round 1's "$0.05–0.59/min" figure was cloud avatar pricing, misapplied to TTS.

3. **Kokoro's real-world quality is "emotionally flat"** per its 45-day public review — "a narrator reading the script, not performing it." Meanwhile OpenAI/ElevenLabs voices are miles ahead. We'd pay 86MB download + 300MB RAM + fan-spinning CPU + 1.5–3.5s first-audio latency to ship a *worse-sounding* voice than what's free via cloud. That's upside-down.

**The trust argument**: text is already going to the cloud (for the LLM call). Sending that same text to a TTS API after the LLM replies is no new trust boundary. Voice *input* audio IS a new trust boundary (biometric signal, environmental audio) — which is why STT must stay local when we eventually add it. But voice *output* text is already public from the app's perspective.

### Why defer voice input to v2

Voice input is where ~40% of round 1's complexity lives:

- Mic permission flow (and the Electron 35→38 CVE blocker)
- macOS `NSMicrophoneUsageDescription` + entitlements (and the hard-crash risk)
- Strict CSP install (and the `worker-src blob:` rules)
- VAD library + Silero model asset
- Whisper/Moonshine integration + worker
- **The Chromium AEC bug (#687574)** — avatar voice feeds back into the mic unless we patch TalkingHead, do an RTCPeerConnection loopback hack, or pause VAD during speech
- Hot-mic hygiene: red indicator, `powerMonitor.on('lock-screen')`, global kill hotkey, 10-minute auto-shutoff, blur-to-stop
- Privacy copy, permission dialog, onboarding flow
- IPC audio buffer transport

**All of that evaporates if v1 has no microphone button.** And voice output alone is enough for the wow moment — every high-emotion AI voice product of 2024–2026 (ChatGPT Voice, Pi, Sesame Maya) gets rave reviews from users who never had voice input during the hero demo. Users remember "the AI *spoke* to me." They don't remember "I could talk to it" because they can always type.

When we add it in v2:
- **STT**: Moonshine-base via `@huggingface/transformers` (5× faster on short clips than Whisper, 28% smaller, official transformers.js v3.2+ support, same ONNX runtime)
- **VAD**: `@ricky0123/vad-react` (universal convergence in the reference apps)
- **Then** do all the security work — Electron upgrade, CSP, entitlements, permission handlers
- **AEC fix**: pause VAD while avatar is speaking (ships in hours, no interruption support in v2.0 — add it later if users ask)

### Why defer per-persona avatars/voices to v2

V1 ships with **one 2D face template tinted per persona** (CSS custom property keyed on `persona.id` hash) and **one voice family with per-persona pitch/rate variation** (hash-derived offsets, so every persona sounds subtly different). Users going from "text only" to "voice + face" don't miss per-persona customization — they have nothing to compare it to. Per-persona picker modals (which round 1 designed in detail) become v2.

This saves ~2 days of UI work and keeps v1 scope tight.

---

## The v1 Plan (4–6 days)

### Day 1 — Cloud TTS wiring (half day)

- Read `docs.openclaw.ai/tools/tts` and verify OpenClaw v2026.4.7 is the pinned version in `personahub-desktop/package.json`. If it's older, bump it.
- Add a `generateSpeech(text, personaId)` method to `electron/openclaw-client.ts` that POSTs to `http://127.0.0.1:18789/v1/audio/speech` with the configured TTS provider. Returns an `ArrayBuffer` (MP3 or WAV depending on provider).
- Add IPC channel `tts:synthesize` in `electron/main.ts` that calls `generateSpeech` and streams the response to the renderer.
- Add `window.electronAPI.tts.synthesize(text, personaId)` to `electron/preload.ts`.
- **Verify**: call it once from devtools console with a hardcoded string and confirm audio bytes return.

### Day 1 — Web Speech API fallback (half day)

- Create `src/lib/speech/useSpeechSynthesis.ts` — a hook that wraps `window.speechSynthesis`:
  - Filter voices by `localService === true` (privacy rule — avoid accidentally using "Microsoft Aria Online (Natural)" which sends text to Azure)
  - Handle the `voiceschanged` race: wait for voices on mount, retry with polling fallback
  - Expose `speak(text)`, `cancel()`, `isSpeaking`, `currentWord` (from `boundary` events)
  - Deterministic voice picker based on `persona.id` hash
  - Set `rate = 0.95 + (hash(personaId) % 10) / 100` for per-persona variation
- Create `src/lib/speech/ttsRouter.ts` — the orchestrator. Signature: `speak(text, personaId)`. Logic:
  1. If user has a cloud TTS API key in settings AND is online → route through OpenClaw `tts:synthesize`
  2. Otherwise → fall back to `useSpeechSynthesis`
  3. Either way, return a common interface: `{ play(), stop(), onStart, onBoundary, onEnd }`

### Day 2 — 2D face component

Pick one of two paths depending on designer availability:

**Path A — Rive (recommended if you want it to feel polished):**
- Commission or build a Rive character file with three states: idle, blink, speaking. Expose a `mouthOpen` number input (0.0–1.0). Source options:
  - Rive marketplace: ~$10–$30 for a premade AI avatar character (search "talking head" or "AI assistant")
  - Hire on Fiverr: $20–$50 for a 1-day custom job
  - Build yourself in Rive editor: 2–3 hours following the Rive tutorial series
- `pnpm add @rive-app/react-canvas` (MIT, maintained by Rive Inc.)
- Create `src/components/AvatarFace.tsx`: load the `.riv` file, expose imperative `setMouthOpen(amplitude)` via `useImperativeHandle`
- Tint per persona via CSS filter `hue-rotate(calc(var(--persona-hue) * 1deg))`

**Path B — Pure CSS/SVG (recommended if no designer):**
- Create `src/components/AvatarFace.tsx`: a simple SVG face in JSX
  - Circle head, two circle eyes, ellipse mouth
  - Mouth `rx` and `ry` driven by a React ref updated via `requestAnimationFrame`
  - Blinks via CSS keyframes with randomized `animation-delay`
  - Tint per persona via `filter: hue-rotate()`
- Total: ~80 lines of JSX + 30 lines of CSS

**Either path**: the mouth amplitude source during speech is a synthetic envelope (sine wave modulated by word `boundary` events from Web Speech API, or a cheap FFT from cloud TTS's audio buffer). Amplitude-driven looks convincing on stylized 2D. It is not phoneme-accurate, but it *reads* as "person speaking" — which is all we need.

### Day 3 — Wire into chat flow cleanly

- Add `useEffect` to `src/hooks/useChat.ts` that watches for the `if (chunk.done)` branch at line 74. After `setIsStreaming(false)`, call `ttsRouter.speak(finalContent, personaId)`.
- Pass the resulting `isSpeaking` + `currentAmplitude` down into `ChatWindow.tsx`, which renders `<AvatarFace amplitude={...} />` between the header and `<ChatMessages>` (exact slot from round 1's codebase research).
- On new user message, call `ttsRouter.cancel()` before sending — stop any in-flight speech.
- Add a single **Settings → Voice** section with:
  - Toggle: "Enable voice output" (default ON)
  - Provider dropdown: Auto | OpenAI | ElevenLabs | Google | System (Web Speech API)
  - If OpenAI/ElevenLabs/Google: API key input field (stored via existing `secure-store.ts` pattern)
  - Voice preview button
- Add to `PersonaSettings` TypeScript interface (no DB migration — it's the JSON blob trick from round 1):
  ```ts
  voiceEnabled?: boolean;     // default true
  voiceProvider?: 'auto' | 'openai' | 'elevenlabs' | 'google' | 'system';
  voiceId?: string;           // provider-specific voice name
  ```

### Day 4 — Polish & onboarding

- First-run detection: on app start, if no TTS provider is configured, show a one-time toast:
  - "Voice is now available! Configure in Settings → Voice."
  - Or automatically pick the best available provider: prefer cloud if user has any existing API key in OpenClaw config, fall back to Web Speech.
- Accessibility:
  - Caption strip under the avatar showing the current utterance (always visible by default, can be toggled off)
  - `aria-live="polite"` on the caption strip
  - `aria-label="Voice output"` on the avatar face
- Respect `prefers-reduced-motion`: disable idle animations, keep only blink + mouth
- Error handling:
  - If OpenClaw TTS fails (API key invalid, network error) → fall back to Web Speech API silently with a small toast: "Cloud voice unavailable, using system voice"
  - If Web Speech API returns no voices → hide the avatar, disable the toggle, show a settings hint
- Honest macOS voice hint: "For higher-quality voices on macOS, install Siri Enhanced voices in System Settings → Accessibility → Spoken Content → System Voice"

### Day 5 — Test, polish, ship

- Manual test matrix:
  - macOS with no API key (Web Speech only) — confirm voice sounds OK, fall back to suggesting Enhanced voices
  - macOS with OpenAI key — confirm cloud TTS works and quality is obviously better than Web Speech
  - Windows 11 with no API key — confirm default Aria/Jenny/Guy voices work
  - Offline mode (disconnect network, should silently fall back)
  - Persona switch mid-speech (should cancel cleanly)
  - Rapid-fire messages (should queue properly or interrupt)
- Measure: app startup time (should be unchanged), memory footprint (should be +20MB max over current), CPU during speech (should be <5%)
- Update CLAUDE.md with the new TTS architecture notes
- Commit, build, test installer, ship

### Day 6 — Buffer / polish / unexpected bugs

Reserve this day for the things that always go wrong.

---

## What Gets Shipped in v1

- Persona replies speak aloud using cloud TTS (OpenAI, ElevenLabs, Google) or Web Speech API fallback
- Simple 2D animated face above the chat that bobs its mouth during speech
- Per-persona subtle voice variation (pitch/rate) and tint (hue)
- Settings UI for choosing TTS provider + API key
- Graceful offline fallback
- Accessibility: captions, reduced-motion, keyboard nav
- Zero microphone, zero security complexity, zero 3D rendering, zero WASM downloads, zero Electron upgrade
- **Installer size: unchanged (~170 MB)**
- **First-run downloads: 0 bytes**
- **Memory overhead: <20 MB**
- **CPU during speech: 2–5%**
- **First-audio latency: ~500 ms cloud, ~50 ms Web Speech API**

---

## What Gets Deferred to v2 (and Beyond)

| Feature | When | Why |
|---|---|---|
| **Microphone input (voice chat)** | v2 | All the security work (Electron upgrade, CSP, entitlements, hot-mic hygiene, AEC fix) happens here. Worth the complexity once v1 proves users love voice output. |
| **Local-only Kokoro TTS** | v2 as downloadable "privacy pack" | For users who explicitly want zero cloud calls. Round 1's implementation plan is the blueprint. Ship as opt-in download, not default. |
| **Moonshine STT** | v2 with mic | 5× faster than Whisper on short clips. Official transformers.js support. When STT ships, use this not Whisper. |
| **3D avatar upgrade** | v2 or v3 as opt-in "premium avatar" | Use `@pixiv/three-vrm` (not TalkingHead). VRoid Hub is alive, RPM is dead. AIRI's model-driver pattern is the architectural reference. |
| **Per-persona avatar picker** | v2 after 3D ships | Grid of preset characters. Defer until there's meaningful variety to pick from. |
| **Per-persona voice picker** | v2 | Once users have used v1 for a while and have opinions about voices. |
| **Concurrent TTS segment generation** | v1.1 | 500ms latency win — pattern from Open-LLM-VTuber v1.0.1. Start synthesizing the first sentence as soon as it arrives, don't wait for the full LLM response. Nice improvement, not critical. |
| **Desktop pet mode** (transparent window, always-on-top) | v3 | Open-LLM-VTuber's hero feature. Users love it. Worth adding if the feature takes off. |
| **CSP + Electron 35→38 upgrade** | v1.1 or v2 | Good hygiene, but not a v1 blocker since we don't use `getUserMedia` or WASM downloads. Schedule for the next maintenance release. |
| **Custom protocol (`personahub-asset://`)** | v2 with 3D | No local model files in v1, nothing to serve. |
| **`wlipsync` for viseme-accurate lip sync** | v2 with 3D | What AIRI ships. Use when we move from amplitude-driven to phoneme-accurate. |

---

## Critical Gotchas to Avoid

From the research — these will bite you if you miss them:

1. **Filter Web Speech API voices by `localService === true`**. Otherwise you might accidentally use "Microsoft Aria Online (Natural)" which *looks* local in the voice list but actually sends text to Microsoft Azure. Privacy leak. One-line fix.

2. **ElevenLabs ToS prohibits "embedding" their service**. Users bringing their own API keys is OK — that's ordinary API consumption. But your settings UI must say "Use ElevenLabs (requires your own API key)" — NOT "Premium Voice" or any re-brand. Never ship ElevenLabs-branded UI elements.

3. **OpenAI `gpt-4o-mini-tts` has "variable latency"** per their docs. `tts-1` at ~500ms may be a safer default than `gpt-4o-mini-tts` even though it's slightly more expensive per character. Offer both, default to `tts-1`.

4. **OpenClaw v2026.4.7 has an SSRF regression (issue #63132)** that blocks local-IP STT providers. Not relevant to v1 (no STT), but critical for v2: when you add Moonshine, call it **directly from the renderer**, not routed through OpenClaw.

5. **Web Speech API audio doesn't flow through Web Audio API graph** in all cases. If you need amplitude for mouth animation and `speechSynthesis` audio can't be tapped directly, drive the mouth from a synthetic envelope during `isSpeaking` (open-close modulated by `boundary` events). Simpler and works everywhere.

6. **On first `getVoices()` call, the list may be empty**. Wait for `voiceschanged` event, or poll with retries. This is a well-known Chromium quirk, not a bug in your code.

7. **macOS "Enhanced" Siri voices are NOT pre-installed** as of macOS 15 Sequoia. Users must install them once through System Settings → Accessibility. Document this in the onboarding flow as an optional quality upgrade. Windows 11 Aria/Jenny/Guy ship by default.

8. **TalkingHead is NOT abandoned** (round 1 got this slightly wrong). Last commit was April 8, 2026 — actively maintained by Mika Suominen. But we're not using it anyway. If you ever revisit the round-1 plan, this correction applies.

9. **When you do add STT in v2**: Moonshine repeats tokens on clips <1 second. Enforce `minSpeechDuration ≥ 1000 ms` in Silero VAD gating. Also enforce `max_length = audio_seconds × 6.5` to prevent hallucinated runaway decoding. And Moonshine is English-only — route to `whisper-base` multilingual if persona locale is Russian, Georgian, or anything non-English.

---

## Open Questions That Need Your Input

**Q1 — Which path for the 2D face in v1: Rive or pure CSS/SVG?**

- **Rive**: higher-quality output, needs a `.riv` file (commission $20–50 or DIY in editor), adds `@rive-app/react-canvas` dep (~500 KB min)
- **CSS/SVG**: lower ceiling but zero deps, zero assets, 100% under your control, ships faster
- My recommendation: **CSS/SVG for v1**. Ugly-but-alive beats pretty-but-delayed. Upgrade to Rive in v1.1 if users notice.

**Q2 — What's the default TTS provider if the user hasn't configured one?**

- **Option A**: Web Speech API by default, prompt to add cloud key in Settings
- **Option B**: Silently try Web Speech API first, then offer "Upgrade voice quality" CTA once per session
- **Option C**: Require user to pick at first launch (add a mini wizard step)
- My recommendation: **Option A**. Zero-friction default. Don't push users to add keys until they want better quality.

**Q3 — Should Google Cloud TTS (free 1M chars/month WaveNet) be the pushed recommendation for users who don't have an OpenAI key?**

- **Pro**: it's literally free forever for typical usage
- **Con**: GCP account setup friction is much worse than OpenAI — users have to create a project, enable billing (even for free tier), generate an API key
- My recommendation: **Mention it in docs, don't push in onboarding**. OpenAI is 10× easier to set up and $1.69/month is not a barrier.

**Q4 — Do we want captions on by default?**

- **Pro**: accessibility, works when audio is muted, helps pronunciation confusion
- **Con**: uses vertical space, some users find them visually busy
- My recommendation: **On by default**. Matches YouTube auto-captions UX norm. Users can toggle off via a `CC` button in the chat header.

**Q5 — What happens if the user has no cloud API key AND no local voices (e.g., fresh Linux install with no eSpeak)?**

- Graceful degrade: hide the avatar, disable the voice toggle, show an inline message "Voice requires either a cloud API key or system voices"
- Confirm: does your Linux test environment have eSpeak by default? If yes, this is hypothetical.

**Q6 — Do we want a "mute persona" button in the chat header?**

- Shortcut to temporarily disable voice for the current persona without going to settings
- Round-trip to Settings is fine in v1 but this would be a nice v1.1 quick-win
- My recommendation: **Not v1**. Add in v1.1 if users ask.

---

## Side-by-Side: Round 1 vs Final

| Metric | Round 1 plan | **Final plan** |
|---|---|---|
| **Time to ship v1** | 9–14 days | **4–6 days** |
| **Installer size growth** | +37 MB (GLBs + ORT WASM) | **0 MB** |
| **First-run download** | ~120 MB (Kokoro + Whisper) | **0 MB** |
| **RAM overhead** | ~1.1–1.7 GB active | **<20 MB** |
| **First-audio latency low-spec** | 1.5–3.5 s (WASM Kokoro cold start) | **~500 ms** (cloud network) or **~50 ms** (Web Speech) |
| **CPU during speech low-spec** | 60–85% (fans spinning) | **2–5%** |
| **WebGPU dependency** | Yes (for Kokoro quality) | **No** |
| **Electron 35 CVE blocker** | Yes (mic permission handler) | **No** (no mic in v1) |
| **macOS entitlements required** | Yes (mic) | **No** |
| **Strict CSP required** | Yes (WASM + Workers) | **No** (v1.1 follow-up) |
| **Custom protocol required** | Yes (GLB/ONNX loading) | **No** (v2 with 3D) |
| **AEC feedback-loop problem** | Yes (needs pause-VAD hack) | **No** (no mic) |
| **New security IPC channels** | ~6 (with validation) | **1** (`tts:synthesize`) |
| **3D avatar rendering** | Yes (TalkingHead + RPM) | **No** (2D face in v1) |
| **Monthly cost to user** | $0 (local only) | **$0** median, $1.69 heavy user (OpenAI), $0 forever (Google WaveNet) |
| **Quality of voice** | Kokoro "emotionally flat" per review | **Cloud quality (OpenAI/ElevenLabs) or OS-native** |
| **Works on old hardware** | Marginally (with pain) | **Yes** (cloud is network-bound, not compute-bound) |
| **Privacy-max mode available** | Default | **Opt-in via Web Speech API toggle** (or Kokoro download in v2) |
| **Lines of research contradicted** | ~400 (lazy loading, performance tiers, custom protocol, AEC workaround, etc.) | — |
| **Lines of research preserved** | ~900 (plug-in points, data model, UI layout, accessibility) | — |

**Round 1's research wasn't wasted** — the codebase plug-in points, the `PersonaSettings` JSON trick, the UI layout recommendations, the accessibility baselines, and the Moonshine/three-vrm discoveries all carry forward. V1 is a strict *subset* of round 1. V2 can layer the ambitious pieces on top without refactoring.

---

## Implementation Checklist

Copy this into a GitHub issue or paste into Claude Code to kick off Phase 1.

### v1 — Ship in 4–6 days

- [ ] Read `docs.openclaw.ai/tools/tts`, verify OpenClaw v2026.4.7 in `package.json`
- [ ] Add `generateSpeech(text, personaId)` to `electron/openclaw-client.ts`
- [ ] Register IPC channel `tts:synthesize` in `electron/main.ts`
- [ ] Expose `window.electronAPI.tts.synthesize` in `electron/preload.ts`
- [ ] Create `src/lib/speech/useSpeechSynthesis.ts` (filter by `localService === true`, handle `voiceschanged` race, per-persona pitch/rate)
- [ ] Create `src/lib/speech/ttsRouter.ts` (cloud first, Web Speech API fallback)
- [ ] Create `src/components/AvatarFace.tsx` (Rive or CSS/SVG, amplitude-driven mouth)
- [ ] Wire into `ChatWindow.tsx:215` (slot between header and `<ChatMessages>`)
- [ ] Wire into `useChat.ts:74` (after `setIsStreaming(false)`)
- [ ] Extend `PersonaSettings` interface with `voiceEnabled`, `voiceProvider`, `voiceId` (no DB migration)
- [ ] Add Settings → Voice section (toggle, provider dropdown, API key field, preview button)
- [ ] Handle error cases: cloud failure → Web Speech fallback, no voices → disable gracefully
- [ ] Accessibility: captions default ON, `aria-live` regions, `prefers-reduced-motion` support
- [ ] First-run onboarding toast + macOS Siri Enhanced voice hint
- [ ] Manual test matrix (macOS / Windows / offline / persona switch / rapid-fire)
- [ ] Update `CLAUDE.md` with new TTS architecture
- [ ] Ship

### v2 (later — after v1 proves itself)

- [ ] Electron 35 → 38.8.6 upgrade (CVE-2026-34777, -34780, -34781, -34770)
- [ ] Strict CSP via `session.webRequest.onHeadersReceived`
- [ ] Add `NSMicrophoneUsageDescription` to `electron-builder.config.js`
- [ ] Add mic entitlements to `build/entitlements.mac.plist`
- [ ] Install `setPermissionRequestHandler` + `setPermissionCheckHandler`
- [ ] Add `@ricky0123/vad-react` + Silero VAD v5 assets to `public/vad/`
- [ ] Add `@huggingface/transformers` + `onnx-community/moonshine-base-ONNX` via `src/lib/stt/`
- [ ] Create `src/hooks/useVoiceInput.ts` wrapping `useMicVAD`
- [ ] Create `src/components/MicButton.tsx` in `ChatInput.tsx:50-52`
- [ ] Enforce `minSpeechDuration ≥ 1000 ms`, `max_length = audio_seconds × 6.5`
- [ ] Hot-mic hygiene: red indicator + `powerMonitor` listeners + global `Cmd+Shift+M` kill
- [ ] AEC fix: pause VAD while avatar is speaking
- [ ] Multilingual fallback: route to `whisper-base` when persona locale ≠ English
- [ ] Privacy statement in Settings → Privacy
- [ ] 3D avatar upgrade: `@pixiv/three-vrm`, VRoid Hub avatar picker, `wlipsync` for viseme-accurate lip sync
- [ ] Custom `personahub-asset://` protocol for GLB loading
- [ ] Kokoro offline pack (downloadable opt-in)

---

## Sources Consulted (Round 2)

### Round 2 research partials (merged into this doc)

- `research/.parts/01-avatar-alternatives.md` (752 lines) — TalkingHead risk re-audit + `@pixiv/three-vrm` deep dive
- `research/.parts/02-tts-alternatives.md` (610 lines) — Kokoro vs Piper vs Chatterbox vs Web Speech API
- `research/.parts/03-stt-alternatives.md` (382 lines) — **Moonshine vs Whisper**, Electron Web Speech Recognition status
- `research/.parts/04-reference-apps.md` (433 lines) — Open-LLM-VTuber, AIRI, Amica, EdgeSpeaker, Neuro deep dives
- `research/.parts/05-simpler-path.md` (395 lines) — adversarial challenge to round 1 assumptions
- `research/.parts/06-commercial-hybrid.md` (738 lines) — April 2026 cloud TTS pricing + OpenClaw routing discovery

### Round 1 research (still referenced for file paths, data model, UI layout)

- `research/avatar-phase-research-brief.md` (1,291 lines) — Round 1 unified brief

### External sources (top 30)

**Libraries & repos**:
- [met4citizen/TalkingHead](https://github.com/met4citizen/TalkingHead) — commit 2026-04-08
- [met4citizen/HeadTTS](https://github.com/met4citizen/HeadTTS) — v1.3.0 released 2026-04-03
- [Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber) — 6.8k stars
- [moeru-ai/airi](https://github.com/moeru-ai/airi) — 37.6k stars, v0.9 roadmap
- [semperai/amica](https://github.com/semperai/amica) — 1.5k stars, on stale transformers.js
- [pixiv/three-vrm](https://github.com/pixiv/three-vrm) — v3.5.1 released 2026-03-12
- [moonshine-ai/moonshine](https://github.com/moonshine-ai/moonshine) — October 2024 release, MIT
- [Xenova/transformers.js](https://github.com/huggingface/transformers.js) — v3.2+ with Moonshine support
- [ricky0123/vad](https://github.com/ricky0123/vad) — universal VAD convergence
- [rive-app/rive-react](https://github.com/rive-app/rive-react) — 2D avatar runtime
- [mrxz/wLipSync](https://github.com/mrxz/wLipSync) — MFCC WASM, what AIRI ships
- [onnx-community/moonshine-base-ONNX](https://huggingface.co/onnx-community/moonshine-base-ONNX)
- [onnx-community/Kokoro-82M-v1.0-ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX)

**Pricing & docs (April 2026)**:
- [OpenAI API pricing](https://openai.com/api/pricing/) — gpt-4o-mini-tts, tts-1 rates
- [Google Cloud TTS pricing](https://cloud.google.com/text-to-speech/pricing) — 1M WaveNet chars free
- [ElevenLabs pricing](https://elevenlabs.io/pricing) — Creator $22/mo tier
- [Cartesia Sonic pricing](https://cartesia.ai/pricing)
- [Azure Speech pricing](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/) — 500k/mo free
- [AWS Polly pricing](https://aws.amazon.com/polly/pricing/) — 1M/mo first 12 months
- [OpenClaw TTS docs](https://docs.openclaw.ai/tools/tts) — v2026.4.7 routing

**Security & CVEs**:
- [Electron security tutorial](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron issue #46143](https://github.com/electron/electron/issues/46143) — SpeechRecognition broken in Electron 35
- [CVE-2026-34777](https://advisories.gitlab.com/pkg/npm/electron/CVE-2026-34777/) — permission handler leak
- [Chromium bug 687574](https://bugs.chromium.org/p/chromium/issues/detail?id=687574) — AEC + Web Audio
- [Chrome 139 release notes](https://developer.chrome.com/release-notes/139) — on-device SpeechRecognition

**Reviews & benchmarks**:
- [Kokoro TTS 45-day review](https://reviewnexa.com/kokoro-tts-review/) — "emotionally flat"
- [Sesame: Crossing the Uncanny Valley of Voice](https://www.sesame.com/research/crossing_the_uncanny_valley_of_voice)
- [Moonshine paper (arXiv:2410.15608)](https://arxiv.org/html/2410.15608v1)
- [DigiAlps Kokoro WebGPU benchmark](https://digialps.com/kokoro-webgpu-real-time-text-to-speech-running-100-locally-in-your-browser/)
- [Duolingo Rive breakdown](https://dev.to/uianimation/how-duolingo-uses-rive-for-their-character-animation-and-how-you-can-build-a-similar-rive-mascot-5d19)
- [macOS Enhanced System Voices guide](https://www.macobserver.com/tmo/article/how-to-obtain-and-use-enhanced-quality-system-voices-in-os-x)

**Web platform**:
- [MDN SpeechSynthesis.getVoices()](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/getVoices)
- [MDN SpeechSynthesisUtterance.boundary](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/boundary_event)
- [caniuse WebGPU](https://caniuse.com/webgpu)

---

*End of final stack decision. This document is the canonical plan. Everything else is context.*
