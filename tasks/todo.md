# Agentic Persona Builder - Local Agent Architecture

## Overview

**Goal**: Users create personas on your web platform, then run them locally on their own machines with full system access - but with security guardrails that prevent damage.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ARCHITECTURE OVERVIEW                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │               YOUR WEB PLATFORM (Cloud)                         │     │
│  │                                                                 │     │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐│     │
│  │  │   Auth &    │  │   Persona   │  │   Agent Config          ││     │
│  │  │   Users     │  │   Builder   │  │   Generator             ││     │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘│     │
│  │                                                                 │     │
│  │  • Users create accounts                                       │     │
│  │  • Users design personas (personality, tools, permissions)     │     │
│  │  • Platform generates secure OpenClaw configs                  │     │
│  │  • Knowledge Base management                                   │     │
│  │  • Sync API for local agents                                   │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                              │                                           │
│                              │ Sync (HTTPS)                              │
│                              │ • Persona configs                         │
│                              │ • Knowledge Base docs                     │
│                              │ • Security policies                       │
│                              ▼                                           │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │              USER'S COMPUTER (Local Agent)                      │     │
│  │                                                                 │     │
│  │  ┌──────────────────────────────────────────────────────────┐  │     │
│  │  │              "PersonaHub Desktop" App                     │  │     │
│  │  │              (One-click installer)                        │  │     │
│  │  │                                                           │  │     │
│  │  │  ┌────────────────────────────────────────────────────┐  │  │     │
│  │  │  │            OpenClaw Gateway (Embedded)              │  │  │     │
│  │  │  │            Running in SANDBOX MODE                  │  │  │     │
│  │  │  └────────────────────────────────────────────────────┘  │  │     │
│  │  │                          │                                │  │     │
│  │  │  ┌────────────────────────────────────────────────────┐  │  │     │
│  │  │  │              Security Layer                         │  │  │     │
│  │  │  │  • Confirmation prompts for dangerous actions      │  │  │     │
│  │  │  │  • Undo/rollback for file changes                  │  │  │     │
│  │  │  │  • Tool restrictions based on persona config       │  │  │     │
│  │  │  │  • Activity logging                                │  │  │     │
│  │  │  └────────────────────────────────────────────────────┘  │  │     │
│  │  │                          │                                │  │     │
│  │  │          ┌───────────────┴───────────────┐               │  │     │
│  │  │          │                               │               │  │     │
│  │  │          ▼                               ▼               │  │     │
│  │  │  ┌─────────────┐                 ┌─────────────┐        │  │     │
│  │  │  │ Safe Zone   │                 │ Guarded Zone│        │  │     │
│  │  │  │ (No confirm)│                 │ (Requires   │        │  │     │
│  │  │  │             │                 │  approval)  │        │  │     │
│  │  │  │ • Read files│                 │ • Write file│        │  │     │
│  │  │  │ • Web search│                 │ • Run script│        │  │     │
│  │  │  │ • Calendar  │                 │ • Send email│        │  │     │
│  │  │  │   (read)    │                 │ • Delete    │        │  │     │
│  │  │  └─────────────┘                 └─────────────┘        │  │     │
│  │  └──────────────────────────────────────────────────────────┘  │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part 1: Super Easy Installation

### Option A: One-Line Install Script (Recommended)

```bash
# User runs this single command:
curl -fsSL https://personahub.ai/install | bash
```

What it does:
1. Checks system requirements (Node 22+, Docker optional)
2. Downloads PersonaHub Desktop
3. Opens setup wizard
4. User logs in with their account
5. Syncs their personas
6. Done!

