# Research: PersonaHub Desktop

## Decision 1: Desktop Framework

**Decision:** Electron

**Rationale:** The existing app is React + TypeScript. Electron lets us reuse nearly all frontend code without learning a new language (Rust for Tauri). It has the most mature ecosystem for system tray, OAuth, auto-updates, and filesystem access. The larger bundle size (150MB vs 10MB) is acceptable for a desktop app that runs an AI agent.

**Alternatives considered:**
- **Tauri** — Much smaller bundle, better performance, stronger security model. Rejected because it requires Rust expertise the team doesn't have, and OAuth/custom protocol handling is more complex.
- **Neutralinojs** — Extremely lightweight but missing critical features (no auto-updater, no installer tooling, single maintainer). Not viable for production.

---

## Decision 2: AI Agent Framework

**Decision:** OpenClaw (embedded in Electron app)

**Rationale:** OpenClaw is a TypeScript-based local AI agent framework designed exactly for this use case — local tool execution with sandboxing. It provides 100+ preconfigured "AgentSkills" for file I/O, shell commands, and web automation. Being TypeScript-native means it integrates seamlessly with the existing React/TS codebase. Its "Lane Queue" system prevents race conditions when multiple personas run simultaneously.

**Alternatives considered:**
- **LangChain/LangGraph** — More flexible and widely adopted, but requires building all the local tool wrappers from scratch (file access, shell exec, browser control). More setup effort.
- **AutoGPT** — Good autonomous capabilities but less control over individual tool execution. Too "fire and forget" for a security-focused app.
- **CrewAI** — Multi-agent focused but designed for cloud-based workflows, not local desktop tool execution.

---

## Decision 3: Authentication in Desktop App

**Decision:** Custom Protocol Handler with PKCE Flow

**Rationale:** Standard pattern for Electron + Supabase auth. Opens the user's default browser for Google OAuth, then redirects back to the app via a custom URL scheme (e.g., `personahub://auth/callback`). PKCE (Proof Key for Code Exchange) prevents authorization code interception. Tokens stored using Electron's SafeStorage API (OS-level encryption).

**Alternatives considered:**
- **In-app BrowserView** — Simpler but Google/OAuth providers discourage embedded webviews for security reasons.
- **Device code flow** — Works without browser redirect but UX is worse (user has to manually enter a code).

---

## Decision 4: Local Data Storage

**Decision:** SQLite for local persona configs, chat history, and activity log. Filesystem for backups and knowledge base documents.

**Rationale:** SQLite is the standard for local desktop data — fast, zero-config, cross-platform. It's perfect for structured data (action logs, persona configs, backup records). Knowledge base documents and file backups are better stored as actual files on disk (simpler, no blob storage overhead, easy to browse).

**Alternatives considered:**
- **LevelDB/RocksDB** — Key-value stores, less suitable for the relational queries needed (e.g., "show all actions for persona X in the last 7 days").
- **JSON files** — Too slow for query-heavy operations like activity log filtering and search.
- **Electron Store** — Good for settings, not for structured data with 1000+ records.

---

## Decision 5: Sync Strategy (Web Platform ↔ Desktop)

**Decision:** Polling with 30-second interval + webhook push when available

**Rationale:** Simple polling at 30s intervals satisfies the "sync within 30 seconds" requirement. No additional infrastructure needed — the desktop app just calls the existing `/personas` GET endpoint. If we add Supabase Realtime later, it can replace polling for instant sync.

**Alternatives considered:**
- **Supabase Realtime** — Instant sync via WebSocket subscriptions. More complex to set up but could be added as an enhancement later.
- **Manual sync button** — Too much friction; users expect automatic sync.

---

## Decision 6: Sandbox Execution

**Decision:** Docker containers for sandboxed shell commands (opt-in)

**Rationale:** Docker is the standard for isolated command execution. Each command runs in a fresh container that's destroyed after execution. Only allowed folders are mounted read-only, with a dedicated output folder for results. Docker Desktop is already common on developer machines.

**Alternatives considered:**
- **WebAssembly sandbox** — More lightweight but can't run arbitrary shell commands or native executables.
- **OS-level sandboxing (AppArmor/seccomp/macOS Sandbox)** — More complex, OS-specific configuration, harder for users to understand.

---

## Decision 7: Desktop App Distribution

**Decision:** Electron Builder for all platforms

**Rationale:** electron-builder is the standard tool for packaging Electron apps. It supports DMG (macOS), NSIS installer (Windows), AppImage + Snap (Linux), and auto-updates via electron-updater. One build config handles all platforms.

**Alternatives considered:**
- **Electron Forge** — Also viable but electron-builder has better cross-platform build support and more documentation for auto-updates.
