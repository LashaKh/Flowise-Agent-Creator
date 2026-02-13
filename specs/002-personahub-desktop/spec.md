# Feature Specification: PersonaHub Desktop — Local Agent Runner

## Overview

**Feature:** A desktop application that lets users run their AI personas locally on their own machines with full system access (file reading/writing, web browsing, code execution, email, calendar) — protected by layered security guardrails that prevent accidental damage.

**Priority:** High

**Estimated Effort:** XL

## Problem Statement

Today, AI personas created on the web platform can only chat via the browser. They can't interact with the user's local files, run scripts, send emails, or automate tasks on their computer. Users want their personas to act as true assistants — reading documents, writing reports, searching the web, managing calendars — but doing this safely requires preventing accidental damage to the user's system.

**Think of it like this:** Right now, your AI persona is a voice on the phone. This feature turns it into a personal assistant who can sit at your desk and use your computer — but with clear rules about what drawers they can open and what buttons they can press.

## Constitution Alignment

- [x] Simplicity First: One-click installer with guided setup wizard; users don't need technical knowledge
- [x] API-First Integration: Personas sync from the existing web platform via HTTPS API; local app consumes the same persona configs
- [x] User Experience Excellence: Menu bar/system tray access, keyboard shortcuts, guided permission setup, activity log with one-click undo
- [x] Security by Default: Five-layer security model (tool classification, path restrictions, confirmation dialogs, undo/rollback, blocked sensitive paths)
- [x] Observable Operations: All agent actions logged locally with timestamps; activity log UI for reviewing what the agent did

## Clarifications

### Session 2026-02-11
- Q: Can multiple personas run simultaneously, or only one at a time? → A: Multiple personas run simultaneously, each with its own chat session
- Q: How does the chat UI handle multiple active personas? → A: Tab-based interface within a single window — sidebar lists active persona conversations, user clicks to switch between them (like a messaging app)
- Q: What happens when a persona's permissions are elevated on the web and synced to desktop? → A: The desktop app notifies the user and requires local approval before applying any permission escalation (new tools or new folder access)
- Q: What happens when the backup storage limit (1000 backups / 30 days) is reached? → A: Oldest backups are auto-deleted when the limit is reached; user receives a warning notification before deletion occurs

## Requirements

### Functional Requirements

#### FR-1: Easy Installation
1. Users can download and install the desktop app on macOS, Windows, and Linux with a single action (drag-to-install, standard installer, or one-line terminal command)
2. A setup wizard walks users through: sign-in, persona selection, permission granting, and first-run confirmation
3. After setup, the app runs in the system tray / menu bar and is always accessible

#### FR-2: Authentication & Persona Sync
4. Users sign in with their existing web platform account (same authentication as the web app)
5. The app fetches and displays all personas the user has created on the web platform
6. Users select which personas to activate locally
7. Persona configs (personality, tools, permissions, knowledge base) sync automatically when changed on the web platform
8. Knowledge base documents associated with each persona sync to the local machine for offline access
9. When a synced persona config includes elevated permissions (new tools enabled or new folders added), the desktop app notifies the user and requires local approval before applying the escalation

#### FR-3: Local Agent Capabilities
10. Multiple personas can run simultaneously, each in its own chat session. The chat interface uses a tab-based layout: a sidebar lists active persona conversations and the user clicks to switch between them.
11. Each activated persona can use tools based on its permission configuration:
    - **Read-only tools**: Read files, list directories, search the web, fetch web pages, search knowledge base, read calendar
    - **Write tools**: Create/edit files, run shell commands, click/type in browser, send emails, create calendar events
    - **Dangerous tools**: Delete files, run as administrator, system control, download files, install software
12. Personas can access user's local files and folders within allowed directories
13. Personas remember conversation history across sessions

#### FR-4: Security — Tool Classification
14. All tools are classified into four tiers:
    - **Safe** (no confirmation needed): read-only operations
    - **Guarded** (requires user confirmation): write operations, code execution, emails
    - **Dangerous** (requires explicit enable + confirmation): deletions, admin actions, installs
    - **Blocked** (never allowed): access to credentials, SSH keys, system files, password stores
15. Each persona has its own set of enabled tools configured by the user on the web platform

#### FR-5: Security — Path Restrictions
16. Users configure which directories each persona can access (read-only or read-write)
17. Sensitive directories are hardcoded as blocked and can never be accessed:
    - SSH keys, cloud credentials, keychains, password stores, GPG keys
    - Any path containing keywords: password, secret, key, token, credential
18. Path restrictions are enforced regardless of persona configuration