### Option B: Desktop App Installer

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         INSTALLER OPTIONS                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  macOS:     PersonaHub.dmg         (drag to Applications)               │
│  Windows:   PersonaHub-Setup.exe   (standard installer)                 │
│  Linux:     personahub.AppImage    (double-click to run)                │
│             or: snap install personahub                                  │
│                                                                          │
│  Built with Electron - wraps OpenClaw + your custom UI                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Setup Flow (User Experience)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      USER ONBOARDING FLOW                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Step 1: Download & Install                                             │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                  │   │
│  │   🎉 Welcome to PersonaHub!                                      │   │
│  │                                                                  │   │
│  │   Your AI personas are about to get superpowers.                │   │
│  │                                                                  │   │
│  │   [ Download for macOS ]  [ Download for Windows ]              │   │
│  │                                                                  │   │
│  │   Or run: curl -fsSL https://personahub.ai/install | bash       │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                           │
│                              ▼                                           │
│  Step 2: Sign In                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                  │   │
│  │   Sign in to sync your personas                                 │   │
│  │                                                                  │   │
│  │   [ Continue with Google ]                                      │   │
│  │   [ Sign in with Email ]                                        │   │
│  │                                                                  │   │
│  │   (Opens browser → Supabase Auth → Returns token)               │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                           │
│                              ▼                                           │
│  Step 3: Choose Personas to Activate                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                  │   │
│  │   Select which personas to run locally:                         │   │
│  │                                                                  │   │
│  │   ☑️ Einstein (Research Assistant)                              │   │
│  │      Tools: Web search, File read, Browser                      │   │
│  │                                                                  │   │
│  │   ☑️ Productivity Coach                                         │   │
│  │      Tools: Calendar, Reminders, Email                          │   │
│  │                                                                  │   │
│  │   ☐ Code Helper (disabled - enable on web)                      │   │
│  │                                                                  │   │
│  │   [ Activate Selected Personas ]                                │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                           │
│                              ▼                                           │
│  Step 4: Grant Permissions                                              │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                  │   │
│  │   PersonaHub needs some permissions to help you:                │   │
│  │                                                                  │   │
│  │   📁 File Access                                                │   │
│  │      Read files in: ~/Documents, ~/Desktop                      │   │
│  │      [ Grant Access ]                                           │   │
│  │                                                                  │   │
│  │   📅 Calendar                                                   │   │
│  │      Connect Google Calendar                                    │   │
│  │      [ Connect ]                                                │   │
│  │                                                                  │   │
│  │   🌐 Browser Control (optional)                                 │   │
│  │      Control Chrome for web automation                          │   │
│  │      [ Enable ] [ Skip for now ]                                │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                           │
│                              ▼                                           │
│  Step 5: Ready!                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                  │   │
│  │   ✅ PersonaHub is running!                                     │   │
│  │                                                                  │   │
│  │   Your personas are active in the menu bar.                     │   │
│  │   Chat via:                                                      │   │
│  │   • Menu bar icon (click to chat)                               │   │
│  │   • Keyboard shortcut: ⌘ + Shift + P                            │   │
│  │   • WhatsApp / Telegram (connect in settings)                   │   │
│  │                                                                  │   │
│  │   [ Open Chat ]  [ Go to Settings ]                             │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part 2: Security Architecture (Preventing Damage)

