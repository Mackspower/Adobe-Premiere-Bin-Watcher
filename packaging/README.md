# Signed package builds

The regular install (`install-windows.ps1` / `install-mac.sh`) works by enabling
Premiere's "load unsigned extensions" debug flag. That flag isn't scoped to just Bin
Watcher — it tells Premiere to trust *any* unsigned CEP extension on that machine,
which is a reasonable trade-off on your own computer but a harder sell on a managed
work machine. This folder builds a **signed** `.zxp` instead, so Premiere can load Bin
Watcher without that flag turned on at all.

See the root [SECURITY.md](../SECURITY.md) for a plain-language summary of what Bin
Watcher does and doesn't do — useful to hand to IT alongside this.

## 1. Get ZXPSignCmd

Download the build for your OS from Adobe's official repo:
https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD

Put it on your PATH, or save it as `packaging/tools/ZXPSignCmd` (macOS/Linux —
`chmod +x` it) or `packaging/tools/ZXPSignCmd.exe` (Windows).

## 2. Build the signed package

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

## 3. Trust the certificate (once per machine)

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

## 4. Install the .zxp

Use a free installer such as [ZXPInstaller](https://github.com/aleen42/ZXPInstaller)
or Anastasiy's Extension Manager — either handles placing a signed extension in the
right CEP folder for you. Point it at `packaging/dist/BinWatcher.zxp`.

## 5. Turn debug mode back off

Once installed this way, you can turn Premiere's `PlayerDebugMode` back off (delete
the registry values / `defaults delete` entries the regular installer set — see the
root README). Bin Watcher keeps loading because it's now validly signed and trusted,
and you've closed the "any unsigned extension can load" hole that flag opened.
