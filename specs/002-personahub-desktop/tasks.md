# Tasks: PersonaHub Desktop — Local Agent Runner

## User Story → Task Mapping

| User Story | Description | Phase |
|------------|-------------|-------|
| US-1 | First-Time Setup (install, sign in, select personas, grant permissions) | Phase 3 |
| US-2 | Local File Assistant (chat with persona, read/write files with tools) | Phase 4 |
| US-3 | Safe Automation (confirmation dialogs, tool classification, blocked paths) | Phase 5 |
| US-4 | Undo Mistakes (activity log, backup/restore, one-click undo) | Phase 6 |
| US-5 | Permission Configuration (web platform permission builder) | Phase 7 |
| US-6 | Always Available (system tray, keyboard shortcut, start on login) | Phase 8 |

---

## Phase 1: Project Setup

- [x] T001 Initialize Electron project with React + TypeScript + Vite in personahub-desktop/package.json
- [x] T002 [P] Create Electron main process entry point in personahub-desktop/electron/main.ts
- [x] T003 [P] Create preload script for secure IPC bridge in personahub-desktop/electron/preload.ts
- [x] T004 [P] Add shared TypeScript types from contracts in personahub-desktop/src/types/index.ts
- [x] T005 [P] Copy tool classification constants from contracts in personahub-desktop/src/constants/security.ts
- [x] T006 Configure Vite for Electron renderer build in personahub-desktop/vite.config.ts

---

## Phase 2: Foundational — Local Database

All user stories depend on having a local database. This must complete before any story work.

- [x] T007 Create SQLite schema with all 7 tables (PersonaConfig, ActionLogEntry, BackupRecord, ChatSession, ChatMessage, UserPreferences, PermissionMemory) per data-model.md in personahub-desktop/db/schema.sql
- [x] T008 Implement typed database layer with CRUD operations for all entities in personahub-desktop/db/local-db.ts
- [x] T009 Add database initialization on first app launch (create tables, seed UserPreferences defaults) in personahub-desktop/db/init.ts

---

## Phase 3: US-1 — First-Time Setup

**Story goal:** User installs the app, signs in with Google, selects personas, grants folder permissions, and is ready to chat — all in under 5 minutes.

**Independent test criteria:**
- App opens and shows setup wizard on first launch
- Google OAuth opens browser and returns token to app
- Auth token is stored securely and persists across restarts
- Personas fetch from web platform and display in selection UI
- User can select personas and grant folder access
- Setup completes and app shows system tray icon

### Auth

- [x] T010 [US1] Register custom protocol handler (`personahub://`) for OAuth callback in personahub-desktop/electron/main.ts
- [x] T011 [US1] Implement PKCE OAuth flow: generate code verifier/challenge, open browser for Google sign-in, capture redirect, exchange code for Supabase session in personahub-desktop/electron/auth.ts
- [x] T012 [US1] Store and retrieve auth tokens using Electron SafeStorage in personahub-desktop/electron/secure-store.ts
- [x] T013 [US1] Add auth state management: check stored token on launch, refresh expired tokens, expose auth status to renderer via IPC in personahub-desktop/electron/auth.ts

### Persona Sync

- [x] T014 [US1] Implement PlatformSync service: fetch personas via GET /personas with auth header, transform response, upsert to local SQLite in personahub-desktop/sync/platform-sync.ts
- [x] T015 [US1] Add 30-second polling loop for ongoing persona sync (start after setup, run in background) in personahub-desktop/sync/platform-sync.ts
- [x] T016 [US1] Detect permission escalations during sync (compare new enabled_tools/allowed_paths with local values) and queue for user approval in personahub-desktop/sync/platform-sync.ts

### Setup Wizard UI

- [x] T017 [US1] Build SetupWizard component — Step 1: Welcome screen with "Sign in with Google" button in personahub-desktop/src/components/SetupWizard.tsx
- [x] T018 [US1] Build SetupWizard — Step 2: Persona selection (checkboxes showing fetched personas with tool badges) in personahub-desktop/src/components/SetupWizard.tsx
- [x] T019 [US1] Build SetupWizard — Step 3: Folder permission grants (select allowed directories per persona) in personahub-desktop/src/components/SetupWizard.tsx
- [x] T020 [US1] Build SetupWizard — Step 4: Ready confirmation, trigger first sync, show system tray icon in personahub-desktop/src/components/SetupWizard.tsx
- [x] T021 [US1] Add first-launch detection: show wizard if no auth token exists, otherwise go to main app in personahub-desktop/electron/main.ts

---

## Phase 4: US-2 — Local File Assistant (Chat + Tools)

**Story goal:** User chats with a persona, persona reads local files and writes summaries — all through the desktop chat UI with streaming responses.