### Security Layers

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      SECURITY ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Layer 1: TOOL CLASSIFICATION                                           │
│  ════════════════════════════                                           │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                  │   │
│  │  🟢 SAFE (No confirmation needed)                               │   │
│  │  ─────────────────────────────────                              │   │
│  │  • read - Read file contents                                    │   │
│  │  • ls - List directory                                          │   │
│  │  • web_search - Search the internet                             │   │
│  │  • web_fetch - Fetch webpage content                            │   │
│  │  • memory_search - Search knowledge base                        │   │
│  │  • calendar.read - View calendar events                         │   │
│  │  • weather - Get weather info                                   │   │
│  │                                                                  │   │
│  │  🟡 GUARDED (Requires user confirmation)                        │   │
│  │  ───────────────────────────────────────                        │   │
│  │  • write - Write/create files                                   │   │
│  │  • edit - Modify existing files                                 │   │
│  │  • exec - Run shell commands                                    │   │
│  │  • browser.click - Click on web elements                        │   │
│  │  • browser.type - Type into forms                               │   │
│  │  • email.send - Send emails                                     │   │
│  │  • calendar.create - Create events                              │   │
│  │                                                                  │   │
│  │  🔴 DANGEROUS (Requires explicit enable + confirmation)         │   │
│  │  ─────────────────────────────────────────────────              │   │
│  │  • delete - Delete files                                        │   │
│  │  • exec.sudo - Run as administrator                             │   │
│  │  • system.shutdown - System control                             │   │
│  │  • browser.download - Download files                            │   │
│  │  • install - Install software                                   │   │
│  │                                                                  │   │
│  │  ⛔ BLOCKED (Never allowed)                                     │   │
│  │  ──────────────────────────                                     │   │
│  │  • Access to ~/.ssh, ~/.aws, credentials                        │   │
│  │  • Access to /etc, /System, Windows\System32                    │   │
│  │  • Keychain/password manager access                             │   │
│  │  • Cryptocurrency wallet files                                  │   │
│  │  • Browser saved passwords                                      │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Layer 2: PATH RESTRICTIONS                                             │
│  ═════════════════════════                                              │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                  │   │
│  │  User configures allowed directories:                           │   │
│  │                                                                  │   │
│  │  ALLOWED (read):                                                │   │
│  │  ├── ~/Documents                                                │   │
│  │  ├── ~/Desktop                                                  │   │
│  │  ├── ~/Downloads                                                │   │
│  │  └── ~/Projects                                                 │   │
│  │                                                                  │   │
│  │  ALLOWED (read + write with confirmation):                      │   │
│  │  ├── ~/Documents/PersonaHub                                     │   │
│  │  └── ~/Projects                                                 │   │
│  │                                                                  │   │
│  │  BLOCKED (never access):                                        │   │
│  │  ├── ~/.ssh                                                     │   │
│  │  ├── ~/.aws                                                     │   │
│  │  ├── ~/.config/gcloud                                           │   │
│  │  ├── ~/Library/Keychains                                        │   │
│  │  ├── ~/.gnupg                                                   │   │
│  │  ├── ~/.password-store                                          │   │
│  │  ├── **/node_modules                                            │   │
│  │  ├── **/.git (write blocked)                                    │   │
│  │  └── Any path containing: password, secret, key, token, cred    │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Layer 3: CONFIRMATION DIALOGS                                          │
│  ════════════════════════════                                           │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                  │   │
│  │  ┌───────────────────────────────────────────────────────────┐  │   │
│  │  │                                                            │  │   │
│  │  │  🤖 Einstein wants to:                                     │  │   │
│  │  │                                                            │  │   │
│  │  │  📝 Create a new file                                      │  │   │
│  │  │                                                            │  │   │
│  │  │  Location: ~/Documents/research-notes.md                   │  │   │
│  │  │                                                            │  │   │
│  │  │  Preview:                                                  │  │   │
│  │  │  ┌──────────────────────────────────────────────────────┐ │  │   │
│  │  │  │ # Research Notes                                      │ │  │   │
│  │  │  │                                                       │ │  │   │
│  │  │  │ ## Quantum Mechanics Summary                          │ │  │   │
│  │  │  │ ...                                                   │ │  │   │
│  │  │  └──────────────────────────────────────────────────────┘ │  │   │
│  │  │                                                            │  │   │
│  │  │  [ Allow Once ]  [ Allow Always for this folder ]         │  │   │
│  │  │  [ Deny ]        [ Block this action ]                    │  │   │
│  │  │                                                            │  │   │
│  │  │  ☐ Remember my choice for 1 hour                          │  │   │
│  │  │                                                            │  │   │
│  │  └───────────────────────────────────────────────────────────┘  │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Layer 4: UNDO/ROLLBACK SYSTEM                                          │
│  ════════════════════════════                                           │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                  │   │
│  │  Every file modification is tracked:                            │   │
│  │                                                                  │   │
│  │  ~/.personahub/history/                                         │   │
│  │  ├── 2026-02-02_14-30-00_write_research-notes.md.backup        │   │
│  │  ├── 2026-02-02_14-35-00_edit_report.docx.backup               │   │
│  │  └── 2026-02-02_14-40-00_delete_old-file.txt.backup            │   │
│  │                                                                  │   │
│  │  User can:                                                       │   │
│  │  • View all agent actions in Activity Log                       │   │
│  │  • One-click undo any file change                               │   │
│  │  • Restore deleted files                                        │   │
│  │  • Roll back to any point in time                               │   │
│  │                                                                  │   │
│  │  ┌───────────────────────────────────────────────────────────┐  │   │
│  │  │  Activity Log                                              │  │   │
│  │  │                                                            │  │   │
│  │  │  14:40 🗑️ Deleted old-file.txt          [ Undo ]          │  │   │
│  │  │  14:35 ✏️ Edited report.docx             [ Undo ]          │  │   │
│  │  │  14:30 📝 Created research-notes.md      [ Undo ]          │  │   │
│  │  │  14:25 🔍 Searched web for "quantum..."  (no undo needed)  │  │   │
│  │  │  14:20 📖 Read ~/Documents/paper.pdf     (no undo needed)  │  │   │
│  │  │                                                            │  │   │
│  │  └───────────────────────────────────────────────────────────┘  │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Layer 5: DOCKER SANDBOX (Optional, Extra Security)                     │
│  ═════════════════════════════════════════════════                      │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                  │   │
│  │  For paranoid users, all exec commands run in Docker:           │   │
│  │                                                                  │   │
│  │  • Isolated container with no host access                       │   │
│  │  • Only allowed folders mounted read-only                       │   │
│  │  • Output folder mounted for results                            │   │
│  │  • Network access restricted                                    │   │
│  │  • Container destroyed after each command                       │   │
│  │                                                                  │   │
│  │  Settings → Security → ☑️ Run code in sandbox (slower)          │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part 3: Persona Permission System

