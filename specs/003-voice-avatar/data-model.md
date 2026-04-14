# Data Model: Voice & Avatar Phase

*Source: spec.md Key Entities section + research findings*

---

## Entity Relationship Overview

```
┌─────────────────────────┐
│   GlobalVoicePrefs      │  (singleton, persisted in app settings store)
│                         │
│  voiceOutputEnabled     │
│  voiceInputEnabled      │
│  defaultProvider        │──────┐
│  defaultVoiceId         │      │
│  defaultAvatarStyle     │      │
│  captionsEnabled        │      │
│  reducedMotionOverride  │      │ references
│  localOnlyMode          │      │
│  autoStopOnBlur         │      │
│  monthlySpendCeiling    │      │
│  featureFlag            │      │
└─────────────────────────┘      │
                                 │
┌─────────────────────────┐      │
│   VoiceProvider         │◄─────┘
│                         │
│  id                     │
│  type                   │
│  authRequired           │
│  voices[]               │──┐
│  languages[]            │  │
│  supportsPreview        │  │
│  availabilityStatus     │  │
└─────────────────────────┘  │
                             │ contains
┌─────────────────────────┐  │
│   VoiceOption           │◄─┘
│                         │
│  voiceId                │
│  displayName            │
│  gender                 │
│  accent                 │
│  language               │
│  previewSampleUrl       │
└─────────────────────────┘

┌─────────────────────────┐
│   PersonaSettings       │  (existing JSON blob in persona_configs.settings)
│   (extended)            │
│                         │
│  temperature?           │  ← existing
│  modelName?             │  ← existing
│  customInstructions?    │  ← existing
│  avatar?                │  ← existing (emoji/letter for sidebar)
│  pinned?                │  ← existing
│  ─────── NEW ────────   │
│  voiceEnabled?          │──┐
│  voiceProvider?         │  │  overrides GlobalVoicePrefs when set
│  voiceId?               │  │
│  voiceSpeed?            │  │
│  avatarEnabled?         │  │
│  avatarStyleId?         │  │
│  avatarAccentHue?       │  │
└─────────────────────────┘  │
         │                   │
         │ belongs to        │
         ▼                   │
┌─────────────────────────┐  │
│   PersonaConfig         │  │  (existing SQLite table — NO MIGRATION)
│                         │  │
│  id: TEXT PK            │  │
│  name: TEXT             │  │
│  system_prompt: TEXT    │  │
│  settings: TEXT (JSON)  │──┘  ← PersonaSettings serialized here
│  ...existing columns... │
└─────────────────────────┘

┌─────────────────────────┐
│   AvatarStyle           │  (bundled presets, read-only at runtime)
│                         │
│  styleId                │
│  displayName            │
│  thumbnailPath          │
│  supportedStates[]      │
│  defaultAccentHue       │
└─────────────────────────┘

┌─────────────────────────┐
│   VoiceSession          │  (runtime only — never persisted)
│                         │
│  personaId              │
│  textContent            │
│  state                  │  → see state machine below
│  startedAt              │
│  provider               │
│  audioDevice            │
│  cancelToken            │
└─────────────────────────┘

┌─────────────────────────┐
│   MicSession            │  (runtime only — never persisted)
│                         │
│  state                  │  → see state machine below
│  startedAt              │
│  audioDuration          │
│  transcribedText        │  (ephemeral — discarded after insertion)
│  errorDetail            │
└─────────────────────────┘

┌─────────────────────────┐
│   VoiceEventLog         │  (local diagnostic log — no PII, no audio, no keys)
│                         │
│  timestamp              │
│  eventType              │
│  personaId              │
│  providerUsed           │
│  durationMs             │
│  errorCategory          │
│  errorCode              │
└─────────────────────────┘
```

---

## PersonaSettings Extended Fields

All new fields are **optional** and stored inside the existing `settings` JSON column of `persona_configs`. No SQL migration required — `JSON.parse(row.settings)` in `rowToPersona()` at `db/local-db.ts:65` already handles arbitrary keys.

