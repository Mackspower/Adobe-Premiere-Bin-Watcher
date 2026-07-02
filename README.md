# Bin Watcher for Premiere Pro

A free alternative to [Watchtower](https://knightsoftheeditingtable.com/) for the simple
case: tie a project bin to a folder on disk, and anything dropped into that folder gets
imported into the bin automatically.

Windows only for now (see "Expanding later" below).

## How it works

Premiere Pro no longer supports running standalone `.jsx` scripts from a menu (that's an
After Effects thing), so this is built as a small **CEP panel** — the same extension
framework Watchtower itself uses:

- `client/` — the panel UI (HTML/CSS/JS), running with Node.js enabled so it can poll
  folders directly with `fs.readdir`/`fs.stat`.
- `host/ppro.jsx` — ExtendScript that runs inside Premiere and does the actual
  `app.project.importFiles(...)` call into the target bin (creating the bin if it
  doesn't exist yet).
- `CSXS/manifest.xml` — the extension manifest that registers the panel with Premiere.

Every few seconds (configurable) the panel lists each watched folder, and imports any
file whose size has stayed the same across two checks in a row (so it doesn't try to
import a file that's still being copied in). Before importing, it checks the bin's
existing contents by name, so it's safe to restart Premiere or the panel without
duplicate imports.

## Install (Windows)

1. Download/clone this repo somewhere on your machine.
2. Open PowerShell in that folder and run:
   ```powershell
   .\install-windows.ps1
   ```
   This copies `PremiereBinWatcher/` into
   `%APPDATA%\Adobe\CEP\extensions\PremiereBinWatcher` and enables Premiere's
   "load unsigned extensions" debug flag (a per-user registry setting — no admin
   rights needed, and easy to undo by deleting the `PlayerDebugMode` values under
   `HKCU:\Software\Adobe\CSXS.*`).
3. Restart Premiere Pro.
4. Open the panel from **Window > Extensions > Bin Watcher**.

## Use

1. Click **Browse folder…** and pick the folder you want watched.
2. Type a bin name (it'll be created at the top level of your project if it doesn't
   already exist).
3. Click **+ Add Watch**.
4. Drop files into that folder — they'll show up in the bin within a few seconds.

Watches are saved to `%APPDATA%\PremiereBinWatcher\config.json` and reload automatically
next time you open the panel/project. You can pause/resume or remove a watch from the
panel, adjust the check interval, and edit the list of file extensions it imports
(defaults to common video/audio/image types; use `*` to import everything).

## Limitations (v1)

- Only top-level bins by name — no nested bin paths yet.
- No recursive subfolder support (a subfolder inside a watched folder is ignored).
- No image-sequence handling.
- Windows only — Premiere's CEP extensions folder and debug-mode registry keys are
  Windows-specific in this installer.

## Expanding later

- **macOS**: the panel code itself is cross-platform; only `install-windows.ps1` would
  need a macOS equivalent (copying to `~/Library/Application Support/Adobe/CEP/extensions`
  and setting the debug flag via `defaults write`).
- **Nested bins**: `host/ppro.jsx`'s `pbw_findOrCreateBin` currently only looks at
  top-level bins; it could walk a `/`-delimited bin path instead.
- **Recursive folders / image sequences**: extend the polling logic in `client/app.js`.

Note: Premiere Pro's extensibility is gradually moving from CEP to Adobe's newer UXP
framework (Adobe has said CEP/ExtendScript integrations remain supported into 2026).
This panel is built on CEP because it's what today's released Premiere versions support;
a future UXP port may be needed down the line.