When users create personas on your web platform, they configure what the persona can do:

```
┌─────────────────────────────────────────────────────────────────────────┐
│              PERSONA BUILDER - PERMISSION CONFIGURATION                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Creating Persona: "Research Assistant"                                  │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  CAPABILITIES                                                    │   │
│  │                                                                  │   │
│  │  🌐 Internet Access                                             │   │
│  │  ├── ☑️ Web search (Google, Perplexity)                        │   │
│  │  ├── ☑️ Fetch webpage content                                  │   │
│  │  └── ☐ Full browser control (navigate, click, type)            │   │
│  │                                                                  │   │
│  │  📁 File Access                                                 │   │
│  │  ├── ☑️ Read files                                             │   │
│  │  ├── ☑️ Write files (with confirmation)                        │   │
│  │  ├── ☐ Delete files                                            │   │
│  │  └── Allowed folders: ~/Documents, ~/Research                   │   │
│  │      [ Add Folder ]                                             │   │
│  │                                                                  │   │
│  │  💻 Code Execution                                              │   │
│  │  ├── ☐ Run shell commands                                      │   │
│  │  ├── ☐ Run Python scripts                                      │   │
│  │  └── ☐ Run JavaScript                                          │   │
│  │                                                                  │   │
│  │  📅 Calendar & Email                                            │   │
│  │  ├── ☑️ Read calendar                                          │   │
│  │  ├── ☐ Create/modify events                                    │   │
│  │  ├── ☑️ Read emails                                            │   │
│  │  └── ☐ Send emails                                             │   │
│  │                                                                  │   │
│  │  🧠 Knowledge Base                                              │   │
│  │  ├── ☑️ Search personal KB                                     │   │
│  │  └── ☑️ Remember conversations                                 │   │
│  │                                                                  │   │
│  │  ⏰ Automation                                                  │   │
│  │  ├── ☐ Schedule tasks                                          │   │
│  │  └── ☐ Run in background                                       │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  SAFETY SETTINGS                                                 │   │
│  │                                                                  │   │
│  │  Confirmation Level:                                            │   │
│  │  ○ Paranoid - Confirm everything                                │   │
│  │  ● Balanced - Confirm writes, deletes, commands (Recommended)   │   │
│  │  ○ Relaxed - Only confirm deletes and commands                  │   │
│  │  ○ Trust - No confirmations (not recommended)                   │   │
│  │                                                                  │   │
│  │  ☑️ Enable activity logging                                     │   │
│  │  ☑️ Enable undo for all file changes                           │   │
│  │  ☑️ Block access to sensitive directories                      │   │
│  │  ☐ Run code in Docker sandbox (slower but safer)               │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│                    [ Save Persona ]                                      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part 4: Technical Implementation

### Desktop App Structure (Electron)

```
personahub-desktop/
├── package.json
├── electron/
│   ├── main.ts              # Main process
│   ├── preload.ts           # Security bridge
│   ├── tray.ts              # Menu bar/system tray
│   └── updater.ts           # Auto-updates
├── src/
│   ├── App.tsx              # React UI
│   ├── components/
│   │   ├── Chat.tsx
│   │   ├── Settings.tsx
│   │   ├── ActivityLog.tsx
│   │   └── ConfirmDialog.tsx
│   └── hooks/
│       ├── usePersonas.ts
│       └── useOpenClaw.ts
├── openclaw/                 # Embedded OpenClaw
│   ├── gateway/
│   └── config/
└── security/
    ├── path-validator.ts    # Validates file paths
    ├── action-guard.ts      # Confirmation logic
    ├── backup-manager.ts    # Undo/rollback system
    └── blocked-paths.ts     # Hardcoded blocked paths
