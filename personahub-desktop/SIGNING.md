# Code Signing — PersonaHub Desktop

This document explains what to set up after purchasing Apple Developer ID and/or a Windows code-signing certificate. **Until these are configured, builds ship unsigned** and users will see Gatekeeper / SmartScreen warnings on first install (the README documents the workaround).

The repo's `electron-builder.config.js` and `.github/workflows/build-desktop.yml` are already plumbed to use the secrets below — there's no code change needed. Just add the secrets and the next CI run will produce signed builds.

---

## macOS — Apple Developer ID + Notarization

### One-time setup (you do this once)

1. **Enroll in the Apple Developer Program** at https://developer.apple.com — $99/year. Personal account is fine. Approval takes 24-48 hours.
2. After approval, open **Xcode → Settings → Accounts → Manage Certificates → "+" → "Developer ID Application"**. This generates the cert and adds it to your Keychain.
3. Export it as a `.p12`:
   - Open **Keychain Access**, find "Developer ID Application: <your name>".
   - Right-click → **Export "Developer ID Application…"** → save as `Cert.p12` with a strong password. Remember the password.
4. Create an **app-specific password** at https://appleid.apple.com → Sign-In and Security → App-Specific Passwords. Label it "PersonaHub CI".
5. Find your **Team ID** at https://developer.apple.com/account → Membership → Team ID.

### GitHub Actions secrets (one-time)

Go to **Settings → Secrets and variables → Actions** in the repo. Add:

| Secret | Value |
|---|---|
| `CSC_LINK` | base64 of the .p12: `base64 -i Cert.p12 \| pbcopy`, then paste |
| `CSC_KEY_PASSWORD` | the .p12 password from step 3 |
| `APPLE_ID` | your Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | the app-specific password from step 4 |
| `APPLE_TEAM_ID` | the Team ID from step 5 |

### Workflow change required

After adding the secrets, update `.github/workflows/build-desktop.yml`:

1. **Remove** `CSC_IDENTITY_AUTO_DISCOVERY: 'false'` from the macOS env blocks (electron-builder will now auto-discover the imported cert).
2. **Pass the secrets through:**
   ```yaml
   env:
     GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
     CSC_LINK: ${{ secrets.CSC_LINK }}
     CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
     APPLE_ID: ${{ secrets.APPLE_ID }}
     APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
     APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
   ```
3. **Delete** the "Ad-hoc sign macOS apps" and "Repackage and publish macOS DMGs" steps — once notarization is on, electron-builder handles the full sign + notarize + DMG flow in one shot via `--publish always`. Replace with:
   ```yaml
   - name: Build, sign, notarize & publish (macOS)
     if: matrix.platform == 'mac'
     working-directory: personahub-desktop
     run: |
       pnpm exec tsc -b
       pnpm exec vite build
       pnpm exec electron-builder --mac --config electron-builder.config.js --publish always
   ```

### Verification

After CI runs, download the signed `.dmg` and run:

```bash
spctl --assess --verbose /Applications/PersonaHub\ Desktop.app
```

It should report `accepted source=Notarized Developer ID`. Test on a clean Mac (no developer tools) — double-click the .dmg, drag to Applications, double-click the app. It should open with no warning.

Once verified, **remove the `xattr -cr` block from `src/components/DownloadApp.tsx:165-185`** — Mac users no longer need it.

---

## Windows — Code Signing Certificate

### Choosing a cert

| Type | Cost | SmartScreen reputation | Delivery |
|---|---|---|---|
| **Standard OV** (Sectigo / DigiCert / SSL.com) | $300-500/yr | Builds over weeks of installs | 3-7 days |
| **EV (Extended Validation)** | $600-1000/yr | Instant — no SmartScreen warning ever | 5-14 days (USB token mailed) |

For a small product, OV is usually the right call: reputation builds within a few weeks of testing, and the savings are significant. EV is worth it if you expect many users in the first month.

### One-time setup

After cert delivery you'll have a `.pfx` file (or, for EV, the cert is on a USB token; you'll need to follow the issuer's HSM / Azure Key Vault instructions instead).

For OV / standard PFX:

1. Export the cert as a `.pfx` if not already.
2. Add GitHub Actions secrets:

   | Secret | Value |
   |---|---|
   | `WIN_CSC_LINK` | base64 of the .pfx: `base64 -i cert.pfx` |
   | `WIN_CSC_KEY_PASSWORD` | the .pfx password |

3. **Workflow change**: in `.github/workflows/build-desktop.yml`, the Windows build step needs the secrets in env:
   ```yaml
   env:
     GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
     CSC_IDENTITY_AUTO_DISCOVERY: 'false'
     WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
     WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
   ```

The `electron-builder.config.js` `win.signtoolOptions` block is already in place; electron-builder picks up the env vars automatically.

### Verification

Right-click the installer `.exe` → **Properties → Digital Signatures**. There should be a valid signature with the publisher name. SmartScreen will still warn for the first ~few hundred installs (OV cert), then fade. With EV, the warning never appears.

Once verified, **remove the SmartScreen note from `src/components/DownloadApp.tsx`** in the Windows install block.

---

## Troubleshooting

- **"electron-notarize / notarize-cli ENOENT"**: `pnpm install` in `personahub-desktop/` should pull the right deps; if missing, `pnpm add -D @electron/notarize`.
- **Notarization hangs >10min**: Apple's notary service is slow at peak times. If it times out, re-run the workflow.
- **`identity not found` on Mac**: the `.p12` import failed. Double-check `CSC_LINK` is the full base64 (no line breaks) and `CSC_KEY_PASSWORD` matches.
- **Windows: "Error: Code signing certificate not found"**: `WIN_CSC_LINK` may be malformed. Decode locally to verify: `base64 -d <<< "$WIN_CSC_LINK" > /tmp/test.pfx && file /tmp/test.pfx`.

---

## When to revisit

- The app reaches ~100 active users — invest in EV cert if not already (Windows reputation matters more at scale).
- Apple changes notarization requirements (rare but happens) — check `electron-builder` release notes.
- Cert is approaching expiry — renew at least 30 days before; upload new `.p12` / `.pfx` as new secret values, no other workflow changes needed.
