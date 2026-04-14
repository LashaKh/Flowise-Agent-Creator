# Feature Specification: Voice & Avatar Phase — Production-Ready v1

<!-- UPGRADED -->

## Overview

**Feature:** Transform PersonaHub Desktop from text-only chat into a multi-modal voice experience. Each AI persona becomes a character users can hear speaking and speak to, with a friendly 2D animated face above the chat that moves its mouth while the persona talks. Everything is feature-complete, well-tested, accessible, secure, and gracefully degrades on every failure mode.

**Priority:** High

**Estimated Effort:** XL (production-ready end-to-end build)

## Problem Statement

Today, each PersonaHub persona is a text conversation in a window. Users type, the persona types back, nothing more. The emotional connection is limited because there's no voice, no face, no sense of a *character* on the other side — just words on a screen. Competitors and adjacent products (Character.AI, Pi, Sesame, Replika) have shown that adding a voice and a face dramatically increases emotional attachment and perceived quality, even when the underlying AI is the same.

**Think of it like this:** Right now your persona is a text-message friend. This feature turns them into a FaceTime friend — you can see them speak, hear their voice, and talk back if you want to. And it does this without locking users into expensive hardware or cloud subscriptions.

The v1 scope is **end-to-end and production-ready**: voice input, voice output, animated face, per-persona customization, full security hardening, full accessibility, full test coverage, and every failure mode handled gracefully. This is not an MVP. It is a shippable, polished product that a real user can rely on daily.

## Constitution Alignment

This feature aligns with PersonaHub's core principles:

- [x] **Simplicity First**: Voice and face are purely additive — existing text-only users experience zero regression. A new user can enable voice with one setting, or ignore it entirely. The 2D face approach explicitly rejects the complexity of 3D rendering, photorealistic avatars, and uncanny-valley engineering.
- [x] **API-First Integration**: Voice output reuses the existing OpenClaw local gateway for cloud TTS routing. No new network infrastructure, no duplicate secret stores, no new trust boundaries beyond the text-to-LLM path that already ships.
- [x] **User Experience Excellence**: Voice feels instant on happy path, graceful on every failure path. Captions default on. Keyboard navigable end-to-end. Respects reduced-motion, screen readers, and offline mode. Preview-before-commit on voice selection. Push-to-talk by default (not always-listening) for social trust.
- [x] **Security by Default**: Voice *input* audio never leaves the device. Voice *output* text routes through the existing trusted gateway. Content Security Policy strict enough to block injected scripts from reaching the WebAssembly runtime. Microphone permission handled with OS-native dialogs and persistent hot-mic indicators. Per-persona and global kill switches always available.
- [x] **Observable Operations**: Every voice state transition (thinking, speaking, listening, error) is logged locally. Users can see the current provider, current voice, current latency, and current cost (if using paid cloud TTS) at a glance in Settings. No telemetry leaves the device without explicit opt-in.

## Clarifications

### Session 2026-04-10