```

### Security Module

```typescript
// security/action-guard.ts

interface ActionRequest {
  tool: string;
  action: string;
  target?: string;  // file path, URL, etc.
  content?: string; // for writes
  personaId: string;
}

type ActionResult = 'allow' | 'deny' | 'confirm';

class ActionGuard {
  private blockedPaths = [
    '~/.ssh', '~/.aws', '~/.gnupg',
    '~/.config/gcloud', '~/Library/Keychains',
    '**/passwords*', '**/secrets*', '**/*.pem', '**/*.key'
  ];

  private safeTools = [
    'read', 'ls', 'web_search', 'web_fetch',
    'memory_search', 'calendar.read'
  ];

  private guardedTools = [
    'write', 'edit', 'exec', 'browser.click',
    'browser.type', 'email.send', 'calendar.create'
  ];

  private dangerousTools = [
    'delete', 'exec.sudo', 'system.*', 'install'
  ];

  async evaluate(request: ActionRequest): Promise<ActionResult> {
    // 1. Check if path is blocked
    if (request.target && this.isBlockedPath(request.target)) {
      await this.logDeniedAction(request, 'blocked_path');
      return 'deny';
    }

    // 2. Get persona permissions
    const persona = await this.getPersonaConfig(request.personaId);

    // 3. Check if tool is allowed for this persona
    if (!persona.allowedTools.includes(request.tool)) {
      await this.logDeniedAction(request, 'tool_not_allowed');
      return 'deny';
    }

    // 4. Check if path is in allowed directories
    if (request.target && !this.isAllowedPath(request.target, persona)) {
      await this.logDeniedAction(request, 'path_not_allowed');
      return 'deny';
    }

    // 5. Determine if confirmation needed
    if (this.safeTools.includes(request.tool)) {
      return 'allow';
    }

    if (this.dangerousTools.includes(request.tool)) {
      if (!persona.dangerousToolsEnabled) {
        return 'deny';
      }
      return 'confirm'; // Always confirm dangerous
    }

    if (this.guardedTools.includes(request.tool)) {
      if (persona.confirmationLevel === 'trust') {
        return 'allow';
      }
      return 'confirm';
    }

    return 'confirm'; // Default to confirm unknown tools
  }

