# Implementation Plan: PersonaHub Desktop — Local Agent Runner

## Constitution Check

| Principle | Compliant | Notes |
|-----------|-----------|-------|
| Simplicity First | [x] | Electron reuses existing React code; single SQLite DB for all local data; polling-based sync (no complex WebSocket infra) |
| API-First Integration | [x] | Desktop calls same Supabase edge functions as web; sync API contracts defined in contracts/sync-api.ts |
| User Experience Excellence | [x] | One-click install; setup wizard; menu bar access; keyboard shortcut; tab-based multi-persona chat |
| Security by Default | [x] | 5-layer security model; hardcoded blocked paths; ActionGuard evaluates every tool call; SafeStorage for tokens |
| Observable Operations | [x] | Every agent action logged to SQLite; Activity Log UI with filtering; backup records for all file changes |

## Technical Context

| Aspect | Decision | Reference |
|--------|----------|-----------|
| Desktop framework | Electron | research.md — Decision 1 |
| AI agent framework | OpenClaw (TypeScript) | research.md — Decision 2 |
| Auth strategy | Custom protocol + PKCE | research.md — Decision 3 |
| Local storage | SQLite + filesystem | research.md — Decision 4 |
| Sync strategy | 30s polling | research.md — Decision 5 |
| Sandbox execution | Docker containers | research.md — Decision 6 |
| Distribution | electron-builder | research.md — Decision 7 |

**Note on OpenClaw vs Flowise:** On the desktop, OpenClaw replaces Flowise as the AI agent runtime. Personas use OpenClaw locally for tool execution (file access, shell commands, etc.) and AI responses. Flowise remains the runtime for the web platform's cloud-based chat. The desktop app does not call Flowise prediction endpoints — it runs everything locally through OpenClaw. Constitution Principle 2 (API-First Integration) applies to the Supabase sync API, not to Flowise in the desktop context.

## Prerequisites

- [ ] Web platform personas API returns the new permission fields (enabled_tools, allowed_paths, confirmation_level, etc.)
- [ ] Knowledge base sync endpoint exists on web platform
- [ ] OpenClaw framework available as npm package
- [ ] Code signing certificates obtained for macOS and Windows

## Implementation Phases

### Phase 1: Electron Shell + Auth (Foundation)

**Goal:** Get a working Electron app that opens, shows a system tray icon, and authenticates with the existing Supabase account via browser OAuth.

**Why this first:** Everything else depends on having a running desktop app that knows who the user is.

**Tasks:**
1. [ ] Initialize Electron project with React + TypeScript + Vite
2. [ ] Set up electron main process (main.ts) with BrowserWindow
3. [ ] Add system tray / menu bar icon (tray.ts)
4. [ ] Register custom protocol handler (`personahub://`)
5. [ ] Implement OAuth flow: open browser → Google sign-in → capture redirect → exchange code for Supabase session
6. [ ] Store auth tokens using Electron SafeStorage
7. [ ] Add preload script for secure IPC between renderer and main process
8. [ ] Create basic app shell UI (window chrome, sidebar placeholder)

**Deliverables:**
- Running Electron app with system tray
- Successful Google OAuth login
- Auth token persisted securely

---

### Phase 2: Persona Sync + Local Database

**Goal:** Sync personas from the web platform and store them locally in SQLite so the app knows which personas are available.

**Why this order:** The chat and security features need persona configs to work.

**Tasks:**
1. [ ] Set up SQLite database with schema from data-model.md
2. [ ] Create database layer (db/local-db.ts) with typed queries
3. [ ] Implement PlatformSync service: fetch personas via GET /personas
4. [ ] Add 30-second polling loop for ongoing sync
5. [ ] Detect permission escalations (new tools/paths added) and queue for user approval
6. [ ] Implement permission escalation notification + approval dialog
7. [ ] Create UserPreferences table and settings defaults
8. [ ] Build Setup Wizard UI: persona selection → folder permission grants → ready screen