**Independent test criteria:**
- Tab-based chat shows active personas in sidebar
- User can send a message and receive a streamed response
- Persona can read files from allowed directories (no confirmation)
- Persona can write files with confirmation dialog
- Chat history persists in SQLite across app restarts
- Knowledge base documents available for persona to search offline

**Depends on:** Phase 3 (US-1) — user must be authenticated and have activated personas

### OpenClaw Integration

- [x] T022 [US2] Install OpenClaw as dependency and create configuration factory: generate per-persona SOUL.md and tool list from synced PersonaConfig in personahub-desktop/openclaw/config-factory.ts
- [x] T023 [US2] Create OpenClaw bridge: start/stop agent instances per activated persona, route tool calls through ActionGuard (placeholder for now — allow all safe tools) in personahub-desktop/openclaw/agent-bridge.ts
- [x] T024 [US2] Wire OpenClaw agent output to streaming response interface (same SSE pattern as existing web chat) in personahub-desktop/openclaw/agent-bridge.ts

### Chat UI

- [x] T025 [P] [US2] Build chat sidebar: list of active persona conversations with unread indicators in personahub-desktop/src/components/ChatSidebar.tsx
- [x] T026 [P] [US2] Build chat message area: scrollable message list with user/assistant bubbles, streaming indicator in personahub-desktop/src/components/ChatMessages.tsx
- [x] T027 [P] [US2] Build chat input: text field with send button, disable while streaming in personahub-desktop/src/components/ChatInput.tsx
- [x] T028 [US2] Compose tab-based ChatWindow from sidebar + messages + input, manage active persona selection in personahub-desktop/src/components/ChatWindow.tsx
- [x] T029 [US2] Implement useChat hook: send message to OpenClaw agent, handle streaming response, store messages in SQLite in personahub-desktop/src/hooks/useChat.ts

### Knowledge Base Sync