  private isBlockedPath(path: string): boolean {
    const expandedPath = path.replace('~', os.homedir());
    return this.blockedPaths.some(blocked =>
      minimatch(expandedPath, blocked.replace('~', os.homedir()))
    );
  }
}
```

### Backup/Undo System

```typescript
// security/backup-manager.ts

class BackupManager {
  private historyDir = '~/.personahub/history';
  private maxBackups = 1000;
  private maxAgeDays = 30;

  async beforeWrite(filePath: string): Promise<string> {
    const backupPath = this.generateBackupPath(filePath, 'write');

    if (await fs.exists(filePath)) {
      // Backup existing file
      await fs.copy(filePath, backupPath);
    }

    await this.logAction({
      type: 'write',
      path: filePath,
      backup: backupPath,
      timestamp: new Date()
    });

    return backupPath;
  }

  async beforeDelete(filePath: string): Promise<string> {
    const backupPath = this.generateBackupPath(filePath, 'delete');
    await fs.copy(filePath, backupPath);

    await this.logAction({
      type: 'delete',
      path: filePath,
      backup: backupPath,
      timestamp: new Date()
    });

    return backupPath;
  }

  async undo(actionId: string): Promise<void> {
    const action = await this.getAction(actionId);

    switch (action.type) {
      case 'write':
        if (action.backup) {
          // Restore original or delete new file
          await fs.copy(action.backup, action.path);
        } else {
          // File was created, delete it
          await fs.remove(action.path);
        }
        break;

      case 'delete':
        // Restore deleted file
        await fs.copy(action.backup, action.path);
        break;

      case 'edit':
        // Restore previous version
        await fs.copy(action.backup, action.path);
        break;
    }

    await this.markUndone(actionId);
  }

  async getRecentActions(limit = 50): Promise<Action[]> {
    return this.db.actions
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .toArray();
  }
}
```

### Sync with Your Platform

```typescript
// sync/platform-sync.ts

class PlatformSync {
  private apiUrl = 'https://personahub.ai/api';

  async syncPersonas(): Promise<void> {
    // 1. Fetch user's personas from your platform
    const response = await fetch(`${this.apiUrl}/personas`, {
      headers: { Authorization: `Bearer ${this.authToken}` }
    });
    const personas = await response.json();

    // 2. Update local OpenClaw config
    for (const persona of personas) {
      await this.updateLocalAgent(persona);
    }

    // 3. Sync knowledge base
    for (const persona of personas) {
      await this.syncKnowledgeBase(persona.id);
    }
  }

  private async updateLocalAgent(persona: Persona): Promise<void> {
    const agentId = `persona_${persona.id}`;
    const workspacePath = `~/.personahub/workspaces/${persona.id}`;

    // Write SOUL.md
    await fs.writeFile(
      `${workspacePath}/SOUL.md`,
      this.generateSoulMd(persona)
    );

    // Write security config
    await fs.writeFile(
      `${workspacePath}/SECURITY.json`,
      JSON.stringify({
        allowedTools: persona.enabledTools,
        allowedPaths: persona.allowedPaths,
        blockedPaths: DEFAULT_BLOCKED_PATHS,
        confirmationLevel: persona.confirmationLevel,
        dangerousToolsEnabled: persona.dangerousToolsEnabled
      })
    );

    // Update OpenClaw config
    await this.updateOpenClawConfig(agentId, workspacePath, persona);
  }

