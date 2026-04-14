# IPC Channel Contracts: Voice & Avatar Phase

*Every new IPC channel introduced by this feature, with input/output shapes and security rules.*

---

## Channel: `tts:synthesize`

**Direction**: renderer → main → renderer (invoke/handle)
**Purpose**: Synthesize text to speech via cloud provider through the local OpenClaw gateway
**Allowed sender**: Main window mainFrame only

| Field | Type | Validation |
|---|---|---|
| **Input** | | |
| `text` | string | Required. Max 2000 chars. Non-empty after trim. |
| `voiceId` | string | Required. Must be a known voice ID from the provider's voice list. |
| `provider` | string | Required. Must be one of: `cloud-openai`, `cloud-elevenlabs`, `cloud-google`. |
| `personaId` | string | Required. UUID v4 format. |
| **Output** | | |
| `audioBuffer` | ArrayBuffer | WAV or MP3 bytes from the provider. |
| `durationMs` | number | Approximate duration of the audio. |

**Rate limit**: 1 request per 500ms per window.
**Error**: Returns typed error object `{ code: string, message: string }` — never includes the input text, API key, or request body.

---

## Channel: `voice:storeKey`

**Direction**: renderer → main (invoke/handle)
**Purpose**: Store a cloud TTS provider API key in the OS secure credential store
**Allowed sender**: Main window mainFrame only

| Field | Type | Validation |
|---|---|---|
| **Input** | | |
| `providerId` | string | Required. One of: `cloud-openai`, `cloud-elevenlabs`, `cloud-google`. |
| `apiKey` | string | Required. Non-empty. Trimmed of whitespace. |
| **Output** | | |
| `success` | boolean | `true` if stored successfully. |

**Error**: If secure store is unavailable (Linux without Secret Service), returns `{ code: 'SECURE_STORE_UNAVAILABLE', message: '...' }`.

---

## Channel: `voice:getKey`

**Direction**: renderer → main (invoke/handle)
**Purpose**: Retrieve a stored API key from the OS secure credential store
**Allowed sender**: Main window mainFrame only

| Field | Type | Validation |
|---|---|---|
| **Input** | | |
| `providerId` | string | Required. One of the registered provider IDs. |
| **Output** | | |
| `apiKey` | string or null | The stored key, or null if not found. |

**Security**: The returned key is used in-memory only. It must never be logged, serialized to disk, or included in error messages.

---

## Channel: `voice:deleteKey`

**Direction**: renderer → main (invoke/handle)
**Purpose**: Remove a stored API key from the OS secure credential store
**Allowed sender**: Main window mainFrame only

| Field | Type | Validation |
|---|---|---|
| **Input** | | |
| `providerId` | string | Required. One of the registered provider IDs. |
| **Output** | | |
| `success` | boolean | `true` if deleted (or already absent). |

---

## Channel: `voice:diagnostics`

**Direction**: renderer → main (invoke/handle)
**Purpose**: Run a health check across all voice subsystems
**Allowed sender**: Main window mainFrame only

| Field | Type | Validation |
|---|---|---|
| **Input** | | |
| (none) | | |
| **Output** | | |
| `results` | `DiagnosticResult[]` | Array of per-stage pass/fail results. |

```typescript
type DiagnosticResult = {
  stage: 'secure-store' | 'gateway' | 'cloud-openai' | 'cloud-elevenlabs' | 'cloud-google' | 'os-voices' | 'microphone' | 'stt-model';
  status: 'pass' | 'fail' | 'skip';
  errorCode?: string;
  errorMessage?: string;  // Redacted — never includes keys or audio
};
```

---

## Channel: `voice:exportSupportBundle`

**Direction**: renderer → main (invoke/handle)
**Purpose**: Export a diagnostic bundle for bug reports (no audio, no keys, no PII)
**Allowed sender**: Main window mainFrame only

| Field | Type | Validation |
|---|---|---|
| **Input** | | |
| `targetPath` | string | Required. Must be under user-selected directory (via dialog). |
| **Output** | | |
| `success` | boolean | |
| `filePath` | string | Path where bundle was written. |

**Content**: Voice event log (last 7 days), non-sensitive settings, diagnostic results. Explicitly excludes: audio bytes, API keys, transcription text, reply text, persona system prompts.

---

## Sender Validation Pattern

Every handler above must call `validateSender(event)` as the first line:

```typescript
function validateSender(event: Electron.IpcMainInvokeEvent): boolean {
  if (!event.senderFrame || !mainWindow) return false;
  if (event.senderFrame !== mainWindow.webContents.mainFrame) return false;
  const url = new URL(event.senderFrame.url);
  return (
    (url.protocol === 'http:' && url.hostname === 'localhost') || // dev
    url.protocol === 'file:'                                       // prod
  );
}
```

Rejected calls must log a security event to the voice event log with code `IPC_SENDER_REJECTED`.

---

## Preload Bridge Shape

All channels are exposed via `contextBridge.exposeInMainWorld('electronAPI', { ... })`:

```typescript
// Added to the existing electronAPI surface in preload.ts
tts: {
  synthesize: (text: string, voiceId: string, provider: string, personaId: string) => Promise<ArrayBuffer>;
},
voice: {
  storeKey: (providerId: string, apiKey: string) => Promise<boolean>;
  getKey: (providerId: string) => Promise<string | null>;
  deleteKey: (providerId: string) => Promise<boolean>;
  runDiagnostics: () => Promise<DiagnosticResult[]>;
  exportSupportBundle: (targetPath: string) => Promise<{ success: boolean; filePath: string }>;
},
```

Each method must return a proper cleanup function where applicable (fix the ghost-listener pattern from the existing `onResponse` channel).