- [x] T030 [US2] Implement KB sync: fetch documents from GET /knowledge-base?persona={id}, write to ~/.personahub/workspaces/{personaId}/memory/*.md in personahub-desktop/sync/kb-sync.ts
- [x] T031 [US2] Connect local KB folder to OpenClaw memory/search tool so persona can search offline documents in personahub-desktop/openclaw/config-factory.ts

### Chat Persistence

- [x] T032 [US2] Implement chat session management: create ChatSession on first message per persona, create ChatMessage rows for each sent/received message in personahub-desktop/db/local-db.ts
- [x] T033 [US2] Load previous chat messages from SQLite when user switches to a persona tab in personahub-desktop/src/hooks/useChat.ts

---

## Phase 5: US-3 — Safe Automation (Security Layer)

**Story goal:** Every tool call passes through security checks. Blocked paths are never accessible. Guarded/dangerous tools show confirmation dialogs. Users feel safe.

**Independent test criteria:**
- Safe tools (read, ls, web_search) execute without confirmation
- Guarded tools (write, edit, exec) show confirmation dialog before executing
- Dangerous tools require explicit enable + confirmation
- Blocked paths (/.ssh, /.aws, etc.) are denied immediately — no confirmation offered
- Path traversal and symlink attacks are blocked
- "Allow Always for this folder" remembers the choice
- Confirmation level setting (Paranoid/Balanced/Relaxed/Trust) changes dialog behavior

**Depends on:** Phase 4 (US-2) — needs working tool calls to intercept

### Path Security

- [x] T034 [US3] Implement blocked paths list with glob matching (hardcoded patterns from contracts/security-types.ts) in personahub-desktop/security/blocked-paths.ts
- [x] T035 [US3] Implement path validator: resolve to absolute path, follow symlinks, check against allowed paths and blocked paths in personahub-desktop/security/path-validator.ts

### Action Guard

- [x] T036 [US3] Implement ActionGuard: evaluate ActionRequest against tool tier + persona permissions + path restrictions → return allow/deny/confirm in personahub-desktop/security/action-guard.ts
- [x] T037 [US3] Wire ActionGuard into OpenClaw agent bridge: intercept every tool call, evaluate, and block/confirm before execution in personahub-desktop/openclaw/agent-bridge.ts
- [x] T038 [US3] Log every action evaluation (allowed, denied, confirmed) to ActionLogEntry table in personahub-desktop/security/action-guard.ts

### Confirmation Dialog

- [x] T039 [P] [US3] Build ConfirmDialog component: shows persona name, action, target, content preview, with Allow Once / Allow Always / Deny / Block buttons in personahub-desktop/src/components/ConfirmDialog.tsx
- [x] T040 [US3] Implement confirmation flow: ActionGuard returns "confirm" → show dialog → wait for user response → proceed or deny in personahub-desktop/security/action-guard.ts
- [x] T041 [US3] Add PermissionMemory: store "Allow Always" and "Remember for X minutes" choices in SQLite, check before showing dialog in personahub-desktop/security/permission-memory.ts
- [x] T042 [US3] Implement permission escalation approval dialog: when sync detects elevated permissions, show what changed and require user approval before applying in personahub-desktop/src/components/PermissionEscalation.tsx

---

## Phase 6: US-4 — Undo Mistakes (Backup + Activity Log)

**Story goal:** Every file change is backed up automatically. Users see all agent actions in an Activity Log and can one-click undo any file change.

**Independent test criteria:**
- File backup created automatically before every write/edit/delete
- Activity Log shows all actions with timestamps and persona names
- Undo button restores original file from backup
- Deleted files can be recovered
- Oldest backups auto-deleted when 1000 limit or 30 days reached
- Warning notification shown before auto-deletion

**Depends on:** Phase 5 (US-3) — needs ActionGuard to trigger backups

### Backup System

- [x] T043 [US4] Implement BackupManager: create backup copy in ~/.personahub/history/ before each file write/edit/delete, store BackupRecord in SQLite in personahub-desktop/security/backup-manager.ts
- [x] T044 [US4] Implement undo: restore file from backup path, mark BackupRecord as undone, update ActionLogEntry result to "undone" in personahub-desktop/security/backup-manager.ts
- [x] T045 [US4] Implement backup cleanup: run on app start and hourly, delete oldest when count > 1000 or age > 30 days, show notification before deletion in personahub-desktop/security/backup-manager.ts
- [x] T046 [US4] Wire BackupManager into ActionGuard: call beforeWrite/beforeEdit/beforeDelete before executing any file-modifying tool in personahub-desktop/security/action-guard.ts

### Activity Log UI

- [x] T047 [P] [US4] Build ActivityLog component: scrollable list of ActionLogEntry records with timestamp, persona name, action, target, result badge in personahub-desktop/src/components/ActivityLog.tsx
- [x] T048 [US4] Add filtering to ActivityLog: filter by persona, by action type, by result (allowed/denied/undone), by date range in personahub-desktop/src/components/ActivityLog.tsx
- [x] T049 [US4] Add undo button on each reversible entry (file write/edit/delete that hasn't been undone) — calls BackupManager.undo() in personahub-desktop/src/components/ActivityLog.tsx
- [x] T050 [US4] Add action detail view: expand entry to show full content preview, backup path, deny reason in personahub-desktop/src/components/ActivityLog.tsx

---

## Phase 7: US-5 — Permission Configuration (Web Platform)

**Story goal:** Persona creators configure exactly which tools and folders each persona can access from the web platform's persona builder.

**Independent test criteria:**
- Web persona form shows permission configuration panel
- Users can toggle tool categories (internet, file, code, calendar, KB, automation)
- Users can pick allowed folders with path input
- Safety level selector (Paranoid/Balanced/Relaxed/Trust) works
- Changes save to Supabase and sync to desktop app within 30 seconds

**Depends on:** None (web platform work, can run in parallel with desktop phases)

### Database Migration

- [x] T051 [US5] Add Supabase migration: new columns on personas table (enabled_tools JSONB, allowed_paths JSONB, confirmation_level TEXT, dangerous_tools_enabled BOOLEAN, activity_logging BOOLEAN, undo_enabled BOOLEAN, sandbox_enabled BOOLEAN) with defaults in supabase/migrations/002_add_desktop_permissions.sql

### Web UI

- [x] T052 [US5] Build PermissionConfig component: checkbox groups for tool categories (Internet, File, Code, Calendar/Email, Knowledge Base, Automation) in src/components/PermissionConfig.tsx
- [x] T053 [US5] Add folder picker: text input for allowed paths with add/remove, display as list with read/readwrite toggle in src/components/PermissionConfig.tsx
- [x] T054 [US5] Add safety level selector: radio buttons for Paranoid/Balanced/Relaxed/Trust with description tooltips in src/components/PermissionConfig.tsx
- [x] T055 [US5] Add activity logging and undo toggles (checkboxes) in src/components/PermissionConfig.tsx
- [x] T056 [US5] Integrate PermissionConfig into PersonaForm.tsx: show below existing persona name field, include in create/update payload in src/components/PersonaForm.tsx

### Edge Function Update

- [x] T057 [US5] Update personas edge function: include new permission fields in POST/PATCH handlers, return them in GET response in supabase/functions/personas/index.ts

---

## Phase 8: US-6 — Always Available (System Tray + Shortcuts)

**Story goal:** Users access their persona chat instantly from the menu bar icon or a global keyboard shortcut without switching windows.

**Independent test criteria:**
- System tray icon visible on macOS, Windows, and Linux
- Click tray icon → opens/focuses chat window
- Global shortcut (Cmd/Ctrl+Shift+P) opens chat from any app
- Start-on-login option works
- App minimizes to tray instead of quitting when window closed

**Depends on:** Phase 4 (US-2) — needs chat window to open

- [x] T058 [US6] Implement system tray with icon and context menu (Open Chat, Settings, Quit) in personahub-desktop/electron/tray.ts
- [x] T059 [US6] Register global keyboard shortcut (CmdOrCtrl+Shift+P) to show/focus chat window in personahub-desktop/electron/shortcuts.ts
- [x] T060 [US6] Add start-on-login: use Electron app.setLoginItemSettings() controlled by UserPreferences.start_on_login in personahub-desktop/electron/main.ts
- [x] T061 [US6] Override window close: minimize to tray instead of quitting, add "Quit" only in tray menu in personahub-desktop/electron/main.ts

---

## Phase 9: Polish & Cross-Cutting Concerns

- [x] T062 Implement Docker sandbox for shell commands: create temp container with allowed folders mounted read-only, output folder read-write, destroy after execution in personahub-desktop/security/docker-sandbox.ts
- [x] T063 Add sandbox toggle in settings UI per persona (reads sandbox_enabled from PersonaConfig) in personahub-desktop/src/components/Settings.tsx
- [x] T064 Wire sandbox into ActionGuard: if persona.sandbox_enabled and tool is "exec", route through Docker sandbox instead of direct execution in personahub-desktop/security/action-guard.ts
- [x] T065 Configure electron-builder for macOS (DMG), Windows (NSIS), Linux (AppImage) in personahub-desktop/electron-builder.config.js
- [x] T066 Set up auto-update with electron-updater: check for updates on launch and periodically in personahub-desktop/electron/updater.ts
- [x] T067 Build Settings page: theme toggle, keyboard shortcut config, backup retention settings, start-on-login toggle in personahub-desktop/src/components/Settings.tsx
- [ ] T068 Final cross-platform testing: verify all acceptance criteria on macOS, Windows, and Linux

---

## Dependencies

```
Phase 1 (Setup) ──────────────┐
                               ▼
Phase 2 (Foundational DB) ────┐
                               ▼
Phase 3 (US-1: Setup) ────────┐
                               ├──→ Phase 7 (US-5: Web Permissions) [parallel]
                               ▼
Phase 4 (US-2: Chat + Tools) ─┐
                               ├──→ Phase 8 (US-6: System Tray) [parallel]
                               ▼
Phase 5 (US-3: Security) ─────┐
                               ▼
Phase 6 (US-4: Undo/Log) ─────┐
                               ▼
Phase 9 (Polish) ─────────────→ Done
```

## Parallel Execution Opportunities

| Tasks | Reason |
|-------|--------|
| T002, T003, T004, T005 | Independent files, no shared state |
| T025, T026, T027 | Independent UI components, different files |
| T034, T035 | Independent security modules |
| T039 (ConfirmDialog) | Standalone UI component, no dependencies on guard logic |
| T047 (ActivityLog) | Standalone UI component, no dependencies on backup logic |
| Phase 7 (US-5) + Phase 4-6 | Web platform work is independent of desktop work |
| Phase 8 (US-6) + Phase 5-6 | System tray only needs chat window, not security layer |

## Implementation Strategy

### MVP Scope (Suggested)

**Phase 1 + 2 + 3 (US-1):** A working Electron app that authenticates, syncs personas from the web, and completes the setup wizard. This proves the core infrastructure works without needing OpenClaw or security complexity.

**Tasks:** T001–T021 (21 tasks)

### Incremental Delivery

1. **MVP (Phases 1-3):** Install + Sign in + Sync → "The app knows who you are and what personas you have"
2. **Alpha (+ Phase 4):** Chat with personas + tools → "You can actually talk to your personas and they can do things"
3. **Beta (+ Phases 5-6):** Security + Undo → "Safe to use — you can't break things"
4. **v1.0 (+ Phases 7-9):** Web config + polish + distribution → "Ready for real users"

---

## Summary

| Metric | Count |
|--------|-------|
| **Total tasks** | 68 |
| **Phase 1 (Setup)** | 6 |
| **Phase 2 (Foundational)** | 3 |
| **Phase 3 (US-1: First-Time Setup)** | 12 |
| **Phase 4 (US-2: Chat + Tools)** | 12 |
| **Phase 5 (US-3: Security)** | 9 |
| **Phase 6 (US-4: Undo/Activity Log)** | 8 |
| **Phase 7 (US-5: Web Permissions)** | 7 |
| **Phase 8 (US-6: Always Available)** | 4 |
| **Phase 9 (Polish)** | 7 |
| **Parallel opportunities** | 7 groups |
| **MVP tasks** | 21 (Phases 1-3) |