  private async syncKnowledgeBase(personaId: string): Promise<void> {
    // Fetch KB documents from platform
    const docs = await fetch(`${this.apiUrl}/knowledge-base?persona=${personaId}`, {
      headers: { Authorization: `Bearer ${this.authToken}` }
    }).then(r => r.json());

    const memoryPath = `~/.personahub/workspaces/${personaId}/memory`;

    // Write docs to memory folder
    for (const doc of docs) {
      await fs.writeFile(
        `${memoryPath}/${doc.id}.md`,
        `# ${doc.title}\n\n${doc.content}`
      );
    }

    // OpenClaw will auto-index these
  }
}
```

---

## Part 5: Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DATA FLOW                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  YOUR PLATFORM (Supabase)              USER'S MACHINE                   │
│  ═══════════════════════               ═══════════════                  │
│                                                                          │
│  ┌─────────────────────┐               ┌─────────────────────┐          │
│  │ personas table      │  ──sync──▶    │ ~/.personahub/      │          │
│  │ • name              │               │ ├── config.json     │          │
│  │ • system_prompt     │               │ └── workspaces/     │          │
│  │ • enabled_tools     │               │     └── {persona}/  │          │
│  │ • allowed_paths     │               │         ├── SOUL.md │          │
│  │ • confirmation_level│               │         └── SECURITY│          │
│  └─────────────────────┘               └─────────────────────┘          │
│                                                                          │
│  ┌─────────────────────┐               ┌─────────────────────┐          │
│  │ knowledge_base      │  ──sync──▶    │ workspaces/         │          │
│  │ • documents         │               │ └── {persona}/      │          │
│  │ • embeddings        │               │     └── memory/     │          │
│  └─────────────────────┘               │         ├── doc1.md │          │
│                                        │         └── doc2.md │          │
│                                        └─────────────────────┘          │
│                                                                          │
│  User's local files:                                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                  │   │
│  │  ~/Documents, ~/Desktop, etc.                                   │   │
│  │                                                                  │   │
│  │  Agent CAN access these (based on persona permissions)          │   │
│  │  Agent CANNOT access ~/.ssh, ~/.aws, etc.                       │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Activity & Backups (stored locally, never sent to cloud):             │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                  │   │
│  │  ~/.personahub/                                                 │   │
│  │  ├── history/           # Backups for undo                      │   │
│  │  ├── activity.log       # What agent did                        │   │
│  │  └── sessions/          # Chat history                          │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Core Desktop App (Week 1-2)
- [ ] Set up Electron project with React
- [ ] Embed OpenClaw gateway
- [ ] Implement auth flow (OAuth with your Supabase)
- [ ] Implement persona sync from platform
- [ ] Basic chat UI

### Phase 2: Security Layer (Week 2-3)
- [ ] Implement ActionGuard (permission checking)
- [ ] Implement blocked paths
- [ ] Implement confirmation dialogs
- [ ] Implement BackupManager (undo system)
- [ ] Activity logging

### Phase 3: Platform Integration (Week 3-4)
- [ ] Persona builder with permission config on web
- [ ] Knowledge base sync
- [ ] Real-time sync (when persona updated on web)

### Phase 4: Distribution (Week 4-5)
- [ ] macOS build & signing
- [ ] Windows build & signing
- [ ] Linux AppImage
- [ ] Auto-update system
- [ ] One-line installer script

### Phase 5: Polish (Week 5-6)
- [ ] Menu bar/system tray UI
- [ ] Keyboard shortcuts
- [ ] Notification system
- [ ] Multi-channel (Telegram, WhatsApp optional)

---

## Summary

| Feature | Implementation |
|---------|---------------|
| **Easy Install** | One-click installer, guided setup wizard |
| **Security** | Tool classification, path blocking, confirmations |
| **Undo** | Automatic backups, one-click rollback |
| **Sync** | Personas & KB sync from your web platform |
| **Local Access** | Full system access within configured limits |
| **No Damage** | Blocked sensitive paths, sandboxed code execution |

**The key insight**: Security is about **layers of defense**:
1. Tool-level permissions (what can it do?)
2. Path-level permissions (where can it access?)
3. Confirmation prompts (user approval for dangerous actions)
4. Undo system (recover from mistakes)
5. Blocked paths (hardcoded protection for sensitive files)

This gives users the power of local agents while protecting them from accidental damage.

**Ready to start building?**