#### FR-6: Security — Confirmation Dialogs
19. When a persona attempts a guarded or dangerous action, the user sees a confirmation dialog showing:
    - Which persona is requesting the action
    - What the action is (e.g., "Create a new file")
    - The target (e.g., file path)
    - A preview of the content (for file writes)
20. Users can respond with: Allow Once, Allow Always (for this folder), Deny, or Block This Action
21. Users can set a "Remember my choice" timer (e.g., 1 hour) to batch-approve similar actions
22. Four confirmation levels available per persona: Paranoid (confirm everything), Balanced (confirm writes/deletes/commands — default), Relaxed (only confirm deletes/commands), Trust (no confirmations)

#### FR-7: Undo/Rollback System
23. Every file modification (create, edit, delete) is automatically backed up before execution
24. Users can view an Activity Log showing all agent actions with timestamps
25. Users can one-click undo any file change from the Activity Log
26. Deleted files can be restored from backups
27. Backup history retained for 30 days, with a maximum of 1000 backups. When either limit is reached, the oldest backups are auto-deleted; the user receives a warning notification before deletion occurs
28. Activity data and backups are stored locally and never sent to the cloud

#### FR-8: Optional Sandboxed Execution
29. Users can optionally enable sandboxed execution for shell commands (code runs in an isolated container)
30. In sandbox mode: containers are isolated with no host access, only allowed folders mounted read-only, output folder mounted for results, network access restricted, container destroyed after each command
31. Sandbox mode is opt-in per persona and trades speed for extra security

#### FR-9: Persona Permission Builder (Web Platform)
32. The web platform's persona creation flow includes a permissions configuration panel where users choose:
    - Internet access capabilities (web search, fetch, full browser control)
    - File access capabilities (read, write, delete) with folder selection
    - Code execution capabilities (shell, Python, JavaScript)
    - Calendar & email capabilities (read, create/modify, send)
    - Knowledge base access (search, conversation memory)
    - Automation capabilities (schedule tasks, background execution) — deferred to v2.0; not defined in current scope
33. Users choose a safety level (Paranoid, Balanced, Relaxed, Trust) per persona
34. Activity logging and undo can be toggled per persona

### Non-Functional Requirements

1. **Cross-platform**: App runs on macOS (10.15+), Windows (10+), and Linux (Ubuntu 20.04+, Fedora 35+)
2. **Startup time**: App launches and is ready to chat within 5 seconds on standard hardware
3. **Sync latency**: Persona config changes on web platform reflect locally within 30 seconds
4. **Privacy**: All activity logs, backups, and chat history stored locally only; never transmitted to cloud
5. **Offline capability**: Personas with local knowledge base can function without internet (except for web search tools)
6. **Auto-updates**: App checks for and applies updates automatically without user intervention

## User Stories

### US-1: First-Time Setup
```
As a PersonaHub web user,
I want to install the desktop app and connect it to my account in under 5 minutes,
So that I can start using my personas locally without technical setup.
```

### US-2: Local File Assistant
```
As a researcher,
I want my "Research Assistant" persona to read my PDF papers and write summary notes to my Documents folder,
So that I can get AI help with my work directly on my computer.
```

### US-3: Safe Automation
```
As a cautious user,
I want to see exactly what my persona is about to do and approve it before it happens,
So that I feel confident the AI won't damage my files or access sensitive information.
```

### US-4: Undo Mistakes
```
As a user whose persona accidentally overwrote a file,
I want to open the Activity Log and undo the change with one click,
So that I can recover from mistakes without stress.
```

### US-5: Permission Configuration
```
As a persona creator,
I want to configure exactly which folders and tools each persona can access,
So that I can give a "Code Helper" persona access to my Projects folder but keep it away from my Documents.
```

### US-6: Always Available
```
As a daily user,
I want to open my persona chat from the menu bar icon or a keyboard shortcut,
So that I can quickly ask my persona for help without switching windows.
```

## User Scenarios & Testing

### Scenario 1: Fresh Install & Setup
1. User downloads installer for their OS
2. User runs installer → app opens setup wizard
3. User signs in with Google (same as web platform)
4. App fetches and displays user's personas
5. User selects 2 personas to activate
6. App asks for folder permissions (e.g., ~/Documents)
7. App confirms ready → shows menu bar icon
8. **Expected**: User chatting with local persona within 5 minutes

### Scenario 2: Persona Reads and Writes a File
1. User asks "Research Assistant" to summarize a PDF at ~/Documents/paper.pdf
2. Persona reads the file (safe — no confirmation)
3. Persona generates summary and wants to write ~/Documents/summary.md
4. Confirmation dialog appears: "Einstein wants to create ~/Documents/summary.md" with preview
5. User clicks "Allow Once"
6. File is created; backup stored automatically
7. **Expected**: File created, backup available in Activity Log