**Deliverables:**
- Personas visible in desktop app
- Sync working with 30s polling
- Setup wizard complete

---

### Phase 3: OpenClaw Integration + Chat

**Goal:** Embed OpenClaw agent framework and connect it to the chat UI so personas can actually respond and use tools. Safe tools (read, search) work immediately; a placeholder ActionGuard allows safe tools and blocks everything else until the full security layer is built in Phase 4.

**Why this order:** Getting chat working first proves the core value proposition. The placeholder guard ensures nothing dangerous runs yet.

**Tasks:**
1. [ ] Install and configure OpenClaw as embedded dependency
2. [ ] Create per-persona OpenClaw configs (SOUL.md + tool list) from synced PersonaConfig
3. [ ] Wire OpenClaw tool calls through a placeholder ActionGuard (allow safe tools only, block all others)
4. [ ] Build tab-based chat UI: sidebar with active persona conversations, main chat area
5. [ ] Implement chat message streaming (reuse SSE patterns from existing web chat)
6. [ ] Store chat messages in local SQLite (ChatSession + ChatMessage tables)
7. [ ] Implement session management: new session per persona, persist across app restarts
8. [ ] Sync knowledge base documents to local filesystem for offline access
9. [ ] Connect knowledge base to OpenClaw's memory/search tools

**Deliverables:**
- Working chat with any active persona
- Safe tools execute; all other tools blocked until Phase 4
- Chat history persists locally
- Knowledge base available offline

---

### Phase 4: Security Layer

**Goal:** Build the full ActionGuard that replaces the placeholder — checking tool tier, path restrictions, persona permissions, and showing confirmation dialogs for guarded/dangerous tools.

**Why this order:** Chat works with safe tools from Phase 3. Now unlock guarded/dangerous tools by adding the security layer that makes them safe to use.

**Tasks:**
1. [ ] Implement blocked paths list (security/blocked-paths.ts) with glob matching
2. [ ] Implement path validator: resolve absolute paths, follow symlinks, check against allowed/blocked lists
3. [ ] Implement full ActionGuard: evaluate tool tier + persona permissions + path restrictions → allow/deny/confirm
4. [ ] Build confirmation dialog component with: persona name, action description, target, content preview
5. [ ] Implement confirmation responses: Allow Once, Allow Always, Deny, Block
6. [ ] Add PermissionMemory table for "Allow Always" / "Remember for X minutes" choices
7. [ ] Replace placeholder guard in OpenClaw bridge with full ActionGuard

**Deliverables:**
- ActionGuard blocks unsafe operations
- Confirmation dialogs work for guarded/dangerous tools
- Blocked paths are never accessible

---

### Phase 5: Undo/Rollback + Activity Log

**Goal:** Add automatic file backups, one-click undo, and the Activity Log UI so users can see and reverse what their personas did.

**Why this order:** Security layer is in place, so file-modifying tools now run. Backup and undo protect users from mistakes.

**Tasks:**
1. [ ] Implement BackupManager: auto-backup before every file write/edit/delete
2. [ ] Implement undo: restore file from backup, mark as undone
3. [ ] Add backup cleanup: auto-delete oldest when 1000 limit or 30 days reached, warn user
4. [ ] Wire BackupManager into ActionGuard for all file-modifying tools
5. [ ] Build Activity Log component: filterable list of all agent actions with timestamps
6. [ ] Add undo button on each reversible action in the Activity Log
7. [ ] Add action detail view: show full content, backup info, denial reasons

**Deliverables:**
- Undo restores files correctly
- Activity Log with filtering and undo
- Automatic backup cleanup at limits

---

### Phase 6: Persona Permissions (Web Platform) + Sandbox + Distribution

**Goal:** Add the permission config panel to the web persona builder, Docker sandboxing for shell commands, system tray polish, and package for distribution. Can start web platform work (permissions) in parallel with Phases 3-5.

**Why last:** This is the web-side config, polish, and distribution. Core desktop features must work first.