- Q: Is voice input (microphone) in v1 or deferred to v2? → A: **In v1**. The user explicitly requested a production-ready feature-complete build with "everything properly hooked up and working."
- Q: Is 3D avatar in v1 or deferred? → A: **Deferred indefinitely**. User chose the 2D path. 2D ships faster, has lower uncanny-valley risk, works on every machine, and competitors (Character.AI, Duolingo, VTubers) prove it's emotionally sufficient.
- Q: Default language for voice input transcription? → A: **English in v1**. The highest-quality compact transcription model that fits browser constraints is English-only. Voice *output* can speak any language the selected provider supports (cloud providers cover 30+ languages; OS-native fallback inherits user's system locale).
- Q: Default voice output provider when user has not configured any API key? → A: **OS-native browser voice**. Zero cost, zero friction, always available, works offline. Users upgrade to cloud providers (OpenAI, ElevenLabs, Google) by adding their own API key in Settings.
- Q: Is microphone permission requested eagerly during first-run setup, or lazily on first use? → A: **Lazily on first use**. Avoids scaring new users with a permission dialog before they understand why. Consistent with how mobile apps of 2024–2026 handle sensitive permissions.

## User Stories

### Story 1 — First voice moment

> As a new PersonaHub user,
> I want to hear my persona speak its first reply aloud with a friendly face moving its mouth,
> So that it feels like a real character is talking to me, not just text on a screen.

### Story 2 — Hands-free conversation

> As a user who prefers speaking over typing,
> I want to hold a button to talk to my persona and hear the reply spoken back,
> So that I can have a natural back-and-forth without touching the keyboard.

### Story 3 — Distinct personas

> As a user with multiple personas,
> I want each persona to have its own distinct voice and appearance,
> So that switching between them feels like switching between real characters, not recoloring the same one.

### Story 4 — Privacy-first user

> As a user who doesn't want audio leaving my device,
> I want to choose a local-only voice mode that never uses cloud APIs,
> So my voice input and output stay fully on my machine.

### Story 5 — Offline traveler

> As a user on unreliable internet (plane, rural area, hotel wifi),
> I want voice features to keep working when the network is down,
> So that the feature is reliable wherever I am.

### Story 6 — Accessible use

> As a user who depends on captions, keyboard navigation, or a screen reader,
> I want every voice and face feature to be reachable through accessibility tools,
> So that the feature is usable without vision, without hearing, or without a mouse.

### Story 7 — Power user with API keys

> As a user who already has OpenAI or ElevenLabs keys for other tools,
> I want to plug those keys in for higher-quality voice output,
> So that I get premium quality at a fraction of a cent per reply.

### Story 8 — Low-spec laptop user

> As a user on an older laptop with integrated graphics,
> I want the feature to work without melting my CPU or spinning my fan constantly,
> So that I can use it all day without thermal throttling or battery drain.

### Story 9 — Text-only preference

> As a user who prefers typing in quiet spaces like libraries and offices,
> I want to turn voice off entirely (globally or per persona),
> So that the feature doesn't force itself on me when I don't want it.

### Story 10 — Custom persona creation

> As a user making a brand-new persona,
> I want to pick the voice and face during creation and preview both before saving,
> So that I know exactly what I'm making before I commit.

### Story 11 — Mid-conversation interruption

> As a user who changed my mind mid-reply,
> I want to send a new message and have the persona stop speaking the old one,
> So that the conversation stays responsive and feels natural.

### Story 12 — Microphone denial

> As a user who denied microphone access by mistake or on purpose,
> I want the app to keep working cleanly without the voice input feature,
> So that one permission choice doesn't break the rest of the app.

### Story 13 — Shared machine

> As a user who shares my physical device with family, roommates, or co-workers,
> I want my API keys, voice preferences, and microphone permissions scoped only to my own operating system user account,
> So that nobody else using this computer can accidentally spend my cloud credits, hear my conversations, or change my voice settings.

### Story 14 — Undo an accidental voice change

> As a user who changed a persona's voice or face and immediately regretted it,
> I want a one-click Undo action available for a short time after the save,
> So that I can restore the character I already knew without hunting through menus or rebuilding settings.

### Story 15 — Replay the last spoken reply

> As a user who missed what the persona just said (background noise, got distracted, partial hearing),
> I want a visible control to replay the last spoken reply without re-triggering the language model,
> So that I can catch what I missed without wasting cost or breaking the conversation flow.

## Requirements

### Functional Requirements

#### FR-1: Voice Output (Speech Synthesis)

1. Every persona reply must be spoken aloud by default once the reply text is complete.
2. Voice output must use a tiered fallback chain: **cloud provider → OS-native browser voice → silent with clear messaging**, with automatic failover on any failure.
3. Users must be able to choose from at least three cloud providers (OpenAI, ElevenLabs, Google) in addition to the OS-native fallback.
4. Each persona must be assignable to a distinct voice identifier, with at least 20 voice options available between OS-native and cloud providers.
5. Users must be able to preview any voice before selecting it (a "Hi, I'm {persona name}" sample plays on click).
6. Voice output must stop within 200 milliseconds when the user sends a new message or presses a visible stop button (interruption).
7. Voice output must automatically fall back to OS-native voice when cloud provider returns an error (invalid key, network failure, rate limit, timeout).
8. Voice output must work fully offline through OS-native voices.
9. Voice audio must never be persisted to disk, cached, or logged.
10. Voice output must be disableable globally (in Settings) and per-persona (in persona edit panel).
11. First audio must begin within 1 second of reply completion on happy path (warm cloud) and within 3 seconds on degraded path (cold OS-native voice on low-spec hardware).
12. Users must be able to adjust voice speed per-persona (range: 0.5× to 2.0×).
13. Voice output must not play when the application window is minimized or has lost focus for more than 2 seconds (configurable).
14. The TTS provider used must be visible at-a-glance in the UI (small indicator on the avatar or in the chat header).
15. Voice output for an ongoing persona reply must be cancelled automatically when the user switches to a different persona in the sidebar.

#### FR-2: Voice Input (Speech Recognition)

16. Users must be able to activate voice recording by pressing and holding a dedicated microphone button in the message input area.
17. Users must be able to activate voice recording by pressing and holding the Space key while the message input field is focused.
18. Recorded speech must be transcribed locally on the user's device. Voice audio must never be sent to any cloud service.
19. Transcription must complete within 3 seconds for a 5-second utterance on reference low-spec hardware.
20. Transcribed text must appear in the message input field and must NOT be auto-sent; the user reviews and confirms before sending.
21. Users must be able to edit the transcribed text before sending.
22. Users must be able to cancel an in-progress recording at any time via the Escape key or by releasing the button.
23. Microphone permission must be requested at the moment of first use, not during application setup.
24. Microphone permission denial must be handled gracefully: the voice input button becomes disabled with a tooltip explaining how to re-enable in System Settings. All other features remain fully functional.
25. The microphone must stop recording automatically when the application window loses focus.
26. The microphone must stop recording automatically when the operating system is locked, sleeps, or suspends.
27. The active recording state must be visually indicated by at least two independent cues (e.g., a red dot on the avatar face, a pulsing ring around the microphone button, an emerald border on the input field).
28. A global keyboard shortcut (`Ctrl+Shift+M` on Windows/Linux, `Cmd+Shift+M` on macOS) must force-stop the microphone from anywhere in the application.
29. Raw audio buffers captured for transcription must not be persisted to disk, cached, or logged.
30. Voice input must support English in v1. Non-English utterances must produce a graceful error rather than garbled transcription.
31. Voice input must be disableable globally (in Settings) and per-persona.
32. If voice input is active for more than 10 minutes with no speech detected, the microphone must auto-stop and notify the user.

#### FR-3: Avatar Face

33. Each persona must have a visible 2D animated face rendered above the chat messages area inside the existing chat window.
34. The face must visibly animate its mouth in rhythm with the voice output during speaking state.
35. The face must show idle micro-animations (blinking, subtle breathing) when not actively speaking.
36. The face must display distinct visual states for: idle, thinking (LLM pending), speaking (TTS active), listening (mic active), and error.
37. Users must be able to choose from at least 6 face style presets at persona creation time.
38. Face style presets must cover diverse appearances (varied skin tones, hair colors, apparent gender presentations, age cues).
39. The face must support a per-persona accent color or hue that tints elements such as eye color or outline.
40. Users must be able to hide the face (globally in Settings, per-persona in edit panel). Hidden face falls back to the existing emoji/initial avatar used today.
41. The face must respect the operating system's `prefers-reduced-motion` setting: when reduced motion is active, all idle animations stop but essential lip movement continues for voice output.
42. The face container must have an ARIA label describing the persona and current state for screen readers.
43. The face must resize responsively to the chat window width; minimum viable size is 240 pixels tall.
44. When the face cannot render (WebGL failure, invalid asset), the application must gracefully fall back to the existing emoji/initial avatar without blocking chat.
45. The face must maintain at least 24 frames per second on reference low-spec hardware during the speaking state.
46. Face rendering must use less than 5% CPU on reference low-spec hardware during the idle state.

#### FR-4: Captions

47. A caption strip must appear below the avatar face showing the text currently being spoken.
48. Captions must be enabled by default and toggleable via a visible control in the chat header.
49. Caption updates must be announced to screen readers via an ARIA live region.
50. Captions must match the spoken audio within 300 milliseconds of the word being spoken.
51. Caption text must remain visible for at least 2 seconds after the reply finishes speaking, then clear.
52. Caption font size and contrast must meet WCAG 2.2 AA requirements.

#### FR-5: Settings & Configuration

53. A new Settings section titled "Voice & Avatar" must contain all global voice and face preferences.
54. The Settings section must include: enable/disable voice output globally, enable/disable voice input globally, default voice provider, default voice, default face style, captions on/off, reduced motion override, local-only mode toggle, auto-stop on window blur toggle.
55. Users must be able to enter API keys for each supported cloud provider (OpenAI, ElevenLabs, Google).
56. API keys must be stored in the operating system's secure credential store (macOS Keychain, Windows Credential Manager, Linux Secret Service). API keys must never be written to plain-text files or logs.
57. Users must be able to test the current voice provider configuration from Settings with a single button that plays a sample utterance.
58. Persona creation must include voice and face selection with live preview.
59. Persona editing must allow changing voice and face without losing other persona data.
60. All voice and face settings changes must take effect immediately, without requiring an application restart.
61. Users must be able to reset all voice settings to defaults with a single action.
62. The Settings section must display current cloud TTS usage cost estimate (if the user is using a paid provider).

#### FR-6: Accessibility (WCAG 2.2 AA baseline)

63. All new interactive elements must be reachable by keyboard with a visible focus indicator.
64. All new interactive elements must have descriptive ARIA labels.
65. Captions must default to on and update via an ARIA live region.
66. Reduced-motion preference must disable non-essential animations (breathing, micro head sway, hover effects) while preserving essential motion (mouth movement for lip sync, caption text).
67. Color must never be the sole indicator of state; all state changes must also have a text, icon, or shape change.
68. Focus order must be logical and follow the visual layout.
69. Screen readers must announce persona name, current voice state, and current listening state as they change.
70. The microphone button must expose `aria-pressed` state during recording.
71. The voice output toggle must expose `aria-checked` state.
72. Any audio-only feedback (start/stop recording tones) must have an equivalent visual indicator.
73. All new text must meet the WCAG 2.2 minimum contrast ratio of 4.5:1 against its background.

#### FR-7: Privacy

74. Voice audio (input recordings, output synthesis) must never be persisted to disk, cached, or transmitted anywhere the user did not explicitly authorize.
75. A clear privacy statement must be visible in the Settings section: "Your voice never leaves your device. Voice input is transcribed locally. Voice output text (not audio) is sent to your chosen provider, using the same trust boundary as your regular chat messages."
76. A Local-Only mode toggle must exist that disables all cloud TTS calls and uses only OS-native voice output.
77. User-provided API keys must never be sent anywhere except the corresponding provider's official endpoint.
78. Microphone access must request the user's permission through the operating system's native mechanism on first use.
79. The hot-mic state must be communicated by at least two independent, persistent visual indicators at all times during recording.
80. When the application is backgrounded, locked, or suspended, the microphone must be released within 200 milliseconds.

#### FR-8: Security

81. The application must upgrade its shell to a version that closes known permission-handler vulnerabilities present in the currently-shipped version.
82. A strict Content Security Policy must be active in the renderer process, allowing only the minimum sources required for voice and face features to function.
83. On macOS, the application must declare microphone entitlements and the required usage description; without these, hardened-runtime builds would crash on first microphone access.
84. On Windows, the application must handle the case where the operating system's global microphone privacy toggle is disabled.
85. On Linux, the application must handle the case where no audio input device is available or no audio server (PulseAudio / PipeWire) is running.
86. All inter-process messages related to voice features must validate both the sender origin and the payload shape.
87. Payload size limits must prevent denial-of-service via oversized text (TTS) or oversized audio (STT) inputs.
88. Model files downloaded for local transcription must be verified against a known-good cryptographic hash before use.
89. Model files must be fetched from a main-process network call, not from the renderer, to keep the renderer's allowed network destinations minimal.

#### FR-9: Error Handling & Graceful Degradation

90. Network failures during cloud TTS must silently fall back to OS-native voice without interrupting the user.
91. Invalid cloud API keys must show a non-blocking error in Settings with specific recovery guidance ("Your OpenAI key was rejected. Check it at platform.openai.com/api-keys and try again.").
92. Microphone hardware failures must not crash the application; the voice input feature becomes disabled with a tooltip.
93. Operating systems without any text-to-speech voices installed (rare on Linux) must gracefully disable voice output with a hint ("Install a TTS voice in your system settings to enable voice output").
94. Transcription model download failures must be retryable; users see a Retry button, not a stack trace.
95. Voice synthesis failure for a single reply must not block subsequent text chat.
96. Voice transcription failure must return the user to plain text input without losing any unsent draft.
97. Every error that prevents a user action must surface a human-readable message; no silent failures.
98. The application must survive 24 hours of continuous voice use without memory growth exceeding 100 megabytes in the renderer process.
99. Rapid-fire user messages (10 messages in 5 seconds) must be handled without memory leaks, crashes, or stuck UI states.
100. Multiple simultaneous voice state transitions (user speaks, persona replies, user speaks again) must be serialized cleanly with no race conditions.

#### FR-10: Performance

101. Application cold-start time must not regress by more than 10% compared to the pre-feature baseline.
102. Total memory footprint during active voice use must stay below 2 gigabytes on the reference low-spec hardware.
103. CPU usage during voice output must stay below 30% average on reference low-spec hardware.
104. Lazy loading must defer any large voice-related code or models until the first voice feature is used.
105. Idle voice models must be unloaded after 5 minutes of inactivity to reclaim memory.
106. Face animation loops must be paused when the application window is hidden or minimized.
107. The main user interface must remain responsive during voice synthesis and transcription (no frozen frames longer than 100 milliseconds).
108. Application installer size must not grow by more than 15 megabytes over the current baseline.

#### FR-11: Data Persistence

109. Voice and face settings for each persona must persist across application restarts.
110. Global voice preferences must persist across application restarts.
111. API keys must persist securely across application restarts using the operating system's credential store.
112. Chat history (including user messages captured via voice input) must persist in the existing local database.
113. No database schema migration must be required for existing users; new settings must flow through the existing settings field that is already stored as a flexible document.
114. Users must be able to export and import their voice settings (excluding API keys) alongside the existing persona export/import flow.

#### FR-12: Testing & Quality Assurance

115. Automated unit tests must cover the voice state machine (idle → thinking → speaking → interrupted → idle; idle → listening → transcribing → idle).
116. Automated unit tests must cover every fallback path (cloud → native, native → disabled, error → recovery).
117. Automated unit tests must cover persona CRUD operations with voice and face fields.
118. Automated unit tests must cover settings persistence, API key secure storage, and key retrieval.
119. Automated integration tests must cover the end-to-end happy path (send message → receive reply → speak reply → face animates).
120. Automated integration tests must cover the voice input happy path (hold button → record audio → transcribe → insert into input field).
121. Manual test matrix must cover macOS, Windows, and Linux on at least one reference machine each.
122. Manual tests must cover online, offline, and degraded-network scenarios.
123. Manual tests must cover microphone granted, denied, revoked-after-grant, and globally-disabled scenarios.
124. Automated accessibility audit must pass WCAG 2.2 AA for all new user interface.
125. Memory leak test must pass after 24 hours of simulated continuous voice conversation.
126. Failure injection tests must verify graceful degradation for each documented failure mode.
127. All tests must run in continuous integration on every pull request before merge.
128. Test coverage for new voice code must meet or exceed the project's existing coverage threshold.
129. A manual screen-reader pass must be completed on VoiceOver (macOS), NVDA (Windows), and Orca (Linux) on a representative sample of new screens before ship. The pass must verify that voice-state transitions are announced via a polite live region, errors via an assertive live region, and that no new keyboard shortcut collides with a documented shortcut of those screen readers or the host operating system.
130. An automated test must complete a full voice conversation using only keyboard input (no mouse, no voice input) to verify end-to-end keyboard reachability.
131. An automated test must capture outgoing network traffic during Local-Only mode and assert zero cloud TTS requests.
132. An automated soak test must alternate user voice and persona voice for at least 72 hours and assert that renderer memory growth stays below the documented threshold and that main process memory growth stays below a separately documented threshold.
133. An automated test must send 5 messages within 5 seconds and assert that no audio overlap occurs and no orphaned voice sessions remain in memory.
134. An automated test must run a first-voice smoke test on each supported platform after every release build (macOS, Windows, Linux) and fail the release if any platform fails.
135. A redaction test must inject a known API key pattern into every error path, crash handler, support-bundle export, and diagnostic log, and assert that the key never appears in any emitted output.
136. A cross-feature test must verify that the existing persona export, persona duplicate, persona import, and clear-chat-history operations behave correctly when a persona is mid-speech.

#### FR-13: User Interface Integration

137. The animated face must occupy a dedicated, collapsible band positioned between the persona header and the message list in the existing chat window. The band must be user-togglable via a collapse control in the persona header. When collapsed, the header must continue to show a small state badge reflecting idle, thinking, speaking, listening, or error state.
138. The face band must never obscure the newest message, must not push the message input out of view on small window sizes, and must scroll with the window rather than float over content.
139. The microphone control must appear as a dedicated button positioned to the left of the message text field, with the Send button remaining in its current position to the right of the text field. While recording, the text field must display a persistent visual recording state (such as a pulsing ring and a placeholder change to "Listening…") and must remain editable so the user can type alongside speech without losing any unsent draft.
140. The global Voice & Avatar preferences must live alongside the existing sections on the same Settings page (not as a separate window or modal). When the section grows beyond a screen-height, it must be internally grouped into clearly labelled subsections (Output, Input, Face, Providers & Keys, Privacy) with each subsection collapsible and remembering its collapsed state across sessions.
141. The persona sidebar must display a small speaker icon next to the persona that is currently speaking and a small microphone icon next to any persona actively recording, so that users who switch contexts always know which persona owns the active audio stream.
142. A persistently visible Stop Voice control must appear in the main chat area whenever any voice output is playing. Pressing it must silence playback across all personas within 200 milliseconds without sending any new message.
143. The new Voice & Avatar section in Settings must display the cloud TTS provider currently in use, the voice identifier, and a one-click "Run Diagnostics" action that performs independent health checks (secure-storage readable, local gateway reachable, cloud provider credentials valid, operating-system voice enumeration succeeds, microphone permission granted, any required model file present and verified) and reports a pass/fail with a specific error code per stage.
144. The persona creation modal in the sidebar must grow new fields for voice picker (with preview) and face picker (with preview) inserted between the Description field and the Advanced options disclosure, without collapsing any existing field and without breaking the existing creation flow for users who skip voice entirely.
145. A visible "Replay last reply" control must appear next to the most recent persona reply in the chat history, allowing users to hear the last spoken reply again without re-triggering the language model.

#### FR-14: Edge Case Handling

146. When the operating system reports that microphone permission has been revoked after a previous grant, the application must detect the revocation on the next recording attempt, disable the microphone button, display a non-blocking message stating that permission was revoked in System Settings, and provide direct instructions to re-enable it. The in-memory permission state must be updated without requiring an application restart. Permission status must also be re-checked on window focus so users who re-grant permission from System Settings can return to the app and use the microphone without restarting.
147. When a cloud voice provider returns a billing, quota, authentication, or rate-limit error (such as HTTP 402, HTTP 429, HTTP 401), the application must fall back to the operating system voice for the current reply to avoid interruption, and must also surface a clearly distinguishable non-blocking notice in the chat area stating the specific reason category (billing, quota exhausted, rate limited, authentication rejected) along with a direct action to open Settings or the provider's billing page. Transient network failures must be visually distinguished from persistent configuration failures so users know which ones will resolve on their own.
148. When the local gateway is unavailable at the moment a voice output is requested, the application must detect the condition within 2 seconds, fall back to the operating system voice for the current reply without blocking the chat stream, and display a small health indicator explaining that cloud voices are temporarily unavailable. The application must automatically retry gateway reachability in the background and restore cloud voice routing once it recovers, without requiring a restart.
149. Before spoken output, reply text must be normalized for listening: empty and whitespace-only replies must be skipped silently with a non-audible caption state, URLs and code fences must be replaced with short spoken placeholders (such as "link" or "code block"), Markdown formatting symbols must be stripped, and replies over the maximum spoken length must be summarized or segmented according to a documented policy. The captions displayed must match what is actually spoken, not the raw reply, and the full original reply must remain visible in the chat transcript unchanged.
150. Any text passed to a cloud TTS provider must be escaped or stripped of markup control characters before being sent, so that no speech control syntax (SSML or equivalent) can be injected via reply text or persona name. The voice subsystem must accept persona names containing any Unicode character without error, non-ASCII persona names must be included in the test matrix for the synthesis path, and every voice identifier displayed in the user interface must have a human-readable label.
151. Deleting the currently-speaking persona, editing its voice settings, or clearing its chat history must immediately stop any active voice output, release any microphone session, clear any caption state, and return the face area to a safe empty state. The user must see a brief visual confirmation that the spoken reply was stopped. No partially-applied setting may be heard in the trailing audio of the interrupted reply.
152. When the active audio input or output device is removed, disabled, or auto-switched during a voice session (for example, unplugging Bluetooth headphones or a USB microphone), the application must detect the change, gracefully stop or re-route the current session to the new default device, update the face and caption state to reflect reality, and display a short message naming the new device. The user must never be stuck in a silent "speaking" state caused by a vanished device.
153. When the operating system voice list is empty at the moment voice output is first requested, the application must wait briefly for the operating system to finish enumerating voices and retry before declaring voice output unavailable. If the list is still empty after a reasonable wait, the "no voices installed" guidance must be shown with platform-specific instructions to add a voice.
154. Transcription model downloads must be resumable across application restarts, must verify the completed file against a known-good cryptographic hash before first use, must automatically delete and re-download any file that fails verification, and must detect insufficient disk space or permission failures before the download begins. Every failure state must offer a one-click retry and a user-visible explanation of what went wrong.
155. Concurrent voice operations must follow explicit ordering rules: a stop or interruption must complete before any new synthesis starts; a settings change mid-synthesis must apply only to the next utterance, never to the current one; pressing the microphone button during a spoken reply must stop the reply before recording begins; and two stop requests in rapid succession must be idempotent. The application must never produce overlapping audio, and the user interface must always reflect the single currently-active voice state.
156. The application must define and enforce user-visible maximum lengths for typed input, transcribed input, and spoken reply text. When a limit is exceeded, the excess content must be preserved in the chat transcript but not spoken, the user must see a clear message explaining the limit, and the oversized content must never freeze or block the user interface.
157. When all voice tiers are unavailable at the same time (no cloud API key configured, no operating-system voices available, and no microphone accessible), the application must automatically enable captions by default, display a clear single-screen explanation of which capabilities are missing, and offer a direct action for each one (add a key, install a system voice, grant microphone access). Text chat must remain fully functional, and the face must render in a safe idle state without attempting any speaking animation.
158. At the moment a persona is loaded, the application must validate that its configured voice provider, voice identifier, and avatar style are still available. If any referenced asset is missing (because a provider was removed, an API key was deleted, or an avatar style was discontinued), the application must fall back to the global default, mark the persona as needing attention, and surface a one-time prompt letting the user re-pick the missing item. No persona may become silent or faceless without an explicit, visible notice.
159. All voice and avatar settings loaded from storage or imported from a file must be validated against their documented ranges before being applied. Any value outside the allowed range, of the wrong type, or missing must be replaced with the documented default, and the user must see a non-blocking notice that the imported file contained invalid values that were reset.
160. On every application launch, the application must guarantee that no microphone session from a previous run remains active and that no audio buffers from a previous session are loaded, played back, or restored. Any crash that occurred during an active recording or during a spoken reply must result in a clean state on the next launch, with no residual audio heard and no residual hot-mic indicator shown by the operating system.
161. The first press of the microphone button in the application's lifetime must display a brief in-app explanation card stating what the microphone will be used for and confirming that audio never leaves the device, with a single Continue action that triggers the operating system's native permission dialog. Any text already in the message input at that moment must be preserved across the entire permission flow.
162. A visible Stop control must appear next to the active speaking persona whenever voice output is playing, and pressing it must silence playback within 200 milliseconds without sending any message. Pressing Escape during an active recording must discard the captured audio, return the input field to exactly the state it was in before recording began, and restore keyboard focus to the text field. Any reply whose voice synthesis failed must display a small Retry control next to the message that re-attempts synthesis against the current provider chain. Any recording whose transcription failed must display a Retry Transcription control that reruns transcription on the captured buffer if still in memory or prompts the user to re-record if the buffer has already been discarded.
163. When a cloud provider's authentication fails during an active voice output, the currently-playing utterance must complete on the operating-system fallback voice rather than abort mid-sentence, and a single non-blocking notice must appear explaining that the key was rejected and how to fix it. Switching the default provider in Settings while a reply is speaking must allow the current utterance to finish on the previous provider; only the next reply must use the new provider. Removing or replacing an API key in Settings must display the list of personas that were depending on that provider so the user can reassign them intentionally.
164. Quitting the application while a reply is speaking must cleanly discard the in-flight audio buffer and release the audio device before the process exits. Hiding the application to the system tray must stop both voice output and microphone recording within 200 milliseconds, matching the window-blur behaviour. The automatic updater must postpone any restart prompt until at least 5 seconds after the last voice activity and must never restart during an active microphone recording. Showing the window via the existing global shortcut must not resume previously-interrupted voice playback.
165. Clearing a persona's chat history while that persona is speaking must immediately stop voice output and discard the utterance. Duplicating a persona must clone all voice and face settings exactly, including the per-persona voice identifier and speed. Exporting a persona must display a visible notice that API keys are intentionally excluded for security and must never include them in the exported file. Importing a persona whose selected cloud provider has no configured API key on the target machine must default that persona to operating-system voice output and show a single notice so the user can add the key later from Settings.
166. Transcribed voice input must be treated with the same trust level as typed text (no elevated privileges), must be visually distinguishable in the input field so the user sees exactly what will be sent, must be passed through the same content-length limits and sanitization as typed messages, and must never bypass the pending-user-review step under any code path (including keyboard shortcuts, accessibility tools, or future automation).
167. Every diagnostic output the application produces — crash reports, error dialogs, local logs, support bundles, clipboard copies of error messages, and console output — must pass through a redaction step that masks API key patterns and any string stored in the secure credential store before being written or displayed.
168. Every new voice-related inter-process channel must be listed explicitly in implementation documentation, each channel must declare the exact window that is allowed to call it, each channel must reject calls from any other sender with a logged security event, and each channel that initiates microphone capture or cloud network activity must enforce a per-minute call-rate ceiling.

### Non-Functional Requirements

1. **Reliability**: 99% of voice output requests on happy path must succeed or fall back gracefully without user-visible crashes.
2. **Cross-platform**: The feature must function on macOS 13+, Windows 10+, and recent mainstream Linux distributions.
3. **Privacy**: Zero bytes of voice audio may be persisted to disk. Verified by code audit and automated tests.
4. **Security**: No known high-severity shell vulnerabilities may be present in the application at ship time.
5. **Accessibility**: WCAG 2.2 AA compliance for all new user-facing elements.
6. **Performance**: Feature must remain usable on hardware as weak as Intel UHD 620 integrated graphics with 8 GB RAM.
7. **Cost to user**: Default configuration (OS-native voices) must be free. Cloud configurations must keep a typical user (10 minutes of voice per day) below $5 per month using the cheapest available cloud provider.
8. **Maintainability**: The voice provider layer must be structured so that adding a new provider requires no changes to the chat pipeline, the face component, or the settings UI shell.
9. **Reversibility**: Users must be able to disable the entire feature and return to the pre-feature experience without data loss.
10. **Documentation**: End-user documentation must cover setup, supported providers, troubleshooting, and privacy guarantees.
11. **Cost governance**: Each cloud TTS provider configuration must allow the user to set a monthly spending ceiling. The application must display a clear warning when the estimated spend passes 80% of the ceiling (configurable), must automatically stop sending paid TTS requests and silently fall back to OS-native voice when the ceiling is reached, and must enforce a per-24-hour character-count cap to protect against runaway loops even before the monthly cap is hit.
12. **Redaction**: Any diagnostic output the application produces (crash reports, error dialogs, local logs, support bundles, clipboard copies of error messages, console output) must pass through a redaction step that masks API key patterns, authorization headers, outgoing request bodies, and any string stored in the secure credential store before being written or displayed. Voice-related log entries, crash reports, and user-visible error messages must never include the reply text being spoken, the transcription text being captured, or any portion of an outgoing request body.
13. **Retry policy**: The cloud-to-native fallback for transient network failures must first attempt a short exponential-backoff retry on timeout and transient errors (up to 3 attempts), must remember the fallback state per session and not flap more than 5 times between cloud and native per session, and must expose a "prefer native voice for this session" state so the user can stop being repeatedly interrupted by provider changes on a flapping connection.
14. **Feature flag**: A global feature flag must exist that can disable all voice and avatar functionality with a single setting change so a hotfix can turn the feature off without rolling back the entire application. Existing personas created before this feature must automatically inherit sensible global defaults on first open with no manual intervention required. The data format for new voice fields must be forward-compatible so a user downgrading to an older application version loses access to voice settings but does not lose any other persona data.
15. **Worker thread budget**: The feature must declare an explicit maximum number of simultaneously-active background workers and must leave headroom for the existing chat pipeline so voice features cannot starve text chat of CPU. The face animation must have a documented degradation ladder (full → reduced idle animation → mouth-only → static) that kicks in when CPU usage exceeds the defined budget, and the degradation state must be visible in the diagnostic log.
16. **Theme compliance**: The face component, caption strip, and all new voice-related user interface must adapt to the application's current visual theme and must be verified in the default dark palette. The face and captions must render crisply at 100%, 150%, 200%, and fractional display scales on each supported platform. Any file-system path shown in diagnostics or error messages must be displayed in a form that does not reveal the user's home directory or raw OS-specific path separators.
17. **Secure storage fallback**: When the operating system's secure credential store is unavailable (for example, Linux without Secret Service), the application must display a clear blocking message explaining that API-key features require the secure store and must not fall back to plain-file storage under any circumstance.
18. **Voice availability awareness**: The application must detect the installed voice set on each operating system and warn the user when only a low-quality default is available (for example, Linux eSpeak). The voice-availability probe must re-run whenever Settings opens so newly-installed system voices are picked up without a restart.
19. **Shared-machine isolation**: All voice credentials and voice preferences must live within the current operating system user profile, must not be readable by other user accounts on the same machine, and switching operating system users must fully reset any in-progress voice session.
20. **Implementation ownership**: Implementation of this specification is owned by the PersonaHub `coder` agent or a developer following PersonaHub Desktop conventions. Any references to clinical-domain agents, medical-role permission tiers, or healthcare-specific workflows that may appear in shared command templates do not apply to this project and must be ignored.

## Acceptance Criteria

### Primary voice output flow
- [ ] User sends a text message; persona's text reply begins streaming into the UI.
- [ ] When the reply completes, the persona's face begins animating its mouth within 1 second (warm cloud) or 3 seconds (cold OS-native).
- [ ] Audio plays through the user's default output device in the selected voice.
- [ ] Captions appear under the face, word-synchronized within 300 ms of the audio.
- [ ] When the reply finishes, the face returns to idle and captions clear after 2 seconds.
- [ ] User sends a new message mid-speech; audio stops within 200 ms and the new reply begins cleanly.

### Primary voice input flow
- [ ] User clicks the microphone button for the first time; operating system's native permission dialog appears.
- [ ] User grants permission; the button enters recording state with a visible pulsing indicator.
- [ ] User holds the button (or Space key) and speaks a 5-second utterance.
- [ ] User releases the button; transcribed text appears in the message input field within 3 seconds.
- [ ] User reviews the text, edits if needed, and presses Send.
- [ ] The original voice audio is not saved anywhere on disk (verified by file system audit).

### First-run experience
- [ ] A new user installs the application and creates their first persona.
- [ ] The persona creation flow includes a "Voice" picker and a "Face" picker with live previews.
- [ ] The user can choose any voice from the OS-native list without configuring anything.
- [ ] The user sends their first message and hears the persona speak within 3 seconds.
- [ ] The total time from install to hearing the first voice is under 3 minutes.

### Privacy & security
- [ ] Local-Only mode, when enabled, prevents any cloud TTS calls (verified by network traffic inspection).
- [ ] Voice audio (input or output) is not written to any location on disk under any code path (verified by audit).
- [ ] API keys are stored in the operating system's secure credential store, not in plain-text files (verified by audit).
- [ ] Microphone denial does not prevent text chat from working.
- [ ] Microphone stops within 200 ms when the window loses focus.
- [ ] The application shell is upgraded to a version with no known high-severity permission-handler vulnerabilities.

### Accessibility
- [ ] All new UI is reachable and operable using only the keyboard.
- [ ] A screen reader announces persona name, voice state changes, and caption updates.
- [ ] `prefers-reduced-motion` disables idle animations but keeps essential lip movement.
- [ ] All new text passes WCAG 2.2 AA contrast ratio checks.
- [ ] Captions default to visible and can be toggled from the chat header.

### Reliability & fallback
- [ ] Disconnecting the network mid-session causes voice output to transparently fall back to OS-native voice with no error dialog.
- [ ] Providing an invalid cloud API key shows a specific, actionable error message and does not crash.
- [ ] Denying microphone permission disables the mic button cleanly, leaves everything else working.
- [ ] Opening and closing the application 50 times in succession reveals no memory growth above 100 MB.
- [ ] Running a 24-hour soak test with continuous conversation reveals no crashes, no memory leaks above threshold, and no audio/caption desync.

### Cross-platform
- [ ] All acceptance criteria above pass on macOS 13+, Windows 10+, and a recent mainstream Linux distribution.
- [ ] On Linux without PulseAudio or PipeWire, the feature gracefully disables with a clear message.
- [ ] On Windows with the global microphone privacy toggle off, the feature gracefully disables with a hint to enable it in OS settings.

### Performance
- [ ] Cold start time is within 10% of the pre-feature baseline.
- [ ] Memory during active voice use is below 2 GB on reference low-spec hardware.
- [ ] CPU during voice output is below 30% average on reference low-spec hardware.
- [ ] Face animation maintains at least 24 FPS on reference low-spec hardware.
- [ ] Installer size growth is under 15 MB.

### Testing
- [ ] Unit test coverage for the new voice code paths meets or exceeds the project baseline.
- [ ] All automated tests pass in continuous integration.
- [ ] Automated accessibility audit passes with zero errors.
- [ ] Manual test matrix is documented and signed off.

### Edge cases & error recovery
- [ ] An empty or whitespace-only persona reply produces no audio output, no TTS error, and a clear non-audible caption state.
- [ ] A persona reply containing Markdown, code fences, or URLs is spoken with safe placeholders ("link," "code block") and the captions match the spoken version while the transcript shows the original.
- [ ] Microphone permission revoked at OS level after previous grant is detected on next record attempt, and the mic button disables with clear recovery instructions.
- [ ] Cloud TTS billing/quota/rate-limit errors show a specific, non-blocking notice distinguishing transient from persistent failures, and fall back to OS-native voice for the current reply.
- [ ] Local gateway unavailable at moment of voice request falls back to OS-native voice within 2 seconds with a small health indicator.
- [ ] Audio output device unplugged mid-speech re-routes to the new default device with a brief notification and no stuck "speaking" state.
- [ ] Transcription model download interrupted at any point can be resumed on next attempt; corrupted files are auto-deleted and re-downloaded.
- [ ] Rapid persona switching (10 switches in 10 seconds) produces no orphaned audio sessions, no overlapping audio, and no memory growth.
- [ ] Application launched after a crash during recording shows a clean state with no residual mic indicators or audio playback.
- [ ] All voice tiers unavailable simultaneously (no key, no OS voices, no mic) shows a clear single-screen explanation with direct recovery actions.
- [ ] Settings import with out-of-range values (NaN hue, 100× speed) is caught, replaced with defaults, and a non-blocking notice shown.
- [ ] A persona configured with a provider whose API key was later deleted falls back to the global default with a visible "needs attention" prompt.

### UI integration
- [ ] Avatar face band appears between persona header and message list, collapses via header control, and shows a small state badge when collapsed.
- [ ] Microphone button appears to the left of the text field; Send button remains to the right. Text field preserves draft text during recording.
- [ ] Voice & Avatar Settings lives on the existing Settings page as a new collapsible section with subsections (Output, Input, Face, Providers & Keys, Privacy).
- [ ] Persona sidebar shows a speaker icon next to the currently speaking persona and a mic icon next to any persona actively recording.
- [ ] Persona creation modal includes voice and face pickers (with preview) between Description and Advanced, without breaking existing fields.
- [ ] A "Run Diagnostics" button in Voice & Avatar Settings reports pass/fail per stage (credential store, gateway, provider, voices, mic, model).
- [ ] Global Stop Voice control silences all playback within 200 ms without sending any message.
- [ ] New keyboard shortcuts are user-configurable and checked for conflicts with existing app shortcuts and OS shortcuts on first launch.

### Cost governance
- [ ] Monthly spending ceiling is configurable per cloud provider; reaching the ceiling automatically falls back to OS-native voice.
- [ ] A visible warning appears when estimated spend passes 80% of the user's configured ceiling.

## Success Criteria

Measurable outcomes for production-ready shipment:

- **SC-01**: 99% of voice output attempts succeed or fall back gracefully without user-visible errors (measured over 1,000 test conversations).
- **SC-02**: First audio begins within 1 second of reply completion on cloud happy path for 95% of requests.
- **SC-03**: A usability test with 5 new users shows each can create a persona with voice and face and hear it speak within 90 seconds.
- **SC-04**: A code audit confirms zero bytes of voice audio are ever written to disk in any code path.
- **SC-05**: Application cold-start time regression is less than 10% on the reference low-spec machine.
- **SC-06**: A 24-hour continuous use soak test shows renderer memory growth less than 100 megabytes.
- **SC-07**: An automated WCAG 2.2 AA audit of the new user interface returns zero errors.
- **SC-08**: A manual keyboard-only navigation audit reaches every voice feature with no dead ends.
- **SC-09**: Feature degrades gracefully (no crashes, clear messaging) on a machine with no microphone, no audio output, or no internet.
- **SC-10**: Smoke tests pass on macOS 13+, Windows 10+, and a recent mainstream Linux distribution.
- **SC-11**: A typical user (approximately 10 minutes of voice per day) can stay under $5 per month using the cheapest default cloud provider.
- **SC-12**: Application installer growth is less than 15 megabytes over the pre-feature baseline.
- **SC-13**: Zero crash-severity (P0) or data-loss-severity (P1) bugs are open at ship time.
- **SC-14**: Face animation maintains at least 24 frames per second on reference low-spec hardware during continuous speaking state.
- **SC-15**: Voice input transcription is accurate enough that users do not need to edit the result in at least 80% of test utterances (measured by 50-utterance accuracy test).
- **SC-16**: 100% of documented failure modes result in user-visible feedback (not silent failures).
- **SC-17**: Mic permission denial gracefully disables voice input while leaving all other features fully functional.
- **SC-18**: Every voice state change (thinking, speaking, listening, idle, error) is announced to screen readers within 500 milliseconds.
- **SC-19**: Local-Only mode, when enabled, produces zero cloud network calls related to voice (verified by traffic capture).
- **SC-20**: The feature can be fully disabled (per-persona or globally) and the pre-feature experience is completely restored with no data loss.
- **SC-21**: A 72-hour soak test with alternating voice input and output shows total application memory growth (renderer + main process) below a separately documented ceiling per process.
- **SC-22**: A redaction test injecting known API key patterns into every error path confirms the key never appears in any crash report, log, support bundle, or user-visible error message.
- **SC-23**: Cloud TTS spending ceiling enforcement prevents runaway costs: a simulated stuck-synthesis loop triggers the daily cap before spending exceeds $1 in a controlled test.
- **SC-24**: The "Run Diagnostics" button in Settings produces a per-stage pass/fail report covering credential store, gateway health, cloud provider authentication, OS voice enumeration, microphone permission, and model file verification.
- **SC-25**: A user exporting a support bundle for a bug report receives a file that contains zero audio bytes, zero API key material, zero transcription text, and zero reply text — confirmed by automated content scan.

## Key Entities

### Persona (extended)
The existing entity, extended with voice and avatar fields. All new fields are optional and flow through the existing flexible settings document so no database migration is required.

- Voice enabled (boolean, default: inherit from global setting)
- Voice provider preference (one of: cloud-openai, cloud-elevenlabs, cloud-google, os-native, local-only)
- Voice identifier (string naming the specific voice within the provider)
- Voice speed multiplier (number between 0.5 and 2.0, default: 1.0)
- Avatar enabled (boolean, default: inherit from global setting)
- Avatar style identifier (string naming one of the bundled face styles)
- Avatar accent hue (number, 0–360 degrees, default: derived from persona ID hash)

### Voice Provider
A source of synthesized speech. The application must support at least: OpenAI TTS (cloud), ElevenLabs (cloud), Google Cloud Text-to-Speech (cloud), and the operating system's native voices (browser-native fallback).

- Provider identifier
- Provider type (cloud-paid, cloud-free-tier, os-native)
- Authentication requirement (API key required yes/no)
- Available voices (list of voice identifiers and display names)
- Supported languages (list)
- Supports voice preview (yes/no)
- Availability status (ready, missing-credentials, offline, error)

### Voice Session (runtime)
The runtime state of a single spoken utterance.

- Persona identifier
- Text content being spoken
- State (queued, synthesizing, playing, interrupted, completed, error)
- Start timestamp
- Current provider in use
- Audio output device

### Microphone Session (runtime)
The runtime state of a single voice input recording.

- State (idle, requesting-permission, recording, transcribing, completed, denied, error)
- Start timestamp
- Audio duration
- Transcribed text (ephemeral — discarded after insertion into input field)
- Error detail (if any)

### Avatar Style
A bundled face preset shipped with the application.

- Style identifier
- Display name
- Thumbnail preview
- Supported states (idle, thinking, speaking, listening, error)
- Default accent hue

### Global Voice Preferences
Application-wide settings that apply when a persona does not override them.

- Voice output enabled
- Voice input enabled
- Default voice provider
- Default voice identifier
- Default avatar style
- Captions enabled
- Reduced motion override (auto / always / never)
- Local-Only mode enabled
- Auto-stop voice on window blur
- Auto-stop microphone on window blur
- Microphone permission state (granted, denied, not-requested)
- API keys (stored in OS credential store, not in this entity directly)

### Voice Session Log Entry
An observable record of voice activity for the user's own diagnostics (no telemetry leaves the device).

- Timestamp
- Event type (voice output started, voice output completed, voice output fell back, microphone session started, microphone session completed, error)
- Persona identifier
- Provider used
- Duration
- Error detail (if applicable)

## Assumptions

- **Voice output default provider**: OS-native browser voice when no API key is configured. This ships free for every user on every supported platform and works offline. Users upgrade to cloud providers by adding their own API keys.
- **Voice input transcription language**: English only in v1. The highest-quality compact transcription models that fit browser constraints are English-only. Multi-language support is a v2 expansion.
- **Voice output languages**: Whatever the selected provider supports. Cloud providers (OpenAI, ElevenLabs, Google) cover 30+ languages. OS-native voices inherit the user's system locale.
- **Microphone permission timing**: Lazy — requested at first microphone use, not during first-run setup. This prevents new users from being scared off by an unexplained permission request.
- **Default voice input mode**: Push-to-talk (PTT). Hands-free continuous listening is not in v1 due to battery cost, CPU cost on low-spec hardware, and social trust (PTT is the 2025–2026 convention in most conversational AI apps).
- **Avatar style count**: At least 6 bundled 2D face presets covering diverse appearances. Final count may be higher if budget permits.
- **Avatar rendering technology**: 2D vector graphics, either hand-written scalable shapes or a vector-animation runtime. Both approaches fit the "2D" decision. Final choice is an implementation detail for the planning phase.
- **Caption display default**: On by default. Users can toggle off from the chat header.
- **Reduced-motion handling**: Honor the operating system's `prefers-reduced-motion` setting by default, with a manual override in Settings.
- **Local-only mode audience**: Privacy-sensitive users and users in air-gapped environments. Zero cloud calls. Uses only OS-native voice output and local transcription.
- **Trust boundary for voice output**: Text sent to cloud TTS providers is the same text already sent to the language-model provider for generating the reply. No new trust boundary is introduced for voice *output*. This is explicitly a smaller footprint than the existing chat path.
- **Trust boundary for voice input**: Microphone audio must never leave the device. Transcription is local-only. This is an explicitly *higher* privacy bar than the existing chat path, because audio contains biometric and environmental signals that text does not.
- **Existing text-only behaviour**: Strictly preserved. A user who disables all voice and avatar features receives exactly the pre-feature experience.
- **Persona sync**: Voice and avatar settings stored in the existing persona settings document. They flow through the existing synchronization pipeline with no new code path.
- **API key storage**: User-provided API keys are stored in the operating system's native secure credential store. They are never written to plain files or logs.
- **Content Security Policy**: A strict CSP is introduced in the same change as this feature. Without mic and model loading, the app does not currently need a strict CSP, but adding those capabilities demands it.
- **Application shell upgrade**: The application's underlying shell is upgraded to close known high-severity vulnerabilities in the permission request handling API used for microphone access. This upgrade is a prerequisite for shipping voice input safely.
- **macOS entitlements**: The application bundle adds the microphone entitlement and a user-facing microphone usage description. Without these, hardened-runtime builds crash on the first microphone access attempt.
- **Reference low-spec hardware**: Intel UHD 620 integrated graphics, 8 GB RAM, 4-thread CPU (representative of 2018-era business laptops still in common use).
- **Reference high-spec hardware**: Modern Apple Silicon or discrete GPU systems with 16 GB+ RAM. Performance expectations scale upward proportionally.
- **Maximum utterance duration for voice output**: Up to 2000 characters per reply. Longer replies are split into segments and spoken sequentially.
- **Maximum utterance duration for voice input**: 60 seconds per recording. After 60 seconds, recording auto-stops and transcribes what was captured.
- **Cold-start baseline measurement**: The current pre-feature cold-start time must be captured and written into the plan document before this feature ships. Cold start is defined as the time from launch to the first interactive state where the user can click into the chat input. The 10% ceiling must be enforced on both reference low-spec and reference high-spec hardware.
- **Global keyboard shortcuts**: All new voice-related global keyboard shortcuts must be user-configurable from the same Settings area that currently manages the existing global show/hide shortcut. On first launch after the feature ships, the app must verify the default voice shortcuts do not conflict with any already-bound shortcut and offer an alternative when a conflict is detected.
- **Undo for voice changes**: After saving changes to a persona's voice or face, the user must see a transient confirmation that includes an Undo action for at least 10 seconds. Taking the Undo must atomically revert both voice and face fields to their prior values without affecting any other persona setting.
- **Persona fleet performance**: The application must continue to feel responsive with at least 50 personas in the sidebar, including smooth scrolling and sub-100-millisecond persona selection. Only the currently active persona's face must animate; all other persona preview imagery must remain static. Voice resources for a persona must be released from memory within 5 minutes of that persona being deselected.
- **Support bundle**: The user must be able to export a support bundle from the diagnostics panel containing the diagnostic log, non-sensitive settings, and the voice-event history, with a guarantee that the bundle contains zero audio bytes and zero credential material.

## Out of Scope (v1)

The following are explicitly excluded from v1 and may be addressed in v2 or later:

- **3D avatar rendering**. The decision is 2D. Three-dimensional avatars, VRM avatars, Live2D, TalkingHead, Ready Player Me, VRoid, and similar are out of scope.
- **Photorealistic avatars**. Stylized 2D only. No attempts at photorealism that risk the uncanny valley.
- **Voice cloning**. Users cannot train custom voices from samples in v1.
- **Custom user-uploaded face assets**. Users pick from bundled presets in v1.
- **Full-body animation**. Face only, no body, no gestures, no hands.
- **Phoneme-accurate lip sync**. Mouth movement is amplitude-driven and visually suggestive, not phoneme-accurate.
- **Real-time voice interruption**. Users can *cancel* a persona mid-speech by sending a new message, but cannot *talk over* the persona while it is speaking. Hands-free continuous listening is deferred.
- **Multilingual voice input**. English only in v1.
- **Voice commands for application control**. Speech is only interpreted as a chat message to the persona, not as commands to the application itself ("open settings", "switch persona").
- **Desktop pet mode**. Transparent always-on-top floating window is a potential v2 feature.
- **Voice recording review and playback**. Voice audio is ephemeral by design. No "here's what you said" playback.
- **Per-message voice preference**. Voice settings are per-persona, not per-message.
- **Third-party voice plugin ecosystem**. Voice provider list is hardcoded in v1.
- **Cross-device voice settings sync**. Voice and avatar settings flow through the existing sync pipeline but are treated as local-first; cross-device sync of API keys is never in scope.
- **Emotion detection**. The persona's face does not change expression based on the content of the reply beyond the standard states (idle, thinking, speaking, listening, error).
- **Automatic language detection**. Users explicitly select the voice, which implies the language.
- **Speech analytics, sentiment detection, transcription history**. Not in v1.

## Dependencies

This feature depends on the following to function:

- **Existing persona management**: The persona CRUD operations, chat pipeline, message streaming, and settings storage are assumed to be stable and unchanged.
- **Existing local gateway**: The OpenClaw local process that already routes chat to language-model providers must support routing text-to-speech requests to cloud TTS providers. (This capability was verified to exist as of the current gateway version.)
- **Operating system text-to-speech**: The application depends on each supported OS providing at least one usable default voice through the standard browser speech synthesis interface.
- **Operating system microphone access**: The application depends on the operating system providing microphone access through the standard browser media capture interface.
- **Internet connection**: Cloud TTS providers require internet. The application gracefully degrades to OS-native voice when offline.
- **User-provided API keys**: Optional. Required only for the cloud TTS providers the user chooses to configure.
- **Secure credential storage**: Each supported operating system must provide a native secure credential store accessible to the application (macOS Keychain, Windows Credential Manager, Linux Secret Service).
- **Application shell version**: The application must run on a shell version without known high-severity vulnerabilities in the permission request API.

## Risks & Mitigations

- **Risk**: The application shell upgrade required for voice input may introduce regressions in existing features.
  **Mitigation**: Regression test pass on the existing text-only flow before merging the voice feature branch. Smoke tests on all three platforms.

- **Risk**: Cloud TTS providers may change pricing or deprecate models, breaking the cost assumptions.
  **Mitigation**: The multi-provider design lets users switch providers without losing other settings. OS-native fallback is always free.

- **Risk**: Low-spec hardware may not meet the 24 FPS face animation target during voice output.
  **Mitigation**: Performance budget enforced in continuous integration. If a low-spec machine falls below target, face animation automatically simplifies (fewer frames, reduced idle animations) while preserving essential lip movement.

- **Risk**: Microphone permission flow varies significantly across operating systems.
  **Mitigation**: Per-OS acceptance criteria and manual test matrix. Clear, actionable error messages for each denial path.

- **Risk**: User-provided API keys may leak via logs or crash reports.
  **Mitigation**: API keys stored in OS credential store only. Explicit exclusion of API keys from any log, crash report, telemetry, or error message.

- **Risk**: Voice audio may accidentally be persisted through an uncaught code path.
  **Mitigation**: Code audit checklist item requiring explicit approval for any write to disk in voice code paths. Automated test scanning for any file-system write from the voice subsystem.

- **Risk**: The new Content Security Policy may block a library that the existing application relies on.
  **Mitigation**: CSP introduced with a report-only phase first, allowing existing functionality to be verified before enforcement.

- **Risk**: The face component may feel "toy-like" and undermine perceived product quality.
  **Mitigation**: Design review against competitor reference apps (Character.AI, Duolingo, Open-LLM-VTuber). Multiple style presets to let users pick the one that feels right. Face can be hidden entirely per persona if undesired.

## Open Questions

None at this time. All critical scope and design questions were resolved during the two research rounds preceding this specification and during the Clarifications session above.

Any implementation-level questions (specific libraries, exact file paths, specific API shapes) are deferred to the `/speckit.plan` phase.