### Scenario 3: Blocked Path Access Attempt
1. User asks persona to "check my SSH keys"
2. Persona attempts to read ~/.ssh/id_rsa
3. System blocks immediately — path is in blocked list
4. Persona responds: "I can't access that location for security reasons"
5. **Expected**: Access denied, action logged, no confirmation even offered

### Scenario 4: Undo a File Change
1. Persona edits ~/Documents/report.md with user approval
2. User realizes the edit was wrong
3. User opens Activity Log → sees "Edited report.md" entry
4. User clicks "Undo"
5. Original file restored from backup
6. **Expected**: File reverted to pre-edit state

### Scenario 5: Web Persona Config Sync
1. User updates persona permissions on web (adds ~/Desktop to allowed paths)
2. Desktop app detects change within 30 seconds
3. Persona can now access ~/Desktop files
4. **Expected**: No app restart needed; sync is seamless

## Acceptance Criteria

- [ ] App installs and runs on macOS, Windows, and Linux
- [ ] User completes setup (sign-in → persona activation → permissions) in under 5 minutes
- [ ] Personas sync from web platform and reflect config changes within 30 seconds
- [ ] Safe tools execute without confirmation; guarded tools show confirmation dialog
- [ ] Blocked paths (credentials, SSH keys, system files) are never accessible regardless of configuration
- [ ] Every file modification has an automatic backup; undo restores the original
- [ ] Activity Log displays all agent actions with accurate timestamps
- [ ] Knowledge base documents sync to local machine for offline access
- [ ] Chat is accessible via menu bar icon and keyboard shortcut
- [ ] Sandbox mode isolates code execution when enabled

## Success Criteria

1. **Setup completion rate**: 90%+ of users who start installation complete the full setup flow
2. **Time to first interaction**: Users send their first message to a local persona within 5 minutes of starting install
3. **Security incident rate**: Zero unauthorized access to blocked paths across all users
4. **Undo success rate**: 100% of file changes can be successfully reverted within the 30-day retention window
5. **Sync reliability**: 99%+ of persona config changes reflect locally within 30 seconds
6. **Cross-platform parity**: All core features work identically on macOS, Windows, and Linux
7. **User confidence score**: 80%+ of users report feeling "safe" or "very safe" when asked about agent permissions

## Key Entities

- **Persona Config**: Name, system prompt, enabled tools, allowed paths, confirmation level, knowledge base references
- **Action Request**: Tool name, action type, target path/URL, content, requesting persona ID
- **Action Log Entry**: Timestamp, persona, action type, target, result (allowed/denied/undone), backup path
- **Backup Record**: Original file path, backup file path, timestamp, action type, undo status
- **Security Policy**: Blocked paths list, tool classifications (safe/guarded/dangerous/blocked), per-persona overrides

## Assumptions

- Users already have accounts on the existing web platform and have created at least one persona
- The web platform's existing authentication system supports token-based auth that desktop apps can use (OAuth flow opening a browser window)
- Internet connection is required for initial setup and persona sync, but not for ongoing local operations with cached knowledge base
- Users have sufficient disk space for local knowledge base copies and backup history
- The confirmation dialog system must be responsive enough not to disrupt the chat flow (under 200ms to display)

## Out of Scope

- **Building the OpenClaw gateway itself** — this spec covers the desktop app wrapper and security layer, not the underlying AI agent framework
- **Mobile app** — only desktop platforms (macOS, Windows, Linux) are in scope
- **Multi-channel messaging integration** (Telegram, WhatsApp) — mentioned in the reference doc but deferred to a future feature
- **Auto-update server infrastructure** — the update mechanism is in scope, but setting up the distribution/signing infrastructure is a separate operational task
- **Persona creation on desktop** — personas are created on the web platform; the desktop app only syncs and runs them

## Dependencies

- Existing web platform with persona CRUD and authentication
- An AI agent framework (e.g., OpenClaw) that can run locally and execute tools
- Knowledge base sync API endpoint on the web platform
- Code signing certificates for macOS and Windows distribution

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Users find confirmation dialogs too frequent/annoying | Users disable safety features or abandon the app | Default to "Balanced" level; provide clear "Allow Always for this folder" option to reduce friction |
| Security bypass through path traversal or symlinks | Unauthorized access to sensitive files | Resolve all paths to absolute paths before checking; follow symlinks and validate final target |
| Large knowledge bases cause slow sync or high disk usage | Poor user experience, disk space issues | Implement incremental sync; show disk usage estimates; allow per-document sync selection |
| Cross-platform differences in file permissions and paths | Inconsistent security behavior across OSes | Abstract file system operations; comprehensive testing on all three platforms |