| Field | Type | Default | Range | Validation |
|---|---|---|---|---|
| `voiceEnabled` | boolean | inherit from global | — | Must be boolean or absent |
| `voiceProvider` | string enum | inherit from global | `'auto' \| 'cloud-openai' \| 'cloud-elevenlabs' \| 'cloud-google' \| 'os-native' \| 'local-only'` | Must be one of the enum values or absent |
| `voiceId` | string | derived from persona name hash | Provider-specific voice name | Non-empty string; validated against provider's voice list on load |
| `voiceSpeed` | number | 1.0 | 0.5 – 2.0 | Clamped to range; NaN/undefined → 1.0 |
| `avatarEnabled` | boolean | inherit from global | — | Must be boolean or absent |
| `avatarStyleId` | string | derived from persona ID hash | One of the bundled style IDs | Validated against available styles on load; missing → default |
| `avatarAccentHue` | number | derived from persona ID hash | 0 – 360 (degrees) | Clamped to range; NaN/undefined → hash-derived |

### Forward compatibility

- Older app versions that don't recognize these fields will ignore them (standard JSON behavior). No persona data is lost on downgrade — only voice features become unavailable.
- Import/export: voice fields travel with the persona JSON. API keys do NOT travel — they live in OS secure store.

---

## VoiceProvider Registry

Hardcoded provider definitions. Adding a new provider in future requires only a new entry here + gateway support.

| Provider ID | Type | Auth | Languages | Preview | Notes |
|---|---|---|---|---|---|
| `cloud-openai` | cloud-paid | API key required | 50+ | Yes | Routes through OpenClaw gateway. Voices: alloy, echo, fable, onyx, nova, shimmer |
| `cloud-elevenlabs` | cloud-paid | API key required | 29 | Yes | Routes through OpenClaw gateway. Flash v2.5 + Multilingual v2. BYO key only. |
| `cloud-google` | cloud-free-tier | API key required | 40+ | Yes | Routes through OpenClaw gateway. 1M chars/month free WaveNet tier. |
| `os-native` | local-free | None | OS locale | Yes | `window.speechSynthesis`. Filter by `localService === true`. |
| `local-kokoro` | local-paid-download | None | English only | Yes | Future v2 privacy pack. Kokoro-82M q8f16 via HeadTTS. 86MB download. |

### Provider availability status

Each provider reports one of: `ready`, `missing-credentials`, `offline`, `rate-limited`, `error`. The status is checked lazily (on first use + on Settings open) and cached per session.

---

## AvatarStyle Presets

Bundled with the application installer. Read-only at runtime.

| Style ID | Display Name | Description | Default Hue |
|---|---|---|---|
| `face-warm` | Warm | Rounded features, soft expression | 30 (orange) |
| `face-cool` | Cool | Angular features, calm expression | 210 (blue) |
| `face-playful` | Playful | Large eyes, slight smile | 330 (pink) |
| `face-serious` | Serious | Defined jawline, neutral expression | 180 (teal) |
| `face-gentle` | Gentle | Soft oval, kind eyes | 120 (green) |
| `face-bold` | Bold | Strong features, confident expression | 270 (purple) |

Each style supports states: `idle`, `thinking`, `speaking`, `listening`, `error`.

---

## State Machines

### VoiceSession State Machine

```
                    ┌──────────┐
          send msg  │          │  reply done
       ┌───────────►│  queued  │◄──────────── (from useChat.ts:74)
       │            │          │
       │            └────┬─────┘
       │                 │ begin synthesis
       │                 ▼
       │         ┌───────────────┐
       │         │               │   provider error
       │         │ synthesizing  │──────────────► fallback to next provider
       │         │               │                     │
       │         └───────┬───────┘                     │ all providers failed
       │                 │ audio ready                  ▼
       │                 ▼                        ┌──────────┐
       │         ┌───────────────┐                │  error   │
       │         │               │                └──────────┘
  interrupt      │   playing     │
  (new msg,      │               │
   stop btn,     └───┬───────┬───┘
   persona sw)       │       │
       │             │       │ audio complete
       ▼             │       ▼
  ┌──────────────┐   │  ┌──────────┐
  │ interrupted  │   │  │completed │
  └──────┬───────┘   │  └──────────┘
         │           │
         ▼           ▼
     ┌──────┐    ┌──────┐
     │ idle │◄───│ idle │
     └──────┘    └──────┘
```