**Tasks:**
1. [ ] Add Supabase migration: new columns on personas table (enabled_tools, allowed_paths, etc.)
2. [ ] Build permission configuration panel in web PersonaForm.tsx
3. [ ] Add safety level selector (Paranoid/Balanced/Relaxed/Trust) to web UI
4. [ ] Add folder picker for allowed paths in web UI
5. [ ] Ensure PATCH /personas/:id saves new permission fields
6. [ ] Implement Docker sandbox for shell command execution
7. [ ] Mount allowed folders read-only in container; output folder read-write
8. [ ] Destroy container after each command; restrict network access
9. [ ] Add sandbox toggle in settings (per-persona)
10. [ ] Implement system tray with context menu (Open Chat, Settings, Quit)
11. [ ] Register global keyboard shortcut (Cmd/Ctrl+Shift+P)
12. [ ] Add start-on-login option
13. [ ] Configure electron-builder for macOS (DMG), Windows (NSIS), Linux (AppImage)
14. [ ] Set up auto-update with electron-updater
15. [ ] Final cross-platform testing

**Deliverables:**
- Web platform shows permission config when creating/editing personas
- Permission changes sync to desktop app
- Sandbox mode works with Docker
- Installers for all three platforms
- Auto-update functional
- Global keyboard shortcut works

## Testing Strategy

- [ ] **Unit tests:** ActionGuard (tool classification, path validation, persona permission checks)
- [ ] **Unit tests:** BackupManager (backup creation, undo, cleanup at limits)
- [ ] **Unit tests:** Path validator (symlink resolution, blocked path matching, edge cases)
- [ ] **Integration tests:** OAuth flow end-to-end (protocol handler → token exchange → session)
- [ ] **Integration tests:** Persona sync (fetch → diff → store → detect escalations)
- [ ] **Integration tests:** OpenClaw tool call → ActionGuard → confirmation → execute → log
- [ ] **E2E tests:** Setup wizard flow (install → sign in → select personas → grant permissions)
- [ ] **E2E tests:** Chat flow (send message → tool call → confirm → see result → undo)
- [ ] **Security tests:** Blocked path access attempts (direct, via symlink, via path traversal)
- [ ] **Cross-platform tests:** All core flows on macOS, Windows, and Linux

## Rollback Plan

Each phase is independently deployable:
- **Phase 1-2 issues:** Desktop app is just a shell; no user data at risk. Delete app and retry.
- **Phase 3 issues:** Security layer is additive; existing web chat still works as fallback.
- **Phase 4 issues:** Disable OpenClaw integration; fall back to Flowise API chat (existing web behavior).
- **Phase 5 issues:** Web permission fields have defaults; existing personas work without them.
- **Phase 6 issues:** Docker sandbox is opt-in; distribution is a separate build step that doesn't affect the app.

**Database rollback:** SQLite DB is local. Drop and re-sync from web platform at any time.

## Success Metrics

- Setup completion rate: 90%+ of installs complete the full wizard
- Time to first chat: Under 5 minutes from download to first message
- Security: Zero blocked-path breaches in testing
- Undo reliability: 100% of file changes revertible within retention window
- Sync latency: 99%+ of web changes reflected locally within 30 seconds
- Cross-platform: All acceptance criteria pass on macOS, Windows, and Linux

## Generated Artifacts

| Artifact | Path | Description |
|----------|------|-------------|
| Research | specs/002-personahub-desktop/research.md | Technology decisions with rationale |
| Data Model | specs/002-personahub-desktop/data-model.md | All entities, fields, and relationships |
| Sync API Contract | specs/002-personahub-desktop/contracts/sync-api.ts | Desktop ↔ web platform API types |
| Security Contract | specs/002-personahub-desktop/contracts/security-types.ts | Tool classifications, ActionGuard types |
| Quickstart | specs/002-personahub-desktop/quickstart.md | Dev setup and project structure guide |
