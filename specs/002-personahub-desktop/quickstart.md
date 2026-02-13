# Quickstart: PersonaHub Desktop Development

## Prerequisites

- Node.js 22+
- pnpm (package manager)
- Docker Desktop (for sandbox mode testing)
- Existing PersonaHub web platform account with at least one persona

## Project Setup

```bash
# Clone and enter the desktop app directory
cd personahub-desktop

# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env

# Fill in your Supabase and Flowise credentials in .env
```

## Environment Variables

```bash
# Supabase (same as web platform)
SUPABASE_URL=https://wlvfilxtvqjzwqjhfcdk.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>

# Flowise
FLOWISE_API_URL=https://flowise-2-0.onrender.com
FLOWISE_API_KEY=<your-flowise-api-key>

# Desktop app
CUSTOM_PROTOCOL=personahub
```

## Development

```bash
# Run in development mode (hot reload)
pnpm dev

# Run Electron in dev mode
pnpm electron:dev

# Build for current platform
pnpm build

# Build for all platforms
pnpm build:all
```

## Project Structure

```
personahub-desktop/
├── electron/
│   ├── main.ts              # Electron main process
│   ├── preload.ts           # Security bridge (IPC)
│   ├── tray.ts              # System tray / menu bar
│   └── updater.ts           # Auto-update logic
├── src/                     # React frontend (shared with web where possible)
│   ├── components/
│   │   ├── Chat.tsx         # Tab-based chat interface
│   │   ├── ActivityLog.tsx  # Action history + undo
│   │   ├── Settings.tsx     # App preferences
│   │   ├── SetupWizard.tsx  # First-run onboarding
│   │   └── ConfirmDialog.tsx# Security confirmation
│   └── hooks/
│       ├── usePersonas.ts   # Persona sync
│       ├── useOpenClaw.ts   # Agent framework bridge
│       └── useBackup.ts     # Undo system
├── security/
│   ├── action-guard.ts      # Tool permission checker
│   ├── path-validator.ts    # Path restriction enforcer
│   ├── backup-manager.ts    # File backup/restore
│   └── blocked-paths.ts     # Hardcoded blocked paths
├── sync/
│   └── platform-sync.ts     # Web platform polling + sync
├── db/
│   └── local-db.ts          # SQLite database layer
└── openclaw/
    └── config/              # OpenClaw agent configs per persona
```

## Key Workflows

### 1. First Run
SetupWizard → OAuth browser flow → Persona sync → Permission grants → Ready

### 2. Chat with Persona
User types message → OpenClaw processes → Tool calls go through ActionGuard → Confirmation if needed → Execute → Log + Backup → Stream response

### 3. Undo a Change
Activity Log → Select entry → Click Undo → BackupManager restores file → Mark as undone