**Ordering rules (from FR-14 #155)**:
- A stop/interrupt must complete before any new synthesis starts
- A settings change mid-synthesis applies to the NEXT utterance only
- Pressing mic during speech stops the speech first
- Two rapid stops are idempotent
- No overlapping audio ever

### MicSession State Machine

```
     ┌──────┐
     │ idle │
     └──┬───┘
        │ mic button pressed / Space held
        ▼
  ┌─────────────────────┐
  │ requesting-permission│  (first-ever use only)
  └──────────┬──────────┘
             │ granted              │ denied
             ▼                      ▼
     ┌───────────┐           ┌──────────┐
     │ recording │           │  denied  │
     └─────┬─────┘           └──────────┘
           │ button released / Space released / Escape / 60s cap
           ▼
     ┌──────────────┐
     │ transcribing │
     └──────┬───────┘
            │ text ready           │ transcription failed
            ▼                      ▼
     ┌────────────┐          ┌──────────┐
     │ completed  │          │  error   │  (show Retry control)
     └─────┬──────┘          └──────────┘
           │ text inserted into input field
           ▼
     ┌──────┐
     │ idle │
     └──────┘
```

**Auto-stop triggers**: window blur, OS lock, OS suspend, 60-second hard cap, 10-minute no-speech timeout (hands-free mode only).

---

## API Key Storage

Keys are stored in the OS secure credential store. NEVER in SQLite, NEVER in plain files, NEVER in logs.

| Platform | Store | Access |
|---|---|---|
| macOS | Keychain | via `keytar` or Electron `safeStorage` |
| Windows | Credential Manager | via `keytar` or Electron `safeStorage` |
| Linux | Secret Service (libsecret) | via `keytar` or Electron `safeStorage` |

**Key namespace**: `personahub-desktop/{provider-id}` (e.g., `personahub-desktop/cloud-openai`)

**Fallback when secure store is unavailable** (e.g., Linux without Secret Service): display a blocking message. Do NOT fall back to plain-file storage under any circumstance.

---

## Voice Event Log Schema

Local diagnostic log for troubleshooting. No PII, no audio, no API keys, no reply/transcription text.

| Field | Type | Example |
|---|---|---|
| `timestamp` | ISO 8601 | `2026-04-10T14:30:00.000Z` |
| `eventType` | enum | `voice-output-started`, `voice-output-completed`, `voice-output-fallback`, `voice-output-error`, `mic-session-started`, `mic-session-completed`, `mic-session-denied`, `mic-session-error`, `provider-switch`, `model-download-started`, `model-download-completed` |
| `personaId` | UUID | `a1b2c3d4-...` |
| `providerUsed` | string | `cloud-openai`, `os-native` |
| `durationMs` | number | `1250` |
| `errorCategory` | string or null | `billing`, `rate-limit`, `network`, `auth`, `hardware`, `model` |
| `errorCode` | string or null | `HTTP_429`, `MIC_REVOKED`, `GATEWAY_UNREACHABLE` |

**Retention**: last 7 days or last 10,000 entries, whichever is smaller. Auto-pruned on app start.

**Export**: included in the support bundle via Settings > Voice & Avatar > Run Diagnostics > Export Support Bundle. The export pipeline must pass through redaction before writing.

---

## Cost Tracking Model

Estimated cost tracking for cloud TTS usage awareness. Approximate, not billing-accurate.

| Field | Type | Notes |
|---|---|---|
| `providerId` | string | Which provider |
| `periodStart` | date | First day of current calendar month |
| `charsSent` | number | Running total of characters sent this period |
| `estimatedCostUsd` | number | `charsSent × provider.costPerChar` |
| `ceilingUsd` | number | User-configured monthly max (from GlobalVoicePrefs) |
| `dailyCharsSent` | number | Rolling 24-hour character count |
| `dailyCeilingChars` | number | Automatic daily cap (prevents runaway loops) |

**Enforcement**: When `estimatedCostUsd >= ceilingUsd`, silently fall back to OS-native voice and show a one-time per-session notice. When `dailyCharsSent >= dailyCeilingChars`, same behavior. Counters reset at period boundary.

**Storage**: In-memory + persisted to a simple JSON file in userData (not SQLite, not secure store — this is non-sensitive operational data).
