# PersonaHub

Build, talk to, and run AI personas — on the web or as a desktop app.

PersonaHub is two products in one repo:

- **Web app** (live at [magic-bots.netlify.app](https://magic-bots.netlify.app)) — Create AI personas backed by Google Gemini + Flowise. Each persona gets its own chatflow with web-search and conversation memory.
- **Desktop app** (PersonaHub Desktop) — A standalone Electron app where each persona has an AI-generated personality, a 2D animated face, voice input/output, and runs locally through the OpenClaw gateway.

## Download — Desktop App

Get the latest installer from **[GitHub Releases](https://github.com/LashaKh/Flowise-Agent-Creator/releases/latest)**:

| Platform | Installer |
|---|---|
| **macOS** (Apple Silicon — M1/M2/M3) | `PersonaHub-Desktop-X.Y.Z-arm64.dmg` |
| **macOS** (Intel) | `PersonaHub-Desktop-X.Y.Z-x64.dmg` |
| **Windows** (10/11, 64-bit) | `PersonaHub-Desktop-Setup-X.Y.Z.exe` |
| **Linux** (Ubuntu 20.04+, Fedora 36+) | `PersonaHub-Desktop-X.Y.Z.AppImage` |

### First-time install — macOS

The app isn't yet notarized with an Apple Developer ID, so macOS Gatekeeper will show **"PersonaHub Desktop is damaged and can't be opened"** on first launch. To bypass this once after installing, open **Terminal** and run:

```bash
xattr -cr /Applications/PersonaHub\ Desktop.app
```

This removes the download-quarantine flag. You only need to do it once.

### First-time install — Windows

The installer isn't yet code-signed, so Windows SmartScreen will show **"Windows protected your PC"**. Click **More info** → **Run anyway** to install. One-time only.

### What you'll need

- **An API key** for either [Google Gemini](https://aistudio.google.com/app/apikey) (free tier, recommended) or [Anthropic Claude](https://console.anthropic.com/settings/keys). The app will validate the key in its first-run wizard.
- That's it. Node, OpenClaw, and other dependencies are bundled into the installer — no separate downloads.

### Storage locations

Your data lives at:

- **macOS:** `~/Library/Application Support/personahub-desktop/` and `~/.openclaw/`
- **Windows:** `%APPDATA%\personahub-desktop\` and `%USERPROFILE%\.openclaw\`

## Development

See [CLAUDE.md](./CLAUDE.md) for project architecture, environment setup, and development workflow.

```bash
# Web app
pnpm install && pnpm dev

# Desktop app
cd personahub-desktop && pnpm install && pnpm dev
```

## Releases

The desktop app is built and published automatically by GitHub Actions when a `desktop-v*` tag is pushed. The current release line is the `1-ai-persona-builder` branch.

## License

Source available — see repository for details.
