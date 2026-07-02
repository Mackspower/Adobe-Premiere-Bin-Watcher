# Packaging options

This folder has three independent ways to package Bin Watcher, each solving a
different problem. Mixing them up is a common source of confusion, so here's the
distinction up front:

- **`build-dmg.sh`** — wraps the existing debug-mode install (`install-mac.sh`) into a
  `.dmg` for macOS. Purely a convenience/distribution format; doesn't change trust at
  all — the debug flag still gets enabled, Gatekeeper still warns on first open. Built
  automatically on every GitHub Release (see
  [../.github/workflows/build-windows-installer.yml](../.github/workflows/build-windows-installer.yml),
  which despite the name builds both platforms) — you don't need to run this yourself
  unless you want a local test build.
- **`windows-installer/BinWatcher.iss`** — same idea for Windows: a normal installer
  wizard (`Setup.exe`) instead of running a PowerShell script, built with the free
  [Inno Setup](https://jrsoftware.org/isinfo.php) compiler. Also still unsigned, so
  SmartScreen still warns on first run. Also built automatically on every Release, same
  as the `.dmg`.
- **The signed `.zxp` build below** — the one option that actually changes the trust
  story: it avoids Premiere's debug flag entirely, at the cost of a manual
  "trust this certificate" step per machine (see step 3 below). Not automated — the
  private signing certificate can't live in CI/the repo, so this one stays a manual,
  local-only build.

See the root [SECURITY.md](../SECURITY.md) for a plain-language summary of what Bin
Watcher does and doesn't do — useful to hand to IT regardless of which packaging
option you use.

## Signed .zxp: 1. Get ZXPSignCmd

Download the build for your OS from Adobe's official repo:
https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD

Put it on your PATH, or save it as `packaging/tools/ZXPSignCmd` (macOS/Linux —
`chmod +x` it) or `packaging/tools/ZXPSignCmd.exe` (Windows).

## Signed .zxp: 2. Build the signed package

```bash
# macOS/Linux
bash packaging/build-zxp.sh
```

```powershell
# Windows
.\packaging\build-zxp.ps1
```

First run creates a self-signed certificate at `packaging/cert/BinWatcher.p12` and
asks you to set a password for it — remember this password, you'll need it for every
future build and for the trust step below. **Never commit `packaging/cert/` to git**
(it's already gitignored) — it's your private signing key, and anyone who has it could
sign something and have it pass as "trusted" on a machine that trusts your cert.

This produces `packaging/dist/BinWatcher.zxp`.

## Signed .zxp: 3. Trust the certificate (once per machine)

A self-signed certificate isn't automatically trusted by the OS, so without this step
Premiere will still refuse to load the signed package.

**macOS**: export the certificate —
```bash
openssl pkcs12 -in packaging/cert/BinWatcher.p12 -out BinWatcher.crt -clcerts -nokeys
```
(enter the certificate password when asked), then double-click `BinWatcher.crt` to
open it in Keychain Access, and set "When using this certificate" to **Always
Trust**. This prompts for your admin password.

**Windows**: export the certificate the same way (or use the `.p12` directly with
`certutil`), then add it to Trusted Root Certification Authorities:
```
certutil -addstore Root BinWatcher.crt
```
Adding to the machine-wide store requires an admin prompt. Adding instead to the
Current User store usually doesn't need admin — unless your organization's policy
blocks users from modifying even their own trusted-root store, which some do.

## Signed .zxp: 4. Install the .zxp

Use a free installer such as [ZXPInstaller](https://github.com/aleen42/ZXPInstaller)
or Anastasiy's Extension Manager — either handles placing a signed extension in the
right CEP folder for you. Point it at `packaging/dist/BinWatcher.zxp`.

## Signed .zxp: 5. Turn debug mode back off

Once installed this way, you can turn Premiere's `PlayerDebugMode` back off (delete
the registry values / `defaults delete` entries the regular installer set — see the
root README). Bin Watcher keeps loading because it's now validly signed and trusted,
and you've closed the "any unsigned extension can load" hole that flag opened.
